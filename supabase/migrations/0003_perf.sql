-- Performance pass: indexes for actual query patterns + one RPC to save
-- document metadata (documents + document_key_wrappers + sanitized_artifacts)
-- in a single round trip / transaction instead of three sequential inserts.
-- No RLS change: the function runs as the calling role (not security definer),
-- so owner_id = auth.uid() policies still apply exactly as before.

create index if not exists documents_owner_created_idx on documents (owner_id, created_at desc);
create index if not exists vitals_datasets_owner_created_idx on vitals_datasets (owner_id, created_at desc);
create index if not exists shares_owner_created_idx on shares (owner_id, created_at desc);
create index if not exists shares_owner_expires_idx on shares (owner_id, expires_at);
create index if not exists share_items_share_idx on share_items (share_id);
create index if not exists access_logs_share_created_idx on access_logs (share_id, created_at desc);
create index if not exists consent_receipts_share_idx on consent_receipts (share_id);
create index if not exists sanitized_artifacts_owner_idx on sanitized_artifacts (owner_id);
create index if not exists document_key_wrappers_owner_idx on document_key_wrappers (owner_id);

create or replace function public.save_document(
  p_title_safe text,
  p_mime_type text,
  p_encrypted_storage_path text,
  p_encryption_iv text,
  p_sha256_digest text,
  p_byte_size bigint,
  p_wrapped_document_key text,
  p_wrapping_iv text,
  p_sanitized_storage_path text,
  p_sanitized_encryption_iv text,
  p_sanitized_sha256 text
) returns documents
language plpgsql
security invoker
as $$
declare
  v_doc documents;
begin
  insert into documents (
    owner_id, title_safe, mime_type, encrypted_storage_path, encryption_iv,
    sha256_digest, byte_size, privacy_scan_completed
  ) values (
    auth.uid(), p_title_safe, p_mime_type, p_encrypted_storage_path, p_encryption_iv,
    p_sha256_digest, p_byte_size, true
  ) returning * into v_doc;

  insert into document_key_wrappers (document_id, owner_id, wrapped_document_key, wrapping_iv, wrapping_algorithm)
  values (v_doc.id, auth.uid(), p_wrapped_document_key, p_wrapping_iv, 'AES-GCM-256');

  insert into sanitized_artifacts (document_id, owner_id, encrypted_storage_path, encryption_iv, sha256_digest)
  values (v_doc.id, auth.uid(), p_sanitized_storage_path, p_sanitized_encryption_iv, p_sanitized_sha256);

  return v_doc;
end;
$$;

grant execute on function public.save_document to authenticated;
