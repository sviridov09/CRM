// Edge Function: бригадир создаёт аккаунт рабочего (логин + пароль).
// Работает на новых ключах Supabase (publishable / secret) через @supabase/server.
// verify_jwt оставляем включённым: вызвать может только вошедший пользователь.

import { withSupabase } from "npm:@supabase/server@1";

type Body = {
  email: string;
  password: string;
  fullName: string;
  payType?: "daily" | "hourly";
  rate?: number;
};

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.sub;
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Кто вызывает: только бригадир (запрос идёт с правами самого пользователя)
    const { data: me } = await ctx.supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", userId)
      .single();
    if (me?.role !== "foreman") {
      return Response.json({ error: "Only foreman can create workers" }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    if (!body.email || !body.password || !body.fullName) {
      return Response.json({ error: "email, password, fullName required" }, { status: 400 });
    }
    if (body.password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Создание аккаунта — админ-клиентом (обходит RLS, ключ только на сервере)
    const admin = ctx.supabaseAdmin;
    const { data: created, error } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });
    if (error || !created.user) {
      return Response.json({ error: error?.message ?? "Create failed" }, { status: 400 });
    }

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
      return Response.json({ error: pErr.message }, { status: 400 });
    }

    return Response.json({ id: created.user.id });
  }),
};
