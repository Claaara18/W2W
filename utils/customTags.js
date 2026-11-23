/**
 * Custom tag library — user-defined clothing types (per category) and colours (shared).
 * Stored under its own AsyncStorage key; the wardrobe data is never rewritten by
 * library edits. Items keep a snapshot of the option they use (see wardrobeSchema),
 * and resolveItemCustomTags() refreshes that snapshot from the library for display.
 *
 * All functions are pure: they return a new library and never mutate the input.
 *
 * Library shape:
 *   { version: 1,
 *     subTypes: { [categoryId]: [{ id, label, base }] },     base: internal only — null for new types
 *                                                          (older entries may keep one; never asked)
 *     colors:   [{ id, label, hex, base }] }                 base: computed from hex (fallback only)
 */
import {
  CATEGORY_IDS, COLORS, CUSTOM_LABEL_MAX, CUSTOM_SUBTYPE_LIMIT, CUSTOM_COLOR_LIMIT,
  getSubTypes, normalizeLabel, labelLength, customValue, isCustomValue,
  sanitizeCustomSubType, sanitizeCustomColor, normalizeHex,
} from './wardrobeSchema';

export const CUSTOM_TAGS_KEY = '@w2w_custom_tags';

// 24 preset colours: creams, earth tones, muted and deep shades
export const PALETTE = [
  { hex: '#F3E5AB', name: '奶油黃' }, { hex: '#F5F0E1', name: '象牙白' }, { hex: '#D8C8A8', name: '燕麥色' },
  { hex: '#C8A27A', name: '駝色' },   { hex: '#A0522D', name: '赭褐' },   { hex: '#6B4E3D', name: '可可' },
  { hex: '#E8B4B8', name: '乾燥玫瑰' }, { hex: '#D98880', name: '珊瑚粉' }, { hex: '#B03A2E', name: '磚紅' },
  { hex: '#722F37', name: '酒紅' },   { hex: '#C9A0DC', name: '薰衣草' }, { hex: '#6C3483', name: '葡萄紫' },
  { hex: '#A9CCE3', name: '天空藍' }, { hex: '#7A8FA6', name: '霧霾藍' }, { hex: '#2E4A62', name: '墨藍' },
  { hex: '#76B7B2', name: '薄荷綠' }, { hex: '#3E6B5A', name: '森林綠' }, { hex: '#B5C99A', name: '抹茶綠' },
  { hex: '#8F9779', name: '鼠尾草' }, { hex: '#556B2F', name: '軍綠' },   { hex: '#E59866', name: '杏橘' },
  { hex: '#C9A227', name: '芥末黃' }, { hex: '#4A4A4A', name: '炭灰' },   { hex: '#D5D8DC', name: '霧灰' },
];

export const emptyLibrary = () => ({ version: 1, subTypes: {}, colors: [] });

const sameLabel = (a, b) => normalizeLabel(a).toLowerCase() === normalizeLabel(b).toLowerCase();

/** Clean any parsed value into a valid library (invalid / duplicate entries dropped). */
export function sanitizeLibrary(raw) {
  const lib = emptyLibrary();
  const obj = raw && typeof raw === 'object' ? raw : {};   // unreadable → same shape, all lists empty
  const src = obj.subTypes && typeof obj.subTypes === 'object' ? obj.subTypes : {};
  for (const cat of CATEGORY_IDS) {
    const seen = new Set();
    lib.subTypes[cat] = (Array.isArray(src[cat]) ? src[cat] : [])
      .map(e => sanitizeCustomSubType(e, cat))
      .filter(e => e && !seen.has(e.id) && seen.add(e.id))
      .slice(0, CUSTOM_SUBTYPE_LIMIT);
  }
  const seen = new Set();
  lib.colors = (Array.isArray(obj.colors) ? obj.colors : [])
    .map(sanitizeCustomColor)
    .filter(e => e && !seen.has(e.id) && seen.add(e.id))
    .slice(0, CUSTOM_COLOR_LIMIT);
  return lib;
}

const newId = (prefix, taken, now) => {
  let id = `${prefix}_${now.toString(36)}`;
  while (taken.has(id)) id += Math.floor(Math.random() * 36).toString(36);
  return id;
};

function checkLabel(label) {
  const v = normalizeLabel(label);
  if (!v) return { error: '請輸入名稱' };
  if (labelLength(v) > CUSTOM_LABEL_MAX) return { error: `名稱最多 ${CUSTOM_LABEL_MAX} 個字` };
  return { value: v };
}

// ── custom types (per category) ──────────────────────────────

export const getCustomSubTypes = (lib, cat) => lib?.subTypes?.[cat] ?? [];

export function validateSubTypeInput(lib, cat, input, editingId = null) {
  const l = checkLabel(input?.label);
  if (l.error) return l;
  const builtin = getSubTypes(cat).find(o => sameLabel(o.label, l.value));
  if (builtin) return { error: `內建類型已有「${builtin.label}」` };
  const dup = getCustomSubTypes(lib, cat).find(e => e.id !== editingId && sameLabel(e.label, l.value));
  if (dup) return { error: `已經有「${dup.label}」` };
  if (!editingId && getCustomSubTypes(lib, cat).length >= CUSTOM_SUBTYPE_LIMIT) {
    return { error: `每個分類最多 ${CUSTOM_SUBTYPE_LIMIT} 個自訂類型` };
  }
  const entry = sanitizeCustomSubType({ id: editingId ?? 'tmp', label: l.value, base: input?.base ?? null }, cat);
  return { value: { label: entry.label, base: entry.base } };
}

