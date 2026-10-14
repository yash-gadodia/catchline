import { assertEquals } from "jsr:@std/assert@1";
import { handle, type Profile, type Store } from "./handler.ts";
import { planFromSubscriber, syncEventId } from "./plan.ts";

const U1 = "94e83824-a618-40b3-b11e-2b556a26fdb8";
const U2 = "22222222-2222-4222-8222-222222222222";

// The owner's live RevenueCat v1 subscriber on 2026-10-14 (sandbox purchase of
// catchline_pull_annual at 04:42 UTC), minus subscriber_attributes and urls.
const PULL_SUBSCRIBER = {
  entitlements: {
    pull: {
      expires_date: "2026-10-15T04:42:20Z",
      grace_period_expires_date: null,
      product_identifier: "catchline_pull_annual",
      purchase_date: "2026-10-14T04:42:20Z",
    },
  },
  first_seen: "2013-08-01T07:00:00Z",
  last_seen: "2026-10-14T04:29:58Z",
  non_subscriptions: {},
  original_app_user_id: U1,
  original_application_version: "1",
  original_purchase_date: "2013-08-01T07:00:00Z",
  other_purchases: {},
  subscriptions: {
    catchline_pull_annual: {
      auto_resume_date: null,
      billing_issues_detected_at: null,
      display_name: "Catchline Pull Annual",
      expires_date: "2026-10-15T04:42:20Z",
      grace_period_expires_date: null,
      is_sandbox: true,
      original_purchase_date: "2026-10-14T04:42:20Z",
      ownership_type: "PURCHASED",
      period_type: "normal",
      purchase_date: "2026-10-14T04:42:20Z",
      refunded_at: null,
      store: "app_store",
      store_transaction_id: "2000001250868526",
      unsubscribe_detected_at: null,
    },
  },
};

const BEFORE_EXPIRY = new Date("2026-10-14T11:00:00Z");
const AFTER_EXPIRY = new Date("2026-10-16T00:00:00Z");

function fakeStore(profiles: Profile[]) {
  const calls: unknown[] = [];
  const store: Store = {
    profile: (id) => Promise.resolve(profiles.find((p) => p.id === id) ?? null),
    applyPlan: (args) => {
      calls.push(args);
      return Promise.resolve("applied");
    },
  };
  return { store, calls };
}

function post(auth: string | null = "Bearer jwt-u1") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  return new Request("http://x/sync-plan", { method: "POST", headers, body: "{}" });
}

const tokens: Record<string, string> = { "jwt-u1": U1, "jwt-u2": U2 };
const userFor = (token: string) => Promise.resolve(tokens[token] ?? null);

Deno.test("planFromSubscriber: the owner's live subscriber is pull until it expires", () => {
  assertEquals(planFromSubscriber(PULL_SUBSCRIBER, BEFORE_EXPIRY), {
    plan: "pull",
    founding: false,
    latestAt: "2026-10-15T04:42:20Z",
  });
  assertEquals(planFromSubscriber(PULL_SUBSCRIBER, AFTER_EXPIRY), {
    plan: "free",
    founding: false,
    latestAt: "2026-10-15T04:42:20Z",
  });
});

Deno.test("planFromSubscriber: highest active entitlement, grace period counts, founding is lifetime", () => {
  const sub = {
    entitlements: {
      hook: { expires_date: "2026-01-01T00:00:00Z", purchase_date: "2025-12-01T00:00:00Z" },
      pull: {
        expires_date: "2026-10-01T00:00:00Z",
        grace_period_expires_date: "2026-10-20T00:00:00Z",
        purchase_date: "2026-09-01T00:00:00Z",
      },
      founding: { expires_date: null, purchase_date: "2026-08-01T00:00:00Z" },
    },
  };
  assertEquals(planFromSubscriber(sub, BEFORE_EXPIRY), { plan: "founding", founding: true, latestAt: "2026-10-01T00:00:00Z" });
  assertEquals(planFromSubscriber({ entitlements: { platform: { expires_date: null } } }, BEFORE_EXPIRY), {
    plan: "platform",
    founding: false,
    latestAt: null,
  });
  assertEquals(planFromSubscriber(null, BEFORE_EXPIRY), { plan: "free", founding: false, latestAt: null });
});

Deno.test("syncEventId", () => {
  assertEquals(syncEventId(U1, "2026-10-15T04:42:20Z"), `sync:${U1}:2026-10-15T04:42:20Z`);
  assertEquals(syncEventId(U1, null), `sync:${U1}:none`);
});

