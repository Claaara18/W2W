/**
 * Colour math shared by wardrobeSchema (HEX → base colour) and colorHarmony (HEX scoring).
 * Pure JS, no packages. Results are cached per HEX string.
 *
 *   OKLCH: L 0–1 (lightness), C ≈ 0–0.37 (chroma / saturation), h 0–360° (hue)
 *   CIE Lab ΔE76 is used for "is this custom colour basically a built-in colour" (ΔE < 6).
 */

export function hexToRgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

export function rgbToLab([r, g, b]) {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export function rgbToOklch([r, g, b]) {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L  = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a  = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.hypot(a, bb);
  const h = C < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { L, C, h };
}

const oklchCache = new Map();
const labCache = new Map();

/** Cached OKLCH for a normalized '#RRGGBB' string. */
export function oklchOf(hex) {
  let v = oklchCache.get(hex);
  if (!v) { v = rgbToOklch(hexToRgb(hex)); oklchCache.set(hex, v); }
  return v;
}

/** Cached CIE Lab for a normalized '#RRGGBB' string. */
export function labOf(hex) {
  let v = labCache.get(hex);
  if (!v) { v = rgbToLab(hexToRgb(hex)); labCache.set(hex, v); }
  return v;
}

/** CIE76 ΔE between two '#RRGGBB' colours. */
export function deltaE76(hexA, hexB) {
  const a = labOf(hexA), b = labOf(hexB);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Smallest angle between two hues, 0–180°. */
export const hueDiff = (h1, h2) => {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
};
