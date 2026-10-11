Three fixes on v4. Everything else in v4 is right — the killed items are gone, the bridge sits above the reflection, the touch-before-copy mechanic works, and the Tier 2 downgrade drops exactly the right sections without announcing itself. Keep all of that.

1. HIDE THE WORD COUNTER.
Remove "39 / 40 words" and "25 / 40" from the result screens. It is the app's own draft, so it isn't scoring the user, but a visible number is adjacent to the scores this product bans and it points at the machine at the moment the sentence should feel like theirs. Either drop it entirely, or show it only once an edit pushes the sentence past 40 words.

2. ADD AN ERROR STATE.
There is no screen for the generation failing or timing out. This is the state a flooded person is least able to absorb, so it needs designing rather than defaulting. Show: what they wrote is safe and still there, one retry as the primary action, and no apology theatre or spinner. It should read as "this is recoverable", not "you lost it".

3. CHECK THE FOUR MINUTES.
Screen A1 promises "About four minutes". That number has to survive real end-to-end latency including both safety passes. Either verify it or soften it to something that cannot be wrong.

Also, one thing to protect rather than change: on the Tier 2 result the output is validation-only, which deliberately breaks the "no validation-only path" rule that governs every other screen. That is correct and intentional — in a suspected-unsafe case, validation-only is the safe output. Do not "fix" it for consistency.
