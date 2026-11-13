# Analytics in 4.0: the share loop

The app sends events itself (`src/lib/analytics.ts`, no SDK) to PostHog project 686264. Every event carries the app version, OTA id, runtime and channel. No event carries a name, an email, a file name, a path, a frame or anything typed by the lifter. Dev builds send nothing (the key is only in the EAS production environment).

## The metric

**Exporters**: distinct people, other than the owner, with at least one `share_exported` in the period.

```sql
select count(distinct person_id) as exporters
from events
where event = 'share_exported'
  and timestamp >= now() - interval 14 day
  and person_id not in (
    select person_id from events where distinct_id in ('OWNER_ID_1', 'OWNER_ID_2')
  )
```

Run it in PostHog under SQL (HogQL). Use `properties.kind = 'video'` to count video exporters only.

Finding the owner's ids: a phone's `distinct_id` is the Supabase user id once the app has a session, and before that a random id kept in the app's storage, so one person can have several (one per reinstall, one per account). On each of the owner's phones, share a lift, then open PostHog Activity, find the `share_exported` that just arrived and copy its `distinct_id`. The Supabase user id is also in the dashboard under Authentication, Users. Listing the same ids under Project settings, "Filter out internal and test users" does the same for every insight.

## Events

| Event | Fires | Properties |
|---|---|---|
| `track_started` | once when tracking of a clip starts on the phone (`startDeviceLift`) | `source` (`camera`, `library`, `share`), `mark` |
| `track_completed` | once when tracking ends with a result that is not a failure | `seconds` (whole seconds from start to result), `frames`, `has_bar_path`, `mark` |
| `player_opened` | once each time a lift's result screen opens with its result loaded | `kind` (`tracker` for a 4.0 lift, `stills` for a 3.x lift), `has_bar_path` |
| `share_opened` | once when the share screen opens | `from` (`player`; `reveal` if the opener passes `from=reveal`) |
| `share_exported` | each time a video or image is ready and handed to the system share sheet, just before the sheet shows (a second share of the same file counts again) | `kind` (`video`, `image`), `speed` (1, 0.5, 0.25; 1 for an image), `overlay_path`, `overlay_lines`, `overlay_body`, `whole_clip`, `has_bar_path`, `duration_s` (length of the video made, one decimal; 0 for an image), `completed: true` |
| `share_completed` | once when the share sheet closes | `kind`, `activity` (the identifier iOS reports, `dismissed` when the sheet was closed without choosing, `unknown` if iOS gave none) |

`mark` is the lifter's mark on the plate: `made`, `skipped`, or `not_asked` (the binary cannot start from a mark, so the step is not shown).
`has_bar_path` is true when a bar path was drawn (the plate was followed), false for a body-only or gymnastics result.
A failed track sends `analysis_failed` with its `code`, as in 3.1. `analysis_completed` still fires beside `track_completed` with its 3.1 properties, so 3.1 charts keep working; count 4.0 tracks from `track_completed` only.
Only the 4.0 share screen (`TrackShareScreen`) reports; the share card of a 3.x lift does not.
The overlay toggles are three flat properties, not one object, so each can be filtered on.

## What the share sheet tells us

iOS reports one identifier for the activity that took the file, and whether the sheet was dismissed. Typical values: `com.apple.UIKit.activity.SaveToCameraRoll` (Save Video / Save Image), `com.apple.UIKit.activity.Message`, `com.apple.UIKit.activity.AirDrop`, `com.apple.UIKit.activity.Mail`, `com.burbn.instagram.shareextension`, `net.whatsapp.WhatsApp.ShareExtension`.

It does not tell us: whether the post was published inside the other app, to a story, a reel or a chat, who received it, or what happens to a video saved to Photos and posted later (the most common way to a reel). Some apps report a share as done when the lifter backed out of their composer, and some report a dismissal after posting. So `share_completed` is a hint about where videos go; the count that matters is `share_exported`.

## Default share text: not sent

Wanted: `bar path + body lines by Catchline https://apps.apple.com/app/id6785406082` beside the file. Not shipped, because the share call (`Share.share` from React Native) can only add the text for every activity at once, and developer reports say a text item beside a video takes Instagram off the share sheet and makes WhatsApp send the text without the video. Save to Photos and AirDrop would ignore the text; Messages, Mail and X would use it. This was not tested on a phone here. To ship it safely the native side needs a `UIActivityItemSource` that returns the text for Messages, Mail and X and nothing for Instagram and WhatsApp.

## Rating prompt

`src/features/share/rating.ts` asks for the App Store rating after a share the lifter did not cancel, of a lift with a bar path, once per app version, and not while the last tracking is a failed one. It needs the native module of `expo-store-review`, which build 41 does not hold, so it does nothing today and records nothing. Adding the package to a store build turns it on with no further code change. The prompt never shows on TestFlight, and iOS itself shows it at most three times a year.

## Wordmark in the exported file

The spec (`buildTrackSpec`) sets the wordmark's text, size (`markSize`), inset (`markInset`) and fonts. Its corner is fixed in `TrackRenderer.swift`: right edge and baseline both `markInset` from the bottom-right corner. That is inside the area Reels and TikTok cover (bottom 20%, right 12%). One inset for both axes cannot move it to another corner. The frame readout is not in the export (the renderer draws only the path, the lines, the body and the wordmark).

What the renderer needs, all optional so today's specs still decode:
- `style.markAnchor`: `"topLeft" | "topRight" | "bottomRight"` (default `bottomRight`). For the top anchors the baseline is `markInsetY + ascent` from the top; for `topLeft` x is `markInsetX`.
- `style.markInsetX`, `style.markInsetY` in output pixels, falling back to `markInset`.

JS would then send `topLeft` with x at 5% of the width and y at 12% of the height (below the header the platforms draw), and `topRight` when the lifter's joints or the bar path enter the top-left box on any frame of the range. The preview's wordmark in `TrackShareScreen` moves with it.
