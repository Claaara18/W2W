/**
 * Recommender unit tests — pure JS, no app packages needed.
 *
 * Run from the project root:
 *   npx esbuild tests/recommender.test.mjs --bundle --platform=node --format=esm \
 *     --alias:@react-native-async-storage/async-storage=./tests/stubs/asyncStorage.mjs \
 *     --outfile=/tmp/w2w-rec-test.mjs && node /tmp/w2w-rec-test.mjs
 */
import {
  recommendOutfitsWithMeta, recommendOutfits, warmthBand, legRequirement, isSameOutfit, itemIdsFromOutfitId, __internals,
} from '../utils/outfitRecommender.js';
import { pairScore, outfitColorScore } from '../utils/colorHarmony.js';
import { buildRecommendationPreview, runRecommendationPreview } from '../utils/devRecommendationPreview.js';
import AsyncStorageStub from './stubs/asyncStorage.mjs';

let failures = 0, passes = 0;
const ok = (cond, msg) => {
  if (cond) { passes++; console.log('  ok  ', msg); }
  else { failures++; console.log('  FAIL', msg); }
};
const section = (t) => console.log(`\n■ ${t}`);

// ── fixtures ─────────────────────────────────────────────────
let n = 0;
const it = (cat, label, tags = {}) => ({
  id: `${cat}_${1000 + (++n)}`, uri: `file:///x/item_${n}.png`, label, bgRemoved: true,
  ...(Object.keys(tags).length ? { tagStatus: 'confirmed', ...tags } : {}),
});
const T = (sub, sleeve, thick, color, styles, f) =>
  ({ subType: sub, sleeveLength: sleeve, thickness: thick, primaryColor: color, styles, formality: f });

const W = {
  tshirts: [
    it('tshirts', 'white tee',    T('tee', 'short', 'thin', 'white', ['casual', 'minimal'], 1)),
    it('tshirts', 'black tank',   T('tank', 'sleeveless', 'thin', 'black', ['casual', 'street'], 1)),
    it('tshirts', 'blue shirt',   T('shirt', 'long', 'medium', 'blue', ['formal', 'minimal'], 4)),
    it('tshirts', 'pink blouse',  T('blouse', 'short', 'thin', 'pink', ['sweet'], 3)),
    it('tshirts', 'gray hoodie',  T('hoodie', 'long', 'medium', 'gray', ['casual', 'sporty'], 1)),
    it('tshirts', 'beige sweater',T('sweater', 'long', 'thick', 'beige', ['minimal', 'vintage'], 3)),
    it('tshirts', 'green tee',    T('tee', 'short', 'medium', 'green', ['casual'], 1)),
  ],
  jackets: [
    it('jackets', 'denim jacket', T('denim', 'long', 'medium', 'denim', ['casual', 'street'], 2)),
    it('jackets', 'navy blazer',  T('blazer', 'long', 'medium', 'navy', ['formal', 'minimal'], 4)),
    it('jackets', 'black coat',   T('coat', 'long', 'thick', 'black', ['minimal', 'formal'], 4)),
    it('jackets', 'cardigan',     T('cardigan', 'long', 'thin', 'white', ['sweet', 'minimal'], 3)),
  ],
  pants: [
    it('pants', 'blue jeans',     T('jeans', null, 'medium', 'denim', ['casual', 'street'], 2)),
    it('pants', 'black slacks',   T('slacks', null, 'medium', 'black', ['formal', 'minimal'], 4)),
    it('pants', 'gray joggers',   T('joggers', null, 'medium', 'gray', ['sporty', 'casual'], 1)),
    it('pants', 'beige shorts',   T('shorts', null, 'thin', 'beige', ['casual'], 1)),
  ],
  skirts: [
    it('skirts', 'pleated skirt', T('pleated', null, 'thin', 'navy', ['sweet', 'vintage'], 3)),
    it('skirts', 'red mini',      T('mini', null, 'thin', 'red', ['street'], 2)),
  ],
  dresses: [
    it('dresses', 'floral dress', T('casual', 'short', 'thin', 'multi', ['sweet'], 3)),
    it('dresses', 'knit dress',   T('knit', 'long', 'thick', 'gray', ['minimal'], 3)),
  ],
};
const snapshot = JSON.stringify(W);
const byId = Object.fromEntries(Object.values(W).flat().map(i => [i.id, i]));
const labels = (o) => o.items.map(i => i.label).join(' + ');
const weather = (t, extra = {}) => ({ temp: t, feelsLike: t, icon: 'sunny', en: 'Sunny', ...extra });
const OCCS = ['Casual', 'School', 'Work', 'Date'];

