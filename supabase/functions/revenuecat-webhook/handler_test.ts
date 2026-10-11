import { assertEquals } from "jsr:@std/assert@1";
import { handle, type Profile, sameSecret, type Store } from "./handler.ts";
import { candidateUserIds, changeFor, planFromEvent, planFromProduct } from "./plan.ts";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const SECRET = "s3cret-value";

function fakeStore(profiles: Profile[]) {
  const calls: unknown[] = [];
  const store: Store = {
    profiles: (ids) => Promise.resolve(profiles.filter((p) => ids.includes(p.id))),
    applyPlan: (args) => {
      calls.push(args);
      return Promise.resolve("applied");
    },
  };
  return { store, calls };
}

function post(event: unknown, auth = SECRET) {
  return new Request("http://x/revenuecat-webhook", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ api_version: "1.0", event }),
  });
}

const TS = 1760176800000;
const AT = new Date(TS).toISOString();

Deno.test("planFromProduct maps every store id", () => {
  assertEquals(planFromProduct("catchline_hook_monthly"), "hook");
  assertEquals(planFromProduct("catchline_pull_annual_trial7"), "pull");
  assertEquals(planFromProduct("catchline_pull:annual-trial7"), "pull");
  assertEquals(planFromProduct("catchline_platform:monthly"), "platform");
  assertEquals(planFromProduct("catchline_founding_lifetime"), "founding");
  assertEquals(planFromProduct("parallax_plus_monthly"), "free");
  assertEquals(planFromProduct(undefined), "free");
});

Deno.test("planFromEvent takes the highest of entitlements and product", () => {
  assertEquals(planFromEvent({ product_id: "catchline_pull_annual", entitlement_ids: ["hook", "pull"] }), "pull");
  assertEquals(planFromEvent({ product_id: "catchline_founding_lifetime", entitlement_ids: ["hook", "pull", "founding"] }), "founding");
  assertEquals(planFromEvent({ product_id: "x", entitlement_ids: ["hook", "pull", "platform"] }), "platform");
});

Deno.test("candidateUserIds keeps uuids in order and drops RevenueCat anonymous ids", () => {
  assertEquals(
    candidateUserIds({ app_user_id: "$RCAnonymousID:abc", original_app_user_id: U1.toUpperCase(), aliases: ["$RCAnonymousID:abc", U2, U1] }),
    [U1, U2],
  );
});

Deno.test("changeFor", () => {
  assertEquals(changeFor({ type: "RENEWAL", product_id: "catchline_hook_annual" }, "pull"), { plan: "hook", founding: null });
  assertEquals(changeFor({ type: "NON_RENEWING_PURCHASE", product_id: "catchline_founding_lifetime" }, "free"), { plan: "founding", founding: true });
  assertEquals(changeFor({ type: "PRODUCT_CHANGE", new_product_id: "catchline_platform_annual" }, "pull"), { plan: "platform", founding: null });
  assertEquals(changeFor({ type: "PRODUCT_CHANGE", new_product_id: "catchline_hook_annual" }, "pull"), null);
  assertEquals(changeFor({ type: "EXPIRATION", product_id: "catchline_pull_annual" }, "pull"), { plan: "free", founding: null });
  assertEquals(changeFor({ type: "EXPIRATION", product_id: "catchline_hook_annual" }, "platform"), null);
  assertEquals(changeFor({ type: "EXPIRATION", product_id: "catchline_founding_lifetime" }, "founding"), null);
  assertEquals(changeFor({ type: "CANCELLATION", product_id: "catchline_pull_annual" }, "pull"), null);
});

Deno.test("sameSecret", async () => {
  assertEquals(await sameSecret(SECRET, SECRET), true);
  assertEquals(await sameSecret("wrong", SECRET), false);
  assertEquals(await sameSecret("", ""), false);
});

Deno.test("401 on a wrong or missing Authorization header", async () => {
  const { store, calls } = fakeStore([{ id: U1, plan: "free", founding: false }]);
  const res = await handle(post({ id: "e1", type: "INITIAL_PURCHASE", app_user_id: U1 }, "nope"), { secret: SECRET, store });
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { error: "unauthorized" });
  assertEquals(calls, []);
});

Deno.test("TEST events are acknowledged and ignored", async () => {
  const { store, calls } = fakeStore([]);
  const res = await handle(post({ id: "t1", type: "TEST", app_user_id: U1 }), { secret: SECRET, store });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, ignored: "test" });
  assertEquals(calls, []);
});

Deno.test("an anonymous RevenueCat id is a 200 no-op and is logged", async () => {
  const { store, calls } = fakeStore([]);
  const logs: string[] = [];
  const res = await handle(post({ id: "e2", type: "INITIAL_PURCHASE", app_user_id: "$RCAnonymousID:abc" }), {
    secret: SECRET, store, log: (m) => logs.push(m),
  });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, ignored: "unknown_user" });
  assertEquals(calls, []);
  assertEquals(logs, ["revenuecat-webhook: INITIAL_PURCHASE e2 has no matching profile (app_user_id $RCAnonymousID:abc)"]);
});

Deno.test("INITIAL_PURCHASE found through an alias sets pull", async () => {
  const { store, calls } = fakeStore([{ id: U1, plan: "free", founding: false }]);
  const res = await handle(post({
    id: "e3", type: "INITIAL_PURCHASE", app_user_id: "$RCAnonymousID:abc", aliases: ["$RCAnonymousID:abc", U1],
    product_id: "catchline_pull_annual_trial7", entitlement_ids: ["hook", "pull"], event_timestamp_ms: TS,
  }), { secret: SECRET, store });
  assertEquals(await res.json(), { ok: true, result: "applied", plan: "pull" });
  assertEquals(calls, [{ user: U1, plan: "pull", founding: null, eventId: "e3", eventType: "INITIAL_PURCHASE", eventAt: AT }]);
});

Deno.test("TRANSFER moves the old owner's plan and founding to the new owner", async () => {
  const { store, calls } = fakeStore([{ id: U1, plan: "founding", founding: true }, { id: U2, plan: "free", founding: false }]);
  const res = await handle(post({
    id: "e4", type: "TRANSFER", transferred_from: [U1], transferred_to: [U2], event_timestamp_ms: TS,
  }), { secret: SECRET, store });
  assertEquals(await res.json(), { ok: true, result: { [U1]: "applied", [U2]: "applied" }, plan: "founding" });
  assertEquals(calls, [
    { user: U1, plan: "free", founding: false, eventId: `e4:from:${U1}`, eventType: "TRANSFER", eventAt: AT },
    { user: U2, plan: "founding", founding: true, eventId: `e4:to:${U2}`, eventType: "TRANSFER", eventAt: AT },
  ]);
});

Deno.test("405 for anything but POST, 400 for a body without an event", async () => {
  const { store } = fakeStore([]);
  assertEquals((await handle(new Request("http://x", { method: "GET" }), { secret: SECRET, store })).status, 405);
  assertEquals((await handle(post(undefined), { secret: SECRET, store })).status, 400);
});
