// Sign in with Apple server-to-server: exchange the app's authorizationCode for
// a refresh token, and revoke that token when the account is deleted (App Store
// guideline 5.1.1(v)). Both need a client_secret: an ES256 JWT signed with the
// Sign in with Apple key (.p8).

export const TEAM_ID = "P6QG53Y747";
export const CLIENT_ID = "com.yashgadodia.parallax";
const APPLE = "https://appleid.apple.com";
const SECRET_TTL_S = 600;

export type SiwaConfig = { keyId: string; privateKey: string };

// GATE: the owner has not created the Sign in with Apple key yet. Until both
// function secrets are set, apple-token and delete-account skip Apple entirely.
export function siwaConfig(env: (name: string) => string | undefined): SiwaConfig | null {
  const keyId = env("APPLE_SIWA_KEY_ID")?.trim();
  const privateKey = env("APPLE_SIWA_PRIVATE_KEY")?.trim();
  return keyId && privateKey ? { keyId, privateKey } : null;
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\\n|\s/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

export async function clientSecret(cfg: SiwaConfig, now: Date = new Date()): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(cfg.privateKey), { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
  const iat = Math.floor(now.getTime() / 1000);
  const input = `${b64urlJson({ alg: "ES256", kid: cfg.keyId })}.${
    b64urlJson({ iss: TEAM_ID, iat, exp: iat + SECRET_TTL_S, aud: APPLE, sub: CLIENT_ID })
  }`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

type Fetch = typeof fetch;

function form(fields: Record<string, string>) {
  return { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) };
}

export async function exchangeCode(cfg: SiwaConfig, code: string, fetchFn: Fetch = fetch): Promise<string> {
  const res = await fetchFn(`${APPLE}/auth/token`, form({
    client_id: CLIENT_ID,
    client_secret: await clientSecret(cfg),
    code,
    grant_type: "authorization_code",
  }));
  if (!res.ok) throw new Error(`apple token ${res.status}: ${await res.text()}`);
  const { refresh_token } = (await res.json()) as { refresh_token?: string };
  if (!refresh_token) throw new Error("apple token: no refresh_token");
  return refresh_token;
}

export async function revokeToken(cfg: SiwaConfig, token: string, fetchFn: Fetch = fetch): Promise<void> {
  const res = await fetchFn(`${APPLE}/auth/revoke`, form({
    client_id: CLIENT_ID,
    client_secret: await clientSecret(cfg),
    token,
    token_type_hint: "refresh_token",
  }));
  if (!res.ok) throw new Error(`apple revoke ${res.status}: ${await res.text()}`);
}
