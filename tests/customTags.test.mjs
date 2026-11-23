/**
 * Custom type / colour tests — pure JS.
 *
 * Run from the project root:
 *   npx esbuild tests/customTags.test.mjs --bundle --platform=node --format=esm \
 *     --alias:@react-native-async-storage/async-storage=./tests/stubs/asyncStorage.mjs \
 *     --outfile=/tmp/w2w-custom-test.mjs && node /tmp/w2w-custom-test.mjs
 */
import {
  COLORS, normalizeHex, nearestBaseColor, sanitizeTags, getItemTags, estimateWarmth, hasAnyTag,
  customValue, CUSTOM_SUBTYPE_LIMIT, CUSTOM_COLOR_LIMIT,
} from '../utils/wardrobeSchema.js';
import {
  emptyLibrary, sanitizeLibrary, addSubType, updateSubType, deleteSubType, addColor, updateColor, deleteColor,
  resolveItemCustomTags, resolveWardrobeCustomTags, countUsage, getCustomSubTypes, PALETTE,
} from '../utils/customTags.js';
import { recommendOutfitsWithMeta, recommendOutfits, __internals } from '../utils/outfitRecommender.js';
import { outfitColorScore } from '../utils/colorHarmony.js';

let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ok  ', msg); } else { failures++; console.log('  FAIL', msg); } };
const section = (t) => console.log(`\n■ ${t}`);
const weather = (t) => ({ temp: t, feelsLike: t, icon: 'sunny', en: 'Sunny' });

// ── HEX ──────────────────────────────────────────────────────
section('HEX validation and base-colour mapping');
ok(normalizeHex('#abc') === '#AABBCC' && normalizeHex('aabbcc') === '#AABBCC' && normalizeHex(' #722f37 ') === '#722F37', 'normalizes #abc / aabbcc / lowercase');
ok([null, '', '#12345', 'zzzzzz', '#1234567', 'red'].every(v => normalizeHex(v) === null), 'rejects invalid HEX');
ok(COLORS.filter(c => c.hex).every(c => nearestBaseColor(c.hex) === c.value), 'every built-in colour maps to itself');
const examples = [
  ['奶油黃', '#F3E5AB', ['beige', 'yellow']], ['酒紅', '#722F37', ['red']], ['霧霾藍', '#7A8FA6', ['denim']],
  ['燕麥色', '#D8C8A8', ['beige']], ['墨藍', '#2E4A62', ['navy']], ['軍綠', '#556B2F', ['olive']],
  ['可可', '#6B4E3D', ['brown']], ['磚紅', '#B03A2E', ['red']], ['乾燥玫瑰', '#E8B4B8', ['pink']],
  ['薰衣草', '#C9A0DC', ['purple']], ['炭灰', '#4A4A4A', ['gray']], ['象牙白', '#F5F0E1', ['white', 'beige']],
  ['芥末黃', '#C9A227', ['yellow']], ['森林綠', '#3E6B5A', ['green']], ['天空藍', '#A9CCE3', ['blue', 'denim']],
];
for (const [name, hex, expect] of examples) {
  const b = nearestBaseColor(hex);
  ok(expect.includes(b), `${name} ${hex} → ${b}`);
}
ok(PALETTE.length === 24 && PALETTE.every(p => normalizeHex(p.hex) === p.hex && nearestBaseColor(p.hex)), 'palette: 24 valid colours, each maps to a base');

