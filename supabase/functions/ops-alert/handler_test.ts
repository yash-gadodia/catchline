import { assertEquals } from "jsr:@std/assert@1";
import { type Change, handle, type Health, jwtRole, message, parseIds, type Push } from "./handler.ts";

const BAD: Health = { stuck: 3, oldest_min: 14, worker_seen_min: 12, failed_30m: 4 };
const OWNER = "a54d126b-4a48-44ef-8fb2-4f7f20f606b9";

function jwt(payload: Record<string, unknown>) {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

function deps(tokens: string[] = ["ExponentPushToken[owner]"], adminIds = [OWNER]) {
  const sent: Push[][] = [];
  const asked: string[][] = [];
  return {
    sent,
    asked,
    deps: {
      isServiceRole: (h: string) => jwtRole(h) === "service_role",
      adminIds,
      pushTokens: (ids: string[]) => {
        asked.push(ids);
        return Promise.resolve(tokens);
      },
      send: (m: Push[]) => {
        sent.push(m);
        return Promise.resolve();
      },
    },
  };
}

function post(body: unknown, role = "service_role") {
  return new Request("http://x/ops-alert", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt({ role })}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const open = (...kinds: Change["kind"][]): Change[] => kinds.map((kind) => ({ kind, state: "open" }));

Deno.test("message: the queue and the worker in one line", () => {
  assertEquals(message(open("queue_stuck", "worker_silent"), BAD), {
    title: "Catchline alert",
    body: "3 lifts waiting over 5 min, worker last seen 12 min ago",
  });
});

Deno.test("message: failures, a never-seen worker, singular lift", () => {
  assertEquals(message(open("failures", "worker_silent", "queue_stuck"), { ...BAD, stuck: 1, worker_seen_min: null }), {
    title: "Catchline alert",
    body: "4 lifts failed in 30 min, no worker heartbeat yet, 1 lift waiting over 5 min",
  });
});

Deno.test("message: recovery only, and mixed", () => {
  const healthy: Health = { stuck: 0, oldest_min: null, worker_seen_min: 0, failed_30m: 0 };
  assertEquals(message([{ kind: "queue_stuck", state: "resolved" }, { kind: "worker_silent", state: "resolved" }], healthy), {
    title: "Catchline recovered",
    body: "recovered: queue moving, worker back",
  });
  assertEquals(message([...open("failures"), { kind: "worker_silent", state: "resolved" }], BAD), {
    title: "Catchline alert",
    body: "4 lifts failed in 30 min, recovered: worker back",
  });
});

Deno.test("parseIds trims and drops blanks", () => {
  assertEquals(parseIds(` ${OWNER} , ,b `), [OWNER, "b"]);
  assertEquals(parseIds(undefined), []);
});

Deno.test("jwtRole reads the payload role", () => {
  assertEquals(jwtRole(`Bearer ${jwt({ role: "service_role" })}`), "service_role");
  assertEquals(jwtRole(`Bearer ${jwt({ role: "authenticated" })}`), "authenticated");
  assertEquals(jwtRole("Bearer sb_secret_abc"), null);
  assertEquals(jwtRole(""), null);
});

Deno.test("403 for a user JWT, 405 for GET", async () => {
  const { deps: d, sent } = deps();
  assertEquals((await handle(post({ changes: open("queue_stuck"), health: BAD }, "authenticated"), d)).status, 403);
  assertEquals((await handle(new Request("http://x", { method: "GET" }), d)).status, 405);
  assertEquals(sent, []);
});

Deno.test("pushes the owner's token with the composed message", async () => {
  const { deps: d, sent, asked } = deps();
  const res = await handle(post({ changes: open("queue_stuck", "worker_silent"), health: BAD }), d);
  assertEquals(res.status, 200);
  assertEquals(asked, [[OWNER]]);
  assertEquals(sent, [[{
    to: "ExponentPushToken[owner]",
    title: "Catchline alert",
    body: "3 lifts waiting over 5 min, worker last seen 12 min ago",
    sound: "default",
    data: { ops: true },
  }]]);
});

Deno.test("no recipients configured or no push token: nothing sent, 200", async () => {
  const none = deps(["ExponentPushToken[owner]"], []);
  assertEquals(await (await handle(post({ changes: open("failures"), health: BAD }), none.deps)).json(), { sent: 0 });
  assertEquals(none.sent, []);
  const noToken = deps([]);
  assertEquals(await (await handle(post({ changes: open("failures"), health: BAD }), noToken.deps)).json(), { sent: 0 });
  assertEquals(noToken.sent, []);
});
