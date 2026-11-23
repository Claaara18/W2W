/**
 * W2W outfit recommender (Phase 3) — runs fully on-device, no network.
 *
 * Priority:
 *   1. Weather   — feels-like temperature vs. whole-outfit warmth (hard filter + score)
 *   2. Occasion  — formality, styles, garment type (hard filter + score)
 *   3. Colour harmony + style consistency (score)
 *   4. Diversity — three looks that don't reuse the same top / palette
 *
 * Untagged items use category defaults (warmth from wardrobeSchema.estimateWarmth,
 * default formality below) so old clothes still take part.
 * The input wardrobe is never mutated.
 *
 * Input:  wardrobe { tshirts, jackets, skirts, pants, dresses } (items keep all fields)
 *         weather  { temp, feelsLike?, icon?, en?, dailyMin?, dailyMax?, precipProb?, windSpeed? }
 *         occasion 'Casual' | 'School' | 'Work' | 'Date'
 *         options  { seed = 0, recentIds = [] }
 */
import { estimateWarmth, getItemTags, hasAnyTag, thicknessFactor } from './wardrobeSchema';
import { outfitColorScore, describeHex } from './colorHarmony';

export const OCCASIONS = ['Casual', 'School', 'Work', 'Date'];

const ROLE_OF = { tshirts: 'top', jackets: 'outer', skirts: 'bottom', pants: 'bottom', dresses: 'dress' };

// Used when an item has no formality tag
const DEFAULT_FORMALITY = { tshirts: 2, jackets: 3, skirts: 2.5, pants: 2.5, dresses: 2.5 };

export const DEFAULT_TEMP = 22;

// ── 1. Weather ──────────────────────────────────────────────────
//
// Outfit warmth W:  top + outer + 0.6 × bottom      (torso matters most)
//                   1.3 × dress + outer
// Per-garment warmth comes from estimateWarmth (≈ 0–6).
//
// Bands: [feels-like °C, ideal W, min W, max W] — linearly interpolated.
// Tuned against tests/recommender.test.mjs spot checks.
export const WARMTH_BANDS = [
  [35, 0.9, 0.0, 2.3],
  [30, 1.3, 0.0, 2.8],
  [26, 2.0, 0.6, 4.0],
  [22, 3.0, 0.7, 5.0],
  [18, 4.2, 2.6, 6.8],
  [14, 5.5, 4.0, 9.5],
  [10, 6.8, 5.0, 13.0],
  [6,  8.0, 6.3, 15.0],
  [2,  9.0, 7.3, 16.0],
];

const OUTER_REQUIRED_AT = 10;   // feels-like ≤ this → must have a jacket / coat layer

const UNTAGGED_TOLERANCE = 0.6;   // benefit of the doubt for untagged items

export function warmthBand(T) {
  const b = WARMTH_BANDS;
  if (T >= b[0][0]) return { ideal: b[0][1], min: b[0][2], max: b[0][3] };
  const last = b[b.length - 1];
  if (T <= last[0]) return { ideal: last[1], min: last[2], max: last[3] };
  for (let i = 0; i < b.length - 1; i++) {
    const [t1, i1, mn1, mx1] = b[i];
    const [t2, i2, mn2, mx2] = b[i + 1];
    if (T <= t1 && T >= t2) {
      const f = (t1 - T) / (t1 - t2);
      const lerp = (a, c) => a + (c - a) * f;
      return { ideal: lerp(i1, i2), min: lerp(mn1, mn2), max: lerp(mx1, mx2) };
    }
  }
  return { ideal: 3, min: 1, max: 5 };
}

export const getFeelsLike = (weather) => {
  const f = weather?.feelsLike, t = weather?.temp;
  if (typeof f === 'number' && Number.isFinite(f)) return f;
  if (typeof t === 'number' && Number.isFinite(t)) return t;
  return null;
};

export const isRainy = (weather) => {
  const icon = weather?.icon ?? '';
  const en   = (weather?.en ?? '').toLowerCase();
  if (typeof weather?.precipProb === 'number' && weather.precipProb >= 60) return true;
  return icon === 'rainy' || icon === 'thunderstorm' ||
    en.includes('rain') || en.includes('drizzle') || en.includes('shower') || en.includes('thunder');
};

