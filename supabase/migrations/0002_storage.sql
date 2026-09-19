-- Private bucket for ciphertext-only blobs (documents, sanitized artifacts,
-- vitals payloads). Access goes through signed operations from server code
-- or RLS-restricted owner uploads — never public.

insert into storage.buckets (id, name, public)
values ('encrypted-blobs', 'encrypted-blobs', false)
on conflict (id) do nothing;

create policy "owner can upload own blobs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'encrypted-blobs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owner can read own blobs" on storage.objects
  for select to authenticated
  using (bucket_id = 'encrypted-blobs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owner can delete own blobs" on storage.objects
  for delete to authenticated
  using (bucket_id = 'encrypted-blobs' and (storage.foldername(name))[1] = auth.uid()::text);

-- Provider retrieval of shared blobs is proxied through
-- /api/shares/[id]/payload using the service-role key, which independently
-- enforces share expiry/revocation before reading storage.
