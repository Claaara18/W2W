/**
 * Upload → tag guide tests (pure JS).
 *
 * Run from the project root:
 *   npx esbuild tests/uploadGuide.test.mjs --bundle --platform=node --format=esm \
 *     --alias:@react-native-async-storage/async-storage=./tests/stubs/asyncStorage.mjs \
 *     --outfile=/tmp/w2w-guide-test.mjs && node /tmp/w2w-guide-test.mjs
 */
import fs from 'node:fs';
import { processUploads } from '../utils/uploadPipeline.js';
import { EDITOR_MODE, startQueue, currentId, nextQueue, progressOf, editorConfig, needsFormReset, shouldScrollToTop } from '../utils/uploadOnboarding.js';
import { sanitizeTags, hasAnyTag, getItemTags, TAG_STATUS, PROTECTED_FIELDS, customValue } from '../utils/wardrobeSchema.js';
import { addSubType, addColor, emptyLibrary, resolveWardrobeCustomTags } from '../utils/customTags.js';
import { recommendOutfitsWithMeta } from '../utils/outfitRecommender.js';

let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ok  ', msg); } else { failures++; console.log('  FAIL', msg); } };
const section = (t) => console.log(`\n■ ${t}`);
const quiet = { warn() {}, error() {} };

// A wardrobe store that writes exactly like WardrobeContext: addItem appends,
// updateItem never changes id/uri/bgRemoved, updateItemTags merges sanitized tag fields only,
// and every change is "persisted" (JSON) immediately — like the context's save effect.
function makeStore(initial = { tshirts: [], jackets: [], skirts: [], pants: [], dresses: [] }) {
  let state = JSON.parse(JSON.stringify(initial));
  let disk = JSON.stringify(state);
  const save = () => { disk = JSON.stringify(state); };
  return {
    get: () => state,
    disk: () => disk,
    reload: () => { state = JSON.parse(disk); },
    addItem: (cat, item) => { state = { ...state, [cat]: [...(state[cat] ?? []), item] }; save(); },
    updateItem: (cat, id, updates) => {
      const safe = { ...updates };
      PROTECTED_FIELDS.filter(f => f !== 'label').forEach(f => { delete safe[f]; });
      state = { ...state, [cat]: state[cat].map(i => (i.id === id ? { ...i, ...safe } : i)) }; save();
    },
    updateItemTags: (cat, id, tags) => {
      const clean = sanitizeTags(tags, cat);
      const tagStatus = hasAnyTag(clean) ? TAG_STATUS.CONFIRMED : TAG_STATUS.UNTAGGED;
      state = { ...state, [cat]: state[cat].map(i => (i.id === id ? { ...i, ...clean, tagStatus } : i)) }; save();
    },
    removeItem: (cat, id) => { state = { ...state, [cat]: state[cat].filter(i => i.id !== id) }; save(); },
  };
}

// Fake image steps: photo names decide what happens
const fakes = (overrides = {}) => ({
  prepareImage: async (u) => `${u}.jpg`,
  removeBackground: async (u) => { if (u.includes('bgfail') || u.includes('lost')) throw new Error('remove.bg 402'); return `file:///docs/item_${u}.png`; },
  keepOriginal: async (u) => { if (u.includes('lost')) throw new Error('disk full'); return `file:///docs/item_${u}_orig.jpg`; },
  log: quiet,
  ...overrides,
});