// ── Lower body ──
// The leg check is separate from total warmth: a coat over a thin skirt can reach the
// total, but the legs are still cold. Leg warmth = bottom's estimateWarmth
// (shorts 0.2–0.3, mini 0.4–0.5, thin pleated 0.68, midi 0.9–1.6, jeans/slacks 1.4–2.0),
// or for dresses: slip 0.5, knit 1.1, others 0.8 (thick +0.2).
// Required leg warmth by feels-like temperature (interpolated):
export const LEG_BANDS = [
  [26, 0.0],
  [20, 0.2],
  [16, 0.5],
  [12, 0.8],
  [8,  1.1],
  [4,  1.4],
  [0,  1.6],
];

export function legRequirement(T) {
  const b = LEG_BANDS;
  if (T >= b[0][0]) return b[0][1];
  if (T <= b[b.length - 1][0]) return b[b.length - 1][1];
  for (let i = 0; i < b.length - 1; i++) {
    const [t1, r1] = b[i], [t2, r2] = b[i + 1];
    if (T <= t1 && T >= t2) return r1 + (r2 - r1) * ((t1 - T) / (t1 - t2));
  }
  return 0;
}

// fail codes → shown in the DATA preview
export const FAIL_LABELS = {
  cold_total: '整套太冷',
  cold_legs:  '下半身太薄',
  cold_outer: '低溫需要外套',
  hot_total:  '整套太熱',
  hot_thick:  '高溫不穿厚單品',
  occ_type:   '場合不適合的單品類型',
  occ_fit:    '正式程度／風格不符場合',
};

function weatherEval(outfit, T, weather) {
  const band = warmthBand(T);
  const tol  = outfit.hasUntagged ? UNTAGGED_TOLERANCE : 0;
  const min  = band.min - tol;
  const max  = band.max + tol;
  const W    = outfit.warmth;
  // No untagged tolerance for legs: an untagged skirt (default 1.0) must not pass at 8°C
  const legReq = legRequirement(T);
  const base = { W, band, legReq };

  // Hard rules on top of the warmth range
  if (W < min) return { ...base, ok: false, fail: 'cold_total' };
  if (W > max) return { ...base, ok: false, fail: 'hot_total' };
  if (outfit.legWarmth < legReq) return { ...base, ok: false, fail: 'cold_legs' };
  if (T <= OUTER_REQUIRED_AT && !outfit.outer) return { ...base, ok: false, fail: 'cold_outer' };
  if (T >= 27 && outfit.parts.some(p => p.role !== 'bottom' && (p.tags.thickness === 'thick' || p.warmth >= 3.5))) {
    return { ...base, ok: false, fail: 'hot_thick' };
  }
  // Any thick long-sleeve or warm top / jacket / dress (built-in or custom type) is too much from 24°C
  if (T >= 24 && outfit.parts.some(p => p.role !== 'bottom' && p.tags.thickness === 'thick'
      && (p.tags.sleeveLength === 'long' || p.warmth >= 3))) {
    return { ...base, ok: false, fail: 'hot_thick' };
  }

  const side = W >= band.ideal ? (max - band.ideal) : (band.ideal - min);
  const d = side > 0 ? Math.abs(W - band.ideal) / side : 0;
  let score = 1 - 0.6 * d * d;

  if (T < 20 && outfit.legWarmth < legReq + 0.3) score -= 0.06;   // legs only just warm enough
  if (T >= 29 && outfit.legWarmth >= 2.0) score -= 0.05;
  if (isRainy(weather) && outfit.parts.some(p =>
    (p.cat === 'skirts' && p.tags.baseSubType === 'mini') || (p.cat === 'dresses' && ['slip', 'romper'].includes(p.tags.baseSubType)))) {
    score -= 0.10;
  }
  const swing = (weather?.dailyMax ?? NaN) - (weather?.dailyMin ?? NaN);
  const windy = (weather?.windSpeed ?? 0) >= 30;
  if (outfit.outer && T < 26 && (swing >= 8 || windy)) score += 0.05;
  if (outfit.hasUntagged) score -= 0.05;

  return { ...base, ok: true, score: clamp01(score) };
}

