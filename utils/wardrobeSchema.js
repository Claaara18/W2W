/**
 * W2W clothing tag schema (Phase 1)
 *
 * Tags are stored as optional flat fields on each wardrobe item, next to the
 * original v1 fields { id, uri, label, bgRemoved } which are never modified.
 * Old items simply lack these fields; getItemTags() fills safe defaults at
 * read time, so no on-disk migration is needed.
 *
 *   subType       string | null   (per-category enum, see SUBTYPES)
 *   sleeveLength  'sleeveless' | 'short' | 'three_quarter' | 'long' | null
 *   thickness     'thin' | 'medium' | 'thick' | null
 *   primaryColor  color value from COLORS | null
 *   styles        string[]        (multi-select from STYLES)
 *   formality     1–5 | null
 *   tagStatus     'untagged' | 'ai_suggested' | 'confirmed'
 *
 * Warmth is NOT stored — estimateWarmth() derives it from subType, sleeveLength, thickness.
 */

export const CATEGORY_IDS = ['tshirts', 'jackets', 'skirts', 'pants', 'dresses'];

// Fields that tag editing / AI must never overwrite
export const PROTECTED_FIELDS = ['id', 'uri', 'label', 'bgRemoved'];

export const TAG_FIELDS = ['subType', 'sleeveLength', 'thickness', 'primaryColor', 'styles', 'formality', 'tagStatus'];

export const TAG_STATUS = {
  UNTAGGED:     'untagged',
  AI_SUGGESTED: 'ai_suggested',
  CONFIRMED:    'confirmed',
};

export const TAG_STATUS_LABELS = {
  untagged:     '尚未標記',
  ai_suggested: 'AI 建議・待確認',
  confirmed:    '已確認',
};

// warmth: base warmth used by estimateWarmth (rough scale 0–6)
export const SUBTYPES = {
  tshirts: [
    { value: 'tank',    label: '背心',      warmth: 0.5 },
    { value: 'tee',     label: 'T 恤',      warmth: 1.0 },
    { value: 'polo',    label: 'Polo 衫',   warmth: 1.2 },
    { value: 'blouse',  label: '上衣/雪紡',  warmth: 1.0 },
    { value: 'shirt',   label: '襯衫',      warmth: 1.5 },
    { value: 'hoodie',  label: '帽 T/大學 T', warmth: 3.0 },
    { value: 'sweater', label: '毛衣/針織',  warmth: 3.5 },
  ],
  jackets: [
    { value: 'cardigan',    label: '針織外套', warmth: 2.0 },
    { value: 'denim',       label: '牛仔外套', warmth: 2.5 },
    { value: 'blazer',      label: '西裝外套', warmth: 2.5 },
    { value: 'zip_hoodie',  label: '連帽外套', warmth: 2.5 },
    { value: 'windbreaker', label: '防風外套', warmth: 2.5 },
    { value: 'trench',      label: '風衣',     warmth: 3.0 },
    { value: 'leather',     label: '皮衣',     warmth: 3.0 },
    { value: 'coat',        label: '大衣',     warmth: 4.5 },
    { value: 'puffer',      label: '羽絨/鋪棉', warmth: 5.0 },
  ],
  skirts: [
    { value: 'mini',    label: '短裙',   warmth: 0.5 },
    { value: 'pleated', label: '百褶裙', warmth: 0.9 },
    { value: 'denim',   label: '牛仔裙', warmth: 0.9 },
    { value: 'midi',    label: '中長裙', warmth: 1.2 },
    { value: 'maxi',    label: '長裙',   warmth: 1.5 },
  ],
  pants: [
    { value: 'shorts',   label: '短褲',   warmth: 0.3 },
    { value: 'leggings', label: '內搭褲', warmth: 1.4 },
    { value: 'wide',     label: '寬褲',   warmth: 1.6 },
    { value: 'joggers',  label: '運動褲', warmth: 1.8 },
    { value: 'chinos',   label: '休閒褲', warmth: 1.8 },
    { value: 'slacks',   label: '西裝褲', warmth: 1.8 },
    { value: 'jeans',    label: '牛仔褲', warmth: 2.0 },
  ],
  dresses: [
    { value: 'slip',       label: '細肩洋裝', warmth: 0.8 },
    { value: 'casual',     label: '休閒洋裝', warmth: 1.5 },
    { value: 'formal',     label: '正式洋裝', warmth: 1.6 },
    { value: 'shirt_dress', label: '襯衫洋裝', warmth: 1.8 },
    { value: 'knit',       label: '針織洋裝', warmth: 2.8 },
  ],
};

// Used when subType is not set yet
const CATEGORY_BASE_WARMTH = { tshirts: 1.2, jackets: 3.0, skirts: 1.0, pants: 1.8, dresses: 1.5 };

export const SLEEVE_CATEGORIES = ['tshirts', 'jackets', 'dresses'];

export const SLEEVE_LENGTHS = [
  { value: 'sleeveless',    label: '無袖',   warmth: -0.4 },
  { value: 'short',         label: '短袖',   warmth: 0 },
  { value: 'three_quarter', label: '七分袖', warmth: 0.3 },
  { value: 'long',          label: '長袖',   warmth: 0.6 },
];

export const THICKNESS = [
  { value: 'thin',   label: '薄', factor: 0.75 },
  { value: 'medium', label: '中', factor: 1.0 },
  { value: 'thick',  label: '厚', factor: 1.3 },
];

