# Share-sheet entry: native setup still needed

The JS side is done: `app/capture/share.tsx` takes
`catchline://capture/share?uri=<file uri>&from=<app name>&duration=<s>&fps=<n>&movement=<id>`,
builds a `source: 'share'` clip and lands on Review (consent first if it has not been given).
Nothing native is wired yet, so no other app can send to Catchline today.

## iOS
- A **Share Extension** target (activation rule: `NSExtensionActivationSupportsMovieWithMaxCount = 1`).
  `@bacons/apple-targets` is still installed: put its plugin back in app.json and add `targets/share/` with an
  `expo-target.config.js` of `type: 'share'`. Alternative: `expo-share-intent` (config plugin, needs a dev build).
- An **App Group** shared by the app and the extension (the app already declares
  `group.com.yashgadodia.parallax`; the bundle id stays, so the group does too). The extension copies the movie
  into the group container, because the source app's file URL is not readable from the main app.
- The extension opens the app with the deep link above, `uri` pointing into the group container.
  Extensions cannot call `UIApplication.open`; use the responder-chain `openURL:` trick or
  `expo-share-intent`'s handler.
- `from`: read the source app from `NSExtensionContext` if available, otherwise omit it (Review shows "from another app").

## Android
- An intent filter on the main activity for `android.intent.action.SEND` with `mimeType: video/*`
  (`expo.android.intentFilters` in app.json, or `expo-share-intent`'s plugin).
- Read the `EXTRA_STREAM` content URI at launch, copy it into the cache dir (content URIs expire), then route to the link above.

## Both
- Duration and fps: read them before routing (AVAsset / MediaMetadataRetriever) so Review can show the
  30 fps note; without them the screen still works.
- Movement guess: pass `movement` only when on-device pose has guessed it; Review then asks "Looks like a … Right?".
