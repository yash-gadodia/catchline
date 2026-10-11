# Parallax — PRD, solo rebuild ("One Side")

Status: DRAFT v2 for Yash
Date: 2026-09-16
Supersedes: PRD-solo v1 (2026-09-16), which this corrects in three places

---

## 0. What changed from v1, and why

Three things in the first draft were wrong. Research after it was written contradicted them:

| v1 said | Corrected to | Because |
|---|---|---|
| Scaffold chips **above** the text box | Prose is **primary**; chips become sentence stems on the **keyboard accessory bar** | Chips feed a model that reads prose far better than any taxonomy, and the concession cannot be specific without prose. Chips are a speed affordance for starting, not an information channel. |
| 30-day deletion as a **principle** and a positioning claim | Purge locally because it is cheap; **do not build positioning on it** | Not one person in the demand corpus asks for expiry. It is aimed at an objection it does not answer — the provider saw the text on day zero — and the one place users do speak about their own archive, they want it kept. |
| "Submittable from one chip" as a headline feature | **Resolved via voice**, not chips | Three words cannot produce a specific steelman. "Submit from one chip" and "the concession must quote a concrete detail" cannot both be true. |

## 1. The honest framing

> There is no defensible **product** opportunity here. There is a real **personal tool** opportunity. These are different things and the plan must not conflate them.

The interpretation is commodity — same model, same words, and people have already hand-written prompts that do (a) and (b). A saved prompt plus Apple Notes reproduces most of it in four minutes.

**The part it cannot reproduce is not what earlier research claimed.** It is not prompt discipline and it is not the edit gate. It is two things:

**1. Being the right place to be at 11pm.** Opening a general chatbot means arriving at a blank cursor in the same app you used for a work bug, and composing a paragraph at the moment of lowest composure. Time-to-output under duress is a real axis, and it is **entirely UI**.

**2. Lowering the shame of asking.** There is a felt difference between *"I am a person who types my partner's behaviour into ChatGPT"* and *"I opened the thing that is for this."* A purpose-built surface grants permission. This was named in none of the five research rounds and is more likely than anything else to be what makes the app get opened.

Everything in this document should be judged against those two, not against feature parity with anything.

## 2. Audience ladder

1. **Yash**, repeatedly and unprompted, over weeks
2. **Dani**
3. **Three to five friends**, screened for having had a fight in the last month
4. **Real users** — only if 1–3 hold, and the answer may still be no

Nothing here optimises for rung 4.

## 3. Product: "One Side"

One person logs a friction moment. The app returns, inseparably:

- **(a)** what is underneath it for you
- **(b)** the specific thing your partner is probably not wrong about
- **(c)** a **bridge** — one sentence under 40 words you could send

The partner never has an account, never gets a link, never sees a screen. The bridge is the only thing that leaves, and it leaves because you copied it.

### Non-obvious requirement: "there is no bridge here"

The trigger is widened from fights to **friction** — flat tones, the thing you let go. For a large share of those the correct output is **deflationary**, and forcing a bridge would manufacture a conflict out of a bad mood.

**"There is no bridge here" must be a first-class, designed output**, not a failure case. It says what it noticed, says the honest thing is to let it go, and offers nothing to send. The success test must not punish it.

## 4. Screens — the whole app

Six, and fewer would be better.

**1 · Capture** — the launch screen. No onboarding, no account, no tour. Keyboard raised on open.
- A large free-text box, **primary**. Prose is what the model needs.
- **Mic button** dumping an on-device transcript into the same box. Speech is roughly 3× faster than thumb-typing, survives being upset, and is the only thing that produces enough material for a specific (b). No emotion-capture app opens on the mic.
- **Sentence stems on the keyboard accessory bar**, not chips above the box: *"She said…"*, *"I let it go when…"*, *"The second time I…"*, *"I felt like the one who…"*. Tapping appends the stem and hands you the first four words.
- An inline **`+`** for a friction type not in the list — it becomes a text field in the same row.
- Submit live from the first keystroke or stem. A named second button, **"Just save"**, which writes locally and makes no model call. Naming it is what gives permission.
- **Chat import — paste or screenshot (decided 2026-09-16).** Fights happen on WhatsApp/Telegram; the transcript is the strongest fix for the least-evidenced assumption (§8.3 — a specific (b) from one short account). Two routes only: pasted text (WhatsApp multi-copy `[time, date] Name:` lines auto-parsed into a who-said-what quote block, partner lines violet-marked, removable) and an attached screenshot (sent to the model as an image — vision reads it; no OCR module, no new build). Explicitly NOT: direct WhatsApp pull (no API exists) or Telegram TDLib login (whole-account access, out of proportion). The quote is evidence inside the user's account, always user-selected, never a whole history. A one-line consent note appears only when a chat is attached ("Their words go with yours when you tap Read it"). Safety screening runs on the transcript too — a selected excerpt sharpens the DARVO risk, it does not soften it.
- One quiet line about where the words go.

