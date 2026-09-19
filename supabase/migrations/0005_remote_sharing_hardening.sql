-- Remote-sharing hardening:
-- 1. create a share and all of its items atomically;
-- 2. bind every referenced record/blob to the authenticated owner;
-- 3. prepare Storage URLs before atomically claiming a one-time share;
-- 4. derive state only from authoritative timestamps.

create or replace function public.create_share_with_items(
  p_provider_label text,
  p_provider_type text,
  p_purpose text,
  p_expires_at timestamptz,
  p_one_time boolean,
  p_items jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_share_id uuid;
  v_receipt_code text;
  v_item jsonb;
  v_document_id uuid;
  v_sanitized_id uuid;
  v_vitals_id uuid;
begin
  if v_owner is null then
    raise exception 'authentication required';
  end if;
  if p_expires_at <= now() then
    raise exception 'expiry must be in the future';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'invalid share items';
  end if;

  insert into shares (owner_id, provider_label, provider_type, provider_verified, purpose, expires_at, one_time, status)
  values (v_owner, p_provider_label, p_provider_type, false, p_purpose, p_expires_at, p_one_time, 'ACTIVE')
  returning id into v_share_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_document_id := nullif(v_item->>'documentId', '')::uuid;
    v_sanitized_id := nullif(v_item->>'sanitizedArtifactId', '')::uuid;
    v_vitals_id := nullif(v_item->>'vitalsDatasetId', '')::uuid;

    if v_document_id is not null and not exists (
      select 1 from documents where id = v_document_id and owner_id = v_owner
    ) then
      raise exception 'invalid document reference';
    end if;
    if v_sanitized_id is not null and not exists (
      select 1 from sanitized_artifacts where id = v_sanitized_id and owner_id = v_owner
    ) then
      raise exception 'invalid sanitized artifact reference';
    end if;
    if v_vitals_id is not null and not exists (
      select 1 from vitals_datasets where id = v_vitals_id and owner_id = v_owner
    ) then
      raise exception 'invalid vitals reference';
    end if;
    if v_vitals_id is not null and (v_item->>'encryptedStoragePath') not like v_owner::text || '/%' then
      raise exception 'invalid share blob path';
    end if;

    insert into share_items (
      share_id, document_id, sanitized_artifact_id, vitals_dataset_id,
      selected_metrics, wrapped_access_key, wrapping_iv,
      encrypted_storage_path, encryption_iv
    ) values (
      v_share_id, v_document_id, v_sanitized_id, v_vitals_id,
      v_item->'selectedMetrics', v_item->>'wrappedAccessKey', v_item->>'wrappingIv',
      v_item->>'encryptedStoragePath', v_item->>'encryptionIv'
    );
  end loop;

  v_receipt_code := 'CNST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into consent_receipts (share_id, owner_id, receipt_code, safe_summary)
  values (
    v_share_id,
    v_owner,
    v_receipt_code,
    jsonb_build_object(
      'providerLabel', p_provider_label,
      'purpose', p_purpose,
      'itemCount', jsonb_array_length(p_items),
      'expiresAt', p_expires_at,
      'oneTime', p_one_time
    )
  );

  return jsonb_build_object('shareId', v_share_id, 'receiptCode', v_receipt_code);
end;
$$;

revoke all on function public.create_share_with_items(text, text, text, timestamptz, boolean, jsonb) from public, anon;
grant execute on function public.create_share_with_items(text, text, text, timestamptz, boolean, jsonb) to authenticated;

-- Read candidate item metadata without consuming the share. The API uses this
-- only to create short-lived signed URLs; those URLs are never disclosed until
-- claim_share_access wins the subsequent atomic claim.
create or replace function public.prepare_share_access(p_share_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_share shares%rowtype;
  v_status text;
  v_items jsonb := '[]'::jsonb;
  v_item_count integer := 0;
begin
  select * into v_share from shares where id = p_share_id;
  if not found then return null; end if;

  v_status := case
    when v_share.revoked_at is not null then 'REVOKED'
    when v_share.one_time and v_share.consumed_at is not null then 'CONSUMED'
    when v_share.expires_at <= now() then 'EXPIRED'
    else 'ACTIVE'
  end;

  if v_status = 'ACTIVE' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'itemId', si.id,
        'kind', case when si.document_id is not null then 'document' when si.sanitized_artifact_id is not null then 'sanitized_document' else 'vitals' end,
        'storagePath', coalesce(d.encrypted_storage_path, sa.encrypted_storage_path, si.encrypted_storage_path),
        'iv', coalesce(d.encryption_iv, sa.encryption_iv, si.encryption_iv),
        'wrappedAccessKey', si.wrapped_access_key,
        'wrappingIv', si.wrapping_iv,
        'meta', case
          when si.document_id is not null then jsonb_build_object('title', d.title_safe, 'mimeType', d.mime_type)
          when si.sanitized_artifact_id is not null then jsonb_build_object('title', 'Sanitized report')
          else jsonb_build_object('name', vd.name, 'selectedMetrics', si.selected_metrics)
        end
      ) order by si.created_at
    ), '[]'::jsonb), count(*)::integer
    into v_items, v_item_count
    from share_items si
    left join documents d on d.id = si.document_id
    left join sanitized_artifacts sa on sa.id = si.sanitized_artifact_id
    left join vitals_datasets vd on vd.id = si.vitals_dataset_id
    where si.share_id = p_share_id;
  end if;

  return jsonb_build_object(
    'shareId', v_share.id, 'status', v_status,
    'providerLabel', v_share.provider_label, 'providerType', v_share.provider_type,
    'providerVerified', v_share.provider_verified, 'purpose', v_share.purpose,
    'expiresAt', v_share.expires_at, 'oneTime', v_share.one_time,
    'itemCount', v_item_count, 'items', v_items
  );
