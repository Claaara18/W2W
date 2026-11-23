/**
 * Outfit colour harmony.
 *
 * Built-in colours (wardrobeSchema COLORS) use the rule tables below — unchanged, so saved
 * clothes score exactly as before. Custom colours are scored from their own HEX code with an
 * OKLCH model (lightness, chroma, hue). A custom colour that is almost a built-in colour
 * (CIE ΔE < 6) uses that built-in colour's table; between ΔE 4 and 8 the two scores are
 * blended so the score never jumps at the threshold.
 *
 *   neutral + neutral  → per-pair table (black+white classic, black+navy weak …)
 *   neutral + colour   → usually good (one accent colour is the safest look)
 *   colour  + colour   → per-pair table (navy/denim count as neutral, so these
 *                         are only the "two real colours" cases)
 *   multi (print)      → good with neutrals, busy with other colours
 *   unknown (untagged) → 0.7, never blocks a recommendation
 */
import { COLORS, normalizeHex } from './wardrobeSchema';
import { oklchOf, deltaE76, hueDiff } from './colorMath';

const NEUTRALS = new Set(COLORS.filter(c => c.neutral).map(c => c.value));
const KNOWN    = new Set(COLORS.map(c => c.value));

const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// neutral × neutral
const NEUTRAL_PAIRS = {
  'black|white': 0.92, 'navy|white': 0.92, 'denim|white': 0.92, 'beige|white': 0.90,
  'gray|white': 0.88,  'brown|white': 0.85,
  'black|denim': 0.88, 'beige|denim': 0.88, 'denim|gray': 0.85, 'brown|denim': 0.82, 'denim|navy': 0.72,
  'beige|brown': 0.88, 'beige|navy': 0.88, 'black|gray': 0.85, 'gray|navy': 0.85,
  'black|beige': 0.82, 'beige|gray': 0.80, 'brown|navy': 0.80, 'brown|gray': 0.70,
  'black|brown': 0.62, 'black|navy': 0.60,
};
const SAME_NEUTRAL = { denim: 0.62 };   // double denim is risky; other same-neutral = tonal
const SAME_NEUTRAL_DEFAULT = 0.84;
const NEUTRAL_PAIR_DEFAULT = 0.80;

// neutral × colour (default 0.90)
const NEUTRAL_COLOR = {
  'navy|red': 0.93, 'denim|red': 0.90, 'red|white': 0.92, 'black|red': 0.88, 'brown|red': 0.72,
  'gray|pink': 0.93, 'navy|pink': 0.88, 'pink|white': 0.92, 'beige|pink': 0.90, 'brown|pink': 0.75,
  'beige|olive': 0.93, 'olive|white': 0.90, 'black|olive': 0.88, 'denim|olive': 0.85, 'brown|olive': 0.88,
  'beige|green': 0.90, 'brown|green': 0.85,
  'blue|white': 0.93, 'beige|blue': 0.90, 'blue|gray': 0.90, 'blue|brown': 0.82, 'blue|navy': 0.80, 'blue|denim': 0.70,
  'navy|purple': 0.75, 'brown|purple': 0.68, 'gray|purple': 0.88,
  'gray|yellow': 0.90, 'denim|yellow': 0.88, 'navy|yellow': 0.85, 'brown|yellow': 0.80,
  'black|orange': 0.82, 'denim|orange': 0.86, 'brown|orange': 0.85, 'navy|orange': 0.85, 'beige|orange': 0.85,
};
const NEUTRAL_COLOR_DEFAULT = 0.90;

// colour × colour (default 0.45)
const COLOR_PAIRS = {
  'blue|pink': 0.70, 'blue|green': 0.62, 'blue|yellow': 0.62, 'blue|orange': 0.55, 'blue|purple': 0.62, 'blue|red': 0.50,
  'green|olive': 0.62, 'green|yellow': 0.55, 'green|pink': 0.52, 'green|orange': 0.40, 'green|purple': 0.35, 'green|red': 0.25,
  'olive|orange': 0.65, 'olive|yellow': 0.55, 'olive|pink': 0.50, 'olive|red': 0.40, 'olive|purple': 0.35, 'blue|olive': 0.50,
  'pink|purple': 0.60, 'pink|red': 0.42, 'pink|yellow': 0.50, 'orange|pink': 0.40,
  'purple|red': 0.35, 'orange|red': 0.35, 'red|yellow': 0.30,
  'purple|yellow': 0.40, 'orange|purple': 0.30, 'orange|yellow': 0.50,
};
const SAME_COLOR = 0.78;           // tonal look, e.g. pink + pink
const COLOR_PAIR_DEFAULT = 0.45;
const MULTI_NEUTRAL = 0.85;
const MULTI_COLOR   = 0.40;
const MULTI_MULTI   = 0.20;
const UNKNOWN_PAIR  = 0.70;

