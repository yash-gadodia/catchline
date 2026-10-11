# Secrets & credentials (public repo — handle by default)

This repo is **PUBLIC / open source**. Any credential the agent receives (key files, tokens, passwords, `.p8`/`.pem`/`.env` values) MUST be handled with this discipline **automatically — without being asked**.

## The local store: `.secrets/` (gitignored)

- All real secret **files** + **values** live in `.secrets/` at repo root. It is gitignored (verify: `git check-ignore .secrets/<file>`). Never commit it.
- When the user hands you a downloaded key (e.g. `~/Downloads/AuthKey_*.p8`), **move it into `.secrets/`** (organized: `.secrets/apple/`, `.secrets/appstore/`, …), `chmod 600`, and **remove the Downloads copy** so the secret isn't left loose.
- Keep `.secrets/KEYS.md` as the **value index** — every ID/Key ID/Issuer ID/ref/token, with a pointer to its file. Read values *from these files at runtime* (`TOKEN=$(cat .secrets/<f>)`); never inline a secret value into a command the user will see committed, into a tracked file, or into chat output that gets logged.

## The public map: `docs/archive/parallax/CREDENTIALS.md`

- The tracked doc is a **map, never the values** — it says *what* each secret is and *where it lives* (`.secrets/` + 1Password + the dashboard). If a value ever lands in a tracked file, remove it and **rotate** the secret.

## Enforcement (already wired) + reuse

- A PreToolUse hook blocks `Write`/`Edit` to `*.env|*.pem|*.key|*.p8|*.p12|*.pfx|*/credentials*|…`. Don't try to write secrets to tracked paths — store them in `.secrets/` via the store above.
- Reusable setup runbook (Apple/EAS/Supabase credential steps, with gotchas) lives in `docs/archive/parallax/APP_DEPLOYMENT.md`. Extend it when a new credential flow is learned — don't relearn it next time.

## What is NOT automatable

Credential *creation* (Apple Developer portal keys/identifiers, App Store Connect app record + API key, Supabase/Expo dashboard toggles) is manual human-in-browser work — guide the user step-by-step; it can't be hooked. The agent's job is to **handle, store, and wire** what the user generates, by default.
