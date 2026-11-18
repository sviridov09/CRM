// Edge Function: Web Push бригадирам о новом уведомлении.
// Зовёт триггер notification_push (миграция 0007) через pg_net с { notification_id }.
//
// Без пользователя и без секрета: функция сама перечитывает уведомление из базы и атомарно
// ставит pushed_at — повторный или подделанный вызов ничего не отправит второй раз.
// Шифрование и VAPID — свои, на Web Crypto (_shared/webpush.ts): npm:web-push в Deno не работает
// (Node crypto), а готовые Deno-библиотеки шифруют устаревшим aesgcm, которого не понимает Safari.

import { withSupabase } from "npm:@supabase/server@1";
import { sendWebPush } from "../_shared/webpush.ts";

const CRM_URL = "https://crm-nu-black.vercel.app";

type Row = {
  id: string;
  company_id: string;
  type: string;
  task_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  worker: { full_name: string } | null;
  task: { title: string; work_date: string; site: { name: string } | null } | null;
};

/**
 * Текст как в колокольчике CRM (crm/src/i18n/en.json → notification.*) — меняешь там, поменяй здесь.
 * Время — заглушка {{at}}: функция работает в UTC, а время подставит браузер бригадира в его поясе.
 */
function describe(n: Row, material: { name: string; unit: string } | null): string {
  const worker = n.worker?.full_name ?? "A worker";
  const site = n.task?.site?.name ?? "the site";
  const at = "{{at}}";
  const p = n.payload;
  switch (n.type) {
    case "left_site":
      return `${worker} left ${site} at ${at}` + (p.return_in_minutes ? ` · back in ${p.return_in_minutes} min` : "");
    case "absence":
      return `${worker} didn't answer a location check at ${site} (${at})`;
    case "overuse": {
      const what = material ? `${p.actual} ${material.unit} of ${material.name}` : String(p.actual);
      return `${worker} used ${what}, ${p.planned} allocated · ${n.task?.title ?? "task"}`;
    }
    case "material_request":
      return `${worker} requested a new material: ${p.name} (${p.unit})`;
    case "location_off":
      return `${worker} turned off location at ${at} · ${site}`;
    case "location_on":
      return `${worker} turned location back on (${at})`;
    case "no_signal":
      return `No signal from ${worker} since ${at} · ${site}`;
    default:
      return "New notification";
  }
}

/** Куда ведёт клик (как notificationPath в CRM). */
function pathFor(n: Row): string {
  if (n.type === "material_request") return "/materials";
  return n.task ? `/?date=${n.task.work_date}` : "/";
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    const { notification_id } = (await req.json().catch(() => ({}))) as { notification_id?: string };
    if (!notification_id) return Response.json({ error: "notification_id required" }, { status: 400 });

    const admin = ctx.supabaseAdmin;

    // Каждое уведомление пушим ровно один раз
    const { data: n, error } = await admin
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", notification_id)
      .is("pushed_at", null)
      .select("*, worker:worker_id(full_name), task:task_id(title, work_date, site:site_id(name))")
      .maybeSingle<Row>();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!n) return Response.json({ skipped: "already pushed or not found" });

    let material: { name: string; unit: string } | null = null;
    if (n.type === "overuse" && n.payload.material_id) {
      const { data } = await admin.from("materials").select("name, unit").eq("id", n.payload.material_id).maybeSingle();
      material = data;
    }

    // Подписки всех бригадиров компании
    const { data: foremen } = await admin
      .from("profiles")
      .select("id")
      .eq("company_id", n.company_id)
      .eq("role", "foreman")
      .eq("active", true);
    const ids = (foremen ?? []).map((f) => f.id);
    if (ids.length === 0) return Response.json({ sent: 0 });
    const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("profile_id", ids);
    if (!subs?.length) return Response.json({ sent: 0 });

    const vapid = { privateJWK: JSON.parse(Deno.env.get("VAPID_PRIVATE_KEY")!), subject: CRM_URL };
    const payload = {
      title: "Field CRM",
      body: describe(n, material),
      at: String(n.payload.at ?? n.created_at),
      url: pathFor(n),
      tag: `${n.type}:${n.task_id ?? n.id}`, // одно событие по задаче не плодит стопку уведомлений
    };

    const results = await Promise.all(
      subs.map(async (s) => {
        try {
          const status = await sendWebPush(s, payload, vapid, { ttl: 3600, urgency: "high" });
          // Подписка больше не действует (браузер отписан, сайт удалён) — убираем
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
          }
          return status;
        } catch (e) {
          console.error("push failed", s.endpoint, e);
          return 0;
        }
      }),
    );

    return Response.json({ sent: results.filter((r) => r >= 200 && r < 300).length, statuses: results });
  }),
};
