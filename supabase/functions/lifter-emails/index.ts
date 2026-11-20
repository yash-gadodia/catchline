// lifter-emails (deploy with verify_jwt on): the owner's welcome and first-lift emails (0026). Woken hourly by
// lifter_emails_wake() (pg_cron, service key); only the service role may call it. Sends through Gmail SMTP as the
// owner, so a reply lands in his own inbox. Function secrets:
//   GMAIL_USER, GMAIL_APP_PASSWORD   the sender (an app password, never the account password); unset = nothing is sent
//   LIFTER_EMAILS_EXCLUDE            comma-separated addresses that never get mail (the owner's own)
//   LIFTER_EMAILS_RELAY_OK           "true" once the sender is registered with Apple for private relay addresses
//   LIFTER_EMAILS_DRY_RUN            "true" lists who is due and sends nothing

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.14";
import { type Due, mailFor, sendable } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

function isService(token: string): boolean {
  if (token === serviceKey) return true;
  try {
    const part = token.split(".")[1] ?? "";
    return (JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string }).role === "service_role";
  } catch {
    return false;
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  if (!isService(token)) return json({ error: "forbidden" }, 403);
  const user = Deno.env.get("GMAIL_USER") ?? "";
  const pass = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
  const dry = Deno.env.get("LIFTER_EMAILS_DRY_RUN") === "true";
  const opts = {
    relayOk: Deno.env.get("LIFTER_EMAILS_RELAY_OK") === "true",
    exclude: (Deno.env.get("LIFTER_EMAILS_EXCLUDE") ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean),
  };
  const { data, error } = await admin.rpc("lifter_emails_due", { p_limit: 20 });
  if (error) return json({ error: error.message }, 500);
  const due = ((data ?? []) as Due[]).filter((d) => sendable(d, opts));
  if (dry || !user || !pass) return json({ sent: 0, due: due.map((d) => ({ user_id: d.user_id, kind: d.kind })), reason: dry ? "dry run" : "no sender set" });
  const smtp = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  const results: { user_id: string; kind: string; ok: boolean; error?: string }[] = [];
  for (const d of due) {
    const mail = mailFor(d);
    try {
      await smtp.sendMail({ from: `Yash from Catchline <${user}>`, to: mail.to, subject: mail.subject, text: mail.body });
      // first_lift also closes the welcome: nobody gets "you just joined" after "how was your first lift"
      const rows = d.kind === "first_lift" ? [{ user_id: d.user_id, kind: "first_lift" }, { user_id: d.user_id, kind: "welcome" }] : [{ user_id: d.user_id, kind: "welcome" }];
      const { error: wrote } = await admin.from("lifter_emails").upsert(rows, { onConflict: "user_id,kind", ignoreDuplicates: true });
      if (wrote) throw wrote;
      results.push({ user_id: d.user_id, kind: d.kind, ok: true });
    } catch (e) {
      results.push({ user_id: d.user_id, kind: d.kind, ok: false, error: e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160) });
    }
  }
  return json({ sent: results.filter((r) => r.ok).length, results });
});