// ── 2. Occasion ─────────────────────────────────────────────────

const OCCASION_RULES = {
  Casual: {
    lo: 1, hi: 3, peak: 2,
    plus: ['casual', 'street', 'sporty', 'minimal', 'vintage', 'sweet'],
    minus: ['formal'],
    exclude: [],
    penalty: {},
  },
  School: {
    lo: 2, hi: 3, peak: 2.5,
    plus: ['casual', 'minimal', 'sporty', 'vintage', 'sweet'],
    minus: ['formal'],
    exclude: [],
    penalty: { 'tshirts:tank': 0.15, 'dresses:slip': 0.2, 'skirts:mini': 0.1, 'dresses:romper': 0.1 },
  },
  Work: {
    lo: 3, hi: 5, peak: 4,
    plus: ['formal', 'minimal'],
    minus: ['sporty', 'street'],
    exclude: ['pants:shorts', 'pants:joggers', 'pants:leggings', 'tshirts:tank', 'tshirts:hoodie', 'jackets:zip_hoodie', 'dresses:romper'],
    penalty: { 'skirts:mini': 0.15, 'dresses:slip': 0.2, 'skirts:denim': 0.1, 'pants:jeans': 0.05, 'tshirts:tee': 0.05, 'jackets:windbreaker': 0.1 },
  },
  Date: {
    lo: 2, hi: 4, peak: 3,
    plus: ['sweet', 'minimal', 'vintage', 'formal'],
    minus: ['sporty'],
    exclude: [],
    penalty: { 'pants:joggers': 0.2, 'tshirts:hoodie': 0.1, 'jackets:zip_hoodie': 0.1, 'pants:leggings': 0.1, 'jackets:windbreaker': 0.05 },
  },
};

const OCCASION_MIN_SCORE = 0.3;

const HARD_TYPE_LIMITS    = ['pants:shorts', 'dresses:romper'];   // never waived for custom types
const DRESSY_STYLES       = ['formal', 'minimal'];
const CASUAL_STYLES       = ['sporty', 'street'];
const CUSTOM_SOFT_PENALTY = 0.08;
const CUSTOM_HARD_PENALTY = 0.25;

function occasionEval(outfit, occasion) {
  const rule = OCCASION_RULES[occasion] ?? OCCASION_RULES.Casual;
  // Custom types: an internal base (older data only) may add type rules; new custom types have
  // no base and are judged purely by category, sleeve, thickness, formality and style tags
  const subKeys = outfit.parts.filter(p => p.tags.baseSubType).map(p => `${p.cat}:${p.tags.baseSubType}`);

  // Type exclusions. Built-in types: excluded as before. Custom types are judged by their own
  // tags too: a dressy custom piece (formality ≥ 3 + formal/minimal style) gets a small penalty
  // instead; formality ≥ 3 without a dressy style gets a large one; anything else stays excluded.
  // Leg-baring bases (shorts, romper) are never waived.
  let typePenalty = 0;
  for (const p of outfit.parts) {
    if (!p.tags.baseSubType) continue;
    const k = `${p.cat}:${p.tags.baseSubType}`;
    if (!rule.exclude.includes(k)) continue;
    if (!p.tags.customSubType || HARD_TYPE_LIMITS.includes(k)) return { ok: false, fail: 'occ_type', detail: k };
    const own = p.tags;
    const dressy = own.styles.some(st => DRESSY_STYLES.includes(st));
    const casual = own.styles.some(st => CASUAL_STYLES.includes(st));
    const sheer  = own.baseSubType === 'tank' && own.thickness === 'thin';
    if (own.formality != null && own.formality >= 3 && dressy && !casual && !sheer) typePenalty += CUSTOM_SOFT_PENALTY;
    else if (own.formality != null && own.formality >= 3 && !casual && !sheer) typePenalty += CUSTOM_HARD_PENALTY;
    else return { ok: false, fail: 'occ_type', detail: `${k}（自訂：${own.customSubType.label}）` };
  }

  // Formality (dress counts double)
  let fs = 0, fw = 0, fmin = 9, fmax = -9;
  for (const p of outfit.parts) {
    const w = p.role === 'dress' ? 2 : 1;
    fs += p.formality * w; fw += w;
    fmin = Math.min(fmin, p.formality); fmax = Math.max(fmax, p.formality);
  }
  const f = fs / fw;
  const dist = f < rule.lo ? rule.lo - f : f > rule.hi ? f - rule.hi : 0;
  const formFit = dist === 0 ? 1 - 0.12 * Math.abs(f - rule.peak) : clamp01(0.75 - 0.4 * dist);

  // Styles (only items that have style tags count)
  const styled = outfit.parts.filter(p => p.tags.styles.length > 0);
  let styleFit = 0.5;
  if (styled.length) {
    const plus  = styled.filter(p => p.tags.styles.some(s => rule.plus.includes(s))).length;
    const minus = styled.filter(p => p.tags.styles.some(s => rule.minus.includes(s))).length;
    styleFit = clamp01(0.5 + 0.4 * (plus / styled.length) - 0.45 * (minus / styled.length));
  }

  let score = 0.6 * formFit + 0.4 * styleFit - typePenalty;
  for (const k of subKeys) score -= rule.penalty[k] ?? 0;
  if (fmax - fmin > 2) score -= 0.15;   // e.g. blazer + joggers
  score = clamp01(score);

  if (score < OCCASION_MIN_SCORE) return { ok: false, fail: 'occ_fit', score, formality: f };
  return { ok: true, score, formality: f };
}