// ── 1. warmth bands ──────────────────────────────────────────
section('warmth bands are consistent');
{
  let mono = true, ordered = true;
  for (let t = 38; t >= -2; t -= 1) {
    const a = warmthBand(t), b = warmthBand(t - 1);
    if (!(b.ideal >= a.ideal && b.min >= a.min && b.max >= a.max)) mono = false;
    if (!(a.min <= a.ideal && a.ideal <= a.max)) ordered = false;
  }
  ok(mono, 'ideal/min/max never decrease as it gets colder');
  ok(ordered, 'min ≤ ideal ≤ max at every temperature');
}

// ── 2. spot checks: warmth formula vs examples ───────────────
section('spot checks (warmth W and pass/fail)');
const { buildOutfit, toPart, weatherEval } = __internals;
const P = (label) => { const i = Object.values(W).flat().find(x => x.label === label); return toPart(i, i.id.split('_')[0]); };
const spot = [
  [32, ['white tee', 'beige shorts'], true],
  [32, ['gray hoodie', 'blue jeans'], false],
  [32, ['beige sweater', 'beige shorts'], false],
  [30, ['floral dress'], true],
  [26, ['white tee', 'blue jeans'], true],
  [22, ['white tee', 'beige shorts'], true],
  [22, ['white tee', 'blue jeans'], true],
  [18, ['white tee', 'denim jacket', 'blue jeans'], true],
  [18, ['black tank', 'beige shorts'], false],
  [14, ['white tee', 'blue jeans'], false],
  [14, ['blue shirt', 'denim jacket', 'blue jeans'], true],
  [14, ['beige sweater', 'blue jeans'], true],
  [14, ['beige sweater', 'black coat', 'blue jeans'], false],  // too heavy for 14°C
  [10, ['white tee', 'black coat', 'beige shorts'], false],   // bare legs under 12°C
  [10, ['blue shirt', 'navy blazer', 'black slacks'], true],
  [8,  ['beige sweater', 'blue jeans'], false],               // ≤10°C needs a jacket layer
  [8,  ['beige sweater', 'black coat', 'blue jeans'], true],
  [6,  ['beige sweater', 'black coat', 'pleated skirt'], false], // thin skirt under 8°C
  [4,  ['beige sweater', 'black coat', 'blue jeans'], true],
  [4,  ['white tee', 'blue jeans'], false],
];
for (const [t, names, expect] of spot) {
  const o = buildOutfit(names.map(P));
  const r = weatherEval(o, t, weather(t));
  const b = warmthBand(t);
  ok(r.ok === expect, `${String(t).padStart(2)}°C  ${names.join(' + ').padEnd(42)} W=${o.warmth.toFixed(2)}  band[${b.min.toFixed(1)}–${b.max.toFixed(1)}] ideal ${b.ideal.toFixed(1)} → ${r.ok ? 'OK' : 'excluded(' + r.fail + ')'}`);
}

