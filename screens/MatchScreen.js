import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, Platform, PanResponder, Animated, Alert,
  Modal, TouchableWithoutFeedback, Pressable, Easing, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { useWardrobe } from '../context/WardrobeContext';
import { useCollection } from '../context/CollectionContext';
import { useCalendar } from '../context/CalendarContext';
import { saveToDayLabel } from '../utils/calendarLabels';

const BEIGE  = '#F2EDE8';
const DARK   = '#1A1108';
const MUTED  = '#9E8C7A';
const SERIF  = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO   = 'JetBrainsMono_400Regular';
const LIKED_RED = '#E0524A';
const { width } = Dimensions.get('window');
const { height: SCREEN_H } = Dimensions.get('window');

const CANVAS_W = width - 32;
const CANVAS_H = SCREEN_H * 0.37;
const THUMB_W  = (width - 48) / 3;

const SHAKE_THRESHOLD = 2.6;
const SHAKE_COOLDOWN  = 1500;

// Category display sizes — w×h box the image sits inside
const ITEM_SIZES = {
  tshirts: { w: 90,  h: 82  },
  jackets: { w: 96,  h: 84  },
  skirts:  { w: 88,  h: 88  },
  pants:   { w: 78,  h: 110 },
  dresses: { w: 84,  h: 118 },
};
const DEFAULT_SZ = { w: 82, h: 82 };

// ── Layout constants ───────────────────────────────────────────
// Safe zone: top 18% reserved for date label, bottom 12% for star button.
// Left column (top + bottom) is centered at 30% of canvas width.
// Right column (jacket) is centered at 68% of canvas width.
const SAFE_TOP_FRAC    = 0.18;
const SAFE_BOTTOM_FRAC = 0.88;
const LEFT_COL_CX_FRAC = 0.30;
const RIGHT_COL_CX_FRAC = 0.68;
const VGAP = 10;

const safeZone = () => ({
  top:     CANVAS_H * SAFE_TOP_FRAC,
  bottom:  CANVAS_H * SAFE_BOTTOM_FRAC,
  usableH: CANVAS_H * (SAFE_BOTTOM_FRAC - SAFE_TOP_FRAC),
});

// ── Smart initial positions based on category ──────────────────
const smartPos = (categoryId, existingItems) => {
  const sz  = ITEM_SIZES[categoryId] ?? DEFAULT_SZ;
  const { top: safeTop, usableH } = safeZone();

  // Column center → item top-left
  const leftCX  = CANVAS_W * LEFT_COL_CX_FRAC;
  const rightCX = CANVAS_W * RIGHT_COL_CX_FRAC;

  // Estimate total left-column height for vertical centering
  const tSz         = ITEM_SIZES.tshirts;
  const existingTop = existingItems.find(i => i.categoryId === 'tshirts');
  const existingBot = existingItems.find(i => ['pants','skirts'].includes(i.categoryId));
  const willHaveTop = existingTop != null || categoryId === 'tshirts';
  const willHaveBot = existingBot != null || ['pants','skirts'].includes(categoryId);
  const botH        = existingBot
    ? (ITEM_SIZES[existingBot.categoryId]?.h ?? sz.h)
    : (['pants','skirts'].includes(categoryId) ? sz.h : ITEM_SIZES.skirts.h);

  const leftColH = (willHaveTop && willHaveBot)
    ? tSz.h + VGAP + botH
    : tSz.h;

  // Vertically center the left column inside safe zone
  const startY = Math.round(safeTop + Math.max(0, (usableH - leftColH) / 2));

  const sameCount = existingItems.filter(ci => ci.categoryId === categoryId).length;
  const stagger   = sameCount * 18;

  const clamp = (x, y) => ({
    x: Math.max(4, Math.min(x, CANVAS_W - sz.w - 4)),
    y: Math.max(safeTop, Math.min(y, CANVAS_H * SAFE_BOTTOM_FRAC - sz.h - 4)),
  });

  switch (categoryId) {
    case 'tshirts':
      return clamp(
        Math.round(leftCX - sz.w / 2) + stagger,
        startY + stagger,
      );

    case 'pants':
    case 'skirts': {
      const refY = existingTop != null
        ? existingTop.initY + tSz.h + VGAP
        : startY + tSz.h + VGAP;
      return clamp(Math.round(leftCX - sz.w / 2) + stagger, refY + stagger);
    }

    case 'jackets': {
      const jSz = ITEM_SIZES.jackets;
      const { usableH: uH, top: sT } = safeZone();
      const jY  = Math.round(sT + Math.max(0, (uH - jSz.h) / 2));
      return clamp(Math.round(rightCX - jSz.w / 2) + stagger, jY + stagger);
    }

    case 'dresses': {
      const dSz = ITEM_SIZES.dresses;
      const dY  = Math.round(safeTop + Math.max(0, (usableH - dSz.h) / 2));
      return clamp(Math.round((CANVAS_W - dSz.w) / 2) + stagger, dY + stagger);
    }

    default:
      return clamp(Math.round(leftCX - sz.w / 2) + stagger, startY + stagger);
  }
};

