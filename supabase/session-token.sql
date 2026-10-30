-- 会话 token：刷新页面不掉登录（重建版）
--
-- 之前用 pgcrypto 的 digest/gen_random_bytes，Supabase 把它装在 extensions schema，
-- 函数里用 public. 前缀解析不到。改用 PostgreSQL 内置的 md5()，零扩展依赖。
-- 库里只存 token 的 md5 摘要，明文只在登录那一次返回给前端。

-- ── 1. 先清干净（重复跑也不会报错） ──
drop function if exists public.ps_logout(text);
drop function if exists public.ps_save_by_token(text, jsonb);
drop function if exists public.ps_session_profile(text);
drop function if exists public.ps_issue_token(text);
drop function if exists public.ps_login(text);
drop function if exists public.ps_register(text, text);
drop table if exists public.ps_sessions cascade;


-- ── 2. 建表 ──
create table public.ps_sessions (
  token_hash text primary key,
  username   text not null references public.profiles(username) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index ps_sessions_username_idx on public.ps_sessions(username);

alter table public.ps_sessions enable row level security;

create policy ps_sessions_no_direct_access on public.ps_sessions
  for all to anon, authenticated using (false) with check (false);

revoke all on public.ps_sessions from anon, authenticated;


-- ── 3. 用 token 恢复会话（刷新页面后调用） ──
create or replace function public.ps_session_profile(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.ps_sessions%rowtype;
  v_prof public.profiles%rowtype;
begin
  if p_token is null or length(p_token) < 16 then
    return json_build_object('ok', false, 'reason', 'bad_token');
  end if;

  select * into v_row from public.ps_sessions where token_hash = md5(p_token);

  if v_row.token_hash is null then
    return json_build_object('ok', false, 'reason', 'bad_token');
  end if;

  if v_row.expires_at < now() then
    delete from public.ps_sessions where token_hash = v_row.token_hash;
    return json_build_object('ok', false, 'reason', 'expired');
  end if;

  select * into v_prof from public.profiles where username = v_row.username;

  if v_prof.username is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  return json_build_object(
    'ok', true,
    'username', v_prof.username,
    'profile', json_build_object(
      'username',       v_prof.username,
      'coins',          v_prof.coins,
      'stage_best',     v_prof.stage_best,
      'stage_progress', v_prof.stage_progress,
      'perm',           v_prof.perm,
      'seen_partners',  v_prof.seen_partners,
      'seen_enemies',   v_prof.seen_enemies,
      'best_time',      v_prof.best_time
    )
  );
end;
$$;


-- ── 4. 用 token 存档 ──
create or replace function public.ps_save_by_token(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.ps_sessions%rowtype;
  v_prof  public.profiles%rowtype;
  v_best  jsonb;
  v_part  jsonb;
  v_enem  jsonb;
begin
  select * into v_row from public.ps_sessions where token_hash = md5(p_token);

  if v_row.token_hash is null or v_row.expires_at < now() then
    return json_build_object('ok', false, 'reason', 'bad_token');
  end if;

  -- 先取出现有资料，后面的合并都基于变量，不直接引用列名
  -- （列名在子查询里没有 FROM 上下文，会报 column does not exist）
  select * into v_prof from public.profiles where username = v_row.username;
  if v_prof.username is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- 各关最高分：逐关取两边最大值
  select coalesce(jsonb_agg(greatest(
           coalesce((a.value)::int, 0),
           coalesce((b.value)::int, 0)) order by a.ord), '[]'::jsonb)
    into v_best
    from jsonb_array_elements_text(
           case when jsonb_typeof(v_prof.stage_best) = 'array'
                then v_prof.stage_best else '[]'::jsonb end) with ordinality as a(value, ord)
    left join jsonb_array_elements_text(
           case when jsonb_typeof(p_data->'stage_best') = 'array'
                then p_data->'stage_best' else '[]'::jsonb end) with ordinality as b(value, ord)
      using (ord);

  -- 图鉴：取并集
  select coalesce(jsonb_agg(distinct x order by x), '[]'::jsonb) into v_part
    from (
      select unnest v_prof.seen_partners as x
      union
      select (v)::int from jsonb_array_elements_text(
        case when jsonb_typeof(p_data->'seen_partners') = 'array'
             then p_data->'seen_partners' else '[]'::jsonb end) as v
    ) s;

  select coalesce(jsonb_agg(distinct x order by x), '[]'::jsonb) into v_enem
    from (
      select unnest v_prof.seen_enemies as x
      union
      select (v)::int from jsonb_array_elements_text(
        case when jsonb_typeof(p_data->'seen_enemies') = 'array'
             then p_data->'seen_enemies' else '[]'::jsonb end) as v
    ) s;

  update public.profiles set
    coins          = greatest(coins, coalesce((p_data->>'coins')::int, coins)),
    stage_best     = case when jsonb_array_length(v_best) > 0 then v_best else stage_best end,
    stage_progress = greatest(stage_progress, coalesce((p_data->>'stage_progress')::int, stage_progress)),
    best_time      = greatest(best_time, coalesce((p_data->>'best_time')::int, best_time)),
    perm           = coalesce(p_data->'perm', perm),
    seen_partners  = case when jsonb_array_length(v_part) > 0 then v_part else seen_partners end,
    seen_enemies   = case when jsonb_array_length(v_enem) > 0 then v_enem else seen_enemies end,
    updated_at     = now()
  where username = v_row.username;

  return json_build_object('ok', true);
end;
$$;


-- ── 5. 登出：吊销当前 token ──
create or replace function public.ps_logout(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.ps_sessions where token_hash = md5(p_token);
  return json_build_object('ok', true);
end;
$$;


-- ── 6. 登录：返回 token ──
create or replace function public.ps_login(p_username text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_prof  public.profiles%rowtype;
  v_token text;
begin
  v_name := lower(trim(p_username));

  select * into v_prof from public.profiles where username = v_name;
  if v_prof.username is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_token := md5(random()::text || clock_timestamp()::text || v_name);
  insert into public.ps_sessions (token_hash, username) values (md5(v_token), v_name);
  delete from public.ps_sessions where username = v_name and expires_at < now();

  return json_build_object(
    'ok', true,
    'pass_hash', v_prof.pass_hash,
    'token', v_token,
    'username', v_prof.username,
    'profile', json_build_object(
      'username',       v_prof.username,
      'coins',          v_prof.coins,
      'stage_best',     v_prof.stage_best,
      'stage_progress', v_prof.stage_progress,
      'perm',           v_prof.perm,
      'seen_partners',  v_prof.seen_partners,
      'seen_enemies',   v_prof.seen_enemies,
      'best_time',      v_prof.best_time
    )
  );
end;
$$;


-- ── 7. 注册：返回 token ──
create or replace function public.ps_register(p_username text, p_hash text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_prof  public.profiles%rowtype;
  v_token text;
begin
  v_name := lower(trim(p_username));

  if v_name !~ '^[a-z0-9_]{3,12}$' then
    return json_build_object('ok', false, 'reason', 'bad_username');
  end if;

  if exists (select 1 from public.profiles where username = v_name) then
    return json_build_object('ok', false, 'reason', 'exists');
  end if;

  insert into public.profiles (username, pass_hash) values (v_name, p_hash)
  returning * into v_prof;

  v_token := md5(random()::text || clock_timestamp()::text || v_name);
  insert into public.ps_sessions (token_hash, username) values (md5(v_token), v_name);

  return json_build_object(
    'ok', true,
    'token', v_token,
    'username', v_prof.username,
    'profile', json_build_object(
      'username',       v_prof.username,
      'coins',          v_prof.coins,
      'stage_best',     v_prof.stage_best,
      'stage_progress', v_prof.stage_progress,
      'perm',           v_prof.perm,
      'seen_partners',  v_prof.seen_partners,
      'seen_enemies',   v_prof.seen_enemies,
      'best_time',      v_prof.best_time
    )
  );
exception
  when unique_violation then
    return json_build_object('ok', false, 'reason', 'exists');
end;
$$;


-- ── 8. 授权 ──
grant execute on function public.ps_session_profile(text)      to anon, authenticated;
grant execute on function public.ps_save_by_token(text, jsonb) to anon, authenticated;
grant execute on function public.ps_logout(text)               to anon, authenticated;

notify pgrst, 'reload schema';
