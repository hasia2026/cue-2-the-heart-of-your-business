// Store org-provided secrets (AI provider keys) encrypted at rest.
// Key is derived from CUE_SESSION_SECRET via scrypt — never stored alongside data.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SECRET = process.env.CUE_SESSION_SECRET ?? "";
let keyCache: Buffer | null = null;

function key(): Buffer {
  if (!SECRET) throw new Error("CUE_SESSION_SECRET missing — cannot encrypt secrets");
  if (!keyCache) keyCache = scryptSync(SECRET, "cue-secretbox-v1", 32);
  return keyCache;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(boxed: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = boxed.split(".");
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