**2 · Working / Retry** — **built first.** The raw entry is written to local storage *before* the call. On failure the text is still on screen with one Retry. Streaming, not a spinner.

**3 · Result** — the bridge first, at the top, editable, `Copy` only. (a) and (b) below it, short. One "this isn't right" → single regenerate. Or the no-bridge variant.

**4 · Receipts** — a minimal list of what was logged and, of the bridges, which were actually sent. This exists to run the test in §6, not as a feature.

**5 · Safety stop** — Tier 1 full stop: a plain sentence, verified local routes, a device-safety line, delete-what-I-wrote.

**6 · Settings** — notifications off by default, delete everything, subscription.

## 5. Quality bar

**Construction:** name the act, refuse the trait, attribute the distortion to a mechanism every human has, and run the identical operation on both people. *"He is selfish"* becomes *"he made the plan without checking, on a night you had been counting on"* — and the same move applied to the user is honest rather than cruel.

**The bridge:** 40 words max, one paragraph, no greeting or sign-off. The payload is a concession, an act of investment, or standing down — not an apology. Order: their side, then yours in I-language, then the thing you own, then one concrete offer. Never ends on *"are we ok?"*. Bans every conditional apology.

**Never:** a prognosis, score, ratio, percentage, or a clinical label on either person.

**Singapore:** money to parents is a legal duty, not a boundary failure; a BTO flat is a dated deadline, not a metaphor; NS is a compulsory separation; "counselling" points at pre-divorce-filing programmes and must never be suggested.

## 6. Safety

From one written account this **cannot** reliably distinguish coercive control from ordinary conflict. DARVO is optimised against exactly this reader: an offender's account reads reasonable, a victim's reads disproportionate. So the feature that names your contribution would, pointed at someone being controlled, tell them they were wrong.

- **Tier 1, hard stop** — violence, threats, coercion, stalking, financial control, fear of the partner, self-harm, child safety, a minor with an adult.
- **Tier 2, silent downgrade** — over-inclusive, never announced, never scored. Suppresses the accountability paragraph, the partner-side read, and any demand bridge. Uncertainty resolves toward downgrade.

**Governing rule: if it is not safe to tell someone to reach out, it is not safe to tell them what they did wrong.**

Highest-harm sentence to suppress: *"your reaction probably looked disproportionate to him."*

## 7. The test, and the stop condition

### The paired-run test

Over the next **five real frictions**, at each one do both:
1. Open the app and complete the loop.
2. Within the same hour, paste the same account into a fresh chat with the best prompt Yash can write himself.

One week later, blind: strip the formatting off all ten outputs, shuffle, read cold. For each (b), mark whether it names something he would not have said in advance. From Receipts, note which bridges were actually **sent**.

**Pre-register in a sealed note before the first commit**, so they cannot move:
- the three recurring fights he believes they have
- the pass condition, in his own handwriting

### Pass
At least 3 frictions worth logging occurred · at least 2 bridges **sent** · the app's output beat his cold prompt on more than half the blind reads.

### Stop building if any of these
- **Fewer than 3 loggable frictions in three weeks.** The trigger is a fantasy. The rescue for this is never a reminder — one comparable app's reminder-driven retention went 206 → 133 → 72 → 7.
- **Zero bridges sent.** Copied-but-not-sent is a fail.
- **He cannot pick the app's output above his own cold prompt.** Then it is a wrapper and the honest move is a saved prompt.
- **The most honest sentence at week three is "writing it out helped; I skimmed the output."** Then the value was the writing, and the app is not the thing that did it.

## 8. Untested assumptions

In descending order of how much collapses if wrong:

1. **That Yash will reach for an app at the moment of friction at all.** He has never done this. No evidence anywhere in the research is about him. Everything else sits on this.
2. That frictions worth logging occur at least weekly. Nothing establishes the rate.
3. That a specific, non-generic (b) is reliably producible from one short, one-sided account. **Never demonstrated once, anywhere.**
4. That (b) is welcome when it is right. The only direct evidence points the other way.
5. That anyone sends the bridge.
6. That the edit gate reads as care rather than obstruction. No user has ever asked for it.

## 9. Explicitly not building

