/**
 * One-time raw JSON backup (image path fix).
 *
 * Copies the exact raw string of a source key into a NEW backup key, then reads it
 * back and compares. An existing backup is never overwritten. The source key is
 * only read, never written.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PATHFIX_BACKUP_KEYS = {
  '@w2w_wardrobe':   '@w2w_backup_pathfix_wardrobe',
  '@w2w_collection': '@w2w_backup_pathfix_collection',
  '@w2w_calendar':   '@w2w_backup_pathfix_calendar',
};

/**
 * @param {string} sourceKey  e.g. '@w2w_wardrobe'
 * @param {string|null} raw   the raw string just read from sourceKey
 * @returns {Promise<{ key, status: 'created'|'exists'|'no-source'|'verify-failed'|'error', error? }>}
 */
export async function backupRawOnce(sourceKey, raw) {
  const key = PATHFIX_BACKUP_KEYS[sourceKey];
  if (!key) return { key: null, status: 'error', error: `no backup key for ${sourceKey}` };
  try {
    if (typeof raw !== 'string') return { key, status: 'no-source' };
    const existing = await AsyncStorage.getItem(key);
    if (existing != null) return { key, status: 'exists' };   // never overwrite

    await AsyncStorage.setItem(key, raw);
    const back = await AsyncStorage.getItem(key);
    if (back !== raw) {
      console.warn('[backup] 讀回驗證失敗：', key);
      return { key, status: 'verify-failed' };
    }
    const metaKey = `${key}_meta`;
    if ((await AsyncStorage.getItem(metaKey)) == null) {
      await AsyncStorage.setItem(metaKey, JSON.stringify({ sourceKey, createdAt: new Date().toISOString(), length: raw.length }));
    }
    console.log('[backup] 已建立並驗證：', key, `(${raw.length} chars)`);
    return { key, status: 'created' };
  } catch (e) {
    console.warn('[backup] 失敗：', key, e?.message ?? e);
    return { key, status: 'error', error: e?.message ?? String(e) };
  }
}