// ── 3. Style consistency ────────────────────────────────────────

const STYLE_CLASH = [['formal', 'sporty', 0.3], ['formal', 'street', 0.15], ['sweet', 'street', 0.1]];

function styleConsistency(outfit) {
  const styled = outfit.parts.filter(p => p.tags.styles.length > 0);
  if (styled.length < 2) return 0.6;
  let score = 0.6;
  const shared = styled[0].tags.styles.filter(s => styled.every(p => p.tags.styles.includes(s)));
  if (shared.length) score += 0.3;
  for (const [a, b, pen] of STYLE_CLASH) {
    const hasA = styled.some(p => p.tags.styles.includes(a));
    const hasB = styled.some(p => p.tags.styles.includes(b));
    if (hasA && hasB) score -= pen;
  }
  return clamp01(score);
}

// ── candidates ──────────────────────────────────────────────────

const WEIGHTS = { weather: 0.40, occasion: 0.32, color: 0.18, style: 0.10 };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round3  = (x) => Math.round(x * 1000) / 1000;

function toPart(item, cat) {
  const tags = getItemTags(item, cat);
  return {
    item: { ...item, categoryId: cat },   // copy for the UI; original object untouched
    id: item.id,
    cat,
    role: ROLE_OF[cat],
    tags,
    tagged: hasAnyTag(tags),
    warmth: estimateWarmth(item, cat),
    formality: tags.formality ?? DEFAULT_FORMALITY[cat] ?? 2.5,
    color: tags.baseColor,   // built-in base (fallback, variety, display)
    // what colour scoring uses: built-in value, or { hex } for custom colours
    colorRef: tags.customColor ? { value: tags.baseColor, hex: tags.customColor.hex, custom: true } : tags.primaryColor,
    colorName: tags.colorLabel ?? null,
  };
}

/** Stable, order-independent outfit id (does not depend on rank, seed or occasion). */
export const outfitIdFromParts = (parts) => `outfit_v2_${parts.map(p => p.id).join('+')}`;

/** Item ids encoded in a saved outfit id — supports v2 ids and the legacy `outfit_<rank>_<a|b|c>` ids. */
export function itemIdsFromOutfitId(outfitId) {
  if (typeof outfitId !== 'string') return null;
  let m = outfitId.match(/^outfit_v2_(.+)$/);
  if (m) return m[1].split('+');
  m = outfitId.match(/^outfit_\d+_(.+)$/);
  if (m) return m[1].split('|');
  return null;
}

