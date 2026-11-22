import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CATEGORY_IDS, PROTECTED_FIELDS, TAG_STATUS, sanitizeTags, hasAnyTag } from '../utils/wardrobeSchema';
import { useImageUriVersion, resolveItemList } from '../utils/imageUri';
import { backupRawOnce } from '../utils/storageBackup';

const STORAGE_KEY = '@w2w_wardrobe';

const emptyWardrobe = () => {
  const obj = {};
  CATEGORY_IDS.forEach(id => { obj[id] = []; });
  return obj;
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Returns an error string if the saved wardrobe is unusable, otherwise null
const validateSaved = (saved) => {
  if (!isPlainObject(saved)) return `top-level is ${Array.isArray(saved) ? 'array' : typeof saved}`;
  for (const cat of CATEGORY_IDS) {
    if (cat in saved && !Array.isArray(saved[cat])) return `"${cat}" is not an array`;
  }
  return null;
};

const WardrobeContext = createContext(null);

export function WardrobeProvider({ children }) {
  const [items, setItems] = useState(emptyWardrobe);
  const [loaded, setLoaded] = useState(false);
  // When set, auto-save is permanently disabled for this session so the
  // original @w2w_wardrobe value is never overwritten.
  const [loadError, setLoadError] = useState(null);

  // Load on mount
  useEffect(() => {
    const fail = (reason, raw) => {
      console.warn('[wardrobe] 載入失敗，已停止自動儲存以保護原始資料：', reason);
      setLoadError(reason);
      // Keep an extra untouched copy under a NEW key (never the main key)
      if (typeof raw === 'string') {
        AsyncStorage.setItem(`${STORAGE_KEY}_corrupt_${Date.now()}`, raw).catch(() => {});
      }
      Alert.alert(
        '衣櫥資料讀取失敗',
        '為了保護你原本的衣櫥資料，這次開啟 App 不會儲存任何衣櫥變更。請先不要新增或刪除衣服，並聯絡開發者。'
      );
    };

    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw == null) { setLoaded(true); return; }   // first launch: nothing saved yet
        backupRawOnce(STORAGE_KEY, raw);                 // exact raw string, new key only
        let saved;
        try { saved = JSON.parse(raw); }
        catch (e) { fail(`JSON.parse: ${e?.message ?? e}`, raw); return; }
        const err = validateSaved(saved);
        if (err) { fail(err, raw); return; }
        setItems({ ...emptyWardrobe(), ...saved });   // unknown categories / fields are kept
        setLoaded(true);
      })
      .catch(e => fail(`getItem: ${e?.message ?? e}`, null));
  }, []);

  // Persist on every change — only after a successful load
  useEffect(() => {
    if (!loaded || loadError) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
      .catch(e => console.warn('[wardrobe] 儲存失敗：', e?.message ?? e));
  }, [items, loaded, loadError]);

  const addItem = (catId, item) =>
    setItems(prev => ({ ...prev, [catId]: [...(prev[catId] ?? []), item] }));

  // General update — id / uri / bgRemoved can never be changed here (label is allowed)
  const updateItem = (catId, itemId, updates) => {
    const safe = { ...updates };
    PROTECTED_FIELDS.filter(f => f !== 'label').forEach(f => { delete safe[f]; });
    setItems(prev => ({
      ...prev,
      [catId]: (prev[catId] ?? []).map(i => i.id === itemId ? { ...i, ...safe } : i),
    }));
  };

  /**
   * Write tag fields only. Values are validated by the schema; all other fields
   * (id, uri, label, bgRemoved, unknown fields) are left exactly as they were.
   * status defaults to 'confirmed' (or 'untagged' if every tag is empty).
   */
  const updateItemTags = (catId, itemId, tags, status) => {
    const clean = sanitizeTags(tags, catId);
    const tagStatus = status ?? (hasAnyTag(clean) ? TAG_STATUS.CONFIRMED : TAG_STATUS.UNTAGGED);
    setItems(prev => ({
      ...prev,
      [catId]: (prev[catId] ?? []).map(i => i.id === itemId ? { ...i, ...clean, tagStatus } : i),
    }));
  };

  const removeItem = (catId, itemId) =>
    setItems(prev => ({
      ...prev,
      [catId]: (prev[catId] ?? []).filter(i => i.id !== itemId),
    }));

  // Display copy with repaired image paths. `items` (raw) is what gets persisted;
  // every write above works on raw state by id, and uri can never be updated.
  const allUris = useMemo(
    () => Object.values(items).flatMap(arr => (Array.isArray(arr) ? arr.map(i => i?.uri) : [])),
    [items]
  );
  const uriVersion = useImageUriVersion(allUris);
  const resolvedItems = useMemo(() => {
    const out = {};
    Object.keys(items).forEach(cat => { out[cat] = resolveItemList(items[cat]); });
    return out;
  }, [items, uriVersion]);

  return (
    <WardrobeContext.Provider value={{ items: resolvedItems, addItem, updateItem, updateItemTags, removeItem, loaded, loadError }}>
      {children}
    </WardrobeContext.Provider>
  );
}

export const useWardrobe = () => useContext(WardrobeContext);
