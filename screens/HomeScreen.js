import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet,
  Dimensions, Platform, ActivityIndicator, Image, Modal,
  TouchableWithoutFeedback, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWardrobe } from '../context/WardrobeContext';
import { useCollection, STYLE_CATEGORIES } from '../context/CollectionContext';
import { useCalendar } from '../context/CalendarContext';
import { recommendOutfits } from '../utils/outfitRecommender';

const BEIGE       = '#F5EFE6';
const DARK        = '#1A1108';
const INK         = '#1A120B';
const BROWN       = '#5A4628';
const LABEL       = '#7A6650';
const MUTED       = '#8C7758';
const CHIP_BORDER = '#C9B9A6';
const CHIP_ON_BG  = '#EADFCB';
const CARD_BG     = '#EDE7DC';
const LOOK_BG     = '#FBF9F5';
const { width, height: SCREEN_H } = Dimensions.get('window');
const LOOK_W      = 228;
const LOOK_GAP    = 14;
const SERIF       = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO        = 'JetBrainsMono_400Regular';

const OCCASIONS = ['Casual', 'School', 'Work', 'Date'];

const CATEGORY_LABELS = {
  tshirts: 'Top', jackets: 'Jacket', skirts: 'Skirt', pants: 'Pants', dresses: 'Dress',
};

const getWeatherInfo = (code) => {
  if (code === 0)  return { desc: '晴天',   en: 'Sunny',        icon: 'sunny' };
  if (code <= 2)   return { desc: '大致晴', en: 'Clear',        icon: 'partly-sunny' };
  if (code <= 3)   return { desc: '多雲',   en: 'Cloudy',       icon: 'cloud' };
  if (code <= 48)  return { desc: '有霧',   en: 'Foggy',        icon: 'cloud-outline' };
  if (code <= 55)  return { desc: '毛毛雨', en: 'Drizzle',      icon: 'rainy' };
  if (code <= 65)  return { desc: '下雨',   en: 'Rainy',        icon: 'rainy' };
  if (code <= 77)  return { desc: '下雪',   en: 'Snowy',        icon: 'snow' };
  if (code <= 82)  return { desc: '陣雨',   en: 'Showers',      icon: 'rainy' };
  return             { desc: '雷雨',   en: 'Thunderstorm', icon: 'thunderstorm' };
};

// ── Weather animation particles (stable random values, generated once at module load) ──
const seed = (n) => ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;

// Cloud shapes: 3 clouds at different heights/sizes/speeds, starting at staggered positions
const CLOUD_P = [
  { y: SCREEN_H * 0.06, w: 120, h: 50, dur: 22000, init: 0.20, op: 0.30 },
  { y: SCREEN_H * 0.13, w: 160, h: 64, dur: 30000, init: 0.62, op: 0.24 },
  { y: SCREEN_H * 0.03, w: 88,  h: 38, dur: 17000, init: 0.85, op: 0.20 },
];
const RAIN_P = Array.from({ length: 20 }, (_, i) => ({
  x:       8 + seed(i * 3)     * (width - 16),
  dur:     800 + seed(i * 3 + 1) * 600,
  init:    seed(i * 3 + 2),
  opacity: 0.22 + seed(i * 5)  * 0.28,
}));
const SNOW_P = Array.from({ length: 12 }, (_, i) => ({
  x:       8 + seed(i * 7)     * (width - 16),
  dur:     3200 + seed(i * 7 + 1) * 2200,
  init:    seed(i * 7 + 2),
  opacity: 0.45 + seed(i * 7 + 3) * 0.35,
  size:    3 + seed(i * 7 + 4) * 4,
}));

function CloudShape({ w, h, color }) {
  const r = h * 0.5;
  return (
    <View style={{ width: w, height: h, position: 'relative' }}>
      <View style={{ position: 'absolute', bottom: 0, left: w * 0.08, width: w * 0.84, height: h * 0.55, borderRadius: h * 0.28, backgroundColor: color }} />
      <View style={{ position: 'absolute', bottom: h * 0.28, left: w * 0.05, width: r * 1.3, height: r * 1.3, borderRadius: r * 0.65, backgroundColor: color }} />
      <View style={{ position: 'absolute', bottom: h * 0.34, left: w * 0.25, width: r * 1.7, height: r * 1.7, borderRadius: r * 0.85, backgroundColor: color }} />
      <View style={{ position: 'absolute', bottom: h * 0.22, right: w * 0.08, width: r * 1.2, height: r * 1.2, borderRadius: r * 0.6, backgroundColor: color }} />
    </View>
  );
}

