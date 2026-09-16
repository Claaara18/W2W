import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, Dimensions, Platform, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCalendar } from '../context/CalendarContext';

const BEIGE  = '#F2EDE8';
const CARD   = '#FFFFFF';
const DARK   = '#1A1108';
const MUTED  = '#9E8C7A';
const BORDER = '#E5DDD4';
const SERIF  = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO   = 'JetBrainsMono_400Regular';
const { width } = Dimensions.get('window');

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_COL   = ['S','M','T','W','T','F','S'];

const CARD_W   = width - 32;
const CAL_PAD  = 14;
const CELL_W   = Math.floor((CARD_W - CAL_PAD * 2) / 7);
const CELL_H   = CELL_W + 8;

// Mini outfit thumbnail for a calendar cell
function CellThumb({ entry }) {
  const items = (entry?.items ?? []).filter(i => i.uri);
  if (items.length === 0) return null;

  const PAD = 2;
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

  const cW    = (maxX - minX) || 82;
  const cH    = (maxY - minY) || 82;
  const avail = Math.min(CELL_W, CELL_H) - PAD * 2;
  const ratio = Math.min(avail / cW, avail / cH);
  const base  = 82 * ratio;
  const dx    = PAD - minX * ratio;
  const dy    = PAD - minY * ratio;

  return (
    <View style={{ position: 'absolute', width: CELL_W, height: CELL_H, overflow: 'hidden' }}>
      {items.map(ci => (
        <Image
          key={ci.id}
          source={{ uri: ci.uri }}
          style={{
            position: 'absolute',
            width: base, height: base,
            left: (ci.x ?? 0) * ratio + dx,
            top:  (ci.y ?? 0) * ratio + dy,
            transform: [{ scale: ci.scale ?? 1 }],
          }}
          resizeMode="contain"
        />
      ))}
    </View>
  );
}

// Diary outfit preview (larger)
function DiaryThumb({ entry }) {
  const items = (entry?.items ?? []).filter(i => i.uri);
  if (items.length === 0) return null;

  const PAD = 16;
  const pW  = CARD_W - 32;
  const pH  = 220;
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

  const cW    = (maxX - minX) || 82;
  const cH    = (maxY - minY) || 82;
  const ratio = Math.min((pW - PAD * 2) / cW, (pH - PAD * 2) / cH);
  const base  = 82 * ratio;
  const dx    = (pW - cW * ratio) / 2 - minX * ratio;
  const dy    = PAD - minY * ratio;

  return (
    <View style={{ width: pW, height: pH, overflow: 'hidden' }}>
      {items.map(ci => (
        <Image
          key={ci.id}
          source={{ uri: ci.uri }}
          style={{
            position: 'absolute',
            width: base, height: base,
            left: (ci.x ?? 0) * ratio + dx,
            top:  (ci.y ?? 0) * ratio + dy,
            transform: [{ scale: ci.scale ?? 1 }],
          }}
          resizeMode="contain"
        />
      ))}
    </View>
  );
}

