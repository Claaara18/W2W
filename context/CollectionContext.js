import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useImageUriVersion, resolveItemList } from '../utils/imageUri';
import { backupRawOnce } from '../utils/storageBackup';

// The four default categories (match Home's occasion pills) — can't be renamed or deleted.
export const STYLE_CATEGORIES = [
  { id: 'casual', name: 'Casual', color: '#E5E1C9', icon: 'coffee' },
  { id: 'school', name: 'School', color: '#DCE6CF', icon: 'book-open' },
  { id: 'work',   name: 'Work',   color: '#C9D6E5', icon: 'briefcase' },
  { id: 'date',   name: 'Date',   color: '#E5C9D2', icon: 'heart' },
];

export const CUSTOM_COLORS = ['#E8D5C4', '#D6CFE5', '#CFE3E0', '#E5D1C9', '#C9E5D8'];
const CUSTOM_ICON = 'bookmark';
const FALLBACK_CAT = 'casual';

const STORAGE_KEY = '@w2w_collection';
const CATS_KEY    = '@w2w_collection_cats';   // custom categories only

// Old built-in categories that become custom ones when they still hold looks
const LEGACY_CATS = {
  favorites: { name: 'Favorites', color: '#E5D1C9' },
  sports:    { name: 'Sports',    color: '#C9E5D8' },
};

const emptyLooks = () => {
  const obj = {};
  STYLE_CATEGORIES.forEach(c => { obj[c.id] = []; });
  return obj;
};

const makeCustom = (id, name, color) => ({ id, name, color, icon: CUSTOM_ICON, custom: true });

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Turns any saved look group that has no category into a custom one, so nothing is ever hidden.
 * Covers the old `favorites` / `sports`; empty groups are left out. Idempotent: groups that
 * already have a category are skipped, so after the first run it changes nothing.
 */
export function migrateCustomCats(savedLooks, savedCats) {
  const cats = Array.isArray(savedCats) ? savedCats.filter(c => c && c.id && c.name) : [];
  const known = new Set([...STYLE_CATEGORIES.map(c => c.id), ...cats.map(c => c.id)]);
  const added = [];
  Object.keys(savedLooks ?? {}).forEach(id => {
    const arr = savedLooks[id];
    if (known.has(id) || !Array.isArray(arr) || arr.length === 0) return;
    const legacy = LEGACY_CATS[id];
    const name  = legacy?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
    const color = legacy?.color ?? CUSTOM_COLORS[(cats.length + added.length) % CUSTOM_COLORS.length];
    added.push(makeCustom(id, name, color));
  });
  return [...cats.map(c => makeCustom(c.id, c.name, c.color)), ...added];
}

const CollectionContext = createContext(null);