function WeatherAnimation({ icon }) {
  const rainAnims  = useRef(RAIN_P.map(p => new Animated.Value(p.init))).current;
  const snowAnims  = useRef(SNOW_P.map(p => new Animated.Value(p.init))).current;
  const cloudAnims = useRef(CLOUD_P.map(p => new Animated.Value(p.init))).current;
  const sunAnim    = useRef(new Animated.Value(0)).current;

  const isRain  = icon === 'rainy' || icon === 'thunderstorm';
  const isSnow  = icon === 'snow';
  const isSun   = icon === 'sunny' || icon === 'partly-sunny';
  const isCloud = icon === 'cloud' || icon === 'cloud-outline';

  useEffect(() => {
    if (isRain) {
      const loops = rainAnims.map((a, i) =>
        Animated.loop(Animated.timing(a, {
          toValue: 1, duration: RAIN_P[i].dur,
          useNativeDriver: true, easing: Easing.linear,
        }))
      );
      loops.forEach(l => l.start());
      return () => loops.forEach(l => l.stop());
    }
    if (isSnow) {
      const loops = snowAnims.map((a, i) =>
        Animated.loop(Animated.timing(a, {
          toValue: 1, duration: SNOW_P[i].dur,
          useNativeDriver: true, easing: Easing.linear,
        }))
      );
      loops.forEach(l => l.start());
      return () => loops.forEach(l => l.stop());
    }
    if (isSun) {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(sunAnim, { toValue: 1, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(sunAnim, { toValue: 0, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ]));
      loop.start();
      return () => loop.stop();
    }
    if (isCloud) {
      const loops = cloudAnims.map((a, i) =>
        Animated.loop(Animated.timing(a, {
          toValue: 1, duration: CLOUD_P[i].dur,
          useNativeDriver: true, easing: Easing.linear,
        }))
      );
      loops.forEach(l => l.start());
      return () => loops.forEach(l => l.stop());
    }
  }, [icon]);

  if (isRain) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {rainAnims.map((anim, i) => {
          const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-20, SCREEN_H + 20] });
          return (
            <Animated.View key={i} style={{
              position: 'absolute', left: RAIN_P[i].x, top: 0,
              width: 1.5, height: 16, borderRadius: 1,
              backgroundColor: '#7AAFC8', opacity: RAIN_P[i].opacity,
              transform: [{ translateY }, { rotate: '12deg' }],
            }} />
          );
        })}
      </View>
    );
  }

  if (isSnow) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {snowAnims.map((anim, i) => {
          const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-20, SCREEN_H + 20] });
          const translateX = anim.interpolate({
            inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 14, 0, -14, 0],
          });
          const sz = SNOW_P[i].size;
          return (
            <Animated.View key={i} style={{
              position: 'absolute', left: SNOW_P[i].x, top: 0,
              width: sz, height: sz, borderRadius: sz / 2,
              backgroundColor: '#D8EAF4', opacity: SNOW_P[i].opacity,
              transform: [{ translateY }, { translateX }],
            }} />
          );
        })}
      </View>
    );
  }

  if (isSun) {
    const opacity = sunAnim.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.24] });
    const scale   = sunAnim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] });
    return (
      <View pointerEvents="none" style={styles.sunWrap}>
        <Animated.View style={[styles.sunGlow, { opacity, transform: [{ scale }] }]} />
      </View>
    );
  }

  if (isCloud) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {cloudAnims.map((anim, i) => {
          const { w, h, y, op } = CLOUD_P[i];
          // Drift from right (+width) to left (-w), init sets starting fraction
          const translateX = anim.interpolate({
            inputRange:  [0, 1],
            outputRange: [width + w, -w],
          });
          return (
            <Animated.View key={i} style={{
              position: 'absolute', top: y,
              opacity: op,
              transform: [{ translateX }],
            }}>
              <CloudShape w={w} h={h} color="#C8BCB0" />
            </Animated.View>
          );
        })}
      </View>
    );
  }

  return null;
}

