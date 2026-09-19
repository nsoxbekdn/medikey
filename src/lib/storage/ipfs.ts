import { EncryptedBlobStore, SafeBlobMetadata, StoredBlobRef } from "./types";

// Stub adapter: kept interface-compatible so a real Pinata/web3.storage
// integration can be dropped in later. Ciphertext-only rule applies here too
// — callers must encrypt before put(). Not wired into the MVP flow yet.
export class IPFSEncryptedBlobStore implements EncryptedBlobStore {
  async put(_data: Uint8Array, _metadata: SafeBlobMetadata): Promise<StoredBlobRef> {
    throw new Error("IPFS storage not configured. Set IPFS_PROVIDER and IPFS_API_TOKEN.");
  }

  async get(_ref: StoredBlobRef): Promise<Uint8Array> {
    throw new Error("IPFS storage not configured.");
  }
}
