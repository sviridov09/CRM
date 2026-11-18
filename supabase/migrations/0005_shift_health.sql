-- Field CRM 0005: контроль смены и её закрытие.
--  * сердцебиение приложения (last_seen_at) и проверка «нет сигнала» раз в 5 минут через pg_cron;
--  * рабочий выключил геолокацию (location_off_since) → уведомление бригадиру;
--  * время финиша смены — серверное;
--  * бригадир может закрыть смену сам (close_shift), если рабочий забыл или сел телефон.
--
-- Новые значения enum используются только внутри plpgsql-функций, поэтому файл можно
-- выполнить целиком одним запуском в SQL Editor.

alter type notification_type add value if not exists 'location_off'; -- рабочий выключил геолокацию
alter type notification_type add value if not exists 'location_on';  -- включил обратно
alter type notification_type add value if not exists 'no_signal';    -- приложение молчит дольше 20 минут

alter table work_sessions
  add column if not exists last_seen_at       timestamptz,                 -- последний сигнал от приложения
  add column if not exists location_off_since timestamptz,                 -- геолокация выключена с этого момента
  add column if not exists no_signal_at       timestamptz,                 -- когда бригадиру ушло «нет сигнала»
  add column if not exists closed_by          uuid references profiles(id); -- смену закрыл бригадир

-- Сигнал и финиш ставим по часам сервера: часы телефона могут врать
create or replace function work_session_server_times()
returns trigger language plpgsql as $$
begin
  if new.last_seen_at is distinct from old.last_seen_at then
    new.last_seen_at := now();
    new.no_signal_at := null; -- сигнал вернулся — следующая пропажа снова даст уведомление
  end if;
  if new.finished_at is not null and old.finished_at is null then
    new.finished_at := now();
  end if;
  return new;
end $$;
create trigger work_session_server_times before update on work_sessions
  for each row execute function work_session_server_times();

-- Геолокацию выключили или включили обратно → уведомление бригадиру
create or replace function work_session_location_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare t tasks;
begin
  if new.finished_at is not null
     or (old.location_off_since is null) = (new.location_off_since is null) then
    return new;
  end if;
  select * into t from tasks where id = new.task_id;
  insert into notifications (company_id, type, task_id, worker_id, payload)
  values (t.company_id,
          case when new.location_off_since is not null
               then 'location_off'::notification_type else 'location_on'::notification_type end,
          t.id, t.worker_id,
          jsonb_build_object('session_id', new.id, 'at', coalesce(new.location_off_since, now())));
  return new;
end $$;
create trigger work_session_location_notify after update of location_off_since on work_sessions
  for each row execute function work_session_location_notify();

-- Открытые смены без сигнала дольше 20 минут → одно уведомление на каждую пропажу
create or replace function check_shift_signals()
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  for s in
    update work_sessions
       set no_signal_at = now()
     where finished_at is null
       and no_signal_at is null
       and coalesce(last_seen_at, started_at) < now() - interval '20 minutes'
    returning id, task_id, coalesce(last_seen_at, started_at) as seen
  loop
    insert into notifications (company_id, type, task_id, worker_id, payload)
    select t.company_id, 'no_signal'::notification_type, t.id, t.worker_id,
           jsonb_build_object('session_id', s.id, 'at', s.seen)
      from tasks t where t.id = s.task_id;
  end loop;
end $$;
-- Вызывает только pg_cron; через API её дёргать нельзя
revoke execute on function check_shift_signals() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('field-crm-shift-signals', '*/5 * * * *', 'select public.check_shift_signals()');

-- Бригадир закрывает смену за рабочего
create or replace function close_shift(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_foreman()
     or not exists (select 1 from tasks where id = p_task_id and company_id = my_company()) then
    raise exception 'FORBIDDEN';
  end if;
  update work_sessions set finished_at = now(), closed_by = auth.uid()
   where task_id = p_task_id and finished_at is null;
  -- задача могла остаться в работе и без открытой сессии
  update tasks set status = 'done' where id = p_task_id and status = 'in_progress';
end $$;
revoke execute on function close_shift(uuid) from public, anon;
grant execute on function close_shift(uuid) to authenticated;