// ── library: types ───────────────────────────────────────────
section('custom types: add / validate / edit / delete');
let lib = emptyLibrary();
let r = addSubType(lib, 'tshirts', { label: '  針織   背心 ', base: 'tank' }, 1000);
ok(!r.error && r.entry.label === '針織 背心' && r.entry.base === 'tank', `add → "${r.entry?.label}" (base tank, spaces normalized)`);
lib = r.lib;
ok(addSubType(lib, 'tshirts', { label: '   ' }).error === '請輸入名稱', 'blank name rejected');
ok(/最多 12/.test(addSubType(lib, 'tshirts', { label: '一二三四五六七八九十十一十二' }).error), '13+ characters rejected');
ok(!addSubType(lib, 'tshirts', { label: '一二三四五六七八九十ㄅㄆ' }).error, 'exactly 12 characters accepted');
ok(/內建類型/.test(addSubType(lib, 'tshirts', { label: 't 恤' }).error), 'duplicate of a built-in type rejected (case-insensitive)');
ok(/已經有/.test(addSubType(lib, 'tshirts', { label: '針織 背心' }).error), 'duplicate custom name rejected');
ok(!addSubType(lib, 'pants', { label: '針織 背心' }).error, 'same name allowed in another category (kept per category)');
ok(addSubType(lib, 'pants', { label: '連身褲', base: 'jumpsuit' }).entry.base === null, 'jumpsuit base not allowed under Pants → 不確定 (category never changes)');
ok(addSubType(lib, 'tshirts', { label: '奇怪', base: 'jeans' }).entry.base === null, 'base from another category → null');
const dr = addSubType(lib, 'dresses', { label: '連身褲', base: 'jumpsuit' });
ok(dr.entry.base === 'jumpsuit', 'Dresses: 連身褲 may be treated as jumpsuit');
{
  let big = emptyLibrary();
  for (let k = 0; k < CUSTOM_SUBTYPE_LIMIT; k++) big = addSubType(big, 'skirts', { label: `裙${k}` }, 5000 + k).lib;
  ok(getCustomSubTypes(big, 'skirts').length === 50 && /最多 50/.test(addSubType(big, 'skirts', { label: '第51' }).error), `limit ${CUSTOM_SUBTYPE_LIMIT} per category`);
  ok(new Set(getCustomSubTypes(big, 'skirts').map(e => e.id)).size === 50, 'ids unique even when created in the same millisecond range');
}
const vestId = r.entry.id;
const u = updateSubType(lib, 'tshirts', vestId, { label: '針織背心', base: 'sweater' });
ok(!u.error && u.entry.id === vestId && u.entry.label === '針織背心' && u.entry.base === 'sweater', 'edit keeps the id, changes name and base');
ok(/已經有|內建/.test(updateSubType(addSubType(u.lib, 'tshirts', { label: '馬甲' }).lib, 'tshirts', vestId, { label: '馬甲' }).error), 'edit cannot rename to an existing name');
ok(getCustomSubTypes(deleteSubType(u.lib, 'tshirts', vestId), 'tshirts').length === 0, 'delete removes the option');
ok(getCustomSubTypes(lib, 'tshirts')[0].label === '針織 背心', 'library functions never mutate their input');

// ── library: colours ─────────────────────────────────────────
section('custom colours: add / validate / edit / delete');
let clib = emptyLibrary();
const c1 = addColor(clib, { label: '酒紅', hex: '#722f37' });
ok(!c1.error && c1.entry.hex === '#722F37' && c1.entry.base === 'red', `add 酒紅 → ${c1.entry.hex}, base ${c1.entry.base} (auto)`);
clib = c1.lib;
ok(/HEX/.test(addColor(clib, { label: '霧霾藍', hex: '#7A8FA' }).error), 'invalid HEX rejected');
ok(/HEX/.test(addColor(clib, { label: '霧霾藍', hex: '' }).error), 'missing HEX rejected');
ok(/內建顏色/.test(addColor(clib, { label: '紅', hex: '#FF0000' }).error), 'duplicate of a built-in colour name rejected');
ok(/已經有/.test(addColor(clib, { label: '酒紅', hex: '#800000' }).error), 'duplicate custom colour name rejected');
ok(addColor(clib, { label: '奶油黃', hex: '#F3E5AB', base: 'yellow' }).entry.base === 'yellow', 'user-chosen base is respected');
{
  let big = emptyLibrary();
  for (let k = 0; k < CUSTOM_COLOR_LIMIT; k++) big = addColor(big, { label: `色${k}`, hex: '#336699' }, 9000 + k).lib;
  ok(big.colors.length === 100 && /最多 100/.test(addColor(big, { label: '第101', hex: '#336699' }).error), `limit ${CUSTOM_COLOR_LIMIT} colours`);
}
const wineId = c1.entry.id;
const cu = updateColor(clib, wineId, { label: '勃艮第酒紅', hex: '#800020' });
ok(!cu.error && cu.entry.label === '勃艮第酒紅' && cu.entry.hex === '#800020' && cu.entry.base === 'red', 'edit colour name + HEX (base recalculated)');
ok(deleteColor(cu.lib, wineId).colors.length === 0, 'delete colour');