// ── 1. pipeline ──────────────────────────────────────────────
section('upload pipeline (same behaviour as before)');
{
  const st = makeStore();
  const r = await processUploads('tshirts', ['p1'], { ...fakes(), addItem: st.addItem, baseCount: 0, now: () => 1000 });
  ok(r.addedIds.length === 1 && st.get().tshirts.length === 1, '1 photo → 1 item saved');
  const it = st.get().tshirts[0];
  ok(it.id === 'tshirts_1000' && it.label === 'look 1' && it.bgRemoved === true && it.uri === 'file:///docs/item_p1.jpg.png', `same id / label / bgRemoved / uri format (${it.id}, ${it.label})`);
  ok(!('tagStatus' in it) && !hasAnyTag(getItemTags(it, 'tshirts')), 'new item starts untagged');
}
{
  const st = makeStore({ tshirts: [{ id: 'tshirts_1', uri: 'u', label: 'look 1', bgRemoved: true }], pants: [] });
  const uris = Array.from({ length: 10 }, (_, k) => `p${k + 1}`);
  const steps = [];
  const r = await processUploads('pants', uris, { ...fakes(), addItem: st.addItem, baseCount: 0, now: () => 5000, onStep: i => steps.push(i) });
  const ids = st.get().pants.map(i => i.id);
  ok(r.addedIds.length === 10 && r.addedIds.join() === ids.join(), '10 photos → 10 items, guide order = pick order');
  ok(new Set(ids).size === 10, 'ids unique even when the clock does not move');
  ok(st.get().pants.map(i => i.label).join() === uris.map((_, k) => `look ${k + 1}`).join(), 'labels look 1…10 in order');
  ok(steps.join() === '0,1,2,3,4,5,6,7,8,9' && st.get().tshirts.length === 1, 'processed in order; other categories untouched');
}
{
  const st = makeStore();
  const uris = ['a', 'b-bgfail', 'c', 'd-lost', 'e'];
  const outcomes = [];
  const r = await processUploads('skirts', uris, { ...fakes(), addItem: st.addItem, baseCount: 2, now: () => 9000, onOutcome: o => outcomes.push(o) });
  const items = st.get().skirts;
  ok(items.length === 4 && r.addedIds.length === 4, 'one photo lost entirely → the other 4 are still saved');
  ok(r.failed.join() === '2,4', `failed list unchanged in meaning (photos ${r.failed.join(', ')})`);
  ok(items.find(i => i.uri.includes('b-bgfail')).bgRemoved === false && items.find(i => i.uri.includes('b-bgfail')).uri.endsWith('_orig.jpg'), 'background-removal failure keeps the original (bgRemoved false)');
  ok(!r.addedIds.some(id => !items.some(i => i.id === id)), 'guide only gets ids that were really saved');
  ok(items.map(i => i.label).join() === 'look 3,look 4,look 5,look 6', 'labels continue from the existing count');
  ok(outcomes.join() === 'ok,fail,ok,fail,ok', 'progress outcomes per photo as before');
}

// ── 2. modes ─────────────────────────────────────────────────
section('explicit modes: guide vs normal edit');
{
  const edit = editorConfig(EDITOR_MODE.EDIT, null);
  ok(edit.title === '編輯單品' && edit.primaryLabel === '儲存' && !edit.showSkip && !edit.progressText, 'normal edit: "編輯單品", "儲存", no 稍後再說, no progress');
  ok(!editorConfig(EDITOR_MODE.EDIT, { index: 0, total: 3, isLast: false }).showSkip, 'edit mode never shows 稍後再說, even if progress is passed');
  const q = startQueue('pants', ['a', 'b', 'c']);
  const c1 = editorConfig(EDITOR_MODE.ONBOARDING, progressOf(q));
  ok(c1.showSkip && c1.skipLabel === '稍後再說' && c1.primaryLabel === '儲存並下一件' && c1.progressText === '第 1 / 3 件', `guide first item: "${c1.progressText}", "${c1.primaryLabel}", "${c1.skipLabel}"`);
  const last = editorConfig(EDITOR_MODE.ONBOARDING, progressOf(nextQueue(nextQueue(q))));
  ok(last.primaryLabel === '儲存並完成' && last.progressText === '第 3 / 3 件' && last.remaining === 0, 'last item: "儲存並完成", 第 3 / 3 件');
  ok(startQueue('pants', []) === null && startQueue(null, ['a']) === null, 'no saved items → no guide');
  const editorSrc = fs.readFileSync('components/ItemTagEditor.js', 'utf8');
  const closetSrc = fs.readFileSync('screens/ClosetScreen.js', 'utf8');
  ok(/cfg\.showSkip &&/.test(editorSrc) && /isGuide = mode === EDITOR_MODE\.ONBOARDING/.test(editorSrc), 'editor shows 稍後再說 only through the onboarding config');
  ok((closetSrc.match(/mode=\{EDITOR_MODE\.ONBOARDING\}/g) ?? []).length === 1 && /mode=\{EDITOR_MODE\.EDIT\}/.test(closetSrc)
    && /startQueue\(pending\?\.catId, pending\?\.ids\)/.test(closetSrc), 'Closet: guide only from upload results; tapping an item opens EDIT mode');
}

