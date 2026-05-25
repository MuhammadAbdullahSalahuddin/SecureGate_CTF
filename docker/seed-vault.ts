import { encryptCredential } from '../lib/vault/vault.service'
import { Pool } from 'pg'

const pool = new Pool({
  host: 'postgres',
  database: 'securegate',
  user: 'admin',
  password: process.env.GUARDIAN_DB_PASS,
})

async function seedVault() {
  // Store BOTH SSH credentials and DB credentials in the same encrypted blob.
  // The PAM uses ssh.username/ssh.password to connect to the machine,
  // then uses db.username/db.password to auto-login to MySQL — the operator
  // never sees or types either set of credentials.
  const creds = {
    ssh: {
      username: 'pamuser',
      privateKey:`-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACDIa48McIs3yqOt4x14HXj5sB6m8yFQ6n/PXTiv6NzviAAAAJjZE48g2ROP
IAAAAAtzc2gtZWQyNTUxOQAAACDIa48McIs3yqOt4x14HXj5sB6m8yFQ6n/PXTiv6NzviA
AAAEDKI4QKlQTsyIDMLtgDT/WyKDtD4iVJBvv57c8fq2Tep8hrjwxwizfKo63jHXgdePmw
HqbzIVDqf89dOK/o3O+IAAAAFHJvb3RAaXAtMTcyLTMxLTIxLTQ2AQ==
-----END OPENSSH PRIVATE KEY-----`,
    },
    db: {
      username: 'pamuser',
      password: '1234Admin', // ← change to real MySQL password
    },
  }

  const blob = encryptCredential(creds)

  await pool.query(
    `INSERT INTO asset_credentials
       (asset_id, encrypted_blob, iv, auth_tag)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (asset_id) DO UPDATE
       SET encrypted_blob = EXCLUDED.encrypted_blob,
           iv             = EXCLUDED.iv,
           auth_tag       = EXCLUDED.auth_tag`,
    ['00000000-0000-0000-0000-000000000001', blob.encryptedBlob, blob.iv, blob.authTag]
  )

  console.log('Vault seeded successfully')
  console.log('Blob length:', blob.encryptedBlob.length, 'bytes')
  await pool.end()
}

seedVault().catch(err => {
  console.error('Vault seed failed:', err.message)
  process.exit(1)
})