Deno.test("401 without a user token, 405 for GET", async () => {
  const { store, calls } = fakeStore([{ id: U1, plan: "free", founding: false }]);
  const deps = { userFor, fetchSubscriber: () => Promise.resolve(PULL_SUBSCRIBER), store };
  assertEquals((await handle(post(null), deps)).status, 401);
  assertEquals((await handle(post("Bearer nope"), deps)).status, 401);
  assertEquals((await handle(new Request("http://x", { method: "GET" }), deps)).status, 405);
  assertEquals(calls, []);
});

Deno.test("upgrades free -> pull from the live subscriber with event_at = now", async () => {
  const { store, calls } = fakeStore([{ id: U1, plan: "free", founding: false }]);
  const res = await handle(post(), {
    userFor, fetchSubscriber: () => Promise.resolve(PULL_SUBSCRIBER), store, now: () => BEFORE_EXPIRY,
  });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { plan: "pull", founding: false, result: "applied" });
  assertEquals(calls, [{
    user: U1,
    plan: "pull",
    founding: null,
    eventId: `sync:${U1}:2026-10-15T04:42:20Z`,
    eventType: "SYNC",
    eventAt: "2026-10-14T11:00:00.000Z",
  }]);
});

Deno.test("uses the JWT's user, never another id", async () => {
  const fetched: string[] = [];
  const { store, calls } = fakeStore([{ id: U2, plan: "free", founding: false }]);
  const res = await handle(
    new Request("http://x/sync-plan", {
      method: "POST",
      headers: { Authorization: "Bearer jwt-u2", "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: U1 }),
    }),
    {
      userFor,
      fetchSubscriber: (id) => {
        fetched.push(id);
        return Promise.resolve(PULL_SUBSCRIBER);
      },
      store,
      now: () => BEFORE_EXPIRY,
    },
  );
  assertEquals(res.status, 200);
  assertEquals(fetched, [U2]);
  assertEquals((calls[0] as { user: string }).user, U2);
});

Deno.test("never downgrades: an expired subscriber leaves pull in place", async () => {
  const { store, calls } = fakeStore([{ id: U1, plan: "pull", founding: false }]);
  const res = await handle(post(), {
    userFor, fetchSubscriber: () => Promise.resolve(PULL_SUBSCRIBER), store, now: () => AFTER_EXPIRY,
  });
  assertEquals(await res.json(), { plan: "pull", founding: false, result: "kept" });
  assertEquals(calls, []);
});

Deno.test("unchanged when the server already holds the plan", async () => {
  const { store, calls } = fakeStore([{ id: U1, plan: "pull", founding: false }]);
  const res = await handle(post(), {
    userFor, fetchSubscriber: () => Promise.resolve(PULL_SUBSCRIBER), store, now: () => BEFORE_EXPIRY,
  });
  assertEquals(await res.json(), { plan: "pull", founding: false, result: "unchanged" });
  assertEquals(calls, []);
});

Deno.test("a founder stays founding when RevenueCat only shows pull", async () => {
  const { store, calls } = fakeStore([{ id: U1, plan: "founding", founding: true }]);
  const res = await handle(post(), {
    userFor, fetchSubscriber: () => Promise.resolve(PULL_SUBSCRIBER), store, now: () => BEFORE_EXPIRY,
  });
  assertEquals(await res.json(), { plan: "founding", founding: true, result: "unchanged" });
  assertEquals(calls, []);
});

Deno.test("a founding entitlement grants the seat", async () => {
  const { store, calls } = fakeStore([{ id: U1, plan: "free", founding: false }]);
  const sub = { entitlements: { founding: { expires_date: null, purchase_date: "2026-10-10T00:00:00Z" } } };
  const res = await handle(post(), { userFor, fetchSubscriber: () => Promise.resolve(sub), store, now: () => BEFORE_EXPIRY });
  assertEquals(await res.json(), { plan: "founding", founding: true, result: "applied" });
  assertEquals((calls[0] as { plan: string; founding: boolean }).plan, "founding");
  assertEquals((calls[0] as { plan: string; founding: boolean }).founding, true);
});

Deno.test("a fresh user with nothing in RevenueCat is free and unchanged", async () => {
  const { store, calls } = fakeStore([{ id: U1, plan: "free", founding: false }]);
  const res = await handle(post(), {
    userFor, fetchSubscriber: () => Promise.resolve({ entitlements: {} }), store, now: () => BEFORE_EXPIRY,
  });
  assertEquals(await res.json(), { plan: "free", founding: false, result: "unchanged" });
  assertEquals(calls, []);
});

Deno.test("404 when the user has no profile", async () => {
  const { store } = fakeStore([]);
  const res = await handle(post(), { userFor, fetchSubscriber: () => Promise.resolve(PULL_SUBSCRIBER), store });
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { error: "no_profile" });
});
