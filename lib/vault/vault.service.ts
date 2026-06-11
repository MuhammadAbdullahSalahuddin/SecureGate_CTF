import crypto from 'crypto'

const MASTER_KEY = Buffer.from(
  process.env.GUARDIAN_MASTER_KEY ?? '',
  'hex'
)

if (MASTER_KEY.length !== 32) {
  throw new Error(
    'GUARDIAN_MASTER_KEY must be a 32-byte hex string (64 hex chars). ' +
    `Got ${MASTER_KEY.length} bytes. Run: openssl rand -hex 32`
  )
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

export interface EncryptedBlob {
  encryptedBlob: Buffer
  iv: Buffer
  authTag: Buffer
}

// Credential shape stored in the vault.
// ssh: always required — used to connect to the machine.
// db:  optional — present for mysql/mongodb assets.
//      The PAM auto-logs into the DB so the operator never types these.
export interface AssetCredentials {
  ssh: {
    username: string
    password?: string 
    privateKey?: string
  }
  db?: {
    username: string
    password: string
  }
}

export function encryptCredential(plaintext: AssetCredentials): EncryptedBlob {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv)
  cipher.setAAD(Buffer.from('securegate-pam'))

  const json = JSON.stringify(plaintext)
  const encrypted = Buffer.concat([
    cipher.update(json, 'utf8'),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()

  return { encryptedBlob: encrypted, iv, authTag }
}

export function decryptCredential(blob: EncryptedBlob): AssetCredentials {
  const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, blob.iv)
  decipher.setAuthTag(blob.authTag)
  decipher.setAAD(Buffer.from('securegate-pam'))

  const decrypted = Buffer.concat([
    decipher.update(blob.encryptedBlob),
    decipher.final()
  ])

  return JSON.parse(decrypted.toString('utf8'))
}