export const isNeutralColor = (c) => NEUTRALS.has(c);
const isKnown = (c) => KNOWN.has(c);

/** Built-in table score for two built-in colour values (null / unknown allowed). */
function tablePairScore(a, b) {
  if (!isKnown(a) || !isKnown(b)) return UNKNOWN_PAIR;
  if (a === 'multi' || b === 'multi') {
    if (a === b) return MULTI_MULTI;
    const other = a === 'multi' ? b : a;
    return isNeutralColor(other) ? MULTI_NEUTRAL : MULTI_COLOR;
  }
  const na = isNeutralColor(a), nb = isNeutralColor(b);
  if (na && nb) {
    if (a === b) return SAME_NEUTRAL[a] ?? SAME_NEUTRAL_DEFAULT;
    return NEUTRAL_PAIRS[key(a, b)] ?? NEUTRAL_PAIR_DEFAULT;
  }
  if (na || nb) return NEUTRAL_COLOR[key(a, b)] ?? NEUTRAL_COLOR_DEFAULT;
  if (a === b) return SAME_COLOR;
  return COLOR_PAIRS[key(a, b)] ?? COLOR_PAIR_DEFAULT;
}

// ── HEX model (custom colours) ───────────────────────────────

const BUILTIN_HEX = COLORS.filter(c => c.hex).map(c => ({ value: c.value, hex: normalizeHex(c.hex) }));
const HEX_OF = Object.fromEntries(BUILTIN_HEX.map(c => [c.value, c.hex]));

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Smooth helpers — every rule fades in over a range so scores never jump at a threshold
const ramp = (x, from, to) => clamp01((x - from) / (to - from));          // 0 at from → 1 at to
const lerp = (a, b, t) => a + (b - a) * t;
const hueWindow = (h, lo, hi, soft = 10) => {
  // 1 inside [lo, hi], fading to 0 over `soft` degrees outside (no wrap needed for these ranges)
  if (h >= lo && h <= hi) return 1;
  const d = h < lo ? lo - h : h - hi;
  return clamp01(1 - d / soft);
};

/**
 * How a HEX colour behaves in an outfit. Neutral-ness is a weight 0–1:
 *   achromatic (C ≤ 0.035) · warm neutrals (beige, oatmeal, camel, brown: hue 50–95°, C ≤ 0.06)
 *   navy (dark low-chroma blue) · denim (mid-light low-chroma blue)
 * `neutral` (boolean) is weight ≥ 0.5, used for counting accent colours.
 */
export function describeHex(hex) {
  const { L, C, h } = oklchOf(hex);
  const blue = hueWindow(h, 230, 285);
  const general = ramp(C, 0.075, 0.03);
  const warm  = hueWindow(h, 50, 95) * ramp(C, 0.09, 0.06);
  const navy  = blue * ramp(L, 0.42, 0.36) * ramp(C, 0.13, 0.10);
  const denim = blue * ramp(L, 0.35, 0.40) * ramp(L, 0.77, 0.72) * ramp(C, 0.10, 0.07);
  const nw = Math.max(general, warm, navy, denim);
  return {
    L, C, h, neutralWeight: nw, neutral: nw >= 0.5,
    warmWeight: warm, denimWeight: denim,
    neon: ramp(C, 0.18, 0.22),        // fluorescent / very loud
  };
}



