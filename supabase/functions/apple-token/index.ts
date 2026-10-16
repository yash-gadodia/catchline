// apple-token - store the Sign in with Apple refresh token for later revocation.
// The app sends { authorizationCode } once after Apple sign-in. Deployed with
// verify_jwt on; the user is the JWT's. The code is exchanged at Apple with a
// client_secret signed by the APPLE_SIWA_KEY_ID / APPLE_SIWA_PRIVATE_KEY
// function secrets, and the refresh token lands in apple_tokens (0009,
// service role only). GATE: without those secrets it is a logged no-op.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exchangeCode, siwaConfig } from "../_shared/apple.ts";
import { handle } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cfg = siwaConfig((n) => Deno.env.get(n));

async function userFor(token: string): Promise<string | null> {
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req, {
      userFor,
      configured: cfg !== null,
      exchange: (code) => exchangeCode(cfg!, code),
      async saveToken(userId, refreshToken) {
        const { error } = await admin.from("apple_tokens").upsert({
          user_id: userId,
          refresh_token: refreshToken,
          created_at: new Date().toISOString(),
        });
        if (error) throw error;
      },
    });
  } catch (e) {
    console.error("apple-token failed", e);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
  }
});
