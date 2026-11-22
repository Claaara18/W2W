import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useImageUriVersion, resolveItemList } from '../utils/imageUri';
import { backupRawOnce } from '../utils/storageBackup';

const STORAGE_KEY = '@w2w_calendar';
const CalendarContext = createContext(null);

const todayKey = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

export function CalendarProvider({ children }) {
  const [entries, setEntries] = useState({});
  const [loaded,  setLoaded]  = useState(false);
  // Date key of a look just saved to today; Calendar plays the stamp once, then clears it (not persisted)
  const [pendingStamp, setPendingStamp] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        backupRawOnce(STORAGE_KEY, raw);   // exact raw string, new key only
        try { setEntries(JSON.parse(raw)); } catch {}
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries)).catch(() => {});
  }, [entries, loaded]);

  const saveEntry = (dateStr, data) => {
    setEntries(prev => ({ ...prev, [dateStr]: data }));
    if (dateStr === todayKey()) setPendingStamp(dateStr);
  };

  const clearStamp = () => setPendingStamp(null);

  const removeEntry = (dateStr) =>
    setEntries(prev => {
      const next = { ...prev };
      delete next[dateStr];
      return next;
    });

  // Display copy with repaired image paths; raw `entries` is what gets persisted.
  const allUris = useMemo(
    () => Object.values(entries ?? {}).flatMap(e => (Array.isArray(e?.items) ? e.items.map(ci => ci?.uri) : [])),
    [entries]
  );
  const uriVersion = useImageUriVersion(allUris);
  const resolvedEntries = useMemo(() => {
    if (!entries || typeof entries !== 'object') return entries;
    const out = {};
    Object.keys(entries).forEach(d => {
      const e = entries[d];
      const items = resolveItemList(e?.items);
      out[d] = items === e?.items ? e : { ...e, items };
    });
    return out;
  }, [entries, uriVersion]);

  return (
    <CalendarContext.Provider value={{ entries: resolvedEntries, saveEntry, removeEntry, pendingStamp, clearStamp }}>
      {children}
    </CalendarContext.Provider>
  );
}

export const useCalendar = () => useContext(CalendarContext);