export function addSubType(lib, cat, input, now = Date.now()) {
  const v = validateSubTypeInput(lib, cat, input);
  if (v.error) return { error: v.error };
  const list = getCustomSubTypes(lib, cat);
  const entry = { id: newId('ct', new Set(list.map(e => e.id)), now), ...v.value };
  return { lib: { ...lib, subTypes: { ...lib.subTypes, [cat]: [...list, entry] } }, entry };
}

export function updateSubType(lib, cat, id, input) {
  const list = getCustomSubTypes(lib, cat);
  const current = list.find(e => e.id === id);
  if (!current) return { error: '找不到這個自訂類型' };
  // The form no longer asks for a base: keep the existing internal one (older data) unless given
  const merged = { ...input, base: input && 'base' in input ? input.base : current.base };
  const v = validateSubTypeInput(lib, cat, merged, id);
  if (v.error) return { error: v.error };
  const entry = { id, ...v.value };
  return { lib: { ...lib, subTypes: { ...lib.subTypes, [cat]: list.map(e => (e.id === id ? entry : e)) } }, entry };
}

export function deleteSubType(lib, cat, id) {
  return { ...lib, subTypes: { ...lib.subTypes, [cat]: getCustomSubTypes(lib, cat).filter(e => e.id !== id) } };
}

// ── custom colours (shared) ──────────────────────────────────

export const getCustomColors = (lib) => lib?.colors ?? [];

export function validateColorInput(lib, input, editingId = null) {
  const l = checkLabel(input?.label);
  if (l.error) return l;
  const hex = normalizeHex(input?.hex);
  if (!hex) return { error: '請輸入正確的 HEX 色碼，例如 #722F37' };
  const builtin = COLORS.find(c => sameLabel(c.label, l.value));
  if (builtin) return { error: `內建顏色已有「${builtin.label}」` };
  const dup = getCustomColors(lib).find(e => e.id !== editingId && sameLabel(e.label, l.value));
  if (dup) return { error: `已經有「${dup.label}」` };
  if (!editingId && getCustomColors(lib).length >= CUSTOM_COLOR_LIMIT) {
    return { error: `自訂顏色最多 ${CUSTOM_COLOR_LIMIT} 個` };
  }
  const entry = sanitizeCustomColor({ id: editingId ?? 'tmp', label: l.value, hex, base: input?.base });
  return { value: { label: entry.label, hex: entry.hex, base: entry.base } };
}

export function addColor(lib, input, now = Date.now()) {
  const v = validateColorInput(lib, input);
  if (v.error) return { error: v.error };
  const list = getCustomColors(lib);
  const entry = { id: newId('cc', new Set(list.map(e => e.id)), now), ...v.value };
  return { lib: { ...lib, colors: [...list, entry] }, entry };
}

export function updateColor(lib, id, input) {
  const list = getCustomColors(lib);
  if (!list.some(e => e.id === id)) return { error: '找不到這個自訂顏色' };
  const v = validateColorInput(lib, input, id);
  if (v.error) return { error: v.error };
  const entry = { id, ...v.value };
  return { lib: { ...lib, colors: list.map(e => (e.id === id ? entry : e)) }, entry };
}

export function deleteColor(lib, id) {
  return { ...lib, colors: getCustomColors(lib).filter(e => e.id !== id) };
}

// ── items ────────────────────────────────────────────────────

/**
 * Display copy of an item whose custom snapshots are refreshed from the library
 * (renamed / recoloured options show their latest values). Returns the SAME object
 * when nothing changes. Options deleted from the library keep the item's snapshot.
 */
export function resolveItemCustomTags(item, cat, lib) {
  if (!item || !lib) return item;
  let next = item;
  if (isCustomValue(item.subType)) {
    const e = getCustomSubTypes(lib, cat).find(x => customValue(x.id) === item.subType);
    const cur = item.customSubType;
    if (e && (!cur || cur.label !== e.label || cur.base !== e.base || cur.id !== e.id)) {
      next = { ...next, customSubType: { id: e.id, label: e.label, base: e.base } };
    }
  }
  if (isCustomValue(item.primaryColor)) {
    const e = getCustomColors(lib).find(x => customValue(x.id) === item.primaryColor);
    const cur = item.customColor;
    if (e && (!cur || cur.label !== e.label || cur.hex !== e.hex || cur.base !== e.base || cur.id !== e.id)) {
      next = { ...next, customColor: { id: e.id, label: e.label, hex: e.hex, base: e.base } };
    }
  }
  return next;
}

/** Copy of a whole wardrobe with refreshed custom snapshots (unchanged lists keep identity). */
export function resolveWardrobeCustomTags(wardrobe, lib) {
  if (!wardrobe || !lib) return wardrobe;
  const out = {};
  for (const cat of Object.keys(wardrobe)) {
    const arr = wardrobe[cat];
    if (!Array.isArray(arr)) { out[cat] = arr; continue; }
    let changed = false;
    const mapped = arr.map(i => { const r = resolveItemCustomTags(i, cat, lib); if (r !== i) changed = true; return r; });
    out[cat] = changed ? mapped : arr;
  }
  return out;
}

/** How many wardrobe items use a given tag value (e.g. 'custom:ct_x') in a field. */
export function countUsage(wardrobe, field, value) {
  let n = 0;
  for (const arr of Object.values(wardrobe ?? {})) {
    if (Array.isArray(arr)) n += arr.filter(i => i?.[field] === value).length;
  }
  return n;
}
