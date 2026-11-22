import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, Image, Alert,
  Animated, Easing, StyleSheet, Dimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useCalendar } from '../context/CalendarContext';
import { useWardrobe } from '../context/WardrobeContext';
import JournalScreen from './JournalScreen';
import Squirrel from '../components/Squirrel';

const BG       = '#F3EEE5';
const DARK     = '#1A120B';
const BROWN    = '#5A4628';
const LABEL    = '#7A6650';
const MUTED    = '#8C7758';
const GRID     = '#C9B9A6';
const CARD     = '#FBF9F5';
const TODAY_BG = '#E6DDD5';
const SEL_BG   = '#EADFCB';
const DASH     = '#D8CCBD';
const SERIF    = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO     = 'JetBrainsMono_400Regular';

const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);
const SPRING   = Easing.bezier(0.2, 1.4, 0.35, 1);

const { width } = Dimensions.get('window');
const H_PAD = 16;
const CAL_W = width - H_PAD * 2;
const CELL_W = Math.floor(CAL_W / 7);
const CELL_H = Math.round(CELL_W * 1.3);
const STAGE  = 116;
const SLIDE  = 34;   // month change slide distance
const BORDER = 1.5;  // grid line width (calWrap, header and row borders)
const HDR_H  = 28;

// Week starts Monday
const DAY_HDRS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const CATEGORY_LABELS = {
  tshirts: 'Top', jackets: 'Jacket', skirts: 'Skirt', pants: 'Pants', dresses: 'Dress',
};

