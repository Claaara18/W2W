import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useImageUriVersion, resolveItemList } from '../utils/imageUri';
import { backupRawOnce } from '../utils/storageBackup';

export const STYLE_CATEGORIES = [
  { id: 'favorites', name: 'Favorites', color: '#E5D1C9' },
  { id: 'casual',    name: 'Casual',    color: '#E5E1C9' },
  { id: 'sports',    name: 'Sports',    color: '#C9E5D8' },
  { id: 'date',      name: 'Date',      color: '#E5C9D2' },
  { id: 'work',      name: 'Work',      color: '#C9D6E5' },
];

const STORAGE_KEY = '@w2w_collection';

const emptyLooks = () => {
  const obj = {};
  STYLE_CATEGORIES.forEach(c => { obj[c.id] = []; });
  return obj;
};

const CollectionContext = createContext(null);

export function CollectionProvider({ children }) {
  const [looks, setLooks] = useState(emptyLooks);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        backupRawOnce(STORAGE_KEY, raw);   // exact raw string, new key only
        try {
          const saved = JSON.parse(raw);
          setLooks(prev => ({ ...emptyLooks(), ...saved }));
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(looks)).catch(() => {});
  }, [looks, loaded]);

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
    <CollectionContext.Provider value={{ looks: resolvedLooks, addLook, updateLook, toggleFavorite, removeLook }}>
      {children}
    </CollectionContext.Provider>
  );
}

export const useCollection = () => useContext(CollectionContext);
