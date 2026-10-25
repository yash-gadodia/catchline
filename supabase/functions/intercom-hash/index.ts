import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const secret = Deno.env.get("INTERCOM_IOS_IDV_SECRET") || null;

async function userFor(token: string): Promise<string | null> {
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user || data.user.is_anonymous ? null : data.user.id;
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req, { userFor, secret });
  } catch (e) {
    console.error("intercom-hash failed", e);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
  }
});
