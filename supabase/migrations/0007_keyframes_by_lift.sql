-- 0007_keyframes_by_lift.sql
-- Keyframes are written under '<user_id>/<lift_id>/' with the user id at
-- analysis time. An account transfer (0006) reassigns the lift and analysis
-- rows but the objects keep their old folder, so the owner-reads-own-folder
-- policy refused to sign them and the moved lifts showed no still. Read access
-- now follows the lift: whoever owns the lift named by the second folder reads
-- its keyframes.

drop policy if exists "keyframes: owner reads own folder" on storage.objects;
drop policy if exists "keyframes: lift owner reads" on storage.objects;
create policy "keyframes: lift owner reads" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'keyframes'
    and exists (
      select 1 from public.lifts l
      where l.id::text = (storage.foldername(name))[2] and l.user_id = (select auth.uid())));
