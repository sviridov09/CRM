// Edge Function: бригадир создаёт аккаунт рабочего (логин + пароль).
// Деплой: supabase functions deploy create-worker
// Ключ service role берётся из окружения функции, в клиент он не попадает.

import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  email: string;
  password: string;
  fullName: string;
  payType?: "daily" | "hourly";
  rate?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Кто вызывает: проверяем, что это бригадир
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: me } = await caller.from("profiles").select("role, company_id").eq("id", user.id).single();
  if (me?.role !== "foreman") return json({ error: "Only foreman can create workers" }, 403);

  const body = (await req.json()) as Body;
  if (!body.email || !body.password || !body.fullName) return json({ error: "email, password, fullName required" }, 400);
  if (body.password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

  const admin = createClient(url, service);
  const { data: created, error } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
  });
  if (error || !created.user) return json({ error: error?.message ?? "Create failed" }, 400);

  const { error: pErr } = await admin.from("profiles").insert({
    id: created.user.id,
    company_id: me.company_id,
    full_name: body.fullName,
    role: "worker",
    pay_type: body.payType ?? "daily",
    rate: body.rate ?? 0,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: pErr.message }, 400);
  }

  return json({ id: created.user.id });
});
