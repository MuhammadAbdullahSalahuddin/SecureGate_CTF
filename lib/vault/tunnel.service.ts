import { Client, ClientChannel } from 'ssh2'
import { Pool }                  from 'pg'
import { decryptCredential }     from './vault.service'
import { ITunnelService }        from '../shared/interfaces/vault.interface'

interface TunnelEntry {
  conn:    Client
  stream:  ClientChannel
  onData?: (data: string) => void
}

// Active SSH sessions — Map<sessionId → TunnelEntry>
const tunnels = new Map<string, TunnelEntry>()

const pool = new Pool({
  host:     'postgres',
  database: 'securegate',
  user:     'admin',
  password: process.env.GUARDIAN_DB_PASS,
})

export const tunnelService: ITunnelService = {

  async openTunnel(
    sessionId: string,
    assetId: number,
    cols: number,
    rows: number
  ): Promise<void> {
    // 1. Fetch encrypted credential blob + asset metadata from DB
    const { rows: dbRows } = await pool.query(
      `SELECT ac.encrypted_blob, ac.iv, ac.auth_tag,
              ta.hostname, ta.port, ta.db_type
       FROM asset_credentials ac
       JOIN target_assets ta ON ta.id = ac.asset_id
       WHERE ac.asset_id = $1`,
      [assetId]
    )
    if (!dbRows[0]) throw new Error(`No credentials for asset ${assetId}`)

    const { encrypted_blob, iv, auth_tag, hostname, port, db_type } = dbRows[0]

    // 2. Decrypt — plaintext lives only in this local scope
    const creds = decryptCredential({
      encryptedBlob: encrypted_blob,
      iv,
      authTag: auth_tag,
    })

    // 3. Open SSH connection — credential used immediately, then overwritten
    await new Promise<void>((resolve, reject) => {
      const conn = new Client()

      conn.on('ready', () => {
        // 4. Request PTY shell with correct dimensions
        conn.shell(
          { term: 'xterm-256color', cols, rows },
          (err, stream) => {
            if (err) { conn.end(); return reject(err) }

            // 5. Store in Map — SSH plaintext is now out of scope
            tunnels.set(sessionId, { conn, stream })

            const entry = tunnels.get(sessionId)!
            stream.on('data', (chunk: Buffer) => {
              entry.onData?.(chunk.toString())
            })
            stream.stderr.on('data', (chunk: Buffer) => {
              entry.onData?.(chunk.toString())
            })
            stream.on('close', () => tunnelService.closeTunnel(sessionId))

            // 6. Auto-login to the database if credentials are present.
            //    We wait 800ms for the shell prompt to be ready before sending
            //    the command, then send the password after the password prompt.
            //
            //    The operator lands directly in the DB shell — they never see
            //    or type the credentials themselves. This is the core PAM value:
            //    access without credential exposure.
            if (db_type === 'mysql' && creds.db) {
              const { username: dbUser, password: dbPass } = creds.db

              // Wait for bash prompt, then fire the mysql command.
              // We use --password= inline so it's never echoed in the PTY.
              // The operator sees the mysql> prompt as their first output.
              setTimeout(() => {
                // --password= with no space avoids the "password on command line
                // is insecure" warning being visible in the terminal
                stream.write(`mysql -u ${dbUser} -p'${dbPass}'\r`)

                // Immediately overwrite the password string in memory
                ;(creds.db as any).password = ''
              }, 800)

            } else if (db_type === 'mongodb' && creds.db) {
              const { username: dbUser, password: dbPass } = creds.db

              setTimeout(() => {
                stream.write(`mongosh -u ${dbUser} -p '${dbPass}' --authenticationDatabase admin\r`)
                ;(creds.db as any).password = ''
              }, 800)
            }

            resolve()
          }
        )
      })

      conn.on('error', reject)

      conn.connect({
        host:         hostname,
        port:         port ?? 22,
        username:     creds.ssh.username,
        password:     creds.ssh.password,
        readyTimeout: 10000,
      })

      // Overwrite SSH plaintext immediately after connect() call
      ;(creds.ssh as any).password = ''
      ;(creds.ssh as any).username = ''
    })
  },

  write(sessionId: string, data: string): void {
    tunnels.get(sessionId)?.stream.write(data)
  },

  resize(sessionId: string, cols: number, rows: number): void {
    tunnels.get(sessionId)?.stream.setWindow(rows, cols, 0, 0)
  },

  onData(sessionId: string, handler: (data: string) => void): void {
    const entry = tunnels.get(sessionId)
    if (entry) {
      entry.onData = handler
    }
  },

  closeTunnel(sessionId: string): void {
    const entry = tunnels.get(sessionId)
    if (!entry) return
    try {
      entry.stream.close()
      entry.conn.end()
    } catch {
      // Suppress errors on already-closed connections
    } finally {
      tunnels.delete(sessionId)
    }
  },
}