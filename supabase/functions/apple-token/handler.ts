export type Deps = {
  /** The Supabase user id for the bearer token, or null when it is not a signed-in user. */
  userFor(token: string): Promise<string | null>;
  /** False while the Sign in with Apple key secrets are missing (GATE). */
  configured: boolean;
  exchange(code: string): Promise<string>;
  saveToken(userId: string, refreshToken: string): Promise<void>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// The app posts Apple's one-time authorizationCode right after sign-in; the
// refresh token it buys is stored server-side only, for revocation on delete.
export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const user = token ? await deps.userFor(token) : null;
  if (!user) return json({ error: "unauthorized" }, 401);

  const { authorizationCode } = (await req.json().catch(() => ({}))) as { authorizationCode?: unknown };
  if (typeof authorizationCode !== "string" || !authorizationCode) return json({ error: "missing_code" }, 400);

  // GATE: no key yet -> succeed without calling Apple.
  if (!deps.configured) {
    console.log("apple revocation not configured");
    return json({ stored: false, configured: false });
  }
  let refreshToken: string;
  try {
    refreshToken = await deps.exchange(authorizationCode);
  } catch (e) {
    console.error("apple-token exchange failed", e);
    return json({ error: "apple_exchange_failed" }, 502);
  }
  await deps.saveToken(user, refreshToken);
  return json({ stored: true, configured: true });
}
