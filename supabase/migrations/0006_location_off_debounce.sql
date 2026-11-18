-- Field CRM 0006: меньше шума у бригадира от «мигания» геолокации.
-- Рабочий получает предупреждение сразу (это делает телефон), а бригадир — только если
-- геолокация выключена дольше 2 минут. Короткое выкл/вкл (7–10 сек) бригадиру не шлём совсем.
-- location_on бригадиру — только если перед этим ушло location_off.

alter table work_sessions
  add column if not exists location_off_notified_at timestamptz; -- когда бригадиру ушло location_off

-- Геолокацию включили — сбрасываем отметку: следующее выключение даст новое уведомление
create or replace function work_session_location_reset()
returns trigger language plpgsql as $$
begin
  if new.location_off_since is null then
    new.location_off_notified_at := null;
  end if;
  return new;
end $$;
create trigger work_session_location_reset before update of location_off_since on work_sessions
  for each row execute function work_session_location_reset();

-- location_off теперь шлёт cron (check_shift_signals). Здесь — только location_on, и только
-- если location_off уже ушёл. Смотрим old: before-триггер выше уже обнулил new.location_off_notified_at
create or replace function work_session_location_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare t tasks;
begin
  if old.location_off_since is not null and new.location_off_since is null
     and old.location_off_notified_at is not null and new.finished_at is null then
    select * into t from tasks where id = new.task_id;
    insert into notifications (company_id, type, task_id, worker_id, payload)
    values (t.company_id, 'location_on'::notification_type, t.id, t.worker_id,
            jsonb_build_object('session_id', new.id, 'at', now()));
  end if;
  return new;
end $$;

-- Проверки раз в минуту: геолокация выключена > 2 мин и «нет сигнала» > 20 мин
create or replace function check_shift_signals()
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  for s in
    update work_sessions
       set location_off_notified_at = now()
     where finished_at is null
       and location_off_since is not null
       and location_off_notified_at is null
       and location_off_since < now() - interval '2 minutes'
    returning id, task_id, location_off_since
  loop
    insert into notifications (company_id, type, task_id, worker_id, payload)
    select t.company_id, 'location_off'::notification_type, t.id, t.worker_id,
           jsonb_build_object('session_id', s.id, 'at', s.location_off_since)
      from tasks t where t.id = s.task_id;
  end loop;

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
revoke execute on function check_shift_signals() from public, anon, authenticated;

-- То же имя задания: pg_cron обновляет расписание, второго задания не появится
select cron.schedule('field-crm-shift-signals', '* * * * *', 'select public.check_shift_signals()');
