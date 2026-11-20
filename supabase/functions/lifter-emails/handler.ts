// The two emails, as pure functions (tested in handler_test.ts). Plain text, the owner's own voice, no tracking.

export type Due = { user_id: string; email: string; display_name: string | null; kind: "welcome" | "first_lift"; founding: boolean };
export type Mail = { to: string; subject: string; body: string };

// "Selene Say" greets as "Selene". One word, three or more words, or no name: no name is used, because which part is
// the given name is a guess (a wrong name is worse than none).
export function greeting(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length === 2 ? `Hi ${parts[0]},` : "Hi,";
}

const ABOUT = "I lift too (weightlifting and CrossFit, in Singapore) and made it because I was tired of squinting at replays of my own lifts.";
const REPLY = "This email is automated, but I read every reply and I will answer yours.";

export function mailFor(d: Due): Mail {
  if (d.kind === "welcome") {
    return {
      to: d.email,
      subject: "you just joined Catchline",
      body: [greeting(d.display_name), "Yash here. I built Catchline.", ABOUT, REPLY,
        "One ask: once you've tracked a lift, tell me what looked wrong or what's missing. Even one line helps.", "Yash"].join("\n\n"),
    };
  }
  const about = d.founding ? `${ABOUT} Thank you for backing it early as a founding member, it means a lot.` : ABOUT;
  return {
    to: d.email,
    subject: "how was your first lift on Catchline?",
    body: [greeting(d.display_name), "Yash here. I built Catchline.", about,
      "You've tracked your first lift. How did it go?",
      "Be honest: what worked, what was confusing, what's missing. One line is plenty.",
      REPLY, "Yash"].join("\n\n"),
  };
}

// Apple's "hide my email" addresses only accept mail from a sender registered with Apple: held back until that is done.
export function sendable(d: Due, opts: { relayOk: boolean; exclude: string[] }): boolean {
  const email = d.email.toLowerCase();
  if (opts.exclude.includes(email)) return false;
  return opts.relayOk || !email.endsWith("@privaterelay.appleid.com");
}