// ── tags on items ────────────────────────────────────────────
section('sanitizeTags keeps custom tags; saving never touches protected fields');
const vest = getCustomSubTypes(lib, 'tshirts')[0];
const wine = clib.colors[0];
const item = {
  id: 'tshirts_1731900000001', uri: 'file:///x/item_1.png', label: 'look 1', bgRemoved: true, extra: 42,
  subType: customValue(vest.id), customSubType: vest,
  primaryColor: customValue(wine.id), customColor: wine,
  sleeveLength: 'sleeveless', thickness: 'thin', styles: ['casual'], formality: 2, tagStatus: 'confirmed',
};
const clean = sanitizeTags(item, 'tshirts');
ok(clean.subType === item.subType && clean.customSubType.label === '針織 背心', 'custom type kept with its snapshot');
ok(clean.primaryColor === item.primaryColor && clean.customColor.hex === '#722F37', 'custom colour kept with its snapshot');
ok(!['id', 'uri', 'label', 'bgRemoved', 'extra'].some(k => k in clean), 'sanitize returns tag fields only');
ok(sanitizeTags({ ...item, customSubType: null }, 'tshirts').subType === null, 'custom value without snapshot → cleared (no crash)');
ok(sanitizeTags({ ...item, customSubType: { ...vest, id: 'other' } }, 'tshirts').subType === null, 'snapshot id mismatch → cleared');
ok(sanitizeTags({ ...item, customColor: { ...wine, hex: 'nope' } }, 'tshirts').primaryColor === null, 'colour snapshot with bad HEX → cleared');
const back = sanitizeTags({ ...item, subType: 'tee', primaryColor: 'navy' }, 'tshirts');
ok(back.subType === 'tee' && back.customSubType === null && back.primaryColor === 'navy' && back.customColor === null, 'switching to built-in clears the snapshots');
const saved = { ...item, ...clean, tagStatus: 'confirmed' };   // what updateItemTags writes
ok(['id', 'uri', 'label', 'bgRemoved', 'extra'].every(k => saved[k] === item[k]), 'updateItemTags merge keeps id / uri / label / bgRemoved / unknown fields');
const view = getItemTags(item, 'tshirts');
ok(view.baseSubType === 'tank' && view.baseColor === 'red' && view.colorHex === '#722F37' && view.subTypeLabel === '針織 背心', 'getItemTags exposes base type / base colour / hex / label');
ok(hasAnyTag(sanitizeTags({ primaryColor: customValue(wine.id), customColor: wine }, 'pants')), 'an item with only a custom colour counts as tagged');

// ── display refresh / persistence ────────────────────────────
section('rename shows everywhere without rewriting items; survives reload');
{
  const renamedLib = updateColor(clib, wine.id, { label: '深酒紅', hex: '#5E1A26' }).lib;
  const wardrobe = { tshirts: [item], pants: [] };
  const shown = resolveWardrobeCustomTags(wardrobe, renamedLib);
  ok(shown.tshirts[0].customColor.label === '深酒紅' && shown.tshirts[0].customColor.hex === '#5E1A26', 'display copy shows the renamed colour');
  ok(wardrobe.tshirts[0].customColor.label === '酒紅', 'stored item is not rewritten');
  ok(resolveWardrobeCustomTags(wardrobe, clib).tshirts === wardrobe.tshirts, 'unchanged library → same objects (no re-render churn)');
  const afterDelete = resolveItemCustomTags(item, 'tshirts', deleteColor(clib, wine.id));
  ok(afterDelete === item && getItemTags(afterDelete, 'tshirts').colorLabel === '酒紅', 'deleted option → item keeps its snapshot');

  // Simulated app restart: library + wardrobe go through JSON and back
  const reloadedLib = sanitizeLibrary(JSON.parse(JSON.stringify(renamedLib)));
  const reloadedWardrobe = JSON.parse(JSON.stringify(wardrobe));
  const afterRestart = resolveWardrobeCustomTags(reloadedWardrobe, reloadedLib);
  ok(afterRestart.tshirts[0].customColor.label === '深酒紅', 'after restart the renamed colour still shows');
  ok(sanitizeLibrary({ subTypes: { tshirts: [{ id: 'bad id!', label: 'x' }, { id: 'ok_1', label: '' }, vest] }, colors: [{ id: 'c1', label: 'a', hex: 'zz' }] }).subTypes.tshirts.length === 1,
    'invalid library entries are dropped on load');
  ok(sanitizeLibrary('garbage').colors.length === 0 && sanitizeLibrary(null).subTypes.tshirts.length === 0, 'unreadable library → empty, no crash');
  ok(countUsage({ tshirts: [item, { ...item, id: 'tshirts_2' }], pants: [] }, 'primaryColor', customValue(wine.id)) === 2, 'usage count for the delete dialog');
}