// ── Outfit layout for shake-to-match ──────────────────────────
const layoutOutfit = (outfitItems, canvasStateRef, ts) => {
  const tops    = outfitItems.filter(i => i.categoryId === 'tshirts');
  const bottoms = outfitItems.filter(i => ['pants','skirts'].includes(i.categoryId));
  const jackets = outfitItems.filter(i => i.categoryId === 'jackets');
  const dresses = outfitItems.filter(i => i.categoryId === 'dresses');

  const { top: safeTop, usableH } = safeZone();
  const leftCX  = CANVAS_W * LEFT_COL_CX_FRAC;
  const rightCX = CANVAS_W * RIGHT_COL_CX_FRAC;

  const placements = [];

  if (dresses.length > 0) {
    const dSz = ITEM_SIZES.dresses;
    const dY  = Math.round(safeTop + Math.max(0, (usableH - dSz.h) / 2));
    placements.push({ item: dresses[0], x: Math.round((CANVAS_W - dSz.w) / 2), y: dY, sz: dSz });
    jackets.forEach((j, i) => {
      const jSz = ITEM_SIZES.jackets;
      const jY  = Math.round(safeTop + Math.max(0, (usableH - jSz.h) / 2));
      placements.push({ item: j, x: Math.round(rightCX - jSz.w / 2) + i * 18, y: jY, sz: jSz });
    });

  } else if (tops.length > 0) {
    const tSz = ITEM_SIZES.tshirts;
    const bSz = bottoms.length > 0 ? (ITEM_SIZES[bottoms[0].categoryId] ?? DEFAULT_SZ) : null;

    // Vertical centering based on full left-column height
    const leftColH = bSz ? tSz.h + VGAP + bSz.h : tSz.h;
    const startY   = Math.round(safeTop + Math.max(0, (usableH - leftColH) / 2));
    const leftX    = Math.round(leftCX - tSz.w / 2);

    placements.push({ item: tops[0], x: leftX, y: startY, sz: tSz });

    if (bSz) {
      placements.push({
        item: bottoms[0],
        x: Math.round(leftCX - bSz.w / 2),
        y: startY + tSz.h + VGAP,
        sz: bSz,
      });
    }

    jackets.forEach((j, i) => {
      const jSz = ITEM_SIZES.jackets;
      const jY  = Math.round(safeTop + Math.max(0, (usableH - jSz.h) / 2));
      placements.push({ item: j, x: Math.round(rightCX - jSz.w / 2) + i * 18, y: jY, sz: jSz });
    });
  }

  return placements.map(({ item, x, y, sz }, i) => {
    const id = `shake_${item.id}_${ts}_${i}`;
    canvasStateRef[id] = { panX: 0, panY: 0, scale: 1 };
    return { ...item, id, initX: x, initY: y, sz };
  });
};

const CATEGORIES = [
  { name: 'T-shirts', id: 'tshirts' },
  { name: 'Jackets',  id: 'jackets' },
  { name: 'Skirts',   id: 'skirts'  },
  { name: 'Pants',    id: 'pants'   },
  { name: 'Dresses',  id: 'dresses' },
];

const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
    arr.slice(i * n, i * n + n)
  );

const WEEKDAYS_SHORT = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const MONTHS_FULL = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN',
  'JUL','AUG','SEP','OCT','NOV','DEC'];
const DAY_COL = ['S','M','T','W','T','F','S'];

