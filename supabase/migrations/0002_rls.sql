-- Field CRM: права доступа (Row Level Security)
-- Бригадир видит и меняет всё в своей компании.
-- Рабочий видит только свои задачи и то, что к ним относится.

-- Хелперы: роль и компания текущего пользователя
create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function my_company() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid()
$$;

create or replace function is_foreman() returns boolean
language sql stable as $$ select coalesce(my_role() = 'foreman', false) $$;

-- Задача принадлежит текущему рабочему
create or replace function owns_task(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks where id = t and worker_id = auth.uid())
$$;

alter table companies      enable row level security;
alter table profiles       enable row level security;
alter table sites          enable row level security;
alter table materials      enable row level security;
alter table tasks          enable row level security;
alter table task_materials enable row level security;
alter table work_sessions  enable row level security;
alter table location_pings enable row level security;
alter table reports        enable row level security;
alter table media          enable row level security;
alter table notifications  enable row level security;

-- companies
create policy "read own company" on companies for select using (id = my_company());

-- profiles: все видят коллег по компании; менять может бригадир
-- (создание аккаунтов — только через Edge Function create-worker)
create policy "read colleagues"  on profiles for select using (company_id = my_company());
create policy "foreman updates"  on profiles for update using (is_foreman() and company_id = my_company());

-- sites: все читают, бригадир управляет
create policy "read sites"       on sites for select using (company_id = my_company());
create policy "foreman sites"    on sites for all
  using (is_foreman() and company_id = my_company())
  with check (is_foreman() and company_id = my_company());

-- materials: все читают; бригадир управляет; рабочий может добавить свой (pending)
create policy "read materials"   on materials for select using (company_id = my_company());
create policy "foreman materials" on materials for all
  using (is_foreman() and company_id = my_company())
  with check (is_foreman() and company_id = my_company());
create policy "worker requests material" on materials for insert
  with check (company_id = my_company() and created_by = auth.uid()
              and is_custom and status = 'pending');

-- tasks
create policy "foreman tasks"    on tasks for all
  using (is_foreman() and company_id = my_company())
  with check (is_foreman() and company_id = my_company());
create policy "worker reads own tasks" on tasks for select using (worker_id = auth.uid());

-- task_materials: рабочий читает и вносит факт; добавляет строку для своего материала
create policy "foreman task_materials" on task_materials for all
  using (is_foreman() and exists (select 1 from tasks t where t.id = task_id and t.company_id = my_company()))
  with check (is_foreman() and exists (select 1 from tasks t where t.id = task_id and t.company_id = my_company()));
create policy "worker reads task_materials"  on task_materials for select using (owns_task(task_id));
create policy "worker updates actual"        on task_materials for update using (owns_task(task_id)) with check (owns_task(task_id));
create policy "worker adds custom line"      on task_materials for insert with check (owns_task(task_id) and planned_qty = 0);

-- work_sessions
create policy "foreman sessions" on work_sessions for select
  using (is_foreman() and exists (select 1 from tasks t where t.id = task_id and t.company_id = my_company()));
create policy "worker own sessions" on work_sessions for all
  using (worker_id = auth.uid()) with check (worker_id = auth.uid() and owns_task(task_id));

-- location_pings
create policy "foreman pings" on location_pings for select
  using (is_foreman() and exists (
    select 1 from work_sessions ws join tasks t on t.id = ws.task_id
    where ws.id = session_id and t.company_id = my_company()));
create policy "foreman decides deduct" on location_pings for update
  using (is_foreman() and exists (
    select 1 from work_sessions ws join tasks t on t.id = ws.task_id
    where ws.id = session_id and t.company_id = my_company()));
create policy "worker own pings" on location_pings for all
  using (exists (select 1 from work_sessions ws where ws.id = session_id and ws.worker_id = auth.uid()))
  with check (exists (select 1 from work_sessions ws where ws.id = session_id and ws.worker_id = auth.uid()));

-- reports и media
create policy "foreman reports" on reports for select
  using (is_foreman() and exists (select 1 from tasks t where t.id = task_id and t.company_id = my_company()));
create policy "worker own reports" on reports for all using (owns_task(task_id)) with check (owns_task(task_id));

create policy "foreman media" on media for select
  using (is_foreman() and exists (select 1 from tasks t where t.id = task_id and t.company_id = my_company()));
create policy "worker own media" on media for all using (owns_task(task_id)) with check (owns_task(task_id));

-- notifications: только бригадир
create policy "foreman notifications" on notifications for all
  using (is_foreman() and company_id = my_company())
  with check (is_foreman() and company_id = my_company());