/** True if two outfit ids (v2 or legacy) contain exactly the same garments. */
export function isSameOutfit(idA, idB) {
  if (idA === idB) return true;
  const a = itemIdsFromOutfitId(idA), b = itemIdsFromOutfitId(idB);
  if (!a || !b || a.length !== b.length) return false;
  const sa = [...a].sort().join('\n'), sb = [...b].sort().join('\n');
  return sa === sb;
}

function buildOutfit(parts) {
  // Fixed display order: [top, outer, bottom] / [top, bottom] / [dress, outer]
  const top = parts.find(p => p.role === 'top');
  const dress = parts.find(p => p.role === 'dress');
  const bottom = parts.find(p => p.role === 'bottom');
  const outer = parts.find(p => p.role === 'outer') ?? null;
  const ordered = dress ? [dress, outer].filter(Boolean) : [top, outer, bottom].filter(Boolean);
  const primary = dress ?? top;
  const warmth = dress
    ? 1.3 * dress.warmth + (outer?.warmth ?? 0)
    : top.warmth + (outer?.warmth ?? 0) + 0.6 * bottom.warmth;
  // Leg coverage of one-piece garments:
  //   jumpsuit (連身褲) ≈ long trousers, romper (連身短褲) ≈ shorts — both scale with thickness;
  //   slip dress ≈ bare legs, knit dress ≈ midi skirt, other dresses ≈ knee-length skirt.
  const dBase = dress?.tags.baseSubType;
  const legWarmth = dress
    ? dBase === 'jumpsuit' ? 1.6 * thicknessFactor(dress.tags.thickness)
      : dBase === 'romper' ? 0.3 * thicknessFactor(dress.tags.thickness)
      : (dBase === 'slip' ? 0.5 : dBase === 'knit' ? 1.1 : 0.8) + (dress.tags.thickness === 'thick' ? 0.2 : 0)
    : bottom.warmth;
  return {
    id: outfitIdFromParts(ordered),
    parts: ordered,
    primary, bottom: bottom ?? null, outer,
    bottomPart: dress ?? bottom,
    isDress: !!dress,
    warmth: round3(warmth),
    legWarmth: round3(legWarmth),
    hasUntagged: ordered.some(p => !p.tagged),
  };
}

function generateCandidates(wardrobe) {
  const list = (cat) => (Array.isArray(wardrobe?.[cat]) ? wardrobe[cat] : [])
    .filter(i => i && typeof i === 'object' && i.id != null)
    .map(i => toPart(i, cat));
  const tops = list('tshirts'), outers = list('jackets'), dresses = list('dresses');
  const bottoms = [...list('pants'), ...list('skirts')];
  const out = [];
  const outerOpts = [null, ...outers];
  for (const t of tops) for (const b of bottoms) for (const o of outerOpts) out.push(buildOutfit([t, b, o].filter(Boolean)));
  for (const d of dresses) for (const o of outerOpts) out.push(buildOutfit([d, o].filter(Boolean)));
  return { candidates: out, counts: { tops: tops.length, bottoms: bottoms.length, outers: outers.length, dresses: dresses.length } };
}

// ── 4. Diversity + shuffle ──────────────────────────────────────

// mulberry32 — small deterministic PRNG
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Palette signature for variety: built-in colours by value, custom colours by hue / lightness band
const colorKey = (p) => {
  if (p.colorRef && typeof p.colorRef === 'object') {
    const d = describeHex(p.colorRef.hex);
    return d.neutral ? `n${Math.round(d.L * 4)}` : `c${Math.round(d.h / 30) % 12}`;
  }
  return p.color;
};
const colorSig = (o) => {
  const cs = o.parts.map(colorKey);
  return cs.every(Boolean) ? [...cs].sort().join('+') : null;
};

function similarity(a, b) {
  let s = 0;
  if (a.primary.id === b.primary.id) s += 0.5;
  if (a.bottom && b.bottom && a.bottom.id === b.bottom.id) s += 0.3;
  if (a.outer && b.outer && a.outer.id === b.outer.id) s += 0.2;
  const ca = colorSig(a), cb = colorSig(b);
  if (ca && ca === cb) s += 0.2;
  if (a.isDress === b.isDress && !!a.outer === !!b.outer) s += 0.1;
  return s;
}