export function CollectionProvider({ children }) {
  const [looks, setLooks] = useState(emptyLooks);
  const [customCats, setCustomCats] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      let raw = null, rawCats = null;
      try {
        [[, raw], [, rawCats]] = await AsyncStorage.multiGet([STORAGE_KEY, CATS_KEY]);
      } catch {
        return;   // couldn't read — stay unloaded so nothing overwrites the stored looks
      }
      let saved = {};
      if (raw) {
        await backupRawOnce(STORAGE_KEY, raw);   // exact raw string, new key only — before any conversion
        try { saved = JSON.parse(raw) ?? {}; } catch { return; }   // unreadable — never overwrite it
      }
      let savedCats = [];
      try { savedCats = rawCats ? JSON.parse(rawCats) : []; } catch {}
      // Look storage format is unchanged: old groups (e.g. favorites) stay under their own id.
      setLooks({ ...emptyLooks(), ...saved });
      setCustomCats(migrateCustomCats(saved, savedCats));
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(looks)).catch(() => {});
  }, [looks, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(CATS_KEY, JSON.stringify(customCats.map(({ id, name, color }) => ({ id, name, color }))))
      .catch(() => {});
  }, [customCats, loaded]);

  const categories = useMemo(() => [...STYLE_CATEGORIES, ...customCats], [customCats]);

  // Returns the new category, or null when the name is blank or already taken.
  const addCategory = (name) => {
    const trimmed = (name ?? '').trim();
    if (!trimmed || categories.some(c => sameName(c.name, trimmed))) return null;
    let id = `cat_${Date.now()}`;
    while (categories.some(c => c.id === id) || looks[id]) id += '_';
    const cat = makeCustom(id, trimmed, CUSTOM_COLORS[customCats.length % CUSTOM_COLORS.length]);
    setCustomCats(prev => [...prev, cat]);
    return cat;
  };

  const renameCategory = (id, name) => {
    const trimmed = (name ?? '').trim();
    if (!trimmed || categories.some(c => c.id !== id && sameName(c.name, trimmed))) return false;
    if (!customCats.some(c => c.id === id)) return false;
    setCustomCats(prev => prev.map(c => c.id === id ? { ...c, name: trimmed } : c));
    return true;
  };

  // Looks inside a deleted category move to Casual.
  const deleteCategory = (id) => {
    if (!customCats.some(c => c.id === id)) return false;
    setLooks(prev => {
      const { [id]: moving = [], ...rest } = prev;
      return { ...rest, [FALLBACK_CAT]: [...(rest[FALLBACK_CAT] ?? []), ...(Array.isArray(moving) ? moving : [])] };
    });
    setCustomCats(prev => prev.filter(c => c.id !== id));
    return true;
  };

  const moveLook = (fromCatId, toCatId, lookId) => {
    if (fromCatId === toCatId) return;
    setLooks(prev => {
      const look = (prev[fromCatId] ?? []).find(l => l.id === lookId);
      if (!look) return prev;
      return {
        ...prev,
        [fromCatId]: prev[fromCatId].filter(l => l.id !== lookId),
        [toCatId]: [...(prev[toCatId] ?? []), look],
      };
    });
  };

  const addLook = (catId, look) =>
    setLooks(prev => ({ ...prev, [catId]: [...(prev[catId] ?? []), look] }));

  const updateLook = (catId, lookId, updates) =>
    setLooks(prev => ({
      ...prev,
      [catId]: prev[catId].map(l => l.id === lookId ? { ...l, ...updates } : l),
    }));

  const toggleFavorite = (catId, lookId) =>
    setLooks(prev => ({
      ...prev,
      [catId]: prev[catId].map(l => l.id === lookId ? { ...l, favorite: !l.favorite } : l),
    }));

  const removeLook = (catId, lookId) =>
    setLooks(prev => ({
      ...prev,
      [catId]: prev[catId].filter(l => l.id !== lookId),
    }));

  // Display copy with repaired image paths; raw `looks` is what gets persisted.
  const allUris = useMemo(
    () => Object.values(looks).flatMap(arr =>
      (Array.isArray(arr) ? arr.flatMap(l => (Array.isArray(l?.items) ? l.items.map(ci => ci?.uri) : [])) : [])),
    [looks]
  );
  const uriVersion = useImageUriVersion(allUris);
  const resolvedLooks = useMemo(() => {
    const out = {};
    Object.keys(looks).forEach(cat => {
      const arr = looks[cat];
      out[cat] = Array.isArray(arr)
        ? arr.map(l => {
            const items = resolveItemList(l?.items);
            return items === l?.items ? l : { ...l, items };
          })
        : arr;
    });
    return out;
  }, [looks, uriVersion]);

  return (
    <CollectionContext.Provider value={{
      looks: resolvedLooks, addLook, updateLook, toggleFavorite, removeLook,
      categories, addCategory, renameCategory, deleteCategory, moveLook,
    }}>
      {children}
    </CollectionContext.Provider>
  );
}

export const useCollection = () => useContext(CollectionContext);
