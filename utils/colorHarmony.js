/**
 * Outfit colour harmony — rule tables based on common clothing colour pairings,
 * not hue angles alone. Colour values come from wardrobeSchema COLORS.
 *
 *   neutral + neutral  → per-pair table (black+white classic, black+navy weak …)
 *   neutral + colour   → usually good (one accent colour is the safest look)
 *   colour  + colour   → per-pair table (navy/denim count as neutral, so these
 *                         are only the "two real colours" cases)
 *   multi (print)      → good with neutrals, busy with other colours
 *   unknown (untagged) → 0.7, never blocks a recommendation
 */
import { COLORS } from './wardrobeSchema';

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

/** Score for one pair of colour values (null / unknown allowed). */
export function pairScore(a, b) {
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

/**
 * Whole-outfit colour score 0–1.
 * @param {(string|null)[]} colors  primaryColor of each garment
 * @param {string} occasion
 * @returns {{ score: number, colored: number, known: number, label: string }}
 */
export function outfitColorScore(colors, occasion) {
  const list = colors ?? [];
  const known = list.filter(isKnown);
  const colored = known.filter(c => !isNeutralColor(c)).length;   // multi counts as coloured

  let sum = 0, n = 0, worst = 1;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const s = pairScore(list[i], list[j]);
      sum += s; n++; worst = Math.min(worst, s);
    }
  }
  if (n === 0) return { score: 0.75, colored, known: known.length, label: 'single' };

  // One bad pair should hurt more than the average shows
  let score = 0.7 * (sum / n) + 0.3 * worst;

  const allKnown = known.length === list.length;
  if (allKnown && colored === 1) score += 0.04;          // one accent colour + neutrals
  if (colored >= 3) score -= 0.15;                        // three different colours is busy
  if (occasion === 'Work' && colored >= 2) score -= 0.10; // work prefers calmer palettes

  score = Math.max(0, Math.min(1, score));
  const label =
    known.length < list.length ? 'partly-unknown'
    : colored === 0 ? 'neutral'
    : colored === 1 ? 'accent'
    : worst < 0.45 ? 'clash'
    : 'multi-colour';
  return { score: Math.round(score * 1000) / 1000, colored, known: known.length, label };
}
