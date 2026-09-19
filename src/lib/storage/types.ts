export interface SafeBlobMetadata {
  ownerId: string;
  contentType: string;
  byteSize: number;
}

export interface StoredBlobRef {
  path: string; // opaque routing path/CID — never a decryption key
  provider: "supabase" | "ipfs";
}

export interface EncryptedBlobStore {
  put(data: Uint8Array, metadata: SafeBlobMetadata): Promise<StoredBlobRef>;
  get(ref: StoredBlobRef): Promise<Uint8Array>;
}
