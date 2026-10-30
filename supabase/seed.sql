-- Field CRM: первый бригадир (запустить ОДИН раз после миграций)
--
-- 1. Supabase → Authentication → Users → Add user → Create new user:
--    email бригадира + пароль, галочка "Auto Confirm User".
-- 2. Скопируй его User UID и вставь ниже вместо <FOREMAN_UID>.
-- 3. Запусти этот файл в SQL Editor.

with c as (
  insert into companies (name) values ('Demo Construction') returning id
)
insert into profiles (id, company_id, full_name, role)
select '<FOREMAN_UID>'::uuid, c.id, 'Foreman', 'foreman' from c;

-- Тестовый справочник материалов
insert into materials (company_id, name, unit, price)
select company_id, m.name, m.unit, m.price
from profiles,
     (values ('Ceramic tile', 'sq ft', 3.50),
             ('Interior paint', 'gal', 38.00),
             ('Tile adhesive', 'bag', 24.00),
             ('Drywall sheet 4x8', 'pcs', 15.00)) as m(name, unit, price)
where id = '<FOREMAN_UID>'::uuid;
