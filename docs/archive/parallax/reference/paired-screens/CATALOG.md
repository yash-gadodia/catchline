# Paired app — screen-by-screen catalog

Source: 99-second screen recording of Paired (iOS), 1 frame/sec → `f001.jpg`–`f099.jpg` in this directory. Recorded 2026-07-01. Logged-in user "Danielle (D)", partner "yash". Use this catalog instead of re-reading the frames.

---

## Part 1 — frames f001–f050

## f001–f002 — Home tab (default state)
- **Header:** Large title "Home". Top-right pill: flame/fire icon + "1" → **streak counter (1-day streak)**.
- **Stories row** (Instagram-style circles at top):
  - Card 1: purple paper-plane illustration with "+" badge → "add/send a story" affordance.
  - Card 2: yellow angry-emoji story tile with red ring + red unread dot, small avatar of yash overlaid → **unviewed partner story** (yash sent a "mood" story). Red ring = unseen, mirrors IG story convention.
- **Promo banner:** pink card, "-50%" heart-balloon art, green "TODAY ONLY" pill tag, copy **"Get 50% off Premium"**, chevron ">" → discount-urgency paywall entry point pinned high on Home.
- **Section: "Daily Activities"** — vertical checklist with green progress rail + green check circles on the left of each card (all 3 checked = completed):
  1. Card tagged **"Question"** (purple): "What do you remember about the first time you met?" — illustration of couple; two mini-avatars bottom-right ("D" + yash's photo) each with green check = **both partners answered** (partner-presence/completion indicator).
  2. Card tagged **"Quiz"** (peach): "Relationship Checkup" — heart+checkmarks art; single "D" avatar with green check (only Danielle answered; waiting on partner).
  3. Card tagged **"Game"** (olive/green): "You or Me? Character Traits" — palette + "?" art; "D" avatar with green check.
- Below list: large green check-circle (session complete marker, partially cut off).
- **Bottom tab bar (5 tabs):** **Home** (house, active/purple) · **Explore** (magnifier) · **Discuss** (speech bubbles) · **Timeline** (calendar) · **Us** (two hearts).

## f003 — "Introducing Stories" intro bottom sheet
- Triggered by tapping the story composer. Modal bottom sheet over dimmed Home; "X" close.
- Illustration: story cards with heart, smiley moods, partner avatars.
- **Headline:** "Introducing Stories"
- **Body copy:** "Show yash you're thinking of them by sending them a story to brighten their day." / "Stories expire after 24 hours and you can send as many as you want!"
- **CTA (full-width purple):** "Send yash a story"
- Patterns: feature-announcement sheet, ephemerality (24h expiry), partner-name personalization, unlimited free usage stated explicitly.

## f004–f005 — Story type picker bottom sheet
- Bottom sheet: header microcopy "Show yash you're thinking of them" + "X" close.
- Two option cards: **"Send Note"** (note + pen illustration) and **"Send Mood"** (yellow smiley faces illustration).
- So Stories = 2 content types: Notes (text on decorated sticky note) and Moods (selfie + emotion).

## f006–f012 — Note template picker ("Pick a template to start")
- Full-screen, "X" top-right. Headline: **"Pick a template to start"**.
- 6 sticky-note template cards (2×3 grid), each color-themed with sticker decorations (gift, hearts, moon, rose, lips-envelope, flower, crying-laughing emoji):
  - "Blank" (peach)
  - "Thank you for…" (purple)
  - "I love you because…" (rose/red)
  - "One thing I need from you is…" (peach)
  - "I'm thinking of you because…" (olive)
  - "I'm sorry for…" (lilac)
- Pattern: sentence-stem prompts to lower the effort of expressing affection (guided vulnerability).

## f013 — Note composer (empty, "Thank you for…" template)
- Back chevron top-left. Chosen template rendered large: sticker-decorated purple sticky note, prompt "Thank you for…", placeholder **"Write here"**.
- 3 round tool buttons under the note: paint-bucket (background/color), pencil (edit text), flower/sticker (decorations).
- Large round **send button** (paper plane) at bottom — disabled/greyed while empty.

## f014–f016 — Note composer, typing
- f014: text field focused, iOS keyboard up, iOS Paste/AutoFill bubble visible, QuickType suggestions.
- f015: typed "Buying fi" (in progress). f016: **"Buying dinner"** complete, keyboard still up.

## f017 — Note composer, ready to send
- Keyboard dismissed; note reads "Thank you for… / Buying dinner"; send button now **enabled solid purple** (state change on valid content).

## f018 — Send confirmation
- Purple full-width toast/banner from top: **"(i) Note sent to yash!"**
- Send button shows loading spinner (greyed). Pattern: optimistic send + explicit named-partner confirmation toast.

## f019–f020 — Home after sending (toast persists)
- Back on Home with toast still showing "Note sent to yash!".
- **Stories row updated to 3 tiles:** composer (+), **own sent note story** (gift/note thumbnail with "D" badge, no red ring = own/seen), yash's angry-mood story (still red-ringed unread).

## f021–f024 — Home (toast dismissed)
- Identical to f001 but with the 3-tile stories row. Static frames (user idle). Streak pill "1" still visible.

## f025 — Story viewer: own note ("Danielle, 7 seconds ago")
- Full-screen story viewer, **2-segment progress bar** at top (2 stories in the combined couple story tray; first segment filled).
- Byline: "D" avatar, "Danielle", "7 seconds ago".
- Actions top-right: **trash (delete — own story only), download (save image), X (close)**.
- Content: the "Thank you for… Buying dinner" note rendered full screen.
- Bottom bar: emoji-reaction button (smiley+) bottom-left; left/right chevron paging buttons bottom-right. Reactions on stories.

## f026–f027 — Story viewer: partner's Mood story ("yash, 3 minutes ago")
- Second segment of progress bar active. Byline: yash avatar/photo, "3 minutes ago".
- Actions: download + X (**no trash** on partner's story — permission asymmetry).
- Content: yash's **selfie photo in a circular frame** with angry-emoji badge, prompt text **"I'm feeling…" / "Angry"**, and a quoted free-text caption bubble: **"@ u"**.
- **CTA: purple "Reply" button** (paper-plane icon) → replies deep-link to chat.
- Pattern: Mood = selfie + labeled emotion + caption; emotional broadcasting to partner with 1-tap reply loop.

## f028–f029 — Home again
- Stories row: yash's mood tile red ring/dot now **cleared** (viewed state). Otherwise identical Home.

## f030–f031 — Story viewer reopened: own note ("12 seconds ago")
- Same note story re-viewed; f030 captures the **card tilt/entry animation** mid-transition, f031 settled. Animated story transitions.

## f032–f033 — Story viewer: yash's mood story (revisit)
- Same as f026; f033 shows vertical slide transition between stories.

## f034–f035 — Home (static)
- Identical to f028. User idle before scrolling.

## f036 — Home scrolled to bottom + first-session milestone
- Collapsed nav header: centered "Home" + streak flame icon.
- Daily Activities list (all 3 checked) + big green check, then:
- **Milestone copy:** "**You've completed your first Paired session!**"
- Subcopy: "Come back tomorrow for a free daily activity, or try a 7-day free trial of Premium to unlock all activities in Paired."
- **CTA (full-width purple, crown icon): "Try Paired Premium"**
- Patterns: session-complete celebration → immediate upsell; free tier = 1 free daily activity/day; Premium = unlock all activities; 7-day free trial framing.

## f037 — Explore tab (top)
- Large title "Explore", search icon top-right.
- **Category story-circles row:** Questions · Games · Packs · Journeys · Quizzes · (one more cut off).
- **Merch/upsell card: "Take it offline"** — "Expert-designed to transform your relationship"; artwork of 3 printable workbooks: **"The Marriage Blueprint", "The Pleasure Playbook", "The Busy Parents' Connection Plan"**; footer "**Workbooks: Print or download** — From S$ 14.98" → one-off digital-product monetization (localized SGD pricing).
- **Section "Activities by area"** begins: "Communication" card, "Conflict" card peeking.

## f038, f045 — Explore tab: Activities by area
- Area cards (title + one-line description + illustration):
  - **Communication** — "Improve communication with your partner"
  - **Conflict** — "Learn the secrets of managing conflict"
  - **Sex & Intimacy** — "Make your sex life more fulfilling" (chili-peppers art)
  - **LGBTQ+** — "Discover specific LGBTQ+ activities" (progress-pride flag)
  - **Connection** — "Solidify connection between you"
  - **Money & Finances** — "Deal better with financial situations"
  - **Fun & Excitement** — "Enhance excitement and adventure"
  - **Home & Work** — "Balance home and work life"
  - **Family & Friends** — "Develop your support network of family and friends"
- **Personalized section: "For you and yash"** — two recommendation cards: **"Committed Relationships"** and **"Living Apart Together"** (driven by onboarding answers).

## f046 — Explore tab (bottom): Paired experts
- Section **"Paired experts"** with "See all" link.
- Horizontal expert carousel: **Aly Bullock — Relationship Therapist**; **Anjula Mutanda — President at UK's leading relationship charity Relate**; **Jessica L. Griffin, Psy.D.** — credibility/authority surface.

## f047 — Paired experts list (See all)
- 2-column grid: Aly Bullock, Anjula Mutanda, Jessica L. Griffin Psy.D., **Dr. Pepper Schwartz** (Professor, University of Washington), **Dr. Marisa T. Cohen** (Relationship Scientist and Coach), **Dr. Jacqui Gabb** (Professor Emerit, The Open University), +2 more rows partially visible.

## f048 — Expert detail: Aly Bullock
- Purple header: photo, name, subtitle "Relationship Therapist", link "**See expert info**".
- **Filter tabs: All / Unanswered / Answered** (content-completion filtering).
- Expert's content list — all items tagged **"Pack"**, all bearing a **purple crown badge = Premium-locked**: "Being Silly Together", "Foreplay Beyond the B…", "What's in Your Heart?…", "The Happy Memories…".
- Pattern: expert-authored question packs as premium content; crown = paywall lock marker.

## f049–f050 — Expert detail, "Unanswered" tab (loading)
- Loading spinner in empty content area (both frames mid-load).

## f039 — Discuss tab
- Large title "Discuss"; top-right pill: bookmark icon + "1" (1 saved item).
- **Filter chips:** "All" (cut off) · "Your turn" · "Unread" · "Chat" · **"yash's turn"** (selected, purple) — turn-based async model made explicit in navigation.
- List under "yash's turn" (items where partner owes an answer):
  - **Game · "You or Me? Character Traits"** — "You answered this game" — 18:53 — "D" avatar with green check.
  - **Quiz · "Relationship Checkup"** — "You answered this quiz" — 18:51 — "D" avatar with green check.
- Pattern: Discuss = inbox of activities/conversations; answers hidden until both respond (turn mechanic); also houses a freeform "Chat".

## f040 — Timeline tab (initial)
- Dismissible suggestion card ("X"): **"A hot date with yash"**, link "**Add a memory**".
- Year header "2023"; memory card: **"+ Add photos"** button, date badge "1 May" + label **"Became a couple"** (relationship milestone from onboarding).
- Purple **FAB "+"** bottom-right (add memory/milestone).

## f041 — Timeline tab (auto-logged entry)
- New year group "2026": entry dated **"29 Jun"** (red dot = new) — question **"What do you remember about the first time you met?"** with Danielle's answer rendered as a chat bubble from "D".
- Pattern: answered daily questions are auto-archived into a scrapbook timeline (long-term retention/memory vault).
- **Timeline tab icon shows red badge "1"** in tab bar (new content indicator).

## f042–f044 — Home, bottom (static)
- Same as f036 (milestone + "Try Paired Premium" CTA) with Timeline tab badge "1" visible.

---

## Part 1 — IA + monetization observations

**Tab structure (5 tabs):**
1. **Home** — daily loop hub: streak counter, Stories (couple's ephemeral notes/moods), premium promo banner, Daily Activities checklist (Question + Quiz + Game per day), session-complete milestone + upsell.
2. **Explore** — content library: category circles (Questions, Games, Packs, Journeys, Quizzes, …), "Take it offline" paid workbooks, "Activities by area" (9 areas), personalized "For you and yash" recommendations, Paired experts directory → expert-authored premium packs.
3. **Discuss** — async inbox/turn tracker with filters (Your turn / Unread / Chat / partner's turn); doubles as chat entry.
4. **Timeline** — couple scrapbook: milestones, auto-logged daily-question answers, photo attachment, date suggestions, add-memory FAB.
5. **Us** — (see Part 2).

**Core engagement loops:**
- Daily Activities: exactly 3 items/day with green progress rail + checkmarks; free tier limited to "a free daily activity" per day.
- Streak (flame + count) top-right of Home.
- Turn-based reveal: per-activity partner avatars with green checks; Discuss filters by whose turn it is — strong reciprocity/nudge mechanic.
- Stories: ephemeral (24h), unlimited, two formats (Note templates with sentence stems; Mood = selfie + emotion + caption), IG-style unread rings, reactions, Reply CTA, delete-own/download, animated transitions.
- Auto-archiving answers to Timeline creates a sunk-value vault (retention moat).
- Partner-name personalization everywhere ("Send yash a story", "For you and yash", "Note sent to yash!").

**Monetization surfaces (4 distinct in Part 1):**
1. **Home banner:** "Get 50% off Premium" + "TODAY ONLY" urgency tag, pinned near top of Home.
2. **Post-session upsell:** "You've completed your first Paired session!" → "7-day free trial of Premium to unlock all activities" → crown-icon "Try Paired Premium" CTA (moment-of-delight placement).
3. **Locked content markers:** crown badges on all expert packs = freemium content gating.
4. **One-off digital products:** "Take it offline" printable workbooks, "Print or download — From S$ 14.98" (SGD-localized) — non-subscription revenue line.

**Design language:** rounded cards, pastel purple/peach/olive palette, hand-drawn sticker illustrations, large friendly headlines, green = done, red dot = new/unread, crown = premium, flame = streak, bottom sheets for feature intros and pickers, toast confirmations naming the partner, expert credibility section for trust.

---

## Part 2 — frames f051–f099

## f051 — Expert profile: Aly Bullock (content pack list)
- Light-purple header: back chevron, "**Aly Bullock**", subtitle "Relationship Therapist", link "**See expert info**", headshot.
- Segmented filter tabs: `All | Unanswered | Answered` — "Unanswered" selected.
- Pack list, each row = stacked-card thumbnail + purple crown badge (premium) + "Pack" chip + title: "Being Silly Together", "Foreplay Beyond the B…", "What's in Your Heart?…", "The Happy Memories…".
- Every pack crown-badged → expert packs are premium-gated. Answered/unanswered filter = progress tracking on content. Expert-as-brand surface.

## f052, f057, f061 — "Paired experts" directory
- 2-column grid, circular photos on lilac discs, name + credential: Aly Bullock (Relationship Therapist), Anjula Mutanda (President at UK's leading relationship charity Relate), Jessica L. Griffin Psy.D. (Relationship and Parenting Expert), Dr. Pepper Schwartz (Professor at the University of Washington), Dr. Marisa T. Cohen (Relationship Scientist and Coach), Dr. Jacqui Gabb (Professor Emerita, The Open University), +2 below fold.
- Credential-heavy directory = trust/authority play.

## f053–f054 — "Committed Relationships" collection screen
- Peach header: title "**Committed Relationships**", subcopy "**Our top picks for you and your partner because you told us you're in a committed relationship**" (onboarding-answer-driven personalization), padlock-heart illustration.
- Tabs `All | Unanswered | Answered`. Question list, each crown-badged + "Question" chip; titles personalized with partner name ("What can you and yas…", "How do you feel about…", "What's one thing you d…", "What type of physical…").

## f055–f056 — Explore tab home (lower sections)
- Topic cards: "Balance home and work life", "Family & Friends".
- Section "**For you and yash**": "Committed Relationships — Activities to strengthen your bond", "Living Apart Together — Activities to navigate living apart".
- Section "Paired experts" + "See all" → expert directory.

## f058–f059 — Timeline tab
- Dismissible prompt card: "**A hot date with yash**", link "**Add a memory**".
- 2026 group: Daily-Question answer saved as memory (chat bubble from "D", date chip "29 Jun" with red dot). 2023 group: "**Became a couple**" milestone card with "+ Add photos".
- Purple "+" FAB. Red-dot badging for unseen items.

## f060 — Partner-activity toast
- Full-width purple banner over current screen: ⓘ "**yash answered a quiz!**" — real-time partner-presence notification. Discuss + Timeline tabs gain red "1" badges.
- This is the core duet loop: partner acts → you're notified → you reciprocate.

## f062–f063 — Quiz results: "Relationship Checkup" (gauges animating)
- Modal sheet. Top-right: bookmark (save), share (export), X.
- "Quiz" chip, title "**Relationship Checkup**".
- "**Your results**": "This represents how satisfied you are in your relationship at present."
- **Two circular gauge meters side by side** — purple heart gauge = Danielle, coral heart gauge = yash — arcs animate filling in (partner satisfaction comparison).
- "**Your answers**": "Strength areas are highlighted in green, while growth areas are highlighted in red."
- **Persistent bottom chat input:** "Send a chat message" (activity-scoped chat).

## f064–f081 — Relationship Checkup: answers list (9 statements)
Each answer card: numbered statement + pencil edit icon + **two heart toggles** (purple = self, coral = partner) encoding each partner's response. Red "**Growth area**" pill + red outline where both dissatisfied. Partner free-text comment bubbles attach to specific answers.
Statements: (1) balance home/work life, (2) family & friends relationships — comment "He's not family oriented", (3) **[Growth area]** communication — comment "Can be improved", (4) discuss and resolve conflict, (5) fun and adventures — comment "Sometimes he's more spontaneous than me", (6) purpose and meaning, (7) **[Growth area]** money and finances, (8) discussing sexual life, (9) emotional connection.
- Therapeutic tone: "Growth area", not "problem". Edit-answer affordance keeps data current.

## f082–f085 — Checkup results: completion footer
- Green check circle + "**Great work, both of you!**"
- **Micro-feedback widget:** "**Did this activity bring you closer together?**" — thumbs-down / thumbs-up / double-thumbs-up (3-point scale; feeds their "brings couples closer" metric).
- "Chat" divider + empty state: "**Keep the conversation going by sending a message to yash**".

## f086–f099 — Composing + sending activity chat message
- iOS keyboard, typing "I would appreciate notes", autocorrect visible.
- Sent message = right-aligned purple bubble with **sparkle/burst send animation**; message lives inline under the quiz result — the activity becomes a shared discussion object.

---

## Part 2 — IA + monetization observations

**Content object model:** Expert → Pack → Question/Quiz. Quizzes produce dual-partner results with gauges, per-question diffs, growth-area flags, partner comments, feedback widget, and an attached chat thread. Answers feed the Timeline.

**Partner-presence / duet mechanics (the retention engine):**
- In-app toast "yash answered a quiz!" + tab badges → immediate reciprocity pull.
- Both-answer-to-reveal comparison (side-by-side gauges, purple vs coral hearts per question).
- Partner free-text comments on answers; post-activity "Did this bring you closer?" rating; "Keep the conversation going" — every surface funnels toward partner interaction.
- Personalization constantly names the partner.

**Monetization:** crown badges on every expert pack + collection question (pervasive premium gating of the content library); expert credibility is the value justification. Free tier appears to include Relationship Checkup, Timeline, chat. No pricing screen appears in this slice.

**Design system:** purple primary + peach/coral secondary; **partner color-coding (purple = self, coral = partner) used consistently**; pill chips ("Pack", "Question", "Growth area"); celebration microcopy ("Great work, both of you!"); red-dot badging for partner activity; animated gauge fills; sparkle send animation.
