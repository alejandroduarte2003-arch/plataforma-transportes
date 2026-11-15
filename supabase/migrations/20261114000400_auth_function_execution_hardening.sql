-- INCOROVA Transportes — close anonymous execution on legacy auth helpers.
-- The signup trigger continues to invoke handle_new_user as a database trigger.
-- is_superadmin remains executable by authenticated sessions because existing
-- RLS policies use it to authorize the current user's own superadmin status.

begin;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

revoke all on function public.is_superadmin()
  from public, anon;

grant execute on function public.is_superadmin()
  to authenticated;

commit;
