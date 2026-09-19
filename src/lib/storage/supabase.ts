import { v4 as uuidv4 } from "uuid";
import { EncryptedBlobStore, SafeBlobMetadata, StoredBlobRef } from "./types";
import { createSupabaseBrowserClient } from "@/lib/db/client";

const BUCKET = "encrypted-blobs";

export class SupabaseEncryptedBlobStore implements EncryptedBlobStore {
  async put(data: Uint8Array, metadata: SafeBlobMetadata): Promise<StoredBlobRef> {
    const supabase = createSupabaseBrowserClient();
    const path = `${metadata.ownerId}/${uuidv4()}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, data as BlobPart, {
      contentType: "application/octet-stream", // ciphertext only — real MIME type stays inside the encrypted metadata
      upsert: false,
    });
    if (error) throw error;
    return { path, provider: "supabase" };
  }

  async get(ref: StoredBlobRef): Promise<Uint8Array> {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage.from(BUCKET).download(ref.path);
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  }
}