// ── 3. weather priority over all occasions and many shuffles ──
section('weather is never sacrificed (all occasions × 25 seeds)');
{
  let hotViolations = 0, coldViolations = 0, total = 0;
  for (const occ of OCCS) for (let seed = 0; seed < 25; seed++) {
    for (const o of recommendOutfits(W, weather(33), occ, seed)) {
      total++;
      if (o.items.some(i => ['beige sweater', 'gray hoodie', 'black coat', 'knit dress'].includes(i.label))) hotViolations++;
    }
    for (const o of recommendOutfits(W, weather(5), occ, seed)) {
      total++;
      if (!o.items.some(i => i.categoryId === 'jackets' || i.label === 'beige sweater')) coldViolations++;
      if (o.items.some(i => ['beige shorts', 'red mini', 'black tank'].includes(i.label))) coldViolations++;
    }
  }
  ok(hotViolations === 0, `33°C: no sweater / hoodie / coat / knit dress (${total} looks checked)`);
  ok(coldViolations === 0, '5°C: always a jacket or sweater, never shorts / mini / tank');
}

// ── 4. occasion ──────────────────────────────────────────────
section('occasion rules');
{
  const work = recommendOutfits(W, weather(22), 'Work', 0);
  ok(work.length > 0 && work.every(o => !o.items.some(i => ['gray joggers', 'beige shorts', 'gray hoodie', 'black tank'].includes(i.label))),
    'Work never uses joggers / shorts / hoodie / tank');
  ok(work.every(o => o.breakdown.formality >= 2.5), `Work looks are dressy (formality ${work.map(o => o.breakdown.formality).join(', ')})`);

  // Date must not prefer a dress just for being a dress
  const sporty = it('dresses', 'sporty dress', T('casual', 'short', 'thin', 'gray', ['sporty'], 1));
  const W2 = {
    tshirts: [it('tshirts', 'sweet blouse', T('blouse', 'short', 'thin', 'pink', ['sweet'], 3))],
    pants: [it('pants', 'beige slacks', T('slacks', null, 'thin', 'beige', ['minimal'], 3))],
    dresses: [sporty],
  };
  const date = recommendOutfits(W2, weather(26), 'Date', 0);
  ok(date.length > 0 && date[0].items[0].label === 'sweet blouse', `Date ranks sweet separates above a sporty dress (first: ${date[0] && labels(date[0])})`);
}

// ── 5. colour harmony ────────────────────────────────────────
section('colour harmony (common clothing rules)');
ok(pairScore('black', 'white') > pairScore('black', 'navy'), 'black+white > black+navy');
ok(pairScore('navy', 'red') > pairScore('red', 'green'), 'navy+red > red+green');
ok(pairScore('denim', 'white') > pairScore('denim', 'denim'), 'denim+white > double denim');
ok(pairScore('beige', 'olive') > pairScore('olive', 'purple'), 'beige+olive > olive+purple');
ok(pairScore('multi', 'white') > pairScore('multi', 'red'), 'print+neutral > print+colour');
{
  const accent = outfitColorScore(['white', 'red', 'denim'], 'Casual').score;
  const neutral = outfitColorScore(['white', 'black'], 'Casual').score;
  const clash = outfitColorScore(['red', 'green', 'yellow'], 'Casual').score;
  const workBright = outfitColorScore(['pink', 'blue'], 'Work').score;
  const casualBright = outfitColorScore(['pink', 'blue'], 'Casual').score;
  ok(accent > clash && neutral > clash, `one accent (${accent}) and neutrals (${neutral}) beat 3 brights (${clash})`);
  ok(workBright < casualBright, `two brights score lower for Work (${workBright}) than Casual (${casualBright})`);
  ok(outfitColorScore([null, 'red'], 'Casual').score >= 0.6, 'unknown colour never blocks (≥ 0.6)');
}

// ── 6. diversity ─────────────────────────────────────────────
section('three looks are diverse');
for (const [t, occ] of [[24, 'Casual'], [16, 'School'], [22, 'Work'], [20, 'Date']]) {
  const r = recommendOutfits(W, weather(t), occ, 0);
  const prim = r.map(o => o.items[0].id);
  ok(r.length === 3 && new Set(prim).size === 3, `${occ} ${t}°C: 3 looks, 3 different tops/dresses → ${r.map(labels).join(' | ')}`);
}

