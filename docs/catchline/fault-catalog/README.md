# Fault catalogue

Researched 18 Oct 2026 (web sources per fault in the JSON). Per fault: phase, what it looks like, causes, whether one side-on phone video can measure it and from which signal, a starting threshold, priority, 5-10 cue phrasings (each with its own sources), why copy and drills.

Most thresholds are heuristic starting points (each marked in the JSON), set from elite reference values with margin for ~5 cm joint and ~10 deg angle error. Tune them against coach-labelled reps before trusting them. A fault only becomes a cue in the app once cv/catchline_cv/rules.py measures it.

| Movement | Faults | Measurable side-on | Cue phrasings | Cues with 2+ sources (URLs) | Well-sourced (2+ independent orgs) |
|---|---|---|---|---|---|
| snatch | 37 | 22 | 348 | 250 | 190 |
| clean | 28 | 21 | 262 | 170 | 136 |
| jerk | 25 | 19 | 239 | 141 | 119 |
| kipping_pull_up | 17 | 9 | 162 | 101 | 83 |
| butterfly_pull_up | 16 | 9 | 138 | 86 | 62 |
| bar_muscle_up | 17 | 13 | 150 | 46 | 40 |
| kipping_hspu | 19 | 9 | 169 | 54 | 41 |
| **Total** | **159** | **102** | **1,468** | **848** | **671** |

"Measurable side-on" counts faults marked `yes` (not `partial`).

## Cue format

Every fault's `cues` is a list of objects:

```json
{"text": "Stay over the bar longer", "sources": ["https://www.catalystathletics.com/...", "https://barbend.com/..."], "evidence": "wording"}
```

- `text`: the phrase, at most 8 words.
- `sources`: URLs where this wording or a close paraphrase appears (up to 4, distinct publishers first). The fault-level `sources` list is kept and includes every URL used by its cues.
- `evidence`:
  - `wording` (1,129 cues): the cue's content words were found together in the text of each listed source, in a passage about that movement.
  - `concept` (339 cues): older phrasings from the first research pass whose exact wording was not found in any fetched page. They point to the one fault-level source that best covers the idea. Treat them as paraphrases. They stay only where a fault has fewer `wording` cues than its cap (10 for priority 1-2, 8 for priority 3), or where `cv/catchline_cv/rules.json` uses them as alternates.

## How the per-cue sources were matched

The pages were fetched as text (blocked pages via the Wayback Machine, PDFs via `pdftotext`). Then each page was split into ~300-word passages, and only passages that name the movement were kept. A cue matches a passage when:

- for 1-2 content words: the words appear in order, at most 3 tokens apart;
- for 3-4 content words: all of them appear within len+2 tokens of each other;
- for 5+ content words: all but one appear within that window.

Content words are the cue's words without stopwords, lightly stemmed. New phrasings were only added when they matched at least one page, so every added cue is wording found in a source. A hand check of 40 random matches found about 85% were genuine uses of the cue. The rest were the same words in a different context (for example "avoid closing the hips"). Those were removed where spotted. The low-trust pages already in the fault-level lists (open-exam-prep.com study notes, coachway.io summaries, a slideshare deck, plume.deuxfleurs.fr) are not used for per-cue matching.

## Review rule

There is no coach review, so trust comes from the published sources:

- A cue is **well-sourced** when its sources come from 2+ independent organisations. Domains are grouped by owner, so Catalyst Athletics with The Performance Menu counts as one, and so does crossfit.com with games./library./assets.crossfit.com.
- Single-source and single-organisation cues are kept but flagged. `vet_cues.py` reports them as "1 org".
- Prefer well-sourced `wording` cues when choosing app copy, and confirm a `concept` cue against its source before using it.

## Vetting

```sh
python3 cv/scripts/vet_cues.py          # full report, exit 1 if any cue fails
python3 cv/scripts/vet_cues.py --quiet  # same, lists at most 20 failures
```

It uses only the standard library. Checks per cue:

- at most 8 words and no em dash;
- none of "try to", "make sure", "focus on", "engage", "don't" (except "don't bump");
- "should" and "just" checked as whole words (`\bshould\b`, `\bjust\b`) so "shoulders" and "adjust" pass;
- no medical words ("injur", "diagnos", "pain", "rehab");
- a `{text, sources}` object with at least one URL;
- no duplicate text within a fault.

External focus is a guideline only and is not checked.

It prints counts per movement, passing and failing (with the reason), cues with 2+ source URLs versus 1, and cues from 2+ independent organisations versus 1.
