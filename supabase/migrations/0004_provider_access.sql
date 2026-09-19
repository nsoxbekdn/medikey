-- Resolve provider access in one database transaction. The route calls this
-- with the service-role client; anonymous users never receive direct table
-- access. A one-time share is claimed while its row is locked, so concurrent
-- requests cannot both obtain item metadata.

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
  v_claimed boolean := false;
begin
  select * into v_share
  from shares
  where id = p_share_id
  for update;

  if not found then
    return null;
  end if;

  v_status := case
    when v_share.revoked_at is not null or v_share.status = 'REVOKED' then 'REVOKED'
    when v_share.consumed_at is not null or v_share.status = 'CONSUMED' then 'CONSUMED'
    when v_share.expires_at <= now() or v_share.status = 'EXPIRED' then 'EXPIRED'
    else 'ACTIVE'
  end;

  if v_status = 'ACTIVE' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'itemId', si.id,
        'kind', case
          when si.document_id is not null then 'document'
          when si.sanitized_artifact_id is not null then 'sanitized_document'
          else 'vitals'
        end,
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
      update shares
      set consumed_at = now(), status = 'CONSUMED'
      where id = p_share_id;
      v_claimed := true;
    end if;

    insert into access_logs (share_id, event_type, actor_type, safe_context)
    values
      (p_share_id, 'SHARE_OPENED', 'provider', '{}'::jsonb),
      (p_share_id, 'PAYLOAD_RETRIEVED', 'provider', jsonb_build_object('itemCount', v_item_count));

    if v_claimed then
      insert into access_logs (share_id, event_type, actor_type, safe_context)
      values (p_share_id, 'ONE_TIME_CONSUMED', 'provider', '{}'::jsonb);
    end if;
  end if;

  return jsonb_build_object(
    'shareId', v_share.id,
    'status', v_status,
    'providerLabel', v_share.provider_label,
    'providerType', v_share.provider_type,
    'providerVerified', v_share.provider_verified,
    'purpose', v_share.purpose,
    'expiresAt', v_share.expires_at,
    'oneTime', v_share.one_time,
    'itemCount', v_item_count,
    'items', v_items
  );
end;
$$;

revoke all on function public.claim_share_access(uuid) from public, anon, authenticated;
grant execute on function public.claim_share_access(uuid) to service_role;
