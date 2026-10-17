import { assertEquals } from "jsr:@std/assert@1";
import { type Deps, handle } from "./handler.ts";

const U1 = "94e83824-a618-40b3-b11e-2b556a26fdb8";

function deps(over: Partial<Deps> = {}) {
  const calls: string[] = [];
  const d: Deps = {
    userFor: (h) => Promise.resolve(h === "Bearer jwt-u1" ? U1 : null),
    deleteData: () => {
      calls.push("deleteData");
      return Promise.resolve(null);
    },
    deleteTraces: (u) => {
      calls.push(`deleteTraces:${u}`);
      return Promise.resolve();
    },
    appleConfigured: true,
    appleToken: (u) => {
      calls.push(`appleToken:${u}`);
      return Promise.resolve("refresh-1");
    },
    revokeApple: (t) => {
      calls.push(`revoke:${t}`);
      return Promise.resolve();
    },
    deleteAuthUser: (u) => {
      calls.push(`deleteAuthUser:${u}`);
      return Promise.resolve(null);
    },
    ...over,
  };
  return { d, calls };
}

const post = (auth: string | null = "Bearer jwt-u1") =>
  new Request("http://x/delete-account", { method: "POST", headers: auth ? { Authorization: auth } : {} });

Deno.test("revokes the stored Apple token after the data and before the auth user", async () => {
  const { d, calls } = deps();
  const res = await handle(post(), d);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: true });
  assertEquals(calls, ["deleteData", `deleteTraces:${U1}`, `appleToken:${U1}`, "revoke:refresh-1", `deleteAuthUser:${U1}`]);
});

Deno.test("still deletes the user when the revoke fails", async () => {
  const { d, calls } = deps({
    revokeApple: () => Promise.reject(new Error("apple revoke 400: invalid_client")),
  });
  const res = await handle(post(), d);
  assertEquals(res.status, 200);
  assertEquals(calls, ["deleteData", `deleteTraces:${U1}`, `appleToken:${U1}`, `deleteAuthUser:${U1}`]);
});

Deno.test("still deletes the user when the token lookup fails", async () => {
  const { d, calls } = deps({ appleToken: () => Promise.reject(new Error("db down")) });
  assertEquals((await handle(post(), d)).status, 200);
  assertEquals(calls, ["deleteData", `deleteTraces:${U1}`, `deleteAuthUser:${U1}`]);
});

Deno.test("no stored token (anonymous or pre-0009 user): no revoke", async () => {
  const { d, calls } = deps({
    appleToken: (u) => {
      calls.push(`appleToken:${u}`);
      return Promise.resolve(null);
    },
  });
  assertEquals((await handle(post(), d)).status, 200);
  assertEquals(calls, ["deleteData", `deleteTraces:${U1}`, `appleToken:${U1}`, `deleteAuthUser:${U1}`]);
});

Deno.test("GATE: not configured -> no Apple calls, user still deleted", async () => {
  const { d, calls } = deps({ appleConfigured: false });
  assertEquals((await handle(post(), d)).status, 200);
  assertEquals(calls, ["deleteData", `deleteTraces:${U1}`, `deleteAuthUser:${U1}`]);
});

Deno.test("401s, and a data-delete failure stops before Apple and auth", async () => {
  assertEquals((await handle(post(null), deps().d)).status, 401);
  assertEquals((await handle(post("Bearer nope"), deps().d)).status, 401);
  const { d, calls } = deps({
    deleteData: () => {
      calls.push("deleteData");
      return Promise.resolve("boom");
    },
  });
  const res = await handle(post(), d);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "data_delete_failed", detail: "boom" });
  assertEquals(calls, ["deleteData"]);
});

Deno.test("removes the lift traces after the data, and a trace failure never blocks the deletion", async () => {
  const { d, calls } = deps({ deleteTraces: () => Promise.reject(new Error("storage down")) });
  const res = await handle(post(), d);
  assertEquals(res.status, 200);
  assertEquals(calls, ["deleteData", `appleToken:${U1}`, "revoke:refresh-1", `deleteAuthUser:${U1}`]);
});
