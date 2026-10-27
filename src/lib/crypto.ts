import crypto from "crypto";
import fs from "fs";
import path from "path";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  // Use env var if available
  const envKey = process.env.ENCRYPTION_SECRET;
  if (envKey) {
    // Hash it to get exactly 32 bytes
    return crypto.createHash("sha256").update(envKey).digest();
  }

  // Auto-generate and persist a key file
  const keyPath = path.join(process.cwd(), ".encryption-key");
  try {
    const existing = fs.readFileSync(keyPath, "utf-8").trim();
    return Buffer.from(existing, "hex");
  } catch {
    const newKey = crypto.randomBytes(KEY_LENGTH);
    fs.writeFileSync(keyPath, newKey.toString("hex"), "utf-8");
    return newKey;
  }
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");

  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
