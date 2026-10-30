-- Field CRM 0004: рабочие входят по логину, а не по почте.
-- Под капотом логин превращается в служебный адрес <username>@workers.field-crm.invalid
-- (домен .invalid зарезервирован и никуда не доставляется). Рабочий его не видит.
-- Пароль рабочему сбрасывает бригадир в CRM.

alter table profiles
  add column username text unique
  check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');

comment on column profiles.username is
  'Логин рабочего. Для входа: email = username || ''@workers.field-crm.invalid''. У бригадира null — он входит по настоящей почте.';