// ── 3. guide flow with a 10-photo upload ─────────────────────
section('guide: save / later / save … through 10 items');
{
  const st = makeStore({ tshirts: [{ id: 'tshirts_old', uri: 'u', label: 'old', bgRemoved: true, tagStatus: 'confirmed', subType: 'tee', primaryColor: 'white' }], jackets: [], skirts: [], pants: [], dresses: [] });
  const uris = Array.from({ length: 10 }, (_, k) => `t${k + 1}`);
  const { addedIds } = await processUploads('tshirts', uris, { ...fakes(), addItem: st.addItem, baseCount: 1, now: () => 20000 });
  let q = startQueue('tshirts', addedIds);
  const visited = [];
  const tagsFor = (k) => ({ subType: 'tee', sleeveLength: 'short', thickness: 'thin', primaryColor: ['black', 'gray', 'navy'][k % 3], styles: ['casual'], formality: 2 });
  let step = 0;
  while (q) {
    const id = currentId(q);
    visited.push(id);
    const item = st.get().tshirts.find(i => i.id === id);   // live lookup by id, as ClosetScreen does
    if (step % 2 === 1) {
      // "稍後再說": nothing written
    } else {
      st.updateItemTags('tshirts', item.id, tagsFor(step));   // "儲存並下一件"
    }
    if (step === 4) { const before = st.disk(); st.reload(); ok(st.disk() === before, 'mid-guide "app restart": everything saved so far is on disk'); }
    q = nextQueue(q);
    step++;
  }
  const all = st.get().tshirts;
  ok(visited.join() === addedIds.join(), 'all 10 visited in pick order — "later" never ends the guide early');
  ok(q === null, 'after the 10th item the guide closes');
  const newOnes = addedIds.map(id => all.find(i => i.id === id));
  ok(newOnes.filter((_, k) => k % 2 === 0).every(i => i.tagStatus === 'confirmed') && newOnes.filter((_, k) => k % 2 === 1).every(i => !hasAnyTag(getItemTags(i, 'tshirts'))),
    'saved items are confirmed; "later" items stay untagged (not marked done)');
  ok(newOnes.every((i, k) => k % 2 === 1 || i.primaryColor === tagsFor(k).primaryColor), 'each item got its own tags (no tags applied to another item)');
  ok(all.length === 11 && new Set(all.map(i => i.id)).size === 11, 'no duplicate items');
  const old = all.find(i => i.id === 'tshirts_old');
  ok(old.subType === 'tee' && old.primaryColor === 'white' && old.label === 'old', 'existing clothes untouched');
  ok(newOnes.every((i, k) => i.uri === `file:///docs/item_t${k + 1}.jpg.png` && i.bgRemoved === true && i.label === `look ${k + 2}`), 'id / uri / label / bgRemoved unchanged by the guide');
}
{
  // "稍後再說" on an item that already has tags must not clear them
  const st = makeStore({ pants: [{ id: 'pants_x', uri: 'u', label: 'x', bgRemoved: true, tagStatus: 'confirmed', subType: 'jeans', primaryColor: 'denim' }] });
  let q = startQueue('pants', ['pants_x']);
  q = nextQueue(q);   // later
  const it = st.get().pants[0];
  ok(q === null && it.subType === 'jeans' && it.primaryColor === 'denim' && it.tagStatus === 'confirmed', '"later" never clears existing tags');
  // Renaming in the guide changes only the label
  st.updateItem('pants', 'pants_x', { label: '牛仔褲', id: 'hack', uri: 'hack', bgRemoved: false });
  const r = st.get().pants[0];
  ok(r.label === '牛仔褲' && r.id === 'pants_x' && r.uri === 'u' && r.bgRemoved === true, 'renaming in the guide cannot change id / uri / bgRemoved');
}
{
  // Deleting during the guide moves on; the guide skips ids that no longer exist
  const st = makeStore({ skirts: [] });
  const { addedIds } = await processUploads('skirts', ['s1', 's2', 's3'], { ...fakes(), addItem: st.addItem, now: () => 30000 });
  let q = startQueue('skirts', addedIds);
  st.removeItem('skirts', currentId(q)); q = nextQueue(q);
  ok(currentId(q) === addedIds[1] && st.get().skirts.length === 2, 'delete in the guide → next item, other new items kept');
}

