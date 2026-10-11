# Working on Parallax (Dani's guide)

You don't need to know code to build here. You describe what you want; Claude does the engineering, checks its own work, and shows you the result. This page is everything you need.

## Getting the code (first time on a new Mac only)

If `parallax` is already on the Mac (it is, on Yash's), skip this. Otherwise, one command in Terminal:

```
git clone https://github.com/yash-gadodia/parallax.git
```

The full setup path (installing tools, starting the local backend) is in `docs/DEV_SETUP.md` — but you don't have to follow it yourself. Open the folder, start Claude (below), and say **"set me up from DEV_SETUP"** — it runs the steps and tells you if it needs anything.

Two things worth knowing:

- **Secrets aren't your problem.** The repo is public, so real keys live in a private `.secrets/` folder that Yash AirDrops — you never need to open it, copy from it, or worry about it. If a task turns out to need a key or a paid account, Claude reassigns it to Yash automatically. If you ever *see* something that looks like a real key or password inside a normal file, just tell Yash — quick fix, no drama.
- **The one flag:** if you ever install dependencies yourself, it's `npm install --legacy-peer-deps` (Claude knows this; it's also automatic via the repo's `.npmrc`).

## Starting a session

1. Open the **Terminal** app on the Mac.
2. Type `cd parallax` and press Enter.
3. Type `claude` and press Enter.

That's it — now just talk to it like a (very fast) teammate.

## The golden rule

**Describe the outcome, not the code.** You never need file names, technical words, or the "right" phrasing. Say what you want the app to *feel like* or *do*:

- "Make the streak flame feel more alive."
- "The reveal says 'you matched' — make it say 'same wavelength'."
- "Add a travel-themed drop pack."

If Claude needs a decision from you, it'll ask 2–3 short questions first. Screenshots are gold — drag one into the chat whenever something looks wrong.

## Example prompts (copy, paste, tweak)

- "Change the welcome tagline to 'see each other clearly'."
- "The 'Get started' button feels small — make it bigger with more breathing room."
- "The reveal screen feels cramped compared to the design. Here's a screenshot." *(drag it in)*
- "Write a new pack of daily drops about travel and adventure."
- "Add 5 spicier date-night prompts."
- "Work on the backlog." *(Claude picks the next task on the shared list and builds it)*
- "What did you change today?" *(plain-English summary — or type `/whatschanged`)*
- "Undo that last change."
- "When I tap a prompt on the Today screen, nothing happens. Here's what I see." *(screenshot)*
- "Show me the Today screen in the simulator."
- "The streak number looks wrong after midnight — can you check?"
- "Save this." *(Claude runs all the checks and commits — or type `/checkpoint`)*

Handy shortcuts you can type directly: `/content` (add/edit drop prompts), `/polish` (screenshot-driven UI fixing), `/whatschanged`, `/checkpoint` (check everything + save).

## What Claude does automatically

- **Plans** bigger changes and confirms with you before doing lots of work.
- **Writes and runs tests** so a change doesn't quietly break something else.
- **Verifies before saying "done"** — it runs the app, screenshots it, and shows you.
- **Saves checkpoints** (commit + push) so work is never lost and always undoable.

You never run git, SQL, or build commands. If Claude ever asks you to — tell it to do it itself.

## Seeing your changes

- **On your phone (works on any Mac):** type `npm start`, then scan the QR code that appears using the **Expo Go** app (free on the App Store). Phone and Mac must be on the same Wi-Fi.
- **On the Mac simulator (needs Xcode — the MacBook, not the Mini):** type `npm run dev` in the Terminal (or just tell Claude "open the app"). It health-checks everything and launches the app on the iPhone simulator.
- **No sign-in needed for looks:** without logging in, the app shows demo content — perfect for checking UI and copy. To test the real flow: "I already have an account" → `test@parallax.app` / `parallax123`.

## Your lane vs Yash's lane

The shared to-do list lives in `docs/BACKLOG.md` — every item is tagged with an owner.

- **You (Dani):** product, design, copy, drop content, "how should this feel" decisions. Add ideas in plain words — Claude files them under the right owner.
- **Yash:** accounts, credentials/keys, deploys to the App Store, anything involving money or legal.
- **Claude:** builds. Say "work on the backlog" and it does the next buildable task.

If your request needs something from Yash's lane (a password, a paid account), Claude will build up to that point and flag what's needed — just leave it for him.

## When things look stuck

- Press **Escape** to interrupt Claude mid-task.
- Say **"stop"** — it stops.
- Ask **"where are we?"** — it recaps what it's doing and what's left.
- If it keeps failing at the same thing, say: "Stop and rethink this from scratch."

Nothing you do here can break things permanently — every change is checkpointed and reversible. When in doubt, just ask.
