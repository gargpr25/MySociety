import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 16;

export function encryptValue(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, "hex");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes (64 hex chars)");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

export function decryptValue(ciphertext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, "hex");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes (64 hex chars)");
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivHex, encHex, tagHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