// ── 7. shuffle ───────────────────────────────────────────────
section('shuffle really changes looks');
{
  const sets = new Set();
  let recent = [], consecutiveSame = 0, sameSeedStable = true;
  for (let seed = 1; seed <= 20; seed++) {
    const r = recommendOutfitsWithMeta(W, weather(22), 'Casual', { seed, recentIds: recent });
    const ids = r.outfits.map(o => o.id);
    const key = [...ids].sort().join(',');
    if (recent.length && ids.every(id => recent.includes(id))) consecutiveSame++;
    sets.add(key);
    recent = ids;
    const again = recommendOutfitsWithMeta(W, weather(22), 'Casual', { seed, recentIds: [] }).outfits.map(o => o.id).join();
    const first = recommendOutfitsWithMeta(W, weather(22), 'Casual', { seed, recentIds: [] }).outfits.map(o => o.id).join();
    if (again !== first) sameSeedStable = false;
  }
  ok(sets.size >= 8, `20 shuffles → ${sets.size} different sets of 3`);
  ok(consecutiveSame === 0, 'no shuffle repeats exactly the previous three');
  ok(sameSeedStable, 'same seed + same input → same result (no reshuffle on re-render)');
  const best = recommendOutfitsWithMeta(W, weather(22), 'Casual', { seed: 0 }).outfits[0].score;
  let worst = 100;
  for (let seed = 1; seed <= 20; seed++) for (const o of recommendOutfits(W, weather(22), 'Casual', seed)) worst = Math.min(worst, o.score);
  ok(best - worst <= 20, `shuffled looks stay close to the best (best ${best}, lowest shown ${worst})`);
}

// ── 8. stable ids ────────────────────────────────────────────
section('stable outfit ids');
{
  const a = recommendOutfits(W, weather(22), 'Casual', 0);
  const allIds = new Map();
  for (const occ of OCCS) for (let s = 0; s < 10; s++) for (const o of recommendOutfits(W, weather(22), occ, s)) {
    const key = o.items.map(i => i.id).join('+');
    if (allIds.has(key) && allIds.get(key) !== o.id) allIds.set(key, 'CONFLICT');
    else allIds.set(key, o.id);
  }
  ok(![...allIds.values()].includes('CONFLICT'), 'same garments → same id across seeds and occasions');
  ok(a.every(o => itemIdsFromOutfitId(o.id).join('+') === o.items.map(i => i.id).join('+')), 'id encodes exactly the garments');
  const [t, b, j] = ['tshirts_1', 'pants_2', 'jackets_3'];
  ok(isSameOutfit(`outfit_1_${t}|${b}|${j}`, `outfit_v2_${t}+${j}+${b}`), 'legacy saved id outfit_<rank>_a|b|c matches the new id');
  ok(!isSameOutfit(`outfit_0_${t}|${b}`, `outfit_v2_${t}+${j}+${b}`), 'different garments do not match');
}

// ── 9. untagged old clothes ──────────────────────────────────
section('untagged wardrobe still works');
{
  let m = 0;
  const raw = (cat, label) => ({ id: `${cat}_${5000 + (++m)}`, uri: `file:///x/old_${m}.png`, label, bgRemoved: true });
  const U = {
    tshirts: [raw('tshirts', 'old top A'), raw('tshirts', 'old top B'), raw('tshirts', 'old top C')],
    jackets: [raw('jackets', 'old jacket')],
    pants: [raw('pants', 'old pants A'), raw('pants', 'old pants B')],
    skirts: [raw('skirts', 'old skirt')],
    dresses: [raw('dresses', 'old dress')],
  };
  const uSnap = JSON.stringify(U);
  for (const t of [32, 24, 16, 8]) {
    const counts = OCCS.map(o => `${o}:${recommendOutfits(U, weather(t), o, 0).length}`).join(' ');
    const all = OCCS.every(o => recommendOutfits(U, weather(t), o, 0).length > 0);
    ok(all, `${t}°C untagged → ${counts}`);
  }
  ok(JSON.stringify(U) === uSnap, 'untagged wardrobe object not mutated');
}

