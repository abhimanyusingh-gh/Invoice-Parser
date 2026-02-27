import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;

export function encryptSecret(plainText: string, passphrase: string): string {
  const normalizedPlainText = plainText.trim();
  if (normalizedPlainText.length === 0) {
    throw new Error("Cannot encrypt an empty secret.");
  }

  const key = deriveKey(passphrase);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(normalizedPlainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(encryptedValue: string, passphrase: string): string {
  const [version, ivValue, tagValue, cipherValue] = encryptedValue.split(":");
  if (version !== VERSION || !ivValue || !tagValue || !cipherValue) {
    throw new Error("Encrypted secret payload format is invalid.");
  }

  const key = deriveKey(passphrase);
  const iv = Buffer.from(ivValue, "base64url");
  const tag = Buffer.from(tagValue, "base64url");
  const encrypted = Buffer.from(cipherValue, "base64url");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const value = decrypted.toString("utf8").trim();
  if (value.length === 0) {
    throw new Error("Decrypted secret is empty.");
  }
  return value;
}

function deriveKey(passphrase: string): Buffer {
  const normalized = passphrase.trim();
  if (normalized.length < 16) {
    throw new Error("Secret encryption passphrase must be at least 16 characters.");
  }
  return createHash("sha256").update(normalized).digest();
}
