export type ShareStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | "CONSUMED";

export type AccessEvent =
  | "SHARE_CREATED"
  | "SHARE_OPENED"
  | "PAYLOAD_RETRIEVED"
  | "DECRYPTION_CONFIRMED"
  | "SHARE_REVOKED"
  | "SHARE_EXPIRED"
  | "ONE_TIME_CONSUMED";

export interface PIIMatch {
  id: string;
  type: string;
  label: string;
  value: string;
  start: number;
  end: number;
  confidence: "low" | "medium" | "high";
  selected: boolean;
}

export interface VitalsPoint {
  timestamp: string;
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  glucose?: number;
  spo2?: number;
  weight?: number;
}

export interface ShareManifest {
  shareId: string;
  expiresAt: string;
  oneTime: boolean;
  items: Array<{
    kind: "document" | "sanitized_document" | "vitals";
    id: string;
    selectedMetrics?: string[];
  }>;
}

// --- DB row shapes (mirrors supabase/migrations) ---

export interface DocumentRow {
  id: string;
  owner_id: string;
  title_safe: string;
  mime_type: string;
  encrypted_storage_path: string;
  encrypted_metadata: string | null;
  encryption_iv: string;
  sha256_digest: string;
  byte_size: number;
  privacy_scan_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentKeyWrapperRow {
  document_id: string;
  owner_id: string;
  wrapped_document_key: string;
  wrapping_iv: string;
  wrapping_algorithm: string;
  created_at: string;
}

export interface SanitizedArtifactRow {
  id: string;
  document_id: string;
  owner_id: string;
  encrypted_storage_path: string;
  encryption_iv: string;
  sha256_digest: string;
  created_at: string;
}

export interface ShareRow {
  id: string;
  owner_id: string;
  provider_label: string;
  provider_type: string;
  provider_verified: boolean;
  purpose: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  one_time: boolean;
  consumed_at: string | null;
  status: ShareStatus;
}

export interface ShareItemRow {
  id: string;
  share_id: string;
  document_id: string | null;
  sanitized_artifact_id: string | null;
  vitals_dataset_id: string | null;
  selected_metrics: string[] | null;
  wrapped_access_key: string;
  wrapping_iv: string;
  encrypted_storage_path: string | null;
  encryption_iv: string | null;
  created_at: string;
}

export interface AccessLogRow {
  id: string;
  share_id: string;
  event_type: AccessEvent;
  actor_type: "patient" | "provider" | "system";
  safe_context: Record<string, unknown>;
  created_at: string;
}

export interface VitalsDatasetRow {
  id: string;
  owner_id: string;
  name: string;
  source_type: string;
  encrypted_payload_path: string;
  encryption_iv: string;
  wrapped_dataset_key: string;
  wrapping_iv: string;
  schema_version: number;
  start_at: string;
  end_at: string;
  created_at: string;
}

export interface ConsentReceiptRow {
  id: string;
  share_id: string;
  owner_id: string;
  receipt_code: string;
  created_at: string;
  safe_summary: Record<string, unknown>;
}

export interface UserCryptoRow {
  user_id: string;
  public_key_jwk: JsonWebKey;
  wrapped_private_bundle: string;
  wrap_iv: string;
  kdf_salt: string;
  kdf_iterations: number;
  kdf_algorithm: string;
  created_at: string;
  updated_at: string;
}