const DIVERSITY_LAMBDA = 0.35;
const SHUFFLE_NOISE    = 0.12;
const SEVERE_PENALTY   = 0.12;   // total-score penalty for a severe colour clash

// Tiers (all candidates here already passed the weather + occasion hard filters):
//   1  high quality: close to the best score, good colour + style, no shared top/dress
//   2  relaxed colour / style (still no severe clash, within TIER2_MARGIN of the best)
//   3  same pool, may reuse a top / bottom across looks (never an identical look)
//   then any non-severe look (small wardrobes), and severe clashes only if nothing else exists.
// Each pass first skips looks shown in the last two shuffles; they are allowed again only
// when there is nothing new left.
const TIER1_MARGIN    = 0.15;
const TIER1_MIN_COLOR = 0.55;
const TIER1_MIN_STYLE = 0.45;
const TIER2_MARGIN    = 0.30;

function selectLooks(scored, n, seed, recentIds) {
  if (!scored.length) return { chosen: [], allRecent: false, tiers: {} };
  const recent = new Set(recentIds ?? []);
  const fine = scored.filter(c => !c.severe);
  const best = (fine[0] ?? scored[0]).total;
  const tier1 = fine.filter(c => c.total >= best - TIER1_MARGIN
    && c.breakdown.color >= TIER1_MIN_COLOR && c.breakdown.style >= TIER1_MIN_STYLE);
  const tier2 = fine.filter(c => c.total >= best - TIER2_MARGIN);

  const rng = makeRng(seed * 2654435761 + 17);
  const noise = new Map(scored.map(c => [c.id, seed > 0 ? SHUFFLE_NOISE * rng() : 0]));

  const chosen = [];   // { c, tier }
  // Constraint levels: 0 no shared top/dress · 1 may share top, not top+bottom · 2 any new look
  const allowed = (cand, level) => {
    if (chosen.some(x => x.c.id === cand.id)) return false;
    if (level === 0) return !chosen.some(x => x.c.primary.id === cand.primary.id);
    if (level === 1) return !chosen.some(x => x.c.primary.id === cand.primary.id && x.c.bottom?.id === cand.bottom?.id);
    return true;
  };
  const pickFrom = (pool, level, allowRecent) => {
    let pick = null, bestAdj = -Infinity;
    for (const c of pool) {
      if (!allowRecent && recent.has(c.id)) continue;
      if (!allowed(c, level)) continue;
      const maxSim = chosen.length ? Math.max(...chosen.map(x => similarity(c, x.c))) : 0;
      const adj = c.total + noise.get(c.id) - DIVERSITY_LAMBDA * maxSim;
      if (adj > bestAdj) { bestAdj = adj; pick = c; }
    }
    return pick;
  };
  const passes = [
    { pool: tier1, level: 0, tier: 1 },
    { pool: tier2, level: 0, tier: 2 },
    { pool: tier2, level: 1, tier: 3 },
    { pool: tier2, level: 2, tier: 3 },
    { pool: fine,  level: 0, tier: 3 },
    { pool: fine,  level: 2, tier: 3 },
  ];
  for (const allowRecent of [false, true]) {
    for (const pass of passes) {
      while (chosen.length < n) {
        const pick = pickFrom(pass.pool, pass.level, allowRecent);
        if (!pick) break;
        chosen.push({ c: pick, tier: pass.tier });
      }
    }
  }
  // Severe colour clashes: only when nothing else can be shown at all
  if (chosen.length === 0) {
    for (const level of [0, 2]) {
      while (chosen.length < n) {
        const pick = pickFrom(scored, level, true);
        if (!pick) break;
        chosen.push({ c: pick, tier: 4 });
      }
    }
  }
  const tiers = {};
  chosen.forEach(x => { tiers[x.tier] = (tiers[x.tier] ?? 0) + 1; });
  return {
    chosen: chosen.map(x => ({ ...x.c, tier: x.tier })),
    allRecent: chosen.length > 0 && chosen.every(x => recent.has(x.c.id)),
    tiers,
    poolSizes: { tier1: tier1.length, tier2: tier2.length, fine: fine.length, severe: scored.length - fine.length },
  };
}

