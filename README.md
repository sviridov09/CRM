# Field CRM — MVP

CRM для бригадира (веб) + мобильное приложение для рабочих (Android, потом iOS).
План проекта: Obsidian → `Dan deal/Field CRM/Field CRM — план проекта`.

## Структура

```
field-crm/
├─ supabase/
│  ├─ migrations/        схема базы, права доступа, хранилище (запускать по порядку)
│  ├─ seed.sql           первый бригадир + тестовые материалы
│  └─ functions/
│     └─ create-worker/  серверная функция: бригадир создаёт аккаунт рабочего
├─ shared/types.ts       общие типы и утилиты (расстояние, случайный интервал проверки)
├─ crm/                  веб-CRM (React + Vite) — создаётся командой, см. шаг 4
└─ mobile/               приложение (Expo) — создаётся командой, см. шаг 5
```

## Что уже сделано в базе

Схема проверена на Postgres 16, сценарии прогнаны:

- рабочий **не может начать смену вне радиуса объекта** (ошибка `NOT_ON_SITE`);
- старт → задача `in_progress`, финиш → `done`;
- каждая проверка геолокации сама считает `on_site` (с допуском на точность GPS);
- ответ «ушёл» или отсутствие ответа → **уведомление бригадиру**;
- факт материала больше плана → **уведомление о перерасходе**;
- рабочий добавил свой материал → статус `pending` + **уведомление на подтверждение**;
- рабочий видит только свои задачи и не видит уведомления, не может править справочник;
- уведомления приходят в CRM в реальном времени (Realtime).

---

## Шаг 1. Что поставить на компьютер

- **Node.js LTS** (22.x) — nodejs.org. Проверка: `node -v`
- **Git** — git-scm.com
- **Android Studio** — нужен для сборки и эмулятора. При установке поставь Android SDK.
- На телефоне Android: включи «Для разработчиков» → «Отладка по USB».

## Шаг 2. Проект в Supabase

1. supabase.com → New project. Регион ближе к США (например East US). Пароль базы сохрани.
2. **SQL Editor** → по очереди вставь и запусти:
   1. `supabase/migrations/0001_schema.sql`
   2. `supabase/migrations/0002_rls.sql`
   3. `supabase/migrations/0003_storage.sql`
3. **Authentication → Users → Add user → Create new user**: почта и пароль бригадира, галочка *Auto Confirm User*. Скопируй его **User UID**.
4. Открой `supabase/seed.sql`, замени `<FOREMAN_UID>` на этот UID (два места), запусти в SQL Editor.
5. **Project Settings → API**: скопируй `Project URL` и `anon public` ключ — понадобятся в шагах 4–5.
   Ключ `service_role` никуда не вставляй: он нужен только серверной функции, и Supabase подставит его сам.

## Шаг 3. Серверная функция create-worker

В терминале в папке `field-crm`:

```bash
npx supabase login
npx supabase link --project-ref <ref>     # ref — кусок из Project URL: https://<ref>.supabase.co
npx supabase functions deploy create-worker
```

## Шаг 4. Веб-CRM

```bash
cd field-crm
npm create vite@latest crm -- --template react-ts
cd crm
npm install
npm install @supabase/supabase-js react-router-dom
```

Создай `crm/.env.local`:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public ключ>
```

Запуск: `npm run dev` → http://localhost:5173

## Шаг 5. Мобилка (Expo)

```bash
cd field-crm
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install expo-location expo-task-manager expo-notifications expo-camera expo-image-picker expo-sqlite expo-dev-client
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
```

Создай `mobile/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public ключ>
```

Первый запуск: `npx expo start` → открыть в **Expo Go** по QR-коду.

> Фоновая геолокация в Expo Go **не работает**. Для неё нужна своя сборка:
> телефон по USB → `npx expo run:android` (нужен Android Studio),
> или облачная сборка APK: `npx eas-cli build -p android --profile preview`.

## Шаг 6. Общие типы

В обоих проектах импортируй типы относительным путём:

```ts
import type { Task, Site } from "../../shared/types";
```

---

## Что дальше

Когда шаги 1–5 пройдены и обе заготовки запускаются, дальше по графику:
дни 3–5 — экраны CRM (вход, объекты, рабочие, материалы, задачи),
дни 6–9 — мобилка (задачи на день, старт с геолокацией, фоновые проверки).
