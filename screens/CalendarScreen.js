import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, Alert,
  StyleSheet, Dimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCalendar } from '../context/CalendarContext';
import JournalScreen from './JournalScreen';

const BG    = '#F2EDE8';
const DARK  = '#1A1108';
const GRID  = '#C8B5A5';
const CARD  = '#FFFFFF';
const MUTED = '#9E8C7A';
const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO  = 'JetBrainsMono_400Regular';

const { width } = Dimensions.get('window');
const H_PAD = 16;
const CAL_W = width - H_PAD * 2;
const CELL_W = Math.floor(CAL_W / 7);
const CELL_H = Math.round(CELL_W * 1.3);

// Week starts Monday
const DAY_HDRS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ── Outfit thumbnail helpers ──────────────────────────────────
function boundingBox(items) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  items.forEach(ci => {
    const s = ci.scale ?? 1;
    const x = ci.x ?? 0;
    const y = ci.y ?? 0;
    minX = Math.min(minX, x + 41 * (1 - s));
    maxX = Math.max(maxX, x + 41 * (1 + s));
    minY = Math.min(minY, y + 41 * (1 - s));
    maxY = Math.max(maxY, y + 41 * (1 + s));
  });
  return { minX, minY, w: (maxX - minX) || 82, h: (maxY - minY) || 82 };
}

const DATE_SAFE = 16; // vertical space reserved for the date number

function CellThumb({ entry }) {
  const items = (entry?.items ?? []).filter(i => i.uri);
  if (!items.length) return null;
  const { minX, minY, w, h } = boundingBox(items);
  // Fit within the area below the date number
  const availW = CELL_W - 4;
  const availH = CELL_H - DATE_SAFE - 2;
  const ratio  = Math.min(availW / w, availH / h);
  const base   = 82 * ratio;
  const dx     = (availW - w * ratio) / 2 - minX * ratio + 2; // horizontally center
  const dy     = DATE_SAFE - minY * ratio;                     // start below date
  return (
    <View style={{ position: 'absolute', width: CELL_W, height: CELL_H, overflow: 'hidden' }}>
      {items.map(ci => (
        <Image key={ci.id} source={{ uri: ci.uri }}
          style={{ position: 'absolute', width: base, height: base,
            left: (ci.x ?? 0) * ratio + dx,
            top:  (ci.y ?? 0) * ratio + dy,
            transform: [{ scale: ci.scale ?? 1 }] }}
          resizeMode="contain" />
      ))}
    </View>
  );
}