// ── 10. not enough clothes / no match ────────────────────────
section('insufficient wardrobe → reason, never padding');
{
  const one = { tshirts: [W.tshirts[0]], pants: [W.pants[0]] };
  const r1 = recommendOutfitsWithMeta(one, weather(24), 'Casual');
  ok(r1.outfits.length === 1, `1 top + 1 bottom → exactly 1 look (no padding)`);
  const r2 = recommendOutfitsWithMeta({ tshirts: [W.tshirts[0]] }, weather(24), 'Casual');
  ok(r2.outfits.length === 0 && r2.meta.reason === 'missing', `only a top → reason "missing": ${r2.meta.message}`);
  const summer = { tshirts: [W.tshirts[0], W.tshirts[1]], pants: [W.pants[3]] };
  const r3 = recommendOutfitsWithMeta(summer, weather(6), 'Casual');
  ok(r3.outfits.length === 0 && r3.meta.reason === 'too_cold', `6°C summer clothes → "too_cold": ${r3.meta.message}`);
  const winter = { tshirts: [W.tshirts[5]], jackets: [W.jackets[2]], pants: [W.pants[0]] };
  const r4 = recommendOutfitsWithMeta(winter, weather(34), 'Casual');
  ok(r4.outfits.length === 0 && r4.meta.reason === 'too_hot', `34°C winter clothes → "too_hot": ${r4.meta.message}`);
  const sporty = { tshirts: [W.tshirts[4]], pants: [W.pants[2]] };
  const r5 = recommendOutfitsWithMeta(sporty, weather(20), 'Work');
  ok(r5.outfits.length === 0 && r5.meta.reason === 'occasion' && r5.meta.suggestOccasions.includes('Casual'),
    `hoodie + joggers for Work → "occasion": ${r5.meta.message}`);
  const r6 = recommendOutfitsWithMeta({}, weather(20), 'Casual');
  ok(r6.meta.reason === 'empty', 'empty wardrobe → "empty"');
  const r7 = recommendOutfitsWithMeta(W, { temp: '--' }, 'Casual');
  ok(r7.outfits.length > 0 && r7.meta.usedDefaultTemp && r7.meta.feelsLike === 22, 'no weather → 22°C default, still recommends');
}

// ── 11. data safety ──────────────────────────────────────────
section('data safety');
ok(JSON.stringify(W) === snapshot, 'input wardrobe not mutated after all runs');
{
  const o = recommendOutfits(W, weather(22), 'Casual', 0)[0];
  const src = byId[o.items[0].id];
  ok(['id', 'uri', 'label', 'bgRemoved'].every(k => o.items[0][k] === src[k]) && o.items[0].categoryId, 'output items keep id/uri/label/bgRemoved and add categoryId');
}

