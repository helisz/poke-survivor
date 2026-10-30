-- 排行榜：两条独立的 top10
-- 在 Supabase SQL Editor 整段粘贴执行

-- 1) 通关最高关：stage_progress 越大越好
create or replace function public.ps_top_stages()
returns json
language sql
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select username,
           stage_progress,
           (select coalesce(max(x::int), 0)
              from jsonb_array_elements_text(stage_best) x) as best_score
    from public.profiles
    where stage_progress > 0
    order by stage_progress desc, best_score desc, username asc
    limit 10
  ) t;
$$;

-- 2) 单关最高分：stage_best 里的最大值
create or replace function public.ps_top_scores()
returns json
language sql
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select username,
           (select coalesce(max(x::int), 0)
              from jsonb_array_elements_text(stage_best) x) as best_score,
           (select coalesce(max(i), 0)
              from jsonb_array_elements_text(stage_best) with ordinality as e(v, i)
             where (v::int) = (select max(y::int) from jsonb_array_elements_text(stage_best) y)) - 1 as stage_index
    from public.profiles
    where (select coalesce(max(x::int), 0) from jsonb_array_elements_text(stage_best) x) > 0
    order by best_score desc, username asc
    limit 10
  ) t;
$$;

grant execute on function public.ps_top_stages() to anon, authenticated;
grant execute on function public.ps_top_scores() to anon, authenticated;

notify pgrst, 'reload schema';
