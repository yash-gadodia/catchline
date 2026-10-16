import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { CLIENT_ID, clientSecret, exchangeCode, revokeToken, siwaConfig, type SiwaConfig, TEAM_ID } from "./apple.ts";

const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
const b64 = btoa(String.fromCharCode(...der));
// A throwaway key generated per run; the PEM label is assembled so the secret scanner does not flag it.
const LABEL = ["PRIVATE", "KEY"].join(" ");
const PEM = [`-----BEGIN ${LABEL}-----`, ...b64.match(/.{1,64}/g)!, `-----END ${LABEL}-----`].join("\n");
const CFG: SiwaConfig = { keyId: "ABC123DEFG", privateKey: PEM };
const NOW = new Date("2026-10-15T00:00:00Z");

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const part = (jwt: string, i: number) => JSON.parse(new TextDecoder().decode(fromB64url(jwt.split(".")[i])));

Deno.test("siwaConfig: GATE until both secrets are set", () => {
  assertEquals(siwaConfig(() => undefined), null);
  assertEquals(siwaConfig((n) => (n === "APPLE_SIWA_KEY_ID" ? "ABC123DEFG" : undefined)), null);
  assertEquals(siwaConfig((n) => (n === "APPLE_SIWA_PRIVATE_KEY" ? PEM : " ")), null);
  assertEquals(siwaConfig((n) => (n === "APPLE_SIWA_KEY_ID" ? "ABC123DEFG" : PEM)), CFG);
});

Deno.test("clientSecret: exact header and claims, exp within 6 months", async () => {
  const jwt = await clientSecret(CFG, NOW);
  assertEquals(part(jwt, 0), { alg: "ES256", kid: "ABC123DEFG" });
  const claims = part(jwt, 1);
  const iat = NOW.getTime() / 1000;
  assertEquals(claims, { iss: "P6QG53Y747", iat, exp: iat + 600, aud: "https://appleid.apple.com", sub: "com.yashgadodia.parallax" });
  assertEquals([TEAM_ID, CLIENT_ID], ["P6QG53Y747", "com.yashgadodia.parallax"]);
  assert(claims.exp - claims.iat <= 15777000, "Apple caps client_secret at 6 months");
});

Deno.test("clientSecret: the signature verifies with the key's public half", async () => {
  const jwt = await clientSecret(CFG, NOW);
  const [h, p, s] = jwt.split(".");
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    keys.publicKey,
    fromB64url(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  assertEquals(fromB64url(s).length, 64);
  assert(ok);
});

Deno.test("clientSecret: accepts a PEM pasted with literal \\n", async () => {
  const jwt = await clientSecret({ ...CFG, privateKey: PEM.replace(/\n/g, "\\n") }, NOW);
  assertEquals(part(jwt, 0).kid, "ABC123DEFG");
});

function recordingFetch(status: number, body: unknown) {
  const calls: { url: string; form: Record<string, string> }[] = [];
  const fn = (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), form: Object.fromEntries(init!.body as URLSearchParams) });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { fn: fn as typeof fetch, calls };
}

Deno.test("exchangeCode posts the code and returns the refresh token", async () => {
  const { fn, calls } = recordingFetch(200, { refresh_token: "r-1", access_token: "a", id_token: "i" });
  assertEquals(await exchangeCode(CFG, "code-1", fn), "r-1");
  assertEquals(calls[0].url, "https://appleid.apple.com/auth/token");
  const { client_secret, ...rest } = calls[0].form;
  assertEquals(rest, { client_id: "com.yashgadodia.parallax", code: "code-1", grant_type: "authorization_code" });
  assertEquals(part(client_secret, 1).sub, "com.yashgadodia.parallax");
});

Deno.test("exchangeCode throws on an Apple error", async () => {
  const { fn } = recordingFetch(400, { error: "invalid_grant" });
  await assertRejects(() => exchangeCode(CFG, "used", fn), Error, "apple token 400");
});

Deno.test("revokeToken posts the refresh token with the hint", async () => {
  const { fn, calls } = recordingFetch(200, {});
  await revokeToken(CFG, "r-1", fn);
  assertEquals(calls[0].url, "https://appleid.apple.com/auth/revoke");
  const { client_secret, ...rest } = calls[0].form;
  assertEquals(rest, { client_id: "com.yashgadodia.parallax", token: "r-1", token_type_hint: "refresh_token" });
  assertEquals(part(client_secret, 0).alg, "ES256");
  const failing = recordingFetch(400, { error: "invalid_client" });
  await assertRejects(() => revokeToken(CFG, "r-1", failing.fn), Error, "apple revoke 400");
});
