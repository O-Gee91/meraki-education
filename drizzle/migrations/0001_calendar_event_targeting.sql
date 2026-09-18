alter table public.calendar_events add column if not exists class_ids uuid[];
alter table public.calendar_events add column if not exists grade_level integer;

update public.calendar_events set class_ids = array[class_id] where class_id is not null and class_ids is null;

create or replace function public.can_view_grade(_grade integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _grade is null or public.is_staff() or exists (
    select 1 from public.students s
    where s.grade_level = _grade
      and (s.user_id = auth.uid() or s.guardian_user_id = auth.uid())
  )
$$;

drop policy "Signed-in users can view calendar events" on public.calendar_events;
create policy "Signed-in users can view calendar events" on public.calendar_events
for select using (
  can_see_audiences(audiences)
  and public.can_view_grade(grade_level)
  and (
    (class_id is null and (class_ids is null or cardinality(class_ids) = 0))
    or public.can_view_class(class_id)
    or exists (select 1 from unnest(coalesce(class_ids, '{}'::uuid[])) as cid where public.can_view_class(cid))
  )
);