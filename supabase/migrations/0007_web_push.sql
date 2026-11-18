-- Field CRM 0007: Web Push бригадиру — уведомления приходят и при закрытой CRM.
--
-- Новая строка в notifications → триггер через pg_net зовёт Edge Function send-push →
-- она шлёт push на все подписки бригадиров компании. Шум уже срезан раньше (0006),
-- поэтому пушим каждое уведомление.
--
-- Без общего секрета: функция принимает только id уведомления, сама перечитывает его
-- из базы и атомарно ставит pushed_at — повторный или подделанный вызов ничего не отправит.

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,   -- адрес push-сервиса браузера
  p256dh     text not null,          -- ключи шифрования из PushSubscription
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
-- Читать — только свои; писать — только через функции ниже
create policy "own push subscriptions" on push_subscriptions for select using (profile_id = auth.uid());

-- Подписка бригадира. Тот же браузер мог быть подписан под другим бригадиром —
-- подписка переходит к вошедшему сейчас (обычный upsert упёрся бы в RLS)
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_foreman() then
    raise exception 'FORBIDDEN';
  end if;
  insert into push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end $$;

create or replace function delete_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid();
end $$;

revoke execute on function save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function delete_push_subscription(text) from public, anon;
grant execute on function save_push_subscription(text, text, text, text) to authenticated;
grant execute on function delete_push_subscription(text) to authenticated;

alter table notifications
  add column if not exists pushed_at timestamptz; -- когда ушёл push; повторно не шлём

create extension if not exists pg_net;

-- Новое уведомление → вызов send-push. pg_net шлёт запрос асинхронно, после коммита;
-- любая ошибка здесь не должна ломать вставку уведомления — только предупреждение в лог
create or replace function notification_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform net.http_post(
      url  := 'https://quqaaavtnqmqamcndvwe.supabase.co/functions/v1/send-push', -- проект field-crm
      body := jsonb_build_object('notification_id', new.id)
    );
  exception when others then
    raise warning 'notification_push: %', sqlerrm;
  end;
  return new;
end $$;
create trigger notification_push after insert on notifications
  for each row execute function notification_push();
