/**
 * HEX colour scoring, tiered three-look selection and custom-type occasion rules.
 *
 * Run from the project root:
 *   npx esbuild tests/colorAndTiers.test.mjs --bundle --platform=node --format=esm \
 *     --alias:@react-native-async-storage/async-storage=./tests/stubs/asyncStorage.mjs \
 *     --outfile=/tmp/w2w-color-test.mjs && node /tmp/w2w-color-test.mjs
 */
import { COLORS, customValue } from '../utils/wardrobeSchema.js';
import { pairScore, pairDetail, outfitColorScore, hexPairScore, describeHex, isNeutralColor } from '../utils/colorHarmony.js';
import { recommendOutfitsWithMeta, recommendOutfits, itemIdsFromOutfitId } from '../utils/outfitRecommender.js';
import { addSubType, addColor, emptyLibrary } from '../utils/customTags.js';

let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ok  ', msg); } else { failures++; console.log('  FAIL', msg); } };
const section = (t) => console.log(`\n■ ${t}`);
const weather = (t) => ({ temp: t, feelsLike: t, icon: 'sunny', en: 'Sunny' });
const cc = (label, hex) => { const e = addColor(emptyLibrary(), { label, hex }).entry; return { value: e.base, hex: e.hex, custom: true, entry: e }; };

// ── 1. built-in colours unchanged ────────────────────────────
section('built-in colours keep the old table scores');
{
  // Values from the original tables (frozen before this change)
  const frozen = [
    ['black', 'white', 0.92], ['black', 'navy', 0.60], ['denim', 'denim', 0.62], ['navy', 'red', 0.93],
    ['red', 'green', 0.25], ['beige', 'olive', 0.93], ['olive', 'purple', 0.35], ['multi', 'white', 0.85],
    ['multi', 'red', 0.40], ['pink', 'pink', 0.78], ['black', 'brown', 0.62], ['blue', 'pink', 0.70],
    ['gray', 'gray', 0.84], ['orange', 'yellow', 0.50], [null, 'red', 0.70],
  ];
  ok(frozen.every(([a, b, v]) => pairScore(a, b) === v && pairScore(b, a) === v), `${frozen.length} frozen table values identical`);
  const vals = COLORS.map(c => c.value);
  let same = true;
  for (const a of vals) for (const b of vals) if (pairScore(a, b) !== pairScore({ value: a }, { value: b }) || pairDetail(a, b).mode !== 'table') same = false;
  ok(same, 'all 16×16 built-in pairs use the table (string and object input identical)');
  // Outfit-level values recorded by the earlier test run
  ok(outfitColorScore(['white', 'red', 'denim'], 'Casual').score === 0.949, 'accent outfit still 0.949');
  ok(outfitColorScore(['white', 'black'], 'Casual').score === 0.92, 'neutral outfit still 0.92');
  ok(outfitColorScore(['red', 'green', 'yellow'], 'Casual').score === 0.182, 'three brights still 0.182');
  ok(outfitColorScore(['pink', 'blue'], 'Work').score === 0.6 && outfitColorScore(['pink', 'blue'], 'Casual').score === 0.7, 'Work / Casual two-bright values unchanged');
  ok(COLORS.filter(c => c.hex).every(c => describeHex(c.hex).neutral === isNeutralColor(c.value)), 'HEX model agrees with every built-in colour on neutral vs colour');
}

// ── 2. custom colours really use HEX ─────────────────────────
section('custom colours are scored from their own HEX');
const wine = cc('酒紅', '#722F37'), oat = cc('燕麥色', '#D8C8A8'), cream = cc('奶油黃', '#F3E5AB'), haze = cc('霧霾藍', '#7A8FA6');
const neonPink = cc('螢光粉', '#FF1493'), neonGreen = cc('螢光綠', '#39FF14'), forest = cc('森林綠', '#3E6B5A');
const deepNavy = cc('深海軍', '#1B2233'), lavender = cc('薰衣草', '#C9A0DC'), rose = cc('乾燥玫瑰', '#E8B4B8');
ok(pairDetail(wine, 'green').mode === 'hex' && pairScore(wine, 'green') !== pairScore('red', 'green'),
  `酒紅 is not just "red": 酒紅×green ${pairScore(wine, 'green')} vs red×green ${pairScore('red', 'green')}`);
