-- 清空排行榜：重置所有账号的通关进度和分数
--
-- 保留：金币、强化等级、图鉴解锁、最长生存时长
-- 清空：stage_progress（已通关关卡数）、stage_best（各关最高分）
--
-- 这两个字段就是排行榜排名的唯一依据，清掉之后榜单自然为空。
-- 用 service_role 之外的 anon key 无法直接 UPDATE profiles（RLS 全禁），
-- 必须在 SQL Editor 里跑，那里是 postgres 超级用户身份。

update public.profiles
set
  stage_progress = 0,
  stage_best     = '[0,0,0,0,0,0]'::jsonb,
  updated_at     = now();

-- 顺带把测试账号删掉（如果不是你正在用的账号，可以整段跳过）
-- delete from public.profiles where username in ('testguy', 'chrismain');

-- 验证：应该返回空数组
-- select public.ps_top_stages();
