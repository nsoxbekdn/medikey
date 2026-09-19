-- MediKey initial schema. UUID primary keys. RLS restricts patient-owned
-- tables to owner_id = auth.uid(); shares are resolved only through the
-- service-role API routes (never a broad anonymous SELECT policy).

create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'patient',
  display_alias text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_crypto (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_key_jwk jsonb not null,
  wrapped_private_bundle text not null,
  wrap_iv text not null,
  kdf_salt text not null,
  kdf_iterations integer not null,
  kdf_algorithm text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title_safe text not null,
  mime_type text not null,
  encrypted_storage_path text not null,
  encrypted_metadata text,
  encryption_iv text not null,
  sha256_digest text not null,
  byte_size bigint not null,
  privacy_scan_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table document_key_wrappers (
  document_id uuid primary key references documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  wrapped_document_key text not null,
  wrapping_iv text not null,
  wrapping_algorithm text not null default 'AES-GCM-256',
  created_at timestamptz not null default now()
);

create table sanitized_artifacts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  encrypted_storage_path text not null,
  encryption_iv text not null,
  sha256_digest text not null,
  created_at timestamptz not null default now()
);

create table vitals_datasets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_type text not null default 'csv',
  encrypted_payload_path text not null,
  encryption_iv text not null,
  -- Per-dataset AES key, wrapped with the owner's vault root key. Needed so a
  -- share can re-wrap the same key for a provider without re-encrypting data.
  wrapped_dataset_key text not null,
  wrapping_iv text not null,
  schema_version integer not null default 1,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now()
);

create table shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider_label text not null,
  provider_type text not null,
  provider_verified boolean not null default false,
  verification_source text,
  verified_at timestamptz,
  purpose text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  one_time boolean not null default false,
  consumed_at timestamptz,
  status text not null default 'ACTIVE'
);

create table share_items (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references shares(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  sanitized_artifact_id uuid references sanitized_artifacts(id) on delete cascade,
  vitals_dataset_id uuid references vitals_datasets(id) on delete cascade,
  selected_metrics jsonb,
  wrapped_access_key text not null,
  wrapping_iv text not null,
  -- Only set for vitals items: a freshly re-encrypted blob containing just
  -- the selected metrics, so an unselected field is never sent to the
  -- provider even in ciphertext form.
  encrypted_storage_path text,
  encryption_iv text,
  created_at timestamptz not null default now(),
  constraint share_items_one_target check (
    (document_id is not null)::int + (sanitized_artifact_id is not null)::int + (vitals_dataset_id is not null)::int = 1
  )
);

create table access_logs (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references shares(id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  safe_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table consent_receipts (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references shares(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  receipt_code text not null unique,
  created_at timestamptz not null default now(),
  safe_summary jsonb not null default '{}'::jsonb
);

-- Row Level Security ---------------------------------------------------

alter table profiles enable row level security;
alter table user_crypto enable row level security;
alter table documents enable row level security;
alter table document_key_wrappers enable row level security;
alter table sanitized_artifacts enable row level security;
alter table vitals_datasets enable row level security;
alter table shares enable row level security;
alter table share_items enable row level security;
alter table access_logs enable row level security;
alter table consent_receipts enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own crypto" on user_crypto for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own documents" on documents for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own key wrappers" on document_key_wrappers for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own sanitized artifacts" on sanitized_artifacts for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own vitals" on vitals_datasets for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own shares" on shares for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own share items" on share_items for all using (
  exists (select 1 from shares s where s.id = share_items.share_id and s.owner_id = auth.uid())
);
create policy "own access logs" on access_logs for select using (
  exists (select 1 from shares s where s.id = access_logs.share_id and s.owner_id = auth.uid())
);
create policy "own consent receipts" on consent_receipts for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- No anonymous SELECT policy on shares/share_items/documents exists here on
-- purpose. Provider (unauthenticated) access is resolved exclusively through
-- server routes using the service-role key, which enforce expiry/revocation
-- before returning anything (see src/app/api/shares/[id]).
