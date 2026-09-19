import { aesEncrypt, aesDecrypt, importAesKeyRaw, exportAesKeyRaw, EncryptedPayload } from "./aes";
import { bufToBase64, base64ToBuf } from "./encoding";

export interface KdfParams {
  saltB64: string;
  iterations: number;
  algorithm: "PBKDF2-SHA-256";
}

const DEFAULT_ITERATIONS = 210_000;

export async function deriveKeyFromPassphrase(
  passphrase: string,
  saltB64?: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<{ key: CryptoKey; params: KdfParams }> {
  const salt = saltB64 ? base64ToBuf(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase) as BufferSource, "PBKDF2", false, [
    "deriveKey",
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  return { key, params: { saltB64: bufToBase64(salt), iterations, algorithm: "PBKDF2-SHA-256" } };
}

export type WrappedKey = EncryptedPayload;

export async function wrapKey(kek: CryptoKey, keyToWrap: CryptoKey): Promise<WrappedKey> {
  const raw = await exportAesKeyRaw(keyToWrap);
  return aesEncrypt(kek, raw);
}

export async function unwrapKey(kek: CryptoKey, wrapped: WrappedKey): Promise<CryptoKey> {
  const raw = await aesDecrypt(kek, wrapped);
  return importAesKeyRaw(new Uint8Array(raw));
}
