import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { greeting, mailFor, sendable } from "./handler.ts";

const due = { user_id: "u", email: "a@example.com", display_name: "Selene Say", kind: "first_lift" as const, founding: false };

Deno.test("greets by the first of two names, and by no name when the given name is a guess", () => {
  assertEquals(greeting("Selene Say"), "Hi Selene,");
  assertEquals(greeting("Sim Chin Hin"), "Hi,");
  assertEquals(greeting(null), "Hi,");
});

Deno.test("both emails say a person reads the replies, and carry no em dash", () => {
  for (const kind of ["welcome", "first_lift"] as const) {
    const m = mailFor({ ...due, kind });
    assertStringIncludes(m.body, "I read every reply and I will answer yours");
    assertEquals(/[—―]/.test(m.subject + m.body), false);
  }
});

Deno.test("a founding member is thanked; the welcome asks for one line of feedback", () => {
  assertStringIncludes(mailFor({ ...due, founding: true }).body, "founding member");
  assertStringIncludes(mailFor({ ...due, kind: "welcome" }).body, "Even one line helps");
});

Deno.test("relay addresses wait for the Apple registration; excluded addresses never get mail", () => {
  const relay = { ...due, email: "x@privaterelay.appleid.com" };
  assertEquals(sendable(relay, { relayOk: false, exclude: [] }), false);
  assertEquals(sendable(relay, { relayOk: true, exclude: [] }), true);
  assertEquals(sendable(due, { relayOk: true, exclude: ["a@example.com"] }), false);
});

Deno.test("the thank-you names what they bought and says what it means", () => {
  const pro = mailFor({ ...due, kind: "subscribed" });
  assertEquals(pro.subject, "thank you");
  assertStringIncludes(pro.body, "You just went Pro. Thank you.");
  assertStringIncludes(pro.body, "means a lot to me");
  assertStringIncludes(mailFor({ ...due, kind: "subscribed", founding: true }).body, "founding member");
});
