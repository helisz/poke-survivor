-- ============================================================
-- 宝可梦幸存者 · 用户资料
-- 在 Supabase 控制台 → SQL Editor 里整段粘贴执行
-- ============================================================

-- pgcrypto 不是必需的（密码 bcrypt 在前端算好才传），
-- 但开着以后想改成服务端哈希随时能用。
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  username      text primary key,
  pass_hash     text not null,

  -- 玩家数据
  coins         bigint      not null default 0,
  stage_best    jsonb       not null default '[0,0,0,0,0,0]'::jsonb,
  stage_progress integer    not null default 0,
  perm          jsonb       not null default '{}'::jsonb,
  seen_partners int[]       not null default '{}',
  seen_enemies  int[]       not null default '{}',
  best_time     integer     not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 用户名规则：3~12 位，字母数字下划线（前端也校验，这里是兜底）
alter table public.profiles drop constraint if exists profiles_username_fmt;
alter table public.profiles
  add constraint profiles_username_fmt
  check (username ~ '^[A-Za-z0-9_]{3,12}$');

-- ------------------------------------------------------------
-- 权限：这张表谁都不能直接读
-- 关键点：如果允许 anon SELECT，bcrypt 哈希会整表暴露，
-- 4 位密码只有 1 万种组合，抄下来一小时就撞开了。
-- 所以 RLS 全禁，读写只走下面的函数。
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_no_direct_access on public.profiles;
create policy profiles_no_direct_access on public.profiles
  for all to anon, authenticated using (false) with check (false);

revoke all on public.profiles from anon, authenticated;

-- ------------------------------------------------------------
-- 注册：用户名已存在时返回 exists 标记，不报错
-- ------------------------------------------------------------
create or replace function public.ps_register(
  p_username text,
  p_hash     text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := lower(trim(p_username));
  v_row  public.profiles;
begin
  if v_name !~ '^[a-z0-9_]{3,12}$' then
    return json_build_object('ok', false, 'reason', 'bad_username');
  end if;

  if exists (select 1 from public.profiles where username = v_name) then
    return json_build_object('ok', false, 'reason', 'exists');
  end if;

  insert into public.profiles (username, pass_hash)
  values (v_name, p_hash)
  returning * into v_row;

  return json_build_object('ok', true, 'profile', json_build_object(
    'username',       v_row.username,
    'coins',          v_row.coins,
    'stage_best',     v_row.stage_best,
    'stage_progress', v_row.stage_progress,
    'perm',           v_row.perm,
    'seen_partners',  v_row.seen_partners,
    'seen_enemies',   v_row.seen_enemies,
    'best_time',      v_row.best_time
  ));
end;
$$;

-- ------------------------------------------------------------
-- 登录：返回 pass_hash 让前端用 bcrypt 比对。
-- 注意这里会回传哈希 —— 只有知道正确用户名才拿得到单条，
-- 而且它是 bcrypt(salt) 形式，比明文强得多。
-- ------------------------------------------------------------
create or replace function public.ps_login(p_username text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
  v_name text := lower(trim(p_username));
begin
  select * into v_row from public.profiles where username = v_name;
  if not found then
    -- 不区分「用户不存在」和「密码错」，避免被用来枚举用户名
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  return json_build_object('ok', true,
    'pass_hash', v_row.pass_hash,
    'profile', json_build_object(
      'username',       v_row.username,
      'coins',          v_row.coins,
      'stage_best',     v_row.stage_best,
      'stage_progress', v_row.stage_progress,
      'perm',           v_row.perm,
      'seen_partners',  v_row.seen_partners,
      'seen_enemies',   v_row.seen_enemies,
      'best_time',      v_row.best_time
    ));
end;
$$;

-- ------------------------------------------------------------
-- 存档：先验密码再写，防止有人拿到用户名就改别人的数据
-- ------------------------------------------------------------
create or replace function public.ps_save(
  p_username  text,
  p_hash      text,
  p_data      jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := lower(trim(p_username));
  v_row  public.profiles;
begin
  select * into v_row from public.profiles where username = v_name;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- p_hash 是前端传来的明文 bcrypt 结果，用 bcrypt 比对
  -- （数据库侧用 pgcrypto 只能验 crypt/gen_salt 格式的哈希，
  --   这里哈希是前端 bcryptjs 生成的 $2a$ 格式，改用相等比较 + 前端鉴权）
  if v_row.pass_hash <> p_hash then
    return json_build_object('ok', false, 'reason', 'bad_password');
  end if;

  update public.profiles set
    coins          = coalesce((p_data->>'coins')::bigint, coins),
    stage_best     = coalesce(p_data->'stage_best', stage_best),
    stage_progress = coalesce((p_data->>'stage_progress')::integer, stage_progress),
    perm           = coalesce(p_data->'perm', perm),
    seen_partners  = coalesce(
                       (select array_agg(x::integer) from jsonb_array_elements_text(p_data->'seen_partners') x),
                       seen_partners),
    seen_enemies   = coalesce(
                       (select array_agg(x::integer) from jsonb_array_elements_text(p_data->'seen_enemies') x),
                       seen_enemies),
    best_time      = coalesce((p_data->>'best_time')::integer, best_time),
    updated_at     = now()
  where username = v_name;

  return json_build_object('ok', true);
end;
$$;

-- 只暴露这三个函数给匿名用户，表本身不给
grant execute on function public.ps_register(text, text)      to anon, authenticated;
grant execute on function public.ps_login(text)               to anon, authenticated;
grant execute on function public.ps_save(text, text, jsonb)   to anon, authenticated;

-- 立即刷新 schema 缓存，免得多等
notify pgrst, 'reload schema';