function DiaryThumb({ entry }) {
  const items = (entry?.items ?? []).filter(i => i.uri);
  if (!items.length) return null;
  const pW = CAL_W - 32;
  const pH = 220;
  const { minX, minY, w, h } = boundingBox(items);
  const ratio = Math.min((pW - 32) / w, (pH - 32) / h);
  const base  = 82 * ratio;
  const dx    = (pW - w * ratio) / 2 - minX * ratio;
  const dy    = 16 - minY * ratio;
  return (
    <View style={{ width: pW, height: pH, overflow: 'hidden' }}>
      {items.map(ci => (
        <Image key={ci.id} source={{ uri: ci.uri }}
          style={{ position: 'absolute', width: base, height: base,
            left: (ci.x ?? 0) * ratio + dx,
            top:  (ci.y ?? 0) * ratio + dy,
            transform: [{ scale: ci.scale ?? 1 }] }}
          resizeMode="contain" />
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function CalendarScreen() {
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const { entries, removeEntry } = useCalendar();
  const [journalVisible, setJournalVisible] = useState(false);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };


  // Week starts Monday: Sun(0)→6, Mon(1)→0, …, Sat(6)→5
  const startCol    = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(startCol).fill(null),
                 ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const dateKey  = d => `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const isToday  = d => d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const todayKey   = dateKey(today.getDate());
  const todayEntry = entries[todayKey] ?? null;

  const monthLooks = Object.keys(entries).filter(k => {
    const [y, m] = k.split('-').map(Number);
    return y === viewYear && m === viewMonth + 1;
  }).length;

  const todayLabel = `${MONTH_SHORT[today.getMonth()].toUpperCase()} ${today.getDate()} , ${DAY_FULL[today.getDay()].slice(0,3).toUpperCase()}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >

        {/* ── Month name + nav ── */}
        <View style={styles.monthRow}>
          <View style={styles.monthSide}>
            <TouchableOpacity onPress={prevMonth} hitSlop={14} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={22} color={MUTED} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.monthName} numberOfLines={1} adjustsFontSizeToFit>{MONTH_NAMES[viewMonth]}</Text>
            {viewYear !== today.getFullYear() && (
              <Text style={styles.yearLabel}>{viewYear}</Text>
            )}
          </View>
          <View style={[styles.monthSide, { alignItems: 'flex-end' }]}>
            <TouchableOpacity onPress={nextMonth} hitSlop={14} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={22} color={MUTED} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setJournalVisible(true)}
              hitSlop={12}
              style={styles.journalBtn}
            >
              <Ionicons name="book-outline" size={18} color={MUTED} />
            </TouchableOpacity>
          </View>
        </View>

        <JournalScreen
          visible={journalVisible}
          onClose={() => setJournalVisible(false)}
          viewYear={viewYear}
          viewMonth={viewMonth}
          entries={entries}
        />

        {/* ── Calendar grid ── */}
        <View style={styles.calWrap}>
          {/* Day headers */}
          <View style={styles.hdrRow}>
            {DAY_HDRS.map((d, i) => (
              <View key={i} style={[styles.hdrCell, i > 0 && styles.cellBorderLeft]}>
                <Text style={styles.hdrTxt}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Date rows */}
          {rows.map((row, ri) => (
            <View key={ri} style={styles.dateRow}>
              {row.map((day, ci) => {
                const key   = day ? dateKey(day) : null;
                const entry = key ? (entries[key] ?? null) : null;
                const tod   = day && isToday(day);
                return (
                  <TouchableOpacity
                    key={ci}
                    style={[
                      styles.dateCell,
                      ci > 0 && styles.cellBorderLeft,
                      tod && styles.todayCell,
                    ]}
                    activeOpacity={entry ? 0.75 : 1}
                    disabled={!entry}
                    onPress={entry ? () => Alert.alert(key, '這天的穿搭', [
                      { text: '刪除穿搭', style: 'destructive', onPress: () => removeEntry(key) },
                      { text: '取消', style: 'cancel' },
                    ]) : undefined}
                  >
                    {entry && <CellThumb entry={entry} />}
                    <Text style={[styles.dayNum, tod && styles.todayNum]}>
                      {day ?? ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* ── Stats card ── */}
        <View style={styles.statsCard}>
          <Text style={styles.statsHdr}>THIS MONTH</Text>
          <View style={styles.statsRow}>
            <Text style={styles.statsNum}>{monthLooks}</Text>
            <Text style={styles.statsUnit}> looks</Text>
          </View>
        </View>

        {/* ── Today's diary ── */}
        <View style={styles.diaryCard}>
          <View style={styles.diaryTop}>
            <Text style={styles.diaryDate}>{todayLabel}</Text>
            <Text style={styles.diaryTitle}>Today's diary</Text>
          </View>
          {todayEntry ? (
            <View style={styles.diaryContent}>
              <DiaryThumb entry={todayEntry} />
            </View>
          ) : (
            <View style={styles.diaryEmpty}>
              <Text style={styles.diaryEmptyLine}>今天還沒有記錄穿搭</Text>
              <Text style={styles.diaryEmptyLine}>到 Match 頁面按右上角日曆圖示儲存</Text>
            </View>
          )}
        </View>

        <View style={{ height: 36 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const BORDER = '#E5DDD4';

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: H_PAD, paddingTop: 8, gap: 16 },

  // Month header
  monthRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
  },
  monthSide: { flexDirection: 'row', alignItems: 'center', width: 76 },
  navBtn:    { padding: 8 },
  journalBtn:{ padding: 8, marginLeft: 2 },
  monthName: {
    fontFamily: SERIF, fontSize: 44, fontWeight: '700',
    color: DARK, letterSpacing: -1,
  },
  yearLabel: {
    fontFamily: MONO, fontSize: 11, color: MUTED, marginTop: -4,
  },

  // Calendar grid — flat table with warm coffee-tone borders
  calWrap: {
    borderWidth: 1.5,
    borderColor: GRID,
    borderRadius: 3,
    overflow: 'hidden',
  },
  hdrRow: {
    flexDirection: 'row',
    backgroundColor: BG,
    borderBottomWidth: 1.5,
    borderBottomColor: GRID,
  },
  hdrCell: {
    width: CELL_W, height: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  hdrTxt: {
    fontFamily: MONO, fontSize: 9, color: MUTED,
    fontWeight: '600', letterSpacing: 0.3,
  },
  dateRow: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    borderTopColor: GRID,
  },
  dateCell: {
    width: CELL_W, height: CELL_H,
    overflow: 'hidden', position: 'relative',
    padding: 3,
  },
  cellBorderLeft: {
    borderLeftWidth: 1.5,
    borderLeftColor: GRID,
  },
  todayCell: { backgroundColor: 'rgba(155,130,110,0.12)' },
  dayNum:    { fontFamily: MONO, fontSize: 9, color: DARK, position: 'absolute', top: 3, left: 4 },
  todayNum:  { fontWeight: '700', color: DARK },

  // Stats card
  statsCard: {
    backgroundColor: CARD, borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statsHdr:  { fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: 1.5, marginBottom: 6 },
  statsRow:  { flexDirection: 'row', alignItems: 'baseline' },
  statsNum:  { fontFamily: SERIF, fontSize: 44, fontWeight: '700', color: DARK, lineHeight: 52 },
  statsUnit: { fontFamily: SERIF, fontSize: 20, color: DARK },

  // Diary card
  diaryCard: {
    backgroundColor: CARD, borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  diaryTop:  { marginBottom: 14 },
  diaryDate: { fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, marginBottom: 4 },
  diaryTitle:{ fontFamily: SERIF, fontSize: 24, fontWeight: '700', color: DARK },
  diaryContent: {
    borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed',
    borderRadius: 14, overflow: 'hidden', alignItems: 'center',
  },
  diaryEmpty: {
    borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed',
    borderRadius: 14, paddingVertical: 32, alignItems: 'center', gap: 6,
  },
  diaryEmptyLine: { fontFamily: MONO, fontSize: 11, color: MUTED, letterSpacing: 0.3 },
});
