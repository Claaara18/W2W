import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@w2w_calendar';
const CalendarContext = createContext(null);

export function CalendarProvider({ children }) {
  const [entries, setEntries] = useState({});
  const [loaded,  setLoaded]  = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setEntries(JSON.parse(raw)); } catch {}
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries)).catch(() => {});
  }, [entries, loaded]);

  const saveEntry = (dateStr, data) =>
    setEntries(prev => ({ ...prev, [dateStr]: data }));

  return (
    <CalendarContext.Provider value={{ entries, saveEntry }}>
      {children}
    </CalendarContext.Provider>
  );
}

export const useCalendar = () => useContext(CalendarContext);