// ── main ────────────────────────────────────────────────────────

const OCC_LABEL = { Casual: 'Casual', School: 'School', Work: 'Work', Date: 'Date' };

const MAX_EXAMPLES = 3;

function evaluateAll(candidates, T, weather, occasion) {
  // excluded[reason] = { count, examples: [{ id, labels, warmth, legWarmth, detail }] }
  const excluded = {};
  const note = (reason, o, detail) => {
    const e = excluded[reason] ?? (excluded[reason] = { count: 0, examples: [] });
    e.count++;
    if (e.examples.length < MAX_EXAMPLES) {
      e.examples.push({
        id: o.id, ids: o.parts.map(p => p.id), labels: o.parts.map(p => p.item.label ?? p.id),
        warmth: o.warmth, legWarmth: o.legWarmth, detail,
      });
    }
  };

  const weatherOk = [];
  let cold = 0, hot = 0;
  for (const o of candidates) {
    const w = weatherEval(o, T, weather);
    if (w.ok) { weatherOk.push({ o, w }); continue; }
    if (w.fail.startsWith('cold')) cold++; else hot++;
    const detail =
      w.fail === 'cold_legs' ? `leg ${o.legWarmth.toFixed(2)} < ${w.legReq.toFixed(2)}`
      : w.fail === 'cold_outer' ? 'no jacket'
      : w.fail === 'hot_thick' ? 'thick item'
      : `W ${o.warmth.toFixed(2)} not in ${w.band.min.toFixed(1)}–${w.band.max.toFixed(1)}`;
    note(w.fail, o, detail);
  }
  const passed = [];
  for (const { o, w } of weatherOk) {
    const oc = occasionEval(o, occasion);
    if (!oc.ok) {
      note(oc.fail, o, oc.fail === 'occ_type' ? oc.detail : `score ${oc.score.toFixed(2)}, formality ${oc.formality.toFixed(1)}`);
      continue;
    }
    const color = outfitColorScore(o.parts.map(p => p.colorRef), occasion);
    const style = styleConsistency(o);
    const total = WEIGHTS.weather * w.score + WEIGHTS.occasion * oc.score + WEIGHTS.color * color.score + WEIGHTS.style * style
      - (color.severe ? SEVERE_PENALTY : 0);
    passed.push({
      ...o,
      severe: color.severe,
      total: round3(total),
      breakdown: {
        weather: round3(w.score), occasion: round3(oc.score), color: color.score, style: round3(style),
        warmth: o.warmth, band: { ideal: round3(w.band.ideal), min: round3(w.band.min), max: round3(w.band.max) },
        legWarmth: o.legWarmth, legReq: round3(Math.max(0, w.legReq)),
        formality: round3(oc.formality), colorLabel: color.label,
        untagged: o.parts.filter(p => !p.tagged).length,
        colorSevere: color.severe,
        colorPairs: color.pairs.map(pr => ({
          a: o.parts[pr.i].colorName, b: o.parts[pr.j].colorName,
          aHex: o.parts[pr.i].colorRef?.hex ?? null, bHex: o.parts[pr.j].colorRef?.hex ?? null,
          score: pr.score, mode: pr.mode,
        })),
      },
    });
  }
  passed.sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : 1));
  return { weatherOk, passed, cold, hot, excluded };
}

/**
 * @returns {{ outfits: Array<{id, items, score, breakdown}>, meta: object }}
 */