// ── 12. Home integration (Stage 2 flows) ─────────────────────
section('Home integration: weather, shuffle memory, legacy favourites');
{
  // Same shape HomeScreen builds from the real Open-Meteo response
  const fresh = { temp: 15, feelsLike: 14, dailyMin: 14.3, dailyMax: 17.4, precipProb: 8, windSpeed: 3.4, icon: 'cloud', en: 'Cloudy' };
  const r = recommendOutfitsWithMeta(W, fresh, 'Casual');
  ok(r.meta.feelsLike === 14, `feels-like (14) is used instead of actual temp (15)`);
  const oldCache = { temp: 18, icon: 'sunny', en: 'Sunny', at: Date.now() };          // cache saved before Stage 2
  ok(recommendOutfitsWithMeta(W, oldCache, 'Casual').meta.feelsLike === 18, 'old cache without feelsLike → falls back to actual temp');
  const noWeather = { temp: '--', feelsLike: null, en: 'N/A', icon: 'cloud-outline' };
  const nw = recommendOutfitsWithMeta(W, noWeather, 'Casual');
  ok(nw.outfits.length === 3 && nw.meta.usedDefaultTemp, 'weather API failure with no cache → 22°C estimate, 3 looks');

  // Shuffle exactly the way HomeScreen does it: recent = last two rounds (max 6 ids)
  for (const [t, occ] of [[22, 'Casual'], [14, 'Work'], [28, 'Date']]) {
    let recent = [], seed = 0, prev = null, repeatsOfPrev = 0, overlapWithLast2 = 0, rounds = 15;
    const seen = new Set();
    for (let k = 0; k < rounds; k++) {
      const out = recommendOutfitsWithMeta(W, weather(t), occ, { seed, recentIds: recent }).outfits;
      const ids = out.map(o => o.id);
      if (prev && ids.join() === prev.join()) repeatsOfPrev++;
      overlapWithLast2 += ids.filter(id => recent.includes(id)).length;
      ids.forEach(id => seen.add(id));
      recent = [...ids, ...recent].slice(0, 6);
      prev = ids; seed++;
    }
    ok(repeatsOfPrev === 0, `${occ} ${t}°C: ${rounds} presses, never the same three twice in a row; ${seen.size} different looks seen; ${overlapWithLast2} looks repeated from the previous two rounds`);
  }

  // Legacy favourites saved by the old recommender: outfit_<rank>_<top|bottom|jacket>
  const cur = recommendOutfits(W, weather(14), 'Work', 0);
  const target = cur.find(o => o.items.length === 3) ?? cur[0];
  const [a, b, c] = target.items.map(i => i.id);   // [top, outer, bottom]
  const legacyId = c ? `outfit_2_${a}|${c}|${b}` : `outfit_0_${a}|${b}`;
  const collection = { favorites: [], work: [{ id: legacyId, label: 'Work Look', items: [] }], casual: [{ id: 'look_1700000000000', items: [] }] };
  const findSavedLook = (outfitId) => {   // same logic as HomeScreen
    for (const cat of Object.keys(collection)) {
      const look = collection[cat].find(l => isSameOutfit(l.id, outfitId));
      if (look) return { cat, id: look.id };
    }
    return null;
  };
  const found = findSavedLook(target.id);
  ok(found && found.cat === 'work' && found.id === legacyId, `legacy favourite "${legacyId}" shows ♡ on new card "${target.id}"`);
  ok(cur.filter(o => o.id !== target.id).every(o => !findSavedLook(o.id)), 'other cards are not marked as favourites');
  ok(!isSameOutfit('look_1700000000000', target.id), 'Match-saved looks (look_<time>) never match a Home card');
}

