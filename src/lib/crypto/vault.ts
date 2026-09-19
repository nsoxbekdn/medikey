import { deriveKeyFromPassphrase } from "./key-wrap";
import { aesEncrypt, aesDecrypt, generateAesKey, exportAesKeyRaw, importAesKeyRaw } from "./aes";
import { bufToBase64, base64ToBuf, utf8ToBuf, bufToUtf8 } from "./encoding";

// The vault never sends raw private key material to the backend. Only the
// wrapped bundle + public key + KDF params leave the browser.

export interface VaultKeys {
  rootKey: CryptoKey; // AES-GCM 256, used to derive/wrap per-document keys if needed
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey; // ECDH P-256, kept in memory only
}

interface VaultBundlePlain {
  rootKeyRaw: string; // base64
  privateKeyJwk: JsonWebKey;
}

export interface StoredVaultRecord {
  publicKeyJwk: JsonWebKey;
  wrappedPrivateBundle: string; // base64 ciphertext
  wrapIv: string; // base64
  kdfSalt: string;
  kdfIterations: number;
  kdfAlgorithm: string;
}

let sessionVault: VaultKeys | null = null;

export function getUnlockedVault(): VaultKeys | null {
  return sessionVault;
}

export function lockVault(): void {
  sessionVault = null;
}

export async function createVault(passphrase: string): Promise<StoredVaultRecord> {
  const rootKey = await generateAesKey();
  const ecdhPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", ecdhPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", ecdhPair.privateKey);
  const rootKeyRaw = bufToBase64(await exportAesKeyRaw(rootKey));

  const bundle: VaultBundlePlain = { rootKeyRaw, privateKeyJwk };
  const { key: kek, params } = await deriveKeyFromPassphrase(passphrase);
  const wrapped = await aesEncrypt(kek, utf8ToBuf(JSON.stringify(bundle)));

  sessionVault = { rootKey, publicKeyJwk, privateKey: ecdhPair.privateKey };

  return {
    publicKeyJwk,
    wrappedPrivateBundle: wrapped.ciphertext,
    wrapIv: wrapped.iv,
    kdfSalt: params.saltB64,
    kdfIterations: params.iterations,
    kdfAlgorithm: params.algorithm,
  };
}

export async function unlockVault(passphrase: string, stored: StoredVaultRecord): Promise<VaultKeys> {
  const { key: kek } = await deriveKeyFromPassphrase(passphrase, stored.kdfSalt, stored.kdfIterations);
  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await aesDecrypt(kek, { ciphertext: stored.wrappedPrivateBundle, iv: stored.wrapIv });
  } catch {
    throw new Error("Incorrect vault passphrase.");
  }
  const bundle: VaultBundlePlain = JSON.parse(bufToUtf8(plainBuf));
  const rootKey = await importAesKeyRaw(base64ToBuf(bundle.rootKeyRaw));
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    bundle.privateKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
  const vault: VaultKeys = { rootKey, publicKeyJwk: stored.publicKeyJwk, privateKey };
  sessionVault = vault;
  return vault;
}