export default function CalendarScreen() {
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const { entries } = useCalendar();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // Swipe to navigate months
  const swipeRef = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) =>
      Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 30,
    onPanResponderRelease: (_, gs) => {
      if (gs.dx < -50) nextMonth();
      else if (gs.dx > 50) prevMonth();
    },
  })).current;

  // Calendar grid
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null),
                 ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const dateKey = (day) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const isToday = (day) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  // Stats
  const monthLooks = Object.keys(entries).filter(k => {
    const [y, m] = k.split('-').map(Number);
    return y === viewYear && m === viewMonth + 1;
  }).length;

  // Today's diary
  const todayKey   = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const todayEntry = entries[todayKey] ?? null;

  const todayLabel = `${MONTH_SHORT[today.getMonth()].toUpperCase()} ${today.getDate()} , ${DAY_FULL[today.getDay()].slice(0,3).toUpperCase()}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.chapter}>Chapter . IV</Text>
          <View style={styles.monthNavRow}>
            <TouchableOpacity onPress={prevMonth} hitSlop={14}>
              <Ionicons name="chevron-back" size={22} color={MUTED} />
            </TouchableOpacity>
            <Text style={styles.monthName}>{MONTH_NAMES[viewMonth]}</Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={14}>
              <Ionicons name="chevron-forward" size={22} color={MUTED} />
            </TouchableOpacity>
          </View>
          <Text style={styles.dateSubtitle}>
            {DAY_FULL[today.getDay()]},{MONTH_SHORT[today.getMonth()]} {today.getDate()},{today.getFullYear()}
          </Text>
        </View>

        {/* ── Calendar card ── */}
        <View style={styles.card} {...swipeRef.panHandlers}>
          {/* Day headers */}
          <View style={styles.dayHdrRow}>
            {DAY_COL.map((d, i) => (
              <Text key={i} style={styles.dayHdr}>{d}</Text>
            ))}
          </View>

          {/* Rows */}
          {rows.map((row, ri) => (
            <View key={ri} style={styles.calRow}>
              {row.map((day, ci) => {
                const entry   = day ? entries[dateKey(day)] : null;
                const todayCl = day && isToday(day);
                return (
                  <View key={ci} style={[styles.dayCell, todayCl && styles.todayCell]}>
                    {entry && <CellThumb entry={entry} />}
                    <Text style={[styles.dayNum, todayCl && styles.todayNum, entry && styles.dayNumSmall]}>
                      {day ?? ''}
                    </Text>
                  </View>
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
            <Text style={styles.statsLabel}> looks</Text>
          </View>
        </View>

        {/* ── Today's diary ── */}
        <View style={styles.diaryCard}>
          <View style={styles.diaryTop}>
            <View>
              <Text style={styles.diaryDate}>{todayLabel}</Text>
              <Text style={styles.diaryTitle}>Today's diary</Text>
            </View>
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

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BEIGE },
  scroll: { paddingTop: 8, paddingHorizontal: 16, gap: 14 },

  // Header
  header: { alignItems: 'center', paddingVertical: 12 },
  chapter: { fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, marginBottom: 6 },
  monthNavRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 4 },
  monthName: { fontFamily: SERIF, fontSize: 42, fontWeight: '700', color: DARK },
  dateSubtitle: { fontFamily: SERIF, fontSize: 13, color: MUTED, fontStyle: 'italic' },

  // Calendar card
  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    paddingHorizontal: CAL_PAD,
    paddingTop: 12,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  dayHdrRow: { flexDirection: 'row', marginBottom: 4 },
  dayHdr: { width: CELL_W, textAlign: 'center', fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 0.5 },
  calRow: { flexDirection: 'row', marginBottom: 2 },
  dayCell: {
    width: CELL_W, height: CELL_H,
    borderRadius: 8, overflow: 'hidden',
    backgroundColor: '#F5F0EA',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    padding: 2,
    marginRight: 0,
  },
  todayCell: { borderWidth: 1.5, borderColor: DARK },
  dayNum: { fontFamily: MONO, fontSize: 10, color: DARK },
  todayNum: { fontWeight: '700' },
  dayNumSmall: { fontSize: 9, color: MUTED },

  // Stats card
  statsCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statsHdr: { fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: 1.5, marginBottom: 6 },
  statsRow: { flexDirection: 'row', alignItems: 'baseline' },
  statsNum: { fontFamily: SERIF, fontSize: 44, fontWeight: '700', color: DARK, lineHeight: 52 },
  statsLabel: { fontFamily: SERIF, fontSize: 20, color: DARK },

  // Diary card
  diaryCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  diaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  diaryDate: { fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, marginBottom: 4 },
  diaryTitle: { fontFamily: SERIF, fontSize: 24, fontWeight: '700', color: DARK },
  diaryContent: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderStyle: 'dashed',
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
  },
  diaryEmpty: {
    borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed', borderRadius: 14,
    paddingVertical: 32, alignItems: 'center', gap: 6,
  },
  diaryEmptyLine: { fontFamily: MONO, fontSize: 11, color: MUTED, letterSpacing: 0.3 },
});