**A separate ADHD app (logged 2026-09-16, after Yash's diagnosis).** The market is crowded (Inflow, Tiimo, Numo, Goblin Tools, Flown…) and ADHD users are the highest-churn audience in consumer apps. Two things survive the log: (1) when the prompt is built, add ADHD-aware fight-script framing — time blindness ≠ not caring, forgetting ≠ not loving; RSD moments are already One Side's domain and the "mechanism every human has" construction fits them natively; (2) if the §7 test FAILS, the ADHD space is the sanctioned next place to point this same playbook — one specific moment, self-use first, pre-registered stop conditions, never "an ADHD app" in general. Deep market research on request then, not before.


Partner accounts, invites, links, shared views · streaks, scores, ratings, prognoses · a daily prompt, pulse or reminder · a widget or Live Activity (a partner can see a lock screen) · a browsable archive of named fights · a recurrence engine (12–16 evenings on the least-evidenced gap, and empty for its first 6–10 weeks) · a content library · credibility theatre.

## 10. Build order

> **BUILT 2026-09-16** (v2.1.0, build 19 → TestFlight). All six shipped behind the
> `ONE_SIDE` flag in `src/content/refocus.ts`; the couples flow stays intact behind it.
> Edge fn deployed and verified live on bridge / no-bridge / pasted-chat / Tier-1 paths.
> Calibration bugs found by live testing, not review: role-swapping in the bridge
> (fixed with an in-schema scratchpad + sonnet for the read) and over-deflation
> (decision rule is now a two-part test). Deferred as planned: native mic recogniser
> (keyboard dictation ships first), Tier-2 silent downgrade, memory-informed reads.


1. **Working / Retry** first — everything else depends on not losing what was written
2. Capture: prose-primary, mic, keyboard-bar stems, "Just save"
3. Result, including the no-bridge variant
4. Receipts (for the test)
5. Safety Tier 1 + Tier 2 downgrade
6. Settings

Target: one afternoon plus roughly four evenings. Existing code already has a working capture-to-reflection loop to build on.

## 11. Open

- Pricing (RESOLVED 2026-09-16, see docs/PRICING-NAMING.md): the earlier "comparables at 2–5 months" claim was wrong — the 12-app median break-even is 5.7 months and the AI cohort runs 7–8.5; the anomaly is the cheapest-in-category monthly. Keep the approved ladder (S$6.98 / S$59.98 / S$99.98 lifetime) untouched through the self-test; at first stranger flip in ASC (config only, no binary): monthly → US$6.99/S$9.98, annual unchanged and pre-selected, lifetime pulled (re-list at US$99.99 = 2.5x annual only on super-fan demand). Free tier gates memory/history, never a read count — the 1-read/day meter is dropped (no precedent in 12 comparables; most punitive at 11pm). Plus thesis = "it remembers" (90-day memory-informed reads), pending Yash's confirmation.
- Naming (DECIDED by Yash 2026-09-16): App Store name **"Parallax: After the Fight"** (26/30 chars) — brand kept, the moment in the name itself. Subtitle must now NOT duplicate "fight": use it for the promise instead, e.g. "One sentence worth sending" or "Say it, or let it go" (pick at submission; subtitle keywords shift to argument/say/text since "fight" is already in the name). "One Side" remains the internal codename for the solo product. Known cost: the "Parallax: For Couples" doppelganger stays adjacent in search — icon + subtitle disambiguate. Name/subtitle/description/keywords/screenshots are ALL version-locked — one bundled submission with the pivot binary; only promotional text (170 chars) is editable today.
- Copy gate (decided 2026-09-16): keep gated-on-edit WITH the visible "Use it as is" escape — an unedited send stays one deliberate tap, so the gate can't manufacture a false test fail. Goes in the sealed note.
- Safety screen copy + resource list: approved by Yash 2026-09-16 as designed ("This is bigger than one fight." + SOS/IMH/AWARE/PAVE). IMH 6389 2222 verified by Yash 2026-09-16 — clear to ship on new surfaces; drop the "pending verification" tag from the design file at build time.
- Promotional text set LIVE on the App Store 2026-09-16 (en-GB, verified via ASC API): "Coming next: use it alone. Talk or paste the fight, get back what's underneath it for you, and one sentence worth sending. Nothing leaves unless you send it." (157/170 chars, "coming next" framing because the live 2.0.0 binary lacks talk/paste.)
- The IMH helpline number in the shipped edge function has never been verified against an official source.
- Chat import: whether paste ships in the MVP build or the first follow-up; screenshot needs expo-image-picker (PHPicker, no permission prompt for picking) and a bigger edge-function payload path.
- iOS 27 (2026-09-16 research): no design change needed — refinement release, iOS 26 hardening stands. Dated obligation: from April 2027 all App Store uploads must use the iOS 27 SDK → Expo SDK 56→58 migration (scenes, resizable iPhone) belongs in Q4 2026/Q1 2027. Future differentiator: expo-app-intents (SDK 58) voice capture entry via Siri/Shortcuts. One device test: does Write-with-Siri inject into the capture field, and is writingToolsBehavior reachable from Expo.
- `borderCurve: 'continuous'` is set on zero of 114 rounded corners.
