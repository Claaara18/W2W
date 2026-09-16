import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  return (
    <CollectionContext.Provider value={{ looks, addLook, updateLook, toggleFavorite, removeLook }}>
      {children}
    </CollectionContext.Provider>
  );
}

export const useCollection = () => useContext(CollectionContext);
