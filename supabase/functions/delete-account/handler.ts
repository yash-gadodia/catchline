export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type Deps = {
  /** The caller's user id from their Authorization header, or null when not a real user. */
  userFor(authHeader: string): Promise<string | null>;
  /** delete_my_account() run as the caller; an error message, or null. */
  deleteData(authHeader: string): Promise<string | null>;
  /** False while the Sign in with Apple key secrets are missing (GATE). */
  appleConfigured: boolean;
  appleToken(userId: string): Promise<string | null>;
  revokeApple(refreshToken: string): Promise<void>;
  /** Deletes the auth user; an error message, or null. */
  deleteAuthUser(userId: string): Promise<string | null>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// App data first, then Apple's token revoked (guideline 5.1.1(v)), then the
// auth user. A revoke failure is logged and never blocks the deletion.
export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_auth" }, 401);
  const userId = await deps.userFor(authHeader);
  if (!userId) return json({ error: "unauthorized" }, 401);

  const rpcErr = await deps.deleteData(authHeader);
  if (rpcErr) return json({ error: "data_delete_failed", detail: rpcErr }, 500);

  if (!deps.appleConfigured) {
    console.log("apple revocation not configured");
  } else {
    try {
      const token = await deps.appleToken(userId);
      if (token) await deps.revokeApple(token);
    } catch (e) {
      console.error("apple revoke failed", e);
    }
  }

  const delErr = await deps.deleteAuthUser(userId);
  if (delErr) return json({ error: "auth_delete_failed", detail: delErr }, 500);
  return json({ success: true });
}
