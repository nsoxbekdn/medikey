import { bufToBase64, base64ToBuf } from "@/lib/crypto/encoding";
import { importAesKeyRaw, exportAesKeyRaw, generateAesKey } from "@/lib/crypto/aes";

// The share secret is a random 256-bit AES-GCM key generated client-side.
// It is placed only in the URL fragment — never sent to the backend.
export async function generateShareSecret(): Promise<{ key: CryptoKey; secretB64Url: string }> {
  const key = await generateAesKey();
  const raw = await exportAesKeyRaw(key);
  return { key, secretB64Url: bufToUrlSafeBase64(raw) };
}

export async function importShareSecret(secretB64Url: string): Promise<CryptoKey> {
  const raw = urlSafeBase64ToBuf(secretB64Url);
  return importAesKeyRaw(raw);
}

function bufToUrlSafeBase64(buf: Uint8Array): string {
  return bufToBase64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function urlSafeBase64ToBuf(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return base64ToBuf(padded);
}
