import React, { useState, useRef } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, Platform, PanResponder, Animated, Alert,
  Modal, TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
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

const CATEGORIES = [
  { name: 'T-shirts', id: 'tshirts' },
  { name: 'Jackets',  id: 'jackets' },
  { name: 'Skirts',   id: 'skirts'  },
  { name: 'Pants',    id: 'pants'   },
  { name: 'Dresses',  id: 'dresses' },
];

// Scatter positions as fraction of canvas dimensions
const SCATTER = [
  { x: 0.08, y: 0.12 },
  { x: 0.55, y: 0.06 },
  { x: 0.30, y: 0.44 },
  { x: 0.58, y: 0.40 },
  { x: 0.10, y: 0.62 },
  { x: 0.54, y: 0.62 },
  { x: 0.38, y: 0.18 },
  { x: 0.68, y: 0.22 },
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
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#F5EFE6', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  monthTxt: { fontFamily: SERIF, fontSize: 18, fontWeight: '700', color: DARK },
  hdrRow: { flexDirection: 'row', marginBottom: 6 },
  hdrTxt: { flex: 1, textAlign: 'center', fontFamily: MONO, fontSize: 10, color: MUTED },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  cell: { width: `${100/7}%`, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginBottom: 2 },
  cellSel: { backgroundColor: DARK },
  cellToday: { borderWidth: 1.5, borderColor: DARK },
  cellTxt: { fontFamily: MONO, fontSize: 13, color: DARK },
  cellTxtSel: { color: '#F5EFE6' },
  cellTxtToday: { fontWeight: '700' },
  saveBtn: { backgroundColor: DARK, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveTxt: { color: '#F5EFE6', fontSize: 15, fontWeight: '700' },
});

// ── Draggable item on the moodboard ──────────────────────────
function DraggableItem({ item, onRemove, onRelease }) {
  const pan       = useRef(new Animated.ValueXY()).current;
  const scale     = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);
  const lastDist  = useRef(null);
  // stable ref so the panResponder closure always calls the latest onRelease
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
      <View style={styles.itemBox}>
        {item.uri ? (
          <Image source={{ uri: item.uri }} style={styles.itemImage} resizeMode="contain" />
        ) : (
          <Text style={[styles.itemLabel, { color: MUTED }]}>{item.label}</Text>
        )}
      </View>
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function MatchScreen() {
  const [category, setCategory]       = useState('tshirts');
  const [canvasItems, setCanvasItems] = useState([]);
  const counter     = useRef(0);
  const canvasState = useRef({}); // { [id]: { panX, panY, scale } }
  const { items } = useWardrobe();
  const { looks, addLook } = useCollection();
  const { saveEntry } = useCalendar();
  const [calPickerVisible, setCalPickerVisible] = useState(false);
  const currentItems = items[category] ?? [];

  const now = new Date();
  const moodDateStr = `${WEEKDAYS_SHORT[now.getDay()]} · ${MONTHS_SHORT[now.getMonth()]} ${now.getDate()}`;

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

  const addToCanvas = (item) => {
    const idx   = counter.current % SCATTER.length;
    const initX = SCATTER[idx].x * CANVAS_W;
    const initY = SCATTER[idx].y * CANVAS_H;
    counter.current += 1;
    const id = `${item.id}_${counter.current}`;
    canvasState.current[id] = { panX: 0, panY: 0, scale: 1 };
    setCanvasItems(prev => [...prev, { ...item, id, initX, initY }]);
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
    // Snapshot: absolute canvas coordinates + user scale
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
        <View style={{ width: 72 }} />
        <View style={styles.headerCenter}>
          <Text style={styles.chapter}>Chapter . I</Text>
          <Text style={styles.title}>Match</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => setCalPickerVisible(true)} hitSlop={8}>
            <Ionicons name="calendar-outline" size={20} color={DARK} />
          </TouchableOpacity>
          <TouchableOpacity onPress={clearCanvas} hitSlop={8}>
            <Ionicons name="refresh-outline" size={22} color={DARK} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Moodboard — fixed height ── */}
      <View style={styles.canvas}>
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
          </View>
        )}
        <TouchableOpacity style={styles.starBtn} activeOpacity={0.75} onPress={saveLook}>
          <Ionicons name="star-outline" size={20} color={MUTED} />
        </TouchableOpacity>
      </View>

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
              <Text style={styles.emptyGridText}>
                先到 Closet 新增衣服
              </Text>
            </View>
          ) : (
            chunk(currentItems, 3).map((row, ri) => (
              <View key={ri} style={styles.gridRow}>
                {row.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.thumbCell}
                    onPress={() => addToCanvas(item)}
                    activeOpacity={0.75}
                  >
                    <Image source={{ uri: item.uri }} style={styles.thumbImage} resizeMode="contain" />
                    <Text style={styles.thumbLabel}>{item.label}</Text>
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  chapter: {
    fontFamily: MONO,
    fontSize: 10,
    color: MUTED,
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: SERIF,
    fontSize: 28,
    fontWeight: '700',
    color: DARK,
    lineHeight: 32,
  },
  headerRight: {
    width: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },

  // Moodboard canvas
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCanvasText: {
    fontFamily: MONO,
    fontSize: 11,
    color: '#CCBFB5',
    letterSpacing: 0.5,
  },

  // Draggable item
  canvasItem: {
    position: 'absolute',
    zIndex: 10,
  },
  removeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    zIndex: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 11,
  },
  itemBox: {
    width: 82,
    height: 82,
    borderRadius: 14,
    backgroundColor: '#F0EAE0',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  itemImage: {
    width: 82,
    height: 82,
  },
  itemLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 0.5,
  },

  // Category tabs
  tabsContainer: {
    height: 44,
    overflow: 'hidden',
  },
  tabsWrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 2,
    gap: 4,
  },
  tabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabText: {
    fontFamily: MONO,
    fontSize: 13,
    color: MUTED,
  },
  tabTextOn: {
    color: DARK,
    fontWeight: '600',
  },
  tabLine: {
    height: 1.5,
    width: '100%',
    backgroundColor: DARK,
    marginTop: 3,
  },

  // Clothing grid
  gridWrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  thumbCell: {
    width: THUMB_W,
    height: 88,
    borderRadius: 14,
    backgroundColor: '#F0EAE0',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
  },
  thumbImage: {
    position: 'absolute',
    width: THUMB_W,
    height: 88,
  },
  thumbLabel: {
    fontFamily: MONO,
    fontSize: 9,
    color: MUTED,
    letterSpacing: 0.3,
  },
  emptyGrid: {
    paddingTop: 24,
    alignItems: 'center',
  },
  emptyGridText: {
    fontFamily: MONO,
    fontSize: 11,
    color: '#CCBFB5',
    letterSpacing: 0.5,
  },

  // Star save button inside canvas
  starBtn: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },

});