// ── recommender integration ──────────────────────────────────
section('recommender understands custom tags');
{
  const { buildOutfit, toPart, weatherEval } = __internals;
  const T = (o) => ({ tagStatus: 'confirmed', ...o });
  // Custom type treated as tank → same warmth and same Work exclusion as a built-in tank
  const customTank = { id: 'tshirts_5001', uri: 'u', label: '針織背心', bgRemoved: true, ...T({ subType: customValue(vest.id), customSubType: vest, sleeveLength: 'sleeveless', thickness: 'thin', formality: 2 }) };
  const realTank   = { id: 'tshirts_5002', uri: 'u', label: 'tank', bgRemoved: true, ...T({ subType: 'tank', sleeveLength: 'sleeveless', thickness: 'thin', formality: 2 }) };
  ok(estimateWarmth(customTank, 'tshirts') === estimateWarmth(realTank, 'tshirts'), `custom type uses its base for warmth (${estimateWarmth(customTank, 'tshirts')})`);
  const slacks = { id: 'pants_5003', uri: 'u', label: 'slacks', bgRemoved: true, ...T({ subType: 'slacks', thickness: 'medium', formality: 4, primaryColor: 'black' }) };
  const workCustom = recommendOutfitsWithMeta({ tshirts: [customTank], pants: [slacks] }, weather(30), 'Work');
  ok(workCustom.outfits.length === 0 && workCustom.meta.excluded.occ_type, 'custom "tank" is excluded for Work like a built-in tank');

  // Custom type with NO base still uses sleeve / thickness / formality
  const noBase = getCustomSubTypes(addSubType(emptyLibrary(), 'tshirts', { label: '馬甲' }).lib, 'tshirts')[0];
  const corsetThick = { id: 'tshirts_5004', uri: 'u', label: '馬甲', bgRemoved: true, ...T({ subType: customValue(noBase.id), customSubType: noBase, sleeveLength: 'long', thickness: 'thick', formality: 4 }) };
  const corsetThin  = { ...corsetThick, id: 'tshirts_5005', sleeveLength: 'sleeveless', thickness: 'thin' };
  ok(estimateWarmth(corsetThick, 'tshirts') > estimateWarmth(corsetThin, 'tshirts'), `no base → warmth still from sleeve + thickness (${estimateWarmth(corsetThick, 'tshirts')} vs ${estimateWarmth(corsetThin, 'tshirts')})`);
  ok(recommendOutfits({ tshirts: [corsetThick], pants: [slacks] }, weather(16), 'Work').length === 1, 'no-base custom type takes part in recommendations (formality 4 → Work)');

  // Jumpsuit in Dresses: one-piece, may take a jacket, legs covered like trousers
  const jsEntry = dr.entry;
  const jumpsuit = { id: 'dresses_6001', uri: 'u', label: '連身褲', bgRemoved: true, ...T({ subType: customValue(jsEntry.id), customSubType: jsEntry, sleeveLength: 'long', thickness: 'medium', formality: 3, primaryColor: 'olive', styles: ['casual'] }) };
  const sundress = { id: 'dresses_6002', uri: 'u', label: 'sundress', bgRemoved: true, ...T({ subType: 'casual', sleeveLength: 'long', thickness: 'medium', formality: 3, primaryColor: 'olive', styles: ['casual'] }) };
  const coat = { id: 'jackets_6003', uri: 'u', label: 'coat', bgRemoved: true, ...T({ subType: 'coat', sleeveLength: 'long', thickness: 'thick', formality: 4, primaryColor: 'black' }) };
  const top = { id: 'tshirts_6004', uri: 'u', label: 'tee', bgRemoved: true, ...T({ subType: 'tee', sleeveLength: 'short', thickness: 'thin', formality: 1 }) };
  const jeans = { id: 'pants_6005', uri: 'u', label: 'jeans', bgRemoved: true, ...T({ subType: 'jeans', thickness: 'medium', formality: 2 }) };
  const W = { tshirts: [top], pants: [jeans], dresses: [jumpsuit, sundress], jackets: [coat] };
  const all = [];
  for (const t of [30, 20, 8]) for (const occ of ['Casual', 'Date']) for (let s = 0; s < 6; s++) all.push(...recommendOutfits(W, weather(t), occ, s));
  const withJs = all.filter(o => o.items.some(i => i.id === 'dresses_6001'));
  ok(withJs.length > 0 && withJs.every(o => o.items.every(i => i.id === 'dresses_6001' || i.categoryId === 'jackets')),
    `jumpsuit is always one-piece (+ optional jacket only) — ${withJs.length} looks checked`);
  const js8 = buildOutfit([toPart(jumpsuit, 'dresses'), toPart(coat, 'jackets')]);
  const dr8 = buildOutfit([toPart(sundress, 'dresses'), toPart(coat, 'jackets')]);
  ok(weatherEval(js8, 8, weather(8)).ok && !weatherEval(dr8, 8, weather(8)).ok,
    `8°C + coat: jumpsuit legs ${js8.legWarmth} pass, regular dress legs ${dr8.legWarmth} fail`);
  const jsThin = buildOutfit([toPart({ ...jumpsuit, sleeveLength: 'short', thickness: 'thin' }, 'dresses')]);
  ok(jsThin.legWarmth < js8.legWarmth && jsThin.warmth < buildOutfit([toPart(jumpsuit, 'dresses')]).warmth && weatherEval(jsThin, 30, weather(30)).ok,
    `jumpsuit warmth follows sleeve + thickness (thin short-sleeve W ${jsThin.warmth}, OK at 30°C)`);
  const rmEntry = addSubType(emptyLibrary(), 'dresses', { label: '連身短褲', base: 'romper' }).entry;
  const romper = { ...jumpsuit, id: 'dresses_6006', subType: customValue(rmEntry.id), customSubType: rmEntry };
  ok(recommendOutfitsWithMeta({ dresses: [romper] }, weather(26), 'Work').outfits.length === 0, 'romper is excluded for Work (like shorts)');
  ok(!weatherEval(buildOutfit([toPart(romper, 'dresses'), toPart(coat, 'jackets')]), 10, weather(10)).ok, 'romper legs too thin at 10°C');

  // Custom colours score like their base colours
  const s1 = outfitColorScore(['red', 'beige'], 'Casual').score;
  const oatEntry = addColor(emptyLibrary(), { label: '燕麥色', hex: '#D8C8A8' }).entry;
  const pA = toPart({ id: 'tshirts_7001', label: 'a', ...T({ primaryColor: customValue(wine.id), customColor: wine }) }, 'tshirts');
  const pB = toPart({ id: 'pants_7002', label: 'b', ...T({ primaryColor: customValue(oatEntry.id), customColor: oatEntry }) }, 'pants');
  ok(pA.color === 'red' && pB.color === 'beige' && outfitColorScore([pA.color, pB.color], 'Casual').score === s1,
    `酒紅 + 燕麥色 scored as red + beige (${s1})`);
  const colourOnly = { tshirts: [{ id: 'tshirts_7003', uri: 'u', label: 'x', bgRemoved: true, primaryColor: customValue(wine.id), customColor: wine }], pants: [jeans] };
  const rc = recommendOutfits(colourOnly, weather(22), 'Casual');
  ok(rc.length === 1 && rc[0].breakdown.untagged === 0, 'custom colour is not treated as untagged');

  // Changing an option's base in the library changes recommendations (via the display copy)
  const libA = { ...emptyLibrary(), subTypes: { tshirts: [{ ...vest, base: 'tank' }] } };
  const libB = { ...emptyLibrary(), subTypes: { tshirts: [{ ...vest, base: 'sweater' }] } };
  const wv = { tshirts: [{ ...customTank, thickness: 'thick', sleeveLength: 'long' }], pants: [jeans] };
  const hotA = recommendOutfits(resolveWardrobeCustomTags(wv, libA), weather(30), 'Casual').length;
  const hotB = recommendOutfitsWithMeta(resolveWardrobeCustomTags(wv, libB), weather(30), 'Casual');
  ok(hotA === 0 && hotB.outfits.length === 0, 'thick long-sleeve custom top is excluded at 30°C either way');
  ok(estimateWarmth(resolveWardrobeCustomTags(wv, libB).tshirts[0], 'tshirts') > estimateWarmth(resolveWardrobeCustomTags(wv, libA).tshirts[0], 'tshirts'),
    'library base change (tank → sweater) raises warmth without rewriting the item');
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exitCode = 1;

// ── no "treated as" choice (simplified form) ─────────────────
section('custom tags without choosing any base');
{
  const fs = await import('node:fs');
  const formSrc = fs.readFileSync('components/CustomTagForm.js', 'utf8')   // run from the project root;
  ok(!formSrc.includes('推薦時視為') && !formSrc.includes('getBaseSubTypes') && !/base:/.test(formSrc.split('const submit')[1].split('};')[0]),
    'form has no "推薦時視為" UI and submits no base');

  // Add exactly what the form sends now
  let L = emptyLibrary();
  const t1 = addSubType(L, 'tshirts', { label: '馬甲' }); L = t1.lib;
  const t2 = addSubType(L, 'dresses', { label: '連身褲' }); L = t2.lib;
  const t3 = addSubType(L, 'pants', { label: '燈芯絨褲' }); L = t3.lib;
  const c1 = addColor(L, { label: '酒紅', hex: '#722F37' }); L = c1.lib;
  const c2 = addColor(L, { label: '燕麥色', hex: '#d8c8a8' }); L = c2.lib;
  ok(!t1.error && !t2.error && !t3.error && [t1, t2, t3].every(r => r.entry.base === null), 'custom types added with only a name (no base)');
  ok(!c1.error && !c2.error && c1.entry.base === 'red' && c2.entry.base === 'beige' && c2.entry.hex === '#D8C8A8',
    `custom colours added with name + HEX; fallback base computed automatically (${c1.entry.base}, ${c2.entry.base})`);

  // Editing: an older type that had a base keeps it; colour base follows the new HEX
  let old = emptyLibrary();
  const legacy = addSubType(old, 'tshirts', { label: '針織背心', base: 'tank' }); old = legacy.lib;
  const renamed = updateSubType(old, 'tshirts', legacy.entry.id, { label: '針織背心 II' });
  ok(renamed.entry.base === 'tank' && renamed.entry.label === '針織背心 II', 'editing an older type (name only) keeps its internal base');
  const recol = updateColor(L, c1.entry.id, { label: '酒紅', hex: '#3E6B5A' });
  ok(recol.entry.base === 'green', 'editing a colour recalculates its fallback base from the new HEX');

  // Items as updateItemTags stores them, then a simulated restart (JSON round-trip)
  const mk = (cat, id, entry, extra) => ({ id, uri: `file:///x/${id}.png`, label: 'look', bgRemoved: true, ...extra,
    subType: customValue(entry.id), customSubType: entry, tagStatus: 'confirmed' });
  const withC = (item, e) => ({ ...item, primaryColor: customValue(e.id), customColor: e });
  const corset = withC(mk('tshirts', 'tshirts_9101', t1.entry, { sleeveLength: 'long', thickness: 'medium', styles: ['formal', 'minimal'], formality: 4 }), c1.entry);
  const cord   = withC(mk('pants', 'pants_9102', t3.entry, { thickness: 'thick', styles: ['minimal'], formality: 4 }), c2.entry);
  const jump   = mk('dresses', 'dresses_9103', t2.entry, { sleeveLength: 'long', thickness: 'medium', primaryColor: 'olive', styles: ['casual'], formality: 2 });
  const coatI  = { id: 'jackets_9104', uri: 'u', label: 'coat', bgRemoved: true, tagStatus: 'confirmed', subType: 'coat', sleeveLength: 'long', thickness: 'thick', primaryColor: 'black', styles: ['minimal'], formality: 4 };
  const stored = { tshirts: [{ ...corset, ...sanitizeTags(corset, 'tshirts') }], pants: [{ ...cord, ...sanitizeTags(cord, 'pants') }], dresses: [{ ...jump, ...sanitizeTags(jump, 'dresses') }], jackets: [coatI] };
  const restartLib = sanitizeLibrary(JSON.parse(JSON.stringify(L)));
  const restartW = resolveWardrobeCustomTags(JSON.parse(JSON.stringify(stored)), restartLib);
  ok(getCustomSubTypes(restartLib, 'tshirts').length === 1 && restartLib.colors.length === 2, 'library survives a restart');
  ok(getItemTags(restartW.tshirts[0], 'tshirts').subTypeLabel === '馬甲' && getItemTags(restartW.pants[0], 'pants').colorLabel === '燕麥色',
    'items still show their custom type and colour after a restart');
  ok(['id', 'uri', 'label', 'bgRemoved'].every(k => restartW.tshirts[0][k] === corset[k]), 'id / uri / label / bgRemoved unchanged');

  // Recommendations work with no base at all
  const work = recommendOutfitsWithMeta(restartW, weather(18), 'Work');
  ok(work.outfits.some(o => o.items.some(i => i.id === 'tshirts_9101') && o.items.some(i => i.id === 'pants_9102')),
    `no-base 馬甲 (formal f4) + 燈芯絨褲 recommended for Work (${work.outfits.length} looks)`);
  const pair = work.outfits.find(o => o.items.some(i => i.id === 'tshirts_9101') && o.items.some(i => i.id === 'pants_9102'));
  ok(pair && pair.breakdown.colorPairs.some(p => p.mode !== 'table' && p.aHex && p.bHex), 'their colours are scored from the HEX codes');
  ok(estimateWarmth(restartW.tshirts[0], 'tshirts') === Math.round((1.2 + 0.6) * 10) / 10, 'no-base warmth = category default + sleeve × thickness');
  const hot = recommendOutfits(restartW, weather(32), 'Casual');
  ok(!hot.some(o => o.items.some(i => i.id === 'pants_9102' || i.id === 'jackets_9104')), '32°C: thick custom trousers / coat not recommended');
  const cold = recommendOutfits(restartW, weather(6), 'Casual');
  ok(cold.every(o => o.items.some(i => i.categoryId === 'jackets')), '6°C: every look has a jacket');
  const js = [];
  for (const t of [26, 16, 8]) for (const occ of ['Casual', 'School']) for (let s = 0; s < 4; s++)
    js.push(...recommendOutfits(restartW, weather(t), occ, s).filter(o => o.items.some(i => i.id === 'dresses_9103')));
  ok(js.length > 0 && js.every(o => o.items.every(i => i.id === 'dresses_9103' || i.categoryId === 'jackets')),
    `no-base 連身褲 in Dresses is always one-piece (+ optional jacket) — ${js.length} looks`);

  // Older items that still carry a base keep working the same
  const legacyItem = { id: 'tshirts_9105', uri: 'u', label: 'v', bgRemoved: true, tagStatus: 'confirmed', subType: customValue(legacy.entry.id),
    customSubType: legacy.entry, sleeveLength: 'sleeveless', thickness: 'thin', formality: 2 };
  const tankItem = { id: 'tshirts_9106', uri: 'u', label: 't', bgRemoved: true, tagStatus: 'confirmed', subType: 'tank', sleeveLength: 'sleeveless', thickness: 'thin', formality: 2 };
  ok(estimateWarmth(legacyItem, 'tshirts') === estimateWarmth(tankItem, 'tshirts'), 'older custom type with base "tank" still behaves like before');
}

console.log(`\n${passes} passed, ${failures} failed (incl. no-base section)`);
if (failures) process.exitCode = 1;
