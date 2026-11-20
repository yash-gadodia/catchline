// The two emails, as pure functions (tested in handler_test.ts). Plain text, the owner's own voice, no tracking.

export type Due = { user_id: string; email: string; display_name: string | null; kind: "welcome" | "first_lift" | "subscribed" | "nudge" | "goodbye"; founding: boolean };
export type Mail = { to: string; subject: string; body: string };

// "Selene Say" greets as "Selene". One word, three or more words, or no name: no name is used, because which part is
// the given name is a guess (a wrong name is worse than none).
export function greeting(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length === 2 ? `Hi ${parts[0]},` : "Hi,";
}

const ABOUT = "I lift too (weightlifting and CrossFit, in Singapore) and made it because I was tired of squinting at replays of my own lifts.";
const REPLY = "This email is automated, but I read every reply and I will answer yours.";
// The owner's own contact, at his request (20 Nov 2026): faster than email for most lifters in Singapore.
const REACH = "If a message is easier than email, I'm on WhatsApp at +65 8139 4225 (wa.me/6581394225).";

export function mailFor(d: Due): Mail {
  if (d.kind === "welcome") {
    return {
      to: d.email,
      subject: "you just joined Catchline",
      body: [greeting(d.display_name), "Yash here. I built Catchline.", ABOUT, REPLY,
        "One ask: once you've tracked a lift, tell me what looked wrong or what's missing. Even one line helps.", REACH, "Yash"].join("\n\n"),
    };
  }
  if (d.kind === "nudge") {
    return {
      to: d.email,
      subject: "still lifting?",
      body: [greeting(d.display_name), "Yash here, from Catchline.",
        "You haven't tracked a lift in a week. No pressure, just checking in: did something get in the way, or did it not do what you hoped?",
        "If you tell me, I can fix it. And if you've just been busy, any lift filmed from the side works whenever you're back.",
        REPLY, REACH, "Yash"].join("\n\n"),
    };
  }
  if (d.kind === "goodbye") {
    return {
      to: d.email,
      subject: "last one from me",
      body: [greeting(d.display_name), "Yash here, from Catchline.",
        "It's been a couple of weeks since you tracked a lift, so this is my last email. You won't hear from me again.",
        "Thank you for trying it. It means a lot that you gave it a go.",
        "If you ever feel like telling me why it didn't stick, I'd still love to know. And the app is there whenever you want it.",
        "Yash"].join("\n\n"),
    };
  }
  if (d.kind === "subscribed") {
    return {
      to: d.email,
      subject: "thank you",
      body: [greeting(d.display_name), "Yash here. I built Catchline.",
        d.founding ? "You just became a founding member. Thank you." : "You just went Pro. Thank you.",
        "I'm one person building this, so every lifter who backs it means a lot to me. It's what lets me keep working on it.",
        "If anything ever breaks, or there's something you want added, reply here and tell me.",
        REPLY, REACH, "Yash"].join("\n\n"),
    };
  }
  const about = d.founding ? `${ABOUT} Thank you for backing it early as a founding member, it means a lot.` : ABOUT;
  return {
    to: d.email,
    subject: "how was your first lift on Catchline?",
    body: [greeting(d.display_name), "Yash here. I built Catchline.", about,
      "You've tracked your first lift. How did it go?",
      "Be honest: what worked, what was confusing, what's missing. One line is plenty.",
      REPLY, REACH, "Yash"].join("\n\n"),
  };
}

// Apple's "hide my email" addresses only accept mail from a sender registered with Apple: held back until that is done.
export function sendable(d: Due, opts: { relayOk: boolean; exclude: string[] }): boolean {
  const email = d.email.toLowerCase();
  if (opts.exclude.includes(email)) return false;
  return opts.relayOk || !email.endsWith("@privaterelay.appleid.com");
}