// x/y/scale for CollectionScreen's existing LookCardItems renderer
const toCollItem = (item, index, total) => {
  const xs     = total === 1 ? [0]        : total === 2 ? [0, 95]      : [0, 90, 45];
  const ys     = total === 1 ? [0]        : total === 2 ? [0, 0]       : [0, 0, 95];
  const scales = total === 1 ? 2          : total === 2 ? 1.5          : 1.3;
  return { id: item.id, uri: item.uri, x: xs[index] ?? 0, y: ys[index] ?? 0, scale: scales };
};

// ── Motion helpers (built-in Animated, native driver, opacity/transform only) ──
const EASE_OUT  = Easing.bezier(0.22, 1, 0.36, 1);
const THINK_MS  = 700;   // "thinking" wait — must stay ≤ 800ms
const DEAL_STEP = 90;    // stagger between dealt cards / garments

// Fades a block in while lifting it 18px; used for the staggered entrance
function Rise({ delay = 0, style, children, ...rest }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(v, { toValue: 1, duration: 600, delay, easing: EASE_OUT, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return (
    <Animated.View {...rest} style={[style, { opacity: v, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

// Title line that slides up from behind a clipping mask
function TitleLine({ delay = 0, style, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(v, { toValue: 1, duration: 900, delay, easing: EASE_OUT, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [52, 0] });
  return (
    <View style={styles.titleMask}>
      <Animated.Text style={[style, { transform: [{ translateY }] }]}>{children}</Animated.Text>
    </View>
  );
}

// Counts from 0 up to target (numbers only; '--' etc. pass straight through)
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(typeof target === 'number' ? 0 : target);
  useEffect(() => {
    if (typeof target !== 'number') { setVal(target); return; }
    const start = Date.now();
    let raf;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setVal(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return val;
}

function OccasionChip({ label, selected, onPress }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const mounted = useRef(false);

  // Pop when this chip becomes selected (skip the initial render)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (!selected) return;
    scale.setValue(0.9);
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.06, duration: 250, easing: EASE_OUT, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 170, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [selected]);

  const pressTo = (toValue) =>
    Animated.timing(scale, { toValue, duration: 180, easing: EASE_OUT, useNativeDriver: true }).start();

  return (
    <Pressable
      style={{ flex: 1 }}
      onPress={onPress}
      onPressIn={() => pressTo(0.93)}
      onPressOut={() => pressTo(1)}
    >
      <Animated.View style={[styles.chip, selected && styles.chipOn, { transform: [{ scale }] }]}>
        <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// Garment image wrapper that pops in (scale 0.4 / -8° → rest)
function GarmentPop({ delay, style, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(v, {
      toValue: 1, duration: 380, delay, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, []);
  const scale   = v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const rotate  = v.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] });
  const opacity = v.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <Animated.View style={[style, { opacity, transform: [{ scale }, { rotate }] }]}>
      {children}
    </Animated.View>
  );
}

function OutfitCard({ outfit, index, occasion, isFavorite, onToggleFav, onAddToCalendar }) {
  const items = outfit.items;
  const n     = items.length;
  const categories = items
    .map(item => CATEGORY_LABELS[item.categoryId] ?? item.label)
    .filter(Boolean)
    .join(' · ');

  // Deal-in: from 90px below, scale 0.6, fading in; cards staggered by DEAL_STEP
  const delay = index * DEAL_STEP;
  const deal  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(deal, {
      toValue: 1, duration: 450, delay, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, []);
  const dealStyle = {
    opacity:   deal.interpolate({ inputRange: [0, 0.5], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [
      { translateY: deal.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) },
      { scale:      deal.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
    ],
  };
  const garmentDelay = (j) => delay + 220 + j * DEAL_STEP;

  return (
    <Animated.View style={[styles.lookCard, dealStyle]}>
      <View style={styles.lookHead}>
        <Text style={styles.lookNo}>LOOK {String(index + 1).padStart(2, '0')}</Text>
        <Text style={styles.lookNo}>{occasion.toUpperCase()}</Text>
      </View>

      {/* Clothing images — flex layout, never overflows */}
      <View style={styles.cardInner}>
        {n === 1 && (
          <GarmentPop delay={garmentDelay(0)} style={{ flex: 1 }}>
            <Image source={{ uri: items[0].uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          </GarmentPop>
        )}
        {n === 2 && (
          <View style={styles.twoCol}>
            {items.map((item, j) => (
              <GarmentPop key={item.id} delay={garmentDelay(j)} style={{ flex: 1 }}>
                <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              </GarmentPop>
            ))}
          </View>
        )}
        {n >= 3 && (
          <>
            <View style={[styles.twoCol, { flex: 1 }]}>
              {[items[0], items[1]].map((item, j) => (
                <GarmentPop key={item.id} delay={garmentDelay(j)} style={{ flex: 1 }}>
                  <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                </GarmentPop>
              ))}
            </View>
            <GarmentPop delay={garmentDelay(2)} style={{ flex: 0.9 }}>
              <Image source={{ uri: items[2].uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </GarmentPop>
          </>
        )}
      </View>

      <Text style={styles.lookCats}>{categories}</Text>
      <View style={styles.lookFoot}>
        <View style={styles.cardBtns}>
          <TouchableOpacity style={styles.cardBtn} onPress={onAddToCalendar} hitSlop={8}>
            <Ionicons name="calendar-outline" size={16} color={LABEL} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardBtn} onPress={onToggleFav} hitSlop={8}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={16}
              color={isFavorite ? BROWN : LABEL}
            />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ── Calendar date picker modal ────────────────────────────────
const CAL_MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const CAL_DAYS   = ['S','M','T','W','T','F','S'];

function CalendarPickerModal({ visible, onClose, onSave }) {
  const now = new Date();
  const [year,   setYear]   = useState(now.getFullYear());
  const [month,  setMonth]  = useState(now.getMonth());
  const [selDay, setSelDay] = useState(null);

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null),
                 ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const isToday = d => d === now.getDate() && month === now.getMonth() && year === now.getFullYear();

  const prev = () => { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); setSelDay(null); };
  const next = () => { if (month === 11) { setYear(y => y+1); setMonth(0); } else setMonth(m => m+1); setSelDay(null); };

  const handleSave = () => {
    if (!selDay) return;
    onSave(`${year}-${String(month+1).padStart(2,'0')}-${String(selDay).padStart(2,'0')}`);
    setSelDay(null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={cpStyles.overlay}>
          <TouchableWithoutFeedback>
            <View style={cpStyles.sheet}>
              <View style={cpStyles.handle} />
              <Text style={cpStyles.title}>加入月曆</Text>
              <View style={cpStyles.navRow}>
                <TouchableOpacity onPress={prev} hitSlop={12}>
                  <Ionicons name="chevron-back" size={20} color={DARK} />
                </TouchableOpacity>
                <Text style={cpStyles.monthTxt}>{CAL_MONTHS[month]} {year}</Text>
                <TouchableOpacity onPress={next} hitSlop={12}>
                  <Ionicons name="chevron-forward" size={20} color={DARK} />
                </TouchableOpacity>
              </View>
              <View style={cpStyles.hdrRow}>
                {CAL_DAYS.map((d, i) => <Text key={i} style={cpStyles.hdrTxt}>{d}</Text>)}
              </View>
              <View style={cpStyles.grid}>
                {cells.map((day, i) => {
                  const sel = day && day === selDay;
                  const tod = day && isToday(day);
                  return (
                    <TouchableOpacity key={i} disabled={!day}
                      style={[cpStyles.cell, sel && cpStyles.cellSel, tod && !sel && cpStyles.cellToday]}
                      onPress={() => day && setSelDay(day)}>
                      <Text style={[cpStyles.cellTxt, sel && cpStyles.cellTxtSel, tod && !sel && cpStyles.cellTxtToday]}>
                        {day ?? ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity style={[cpStyles.saveBtn, !selDay && { opacity: 0.35 }]}
                onPress={handleSave} disabled={!selDay}>
                <Text style={cpStyles.saveTxt}>儲存到這天</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const cpStyles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: '#F5EFE6', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  handle:   { width: 36, height: 4, backgroundColor: '#C8BAA8', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:    { fontFamily: SERIF, fontSize: 18, fontWeight: '700', color: DARK, textAlign: 'center', marginBottom: 16 },
  navRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthTxt: { fontFamily: SERIF, fontSize: 16, fontWeight: '600', color: DARK },
  hdrRow:   { flexDirection: 'row', marginBottom: 4 },
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

export default function HomeScreen() {
  const [selectedOcc, setSelectedOcc] = useState('Casual');
  const [weather,     setWeather]     = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [showRecs,      setShowRecs]      = useState(false);
  const [pickingOutfit,    setPickingOutfit]    = useState(null);
  const [calPickingOutfit, setCalPickingOutfit] = useState(null);
  const [calPickerVisible, setCalPickerVisible] = useState(false);
  const { items: wardrobe }                        = useWardrobe();
  const { looks: collLooks, addLook, removeLook }  = useCollection();
  const { saveEntry }                              = useCalendar();
  const scrollRef = useRef(null);
  const editY     = useRef(420);
  const [activeLook, setActiveLook] = useState(0);
  const [seed,       setSeed]       = useState(0);   // +1 per shuffle, passed to recommendOutfits
  const [thinking,   setThinking]   = useState(false);
  const [dealKey,    setDealKey]    = useState(0);   // remounts cards so they deal in again
  const thinkTimer = useRef(null);
  const ctaScale   = useRef(new Animated.Value(1)).current;
  const ctaBar     = useRef(new Animated.Value(0)).current;
  const displayTemp = useCountUp(weather?.temp);

  useEffect(() => () => clearTimeout(thinkTimer.current), []);

  const findSavedCat = (outfitId) =>
    Object.keys(collLooks).find(cat => (collLooks[cat] ?? []).some(l => l.id === outfitId));

  const isFavorited = (outfitId) => !!findSavedCat(outfitId);

  // Fetch weather
  useEffect(() => { loadWeather(); }, []);

  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' 逾時')), ms)),
  ]);

  const loadWeather = async () => {
    try {
      console.log('[weather] 1. 請求定位權限');
      const { status } = await withTimeout(Location.requestForegroundPermissionsAsync(), 20000, '權限');
      console.log('[weather]    權限結果:', status);
      if (status !== 'granted') {
        setWeather({ temp: '--', desc: '無法取得位置', en: 'N/A', icon: 'cloud-outline' });
        return;
      }
      console.log('[weather] 2. 取得位置');
      const last = await withTimeout(Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 }), 3000, '上次位置').catch(() => null);
      const loc = last ?? await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }), 8000, '定位');
      const { latitude, longitude } = loc.coords;
      console.log('[weather] 3. 呼叫天氣 API');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&temperature_unit=celsius`;
      let res;
      try {
        res = await withTimeout(fetch(url), 12000, '天氣 API');
      } catch (e) {
        console.log('[weather]    第一次失敗，重試一次');
        res = await withTimeout(fetch(url), 12000, '天氣 API（重試）');
      }
      const data = await res.json();
      const info = getWeatherInfo(data.current.weathercode);
      const fresh = { temp: Math.round(data.current.temperature_2m), ...info };
      setWeather(fresh);
      AsyncStorage.setItem('w2w_last_weather', JSON.stringify({ ...fresh, at: Date.now() })).catch(() => {});
      console.log('[weather] ✓ 完成');
    } catch (e) {
      console.warn('[weather] ✗ 失敗:', e?.message);
      const cached = await AsyncStorage.getItem('w2w_last_weather').then(JSON.parse).catch(() => null);
      if (cached && Date.now() - cached.at < 12 * 60 * 60 * 1000) {
        const t = new Date(cached.at);
        const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
        console.log('[weather]    改用上次的天氣（' + hhmm + '）');
        setWeather({ ...cached, desc: `${cached.desc}・${hhmm} 更新` });
      } else {
        setWeather({ temp: '--', desc: '載入失敗', en: 'N/A', icon: 'cloud-outline' });
      }
    } finally {
      setWeatherLoading(false);
    }
  };

  // Compute recommendations — stable: only re-runs when inputs actually change
  const recommendations = useMemo(
    () => recommendOutfits(wardrobe, weather, selectedOcc, seed),
    [wardrobe, weather, selectedOcc, seed]
  );

  useEffect(() => { setActiveLook(0); }, [recommendations]);

  const onLooksScrollEnd = (e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const last = recommendations.length - 1;
    // The last card can't snap to its own offset, so treat "scrolled to the right edge" as the last page
    const atEnd = contentOffset.x >= contentSize.width - layoutMeasurement.width - 4;
    const i = atEnd ? last : Math.round(contentOffset.x / (LOOK_W + LOOK_GAP));
    setActiveLook(Math.max(0, Math.min(i, last)));
  };

  const totalItems = Object.values(wardrobe ?? {}).reduce(
    (sum, arr) => sum + (arr?.length ?? 0), 0
  );

  const toggleFav = (outfit) => {
    const savedCat = findSavedCat(outfit.id);
    if (savedCat) {
      removeLook(savedCat, outfit.id);
    } else {
      setPickingOutfit(outfit);
    }
  };

  const saveToCategory = (catId) => {
    if (!pickingOutfit) return;
    addLook(catId, {
      id: pickingOutfit.id,
      label: `${selectedOcc} Look`,
      bg: CARD_BG,
      items: pickingOutfit.items.map((item, i, arr) => toCollItem(item, i, arr.length)),
    });
    setPickingOutfit(null);
  };

  const openCalPicker = (outfit) => {
    setCalPickingOutfit(outfit);
    setCalPickerVisible(true);
  };

  const saveOutfitToCalendar = (dateStr) => {
    if (!calPickingOutfit) return;
    const snapshot = calPickingOutfit.items.map((item, i, arr) => {
      const col = toCollItem(item, i, arr.length);
      return { id: item.id, uri: item.uri, label: item.label ?? '', x: col.x, y: col.y, scale: col.scale };
    });
    saveEntry(dateStr, { items: snapshot, canvasW: 300, canvasH: 280 });
    setCalPickingOutfit(null);
    setCalPickerVisible(false);
  };

  const scrollToEdit = () => {
    setShowRecs(true);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, editY.current - 12), animated: true });
    }, 50);
  };

  const hasResults = showRecs && recommendations.length > 0;

  const cancelThinking = () => {
    clearTimeout(thinkTimer.current);
    ctaBar.stopAnimation();
    ctaBar.setValue(0);
    setThinking(false);
  };

  // Short "styling" beat (≤ 800ms) with a progress bar, then deal the looks
  const onCtaPress = () => {
    if (thinking) return;
    const shuffle = hasResults;
    setThinking(true);
    ctaBar.setValue(0);
    Animated.timing(ctaBar, { toValue: 1, duration: THINK_MS, easing: Easing.linear, useNativeDriver: true }).start();
    thinkTimer.current = setTimeout(() => {
      if (shuffle) setSeed(s => s + 1);
      ctaBar.setValue(0);
      setThinking(false);
      setActiveLook(0);
      setDealKey(k => k + 1);
      scrollToEdit();
    }, THINK_MS);
  };

  const ctaPressTo = (toValue) =>
    Animated.timing(ctaScale, { toValue, duration: 200, easing: EASE_OUT, useNativeDriver: true }).start();

  // ── Render ──
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <WeatherAnimation icon={weather?.icon} />
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TitleLine style={styles.titleTop}>What to</TitleLine>
          <TitleLine style={styles.titleBottom} delay={120}>wear?</TitleLine>
          <Rise delay={260 + 80 * 1}>
            <Text style={styles.subtitle}>A small ritual, every morning.</Text>
          </Rise>

          {/* Weather — one line under the title */}
          <Rise delay={260 + 80 * 2} style={styles.weatherRow}>
            {weatherLoading ? (
              <>
                <ActivityIndicator size="small" color={MUTED} />
                <Text style={styles.weatherDesc}>取得天氣中…</Text>
              </>
            ) : (
              <>
                <Ionicons name={weather.icon} size={22} color="#E8A020" />
                <Text style={styles.weatherTemp}>{displayTemp}°C</Text>
                <Text style={styles.weatherDesc}>{weather.desc}</Text>
              </>
            )}
          </Rise>
        </View>

        {/* 01. OCCASION */}
        <Rise delay={260 + 80 * 3} style={styles.section}>
          <Text style={styles.sectionLabel}>01. OCCASION</Text>
          <View style={styles.chipRow}>
            {OCCASIONS.map((occ) => (
              <OccasionChip
                key={occ}
                label={occ}
                selected={selectedOcc === occ}
                onPress={() => { cancelThinking(); setSelectedOcc(occ); setShowRecs(false); }}
              />
            ))}
          </View>

          {/* CTA */}
          <Pressable
            onPress={onCtaPress}
            onPressIn={() => ctaPressTo(0.975)}
            onPressOut={() => ctaPressTo(1)}
          >
            <Animated.View style={[styles.cta, { transform: [{ scale: ctaScale }] }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ctaMain}>
                  {thinking ? 'Styling your day…' : hasResults ? 'Shuffle three more' : 'What to wear today'}
                </Text>
                <Text style={styles.ctaMeta}>
                  {weather
                    ? `${selectedOcc}  ·  ${weather.en}  ·  ${weather.temp}°C`
                    : selectedOcc}
                </Text>
              </View>
              <Ionicons
                name={hasResults ? 'shuffle' : 'arrow-forward'}
                size={22}
                color="#FFFFFF"
                style={{ opacity: thinking ? 0 : 1 }}
              />
              <Animated.View style={[styles.ctaBar, { transform: [{ scaleX: ctaBar }] }]} />
            </Animated.View>
          </Pressable>
        </Rise>

        {/* 02. TODAY'S EDIT */}
        <Rise
          delay={260 + 80 * 4}
          onLayout={(e) => { editY.current = e.nativeEvent.layout.y; }}
        >
          <View style={[styles.section, styles.editSection]}>
            <Text style={styles.sectionLabel}>02. TODAY'S EDIT</Text>
            <Text style={styles.editSub}>
              {recommendations.length > 0
                ? `${recommendations.length} looks for you`
                : 'Three looks for you'}
            </Text>
          </View>

          {/* Look cards */}
          {!showRecs ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="arrow-up-outline" size={18} color={LABEL} />
              <Text style={styles.emptyDesc}>選好場合後，點上方按鈕查看推薦搭配</Text>
            </View>
          ) : weatherLoading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator size="small" color={LABEL} />
              <Text style={styles.emptyDesc}>取得天氣中…</Text>
            </View>
          ) : totalItems === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="shirt-outline" size={18} color={LABEL} />
              <Text style={styles.emptyDesc}>衣櫃還是空的，先到 Closet 新增衣服</Text>
            </View>
          ) : recommendations.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloudy-outline" size={18} color={LABEL} />
              <Text style={styles.emptyDesc}>找不到適合的搭配，試試其他場合</Text>
            </View>
          ) : (
            <>
              <ScrollView
                key={dealKey}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={LOOK_W + LOOK_GAP}
                decelerationRate="fast"
                onMomentumScrollEnd={onLooksScrollEnd}
                onScrollEndDrag={onLooksScrollEnd}
                contentContainerStyle={styles.looksContainer}
              >
                {recommendations.map((outfit, i) => (
                  <OutfitCard
                    key={outfit.id}
                    outfit={outfit}
                    index={i}
                    occasion={selectedOcc}
                    isFavorite={isFavorited(outfit.id)}
                    onToggleFav={() => toggleFav(outfit)}
                    onAddToCalendar={() => openCalPicker(outfit)}
                  />
                ))}
              </ScrollView>
              {recommendations.length > 1 && (
                <View style={styles.pager}>
                  {recommendations.map((outfit, i) => (
                    <View key={outfit.id} style={[styles.pagerDot, i === activeLook && styles.pagerDotOn]} />
                  ))}
                </View>
              )}
            </>
          )}
        </Rise>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Category picker bottom sheet */}
      <Modal visible={!!pickingOutfit} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setPickingOutfit(null)}>
          <View style={styles.sheetOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.sheet}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>儲存到哪個類別？</Text>
                {STYLE_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={styles.sheetRow}
                    onPress={() => saveToCategory(cat.id)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.sheetSwatch, { backgroundColor: cat.color }]} />
                    <Text style={styles.sheetRowText}>{cat.name}</Text>
                    <Ionicons name="chevron-forward" size={16} color={MUTED} />
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Calendar date picker */}
      <CalendarPickerModal
        visible={calPickerVisible}
        onClose={() => { setCalPickerVisible(false); setCalPickingOutfit(null); }}
        onSave={saveOutfitToCalendar}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BEIGE },

  header: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 28 },
  titleMask: { overflow: 'hidden', paddingBottom: 4 },
  titleTop: {
    fontFamily: SERIF, fontSize: 38, fontWeight: '400', color: DARK, lineHeight: 44,
  },
  titleBottom: {
    fontFamily: SERIF, fontSize: 38, fontWeight: '700', color: DARK,
    lineHeight: 44, marginBottom: 8,
  },
  subtitle: { fontSize: 13, color: LABEL, fontStyle: 'italic' },

  section: { paddingHorizontal: 20, marginBottom: 22 },
  editSection: { marginTop: 14, marginBottom: 14 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: LABEL,
    letterSpacing: 3, marginBottom: 14,
  },

  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  weatherTemp: { fontSize: 17, fontWeight: '600', color: DARK, fontVariant: ['tabular-nums'] },
  weatherDesc: { fontSize: 15, color: LABEL },

  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: CHIP_BORDER, borderRadius: 999,
  },
  chipOn:     { backgroundColor: CHIP_ON_BG, borderColor: INK },
  chipText:   { fontSize: 14, color: INK, fontWeight: '500' },
  chipTextOn: { fontWeight: '700' },

  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 12,
    backgroundColor: INK,
    borderRadius: 22, overflow: 'hidden', paddingLeft: 20, paddingRight: 20, paddingTop: 17, paddingBottom: 16,
  },
  ctaBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 3,
    backgroundColor: '#F2E4BC', transformOrigin: 'left',
  },
  ctaMain: {
    fontFamily: SERIF, fontSize: 20, fontWeight: '700', color: '#FFFFFF',
  },
  ctaMeta: { marginTop: 4, fontSize: 13, color: '#CDBFA8', letterSpacing: 0.8 },

  editSub: { fontSize: 13, color: LABEL, fontStyle: 'italic', marginTop: -6 },

  looksContainer: { paddingLeft: 20, paddingRight: 20, paddingTop: 6, paddingBottom: 18, gap: LOOK_GAP },

  lookCard: {
    width: LOOK_W,
    borderRadius: 26,
    backgroundColor: LOOK_BG,
    borderWidth: 1, borderColor: '#E6DCCD',
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14,
    shadowColor: '#46321A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 4,
  },
  lookHead: { flexDirection: 'row', justifyContent: 'space-between' },
  lookNo: { fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.7, color: LABEL },
  cardInner: {
    height: 170,
    marginTop: 10,
    borderRadius: 18,
    overflow: 'hidden',
  },
  twoCol: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  lookCats: { marginTop: 12, fontSize: 13, lineHeight: 18, color: LABEL, letterSpacing: 0.4 },
  lookFoot: {
    flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8,
  },
  cardBtns: { flexDirection: 'row', gap: 6 },
  cardBtn: {
    borderWidth: 1, borderColor: '#E6DCCD',
    borderRadius: 16, padding: 6,
  },

  pager: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 2 },
  pagerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: CHIP_BORDER },
  pagerDotOn: { width: 18, backgroundColor: BROWN },

  emptyWrap: {
    marginHorizontal: 20, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: CHIP_BORDER,
    borderStyle: 'dashed', borderRadius: 22,
  },
  emptyDesc: { flexShrink: 1, fontSize: 13, color: LABEL, lineHeight: 18 },

  sunWrap:  { position: 'absolute', top: -60, right: -60, width: 260, height: 260 },
  sunGlow:  { width: 260, height: 260, borderRadius: 130, backgroundColor: '#FFB800' },

  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: BEIGE,
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
  sheetSwatch: { width: 28, height: 28, borderRadius: 8 },
  sheetRowText: { flex: 1, fontSize: 15, color: DARK, fontWeight: '500' },
});
