import { assertEquals } from "jsr:@std/assert@1";
import { type Deps, type DueReward, handle, planReward } from "./handler.ts";

const NOW = new Date("2026-11-15T10:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

Deno.test("a first reward runs 30 days from now", () => {
  assertEquals(planReward(30, null, NOW), { status: "granted", until: day(30) });
});

Deno.test("time stacks on what is already banked", () => {
  assertEquals(planReward(30, day(45), NOW), { status: "granted", until: day(75) });
});

Deno.test("an expired bank starts from now", () => {
  assertEquals(planReward(30, day(-10), NOW), { status: "granted", until: day(30) });
});

Deno.test("the bank stops at 12 months from now", () => {
  assertEquals(planReward(365, day(300), NOW), { status: "granted", until: day(365) });
  assertEquals(planReward(30, day(365), NOW), { status: "capped" });
});

function fake(rows: DueReward[], failFor: string[] = []) {
  const grants: Array<[string, string]> = [];
  const results: Array<[string, string, string | null]> = [];
  const deps: Deps = {
    callerFor: async (t) => (t === "service" ? null : t === "user1" ? U1 : undefined),
    due: async (user) => rows.filter((r) => user === null || r.user_id === user),
    grant: async (user, until) => {
      if (failFor.includes(user)) throw new Error("revenuecat 500 down");
      grants.push([user, until.toISOString()]);
    },
    result: async (id, status, until, err) => {
      results.push([id, status, until?.toISOString() ?? err]);
    },
    now: () => NOW,
  };
  return { deps, grants, results };
}

const post = (token?: string) =>
  new Request("http://x/referral-rewards", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });

Deno.test("two rewards for one user in one run stack on each other", async () => {
  const { deps, grants, results } = fake([
    { id: "a", user_id: U1, reason: "inviter", days: 30, attempts: 0, banked_until: null },
    { id: "b", user_id: U1, reason: "milestone_3", days: 90, attempts: 0, banked_until: null },
  ]);
  const res = await handle(post("service"), deps);
  assertEquals(await res.json(), { granted: 2, capped: 0, failed: 0 });
  assertEquals(grants, [[U1, day(30).toISOString()], [U1, day(120).toISOString()]]);
  assertEquals(results, [["a", "granted", day(30).toISOString()], ["b", "granted", day(120).toISOString()]]);
});

Deno.test("a RevenueCat error marks the row failed and moves on", async () => {
  const { deps, results } = fake([
    { id: "a", user_id: U2, reason: "invited", days: 30, attempts: 0, banked_until: null },
    { id: "b", user_id: U1, reason: "inviter", days: 30, attempts: 0, banked_until: null },
  ], [U2]);
  const res = await handle(post("service"), deps);
  assertEquals(await res.json(), { granted: 1, capped: 0, failed: 1 });
  assertEquals(results[0], ["a", "failed", "revenuecat 500 down"]);
});

Deno.test("a user token grants only that user's rewards", async () => {
  const { deps, grants } = fake([
    { id: "a", user_id: U2, reason: "invited", days: 30, attempts: 0, banked_until: null },
    { id: "b", user_id: U1, reason: "inviter", days: 30, attempts: 0, banked_until: null },
  ]);
  await handle(post("user1"), deps);
  assertEquals(grants, [[U1, day(30).toISOString()]]);
});

Deno.test("no token or an unknown token is refused", async () => {
  const { deps } = fake([]);
  assertEquals((await handle(post(), deps)).status, 401);
  assertEquals((await handle(post("nobody"), deps)).status, 401);
});
