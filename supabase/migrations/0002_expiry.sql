-- Authorization is enforced at query time by has_active_permission(), which
-- already checks expires_at > now() — so an unswept row can never grant
-- access past its expiry. This sweep exists purely so the UI/audit log can
-- show status = 'expired' instead of a stale 'active' row. Call it from a
-- server action on each permissions read, or wire to pg_cron if available.

create or replace function sweep_expired_permissions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update permissions
  set status = 'expired'
  where status = 'active' and expires_at <= now();
end;
$$;
