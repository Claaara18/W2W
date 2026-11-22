/**
 * DEV-ONLY Recommendation Preview (Phase 3 · Stage 3)
 *
 * Runs the on-device recommender on the REAL wardrobe for
 * 32 / 24 / 16 / 8 °C × Casual / School / Work / Date (16 scenarios) and prints
 * the chosen looks, warmth, scores and why other combinations were excluded.
 *
 * Read-only: only AsyncStorage.getItem is used. Nothing is written.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  recommendOutfitsWithMeta, OCCASIONS, warmthBand, legRequirement, FAIL_LABELS,
} from './outfitRecommender';
import { getItemTags, hasAnyTag, CATEGORY_IDS } from './wardrobeSchema';

export const PREVIEW_TEMPS = [32, 24, 16, 8];

const shortId = (id) => {
  const s = String(id ?? '');
  return s.length > 4 ? s.slice(-4) : s;
};
const name = (item) => `${item.label ?? '?'}#${shortId(item.id)}`;
const f1 = (x) => (typeof x === 'number' ? x.toFixed(1) : '-');
const f2 = (x) => (typeof x === 'number' ? x.toFixed(2) : '-');

/** Pure: build the preview text from a wardrobe object. */
export function buildRecommendationPreview(wardrobe, { temps = PREVIEW_TEMPS, occasions = OCCASIONS } = {}) {
  const L = [];
  L.push('W2W RECOMMENDATION PREVIEW (read-only, seed 0 = best looks)');
  L.push('');

  // Tag coverage
  L.push('── wardrobe ──');
  let total = 0, tagged = 0;
  for (const cat of CATEGORY_IDS) {
    const arr = Array.isArray(wardrobe?.[cat]) ? wardrobe[cat] : [];
    const t = arr.filter(i => hasAnyTag(getItemTags(i, cat))).length;
    total += arr.length; tagged += t;
    L.push(`  ${cat.padEnd(8)} ${arr.length} items, tagged ${t}${arr.length - t ? `, untagged ${arr.length - t}` : ''}`);
    arr.forEach(i => {
      const g = getItemTags(i, cat);
      const bits = [g.subType, g.sleeveLength, g.thickness, g.primaryColor, g.styles.join('/') || null, g.formality ? `f${g.formality}` : null]
        .filter(Boolean).join(' ');
      L.push(`     ${name(i)}  ${bits || '(未標記 → 使用類別預設)'}`);
    });
  }
  L.push(`  total ${total}, tagged ${tagged}`);

  const summary = [];
  for (const T of temps) {
    const band = warmthBand(T);
    L.push('');
    L.push(`════ ${T}°C  warmth ${f1(band.min)}–${f1(band.max)} (ideal ${f1(band.ideal)}), legs ≥ ${f2(legRequirement(T))} ════`);
    for (const occ of occasions) {
      const { outfits, meta } = recommendOutfitsWithMeta(
        wardrobe, { temp: T, feelsLike: T, icon: 'sunny', en: 'Sunny' }, occ, { seed: 0 }
      );
      const c = meta.counts ?? {};
      summary.push(`${String(T).padStart(2)}°C ${occ.padEnd(6)} ${outfits.length} look(s)${outfits.length ? '' : `  — ${meta.reason}`}`);
      L.push('');
      L.push(`── ${T}°C · ${occ} ── ${outfits.length} look(s)   [candidates ${c.candidates ?? 0} → weather ok ${c.weatherOk ?? 0} → occasion ok ${c.passed ?? 0}]`);
      if (!outfits.length) L.push(`  ⚠️ ${meta.message}`);
      outfits.forEach((o, i) => {
        const b = o.breakdown;
        L.push(`  ${i + 1}. [${o.score}] ${o.items.map(name).join(' + ')}`);
        L.push(`       W ${f2(b.warmth)}  leg ${f2(b.legWarmth)}  formality ${f1(b.formality)}  colour:${b.colorLabel}` +
          `  | weather ${f2(b.weather)} occasion ${f2(b.occasion)} colour ${f2(b.color)} style ${f2(b.style)}` +
          (b.untagged ? `  (${b.untagged} untagged)` : ''));
      });
      const ex = meta.excluded ?? {};
      const keys = Object.keys(ex).sort((a, b) => ex[b].count - ex[a].count);
      if (keys.length) {
        L.push('  excluded:');
        keys.forEach(k => {
          const e = ex[k];
          L.push(`    · ${FAIL_LABELS[k] ?? k} ×${e.count}`);
          e.examples.slice(0, 2).forEach(x => L.push(
            `        e.g. ${x.labels.map((l, k) => `${l}#${shortId(x.ids?.[k])}`).join(' + ')}  (${x.detail})`
          ));
        });
      }
    }
  }

  L.push('');
  L.push('── summary ──');
  summary.forEach(s => L.push(`  ${s}`));
  return L.join('\n');
}

/** Read the saved wardrobe (read-only) and build the preview. */
export async function runRecommendationPreview() {
  const raw = await AsyncStorage.getItem('@w2w_wardrobe');
  if (raw == null) return 'W2W RECOMMENDATION PREVIEW\n\n@w2w_wardrobe 不存在（衣櫃是空的）';
  let wardrobe;
  try { wardrobe = JSON.parse(raw); }
  catch (e) { return `W2W RECOMMENDATION PREVIEW\n\n⚠️ @w2w_wardrobe JSON 解析失敗：${e?.message ?? e}`; }
  return buildRecommendationPreview(wardrobe);
}
