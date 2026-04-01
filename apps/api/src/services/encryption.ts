import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { env } from "../env.js"

const ALGORITHM = "aes-256-gcm"
// SHA-256 the raw key string → always exactly 32 bytes, accepts any input format
const KEY = createHash("sha256").update(env.API_KEY_ENCRYPTION_KEY).digest()

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":")
}

export function decrypt(encrypted: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(":")

  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Invalid encrypted value format")
  }

  const iv = Buffer.from(ivB64, "base64")
  const authTag = Buffer.from(authTagB64, "base64")
  const ciphertext = Buffer.from(ciphertextB64, "base64")

  const decipher = createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)

  return decipher.update(ciphertext) + decipher.final("utf8")
}