export function recommendOutfitsWithMeta(wardrobe, weather, occasion, options = {}) {
  const occ  = OCCASIONS.includes(occasion) ? occasion : 'Casual';
  const seed = Number.isInteger(options.seed) && options.seed > 0 ? options.seed : 0;
  const feels = getFeelsLike(weather);
  const T = feels ?? DEFAULT_TEMP;

  const meta = {
    occasion: occ, seed, feelsLike: T, usedDefaultTemp: feels == null,
    band: warmthBand(T), reason: null, message: null, suggestOccasions: [],
    counts: null, repeated: false,
  };

  const { candidates, counts } = generateCandidates(wardrobe);
  const totalItems = counts.tops + counts.bottoms + counts.outers + counts.dresses;
  meta.counts = { ...counts, candidates: candidates.length, weatherOk: 0, passed: 0, pool: 0 };

  if (totalItems === 0) {
    meta.reason = 'empty';
    meta.message = '衣櫃還是空的，先到 Closet 新增衣服';
    return { outfits: [], meta };
  }
  if (candidates.length === 0) {
    meta.reason = 'missing';
    meta.message = '需要至少一件上衣＋一件下身，或一件洋裝，才能搭配';
    return { outfits: [], meta };
  }

  const { weatherOk, passed, cold, hot, excluded } = evaluateAll(candidates, T, weather, occ);
  meta.excluded = excluded;
  meta.legReq = round3(legRequirement(T));
  meta.counts.weatherOk = weatherOk.length;
  meta.counts.passed = passed.length;

  const t = Math.round(T);
  if (weatherOk.length === 0) {
    if (cold >= hot) {
      meta.reason = 'too_cold';
      const legs = excluded.cold_legs?.count ?? 0;
      const outerMissing = excluded.cold_outer?.count ?? 0;
      const hint = legs >= Math.max(outerMissing, excluded.cold_total?.count ?? 0)
        ? '下半身太薄，建議新增長褲或較厚的長裙'
        : outerMissing > 0 && counts.outers === 0
          ? '低溫需要外套，建議新增一件外套'
          : '建議新增外套、長袖或較厚的單品';
      meta.message = `體感 ${t}°C，衣櫃裡沒有夠暖的組合。${hint}，或到 Closet 補上標籤`;
    } else {
      meta.reason = 'too_hot';
      meta.message = `體感 ${t}°C，衣櫃裡沒有夠清爽的組合。建議新增短袖、薄款上衣或短褲／短裙`;
    }
    return { outfits: [], meta };
  }
  if (passed.length === 0) {
    meta.reason = 'occasion';
    meta.suggestOccasions = OCCASIONS.filter(o => o !== occ &&
      weatherOk.some(({ o: outfit }) => occasionEval(outfit, o).ok));
    meta.message = meta.suggestOccasions.length
      ? `沒有適合 ${OCC_LABEL[occ]} 的搭配，試試 ${meta.suggestOccasions.join('、')}`
      : `沒有適合 ${OCC_LABEL[occ]} 的搭配，可以到 Closet 新增或補上衣服標籤`;
    return { outfits: [], meta };
  }

  const { chosen, allRecent, tiers, poolSizes } = selectLooks(passed, 3, seed, options.recentIds);
  meta.repeated = seed > 0 && allRecent;
  meta.tiers = tiers;
  meta.counts.pool = poolSizes.tier1;
  meta.counts.tier2 = poolSizes.tier2;
  meta.counts.severe = poolSizes.severe;

  // Fewer than 3: say why (shown next to the look count on Home)
  if (chosen.length > 0 && chosen.length < 3) {
    const n = chosen.length;
    meta.shortReason = poolSizes.severe > 0 && poolSizes.fine < 3
      ? `其他組合配色衝突，只列出 ${n} 套`
      : `衣櫃中適合體感 ${Math.round(T)}°C ${OCC_LABEL[occ]} 的組合只有 ${n} 套`;
  }
  if (chosen.some(c => c.tier === 4)) meta.shortReason = '只找到配色較衝突的組合，建議補充中性色單品';

  const outfits = chosen.map(c => ({
    id: c.id,
    items: c.parts.map(p => p.item),
    score: Math.round(c.total * 100),
    tier: c.tier,
    breakdown: c.breakdown,
  }));
  return { outfits, meta };
}

/** Backward-compatible API: returns just the outfit array. */
export const recommendOutfits = (wardrobe, weather, occasion, seed = 0, recentIds = []) =>
  recommendOutfitsWithMeta(wardrobe, weather, occasion, { seed, recentIds }).outfits;

// Exposed for tests / DATA preview
export const __internals = { weatherEval, occasionEval, styleConsistency, buildOutfit, toPart, generateCandidates, OCCASION_RULES };
