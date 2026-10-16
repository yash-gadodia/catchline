import { assertEquals } from "jsr:@std/assert@1";
import { type Deps, handle } from "./handler.ts";

const U1 = "94e83824-a618-40b3-b11e-2b556a26fdb8";

function deps(over: Partial<Deps> = {}) {
  const saved: [string, string][] = [];
  const exchanged: string[] = [];
  const d: Deps = {
    userFor: (t) => Promise.resolve(t === "jwt-u1" ? U1 : null),
    configured: true,
    exchange: (code) => {
      exchanged.push(code);
      return Promise.resolve("refresh-1");
    },
    saveToken: (u, r) => {
      saved.push([u, r]);
      return Promise.resolve();
    },
    ...over,
  };
  return { d, saved, exchanged };
}

const post = (body: unknown, auth: string | null = "Bearer jwt-u1") =>
  new Request("http://x/apple-token", {
    method: "POST",
    headers: auth ? { Authorization: auth, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

Deno.test("401 without a signed-in user, 405 for GET, 400 without a code", async () => {
  const { d, exchanged } = deps();
  assertEquals((await handle(post({ authorizationCode: "c" }, null), d)).status, 401);
  assertEquals((await handle(post({ authorizationCode: "c" }, "Bearer nope"), d)).status, 401);
  assertEquals((await handle(new Request("http://x", { method: "GET" }), d)).status, 405);
  assertEquals((await handle(post({}), d)).status, 400);
  assertEquals(exchanged, []);
});

Deno.test("exchanges the code and stores the refresh token for the JWT's user", async () => {
  const { d, saved, exchanged } = deps();
  const res = await handle(post({ authorizationCode: "code-1", user_id: "someone-else" }), d);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { stored: true, configured: true });
  assertEquals(exchanged, ["code-1"]);
  assertEquals(saved, [[U1, "refresh-1"]]);
});

Deno.test("GATE: not configured -> 200 no-op, Apple never called", async () => {
  const { d, saved, exchanged } = deps({ configured: false });
  const res = await handle(post({ authorizationCode: "code-1" }), d);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { stored: false, configured: false });
  assertEquals(exchanged, []);
  assertEquals(saved, []);
});

Deno.test("an Apple exchange failure is a 502 and stores nothing", async () => {
  const { d, saved } = deps({ exchange: () => Promise.reject(new Error("apple token 400: invalid_grant")) });
  const res = await handle(post({ authorizationCode: "used" }), d);
  assertEquals(res.status, 502);
  assertEquals(await res.json(), { error: "apple_exchange_failed" });
  assertEquals(saved, []);
});