const toDateStr = (y, m, d) =>
  `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

function DatePickerModal({ visible, onClose, onSave, entries, canvasEmpty }) {
  const now = new Date();
  const [year, setYear]     = useState(now.getFullYear());
  const [month, setMonth]   = useState(now.getMonth());
  const [selDay, setSelDay] = useState(now.getDate());

  // Default to today every time the picker opens
  useEffect(() => {
    if (!visible) return;
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setSelDay(t.getDate());
  }, [visible]);

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null),
                 ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const prevMonth = () => { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); setSelDay(null); };
  const nextMonth = () => { if (month === 11) { setYear(y => y+1); setMonth(0); } else setMonth(m => m+1); setSelDay(null); };
  const isToday   = (d) => d === now.getDate() && month === now.getMonth() && year === now.getFullYear();

  const selStr   = selDay ? toDateStr(year, month, selDay) : null;
  const hasEntry = !!(selStr && entries?.[selStr]);
  const disabled = !selDay || canvasEmpty;
  const btnLabel = canvasEmpty ? '先在畫布加入衣服'
                 : selDay      ? saveToDayLabel(year, month, selDay, hasEntry)
                 :               '儲存到這天';

  const handleSave = () => {
    if (disabled) return;
    onSave(selStr);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={dp.overlay}>
          <TouchableWithoutFeedback>
            <View style={dp.sheet}>
              <View style={dp.navRow}>
                <TouchableOpacity onPress={prevMonth} hitSlop={12}>
                  <Ionicons name="chevron-back" size={20} color={DARK} />
                </TouchableOpacity>
                <Text style={dp.monthTxt}>{MONTHS_FULL[month]} {year}</Text>
                <TouchableOpacity onPress={nextMonth} hitSlop={12}>
                  <Ionicons name="chevron-forward" size={20} color={DARK} />
                </TouchableOpacity>
              </View>
              <View style={dp.hdrRow}>
                {DAY_COL.map((d, i) => <Text key={i} style={dp.hdrTxt}>{d}</Text>)}
              </View>
              <View style={dp.grid}>
                {cells.map((day, i) => {
                  const sel = day && day === selDay;
                  const tod = day && isToday(day);
                  return (
                    <TouchableOpacity key={i} style={[dp.cell, sel && dp.cellSel, tod && !sel && dp.cellToday]}
                      onPress={() => day && setSelDay(day)} disabled={!day}>
                      <Text style={[dp.cellTxt, sel && dp.cellTxtSel, tod && !sel && dp.cellTxtToday]}>
                        {day ?? ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity style={[dp.saveBtn, disabled && { opacity: 0.35 }]}
                onPress={handleSave} disabled={disabled}>
                <Text style={dp.saveTxt}>{btnLabel}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const dp = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: '#F5EFE6', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  navRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  monthTxt: { fontFamily: SERIF, fontSize: 18, fontWeight: '700', color: DARK },
  hdrRow:   { flexDirection: 'row', marginBottom: 6 },
  hdrTxt:   { flex: 1, textAlign: 'center', fontFamily: MONO, fontSize: 10, color: MUTED },
  grid:     { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  cell:     { width: `${100/7}%`, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginBottom: 2 },
  cellSel:  { backgroundColor: DARK },
  cellToday:{ borderWidth: 1.5, borderColor: DARK },
  cellTxt:  { fontFamily: MONO, fontSize: 13, color: DARK },
  cellTxtSel:   { color: '#F5EFE6' },
  cellTxtToday: { fontWeight: '700' },
  saveBtn:  { backgroundColor: DARK, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveTxt:  { color: '#F5EFE6', fontSize: 15, fontWeight: '700' },
});

// ── Motion ─────────────────────────────────────────────────────
// Built-in Animated, native driver, opacity/transform only. Nothing here waits or gates input.
const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);
const SPRING   = Easing.bezier(0.2, 1.4, 0.35, 1);
const SOFT     = Easing.bezier(0.2, 0.7, 0.3, 1);
const BURST_COLORS = ['#C96A6C', '#E6B4B5', '#F2E4BC', '#C9A46A'];

const tween = (v, toValue, duration, opts = {}) =>
  Animated.timing(v, { toValue, duration, easing: EASE_OUT, useNativeDriver: true, ...opts });
// Replay a 0→1 keyframe driver from the start
const play = (v, duration, opts) => { v.setValue(0); tween(v, 1, duration, opts).start(); };
const kf   = (v, inputRange, outputRange) => v.interpolate({ inputRange, outputRange });
const rand = (a, b) => a + Math.random() * (b - a);
const riseStyle = (v) => ({ opacity: v, transform: [{ translateY: kf(v, [0, 1], [18, 0]) }] });

// How a piece lands on the canvas: 'drop' from above (dice), 'add' up from the grid (tap)
const arriveStyle = (v, kind) => kind === 'drop' ? {
  opacity: kf(v, [0, 0.7, 1], [0, 1, 1]),
  transform: [
    { translateY: kf(v, [0, 0.7, 1], [-34, 4, 0]) },
    { scaleX: kf(v, [0, 0.7, 1], [0.9, 1.04, 1]) },
    { scaleY: kf(v, [0, 0.7, 1], [0.9, 0.96, 1]) },
  ],
} : kind === 'add' ? {
  opacity: kf(v, [0, 0.25, 1], [0, 1, 1]),
  transform: [
    { translateY: kf(v, [0, 0.5, 0.84, 1], [70, -24, 3, 0]) },
    { rotate: kf(v, [0, 0.5, 0.84, 1], ['0deg', '-5deg', '0deg', '0deg']) },
    { scaleX: kf(v, [0, 0.5, 0.84, 1], [0.6, 0.9, 1.05, 1]) },
    { scaleY: kf(v, [0, 0.5, 0.84, 1], [0.6, 0.9, 0.95, 1]) },
  ],
} : null;

// Shrinks while pressed, like the prototype's :active
function PressScale({ to, style, onPress, hitSlop, children }) {
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      style={style}
      onPress={onPress}
      hitSlop={hitSlop}
      onPressIn={() => tween(s, to, 120).start()}
      onPressOut={() => tween(s, 1, 200).start()}
    >
      <Animated.View style={{ transform: [{ scale: s }] }}>{children}</Animated.View>
    </Pressable>
  );
}

const ItemImage = ({ uri, sz }) => (
  <View style={{ width: sz.w, height: sz.h }}>
    {uri && <Image source={{ uri }} style={{ width: sz.w, height: sz.h }} resizeMode="contain" />}
  </View>
);

// A piece that just left the canvas: falls and fades, then unmounts. Never takes touches.
function GhostItem({ g, onDone }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(v, {
      toValue: 1, duration: 300, delay: g.delay, easing: Easing.in(Easing.ease), useNativeDriver: true,
    });
    a.start(({ finished }) => finished && onDone(g.key));
    return () => a.stop();
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.canvasItem, {
        left: g.x, top: g.y,
        opacity: kf(v, [0, 1], [1, 0]),
        transform: [
          { translateX: kf(v, [0, 1], [g.panX, g.panX + g.dx]) },
          { translateY: kf(v, [0, 1], [g.panY, g.panY + 40]) },
          { rotate: kf(v, [0, 1], ['0deg', `${g.rot}deg`]) },
          { scale: kf(v, [0, 1], [g.scale, g.scale * 0.7]) },
        ],
      }]}
    >
      <ItemImage uri={g.uri} sz={g.sz} />
    </Animated.View>
  );
}

// Copy of the look that shrinks into the calendar icon after saving to the diary
function FlyToCalendar({ fly, onDone }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Short delay lets the date sheet slide away first
    const a = tween(v, 1, 820, { delay: 280 });
    a.start(({ finished }) => finished && onDone());
    return () => a.stop();
  }, []);
  const { box, dx, dy, sc } = fly;
  const at = [0, 0.45, 0.92, 1];
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h,
        opacity: kf(v, at, [1, 1, 1, 0]),
        transform: [
          { translateX: kf(v, at, [0, dx / 2, dx, dx]) },
          { translateY: kf(v, at, [0, dy / 2 - 30, dy, dy]) },
          { rotate: kf(v, at, ['0deg', '-6deg', '4deg', '4deg']) },
          { scale: kf(v, at, [1, 0.45, sc, sc * 0.6]) },
        ],
      }}
    >
      {fly.items.map((it, i) => (
        <View key={i} style={[styles.canvasItem, {
          left: it.x, top: it.y,
          transform: [{ translateX: it.panX }, { translateY: it.panY }, { scale: it.scale }],
        }]}>
          <ItemImage uri={it.uri} sz={it.sz} />
        </View>
      ))}
    </Animated.View>
  );
}

// Little confetti ring around the heart when a look is saved
function HeartBurst({ onDone }) {
  const v = useRef(new Animated.Value(0)).current;
  const dirs = useRef(Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2, d = rand(22, 32);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d };
  })).current;
  useEffect(() => {
    const a = tween(v, 1, 560, { easing: Easing.bezier(0.1, 0.7, 0.3, 1) });
    a.start(({ finished }) => finished && onDone());
    return () => a.stop();
  }, []);
  return dirs.map((d, i) => (
    <Animated.View
      key={i}
      pointerEvents="none"
      style={[styles.burstDot, {
        backgroundColor: BURST_COLORS[i % BURST_COLORS.length],
        opacity: kf(v, [0, 1], [1, 0]),
        transform: [
          { translateX: kf(v, [0, 1], [0, d.x]) },
          { translateY: kf(v, [0, 1], [0, d.y]) },
          { scale: kf(v, [0, 1], [1, 0.3]) },
        ],
      }]}
    />
  ));
}

function EmptyHint() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = tween(v, 1, 300, { delay: 150 });
    a.start();
    return () => a.stop();
  }, []);
  return (
    <Animated.View style={[styles.emptyCanvas, { opacity: v }]} pointerEvents="none">
      <Text style={styles.emptyCanvasText}>點選下方衣物加入搭配</Text>
      <Text style={styles.emptyCanvasSub}>搖晃手機或點骰子隨機穿搭</Text>
    </Animated.View>
  );
}

// Grid thumb: rises in (staggered) when the grid appears, shrinks while pressed
function Tile({ item, index, onPress }) {
  const v     = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const anim  = useRef({
    opacity: v,
    transform: [
      { translateY: kf(v, [0, 1], [14, 0]) },
      { scale: Animated.multiply(press, kf(v, [0, 1], [0.92, 1])) },
    ],
  }).current;
  useEffect(() => {
    const a = tween(v, 1, 450, { delay: Math.min(index, 8) * 45, easing: SPRING });
    a.start();
    return () => a.stop();
  }, []);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => tween(press, 0.94, 120).start()}
      onPressOut={() => tween(press, 1, 200).start()}
    >
      <Animated.View style={[styles.thumbCell, anim]}>
        <Image source={{ uri: item.uri }} style={styles.thumbImage} resizeMode="contain" />
      </Animated.View>
    </Pressable>
  );
}

// ── Draggable item ─────────────────────────────────────────────
function DraggableItem({ item, onRemove, onRelease }) {
  const sz         = item.sz ?? DEFAULT_SZ;
  const pan        = useRef(new Animated.ValueXY()).current;
  const scale      = useRef(new Animated.Value(1)).current;
  const lastScale  = useRef(1);
  const lastDist   = useRef(null);
  const releaseRef = useRef(onRelease);
  releaseRef.current = onRelease;

  const pinchDist = (touches) => {
    const dx = touches[1].pageX - touches[0].pageX;
    const dy = touches[1].pageY - touches[0].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        pan.setOffset({ x: pan.x._value, y: pan.y._value });
        pan.setValue({ x: 0, y: 0 });
        lastDist.current = null;
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          const d = pinchDist(touches);
          if (lastDist.current != null) {
            const next = Math.max(0.3, Math.min(4, lastScale.current * (d / lastDist.current)));
            lastScale.current = next;
            scale.setValue(next);
          }
          lastDist.current = d;
        } else {
          lastDist.current = null;
          pan.x.setValue(gestureState.dx);
          pan.y.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: () => {
        pan.flattenOffset();
        lastDist.current = null;
        releaseRef.current?.({ panX: pan.x._value, panY: pan.y._value, scale: lastScale.current });
      },
    })
  ).current;

  // Arrival motion lives on an inner layer so the drag/pinch transforms stay untouched
  const appear = useRef(new Animated.Value(item.enter ? 0 : 1)).current;
  const arrive = useRef(arriveStyle(appear, item.enter)).current;
  useEffect(() => {
    if (!item.enter) return;
    const a = Animated.timing(appear, {
      toValue: 1, duration: item.enter === 'drop' ? 460 : 560,
      delay: item.enterDelay ?? 0, easing: SOFT, useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.canvasItem,
        { left: item.initX, top: item.initY },
        { transform: [...pan.getTranslateTransform(), { scale }] },
      ]}
      {...panResponder.panHandlers}
    >
      <Animated.View style={arrive}>
        <TouchableOpacity style={styles.removeBtn} onPress={onRemove} hitSlop={8}>
          <Ionicons name="close-circle" size={20} color="#AAAAAA" />
        </TouchableOpacity>
        <ItemImage uri={item.uri} sz={sz} />
      </Animated.View>
    </Animated.View>
  );
}

// ── Main screen ────────────────────────────────────────────────
export default function MatchScreen() {
  const [category, setCategory]       = useState('tshirts');
  const [canvasItems, setCanvasItems] = useState([]);
  const counter      = useRef(0);
  const canvasState  = useRef({});
  const lastOutfit   = useRef([]);
  const isShaking    = useRef(false);
  const canvasItemsRef = useRef(canvasItems);
  canvasItemsRef.current = canvasItems;

  // ── Motion state ──
  const enterV    = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;  // header, canvas, tabs
  const bob       = useRef(new Animated.Value(0)).current;
  const diceSpin  = useRef(new Animated.Value(0)).current;
  const clearSpin = useRef(new Animated.Value(0)).current;
  const calBump   = useRef(new Animated.Value(0)).current;
  const heartPop  = useRef(new Animated.Value(1)).current;
  const heartNo   = useRef(new Animated.Value(1)).current;
  const indX      = useRef(new Animated.Value(0)).current;
  const indW      = useRef(new Animated.Value(1)).current;
  const tabLay    = useRef({}).current;
  const [indOn, setIndOn]       = useState(false);
  const [enterKey, setEnterKey] = useState(0);
  const [ghosts, setGhosts]     = useState([]);
  const [burstKey, setBurstKey] = useState(0);
  const [fly, setFly]           = useState(null);
  const ghostSeq    = useRef(0);
  const flyLayerRef = useRef(null);
  const canvasRef   = useRef(null);
  const calIconRef  = useRef(null);

  // Page entrance each time the tab comes into focus
  useFocusEffect(
    useCallback(() => {
      setEnterKey(k => k + 1);
      enterV.forEach(v => v.setValue(0));
      const a = Animated.sequence([
        Animated.delay(60),
        Animated.stagger(70, enterV.map(v => tween(v, 1, 700))),
      ]);
      a.start();
      return () => a.stop();
    }, [])
  );

  const bobCanvas = () => Animated.sequence([
    tween(bob, -3, 55), tween(bob, 0, 55), tween(bob, -3, 55), tween(bob, 0, 55),
  ]).start();

  // Where a canvas piece currently sits (incl. drag/pinch), for ghosts and the calendar flight
  const placed = (ci) => {
    const s = canvasState.current[ci.id] ?? { panX: 0, panY: 0, scale: 1 };
    return { uri: ci.uri, sz: ci.sz ?? DEFAULT_SZ, x: ci.initX, y: ci.initY, panX: s.panX, panY: s.panY, scale: s.scale };
  };

  const dropOut = (list) => {
    if (!list.length) return;
    const gs = list.map((ci, i) => ({
      ...placed(ci), key: `ghost_${++ghostSeq.current}`,
      dx: rand(-20, 20), rot: rand(-14, 14), delay: i * 50,
    }));
    setGhosts(prev => [...prev, ...gs]);
  };
  const removeGhost = (key) => setGhosts(prev => prev.filter(g => g.key !== key));

  const measure = (r) => new Promise(res =>
    r.current ? r.current.measureInWindow((x, y, w, h) => res({ x, y, w, h })) : res(null));

  const flyToCalendar = async (list) => {
    const [lo, cr, ir] = await Promise.all([measure(flyLayerRef), measure(canvasRef), measure(calIconRef)]);
    if (!lo || !cr || !ir || !cr.w) { play(calBump, 520); return; }
    setFly({
      key: Date.now(), items: list,
      box: { x: cr.x - lo.x, y: cr.y - lo.y, w: cr.w, h: cr.h },
      dx: ir.x + ir.w / 2 - (cr.x + cr.w / 2),
      dy: ir.y + ir.h / 2 - (cr.y + cr.h / 2),
      sc: 34 / cr.w,
    });
  };

  // Tab underline glides to the selected tab
  const moveInd = (id, animate) => {
    const l = tabLay[id];
    if (!l) return;
    const w = l.width - 20;               // tabBtn has 10px side padding
    const x = l.x + 10 + w / 2 - 0.5;     // 1px bar scales around its centre
    if (animate) {
      Animated.parallel([tween(indX, x, 350), tween(indW, w, 350)]).start();
    } else {
      indX.setValue(x); indW.setValue(w); setIndOn(true);
    }
  };
  useEffect(() => { moveInd(category, true); }, [category]);

  const { items } = useWardrobe();
  const { addLook, categories, addCategory } = useCollection();
  const [newCatName, setNewCatName] = useState('');
  const { entries, saveEntry } = useCalendar();
  const [calPickerVisible, setCalPickerVisible] = useState(false);
  const [catSheetVisible, setCatSheetVisible]   = useState(false);
  const [liked, setLiked] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Any change to what's on the canvas makes it a new, unsaved look
  useEffect(() => { setLiked(false); }, [canvasItems]);
  const currentItems = items[category] ?? [];

  const now = new Date();
  const moodDateStr = `${WEEKDAYS_SHORT[now.getDay()]} · ${MONTHS_SHORT[now.getMonth()]} ${now.getDate()}`;

  // ── Random outfit generator ───────────────────────────────
  const generateRandomOutfit = () => {
    const tshirts = items.tshirts ?? [];
    const pants   = items.pants   ?? [];
    const skirts  = items.skirts  ?? [];
    const dresses = items.dresses ?? [];
    const jackets = items.jackets ?? [];

    const pick = (arr) => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
    const allBottoms = [
      ...pants.map(i  => ({ ...i, categoryId: 'pants'  })),
      ...skirts.map(i => ({ ...i, categoryId: 'skirts' })),
    ];

    const hasSufficientClothes =
      (tshirts.length > 0 && allBottoms.length > 0) || dresses.length > 0;
    if (!hasSufficientClothes) return [];

    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = [];
      const useDress  = dresses.length > 0 &&
        (tshirts.length === 0 || allBottoms.length === 0 || Math.random() < 0.25);

      if (useDress) {
        const d = pick(dresses);
        if (d) candidate.push({ ...d, categoryId: 'dresses' });
      } else {
        const top    = pick(tshirts);
        const bottom = pick(allBottoms);
        if (top)    candidate.push({ ...top, categoryId: 'tshirts' });
        if (bottom) candidate.push({ ...bottom });
        if (jackets.length > 0 && Math.random() < 0.28) {
          const j = pick(jackets);
          if (j) candidate.push({ ...j, categoryId: 'jackets' });
        }
      }

      if (candidate.length === 0) continue;
      const candIds = candidate.map(i => i.id).sort().join(',');
      const lastIds = lastOutfit.current.slice().sort().join(',');
      if (candIds !== lastIds || attempt >= 4) {
        lastOutfit.current = candidate.map(i => i.id);
        return candidate;
      }
    }
    return [];
  };

  // ── Shake to match ────────────────────────────────────────
  const shakeToMatch = useCallback(() => {
    if (isShaking.current) return;
    isShaking.current = true;
    setTimeout(() => { isShaking.current = false; }, SHAKE_COOLDOWN);

    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    play(diceSpin, 700);

    const newOutfit = generateRandomOutfit();
    if (newOutfit.length === 0) {
      Alert.alert('衣櫥太空了', '先到 Closet 新增衣服，才能搖出搭配');
      return;
    }

    // Old look falls away while the new one drops in — done in ~0.75s
    bobCanvas();
    dropOut(canvasItemsRef.current);

    // Clear canvas state and compute smart layout
    Object.keys(canvasState.current).forEach(k => delete canvasState.current[k]);
    const ts   = Date.now();
    const laid = layoutOutfit(newOutfit, canvasState.current, ts)
      .map((it, i) => ({ ...it, enter: 'drop', enterDelay: 120 + i * 70 }));
    counter.current = laid.length;
    setCanvasItems(laid);
  }, [items]);

  // ── Accelerometer ─────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let sub = null;
      try {
        Accelerometer.setUpdateInterval(100);
        sub = Accelerometer.addListener(({ x, y, z }) => {
          if (Math.sqrt(x*x + y*y + z*z) > SHAKE_THRESHOLD) shakeToMatch();
        });
      } catch {}
      return () => { try { sub?.remove(); } catch {} };
    }, [shakeToMatch])
  );

  // ── Canvas helpers ────────────────────────────────────────
  const saveToCalendar = (dateStr) => {
    if (canvasItems.length === 0) return;
    const snapshot = canvasItems.map(ci => {
      const s = canvasState.current[ci.id] ?? { panX: 0, panY: 0, scale: 1 };
      return { id: ci.id, uri: ci.uri, label: ci.label, x: ci.initX + s.panX, y: ci.initY + s.panY, scale: s.scale };
    });
    saveEntry(dateStr, { items: snapshot, canvasW: CANVAS_W, canvasH: CANVAS_H });
    flyToCalendar(canvasItems.map(placed));
    const t = new Date();
    const [, m, d] = dateStr.split('-').map(Number);
    showToast(dateStr === toDateStr(t.getFullYear(), t.getMonth(), t.getDate())
      ? '已存到今天的日記'
      : `已存到 ${m}/${d} 的日記`);
  };

  const addToCanvas = (item, categoryId) => {
    counter.current += 1;
    const id = `${item.id}_${counter.current}`;
    const sz = ITEM_SIZES[categoryId] ?? DEFAULT_SZ;
    canvasState.current[id] = { panX: 0, panY: 0, scale: 1 };
    setCanvasItems(prev => {
      const pos = smartPos(categoryId, prev);
      return [...prev, { ...item, id, categoryId, sz, initX: pos.x, initY: pos.y, enter: 'add' }];
    });
  };

  const removeFromCanvas = (id) => {
    dropOut(canvasItems.filter(i => i.id === id));
    delete canvasState.current[id];
    setCanvasItems(prev => prev.filter(i => i.id !== id));
  };

  const clearCanvas = () => {
    play(clearSpin, 520);
    dropOut(canvasItems);
    counter.current = 0;
    canvasState.current = {};
    setCanvasItems([]);
  };

  const saveLook = () => {
    if (canvasItems.length === 0) {
      play(heartNo, 400, { easing: Easing.inOut(Easing.ease) });
      showToast('先在畫布加入衣服');
      return;
    }
    setCatSheetVisible(true);
  };

  const saveLookToCategory = (cat) => {
    const snapshot = canvasItems.map(ci => {
      const s = canvasState.current[ci.id] ?? { panX: 0, panY: 0, scale: 1 };
      return { id: ci.id, uri: ci.uri, label: ci.label, x: ci.initX + s.panX, y: ci.initY + s.panY, scale: s.scale };
    });
    addLook(cat.id, {
      id: `look_${Date.now()}`,
      label: null,
      savedAt: Date.now(),
      canvasW: CANVAS_W,
      canvasH: CANVAS_H,
      items: snapshot,
      favorite: false,
    });
    setCatSheetVisible(false);
    setNewCatName('');
    setLiked(true);
    play(heartPop, 500);
    setBurstKey(k => k + 1);
    showToast(`已收藏到 ${cat.name}`);
  };

  // "+ 新增類別" in the sheet: create (or reuse a same-named one) and save straight into it
  const addCatAndSave = () => {
    const name = newCatName.trim();
    if (!name) return;
    const cat = categories.find(c => c.name.toLowerCase() === name.toLowerCase()) ?? addCategory(name);
    if (cat) saveLookToCategory(cat);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header ── */}
      <Animated.View style={[styles.header, riseStyle(enterV[0])]}>
        <View style={{ width: 80 }} />
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Match</Text>
        </View>
        <View style={styles.headerRight}>
          <PressScale to={0.82} onPress={shakeToMatch} hitSlop={8}>
            <Animated.View style={{ transform: [
              { rotate: kf(diceSpin, [0, 0.5, 1], ['0deg', '200deg', '360deg']) },
              { scale: kf(diceSpin, [0, 0.5, 1], [1, 1.2, 1]) },
            ] }}>
              <Ionicons name="dice-outline" size={22} color={DARK} />
            </Animated.View>
          </PressScale>
          <PressScale to={0.82} onPress={() => setCalPickerVisible(true)} hitSlop={8}>
            <Animated.View ref={calIconRef} collapsable={false} style={{ transform: [
              { scale: kf(calBump, [0, 0.4, 0.7, 1], [1, 1.35, 0.92, 1]) },
              { rotate: kf(calBump, [0, 0.4, 0.7, 1], ['0deg', '-8deg', '0deg', '0deg']) },
            ] }}>
              <Ionicons name="calendar-outline" size={20} color={DARK} />
            </Animated.View>
          </PressScale>
          <PressScale to={0.82} onPress={clearCanvas} hitSlop={8}>
            <Animated.View style={{ transform: [
              { rotate: kf(clearSpin, [0, 1], ['0deg', '-360deg']) },
            ] }}>
              <Ionicons name="refresh-outline" size={22} color={DARK} />
            </Animated.View>
          </PressScale>
        </View>
      </Animated.View>

      {/* ── Moodboard ── */}
      <Animated.View
        ref={canvasRef}
        style={[styles.canvas, {
          opacity: enterV[1],
          transform: [{ translateY: bob }, { scale: kf(enterV[1], [0, 1], [0.96, 1]) }],
        }]}
      >
        <Text style={styles.moodLabel}>{moodDateStr}</Text>
        {canvasItems.map(item => (
          <DraggableItem
            key={item.id}
            item={item}
            onRemove={() => removeFromCanvas(item.id)}
            onRelease={(s) => { canvasState.current[item.id] = s; }}
          />
        ))}
        {ghosts.map(g => <GhostItem key={g.key} g={g} onDone={removeGhost} />)}
        {canvasItems.length === 0 && <EmptyHint />}
        <PressScale to={0.85} style={styles.heartWrap} onPress={saveLook}>
          <Animated.View style={[styles.starBtn, { transform: [
            { translateX: kf(heartNo, [0, 0.2, 0.4, 0.6, 0.8, 1], [0, -5, 5, -5, 5, 0]) },
            { scale: kf(heartPop, [0, 0.6, 1], [0.6, 1.18, 1]) },
          ] }]}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? LIKED_RED : '#A99A8A'} />
          </Animated.View>
        </PressScale>
        {burstKey > 0 && <HeartBurst key={burstKey} onDone={() => setBurstKey(0)} />}
      </Animated.View>

      {/* ── Category tabs ── */}
      <Animated.View style={[styles.tabsContainer, riseStyle(enterV[2])]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsWrap}
        >
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={styles.tabBtn}
              onPress={() => setCategory(cat.id)}
              onLayout={(e) => {
                tabLay[cat.id] = e.nativeEvent.layout;
                if (cat.id === category) moveInd(cat.id, false);
              }}
            >
              <Text style={[styles.tabText, category === cat.id && styles.tabTextOn]}>
                {cat.name}
              </Text>
              <View style={styles.tabLineSpace} />
            </TouchableOpacity>
          ))}
          <Animated.View
            pointerEvents="none"
            style={[styles.tabInd, { opacity: indOn ? 1 : 0, transform: [{ translateX: indX }, { scaleX: indW }] }]}
          />
        </ScrollView>
      </Animated.View>

      {/* ── Clothing grid ── */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        <View style={styles.gridWrap}>
          {currentItems.length === 0 ? (
            <View style={styles.emptyGrid}>
              <Text style={styles.emptyGridText}>先到 Closet 新增衣服</Text>
            </View>
          ) : (
            chunk(currentItems, 3).map((row, ri) => (
              <View key={ri} style={styles.gridRow}>
                {row.map((item, ci) => (
                  <Tile
                    key={`${enterKey}_${category}_${item.id}`}
                    item={item}
                    index={ri * 3 + ci}
                    onPress={() => addToCanvas(item, category)}
                  />
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Save-to-diary flight; measured so it lines up whatever the safe-area padding */}
      <View ref={flyLayerRef} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="none">
        {fly && (
          <FlyToCalendar
            key={fly.key}
            fly={fly}
            onDone={() => { setFly(f => (f?.key === fly.key ? null : f)); play(calBump, 520); }}
          />
        )}
      </View>

      <DatePickerModal
        visible={calPickerVisible}
        onClose={() => setCalPickerVisible(false)}
        onSave={saveToCalendar}
        entries={entries}
        canvasEmpty={canvasItems.length === 0}
      />

      {/* Category picker bottom sheet — same look as Home's */}
      <Modal visible={catSheetVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => { setCatSheetVisible(false); setNewCatName(''); }}>
          <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TouchableWithoutFeedback>
              <View style={styles.sheet}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>儲存到哪個類別？</Text>
                <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
                  {categories.map(cat => (
                    <TouchableOpacity
                      key={cat.id}
                      style={styles.sheetRow}
                      onPress={() => saveLookToCategory(cat)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.sheetSwatch, { backgroundColor: cat.color }]}>
                        <Feather name={cat.icon} size={15} color={'#1A120B'} />
                      </View>
                      <Text style={styles.sheetRowText} numberOfLines={1}>{cat.name}</Text>
                      <Ionicons name="chevron-forward" size={16} color={MUTED} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={styles.sheetAddRow}>
                  <TextInput
                    style={styles.sheetAddInput}
                    value={newCatName}
                    onChangeText={setNewCatName}
                    placeholder="＋ 新增類別"
                    placeholderTextColor={MUTED}
                    returnKeyType="done"
                    onSubmitEditing={addCatAndSave}
                  />
                  <TouchableOpacity
                    style={[styles.sheetAddBtn, !newCatName.trim() && { opacity: 0.4 }]}
                    onPress={addCatAndSave}
                    disabled={!newCatName.trim()}
                  >
                    <Text style={styles.sheetAddTxt}>新增</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Toast — dark pill just above the tab bar */}
      {toast && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BEIGE },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  chapter: { fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 0.8 },
  title:   { fontFamily: SERIF, fontSize: 28, fontWeight: '700', color: DARK, lineHeight: 32 },
  headerRight: {
    width: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },

  canvas: {
    width: CANVAS_W,
    height: CANVAS_H,
    alignSelf: 'center',
    marginBottom: 12,
    backgroundColor: '#FAFAF8',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  moodLabel: {
    fontFamily: MONO,
    fontSize: 9,
    color: '#CCBFB5',
    letterSpacing: 1,
    position: 'absolute',
    top: 14,
    left: 16,
  },
  emptyCanvas: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  emptyCanvasText: {
    fontFamily: MONO, fontSize: 11, color: '#CCBFB5', letterSpacing: 0.5,
  },
  emptyCanvasSub: {
    fontFamily: MONO, fontSize: 10, color: '#D8CFC7', letterSpacing: 0.3,
  },

  canvasItem: { position: 'absolute', zIndex: 10 },
  removeBtn:  {
    position: 'absolute', top: -8, right: -8, zIndex: 20,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 11,
  },

  tabsContainer: { height: 44, overflow: 'hidden' },
  tabsWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2, gap: 4 },
  tabBtn:   { paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center' },
  tabText:  { fontFamily: MONO, fontSize: 13, color: MUTED },
  tabTextOn:{ color: DARK, fontWeight: '600' },
  tabLineSpace: { height: 1.5, marginTop: 3 },
  tabInd:   { position: 'absolute', left: 0, bottom: 10, width: 1, height: 1.5, backgroundColor: DARK },

  gridWrap: { paddingHorizontal: 16, paddingTop: 4 },
  gridRow:  { flexDirection: 'row', gap: 8, marginBottom: 6 },
  thumbCell: {
    width: THUMB_W, height: 88, borderRadius: 14,
    backgroundColor: '#F0EAE0', overflow: 'hidden',
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6,
  },
  thumbImage: { position: 'absolute', width: THUMB_W, height: 88 },
  emptyGrid: { paddingTop: 24, alignItems: 'center' },
  emptyGridText: { fontFamily: MONO, fontSize: 11, color: '#CCBFB5', letterSpacing: 0.5 },

  heartWrap: { position: 'absolute', bottom: 14, right: 14, zIndex: 20 },
  starBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center', alignItems: 'center',
  },

  burstDot: {
    position: 'absolute', right: 32 - 3.5, bottom: 32 - 3.5, zIndex: 30,
    width: 7, height: 7, borderRadius: 3.5,
  },

  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F5EFE6',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 14, paddingBottom: 40,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#C8BAA8', alignSelf: 'center', marginBottom: 18,
  },
  sheetTitle: {
    fontFamily: SERIF, fontSize: 17, fontWeight: '700', color: DARK,
    marginBottom: 18,
  },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, gap: 14,
    borderBottomWidth: 1, borderBottomColor: '#EDE5D8',
  },
  sheetSwatch: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sheetRowText: { flex: 1, fontSize: 15, color: DARK, fontWeight: '500' },
  sheetScroll: { maxHeight: SCREEN_H * 0.5 },
  sheetRecPill: {
    borderWidth: 1, borderColor: '#C9B9A6', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  sheetRecTxt: { fontSize: 10, color: '#7A6650', fontWeight: '600' },
  sheetAddRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14 },
  sheetAddInput: {
    flex: 1, borderWidth: 1, borderColor: '#C9B9A6', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: DARK, backgroundColor: '#FBF9F5',
  },
  sheetAddBtn: { backgroundColor: DARK, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  sheetAddTxt: { fontSize: 14, color: '#F5EFE6', fontWeight: '700' },

  toastWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 16,
    alignItems: 'center', zIndex: 50,
  },
  toast: {
    backgroundColor: 'rgba(26,17,8,0.92)',
    borderRadius: 999,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  toastText: { color: '#F5EFE6', fontSize: 13, fontWeight: '600' },
});
