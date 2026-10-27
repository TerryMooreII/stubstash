-- The cron secret lives only in Vault. pg_cron sends it; edge functions check it
-- with this function (service role only), so it never needs to be copied anywhere.
create or replace function public._verify_cron_secret(p_secret text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from vault.decrypted_secrets
                  where name = 'cron_secret' and decrypted_secret = p_secret and p_secret <> '');
$$;
revoke execute on function public._verify_cron_secret(text) from public, anon, authenticated;

-- Create the Vault secrets if they don't exist yet (safe to re-run).
-- project_url must point at this project; update it if you recreate elsewhere:
--   select vault.update_secret((select id from vault.secrets where name = 'project_url'), 'https://<ref>.supabase.co');
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret', 'Shared secret for pg_cron -> edge functions');
  end if;
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret('https://mkwexvexzxdbgjkqfoac.supabase.co', 'project_url', 'Base URL used by pg_cron to call edge functions');
  end if;
end;
$$;