// ── 4. new tags join recommendations ─────────────────────────
section('newly tagged clothes take part in Home recommendations');
{
  let lib = emptyLibrary();
  const t = addSubType(lib, 'tshirts', { label: '針織背心' }); lib = t.lib;
  const c = addColor(lib, { label: '酒紅', hex: '#722F37' }); lib = c.lib;
  const st = makeStore();
  const a = await processUploads('tshirts', ['n1', 'n2', 'n3'], { ...fakes(), addItem: st.addItem, now: () => 40000 });
  const b = await processUploads('pants', ['m1', 'm2'], { ...fakes(), addItem: st.addItem, now: () => 50000 });
  // guide: first top gets a custom type + custom colour, second a built-in set, third "later"
  st.updateItemTags('tshirts', a.addedIds[0], { subType: customValue(t.entry.id), customSubType: t.entry, primaryColor: customValue(c.entry.id), customColor: c.entry, sleeveLength: 'long', thickness: 'medium', styles: ['minimal'], formality: 3 });
  st.updateItemTags('tshirts', a.addedIds[1], { subType: 'shirt', sleeveLength: 'long', thickness: 'medium', primaryColor: 'white', styles: ['minimal'], formality: 3 });
  st.updateItemTags('pants', b.addedIds[0], { subType: 'slacks', thickness: 'medium', primaryColor: 'beige', styles: ['minimal'], formality: 3 });
  st.updateItemTags('pants', b.addedIds[1], { subType: 'jeans', thickness: 'medium', primaryColor: 'black', styles: ['casual'], formality: 2 });
  st.reload();   // as after an app restart
  const view = resolveWardrobeCustomTags(st.get(), lib);
  const r = recommendOutfitsWithMeta(view, { temp: 20, feelsLike: 20, icon: 'sunny', en: 'Sunny' }, 'Casual');
  ok(r.outfits.length === 3, `3 looks from the newly uploaded clothes (tiers ${r.outfits.map(o => o.tier)})`);
  const withCustom = r.outfits.find(o => o.items.some(i => i.id === a.addedIds[0]));
  ok(withCustom && withCustom.breakdown.colorPairs.some(p => p.mode !== 'table'), 'custom type + custom HEX colour item is recommended and scored from HEX');
  const later = view.tshirts.find(i => i.id === a.addedIds[2]);
  ok(!hasAnyTag(getItemTags(later, 'tshirts')) && getItemTags(later, 'tshirts').tagStatus === 'untagged', '"later" item stays untagged (uses defaults, not shown as done)');
}

