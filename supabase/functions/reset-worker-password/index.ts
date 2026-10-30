// Edge Function: бригадир задаёт рабочему новый пароль (рабочий забыл старый).
// Только для рабочих своей компании. Пароль генерирует CRM и показывает бригадиру.
// Работает на новых ключах Supabase (publishable / secret) через @supabase/server.

import { withSupabase } from "npm:@supabase/server@1";

type Body = {
  workerId: string;
  password: string;
};

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Кто вызывает: только бригадир (запрос идёт с правами самого пользователя)
    const { data: me } = await ctx.supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", userId)
      .single();
    if (me?.role !== "foreman") {
      return Response.json({ error: "Only foreman can reset passwords" }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    if (!body.workerId || !body.password) {
      return Response.json({ error: "workerId, password required" }, { status: 400 });
    }
    if (body.password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const admin = ctx.supabaseAdmin;

    // Чей пароль меняем: только рабочий той же компании (бригадиру — через панель Supabase)
    const { data: worker } = await admin
      .from("profiles")
      .select("role, company_id, username")
      .eq("id", body.workerId)
      .maybeSingle();
    if (!worker || worker.company_id !== me.company_id) {
      return Response.json({ error: "Worker not found" }, { status: 404 });
    }
    if (worker.role !== "worker") {
      return Response.json({ error: "Only worker passwords can be reset here" }, { status: 403 });
    }

    const { error } = await admin.auth.admin.updateUserById(body.workerId, { password: body.password });
    if (error) return Response.json({ error: error.message }, { status: 400 });

    return Response.json({ username: worker.username });
  }),
};
