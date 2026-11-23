/**
 * Journal sticker placement (WYSIWYG) — geometry model + source checks.
 * The real drag must still be checked on a phone; this proves the layout cause is gone.
 *
 * Run from the project root:
 *   npx esbuild tests/stickerGeometry.test.mjs --bundle --platform=node --format=esm --outfile=/tmp/w2w-sticker-test.mjs && node /tmp/w2w-sticker-test.mjs
 */
import fs from 'node:fs';

let failures = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ok  ', m); } else { failures++; console.log('  FAIL', m); } };

// React Native: transform [translateX, translateY, scale, rotate] about the view's centre.
// Visible position of a local point p = centre + translate + scale·R(rot)·(p − centre).
function visible(p, box, t, s, rotDeg) {
  const c = [box.w / 2, box.h / 2];
  const r = (rotDeg * Math.PI) / 180;
  const d = [p[0] - c[0], p[1] - c[1]];
  const rd = [d[0] * Math.cos(r) - d[1] * Math.sin(r), d[0] * Math.sin(r) + d[1] * Math.cos(r)];
  return [c[0] + t[0] + s * rd[0], c[1] + t[1] + s * rd[1]];
}
// Where the sticker artwork's top-left corner is drawn
function artworkCorner({ w, h, t, s, rot, pad }) {
  const box = { w: w + 2 * pad, h: h + 2 * pad };   // wrapper grows by the padding around the content
  return visible([pad, pad], box, t, s, rot);
}

const cases = [
  { name: '100pt sticker, no transform', w: 100, h: 100, t: [120, 300], s: 1, rot: 0 },
  { name: 'scaled ×2.5',                 w: 100, h: 100, t: [40, 520], s: 2.5, rot: 0 },
  { name: 'scaled ×0.6, rotated 35°',   w: 100, h: 100, t: [200, 150], s: 0.6, rot: 35 },
  { name: 'text box 140×52, ×1.8, −20°', w: 140, h: 52, t: [80, 640], s: 1.8, rot: -20 },
];

// Before: selected = border 1.5 + padding 2 (3.5pt inside the wrapper); deselected/export = 0
for (const c of cases) {
  const sel = artworkCorner({ ...c, pad: 3.5 });
  const off = artworkCorner({ ...c, pad: 0 });
  const jump = [off[0] - sel[0], off[1] - sel[1]];
  ok(Math.abs(jump[0] + 3.5) < 1e-9 && Math.abs(jump[1] + 3.5) < 1e-9,
    `before the fix — ${c.name}: deselecting moved it (${jump[0].toFixed(2)}, ${jump[1].toFixed(2)}) = up-left`);
}
// After: the wrapper never changes with selection (ring is absolute, outside the layout)
for (const c of cases) {
  const sel = artworkCorner({ ...c, pad: 0 });
  const off = artworkCorner({ ...c, pad: 0 });
  ok(sel[0] === off[0] && sel[1] === off[1], `after the fix — ${c.name}: selected = deselected = exported position`);
}

// Source checks on the real component
const src = fs.readFileSync('screens/JournalScreen.js', 'utf8');
// Only the sticker component (the file has other PanResponders)
const item = src.slice(src.indexOf('function CanvasItem('), src.indexOf('// ── Main journal screen'));
const styles = src.slice(src.indexOf('const cs = StyleSheet.create'));
const wrap = item.match(/<Animated\.View\s+style=\{\[cs\.itemWrap[^\]]*\]\}/)?.[0] ?? '';
ok(wrap && !/selected/.test(wrap), 'item wrapper style no longer depends on selection');
ok(/selectedRing:\{ position:'absolute', top:-SEL_INSET, left:-SEL_INSET, right:-SEL_INSET, bottom:-SEL_INSET/.test(src)
  && /<View pointerEvents="none" style=\{cs\.selectedRing\} \/>/.test(src), 'selection outline is an absolute ring that ignores touches');
ok(styles.length > 0 && !/padding:2\b/.test(styles.slice(0, styles.indexOf('});'))), 'no padding added to selected items any more');
// Release stores exactly what the last move frame displayed
const moveBlock = item.match(/onPanResponderMove:[\s\S]*?onPanResponderRelease/)?.[0] ?? '';
const releaseBlock = item.match(/onPanResponderRelease:[\s\S]*?onPanResponderTerminate/)?.[0] ?? '';
ok(/panX\.setValue\(posX\.current\); panY\.setValue\(posY\.current\);/.test(moveBlock)
  && /x:posX\.current, y:posY\.current/.test(releaseBlock), 'release saves posX/posY — the same values shown in the last drag frame');
ok(/const dx = t\[0\]\.pageX-lastTX\.current, dy = t\[0\]\.pageY-lastTY\.current;/.test(moveBlock),
  'drag uses frame-to-frame finger deltas (scroll / safe-area / toolbar offsets cancel out)');
ok(!/[+-]\s*(10|20)\s*[,;)]/.test(releaseBlock), 'no hard-coded offset applied on release');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exitCode = 1;
