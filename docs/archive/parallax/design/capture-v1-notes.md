# Capture design — settled state (from revamp/Parallax-Capture.html in Claude Design)

The chosen direction is **A — "Speak first"**, with the round-one amendments already applied
in the design file. This note records the settled spec for reviewers and builders who cannot
open Claude Design.

## Direction A, as settled

Launch screen IS capture. No onboarding, no splash, no account step. Keyboard raised on open.

Layout, top to bottom:
- Brand line ("Parallax", small serif, soft colour).
- Question in display serif: **"What happened?"** with an italic soft second line
  *"Just what's true right now."* Question shrinks (`q.sm`) once text exists.
- **The text box: primary, large (19px/1.5), flex-fills the screen.** Placeholder:
  *"Say it, or type it. Fragments are fine."*
- Privacy line (12px, soft): *"Read once by a model to write the reply, then returned. Not
  privileged the way a doctor or lawyer is. 'Just save' keeps it on this phone only."*
- **Mic: a full-width 64px pill labelled "Speak"** — the primary control, ink-on-paper.
  While listening it becomes a violet-tinted pill with a small waveform and
  **"Listening · tap to stop" — the pill is the ONLY stop**; the system dictation area
  below is passive (greyed waveform, no competing Done affordance).
- Action row: **"Just save"** (ghost, named, writes locally, no model call) beside
  **"Read it"** (primary). Both live from launch; nothing greys out.
- **Keyboard accessory bar: sentence stems**, horizontally scrollable with edge fade —
  "She said…", "I let it go when…", "The second time I…", "I felt like the one who…",
  plus an inline **"+"** that becomes a dashed text field in place ("Type an opener"),
  no modal. A tapped stem stays marked in the bar and is appended into the box on its own
  line, tinted violet so it reads as a hand-off, not a tag.

States shown in the design: empty on launch · mid-dictation · text + stem tapped · "+" open.

## The no-bridge result, as settled

Same shell as the settled Result screen, minus the bridge card and Copy.
- Eyebrow: "Tonight · read once"
- Headline IS the answer, display serif 38px: **"There is no bridge here."**
- Two cards keep the expected structure: *What's underneath, for you* (coral-tinted) and
  *What she's probably not wrong about* (neutral).
- Then in display type: **"The honest thing is to let this one go."** with a soft-italic
  *"Nothing to send."*
- Footer: "Saved on this phone. Not sent anywhere." One button: **Done**.
- Dark variant exists and holds the deflationary tone.

## Notes for the builder

- Corners are squircles (`corner-shape: squircle` in the mock) — in RN this is
  `borderCurve: 'continuous'`, currently used nowhere in the app (114 borderRadius, 0).
- The design supersedes the shipped write step (scaffold slots ABOVE the box, ef72627):
  prose is primary, stems move to the keyboard accessory bar. Part of ef72627 must be
  reworked, not extended.
- One known prototype artifact: A3's phone markup isn't closed before A4's label in the
  HTML — a canvas glitch, not a design decision.
