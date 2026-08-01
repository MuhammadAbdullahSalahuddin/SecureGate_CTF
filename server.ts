import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server, Socket } from "socket.io";
import { redis } from "./lib/redis";
import { tunnelService } from "./lib/vault/tunnel.service";
import {
  bufferAuditEvent,
  flushNow,
  cleanupSession,
} from "./lib/audit.service";
import { EventType } from "./lib/shared/types/index";
import { pool } from "./lib/db";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0"; // bind to all interfaces so Laptop 3 can reach us
const port = 3000;

const app = next({ dev, hostname, port, customServer: true });
const handle = app.getRequestHandler();

// ─── TTL Poller ───────────────────────────────────────────────────────────────
// Each active session gets a 30-second interval that checks if its Redis key exists.
// If the key is gone (TTL expired or admin deleted it), we terminate the session.
// This is how admin revocation works — the admin deletes the key, we detect it within 30s.
const ttlPollers = new Map<string, ReturnType<typeof setInterval>>();

function startTtlPoller(
  sessionId: string,
  socket: Socket,
  userId: string,
  assetId: string,
) {
  const poller = setInterval(async () => {
    const ttl = await redis.ttl(`session:${sessionId}`);

    // ttl = -2 means the key does not exist (expired or deleted)
    if (ttl === -2) {
      console.log(`[Gateway] Session ${sessionId} expired — terminating`);

      clearInterval(poller);
      ttlPollers.delete(sessionId);

      // Close the SSH tunnel
      tunnelService.closeTunnel(sessionId);

      // Log session end to audit buffer, then flush immediately
      bufferAuditEvent({
        sessionId,
        userId,
        assetId,
        type: EventType.SESSION_END,
      });
      await flushNow();
      cleanupSession(sessionId);

      // Tell the browser the session is over — it will show a red message + redirect
      socket.emit("session:expired");
      socket.disconnect(true);
    }
  }, 30_000); // 30 seconds

  ttlPollers.set(sessionId, poller);
}

