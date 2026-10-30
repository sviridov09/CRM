-- Field CRM: схема базы (MVP)
-- Запускать в Supabase → SQL Editor, затем 0002_rls.sql и 0003_storage.sql

create extension if not exists pgcrypto;

-- ── Справочные типы ─────────────────────────────────────────────
create type user_role       as enum ('foreman', 'worker');
create type pay_type        as enum ('daily', 'hourly');
create type material_status as enum ('approved', 'pending', 'rejected');
create type task_status     as enum ('assigned', 'in_progress', 'done');
create type ping_response   as enum ('left', 'no_response');
create type media_kind      as enum ('before', 'after');
create type media_type      as enum ('photo', 'video');
create type notification_type as enum (
  'left_site',          -- рабочий подтвердил, что ушёл
  'absence',            -- рабочий не ответил на проверку
  'overuse',            -- перерасход материала
  'material_request'    -- рабочий добавил свой материал
);

-- ── Компания (на MVP одна, но схема готова к нескольким) ───────
create table companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ── Пользователи ───────────────────────────────────────────────
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id),
  full_name  text not null,
  role       user_role not null,
  pay_type   pay_type not null default 'daily',
  rate       numeric(10,2) not null default 0,   -- за день или за час, в USD
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Объекты ────────────────────────────────────────────────────
create table sites (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name       text not null,
  address    text not null,
  lat        double precision not null,
  lng        double precision not null,
  radius_m   integer not null default 150 check (radius_m between 20 and 2000),
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Справочник материалов ──────────────────────────────────────
create table materials (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name       text not null,
  unit       text not null,                      -- sq ft, gal, pcs …
  price      numeric(10,2),                      -- цена за единицу, может быть пустой у заявки рабочего
  status     material_status not null default 'approved',
  created_by uuid references profiles(id),
  is_custom  boolean not null default false,     -- добавил рабочий вне справочника
  created_at timestamptz not null default now()
);

-- ── Задачи ─────────────────────────────────────────────────────
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  site_id     uuid not null references sites(id),
  worker_id   uuid not null references profiles(id),
  work_date   date not null,
  title       text not null,
  description text,
  status      task_status not null default 'assigned',
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create index tasks_worker_date on tasks (worker_id, work_date);
create index tasks_company_date on tasks (company_id, work_date);

-- Выделено и потрачено по задаче
create table task_materials (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  material_id uuid not null references materials(id),
  planned_qty numeric(12,3) not null default 0,
  actual_qty  numeric(12,3),
  unique (task_id, material_id)
);

-- ── Рабочие сессии (старт / финиш) ─────────────────────────────
create table work_sessions (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid not null references tasks(id) on delete cascade,
  worker_id          uuid not null references profiles(id),
  started_at         timestamptz not null default now(),   -- время сервера
  device_started_at  timestamptz,                          -- время телефона (офлайн)
  start_lat          double precision not null,
  start_lng          double precision not null,
  finished_at        timestamptz,
  device_finished_at timestamptz,
  end_lat            double precision,
  end_lng            double precision
);
create index work_sessions_task on work_sessions (task_id);

-- ── Проверки геолокации ────────────────────────────────────────
create table location_pings (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references work_sessions(id) on delete cascade,
  received_at       timestamptz not null default now(),  -- время сервера
  device_time       timestamptz not null,                -- когда реально снята точка
  lat               double precision not null,
  lng               double precision not null,
  accuracy_m        real,
  on_site           boolean,                             -- считается триггером
  response          ping_response,                       -- если был вне объекта
  return_in_minutes integer,
  deduct            boolean                              -- решение бригадира: вычитать ли время
);
create index location_pings_session on location_pings (session_id, device_time);

-- ── Отчёты и медиа ─────────────────────────────────────────────
create table reports (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  session_id uuid references work_sessions(id),
  comment    text,
  created_at timestamptz not null default now()
);

create table media (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references tasks(id) on delete cascade,
  kind         media_kind not null,
  type         media_type not null,
  storage_path text not null,           -- путь в бакете media: <company_id>/<task_id>/<file>
  taken_at     timestamptz,
  lat          double precision,
  lng          double precision,
  created_at   timestamptz not null default now()
);

-- ── Уведомления бригадиру ──────────────────────────────────────
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  type       notification_type not null,
  task_id    uuid references tasks(id) on delete cascade,
  worker_id  uuid references profiles(id),
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_company_unread on notifications (company_id) where read_at is null;

-- ═══════════════════════════════════════════════════════════════
-- Логика
-- ═══════════════════════════════════════════════════════════════

-- Расстояние в метрах (haversine)
create or replace function distance_m(lat1 double precision, lng1 double precision,
                                      lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Старт сессии разрешён только в радиусе объекта; задача → in_progress
create or replace function work_session_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare s sites;
begin
  select si.* into s from sites si join tasks t on t.site_id = si.id where t.id = new.task_id;
  if distance_m(s.lat, s.lng, new.start_lat, new.start_lng) > s.radius_m then
    raise exception 'NOT_ON_SITE' using hint = 'Worker is outside the site radius';
  end if;
  update tasks set status = 'in_progress' where id = new.task_id and status = 'assigned';
  return new;
end $$;
create trigger work_session_before_insert before insert on work_sessions
  for each row execute function work_session_before_insert();

-- Проверка: на объекте или нет
create or replace function location_ping_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare s sites;
begin
  select si.* into s
  from work_sessions ws join tasks t on t.id = ws.task_id join sites si on si.id = t.site_id
  where ws.id = new.session_id;
  -- небольшой допуск на точность GPS
  new.on_site := distance_m(s.lat, s.lng, new.lat, new.lng)
                 <= s.radius_m + least(coalesce(new.accuracy_m, 0), 100);
  return new;
end $$;
create trigger location_ping_before_insert before insert on location_pings
  for each row execute function location_ping_before_insert();

-- Уведомление бригадиру, когда рабочий ответил «ушёл» или не ответил
create or replace function location_ping_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare t tasks;
begin
  if new.on_site = false and new.response is not null
     and (old is null or old.response is distinct from new.response) then
    select tk.* into t from tasks tk join work_sessions ws on ws.task_id = tk.id where ws.id = new.session_id;
    insert into notifications (company_id, type, task_id, worker_id, payload)
    values (t.company_id,
            case new.response when 'left' then 'left_site'::notification_type else 'absence' end,
            t.id, t.worker_id,
            jsonb_build_object('ping_id', new.id, 'at', new.device_time,
                               'return_in_minutes', new.return_in_minutes));
  end if;
  return new;
end $$;
create trigger location_ping_notify after insert or update of response on location_pings
  for each row execute function location_ping_notify();

-- Перерасход материала
create or replace function task_material_overuse()
returns trigger language plpgsql security definer set search_path = public as $$
declare t tasks;
begin
  if new.actual_qty is not null and new.actual_qty > new.planned_qty
     and (old.actual_qty is null or old.actual_qty <= old.planned_qty) then
    select * into t from tasks where id = new.task_id;
    insert into notifications (company_id, type, task_id, worker_id, payload)
    values (t.company_id, 'overuse', t.id, t.worker_id,
            jsonb_build_object('material_id', new.material_id,
                               'planned', new.planned_qty, 'actual', new.actual_qty));
  end if;
  return new;
end $$;
create trigger task_material_overuse after update of actual_qty on task_materials
  for each row execute function task_material_overuse();

-- Рабочий добавил свой материал → на подтверждение
create or replace function material_request_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_custom then
    insert into notifications (company_id, type, worker_id, payload)
    values (new.company_id, 'material_request', new.created_by,
            jsonb_build_object('material_id', new.id, 'name', new.name, 'unit', new.unit));
  end if;
  return new;
end $$;
create trigger material_request_notify after insert on materials
  for each row execute function material_request_notify();

-- Финиш сессии → задача done
create or replace function work_session_finish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.finished_at is not null and old.finished_at is null then
    update tasks set status = 'done' where id = new.task_id;
  end if;
  return new;
end $$;
create trigger work_session_finish after update of finished_at on work_sessions
  for each row execute function work_session_finish();

-- Уведомления прилетают в CRM в реальном времени
alter publication supabase_realtime add table notifications;