// ── 13. Stage 3: lower-body warmth ───────────────────────────
section('Stage 3: lower body is checked separately');
{
  let mono = true;
  for (let t = 30; t >= 0; t--) if (legRequirement(t - 1) < legRequirement(t)) mono = false;
  ok(mono, 'leg requirement never decreases as it gets colder');

  const L = (cat, label, tags) => it(cat, label, tags);
  const sweater = L('tshirts', 'gray sweater', T('sweater', 'long', 'medium', 'gray', ['minimal'], 3));
  const tee     = L('tshirts', 'plain tee', T('tee', 'long', 'medium', 'white', ['casual'], 2));
  const coat    = L('jackets', 'camel coat', T('coat', 'long', 'thick', 'beige', ['minimal', 'formal'], 4));
  const pleatedThin = L('skirts', 'thin pleated', T('pleated', null, 'thin', 'navy', ['sweet'], 3));
  const pleatedMed  = L('skirts', 'medium pleated', T('pleated', null, 'medium', 'navy', ['sweet'], 3));
  const midiMed     = L('skirts', 'medium midi', T('midi', null, 'medium', 'brown', ['vintage'], 3));
  const maxiThick   = L('skirts', 'thick maxi', T('maxi', null, 'thick', 'black', ['minimal'], 3));
  const jeans       = L('pants', 'jeans', T('jeans', null, 'medium', 'denim', ['casual'], 2));
  const shortsThin  = L('pants', 'thin shorts', T('shorts', null, 'thin', 'beige', ['casual'], 1));
  const untaggedSkirt = { id: 'skirts_9001', uri: 'file:///x/u.png', label: 'old skirt (untagged)', bgRemoved: true };
  const { weatherEval } = __internals;
  const check = (t, parts) => {
    const o = buildOutfit(parts.map(i => toPart(i, i.id.split('_')[0])));
    return { o, r: weatherEval(o, t, weather(t)) };
  };
  const cases = [
    [8,  [tee, coat, pleatedThin], false, 'cold_legs'],      // the reported problem
    [8,  [sweater, coat, pleatedThin], false, 'cold_legs'],
    [8,  [sweater, coat, pleatedMed], false, 'cold_legs'],
    [8,  [sweater, coat, untaggedSkirt], false, 'cold_legs'], // untagged skirt gets no leg tolerance
    [8,  [sweater, coat, midiMed], true],
    [8,  [sweater, coat, maxiThick], true],
    [8,  [sweater, coat, jeans], true],
    [12, [sweater, coat, pleatedThin], false, 'cold_legs'],
    [12, [tee, coat, pleatedMed], true],
    [16, [tee, shortsThin], false, 'cold'],
    [20, [tee, shortsThin], true],
  ];
  for (const [t, parts, expect, failCode] of cases) {
    const { o, r } = check(t, parts);
    // failCode 'cold' accepts any cold_* reason (several rules may apply; total warmth is checked first)
    const good = r.ok === expect && (expect || r.fail === failCode || (failCode === 'cold' && r.fail.startsWith('cold')));
    ok(good, `${String(t).padStart(2)}°C ${parts.map(p => p.label).join(' + ').padEnd(40)} leg ${o.legWarmth.toFixed(2)} (need ${legRequirement(t).toFixed(2)}) → ${r.ok ? 'OK' : r.fail}`);
  }

  // Whole recommender at 8°C never returns legs below the requirement
  const closet = { tshirts: [sweater, tee, W.tshirts[2]], jackets: [coat, W.jackets[0]], skirts: [pleatedThin, pleatedMed, midiMed], pants: [jeans, shortsThin] };
  let bad = 0, shown = 0;
  for (const occ of OCCS) for (let s = 0; s < 15; s++) for (const o of recommendOutfits(closet, weather(8), occ, s)) {
    shown++;
    if (o.breakdown.legWarmth < legRequirement(8)) bad++;
    if (o.items.some(i => i.label === 'thin pleated' || i.label === 'medium pleated' || i.label === 'thin shorts')) bad++;
  }
  ok(shown > 0 && bad === 0, `8°C × 4 occasions × 15 shuffles: ${shown} looks, none with thin pleated skirt / shorts`);
}