end;
$$;

revoke all on function public.prepare_share_access(uuid) from public, anon, authenticated;
grant execute on function public.prepare_share_access(uuid) to service_role;

create or replace function public.claim_share_access(p_share_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_share shares%rowtype;
  v_status text;
  v_items jsonb := '[]'::jsonb;
  v_item_count integer := 0;
begin
  select * into v_share from shares where id = p_share_id for update;
  if not found then return null; end if;

  v_status := case
    when v_share.revoked_at is not null then 'REVOKED'
    when v_share.one_time and v_share.consumed_at is not null then 'CONSUMED'
    when v_share.expires_at <= now() then 'EXPIRED'
    else 'ACTIVE'
  end;

  if v_status = 'ACTIVE' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'itemId', si.id,
        'kind', case when si.document_id is not null then 'document' when si.sanitized_artifact_id is not null then 'sanitized_document' else 'vitals' end,
        'storagePath', coalesce(d.encrypted_storage_path, sa.encrypted_storage_path, si.encrypted_storage_path),
        'iv', coalesce(d.encryption_iv, sa.encryption_iv, si.encryption_iv),
        'wrappedAccessKey', si.wrapped_access_key,
        'wrappingIv', si.wrapping_iv,
        'meta', case
          when si.document_id is not null then jsonb_build_object('title', d.title_safe, 'mimeType', d.mime_type)
          when si.sanitized_artifact_id is not null then jsonb_build_object('title', 'Sanitized report')
          else jsonb_build_object('name', vd.name, 'selectedMetrics', si.selected_metrics)
        end
      ) order by si.created_at
    ), '[]'::jsonb), count(*)::integer
    into v_items, v_item_count
    from share_items si
    left join documents d on d.id = si.document_id
    left join sanitized_artifacts sa on sa.id = si.sanitized_artifact_id
    left join vitals_datasets vd on vd.id = si.vitals_dataset_id
    where si.share_id = p_share_id;

    if v_share.one_time then
      update shares set consumed_at = now(), status = 'CONSUMED' where id = p_share_id;
    end if;

    insert into access_logs (share_id, event_type, actor_type, safe_context)
    values
      (p_share_id, 'SHARE_OPENED', 'provider', '{}'::jsonb),
      (p_share_id, 'PAYLOAD_RETRIEVED', 'provider', jsonb_build_object('itemCount', v_item_count));
    if v_share.one_time then
      insert into access_logs (share_id, event_type, actor_type, safe_context)
      values (p_share_id, 'ONE_TIME_CONSUMED', 'provider', '{}'::jsonb);
    end if;
  end if;

  return jsonb_build_object(
    'shareId', v_share.id, 'status', v_status,
    'providerLabel', v_share.provider_label, 'providerType', v_share.provider_type,
    'providerVerified', v_share.provider_verified, 'purpose', v_share.purpose,
    'expiresAt', v_share.expires_at, 'oneTime', v_share.one_time,
    'itemCount', v_item_count, 'items', v_items
  );
end;
$$;

revoke all on function public.claim_share_access(uuid) from public, anon, authenticated;
grant execute on function public.claim_share_access(uuid) to service_role;
