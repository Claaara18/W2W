import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CATEGORY_IDS = ['tshirts', 'jackets', 'skirts', 'pants', 'dresses'];
const STORAGE_KEY  = '@w2w_wardrobe';

const emptyWardrobe = () => {
  const obj = {};
  CATEGORY_IDS.forEach(id => { obj[id] = []; });
  return obj;
};

const WardrobeContext = createContext(null);

export function WardrobeProvider({ children }) {
  const [items, setItems] = useState(emptyWardrobe);
  const [loaded, setLoaded] = useState(false);

  // Load on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          setItems(prev => ({ ...emptyWardrobe(), ...saved }));
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  // Persist on every change (after initial load)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, loaded]);

  const addItem = (catId, item) =>
    setItems(prev => ({ ...prev, [catId]: [...(prev[catId] ?? []), item] }));

  const updateItem = (catId, itemId, updates) =>
    setItems(prev => ({
      ...prev,
      [catId]: prev[catId].map(i => i.id === itemId ? { ...i, ...updates } : i),
    }));

  const removeItem = (catId, itemId) =>
    setItems(prev => ({
      ...prev,
      [catId]: prev[catId].filter(i => i.id !== itemId),
    }));

  return (
    <WardrobeContext.Provider value={{ items, addItem, updateItem, removeItem }}>
      {children}
    </WardrobeContext.Provider>
  );
}

export const useWardrobe = () => useContext(WardrobeContext);