ok(pairScore(wine, oat) >= 0.85, `酒紅 + 燕麥色 → ${pairScore(wine, oat)}`);
ok(pairScore(cream, haze) >= 0.8, `奶油黃 + 霧霾藍 → ${pairScore(cream, haze)}`);
ok(pairScore(neonPink, neonGreen) <= 0.25, `螢光粉 + 螢光綠 → ${pairScore(neonPink, neonGreen)} (strong clash)`);
ok(outfitColorScore([neonPink, neonGreen], 'Casual').severe, 'neon pink + neon green outfit is a severe clash');
ok(pairScore(neonPink, 'black') >= 0.8, `bold is fine with a neutral: 螢光粉 + 黑 → ${pairScore(neonPink, 'black')}`);
ok(pairScore(wine, forest) >= 0.6, `colour-blocking is not always bad: 酒紅 + 森林綠 → ${pairScore(wine, forest)}`);
ok(pairScore(lavender, rose) >= 0.72, `pastel pair: 薰衣草 + 乾燥玫瑰 → ${pairScore(lavender, rose)}`);
ok(pairScore(deepNavy, 'black') <= 0.65, `dark-on-dark: 深海軍 + 黑 → ${pairScore(deepNavy, 'black')}`);
{
  const contrast = hexPairScore('#722F37', '#D98880');   // same family, clear lightness step
  const flat     = hexPairScore('#722F37', '#8A2E3E');   // same family, almost same lightness
  ok(contrast > flat, `tone-on-tone with contrast (${contrast}) > without (${flat})`);
  // complementary pair: more chroma on both → lower
  const muted = hexPairScore('#7A5A60', '#5A7A70'), loud = hexPairScore('#E0115F', '#11C08A');
  ok(muted > loud, `complementary: muted (${muted}) > both very saturated (${loud})`);
}

