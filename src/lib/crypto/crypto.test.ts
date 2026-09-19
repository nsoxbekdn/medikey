import { describe, it, expect } from "vitest";
import { generateAesKey, aesEncrypt, aesDecrypt, exportAesKeyRaw } from "./aes";
import { wrapKey, unwrapKey, deriveKeyFromPassphrase } from "./key-wrap";
import { sha256Hex } from "./hash";
import { utf8ToBuf, bufToUtf8, base64ToBuf, bufToBase64 } from "./encoding";
import { createVault, unlockVault, lockVault } from "./vault";
import { generateShareSecret, importShareSecret } from "@/lib/sharing/secret";

const PLAINTEXT = "TEST-PLAINTEXT-SECRET-123";

describe("AES-GCM document encryption", () => {
  it("round-trips and never leaves plaintext in the ciphertext", async () => {
    const key = await generateAesKey();
    const enc = await aesEncrypt(key, utf8ToBuf(PLAINTEXT));
    expect(base64ToBuf(enc.iv).length).toBe(12);
    expect(bufToUtf8(base64ToBuf(enc.ciphertext))).not.toContain(PLAINTEXT);
    expect(bufToUtf8(await aesDecrypt(key, enc))).toBe(PLAINTEXT);
  });

  it("uses a fresh IV on every call", async () => {
    const key = await generateAesKey();
    const a = await aesEncrypt(key, utf8ToBuf(PLAINTEXT));
    const b = await aesEncrypt(key, utf8ToBuf(PLAINTEXT));
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails cleanly with the wrong key (Test B)", async () => {
    const enc = await aesEncrypt(await generateAesKey(), utf8ToBuf(PLAINTEXT));
    await expect(aesDecrypt(await generateAesKey(), enc)).rejects.toThrow();
  });

  it("fails cleanly on corrupted ciphertext", async () => {
    const key = await generateAesKey();
    const enc = await aesEncrypt(key, utf8ToBuf(PLAINTEXT));
    const bytes = base64ToBuf(enc.ciphertext);
    bytes[0] ^= 0xff;
    await expect(aesDecrypt(key, { ...enc, ciphertext: bufToBase64(bytes) })).rejects.toThrow();
  });
});

describe("key wrapping", () => {
  it("wraps and unwraps a document key under a KEK", async () => {
    const kek = await generateAesKey();
    const docKey = await generateAesKey();
    const unwrapped = await unwrapKey(kek, await wrapKey(kek, docKey));
    expect(await exportAesKeyRaw(unwrapped)).toEqual(await exportAesKeyRaw(docKey));
  });

  it("derives the same KEK from the same passphrase + salt, a different one otherwise", async () => {
    const a = await deriveKeyFromPassphrase("hunter2hunter2");
    const b = await deriveKeyFromPassphrase("hunter2hunter2", a.params.saltB64, a.params.iterations);
    const c = await deriveKeyFromPassphrase("hunter2hunter3", a.params.saltB64, a.params.iterations);
    expect(await exportAesKeyRaw(a.key)).toEqual(await exportAesKeyRaw(b.key));
    expect(await exportAesKeyRaw(a.key)).not.toEqual(await exportAesKeyRaw(c.key));
  });
});

describe("vault", () => {
  it("stores only wrapped material and rejects a wrong passphrase", async () => {
    const stored = await createVault("correct-horse-battery-staple");
    lockVault();
    expect(stored.wrappedPrivateBundle).not.toContain("rootKeyRaw");
    expect(stored.kdfAlgorithm).toBe("PBKDF2-SHA-256");
    await expect(unlockVault("wrong-passphrase-entirely", stored)).rejects.toThrow("Incorrect vault passphrase.");
    const vault = await unlockVault("correct-horse-battery-staple", stored);
    expect(vault.rootKey.algorithm.name).toBe("AES-GCM");
    lockVault();
  });
});

describe("share secret", () => {
  it("survives the URL-safe fragment round trip", async () => {
    const { key, secretB64Url } = await generateShareSecret();
    expect(secretB64Url).toMatch(/^[A-Za-z0-9_-]+$/);
    const imported = await importShareSecret(secretB64Url);
    expect(await exportAesKeyRaw(imported)).toEqual(await exportAesKeyRaw(key));
  });
});

describe("integrity hash", () => {
  it("is deterministic and detects a single-byte change", async () => {
    const a = await sha256Hex(utf8ToBuf(PLAINTEXT));
    expect(a).toBe(await sha256Hex(utf8ToBuf(PLAINTEXT)));
    expect(a).toHaveLength(64);
    expect(a).not.toBe(await sha256Hex(utf8ToBuf(PLAINTEXT + "x")));
  });
});
