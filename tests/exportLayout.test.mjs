/**
 * Export image layout — run from the project root:
 *   npx esbuild tests/exportLayout.test.mjs --bundle --platform=node --format=esm --outfile=/tmp/w2w-export-test.mjs && node /tmp/w2w-export-test.mjs
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { exportLayout, cropWindow } from '../utils/exportLayout.js';

let failures = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ok  ', m); } else { failures++; console.log('  FAIL', m); } };

// Canvas capture of 393×800pt at @3x, top 52, bottom 30 (canvas ends with a 60pt strip)
const crop = { x: 16, y: 68, width: 320, height: 165, sourceWidth: 375, sourceHeight: 666 };
const L = exportLayout({ shotW: 1179, shotH: 2400, viewW: 393, topPad: 52, bottomPad: 30, footerH: 90,
  logoW: 85, logoAspect: crop.width / crop.height });
ok(L.frameW === 393 && L.contentW === 393 && Math.abs(L.contentH - 800) < 1e-9, 'canvas width / aspect unchanged, no side padding');
ok(L.frameH === 882, `export size unchanged: 52 + 800 + 30 = ${L.frameH}pt`);
ok(L.logoW === 85 && Math.abs(L.logoH - 85 * 165 / 320) < 1e-9, `logo 85 × ${L.logoH.toFixed(1)}pt (artwork proportions)`);
ok(Math.abs(L.logoBottom - (90 - L.logoH) / 2) < 1e-9 && L.logoTop >= 882 - 90 && L.logoTop + L.logoH <= 882,
  `logo inside the 90pt bottom strip, vertically centred (${L.logoBottom.toFixed(1)}pt above and below)`);

const W = cropWindow(crop, 85);
ok(Math.abs(W.windowH - 85 * 165 / 320) < 1e-9 && Math.abs(W.imageW / W.imageH - 375 / 666) < 1e-9, 'crop window keeps the file’s aspect ratio (no stretching)');
ok(Math.abs(W.left + 16 * 85 / 320) < 1e-9 && Math.abs(W.top + 68 * 85 / 320) < 1e-9, 'crop window shows exactly the drawn part');

// The crop matches the actual artwork in assets/brand/w2w-logo.png (alpha bounding box)
{
  const buf = fs.readFileSync('assets/brand/w2w-logo.png');
  let off = 8, w, h, ct, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * 4, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0, b = y > 0 ? px[(y - 1) * stride + x] : 0, c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
      let v = raw[y * (stride + 1) + 1 + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  let minX = w, minY = h, maxX = -1, maxY = -1, transparent = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const A = px[y * stride + x * 4 + 3];
    if (A === 0) transparent++;
    if (A > 16) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  ok(ct === 6 && w === 375 && h === 666 && transparent / (w * h) > 0.8, 'logo file is RGBA with a transparent background');
  ok(minX === crop.x && minY === crop.y && maxX - minX + 1 === crop.width && maxY - minY + 1 === crop.height, `crop = artwork bounds (${minX},${minY} ${maxX - minX + 1}×${maxY - minY + 1})`);
}

// Source checks
const src = fs.readFileSync('screens/JournalScreen.js', 'utf8');
const brand = fs.readFileSync('utils/brandAssets.js', 'utf8');
ok(/BRAND_LOGO = require\('\.\.\/assets\/brand\/w2w-logo\.png'\)/.test(brand), 'brandAssets.js points at assets/brand/w2w-logo.png');
ok(!/sidePad|screenH|Dimensions\.get\('screen'\)/.test(src), 'no screen-ratio side padding');
ok(/const EXPORT_TOP_PAD\s+= 52;/.test(src) && /const EXPORT_BOTTOM_PAD\s+= 30;/.test(src) && /const EXPORT_TITLE_SIZE\s+= 46;/.test(src), 'top 52pt, bottom 30pt, title 46pt unchanged');
ok(/width:'100%', textAlign:'center'/.test(src) && /monthName=\{MONTH_NAMES\[jMonth\]\}/.test(src), 'centred month title kept');
ok(/const LOGO_W\s+= 85;/.test(src) && /overflow:'hidden'/.test(src), 'logo 85pt wide, shown through a crop window');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exitCode = 1;