const keyOf = (y, m, d) => `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

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
    <View pointerEvents="none" style={{ position: 'absolute', width: CELL_W, height: CELL_H, overflow: 'hidden' }}>
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

function DiaryThumb({ entry, w = CAL_W - 32, h = 220, pad = 16 }) {
  const items = (entry?.items ?? []).filter(i => i.uri);
  if (!items.length) return null;
  const pW = w;
  const pH = h;
  const { minX, minY, w: bw, h: bh } = boundingBox(items);
  const ratio = Math.min((pW - pad * 2) / bw, (pH - pad * 2) / bh);
  const base  = 82 * ratio;
  const dx    = (pW - bw * ratio) / 2 - minX * ratio;
  const dy    = (pH - bh * ratio) / 2 - minY * ratio;
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

// ── Motion helpers ────────────────────────────────────────────
// Selected-day outline: springs from 0.8 to 1 each time it mounts
function SelRing() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(a, { toValue: 1, duration: 350, easing: SPRING, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.selRing, {
        opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
      }]}
    />
  );
}

// Diary body: fades in and rises on every mount (keyed by the selected day)
function SwapIn({ children }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(a, { toValue: 1, duration: 400, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View style={{
      opacity: a,
      transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
    }}>
      {children}
    </Animated.View>
  );
}

// Monthly count: drops in from above when the month or the number changes
function FlipNumber({ value, flipKey }) {
  const a = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    a.setValue(0);
    const anim = Animated.timing(a, { toValue: 1, duration: 500, easing: SPRING, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [flipKey]);
  return (
    <Animated.Text style={[styles.statsNum, {
      opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
      transform: [
        { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) },
        { scale: a.interpolate({ inputRange: [0, 1], outputRange: [1.3, 1] }) },
      ],
    }]}>
      {value}
    </Animated.Text>
  );
}

// Stamp moment: today's thumbnail lands from 2.2× / -14° while a ring spreads out and fades.
// Drawn above the grid (the cells clip), at the cell's own position; never takes touches.
function StampOverlay({ entry, rect, v, ring }) {
  return (
    <View pointerEvents="none" style={[styles.stampBox, { left: rect.x, top: rect.y }]}>
      <Animated.View style={[styles.stampRing, {
        opacity:   ring.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.9, 0] }),
        transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.9] }) }],
      }]} />
      <Animated.View style={{
        position: 'absolute', left: 0, top: 0,
        opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
        transform: [
          { scale:  v.interpolate({ inputRange: [0, 1], outputRange: [2.2, 1] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] }) },
        ],
      }}>
        <CellThumb entry={entry} />
      </Animated.View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function CalendarScreen() {
  const today = new Date();
  const navigation = useNavigation();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [sel, setSel] = useState({ y: today.getFullYear(), m: today.getMonth(), d: today.getDate() });
  const { entries, removeEntry, pendingStamp, clearStamp } = useCalendar();
  const { items: wardrobe } = useWardrobe();
  const [journalVisible, setJournalVisible] = useState(false);
  const isFocused = useIsFocused();

  // ── Animated values ──
  const titleRise = useRef(new Animated.Value(0)).current;               // entrance
  const cellsIn   = useRef([...Array(42)].map(() => new Animated.Value(0))).current;
  const cardsIn   = useRef([0, 1].map(() => new Animated.Value(0))).current;
  const monthX    = useRef(new Animated.Value(0)).current;               // month change slide
  const monthOp   = useRef(new Animated.Value(1)).current;
  const busy      = useRef(false);
  const mounted   = useRef(true);
  const running   = useRef([]);

  useEffect(() => {
    const entrance = Animated.parallel([
      Animated.timing(titleRise, { toValue: 1, duration: 750, delay: 200, easing: EASE_OUT, useNativeDriver: true }),
      ...cellsIn.map((v, i) =>
        Animated.timing(v, { toValue: 1, duration: 500, delay: 250 + i * 14, easing: EASE_OUT, useNativeDriver: true })),
      ...cardsIn.map((v, i) =>
        Animated.timing(v, { toValue: 1, duration: 750, delay: 380 + i * 90, easing: EASE_OUT, useNativeDriver: true })),
    ]);
    entrance.start();
    running.current.push(entrance);
    return () => {
      mounted.current = false;
      running.current.forEach(a => a.stop());
    };
  }, []);

  const changeMonth = (dir) => {
    if (busy.current) return;
    busy.current = true;
    const out = Animated.parallel([
      Animated.timing(monthX,  { toValue: -dir * SLIDE, duration: 170, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      Animated.timing(monthOp, { toValue: 0, duration: 170, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]);
    running.current.push(out);
    out.start(({ finished }) => {
      if (!mounted.current) return;
      const dt = new Date(viewYear, viewMonth + dir, 1);
      setViewYear(dt.getFullYear());
      setViewMonth(dt.getMonth());
      if (!finished) { monthX.setValue(0); monthOp.setValue(1); busy.current = false; return; }
      monthX.setValue(dir * SLIDE);
      const back = Animated.parallel([
        Animated.timing(monthX,  { toValue: 0, duration: 380, easing: EASE_OUT, useNativeDriver: true }),
        Animated.timing(monthOp, { toValue: 1, duration: 380, easing: EASE_OUT, useNativeDriver: true }),
      ]);
      running.current.push(back);
      back.start(() => { busy.current = false; });
    });
  };
  const prevMonth = () => changeMonth(-1);
  const nextMonth = () => changeMonth(1);

  // Week starts Monday: Sun(0)→6, Mon(1)→0, …, Sat(6)→5
  const startCol    = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(startCol).fill(null),
                 ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const dateKey  = d => keyOf(viewYear, viewMonth, d);
  const isToday  = d => d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const monthLooks = Object.keys(entries).filter(k => {
    const [y, m] = k.split('-').map(Number);
    return y === viewYear && m === viewMonth + 1;
  }).length;

  // ── Selected day ──
  const selKey     = keyOf(sel.y, sel.m, sel.d);
  const selEntry   = entries[selKey] ?? null;
  const selIsToday = sel.y === today.getFullYear() && sel.m === today.getMonth() && sel.d === today.getDate();
  const selDate    = new Date(sel.y, sel.m, sel.d);
  const selLabel   = `${MONTH_SHORT[sel.m].toUpperCase()} ${sel.d} , ${DAY_SHORT[selDate.getDay()].toUpperCase()}`;
  const selTitle   = selIsToday ? "Today's diary" : `${MONTH_SHORT[sel.m]} ${sel.d} diary`;

  // Diary entries only store id/uri/label, so look the category up in the wardrobe
  const categoryOf = useMemo(() => {
    const map = {};
    Object.entries(wardrobe ?? {}).forEach(([catId, arr]) =>
      (arr ?? []).forEach(item => { map[item.id] = CATEGORY_LABELS[catId] ?? catId; }));
    return map;
  }, [wardrobe]);
  const selPieces = (selEntry?.items ?? [])
    .filter(i => i.uri)
    .map(i => categoryOf[i.id] ?? (i.label || 'Item'));

  const confirmRemove = () => {
    Alert.alert('移除這天的穿搭？', `${sel.m + 1}/${sel.d} 的穿搭會從日記中刪除`, [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => removeEntry(selKey) },
    ]);
  };

  // ── Squirrel: quiet on the stats card; hops to today's cell for the stamp moment ──
  const sqRef      = useRef(null);
  const lay        = useRef({}).current;   // calWrap, stats (scroll content coordinates)
  const [layVer, setLayVer]     = useState(0);
  const [sqReady, setSqReady]   = useState(false);
  const [stampKey, setStampKey] = useState(null);   // hides the cell's own thumb while stamping
  const stampV   = useRef(new Animated.Value(0)).current;
  const ringV    = useRef(new Animated.Value(0)).current;
  const stamping = useRef(false);
  const onLay = (key) => (e) => { lay[key] = e.nativeEvent.layout; setLayVer(v => v + 1); };

  const todayKey   = keyOf(today.getFullYear(), today.getMonth(), today.getDate());
  const viewingNow = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  // Today's cell rect, only while the current month is on screen
  const todayRect = useMemo(() => {
    if (!viewingNow || !lay.calWrap) return null;
    const idx = startCol + today.getDate() - 1;
    const ri = Math.floor(idx / 7), ci = idx % 7;
    const x = lay.calWrap.x + BORDER + ci * CELL_W + (ci > 0 ? BORDER : 0);
    const y = lay.calWrap.y + BORDER + HDR_H + BORDER + ri * (CELL_H + BORDER) + BORDER;
    return { x, y, ri, ci };
  }, [layVer, viewingNow, startCol]);

  const perches = useMemo(() => {
    const p = {};
    if (lay.stats) p.card = { x: lay.stats.x + lay.stats.width - 46, y: lay.stats.y + 3 };
    if (todayRect) p.today = { x: Math.min(todayRect.x + CELL_W + 20, width - 34), y: todayRect.y + CELL_H };
    return p;
  }, [layVer, todayRect]);

  // Entrance once the cards have faded in
  useEffect(() => {
    if (!perches.card) return;
    const t = setTimeout(() => {
      Promise.resolve(sqRef.current?.enter('card')).finally(() => { if (mounted.current) setSqReady(true); });
    }, 1100);
    return () => clearTimeout(t);
  }, [!!perches.card]);

  const playStamp = async (key) => {
    const sq = sqRef.current;
    if (!sq) return;
    stamping.current = true;
    stampV.setValue(0);
    ringV.setValue(0);
    setStampKey(key);
    const finish = () => {
      stamping.current = false;
      if (!mounted.current) return;
      setStampKey(null);
      clearStamp();
    };
    sq.touch('stamp');
    if (!(await sq.goTo('today', { ms: 220 }))) return finish();
    sq.setPose('acorn');
    await new Promise(res => Animated.parallel([
      Animated.timing(stampV, { toValue: 1, duration: 420, easing: Easing.bezier(0.3, 1.25, 0.5, 1), useNativeDriver: true }),
      Animated.timing(ringV,  { toValue: 1, duration: 650, delay: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(res));
    if (!mounted.current) return finish();
    await sq.celebrate(2, { confetti: true });
    await sq.goTo('card');
    finish();
  };

  // Look saved to today on Home/Match → play once when this tab is focused on the current month
  useEffect(() => {
    if (!pendingStamp || stamping.current) return;
    if (pendingStamp !== todayKey || !entries[pendingStamp]) { clearStamp(); return; }
    if (!isFocused || !sqReady || !viewingNow || !perches.today) return;
    const t = setTimeout(() => playStamp(pendingStamp), 450);   // let the tab / month slide settle
    return () => clearTimeout(t);
  }, [pendingStamp, isFocused, sqReady, viewingNow, !!perches.today]);

  const slideStyle = { opacity: monthOp, transform: [{ translateX: monthX }] };
  const cardStyle = (i) => ({
    opacity: cardsIn[i],
    transform: [{ translateY: cardsIn[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']} onTouchStart={() => sqRef.current?.touch('tap')}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        onScrollBeginDrag={() => sqRef.current?.touch('scroll')}
      >

        {/* ── Month name + nav ── */}
        <View style={styles.monthRow}>
          <View style={styles.monthSide}>
            <TouchableOpacity onPress={prevMonth} hitSlop={14} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={22} color={LABEL} />
            </TouchableOpacity>
          </View>
          <View style={styles.titleClip}>
            <Animated.View style={[{ alignItems: 'center' }, slideStyle, {
              transform: [
                { translateX: monthX },
                { translateY: titleRise.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
              ],
            }]}>
              <Text style={styles.monthName} numberOfLines={1} adjustsFontSizeToFit>{MONTH_NAMES[viewMonth]}</Text>
              {viewYear !== today.getFullYear() && (
                <Text style={styles.yearLabel}>{viewYear}</Text>
              )}
            </Animated.View>
          </View>
          <View style={[styles.monthSide, { alignItems: 'flex-end' }]}>
            <TouchableOpacity onPress={nextMonth} hitSlop={14} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={22} color={LABEL} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setJournalVisible(true)}
              hitSlop={12}
              style={styles.journalBtn}
            >
              <Ionicons name="book-outline" size={18} color={LABEL} />
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
        <View style={styles.calWrap} onLayout={onLay('calWrap')}>
          {/* Day headers */}
          <View style={styles.hdrRow}>
            {DAY_HDRS.map((d, i) => (
              <View key={i} style={[styles.hdrCell, i > 0 && styles.cellBorderLeft]}>
                <Text style={styles.hdrTxt}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Date rows */}
          <Animated.View style={slideStyle}>
            {rows.map((row, ri) => (
              <View key={ri} style={styles.dateRow}>
                {row.map((day, ci) => {
                  const idx   = ri * 7 + ci;
                  const key   = day ? dateKey(day) : null;
                  const entry = key ? (entries[key] ?? null) : null;
                  const tod   = day && isToday(day);
                  const on    = !!day && key === selKey;
                  const v     = cellsIn[idx];
                  return (
                    <Animated.View
                      key={ci}
                      style={[
                        styles.dateCell,
                        ci > 0 && styles.cellBorderLeft,
                        tod && styles.todayCell,
                        on && styles.selCell,
                        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
                      ]}
                    >
                      <Pressable
                        style={StyleSheet.absoluteFill}
                        disabled={!day}
                        onPress={() => setSel({ y: viewYear, m: viewMonth, d: day })}
                      >
                        {entry && key !== stampKey && <CellThumb entry={entry} />}
                        <Text style={[styles.dayNum, tod && styles.todayNum]}>
                          {day ?? ''}
                        </Text>
                      </Pressable>
                      {on && <SelRing key={selKey} />}
                    </Animated.View>
                  );
                })}
              </View>
            ))}
          </Animated.View>
        </View>

        {/* ── Stats card ── */}
        <Animated.View style={[styles.card, styles.statsCard, cardStyle(0)]} onLayout={onLay('stats')}>
          <Text style={styles.mono}>THIS MONTH</Text>
          <View style={styles.statsRow}>
            <FlipNumber value={monthLooks} flipKey={`${viewYear}-${viewMonth}-${monthLooks}`} />
            <Text style={styles.statsUnit}>looks</Text>
          </View>
        </Animated.View>

        {/* ── Selected day's diary ── */}
        <Animated.View style={[styles.card, cardStyle(1)]}>
          <Text style={styles.mono}>{selLabel}</Text>
          <Text style={styles.diaryTitle}>{selTitle}</Text>
          <SwapIn key={`${selKey}-${selEntry ? 'on' : 'off'}`}>
            {selEntry ? (
              <View style={styles.diaryBody}>
                <View style={styles.entryRow}>
                  <View style={styles.stage}>
                    <DiaryThumb entry={selEntry} w={STAGE} h={STAGE} pad={8} />
                  </View>
                  <View style={styles.pieces}>
                    {selPieces.map((p, i) => (
                      <Text key={i} style={styles.piece}>{p}</Text>
                    ))}
                  </View>
                </View>
                <TouchableOpacity onPress={confirmRemove} hitSlop={10} style={styles.removeBtn}>
                  <Text style={styles.removeTxt}>移除這天的穿搭</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.diaryBody, styles.empty]}>
                <Text style={styles.emptyTxt}>
                  {selIsToday ? '今天還沒有記錄穿搭' : '這天沒有記錄穿搭'}
                </Text>
                {selIsToday && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('HOME')}
                    activeOpacity={0.8}
                    style={styles.goBtn}
                  >
                    <Text style={styles.goTxt}>去首頁挑一套</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </SwapIn>
        </Animated.View>

        <View style={{ height: 36 }} />

        {stampKey && todayRect && entries[stampKey] && (
          <StampOverlay entry={entries[stampKey]} rect={todayRect} v={stampV} ring={ringV} />
        )}

        {/* Mascot — lives in the scroll content so it scrolls with the page; only its body takes taps */}
        <Squirrel ref={sqRef} perches={perches} paused={!isFocused} scale={0.7} quiet />
      </ScrollView>
    </SafeAreaView>
  );
}

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
  titleClip: { flex: 1, alignItems: 'center', overflow: 'hidden' },
  monthName: {
    fontFamily: SERIF, fontSize: 44, fontWeight: '700',
    color: DARK, letterSpacing: -0.5,
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
    backgroundColor: BG,
  },
  hdrRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: GRID,
  },
  hdrCell: {
    width: CELL_W, height: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  hdrTxt: {
    fontFamily: MONO, fontSize: 10, color: LABEL, letterSpacing: 0.3,
  },
  dateRow: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    borderTopColor: GRID,
  },
  dateCell: {
    width: CELL_W, height: CELL_H,
    overflow: 'hidden', position: 'relative',
  },
  cellBorderLeft: {
    borderLeftWidth: 1.5,
    borderLeftColor: GRID,
  },
  todayCell: { backgroundColor: TODAY_BG },
  selCell:   { backgroundColor: SEL_BG },
  selRing: {
    position: 'absolute', top: 1.5, left: 1.5, right: 1.5, bottom: 1.5,
    borderWidth: 1.5, borderColor: BROWN, borderRadius: 6,
  },
  dayNum:    { fontFamily: MONO, fontSize: 10.5, color: DARK, position: 'absolute', top: 4, left: 5 },
  todayNum:  { fontWeight: '700' },

  // Cards
  card: {
    backgroundColor: CARD, borderRadius: 22,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 22,
    shadowColor: '#46321A', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 14, elevation: 3,
  },
  mono: { fontFamily: MONO, fontSize: 10.5, color: LABEL, letterSpacing: 2 },

  // Stats card — extra top room for the squirrel sitting on its edge
  statsCard: { marginTop: 22 },
  statsRow:  { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10 },
  statsNum:  { fontFamily: SERIF, fontSize: 50, fontWeight: '700', color: DARK, lineHeight: 56 },
  statsUnit: { fontFamily: SERIF, fontSize: 24, color: DARK },

  // Diary card
  diaryTitle:{ fontFamily: SERIF, fontSize: 25, fontWeight: '700', color: DARK, marginTop: 8 },
  diaryBody: { marginTop: 14 },
  entryRow:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stage: {
    width: STAGE, height: STAGE, borderRadius: 16,
    backgroundColor: BG, overflow: 'hidden',
  },
  pieces:    { flex: 1, gap: 4 },
  piece:     { fontFamily: SERIF, fontSize: 17, color: DARK },
  removeBtn: { alignSelf: 'flex-start', marginTop: 14, paddingVertical: 2 },
  removeTxt: { fontSize: 12, color: MUTED, textDecorationLine: 'underline' },
  empty: {
    borderWidth: 1.5, borderColor: DASH, borderStyle: 'dashed',
    borderRadius: 16, paddingVertical: 20, paddingHorizontal: 14, alignItems: 'center',
  },
  emptyTxt:  { fontSize: 13, color: LABEL, lineHeight: 22 },
  goBtn: {
    marginTop: 12, height: 40, paddingHorizontal: 20, borderRadius: 99,
    backgroundColor: DARK, justifyContent: 'center', alignItems: 'center',
  },
  goTxt:     { color: '#FFFFFF', fontSize: 13.5, fontWeight: '600' },

  // Stamp moment
  stampBox:  { position: 'absolute', width: CELL_W, height: CELL_H, zIndex: 10, elevation: 10 },
  stampRing: {
    position: 'absolute', left: (CELL_W - CELL_W * 1.1) / 2, top: (CELL_H - CELL_W * 1.1) / 2,
    width: CELL_W * 1.1, height: CELL_W * 1.1, borderRadius: CELL_W * 0.55,
    borderWidth: 2, borderColor: BROWN,
  },
});