// ── 3. ΔE threshold has no score jumps ───────────────────────
section('ΔE < 6 snapping is smooth (no sudden jumps)');
{
  const mix = (h1, h2, t) => {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const ch = (sh) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
    return '#' + [16, 8, 0].map(sh => ch(sh).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  // A real jump keeps the same size however finely we sample; a smooth curve's steps shrink.
  const largestStep = (from, to, partner, steps) => {
    let maxStep = 0, prev = null;
    for (let k = 0; k <= steps; k++) {
      const s = pairScore({ value: null, hex: mix(from, to, k / steps), custom: true }, partner);
      if (prev != null) maxStep = Math.max(maxStep, Math.abs(s - prev));
      prev = s;
    }
    return maxStep;
  };
  for (const [from, to, partner] of [['#C23B3B', '#722F37', 'navy'], ['#C23B3B', '#3E6B5A', 'yellow'], ['#D9C7A7', '#F3E5AB', 'denim'], ['#5B7FA6', '#7A8FA6', 'white'], ['#1E1E1E', '#1F2A44', 'white']]) {
    const coarse = largestStep(from, to, partner, 60);
    const fine = largestStep(from, to, partner, 240);
    ok(coarse <= 0.08 && (coarse <= 0.02 || fine <= 0.6 * coarse),
      `${from} → ${to} vs ${partner}: largest step ${coarse.toFixed(3)} (60 steps) → ${fine.toFixed(3)} (240 steps), no jump`);
  }
  ok(pairScore({ value: 'red', hex: '#C23B3B', custom: true }, 'navy') === pairScore('red', 'navy'), 'custom colour identical to a built-in → exactly the table score');
}

// ── 4. HEX model is calibrated against the tables ────────────
section('HEX model roughly agrees with the hand-made tables');
{
  const hexes = COLORS.filter(c => c.hex);
  let sum = 0, n = 0;
  for (let i = 0; i < hexes.length; i++) for (let j = i; j < hexes.length; j++) {
    sum += Math.abs(hexPairScore(hexes[i].hex.toUpperCase(), hexes[j].hex.toUpperCase()) - pairScore(hexes[i].value, hexes[j].value)); n++;
  }
  ok(sum / n <= 0.12, `mean difference to table over ${n} built-in pairs: ${(sum / n).toFixed(3)}`);
  const H = Object.fromEntries(hexes.map(c => [c.value, c.hex.toUpperCase()]));
  const order = [['black', 'white', 'black', 'navy'], ['navy', 'red', 'red', 'green'], ['denim', 'white', 'denim', 'denim'], ['beige', 'olive', 'olive', 'purple']];
  ok(order.every(([a, b, c, d]) => hexPairScore(H[a], H[b]) > hexPairScore(H[c], H[d])), 'same ordering as the tables on key pairs');
}

// ── recommender fixtures ─────────────────────────────────────
let n = 0;
const it = (cat, label, tags = {}) => ({ id: `${cat}_${7000 + (++n)}`, uri: `file:///x/${n}.png`, label, bgRemoved: true, tagStatus: 'confirmed', ...tags });
const T = (sub, sleeve, thick, color, styles, f) => ({ subType: sub, sleeveLength: sleeve, thickness: thick, primaryColor: color, styles, formality: f });
const withColor = (item, c) => ({ ...item, primaryColor: customValue(c.entry.id), customColor: c.entry });

// ── 5. custom types in Work ──────────────────────────────────
section('custom types are judged by their own tags for the occasion');
{
  const lib0 = emptyLibrary();
  const vestE = addSubType(lib0, 'tshirts', { label: '針織背心', base: 'tank' }).entry;
  const shortE = addSubType(lib0, 'pants', { label: '西裝短褲', base: 'shorts' }).entry;
  const vest = (tags) => it('tshirts', '針織背心', { subType: customValue(vestE.id), customSubType: vestE, sleeveLength: 'sleeveless', ...tags });
  const slacks = it('pants', 'slacks', T('slacks', null, 'medium', 'black', ['formal', 'minimal'], 4));
  const formalVest = vest({ thickness: 'medium', primaryColor: 'gray', styles: ['formal'], formality: 4 });
  const casualVest = vest({ thickness: 'medium', primaryColor: 'gray', styles: ['casual'], formality: 2 });
  const sheerVest  = vest({ thickness: 'thin', primaryColor: 'gray', styles: ['formal'], formality: 4 });
  const plainF3    = vest({ thickness: 'medium', primaryColor: 'gray', styles: [], formality: 3 });
  const r1 = recommendOutfitsWithMeta({ tshirts: [formalVest], pants: [slacks] }, weather(24), 'Work');
  ok(r1.outfits.length === 1, `formal knit vest (medium, Formal, f4) appears for Work (score ${r1.outfits[0]?.score})`);
  ok(recommendOutfitsWithMeta({ tshirts: [casualVest], pants: [slacks] }, weather(24), 'Work').outfits.length === 0, 'casual knit vest (f2) still excluded for Work');
  ok(recommendOutfitsWithMeta({ tshirts: [sheerVest], pants: [slacks] }, weather(24), 'Work').outfits.length === 0, 'thin (sheer) vest stays excluded even if tagged Formal');
  const r4 = recommendOutfitsWithMeta({ tshirts: [plainF3], pants: [slacks] }, weather(24), 'Work');
  ok(r4.outfits.length === 0 || r4.outfits[0].score < r1.outfits[0].score, 'formality 3 without a dressy style gets a bigger penalty');
  const builtinTank = it('tshirts', 'tank', T('tank', 'sleeveless', 'medium', 'gray', ['formal'], 4));
  ok(recommendOutfitsWithMeta({ tshirts: [builtinTank], pants: [slacks] }, weather(24), 'Work').outfits.length === 0, 'built-in tank keeps the old Work rule');
  const shirt = it('tshirts', 'shirt', T('shirt', 'long', 'medium', 'white', ['formal'], 4));
  const suitShorts = it('pants', '西裝短褲', { subType: customValue(shortE.id), customSubType: shortE, thickness: 'medium', primaryColor: 'navy', styles: ['formal'], formality: 4 });
  ok(recommendOutfitsWithMeta({ tshirts: [shirt], pants: [suitShorts] }, weather(28), 'Work').outfits.length === 0, '"Formal" tag cannot make shorts-based custom pants pass Work');
}

// ── 6. weather still first ───────────────────────────────────
section('weather rules (generalised thick rule)');
{
  const lib0 = emptyLibrary();
  const woolE = addSubType(lib0, 'tshirts', { label: '毛背心', base: null }).entry;
  const wool = it('tshirts', '毛背心', { subType: customValue(woolE.id), customSubType: woolE, sleeveLength: 'long', thickness: 'thick', primaryColor: 'beige', formality: 2 });
  const tee = it('tshirts', 'tee', T('tee', 'short', 'thin', 'white', ['casual'], 1));
  const jeans = it('pants', 'jeans', T('jeans', null, 'medium', 'denim', ['casual'], 2));
  const knit = it('dresses', 'knit dress', T('knit', 'long', 'thick', 'gray', ['minimal'], 3));
  const r = recommendOutfits({ tshirts: [wool, tee], pants: [jeans], dresses: [knit] }, weather(25), 'Casual');
  ok(r.length >= 1 && r.every(o => !o.items.some(i => i.label === '毛背心' || i.label === 'knit dress')), 'thick custom top (no base) and thick knit dress are not shown at 25°C');
}

// ── 7. three looks + tiers ───────────────────────────────────
section('three different looks, tiered fallback');
{
  // Rich closet → three tier-1 looks with different tops
  const tops = ['white', 'black', 'gray', 'beige'].map((c, k) => it('tshirts', `tee ${c}`, T('tee', 'short', 'medium', c, ['casual', 'minimal'], 2)));
  const pants = ['denim', 'black'].map(c => it('pants', `jeans ${c}`, T('jeans', null, 'medium', c, ['casual'], 2)));
  const rich = recommendOutfitsWithMeta({ tshirts: tops, pants }, weather(24), 'Casual');
  ok(rich.outfits.length === 3 && new Set(rich.outfits.map(o => o.items[0].id)).size === 3 && rich.outfits.every(o => o.tier === 1),
    `rich closet → 3 tier-1 looks, 3 different tops (tiers ${rich.outfits.map(o => o.tier)})`);

  // One good top, others clash in colour/style with the only bottom → still 3 looks via tier 2/3
  const good = it('tshirts', 'white shirt', T('shirt', 'short', 'thin', 'white', ['minimal'], 3));
  const meh1 = it('tshirts', 'orange tee', T('tee', 'short', 'thin', 'orange', ['street'], 2));
  const meh2 = it('tshirts', 'purple tee', T('tee', 'short', 'thin', 'purple', ['sporty'], 2));
  const skirt = it('skirts', 'red skirt', T('midi', null, 'thin', 'red', ['sweet'], 3));
  const tight = recommendOutfitsWithMeta({ tshirts: [good, meh1, meh2], skirts: [skirt] }, weather(26), 'Casual');
  ok(tight.outfits.length === 3 && tight.outfits.some(o => o.tier > 1), `few good matches → still 3 looks (tiers ${tight.outfits.map(o => o.tier)})`);
  ok(new Set(tight.outfits.map(o => o.id)).size === 3, 'no look is duplicated to fill the three');

  // Item reuse: one pair of jeans with three tops
  const reuse = recommendOutfitsWithMeta({ tshirts: tops.slice(0, 3), pants: [pants[0]] }, weather(24), 'Casual');
  ok(reuse.outfits.length === 3 && reuse.outfits.every(o => o.items.some(i => i.id === pants[0].id)) && new Set(reuse.outfits.map(o => o.items[0].id)).size === 3,
    'one pair of jeans + three different tops → 3 looks');

  // Genuinely too few → 1–2 looks with a reason, never padded
  const two = recommendOutfitsWithMeta({ tshirts: tops.slice(0, 2), pants: [pants[0]] }, weather(24), 'Casual');
  ok(two.outfits.length === 2 && /只有 2 套/.test(two.meta.shortReason ?? ''), `2 possible looks → 2 shown with reason: "${two.meta.shortReason}"`);

  // Severe clash never preferred
  const pinkTop = withColor(it('tshirts', 'neon pink top', T('tee', 'short', 'thin', null, ['street'], 2)), neonPink);
  const greenPants = withColor(it('pants', 'neon green pants', T('wide', null, 'thin', null, ['street'], 2)), neonGreen);
  const blackPants = it('pants', 'black pants', T('wide', null, 'thin', 'black', ['street'], 2));
  const wSev = { tshirts: [pinkTop, tops[0]], pants: [greenPants, blackPants] };
  let severeShown = 0, shown = 0;
  for (let s = 0; s < 15; s++) for (const o of recommendOutfits(wSev, weather(26), 'Casual', s)) {
    shown++;
    if (o.items.some(i => i.label === 'neon pink top') && o.items.some(i => i.label === 'neon green pants')) severeShown++;
  }
  ok(shown > 0 && severeShown === 0, `neon pink + neon green never shown while alternatives exist (${shown} looks over 15 shuffles)`);
  const onlySevere = recommendOutfitsWithMeta({ tshirts: [pinkTop], pants: [greenPants] }, weather(26), 'Casual');
  ok(onlySevere.outfits.length === 1 && onlySevere.outfits[0].tier === 4 && /衝突/.test(onlySevere.meta.shortReason),
    `only a clashing combo exists → shown as last resort with a note ("${onlySevere.meta.shortReason}")`);
}

// ── 8. shuffle ───────────────────────────────────────────────
section('shuffle: new looks, same quality rules');
{
  const tops = ['white', 'black', 'gray', 'beige', 'navy', 'pink'].map(c => it('tshirts', `top ${c}`, T('tee', 'short', 'medium', c, ['casual'], 2)));
  const bottoms = ['denim', 'black', 'beige'].map(c => it('pants', `pants ${c}`, T('chinos', null, 'medium', c, ['casual'], 2)));
  const jackets = [it('jackets', 'denim jacket', T('denim', 'long', 'medium', 'denim', ['casual'], 2))];
  const W = { tshirts: tops, pants: bottoms, jackets };
  const best = recommendOutfitsWithMeta(W, weather(22), 'Casual').outfits[0].score;
  let recent = [], overlap = 0, sameSet = 0, rounds = 12, prevKey = null, minScore = 100, weatherViolations = 0;
  for (let seed = 1; seed <= rounds; seed++) {
    const r = recommendOutfitsWithMeta(W, weather(22), 'Casual', { seed, recentIds: recent });
    const ids = r.outfits.map(o => o.id);
    overlap += ids.filter(id => recent.includes(id)).length;
    const key = [...ids].sort().join();
    if (key === prevKey) sameSet++;
    prevKey = key;
    r.outfits.forEach(o => { minScore = Math.min(minScore, o.score); if (o.breakdown.weather <= 0) weatherViolations++; });
    recent = [...ids, ...recent].slice(0, 6);
  }
  ok(overlap === 0, `${rounds} shuffles: no look repeated from the previous two rounds`);
  ok(sameSet === 0, 'never the same three again (not just reordered cards)');
  ok(best - minScore <= 30 && weatherViolations === 0, `quality kept: best ${best}, lowest shuffled ${minScore}`);
  const a = recommendOutfitsWithMeta(W, weather(22), 'Casual', { seed: 3, recentIds: ['x'] }).outfits.map(o => o.id).join();
  const b = recommendOutfitsWithMeta(W, weather(22), 'Casual', { seed: 3, recentIds: ['x'] }).outfits.map(o => o.id).join();
  ok(a === b, 'same seed + same input → same looks (favouriting / switching pages does not reshuffle)');
  // Pool exhausted → old looks may come back
  const tiny = { tshirts: tops.slice(0, 2), pants: bottoms.slice(0, 1) };
  const first = recommendOutfitsWithMeta(tiny, weather(22), 'Casual').outfits.map(o => o.id);
  const again = recommendOutfitsWithMeta(tiny, weather(22), 'Casual', { seed: 1, recentIds: first }).outfits;
  ok(again.length === first.length, 'when every look was just shown, shuffle reuses them instead of showing nothing');
}

// ── 9. ids / compatibility ───────────────────────────────────
section('favourite ids unchanged');
{
  const tops = [it('tshirts', 'a', T('tee', 'short', 'medium', 'white', [], 2))];
  const pants = [it('pants', 'b', T('jeans', null, 'medium', 'denim', [], 2))];
  const o = recommendOutfits({ tshirts: tops, pants }, weather(22), 'Casual')[0];
  ok(o.id === `outfit_v2_${tops[0].id}+${pants[0].id}` && itemIdsFromOutfitId(o.id).length === 2, `id format unchanged: ${o.id}`);
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exitCode = 1;
