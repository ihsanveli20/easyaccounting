import crypto from "crypto";

function getEncryptionKey(): Buffer {
  const rawSecret =
    process.env.INTEGRATION_SECRET_KEY ||
    process.env.VAPID_PRIVATE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "hesap-plani-default-dev-key-change-in-prod";
  return crypto.createHash("sha256").update(rawSecret).digest();
}

export function encryptSecrets(secrets: Record<string, string>): string {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const json = JSON.stringify(secrets);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecrets(payload?: string | null): Record<string, string> {
  if (!payload) return {};
  try {
    const parts = payload.split(".");
    if (parts.length !== 3) return {};
    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const encrypted = Buffer.from(parts[2], "base64");
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(decrypted);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function maskSecretsForClient(secrets: Record<string, string>): Record<string, boolean> {
  const masked: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(secrets)) {
    masked[k] = Boolean(v && v.trim().length > 0);
  }
  return masked;
}

