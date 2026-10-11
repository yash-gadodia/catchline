# Parallax v3 — Claude Design brief

Design the app below. Do not build it. Produce screens I can react to.

## WHAT IT IS

An iOS app for the hour after a fight with your partner. One person, alone. They dump what
happened; the app gives back what is underneath it for them, the specific thing their partner
is probably not wrong about, and one sentence they could actually send.

It is solo-first. A partner never has to install anything. Pairing exists but is never a gate.

## WHO IT IS FOR

Me, my partner, and a few friends who actually fight. Not scale, not revenue, no growth
surfaces. Craft project. Every screen must earn its place; when in doubt, cut it.

## THE PRODUCT IS THREE BEATS. NOTHING ELSE.

1. **Full messy dump in.** No word cap, no 2-sentence limit, no mood-slider-only entry. But
   the prompt is directed, not a blank box — a blank box is the weakest input and turns into a
   venting loop. Ask for the sequence: what they did, what I did, then what. Plus what I wanted
   them to say.
2. **Two things back, never separable:** what is underneath it for me, precise enough to earn
   standing — AND the specific thing my partner is probably not wrong about. There must be no
   path through the app that produces a validation-only answer. If there is one, this is just a
   slower ChatGPT with a login.
3. **One bridge sentence I could send.** Editable. I must touch it before I can copy it — the
   edit is the feature, it is what makes it sound like me and makes me own the concession.
   Copy only. Never a Send button, never one-tap send.

## SCREENS TO DESIGN

**A. First run.** Ends with a real completed reflection on a real past fight ("think of the
last argument you had"), not a demo and not an empty home. Auth comes after the first output,
never before. Pairing appears as one clearly-secondary option; "it's just me for now" is a real
primary button, not a hidden escape hatch.

**B. The write screen.** A scaffold sentence with tappable slots sitting ABOVE one generous
free-text box. Slots fill in ten seconds and are the on-ramp; the box is where specificity comes
from. Submit enables on the first chip — a person must be able to reach an output having typed
nothing, and must be able to type 800 words if that is what they have. Every chip sheet has a
free-text row. Reference: ABY Journal's fill-in-the-blank onboarding.

**C. The waiting screen.** Filled with something, not a spinner.

**D. The result.** Bridge FIRST, at the top, above the reflection. Editable field, Copy button,
no Send. The reflection sits below it, short. One "this isn't right" affordance → single
regenerate.

**E. The record.** At most a decaying pattern label ("this is the third version of the same
fight"). Never a transcript, never a browsable archive of fights — a searchable log of your
arguments is a liability object inside a relationship.

**F. The safety screen.** A full stop, not a footer. Plain sentence of why, one or two real
local routes (Singapore first), one device-safety line. No score, no statistics, no "concerning
dynamics" language, nothing that requires contacting the partner.

## HOW THE OUTPUT MUST READ

The construction that lets it tell me I was out of line without being a verdict:
**name the act, refuse the trait, attribute the distortion to a mechanism every human has, and
apply the identical operation to my partner in the same output.** "He's selfish" becomes "he
made the plan without checking, on a night you'd been counting on" — and the same move run on me
is honest rather than cruel. The act was unfair; the person is not.

The bridge sentence, hard rules:
- **40 words max.** One paragraph. No greeting, no sign-off, no bullets.
- The payload is a **concession, an act of investment, or standing down** — not an apology. An
  apology may ride along in one clause; it is never the whole message.
- Order: acknowledge their side, then mine in I-language, then the specific thing I own, then
  one concrete offer.
- **Never ends on a request for forgiveness or a status check.** No "are we ok?".
- Bans every conditional apology: "I'm sorry you felt", "I'm sorry but", "I'm sorry if",
  "I apologise for my part".

Good: *"I shouldn't have brought your mum into it. That was below the belt and it wasn't about
the dishes. Still annoyed about the dishes, but that bit I take back."*

Good: *"You pick the weekend — I'll stop arguing about it. I'd rather have Saturday with you
than be right about the booking."*

Bad: *"Hey, I've been thinking a lot about what happened earlier and I want to acknowledge that
the way I communicated wasn't fair to you…"*

Bad: *"I'm sorry you felt attacked, but you have to admit you started it."*

## SAFETY — DESIGN FOR TWO TIERS

**Tier 1, hard stop:** physical acts, threats, strangulation, weapons, coerced sex, stalking or
monitoring, financial control, being prevented from leaving, fear of the partner, self-harm,
child safety, a minor with an adult. No analysis, no bridge, no accountability, no partner-side
read. Screen F.

**Tier 2, silent downgrade:** a deliberately over-inclusive screen that never announces itself
and never shows a score. It suppresses the accountability paragraph, the partner-side read and
any demand-style bridge. Uncertainty resolves toward downgrade. Design-wise this means the
result screen must degrade gracefully to bridge-only, and still look finished rather than broken.

**The rule behind it:** if it is not safe to tell someone to reach out, it is not safe to tell
them what they did wrong.

Also always available without any trigger: a help route, a quick exit, no content in
notifications or previews, and a plain line at the point of writing saying this is stored and is
not privileged.

## DO NOT DESIGN ANY OF THIS

- A widget or Live Activity. My partner can see my lock screen; a sentence about our fight must
  never appear there.
- A blocking cool-down that refuses to work for 20 minutes. Keep a cool-down screen, make it
  non-blocking, put "show me now" at full weight.
- A memory or history archive of past fights.
- A 24-hour "did it land?" check-in.
- Any score, rating, percentage, streak, ratio or prognosis about me, my partner or the
  relationship.
- A chat interface. A content library. Daily prompts or habit mechanics. Credibility theatre
  (logos, cited studies, "clinically backed").
- Any clinical label applied to either person.

## VISUAL LANGUAGE

Match the existing app: soft dawn gradients, generous whitespace, a serif display face against
a clean UI sans, lilac/peach accents, large rounded cards, minimal chrome. Warm and quiet, never
clinical and never cute. This is used by someone upset at 11pm — low contrast anxiety, nothing
jumpy, nothing celebratory.

## WHAT I WANT BACK

Screens for A–F, mobile. Show the write screen and the result screen in more than one direction
so I can choose. Show the result screen in both its full state and its Tier-2 downgraded state.