// ─── WebSocket connection handler ─────────────────────────────────────────────
async function handleConnection(socket: Socket) {
  // 1. Extract the one-time ticket from the WebSocket handshake query params
  //    The frontend navigates to /terminal?ticket=xxx, and socket.io passes
  //    query params through the handshake automatically.
  const ticket = socket.handshake.query.ticket as string;
  const cols = parseInt(socket.handshake.query.cols as string) || 80;
  const rows = parseInt(socket.handshake.query.rows as string) || 24;

  if (!ticket) {
    console.warn("[Gateway] Connection attempted with no ticket");
    socket.disconnect(true);
    return;
  }

  // 2. GETDEL — atomically read AND delete the ticket in one Redis operation.
  //    If two connections arrive with the same ticket simultaneously,
  //    only one will get the value. The other gets null. No race condition.
  const ticketValue = await redis.getdel(`ticket:${ticket}`);

  if (!ticketValue) {
    // Ticket is expired, already used, or was never valid
    console.warn(`[Gateway] Invalid or expired ticket: ${ticket}`);
    socket.emit("error", { code: 4401, message: "Invalid or expired ticket" });
    socket.disconnect(true);
    return;
  }

  // ticketValue format: "userId:assetId" (set by /api/sessions/request)
  const [userId, assetId] = ticketValue.split(":");
  // Generate a unique session ID for this terminal session
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  console.log(
    `[Gateway] Session ${sessionId} — user ${userId} → asset ${assetId}`,
  );
  const MAX_CONCURRENT_TUNNELS = 8;
  if (tunnelService.activeCount() >= MAX_CONCURRENT_TUNNELS) {
    console.warn(`[Gateway] At capacity (${MAX_CONCURRENT_TUNNELS}) — rejecting ${sessionId}`);
    socket.emit("error", { code: 5003, message: "Server at capacity, please retry shortly" });
    socket.disconnect(true);
    return;
  }
  try {
    // 3. Look up how long this session is allowed to last
    //    We need this to set the Redis session TTL
    const policyResult = await pool.query(
      `SELECT ap.max_session_seconds
       FROM access_policies ap
       INNER JOIN target_assets ta ON ta.id = ap.asset_id
       INNER JOIN user_roles ur ON ur.role_id = ap.role_id
       WHERE ur.user_id = $1 AND ap.asset_id = $2`,
      [userId, assetId],
    );

    const maxSeconds = policyResult.rows[0]?.max_session_seconds ?? 1800; // default 30 min

    // 4. Open the SSH tunnel — this is Member 3's code in /lib/vault/tunnel.service.ts
    //    It decrypts credentials, connects to Laptop 1, and opens a PTY shell.
    await tunnelService.openTunnel(sessionId, assetId as any, cols, rows);

    // 5. Register the data callback — whenever SSH sends output (stdout/stderr),
    //    this fires. We do two things: send to browser AND buffer to MongoDB.
    tunnelService.onData(sessionId, (data: string) => {
      // Send output to the browser's xterm.js — this is the fast path
      socket.emit("terminal:data", data);

      // Asynchronously log to MongoDB — never blocks the above emit
      setImmediate(() => {
        bufferAuditEvent({
          sessionId,
          userId,
          assetId,
          type: EventType.STDOUT,
          data,
        });
      });
    });

    // 6. Store session key in Redis with TTL
    //    The TTL poller checks this key every 30 seconds.
    //    Admin can revoke the session by deleting this key.
    await redis.setex(
      `session:${sessionId}`,
      maxSeconds,
      `${userId}:${assetId}`,
    );

    // 7. Log session start to audit buffer
    bufferAuditEvent({
      sessionId,
      userId,
      assetId,
      type: EventType.SESSION_START,
    });

    // 8. Start the TTL poller — enforces time limit and admin revocation
    startTtlPoller(sessionId, socket, userId, assetId);

    // 9. Tell the browser the session is ready, include sessionId and TTL info
    socket.emit("session:ready", {
      sessionId,
      maxSeconds,
      expiresAt: new Date(Date.now() + maxSeconds * 1000).toISOString(),
    });

    console.log(`[Gateway] Session ${sessionId} live — TTL: ${maxSeconds}s`);
  } catch (err) {
    console.error(
      `[Gateway] Failed to open tunnel for session ${sessionId}:`,
      err,
    );
    socket.emit("error", {
      code: 5000,
      message: "Failed to open terminal session",
    });
    socket.disconnect(true);
    return;
  }

  // ─── Event handlers for an established session ─────────────────────────────

  // Keystroke from browser → SSH stream
  socket.on("terminal:data", (data: string) => {
    // Fast path: write to SSH immediately
    tunnelService.write(sessionId, data);

    // Async: log keystroke to audit buffer (fire-and-forget)
    setImmediate(() => {
      bufferAuditEvent({
        sessionId,
        userId,
        assetId,
        type: EventType.STDIN,
        data,
      });
    });
  });

  // Terminal resize from browser → SSH PTY
  // Without this, htop/vim/nano render at the wrong size
  socket.on(
    "terminal:resize",
    ({ cols, rows }: { cols: number; rows: number }) => {
      tunnelService.resize(sessionId, cols, rows);

      setImmediate(() => {
        bufferAuditEvent({
          sessionId,
          userId,
          assetId,
          type: EventType.RESIZE,
          cols,
          rows,
        });
      });
    },
  );

  // Browser disconnected (tab closed, navigated away, network drop)
  socket.on("disconnect", async () => {
    console.log(`[Gateway] Client disconnected — session ${sessionId}`);

    // Stop the TTL poller to prevent it running after the session is gone
    const poller = ttlPollers.get(sessionId);
    if (poller) {
      clearInterval(poller);
      ttlPollers.delete(sessionId);
    }

    // Close the SSH tunnel — this also cleans up the Map entry in tunnel.service.ts
    tunnelService.closeTunnel(sessionId);

    // Delete the Redis session key (so replay/admin sees it as ended)
    await redis.del(`session:${sessionId}`);

    // Log session end and flush immediately — we're shutting down, don't wait for the timer
    bufferAuditEvent({
      sessionId,
      userId,
      assetId,
      type: EventType.SESSION_END,
    });
    await flushNow();
    cleanupSession(sessionId);
  });
}

// ─── Server bootstrap ─────────────────────────────────────────────────────────
const startServer = async () => {
  await app.prepare();
  console.log("[Next.js] App is ready");

  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (error) {
      console.error("Error handling request:", req.url, error);
      res.statusCode = 500;
      res.end("Internal server error");
    }
  });

  // Attach socket.io to the same HTTP server as Next.js
  // Everything runs on port 3000 — from the outside it looks like one server
  const io = new Server(httpServer, {
    path: "/api/socket",
    cors: {
      origin: "*", // tighten in production
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    // Delegate to our handler — keeps this file readable
    handleConnection(socket).catch((err) => {
      console.error("[Gateway] Unhandled error in handleConnection:", err);
      socket.disconnect(true);
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> WebSocket gateway ready on /api/socket`);
    });
};

startServer();