// ── 14. Stage 3: occasion fairness ───────────────────────────
section('Stage 3: occasion fairness');
{
  // Same tags on a dress and on separates → the dress must not win just for being a dress
  const tags = T('casual', 'short', 'thin', 'pink', ['sweet'], 3);
  const dress = it('dresses', 'pink dress', tags);
  const top = it('tshirts', 'pink top', T('blouse', 'short', 'thin', 'pink', ['sweet'], 3));
  const skirt = it('skirts', 'white skirt', T('midi', null, 'thin', 'white', ['sweet'], 3));
  const r = recommendOutfitsWithMeta({ tshirts: [top], skirts: [skirt], dresses: [dress] }, weather(26), 'Date');
  const dScore = r.outfits.find(o => o.items[0].label === 'pink dress')?.score ?? 0;
  const sScore = r.outfits.find(o => o.items[0].label === 'pink top')?.score ?? 0;
  ok(dScore <= sScore + 1, `Date, identical tags: dress ${dScore} vs separates ${sScore} (no dress bonus)`);

  const sportyDress = it('dresses', 'sporty dress', T('casual', 'short', 'thin', 'gray', ['sporty'], 1));
  const rd = recommendOutfitsWithMeta({ dresses: [sportyDress] }, weather(26), 'Date');
  ok(rd.outfits.length === 0 || rd.outfits[0].breakdown.occasion < 0.6, `a sporty formality-1 dress is weak or excluded for Date (${rd.outfits.length ? rd.outfits[0].breakdown.occasion : 'excluded'})`);

  // Work: tagged casual clothes are excluded; dressy ones pass
  const casualOnly = { tshirts: [W.tshirts[0], W.tshirts[6]], pants: [W.pants[0]] };   // tees + jeans, all formality 1–2
  const rw = recommendOutfitsWithMeta(casualOnly, weather(22), 'Work');
  ok(rw.outfits.length === 0 && rw.meta.reason === 'occasion', `Work with only tagged tees + jeans → no padding: ${rw.meta.message}`);
  const work = recommendOutfits(W, weather(16), 'Work', 0);
  ok(work.every(o => o.breakdown.formality >= 2.5 && !o.items.some(i => (i.styles ?? []).includes('sporty'))),
    `Work 16°C: formality ≥ 2.5 and no sporty items (${work.map(o => o.breakdown.formality).join(', ')})`);
}

// ── 15. Stage 3: exclusion stats + preview tool ──────────────
section('Stage 3: exclusion reasons and DATA preview');
{
  for (const [t, occ] of [[8, 'Work'], [32, 'Date'], [16, 'School']]) {
    const r = recommendOutfitsWithMeta(W, weather(t), occ);
    const ex = r.meta.excluded;
    const excludedTotal = Object.values(ex).reduce((s, e) => s + e.count, 0);
    ok(excludedTotal + r.meta.counts.passed === r.meta.counts.candidates,
      `${t}°C ${occ}: excluded ${excludedTotal} + passed ${r.meta.counts.passed} = candidates ${r.meta.counts.candidates}  (${Object.entries(ex).map(([k, e]) => `${k}:${e.count}`).join(' ')})`);
  }
  const text = buildRecommendationPreview(W);
  const headers = (text.match(/^── \d+°C · \w+ ──/gm) ?? []).length;
  ok(headers === 16, `preview has 16 scenarios (found ${headers})`);
  ok(text.includes('excluded:') && text.includes('下半身太薄'), 'preview lists exclusion reasons (incl. 下半身太薄)');

  // Reads the saved wardrobe read-only
  AsyncStorageStub.__store.set('@w2w_wardrobe', JSON.stringify(W));
  const before = AsyncStorageStub.__store.get('@w2w_wardrobe');
  const txt = await runRecommendationPreview();
  ok(txt.includes('summary') && AsyncStorageStub.__store.get('@w2w_wardrobe') === before && AsyncStorageStub.__store.size === 1,
    'runRecommendationPreview reads @w2w_wardrobe and writes nothing');
  AsyncStorageStub.__store.set('@w2w_wardrobe', '{broken');
  ok((await runRecommendationPreview()).includes('解析失敗'), 'broken JSON → message, no crash, no write');
}

// ── sample output for review ────────────────────────────────
section('sample recommendations (seed 0)');
for (const t of [33, 26, 20, 14, 8]) for (const occ of OCCS) {
  const r = recommendOutfitsWithMeta(W, weather(t), occ);
  const line = r.outfits.length
    ? r.outfits.map(o => `${labels(o)} (${o.score})`).join(' | ')
    : `— ${r.meta.message}`;
  console.log(`  ${String(t).padStart(2)}°C ${occ.padEnd(6)} ${line}`);
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exitCode = 1;