// neutral × neutral
function neutralPair(a, b, dL) {
  let s = 0.80 + 0.11 * ramp(dL, 0.15, 0.45);                                   // light/dark contrast helps
  const darkMuddy = ramp(Math.max(a.L, b.L), 0.42, 0.36) * ramp(dL, 0.16, 0.10); // black + dark navy
  s = lerp(s, 0.60, darkMuddy);
  const warmMix = Math.abs(a.warmWeight - b.warmWeight) * ramp(Math.max(a.L, b.L), 0.58, 0.52) * ramp(dL, 0.33, 0.27);
  s = lerp(s, 0.65, warmMix);                                                    // black + brown
  s = lerp(s, 0.65, a.denimWeight * b.denimWeight);                              // double denim
  return s;
}
// neutral × colour
function neutralColorPair(col, dL) {
  return 0.90 - 0.08 * ramp(dL, 0.08, 0.04) - 0.04 * col.neon;
}
// colour × colour — hue difference zones joined by straight lines
function colorPair(a, b, dL, dh) {
  const minC = Math.min(a.C, b.C), maxC = Math.max(a.C, b.C);
  const muted = ramp(maxC, 0.13, 0.09);          // both colours muted / dusty
  const bothNeon = a.neon * b.neon;
  const tonal = 0.76 + 0.06 * ramp(dL, 0.04, 0.12);
  const analogEnd = lerp(45, 60, muted);          // muted colours stay harmonious further apart
  const discord = lerp(lerp(0.42, 0.62, muted), 0.18, bothNeon);
  const vibrate = ramp(minC, 0.13, 0.17) * ramp(dL, 0.2, 0.1);
  // complementary: muted one → calm contrast; both saturated at similar lightness → vibrating;
  // two fluorescent colours (e.g. neon pink + neon green) → as harsh as the discordant zone
  const comp = lerp(lerp(lerp(0.62, 0.70, ramp(minC, 0.12, 0.08)), 0.45, vibrate), 0.18, bothNeon);
  const knots = [[0, tonal], [15, tonal], [22, 0.72], [analogEnd, 0.72], [analogEnd + 25, discord], [130, discord], [155, comp], [180, comp]];
  let s = comp;
  for (let i = 0; i < knots.length - 1; i++) {
    const [x1, y1] = knots[i], [x2, y2] = knots[i + 1];
    if (dh >= x1 && dh <= x2) { s = x2 > x1 ? lerp(y1, y2, (dh - x1) / (x2 - x1)) : y2; break; }
  }
  const apart = ramp(dh, 10, 20);
  s -= 0.08 * ramp(minC, 0.14, 0.18) * apart * (1 - bothNeon);                  // two loud colours
  s += 0.06 * ramp(Math.min(a.L, b.L), 0.70, 0.76) * ramp(maxC, 0.14, 0.11);     // pastel palette
  s -= 0.05 * ramp(dL, 0.08, 0.04) * apart;                                      // no lightness contrast
  // Near-grey colours have an unstable hue: the closer to grey, the less the hue rules count
  return lerp(0.72, s, ramp(minC, 0.03, 0.09));
}

/** Pair score from two HEX colours (OKLCH rules, smooth). */
export function hexPairScore(hexA, hexB) {
  const a = describeHex(hexA), b = describeHex(hexB);
  const dL = Math.abs(a.L - b.L);
  const dh = hueDiff(a.h, b.h);
  const nA = a.neutralWeight, nB = b.neutralWeight;
  // Treat each colour as "neutral" with its weight and blend the four cases
  let s = nA * nB * neutralPair(a, b, dL)
        + nA * (1 - nB) * neutralColorPair(b, dL)
        + (1 - nA) * nB * neutralColorPair(a, dL)
        + (1 - nA) * (1 - nB) * colorPair(a, b, dL, dh);
  // Practically the same colour twice → tonal look (double denim stays weak)
  const same = ramp(deltaE76(hexA, hexB), 5, 3);
  if (same > 0) {
    const tonalSame = lerp(lerp(0.78, 0.84, Math.min(nA, nB)), 0.62, a.denimWeight * b.denimWeight);
    s = lerp(s, tonalSame, same);
  }
  return Math.round(clamp01(s) * 1000) / 1000;
}

/** Normalise a colour argument: built-in value string, or { value, hex, custom }. */
function toColor(c) {
  if (c == null) return { value: null, hex: null, custom: false };
  if (typeof c === 'string') return { value: c, hex: HEX_OF[c] ?? null, custom: false };
  const hex = c.custom ? normalizeHex(c.hex) : (HEX_OF[c.value] ?? null);
  return { value: c.value ?? null, hex, custom: !!c.custom && !!hex };
}

