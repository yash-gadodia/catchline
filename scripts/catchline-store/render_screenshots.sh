#!/usr/bin/env bash
# Render the six App Store screenshots (screens "Store 1".."Store 6" in design 09)
# to 1320x2868 PNGs: each 440x956 screen element cropped at device scale 3.
#
# Usage: scripts/catchline-store/render_screenshots.sh [design.html] [out_dir]
set -euo pipefail

RESEARCH="${HOME}/dev/liftcheck-research"
DESIGN="${1:-${RESEARCH}/design/Catchline 09 You and Store.dc.html}"
OUT="${2:-${RESEARCH}/launch/screenshots/ios-6.9}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${CDP_PORT:-9333}"

[ -f "$DESIGN" ] || { echo "design file not found: $DESIGN" >&2; exit 1; }
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME (set CHROME=...)" >&2; exit 1; }
mkdir -p "$OUT"

PROFILE="$(mktemp -d)"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
  --allow-file-access-from-files --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE" --window-size=1600,1200 about:blank >/dev/null 2>&1 &
CHROME_PID=$!
trap 'kill $CHROME_PID 2>/dev/null; wait $CHROME_PID 2>/dev/null; rm -rf "$PROFILE"' EXIT

DESIGN="$DESIGN" OUT="$OUT" PORT="$PORT" node --input-type=module <<'JS'
const { DESIGN, OUT, PORT } = process.env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(200); }
}
if (!targets) throw new Error('Chrome DevTools endpoint never came up');
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let seq = 0;
const pending = new Map();
const waiters = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method) {
    for (const w of waiters.filter((w) => w.method === msg.method)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg.params); }
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }));
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 3, mobile: false });
const loaded = once('Page.loadEventFired');
await send('Page.navigate', { url: 'file://' + DESIGN.split('/').map(encodeURIComponent).join('/') });
await loaded;
await evaluate(`(async () => {
  await document.fonts.ready;
  for (let i = 0; i < 100 && !document.querySelector('[data-screen-label="Store 6 share"]'); i++) await new Promise(r => setTimeout(r, 100));
  await Promise.all([...document.images].map(img => img.complete ? 0 : new Promise(r => { img.onload = img.onerror = r; })));
})()`);
await sleep(800);

const screens = await evaluate(`[...document.querySelectorAll('[data-screen-label^="Store "]')].map(el => {
  const r = el.getBoundingClientRect();
  return { label: el.dataset.screenLabel, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
})`);
if (screens.length !== 6) throw new Error(`expected 6 Store screens, found ${screens.length}: ${screens.map((s) => s.label)}`);

const { writeFileSync } = await import('node:fs');
for (const s of screens) {
  const n = s.label.match(/^Store (\d)/)[1];
  const { data } = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: s.x, y: s.y, width: s.w, height: s.h, scale: 1 },
  });
  const file = `${OUT}/catchline-store-${n}.png`;
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`${s.label} (${s.w}x${s.h} css) -> ${file}`);
}
ws.close();
JS

for f in "$OUT"/catchline-store-*.png; do
  printf '%s %s\n' "$(basename "$f")" "$(sips -g pixelWidth -g pixelHeight "$f" | awk '/pixel/{printf "%s ", $2}')"
done
