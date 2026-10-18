-- Paid plans are unlimited: on-device pose makes a video nearly free to analyse.
-- 1000 a month is only an abuse guard (FAIR_USE in entitlements.ts).
create or replace function public.plan_cap(p_plan text)
returns table (cap integer, per_month boolean)
language sql
immutable
set search_path = ''
as $$
  select case p_plan
           when 'hook' then 12
           when 'pull' then 1000
           when 'platform' then 1000
           when 'founding' then 1000
           else 3
         end,
         coalesce(p_plan, 'free') <> 'free';
$$;