// Custom colours close to a built-in colour use its table; blended between ΔE 4 and 8
const SNAP_FULL = 4, SNAP_NONE = 8;
function nearestBuiltin(hex) {
  let best = null, d = Infinity;
  for (const c of BUILTIN_HEX) {
    const e = deltaE76(hex, c.hex);
    if (e < d) { d = e; best = c.value; }
  }
  return { value: best, dE: d };
}
const hexWeight = (dE) => {
  const t = clamp01((dE - SNAP_FULL) / (SNAP_NONE - SNAP_FULL));
  return t * t * (3 - 2 * t);   // smoothstep
};

/**
 * Score one pair. Accepts built-in value strings (old behaviour, exact table values)
 * or colour objects { value, hex, custom }. Returns a number 0–1.
 */
export function pairScore(a, b) {
  return pairDetail(a, b).score;
}

/** Like pairScore, plus how it was scored: 'table' | 'hex' | 'blend'. */
export function pairDetail(a, b) {
  const A = toColor(a), B = toColor(b);
  if (!A.custom && !B.custom) return { score: tablePairScore(A.value, B.value), mode: 'table' };

  // A print (multi) has no hex: neutral partner → good, coloured partner → busy
  if (A.value === 'multi' || B.value === 'multi') {
    const other = A.value === 'multi' ? B : A;
    if (other.value === 'multi' && !other.custom) return { score: MULTI_MULTI, mode: 'table' };
    const neutral = other.custom ? describeHex(other.hex).neutral : isNeutralColor(other.value);
    return { score: neutral ? MULTI_NEUTRAL : MULTI_COLOR, mode: 'hex' };
  }
  if (!A.hex || !B.hex) return { score: tablePairScore(A.value, B.value), mode: 'table' };

  const snapA = A.custom ? nearestBuiltin(A.hex) : { value: A.value, dE: 0 };
  const snapB = B.custom ? nearestBuiltin(B.hex) : { value: B.value, dE: 0 };
  const w = Math.max(A.custom ? hexWeight(snapA.dE) : 0, B.custom ? hexWeight(snapB.dE) : 0);
  const table = tablePairScore(snapA.value, snapB.value);
  if (w === 0) return { score: table, mode: 'table' };
  const hex = hexPairScore(A.hex, B.hex);
  const score = Math.round(((1 - w) * table + w * hex) * 1000) / 1000;
  return { score, mode: w === 1 ? 'hex' : 'blend' };
}

/** Is this colour (string or object) neutral for counting accents? */
function colorIsNeutral(c) {
  const C = toColor(c);
  if (C.custom) {
    const snap = nearestBuiltin(C.hex);
    return hexWeight(snap.dE) < 0.5 ? isNeutralColor(snap.value) : describeHex(C.hex).neutral;
  }
  return isNeutralColor(C.value);
}
const colorIsKnown = (c) => { const C = toColor(c); return C.custom || isKnown(C.value); };

export const SEVERE_CLASH = 0.3;

/**
 * Whole-outfit colour score 0–1.
 * @param {(string|{value,hex,custom}|null)[]} colors  one entry per garment
 * @param {string} occasion
 * @returns {{ score, colored, known, label, severe, pairs: [{ i, j, score, mode }] }}
 */
export function outfitColorScore(colors, occasion) {
  const list = colors ?? [];
  const knownList = list.filter(colorIsKnown);
  const colored = knownList.filter(c => !colorIsNeutral(c)).length;   // multi counts as coloured

  let sum = 0, n = 0, worst = 1;
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = pairDetail(list[i], list[j]);
      sum += d.score; n++; worst = Math.min(worst, d.score);
      pairs.push({ i, j, score: d.score, mode: d.mode });
    }
  }
  if (n === 0) return { score: 0.75, colored, known: knownList.length, label: 'single', severe: false, pairs };

  // One bad pair should hurt more than the average shows
  let score = 0.7 * (sum / n) + 0.3 * worst;

  const allKnown = knownList.length === list.length;
  if (allKnown && colored === 1) score += 0.04;          // one accent colour + neutrals
  if (colored >= 3) score -= 0.15;                        // three different colours is busy
  if (occasion === 'Work' && colored >= 2) score -= 0.10; // work prefers calmer palettes

  score = Math.max(0, Math.min(1, score));
  const label =
    knownList.length < list.length ? 'partly-unknown'
    : colored === 0 ? 'neutral'
    : colored === 1 ? 'accent'
    : worst < 0.45 ? 'clash'
    : 'multi-colour';
  const rounded = Math.round(score * 1000) / 1000;
  return { score: rounded, colored, known: knownList.length, label, severe: rounded < SEVERE_CLASH, pairs };
}
