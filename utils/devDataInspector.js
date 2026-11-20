/**
 * DEV-ONLY, READ-ONLY data inspector (Phase 1 · Step 0)
 *
 * Purpose: report the real on-device AsyncStorage structure, item counts, IDs,
 * image URIs and whether each image file still exists — before any migration.
 *
 * SAFETY CONTRACT — this file must only ever call:
 *   AsyncStorage.getAllKeys, AsyncStorage.multiGet
 *   FileSystem.getInfoAsync, FileSystem.readDirectoryAsync
 * It must never call setItem / removeItem / clear / multiSet / mergeItem,
 * or any FileSystem write / copy / move / delete function.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { verifyImageUris, resolveImageUri } from './imageUri';          // read-only (getInfoAsync)
import { PATHFIX_BACKUP_KEYS } from './storageBackup';                  // key names only

const WARDROBE_KEY   = '@w2w_wardrobe';
const COLLECTION_KEY = '@w2w_collection';
const CALENDAR_KEY   = '@w2w_calendar';
const JOURNAL_PREFIX = '@w2w_journal_';

const KNOWN_CATEGORIES = ['tshirts', 'jackets', 'skirts', 'pants', 'dresses'];
const V1_FIELDS        = ['id', 'uri', 'label', 'bgRemoved'];

// ── helpers ──────────────────────────────────────────────────

const safeParse = (raw) => {
  if (raw == null) return { present: false };
  try {
    return { present: true, ok: true, value: JSON.parse(raw), length: raw.length };
  } catch (e) {
    return { present: true, ok: false, error: e?.message ?? String(e), length: raw.length, head: raw.slice(0, 200) };
  }
};

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

const baseName = (uri) => {
  if (typeof uri !== 'string' || !uri) return null;
  const last = uri.split('?')[0].split('#')[0].split('/').pop() || null;
  if (!last) return null;
  try { return decodeURIComponent(last); } catch { return last; }
};

const scheme = (uri) => {
  if (typeof uri !== 'string') return null;
  const m = uri.match(/^([a-z][a-z0-9+.-]*):/i);
  return m ? m[1].toLowerCase() : null;
};

// Memoised, never-throwing existence check
const makeFileChecker = () => {
  const cache = new Map();
  return async (uri) => {
    if (typeof uri !== 'string' || !uri) return { exists: false, error: 'no-uri' };
    if (cache.has(uri)) return cache.get(uri);
    let res;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      res = info.exists
        ? { exists: !info.isDirectory, isDirectory: !!info.isDirectory, size: info.size }
        : { exists: false };
    } catch (e) {
      res = { exists: false, error: e?.message ?? String(e) };
    }
    cache.set(uri, res);
    return res;
  };
};

// ── section inspectors ───────────────────────────────────────

async function inspectWardrobe(raw, docDir, checkFile) {
  const p = safeParse(raw);
  const out = { key: WARDROBE_KEY, present: p.present, parseOk: p.ok ?? null, rawLength: p.length ?? 0 };
  if (!p.present) return out;
  if (!p.ok) return { ...out, parseError: p.error, rawHead: p.head };

  const data = p.value;
  out.topLevelType = typeOf(data);
  if (out.topLevelType !== 'object') return out;

  out.categories = [];
  out.items = [];
  const idCount = new Map();

  for (const cat of Object.keys(data)) {
    const arr = data[cat];
    const catInfo = { name: cat, known: KNOWN_CATEGORIES.includes(cat), type: typeOf(arr), count: Array.isArray(arr) ? arr.length : 0 };
    out.categories.push(catInfo);
    if (!Array.isArray(arr)) continue;

    for (let idx = 0; idx < arr.length; idx++) {
      const item = arr[idx];
      if (typeOf(item) !== 'object') {
        out.items.push({ category: cat, index: idx, invalid: `item is ${typeOf(item)}` });
        continue;
      }
      const fields = Object.keys(item);
      const id = item.id;
      if (id != null) idCount.set(String(id), (idCount.get(String(id)) ?? 0) + 1);

      const uri = item.uri;
      const file = await checkFile(uri);
      const fileName = baseName(uri);
      const inDocDir = typeof uri === 'string' && !!docDir && uri.startsWith(docDir);

      // If the stored absolute path is dead, would documentDirectory + fileName work?
      let repairCandidate = null;
      if (!file.exists && fileName && docDir) {
        const candidateUri = docDir + fileName;
        const c = await checkFile(candidateUri);
        repairCandidate = { uri: candidateUri, exists: c.exists };
      }

      // What the app actually displays now (read-time path repair)
      await verifyImageUris([uri]);
      const resolvedUri = resolveImageUri(uri);
      const resolvedFile = resolvedUri === uri ? file : await checkFile(resolvedUri);

      out.items.push({
        category: cat,
        index: idx,
        id,
        idType: typeOf(id),
        idPrefixMatchesCategory: typeof id === 'string' && id.startsWith(`${cat}_`),
        label: item.label,
        bgRemoved: item.bgRemoved,
        uri,
        uriScheme: scheme(uri),
        fileName,
        inDocDir,
        fileExists: file.exists,
        fileSize: file.size,
        fileError: file.error,
        repairCandidate,
        resolvedChanged: resolvedUri !== uri,
        resolvedExists: resolvedFile.exists,
        fields,
        missingV1Fields: V1_FIELDS.filter(f => !(f in item)),
        extraFields: fields.filter(f => !V1_FIELDS.includes(f)),
      });
    }
  }

  out.missingKnownCategories = KNOWN_CATEGORIES.filter(c => !(c in data));
  out.duplicateIds = [...idCount.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ id, count: n }));
  const valid = out.items.filter(i => !i.invalid);
  out.summary = {
    totalItems: valid.length,
    invalidItems: out.items.length - valid.length,
    filesExisting: valid.filter(i => i.fileExists).length,
    filesMissing: valid.filter(i => !i.fileExists).length,
    repairableMissing: valid.filter(i => !i.fileExists && i.repairCandidate?.exists).length,
    resolvedExisting: valid.filter(i => i.resolvedExists).length,
    resolvedMissing: valid.filter(i => !i.resolvedExists).length,
    outsideDocDir: valid.filter(i => !i.inDocDir).length,
    bgRemovedTrue: valid.filter(i => i.bgRemoved === true).length,
    bgRemovedFalse: valid.filter(i => i.bgRemoved === false).length,
    bgRemovedMissing: valid.filter(i => i.missingV1Fields.includes('bgRemoved')).length,
    itemsWithExtraFields: valid.filter(i => i.extraFields.length > 0).length,
    idPrefixMismatch: valid.filter(i => !i.idPrefixMatchesCategory).length,
  };
  return out;
}

// Shared logic for collection looks + calendar entries (both store snapshot items {id, uri, ...})
async function inspectSnapshotItems(items, wardrobeIds, checkFile) {
  const res = { items: 0, uriMissingField: 0, filesExisting: 0, filesMissing: 0, resolvedExisting: 0, resolvedMissing: 0, directWardrobeIdRefs: 0, derivedWardrobeIdRefs: 0, missingUris: [], resolvedMissingUris: [] };
  for (const ci of Array.isArray(items) ? items : []) {
    res.items++;
    if (typeof ci?.uri !== 'string' || !ci.uri) { res.uriMissingField++; continue; }
    const f = await checkFile(ci.uri);
    if (f.exists) res.filesExisting++;
    else { res.filesMissing++; if (res.missingUris.length < 10) res.missingUris.push(ci.uri); }
    await verifyImageUris([ci.uri]);
    const ru = resolveImageUri(ci.uri);
    const rf = ru === ci.uri ? f : await checkFile(ru);
    if (rf.exists) res.resolvedExisting++;
    else { res.resolvedMissing++; if (res.resolvedMissingUris.length < 10) res.resolvedMissingUris.push(ci.uri); }
    const id = ci?.id != null ? String(ci.id) : '';
    if (wardrobeIds.has(id)) res.directWardrobeIdRefs++;
    else if ([...wardrobeIds].some(wid => id.includes(wid))) res.derivedWardrobeIdRefs++;
  }
  return res;
}

const addInto = (acc, r) => {
  for (const k of ['items', 'uriMissingField', 'filesExisting', 'filesMissing', 'resolvedExisting', 'resolvedMissing', 'directWardrobeIdRefs', 'derivedWardrobeIdRefs']) acc[k] += r[k];
  acc.missingUris.push(...r.missingUris.slice(0, Math.max(0, 10 - acc.missingUris.length)));
  acc.resolvedMissingUris.push(...r.resolvedMissingUris.slice(0, Math.max(0, 10 - acc.resolvedMissingUris.length)));
};
const emptyAcc = () => ({ items: 0, uriMissingField: 0, filesExisting: 0, filesMissing: 0, resolvedExisting: 0, resolvedMissing: 0, directWardrobeIdRefs: 0, derivedWardrobeIdRefs: 0, missingUris: [], resolvedMissingUris: [] });

async function inspectCollection(raw, wardrobeIds, checkFile) {
  const p = safeParse(raw);
  const out = { key: COLLECTION_KEY, present: p.present, parseOk: p.ok ?? null, rawLength: p.length ?? 0 };
  if (!p.present || !p.ok) return p.ok === false ? { ...out, parseError: p.error } : out;
  const data = p.value;
  out.topLevelType = typeOf(data);
  if (out.topLevelType !== 'object') return out;

  out.categories = [];
  out.totals = emptyAcc();
  out.totalLooks = 0;
  out.lookIdPatterns = { outfit_: 0, look_: 0, other: 0 };
  for (const cat of Object.keys(data)) {
    const looks = Array.isArray(data[cat]) ? data[cat] : [];
    out.categories.push({ name: cat, type: typeOf(data[cat]), looks: looks.length });
    out.totalLooks += looks.length;
    for (const look of looks) {
      const lid = String(look?.id ?? '');
      if (lid.startsWith('outfit_')) out.lookIdPatterns.outfit_++;
      else if (lid.startsWith('look_')) out.lookIdPatterns.look_++;
      else out.lookIdPatterns.other++;
      addInto(out.totals, await inspectSnapshotItems(look?.items, wardrobeIds, checkFile));
    }
  }
  return out;
}

async function inspectCalendar(raw, wardrobeIds, checkFile) {
  const p = safeParse(raw);
  const out = { key: CALENDAR_KEY, present: p.present, parseOk: p.ok ?? null, rawLength: p.length ?? 0 };
  if (!p.present || !p.ok) return p.ok === false ? { ...out, parseError: p.error } : out;
  const data = p.value;
  out.topLevelType = typeOf(data);
  if (out.topLevelType !== 'object') return out;

  const dates = Object.keys(data).sort();
  out.entries = dates.length;
  out.firstDate = dates[0] ?? null;
  out.lastDate = dates[dates.length - 1] ?? null;
  out.totals = emptyAcc();
  for (const d of dates) addInto(out.totals, await inspectSnapshotItems(data[d]?.items, wardrobeIds, checkFile));
  return out;
}

async function inspectJournal(pairs, checkFile) {
  const out = { keys: pairs.length, months: [] };
  for (const [key, raw] of pairs) {
    const p = safeParse(raw);
    const m = { key, parseOk: p.ok ?? null, rawLength: p.length ?? 0 };
    if (p.ok && Array.isArray(p.value)) {
      const items = p.value;
      m.items = items.length;
      const byType = {};
      let photoExisting = 0, photoMissing = 0;
      for (const it of items) {
        byType[it?.type ?? 'unknown'] = (byType[it?.type ?? 'unknown'] ?? 0) + 1;
        if (it?.type === 'photo') {
          const f = await checkFile(it.content);
          if (f.exists) photoExisting++; else photoMissing++;
        }
      }
      m.byType = byType;
      m.photoFilesExisting = photoExisting;
      m.photoFilesMissing = photoMissing;
    } else if (p.ok) {
      m.topLevelType = typeOf(p.value);
    }
    out.months.push(m);
  }
  return out;
}

async function inspectDocumentDirectory(docDir, referencedNames) {
  const out = { documentDirectory: docDir };
  if (!docDir) return { ...out, error: 'documentDirectory is null' };
  try {
    const names = await FileSystem.readDirectoryAsync(docDir);
    const itemFiles = names.filter(n => /^item_/.test(n));
    out.totalEntries = names.length;
    out.itemImageFiles = itemFiles.length;
    out.otherEntries = names.filter(n => !/^item_/.test(n)).slice(0, 30);
    const unreferenced = itemFiles.filter(n => !referencedNames.has(n));
    out.itemFilesNotInWardrobe = unreferenced.length; // may still be used by collection/calendar snapshots
    out.itemFilesNotInWardrobeSample = unreferenced.slice(0, 10);
  } catch (e) {
    out.error = e?.message ?? String(e);
  }
  return out;
}

// ── public API ───────────────────────────────────────────────

export async function inspectAppData() {
  const startedAt = new Date();
  const docDir = FileSystem.documentDirectory;
  const checkFile = makeFileChecker();

  const allKeys = [...(await AsyncStorage.getAllKeys())].sort();
  const pairs = await AsyncStorage.multiGet(allKeys);
  const rawByKey = Object.fromEntries(pairs);

  const storageKeys = pairs.map(([k, v]) => ({ key: k, length: v == null ? 0 : v.length }));

  const wardrobe = await inspectWardrobe(rawByKey[WARDROBE_KEY] ?? null, docDir, checkFile);
  const wardrobeIds = new Set((wardrobe.items ?? []).filter(i => i.id != null).map(i => String(i.id)));
  const referencedNames = new Set((wardrobe.items ?? []).map(i => i.fileName).filter(Boolean));

  const collection = await inspectCollection(rawByKey[COLLECTION_KEY] ?? null, wardrobeIds, checkFile);
  const calendar   = await inspectCalendar(rawByKey[CALENDAR_KEY] ?? null, wardrobeIds, checkFile);
  const journal    = await inspectJournal(pairs.filter(([k]) => k.startsWith(JOURNAL_PREFIX)), checkFile);
  const files      = await inspectDocumentDirectory(docDir, referencedNames);

  const backups = Object.entries(PATHFIX_BACKUP_KEYS).map(([src, key]) => {
    const raw = rawByKey[key];
    const p = safeParse(raw ?? null);
    return { source: src, key, present: raw != null, length: raw?.length ?? 0, parseOk: p.ok ?? null, sameAsCurrent: raw != null && raw === rawByKey[src] };
  });

  return {
    inspectorVersion: 1,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    storageKeys,
    wardrobe,
    collection,
    calendar,
    journal,
    files,
    backups,
  };
}

// ── human-readable report ────────────────────────────────────

const yn = (b) => (b ? '✓' : '✗');

export function formatReport(r) {
  const L = [];
  L.push('W2W DATA INSPECTOR (read-only)');
  L.push(`time: ${r.startedAt}  (${r.durationMs} ms)`);
  L.push('');
  L.push('── AsyncStorage keys ──');
  r.storageKeys.forEach(k => L.push(`  ${k.key}  (${k.length} chars)`));

  const w = r.wardrobe;
  L.push('');
  L.push(`── ${w.key} ──`);
  if (!w.present) L.push('  (key not present)');
  else if (!w.parseOk) { L.push(`  ⚠️ JSON PARSE FAILED: ${w.parseError}`); L.push(`  head: ${w.rawHead}`); }
  else if (w.topLevelType !== 'object') L.push(`  ⚠️ top-level type: ${w.topLevelType}`);
  else {
    const s = w.summary;
    L.push(`  size: ${w.rawLength} chars, top-level: object`);
    L.push(`  categories: ${w.categories.map(c => `${c.name}${c.known ? '' : '(UNKNOWN)'}=${c.count}${c.type !== 'array' ? `[${c.type}]` : ''}`).join(', ')}`);
    if (w.missingKnownCategories.length) L.push(`  missing categories: ${w.missingKnownCategories.join(', ')}`);
    L.push(`  total items: ${s.totalItems}   invalid: ${s.invalidItems}`);
    L.push(`  images exist: ${s.filesExisting}   missing: ${s.filesMissing}   (repairable via fileName: ${s.repairableMissing})`);
    L.push(`  ★ AFTER PATH FIX  exist: ${s.resolvedExisting} / ${s.totalItems}   still missing: ${s.resolvedMissing}`);
    L.push(`  uri outside current documentDirectory: ${s.outsideDocDir}`);
    L.push(`  bgRemoved true/false/missing: ${s.bgRemovedTrue}/${s.bgRemovedFalse}/${s.bgRemovedMissing}`);
    L.push(`  items with extra fields: ${s.itemsWithExtraFields}   id-prefix≠category: ${s.idPrefixMismatch}`);
    L.push(`  duplicate ids: ${w.duplicateIds.length ? w.duplicateIds.map(d => `${d.id}×${d.count}`).join(', ') : 'none'}`);
    L.push('');
    L.push('  items:  [img] category / id / label / bgRemoved / file');
    for (const it of w.items) {
      if (it.invalid) { L.push(`  ⚠️ ${it.category}[${it.index}] ${it.invalid}`); continue; }
      const extra = it.extraFields.length ? `  +fields:${it.extraFields.join(',')}` : '';
      const miss  = it.missingV1Fields.length ? `  -missing:${it.missingV1Fields.join(',')}` : '';
      const loc   = it.inDocDir ? '' : `  ⚠️outside-docDir(${it.uriScheme})`;
      const fix   = it.repairCandidate ? `  repair:${yn(it.repairCandidate.exists)}` : '';
      const now   = `  shown:${yn(it.resolvedExists)}`;
      L.push(`  [${yn(it.fileExists)}] ${it.category} / ${it.id} / "${it.label}" / ${it.bgRemoved} / ${it.fileName}${it.fileSize != null ? ` ${Math.round(it.fileSize / 1024)}KB` : ''}${loc}${fix}${now}${extra}${miss}`);
    }
  }

  const sec = (title, o, extraLines) => {
    L.push('');
    L.push(`── ${title} ──`);
    if (!o.present) { L.push('  (key not present)'); return; }
    if (!o.parseOk) { L.push(`  ⚠️ JSON PARSE FAILED: ${o.parseError}`); return; }
    extraLines();
    const t = o.totals;
    if (t) {
      L.push(`  snapshot items: ${t.items}   images exist: ${t.filesExisting}   missing: ${t.filesMissing}   no-uri: ${t.uriMissingField}`);
      L.push(`  ids = wardrobe id: ${t.directWardrobeIdRefs}   derived from wardrobe id: ${t.derivedWardrobeIdRefs}`);
      L.push(`  ★ AFTER PATH FIX  exist: ${t.resolvedExisting} / ${t.items - t.uriMissingField}   still missing: ${t.resolvedMissing}`);
      t.resolvedMissingUris.forEach(u => L.push(`    still missing: ${u}`));
    }
  };

  sec(r.collection.key, r.collection, () => {
    L.push(`  looks: ${r.collection.totalLooks}  (${(r.collection.categories ?? []).map(c => `${c.name}=${c.looks}`).join(', ')})`);
    const p = r.collection.lookIdPatterns;
    if (p) L.push(`  look id patterns: outfit_=${p.outfit_}  look_=${p.look_}  other=${p.other}`);
  });
  sec(r.calendar.key, r.calendar, () => {
    L.push(`  entries: ${r.calendar.entries}  (${r.calendar.firstDate ?? '-'} → ${r.calendar.lastDate ?? '-'})`);
  });

  L.push('');
  L.push(`── journal (${r.journal.keys} month keys) ──`);
  r.journal.months.forEach(m => L.push(`  ${m.key}: items=${m.items ?? '-'} ${m.byType ? JSON.stringify(m.byType) : ''} photos ok/missing=${m.photoFilesExisting ?? 0}/${m.photoFilesMissing ?? 0}${m.parseOk === false ? ' ⚠️PARSE FAILED' : ''}`));

  L.push('');
  L.push('── path-fix backups ──');
  (r.backups ?? []).forEach(b => L.push(`  ${b.key}: ${b.present ? `${yn(b.parseOk)} parse, ${b.length} chars, same as current: ${yn(b.sameAsCurrent)}` : '(not created)'}`));

  const f = r.files;
  L.push('');
  L.push('── documentDirectory ──');
  L.push(`  ${f.documentDirectory}`);
  if (f.error) L.push(`  ⚠️ ${f.error}`);
  else {
    L.push(`  entries: ${f.totalEntries}   item_* images: ${f.itemImageFiles}`);
    L.push(`  item_* files not referenced by wardrobe: ${f.itemFilesNotInWardrobe}`);
    f.itemFilesNotInWardrobeSample.forEach(n => L.push(`    ${n}`));
    if (f.otherEntries.length) L.push(`  other entries: ${f.otherEntries.join(', ')}`);
  }
  return L.join('\n');
}
