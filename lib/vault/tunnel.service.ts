import { Client, ClientChannel } from 'ssh2'
import { Pool }                  from 'pg'
import { decryptCredential }     from './vault.service'
import { ITunnelService }        from '../shared/interfaces/vault.interface'

interface TunnelEntry {
  conn:    Client
  stream:  ClientChannel
  onData?: (data: string) => void
  ready:   boolean
  buffer:  string[]
  commandSent: boolean
}

const tunnels = new Map<string, TunnelEntry>()

const pool = new Pool({
  host:     'postgres',
  database: 'securegate',
  user:     'admin',
  password: process.env.GUARDIAN_DB_PASS,
})

const DB_READY_PATTERNS: Record<string, RegExp> = {
  mysql:   /mysql>\s*$/m,
  mongodb: />\s*$/m,
}

const CLEAR_SCREEN = '\x1b[2J\x1b[H'

export const tunnelService: ITunnelService = {

  async openTunnel(
    sessionId: string,
    assetId: number,
    cols: number,
    rows: number
  ): Promise<void> {
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

    const creds = decryptCredential({
      encryptedBlob: encrypted_blob,
      iv,
      authTag: auth_tag,
    })

    const readyPattern = DB_READY_PATTERNS[db_type] ?? null

    // Build connect config — prefer privateKey over password
    const connectConfig: any = {
      host:         hostname,
      port:         port ?? 22,
      username:     creds.ssh.username,
      readyTimeout: 10000,
    }
    if (creds.ssh.privateKey) {
      connectConfig.privateKey = creds.ssh.privateKey
    } else {
      connectConfig.password = creds.ssh.password
    }

    await new Promise<void>((resolve, reject) => {
      const conn = new Client()

      conn.on('ready', () => {
        conn.shell(
          { term: 'xterm-256color', cols, rows },
          (err, stream) => {
            if (err) { conn.end(); return reject(err) }

            const entry: TunnelEntry = {
              conn,
              stream,
              ready:       false,
              buffer:      [],
              commandSent: false,
            }
            tunnels.set(sessionId, entry)

            const handleChunk = (chunk: Buffer) => {
              const text = chunk.toString()
	      console.log(`[tunnel][${sessionId}] ready=${entry.ready} chunk:`, JSON.stringify(text))  // ← ADD THIS
              if (entry.ready) {
                entry.onData?.(text)
                return
              }

              entry.buffer.push(text)
              const accumulated = entry.buffer.join('')

              // Success — DB prompt detected
              if (readyPattern && readyPattern.test(accumulated)) {
                entry.ready  = true
                entry.buffer = []
                setTimeout(() => {
                  entry.onData?.(CLEAR_SCREEN + `mysql> `)
                }, 50)
                return
              }

              // Fallback — bash prompt returned after command = DB login failed
              if (entry.commandSent && /\$\s*$/.test(accumulated)) {
                entry.ready  = true
                entry.buffer = []
                setTimeout(() => {
                  entry.onData?.(
                    CLEAR_SCREEN +
                    '\x1b[31m[SecureGate] Database login failed — check credentials.\x1b[0m\r\n'
                  )
                }, 50)
              }
            }

            stream.on('data',        handleChunk)
            stream.stderr.on('data', handleChunk)
            stream.on('close',       () => tunnelService.closeTunnel(sessionId))

            setTimeout(() => {
  		if (db_type === 'mysql' && creds.db) {
    			const { username: dbUser, password: dbPass } = creds.db
    			const cmd = `mysql -u ${dbUser} -p'${dbPass}'\r`
    			console.log(`[tunnel] sending command:`, JSON.stringify(cmd))
    			stream.write(cmd)
    			entry.commandSent = true
    			;(creds.db as any).password = ''
  		} else if (db_type === 'mongodb' && creds.db) {
    			const { username: dbUser, password: dbPass } = creds.db
    			stream.write(`stty -echo; mongosh -u ${dbUser} -p '${dbPass}' --authenticationDatabase admin; stty echo\r`)
    			entry.commandSent = true
    			;(creds.db as any).password = ''
  		} else {
    			entry.ready  = true
    			entry.buffer = []
  }
  			connectConfig.privateKey = ''
		}, 800)
            resolve()
          }
        )
      })

      conn.on('error', reject)
      conn.connect(connectConfig)
    })
  },

  write(sessionId: string, data: string): void {
    const entry = tunnels.get(sessionId)
    if (entry?.ready) {
      entry.stream.write(data)
    }
  },

  resize(sessionId: string, cols: number, rows: number): void {
    tunnels.get(sessionId)?.stream.setWindow(rows, cols, 0, 0)
  },

  onData(sessionId: string, handler: (data: string) => void): void {
    const entry = tunnels.get(sessionId)
    if (entry) entry.onData = handler
  },

  closeTunnel(sessionId: string): void {
    const entry = tunnels.get(sessionId)
    if (!entry) return
    try {
      entry.stream.close()
      entry.conn.end()
    } catch {
      // suppress
    } finally {
      tunnels.delete(sessionId)
    }
  },
}
