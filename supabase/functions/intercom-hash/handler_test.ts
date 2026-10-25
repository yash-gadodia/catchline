import { assertEquals } from "jsr:@std/assert@1";
import { type Deps, handle, hmacSha256Hex } from "./handler.ts";

const U1 = "94e83824-a618-40b3-b11e-2b556a26fdb8";

const deps = (over: Partial<Deps> = {}): Deps => ({
  userFor: (t) => Promise.resolve(t === "jwt-u1" ? U1 : null),
  secret: "test-secret",
  ...over,
});

const post = (auth: string | null = "Bearer jwt-u1", body?: unknown) =>
  new Request("http://x/intercom-hash", {
    method: "POST",
    headers: auth ? { Authorization: auth } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

Deno.test("HMAC-SHA256 matches the RFC 4231 test case 2 vector", async () => {
  assertEquals(
    await hmacSha256Hex("Jefe", "what do ya want for nothing?"),
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  );
});

Deno.test("returns the hash of the JWT's user id", async () => {
  const res = await handle(post(), deps());
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { hash: await hmacSha256Hex("test-secret", U1) });
});

Deno.test("hashes the JWT's user, never an id in the body", async () => {
  const res = await handle(post("Bearer jwt-u1", { user_id: "someone-else" }), deps());
  assertEquals(await res.json(), { hash: await hmacSha256Hex("test-secret", U1) });
});

Deno.test("401 without a token or for a token that is not a signed-in user", async () => {
  assertEquals((await handle(post(null), deps())).status, 401);
  assertEquals((await handle(post("Bearer anon-or-bad"), deps())).status, 401);
});

Deno.test("503 while the secret is not set", async () => {
  const res = await handle(post(), deps({ secret: null }));
  assertEquals(res.status, 503);
  assertEquals(await res.json(), { error: "not_configured" });
});

Deno.test("405 for anything but POST", async () => {
  assertEquals((await handle(new Request("http://x/intercom-hash"), deps())).status, 405);
});
