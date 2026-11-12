import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, Platform, PanResponder, Animated, Alert,
  Modal, TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { useWardrobe } from '../context/WardrobeContext';
import { useCollection, STYLE_CATEGORIES } from '../context/CollectionContext';
import { useCalendar } from '../context/CalendarContext';

const BEIGE  = '#F2EDE8';
const DARK   = '#1A1108';
const MUTED  = '#9E8C7A';
const SERIF  = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO   = 'JetBrainsMono_400Regular';
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

function DatePickerModal({ visible, onClose, onSave }) {
  const now = new Date();
  const [year, setYear]     = useState(now.getFullYear());
  const [month, setMonth]   = useState(now.getMonth());
  const [selDay, setSelDay] = useState(null);

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null),
                 ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const prevMonth = () => { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); setSelDay(null); };
  const nextMonth = () => { if (month === 11) { setYear(y => y+1); setMonth(0); } else setMonth(m => m+1); setSelDay(null); };
  const isToday   = (d) => d === now.getDate() && month === now.getMonth() && year === now.getFullYear();

  const handleSave = () => {
    if (!selDay) return;
    const str = `${year}-${String(month+1).padStart(2,'0')}-${String(selDay).padStart(2,'0')}`;
    onSave(str);
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
              <TouchableOpacity style={[dp.saveBtn, !selDay && { opacity: 0.35 }]}
                onPress={handleSave} disabled={!selDay}>
                <Text style={dp.saveTxt}>儲存到這天</Text>
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

  return (
    <Animated.View
      style={[
        styles.canvasItem,
        { left: item.initX, top: item.initY },
        { transform: [...pan.getTranslateTransform(), { scale }] },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity style={styles.removeBtn} onPress={onRemove} hitSlop={8}>
        <Ionicons name="close-circle" size={20} color="#AAAAAA" />
      </TouchableOpacity>
      <View style={{ width: sz.w, height: sz.h }}>
        {item.uri && (
          <Image source={{ uri: item.uri }} style={{ width: sz.w, height: sz.h }} resizeMode="contain" />
        )}
      </View>
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
  const canvasOpacity = useRef(new Animated.Value(1)).current;

  const { items } = useWardrobe();
  const { looks, addLook } = useCollection();
  const { saveEntry } = useCalendar();
  const [calPickerVisible, setCalPickerVisible] = useState(false);
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

    Animated.timing(canvasOpacity, {
      toValue: 0.25, duration: 180, useNativeDriver: true,
    }).start(() => {
      const newOutfit = generateRandomOutfit();

      if (newOutfit.length === 0) {
        Animated.timing(canvasOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
        Alert.alert('衣櫥太空了', '先到 Closet 新增衣服，才能搖出搭配');
        return;
      }

      // Clear canvas state and compute smart layout
      Object.keys(canvasState.current).forEach(k => delete canvasState.current[k]);
      const ts   = Date.now();
      const laid = layoutOutfit(newOutfit, canvasState.current, ts);
      counter.current = laid.length;
      setCanvasItems(laid);

      Animated.timing(canvasOpacity, {
        toValue: 1, duration: 280, useNativeDriver: true,
      }).start();
    });
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
    if (canvasItems.length === 0) {
      Alert.alert('搭配板是空的', '先加入衣服再儲存到日曆');
      return;
    }
    const snapshot = canvasItems.map(ci => {
      const s = canvasState.current[ci.id] ?? { panX: 0, panY: 0, scale: 1 };
      return { id: ci.id, uri: ci.uri, label: ci.label, x: ci.initX + s.panX, y: ci.initY + s.panY, scale: s.scale };
    });
    saveEntry(dateStr, { items: snapshot, canvasW: CANVAS_W, canvasH: CANVAS_H });
    Alert.alert('已儲存', `穿搭已記錄到 ${dateStr} ✓`);
  };

  const addToCanvas = (item, categoryId) => {
    counter.current += 1;
    const id = `${item.id}_${counter.current}`;
    const sz = ITEM_SIZES[categoryId] ?? DEFAULT_SZ;
    canvasState.current[id] = { panX: 0, panY: 0, scale: 1 };
    setCanvasItems(prev => {
      const pos = smartPos(categoryId, prev);
      return [...prev, { ...item, id, categoryId, sz, initX: pos.x, initY: pos.y }];
    });
  };

  const removeFromCanvas = (id) => {
    delete canvasState.current[id];
    setCanvasItems(prev => prev.filter(i => i.id !== id));
  };

  const clearCanvas = () => {
    counter.current = 0;
    canvasState.current = {};
    setCanvasItems([]);
  };

  const saveLook = () => {
    if (canvasItems.length === 0) {
      Alert.alert('搭配板是空的', '先加入衣服再收藏');
      return;
    }
    const snapshot = canvasItems.map(ci => {
      const s = canvasState.current[ci.id] ?? { panX: 0, panY: 0, scale: 1 };
      return { id: ci.id, uri: ci.uri, label: ci.label, x: ci.initX + s.panX, y: ci.initY + s.panY, scale: s.scale };
    });
    Alert.alert(
      '收藏到哪個標籤？',
      undefined,
      [
        ...STYLE_CATEGORIES.map(cat => ({
          text: cat.name,
          onPress: () => {
            addLook(cat.id, {
              id: `look_${Date.now()}`,
              label: `${cat.name} ${(looks[cat.id]?.length ?? 0) + 1}`,
              canvasW: CANVAS_W,
              canvasH: CANVAS_H,
              items: snapshot,
              favorite: false,
            });
            Alert.alert('已收藏', `已加入 ${cat.name} ✓`);
          },
        })),
        { text: '取消', style: 'cancel' },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ width: 80 }} />
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Match</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={shakeToMatch} hitSlop={8}>
            <Ionicons name="dice-outline" size={22} color={DARK} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCalPickerVisible(true)} hitSlop={8}>
            <Ionicons name="calendar-outline" size={20} color={DARK} />
          </TouchableOpacity>
          <TouchableOpacity onPress={clearCanvas} hitSlop={8}>
            <Ionicons name="refresh-outline" size={22} color={DARK} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Moodboard ── */}
      <Animated.View style={[styles.canvas, { opacity: canvasOpacity }]}>
        <Text style={styles.moodLabel}>{moodDateStr}</Text>
        {canvasItems.map(item => (
          <DraggableItem
            key={item.id}
            item={item}
            onRemove={() => removeFromCanvas(item.id)}
            onRelease={(s) => { canvasState.current[item.id] = s; }}
          />
        ))}
        {canvasItems.length === 0 && (
          <View style={styles.emptyCanvas}>
            <Text style={styles.emptyCanvasText}>點選下方衣物加入搭配</Text>
            <Text style={styles.emptyCanvasSub}>搖晃手機或點骰子隨機穿搭</Text>
          </View>
        )}
        <TouchableOpacity style={styles.starBtn} activeOpacity={0.75} onPress={saveLook}>
          <Ionicons name="heart-outline" size={20} color="#A99A8A" />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Category tabs ── */}
      <View style={styles.tabsContainer}>
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
            >
              <Text style={[styles.tabText, category === cat.id && styles.tabTextOn]}>
                {cat.name}
              </Text>
              {category === cat.id && <View style={styles.tabLine} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

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
                {row.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.thumbCell}
                    onPress={() => addToCanvas(item, category)}
                    activeOpacity={0.75}
                  >
                    <Image source={{ uri: item.uri }} style={styles.thumbImage} resizeMode="contain" />
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <DatePickerModal
        visible={calPickerVisible}
        onClose={() => setCalPickerVisible(false)}
        onSave={saveToCalendar}
      />
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
  tabLine:  { height: 1.5, width: '100%', backgroundColor: DARK, marginTop: 3 },

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

  starBtn: {
    position: 'absolute', bottom: 14, right: 14,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center', alignItems: 'center',
  },
});
