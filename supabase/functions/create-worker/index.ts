// Edge Function: бригадир создаёт аккаунт рабочего (логин + пароль).
// Рабочие входят по логину: под капотом это адрес <username>@workers.field-crm.invalid.
// Работает на новых ключах Supabase (publishable / secret) через @supabase/server.

import { withSupabase } from "npm:@supabase/server@1";

const WORKER_EMAIL_DOMAIN = "workers.field-crm.invalid";
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

type Body = {
  username: string;
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
    const username = body.username?.trim().toLowerCase();
    if (!username || !body.password || !body.fullName) {
      return Response.json({ error: "username, password, fullName required" }, { status: 400 });
    }
    if (!USERNAME_RE.test(username)) {
      return Response.json(
        { error: "Username: 3-32 chars, lowercase letters, digits, dot, dash, underscore" },
        { status: 400 },
      );
    }
    if (body.password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const admin = ctx.supabaseAdmin;

    const { data: taken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (taken) return Response.json({ error: "Username is already taken" }, { status: 409 });

    const { data: created, error } = await admin.auth.admin.createUser({
      email: `${username}@${WORKER_EMAIL_DOMAIN}`,
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
      username,
      role: "worker",
      pay_type: body.payType ?? "daily",
      rate: body.rate ?? 0,
    });
    if (pErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return Response.json({ error: pErr.message }, { status: 400 });
    }

    return Response.json({ id: created.user.id, username });
  }),
};