// ── 5. scroll to top + no stale data when switching items ────
section('guide: every item starts at the top with its own data');
{
  // Simulate the editor across a 10-item guide exactly as ItemTagEditor decides it:
  // the form is refilled during render when the item id changes, then (guide only) scrollTo(0).
  const items = Array.from({ length: 10 }, (_, k) => ({ id: `tshirts_${60000 + k}`, label: `look ${k + 1}`, uri: `file:///docs/item_${k}.png` }));
  let q = startQueue('tshirts', items.map(i => i.id));
  let formFor = null, shownId = null, scrollY = 0, form = null;
  const frames = [];
  const render = (visible, item, mode) => {
    if (!visible && formFor !== null) formFor = null;
    if (needsFormReset(visible, item?.id, formFor)) { formFor = item.id; form = { label: item.label }; }
    // what the user sees in this frame
    frames.push({ id: item?.id, label: form?.label, uri: item?.uri, progress: editorConfig(mode, progressOf(q)).progressText, scrollY });
    const prev = shownId; shownId = visible ? item?.id ?? null : null;   // layout effect
    if (shouldScrollToTop(mode, prev, item?.id)) scrollY = 0;
  };
  let k = 0;
  while (q) {
    const item = items.find(i => i.id === currentId(q));
    render(true, item, EDITOR_MODE.ONBOARDING);
    scrollY = 640;                                   // user scrolls down to formality / save
    q = nextQueue(q);                                // 儲存並下一件 or 稍後再說 (alternating, same switch)
    k++;
  }
  const firstFrames = frames;                        // one render per item
  ok(firstFrames.length === 10, '10 items rendered in turn');
  ok(firstFrames.every((f, i) => f.id === items[i].id && f.label === items[i].label && f.uri === items[i].uri),
    'each first frame already shows that item’s own photo and name (no flash of the previous one)');
  ok(firstFrames.every((f, i) => f.progress === `第 ${i + 1} / 10 件`), 'progress text updates: 第 1 / 10 … 第 10 / 10 件');
  // after each switch the layout effect reset the scroll position before the user saw the next item's tags
  let resetEvery = true, sid = null, y = 0;
  for (let i = 0; i < items.length; i++) {
    const prev = sid; sid = items[i].id;
    if (i > 0 && !shouldScrollToTop(EDITOR_MODE.ONBOARDING, prev, sid)) resetEvery = false;
    y = 640;
  }
  ok(resetEvery, 'switches 1→2 … 9→10 all trigger scroll-to-top (9 of 9)');
  ok(!shouldScrollToTop(EDITOR_MODE.EDIT, 'a', 'b') && !shouldScrollToTop(EDITOR_MODE.ONBOARDING, null, 'a') && !shouldScrollToTop(EDITOR_MODE.ONBOARDING, 'a', 'a'),
    'never scrolls in normal edit, on first open, or when the same item re-renders');
  ok(needsFormReset(true, 'b', 'a') && !needsFormReset(true, 'a', 'a') && !needsFormReset(false, 'a', null), 'form refill only for a new item / reopened sheet');

  // Source checks: the decisions above are what the component actually uses
  const src = fs.readFileSync('components/ItemTagEditor.js', 'utf8');
  const scrollViews = src.match(/<ScrollView[\s\S]*?>/g) ?? [];
  ok(scrollViews.length === 1 && /ref=\{scrollRef\}/.test(scrollViews[0]) && /maxHeight/.test(scrollViews[0]),
    'the only ScrollView (the tag list) is the one that gets reset');
  ok(/useLayoutEffect\([\s\S]*shouldScrollToTop\(mode, prev, item\?\.id\)[\s\S]*scrollTo\(\{ y: 0, animated: false \}\)/.test(src),
    'scrollTo({ y: 0, animated: false }) runs in a layout effect, guarded by shouldScrollToTop');
  ok(/if \(needsFormReset\(visible, item\?\.id, formFor\)\)/.test(src) && !/useEffect\(/.test(src),
    'form data is refilled during render (no effect that would show stale data for a frame)');
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exitCode = 1;
