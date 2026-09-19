import { bufToBase64, base64ToBuf } from "./encoding";

export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string; // base64, 12 bytes
}

export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function exportAesKeyRaw(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

export async function importAesKeyRaw(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

// Never reuse an IV with the same key: a fresh 12-byte IV is generated per call.
export async function aesEncrypt(key: CryptoKey, data: ArrayBuffer | Uint8Array): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data as BufferSource);
  return { ciphertext: bufToBase64(ciphertext), iv: bufToBase64(iv) };
}

export async function aesDecrypt(key: CryptoKey, payload: EncryptedPayload): Promise<ArrayBuffer> {
  const iv = base64ToBuf(payload.iv);
  const ciphertext = base64ToBuf(payload.ciphertext);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource);
}

export interface EncryptedBytes {
  ciphertext: Uint8Array; // raw bytes — no base64 encoding, for large blobs
  iv: string; // base64, 12 bytes — cheap to encode at this size
}

// Byte-native variants for large payloads (document/vitals blobs). Skipping
// base64 here avoids ~300ms + 33% memory overhead per 10MB that the
// string-based aesEncrypt/aesDecrypt above would cost — measured, not assumed
// (see PERFORMANCE.md). Small values (wrapped keys, IVs) keep using the
// base64 EncryptedPayload form since Postgres text columns need it anyway.
export async function aesEncryptBytes(key: CryptoKey, data: ArrayBuffer | Uint8Array): Promise<EncryptedBytes> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data as BufferSource);
  return { ciphertext: new Uint8Array(ciphertext), iv: bufToBase64(iv) };
}

export async function aesDecryptBytes(
  key: CryptoKey,
  payload: { ciphertext: ArrayBuffer | Uint8Array; iv: string },
): Promise<ArrayBuffer> {
  const iv = base64ToBuf(payload.iv);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, payload.ciphertext as BufferSource);
}