// neutral: pairs with almost anything (used by the Phase 3 color score)
export const COLORS = [
  { value: 'black',  label: '黑',   hex: '#1E1E1E', neutral: true },
  { value: 'white',  label: '白',   hex: '#F7F5F0', neutral: true },
  { value: 'gray',   label: '灰',   hex: '#9A9A9A', neutral: true },
  { value: 'beige',  label: '米/卡其', hex: '#D9C7A7', neutral: true },
  { value: 'brown',  label: '棕',   hex: '#7B5638', neutral: true },
  { value: 'navy',   label: '深藍', hex: '#1F2A44', neutral: true },
  { value: 'denim',  label: '牛仔藍', hex: '#5B7FA6', neutral: true },
  { value: 'blue',   label: '藍',   hex: '#3D7BD9', neutral: false },
  { value: 'green',  label: '綠',   hex: '#4E8A57', neutral: false },
  { value: 'olive',  label: '橄欖綠', hex: '#7A7A45', neutral: false },
  { value: 'red',    label: '紅',   hex: '#C23B3B', neutral: false },
  { value: 'pink',   label: '粉',   hex: '#EBA8BC', neutral: false },
  { value: 'purple', label: '紫',   hex: '#8A63B8', neutral: false },
  { value: 'yellow', label: '黃',   hex: '#E8C547', neutral: false },
  { value: 'orange', label: '橘',   hex: '#E3874A', neutral: false },
  { value: 'multi',  label: '多色/花紋', hex: null, neutral: false },
];

export const STYLES = [
  { value: 'casual',  label: '休閒' },
  { value: 'formal',  label: '正式' },
  { value: 'sweet',   label: '甜美' },
  { value: 'vintage', label: '復古' },
  { value: 'street',  label: '街頭' },
  { value: 'minimal', label: '簡約' },
  { value: 'sporty',  label: '運動' },
];

export const FORMALITY = [
  { value: 1, label: '1 很隨性' },
  { value: 2, label: '2 日常' },
  { value: 3, label: '3 整齊' },
  { value: 4, label: '4 半正式' },
  { value: 5, label: '5 正式' },
];

// ── lookups ──────────────────────────────────────────────────

const has = (list, v) => list.some(o => o.value === v);
const find = (list, v) => list.find(o => o.value === v) ?? null;

export const getSubTypes  = (categoryId) => SUBTYPES[categoryId] ?? [];
export const usesSleeve   = (categoryId) => SLEEVE_CATEGORIES.includes(categoryId);
export const getColorInfo = (value) => find(COLORS, value);
export const labelOf      = (list, v) => find(list, v)?.label ?? null;

// ── validation ───────────────────────────────────────────────

/**
 * Validate an arbitrary tag object (from UI or AI) for a category.
 * Returns ONLY tag fields (never id/uri/label/bgRemoved); invalid values become null / [].
 * tagStatus is not included — the caller decides it.
 */
export function sanitizeTags(input, categoryId) {
  const t = input ?? {};
  const subType      = has(getSubTypes(categoryId), t.subType) ? t.subType : null;
  const sleeveLength = usesSleeve(categoryId) && has(SLEEVE_LENGTHS, t.sleeveLength) ? t.sleeveLength : null;
  const thickness    = has(THICKNESS, t.thickness) ? t.thickness : null;
  const primaryColor = has(COLORS, t.primaryColor) ? t.primaryColor : null;
  const styles       = Array.isArray(t.styles)
    ? [...new Set(t.styles.filter(s => has(STYLES, s)))]
    : [];
  const f = Number(t.formality);
  const formality    = Number.isInteger(f) && f >= 1 && f <= 5 ? f : null;
  return { subType, sleeveLength, thickness, primaryColor, styles, formality };
}

export const hasAnyTag = (tags) =>
  !!(tags && (tags.subType || tags.sleeveLength || tags.thickness || tags.primaryColor ||
    tags.formality || (tags.styles && tags.styles.length)));

const normalizeStatus = (s) =>
  Object.values(TAG_STATUS).includes(s) ? s : TAG_STATUS.UNTAGGED;

/** Read-time view of an item's tags — works for old items without any tag fields. */
export function getItemTags(item, categoryId) {
  const cat = categoryId ?? item?.categoryId ?? item?.catId;
  return { ...sanitizeTags(item, cat), tagStatus: normalizeStatus(item?.tagStatus) };
}

// ── derived warmth ───────────────────────────────────────────

/**
 * Estimated warmth of a single garment (≈ 0–6). Never stored.
 * base(subType or category) + sleeve modifier, then × thickness factor.
 */
export function estimateWarmth(item, categoryId) {
  const cat  = categoryId ?? item?.categoryId ?? item?.catId;
  const tags = sanitizeTags(item, cat);
  const sub  = find(getSubTypes(cat), tags.subType);
  let w = sub ? sub.warmth : (CATEGORY_BASE_WARMTH[cat] ?? 1.0);
  const sleeve = find(SLEEVE_LENGTHS, tags.sleeveLength);
  if (sleeve) w += sleeve.warmth;
  const thick = find(THICKNESS, tags.thickness);
  if (thick) w *= thick.factor;
  return Math.round(Math.max(0, Math.min(6, w)) * 10) / 10;
}
