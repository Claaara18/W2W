import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet,
  Dimensions, Platform, ActivityIndicator, Image, Modal,
  TouchableWithoutFeedback, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useWardrobe } from '../context/WardrobeContext';
import { useCollection, STYLE_CATEGORIES } from '../context/CollectionContext';
import { useCalendar } from '../context/CalendarContext';
import { recommendOutfits } from '../utils/outfitRecommender';

const BEIGE       = '#F5EFE6';
const DARK        = '#1A1108';
const MUTED       = '#9E8C7A';
const CHIP_BORDER = '#C8BAA8';
const CARD_BG     = '#EDE7DC';
const { width, height: SCREEN_H } = Dimensions.get('window');
const LOOK_W      = width * 0.65;
const LOOK_H      = LOOK_W * 1.45;
const SERIF       = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO        = 'JetBrainsMono_400Regular';

const OCCASIONS = ['Casual', 'School', 'Work', 'Date'];

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

function OutfitCard({ outfit, isFavorite, onToggleFav, onAddToCalendar }) {
  const items = outfit.items;
  const n     = items.length;

  return (
    <View style={styles.lookCard}>
      {/* Top-right action buttons */}
      <View style={styles.cardBtns}>
        <TouchableOpacity style={styles.cardBtn} onPress={onAddToCalendar} hitSlop={8}>
          <Ionicons name="calendar-outline" size={15} color="#888" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardBtn} onPress={onToggleFav} hitSlop={8}>
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={15}
            color={isFavorite ? '#C0392B' : '#888'}
          />
        </TouchableOpacity>
      </View>

      {/* Clothing images — flex layout, never overflows */}
      <View style={styles.cardInner}>
        {n === 1 && (
          <View style={{ flex: 1 }}>
            <Image source={{ uri: items[0].uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          </View>
        )}
        {n === 2 && (
          <View style={styles.twoCol}>
            {items.map(item => (
              <View key={item.id} style={{ flex: 1 }}>
                <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              </View>
            ))}
          </View>
        )}
        {n >= 3 && (
          <>
            <View style={[styles.twoCol, { flex: 1 }]}>
              {[items[0], items[1]].map(item => (
                <View key={item.id} style={{ flex: 1 }}>
                  <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                </View>
              ))}
            </View>
            <View style={{ flex: 0.9 }}>
              <Image source={{ uri: items[2].uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </View>
          </>
        )}
      </View>
    </View>
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

  const findSavedCat = (outfitId) =>
    Object.keys(collLooks).find(cat => (collLooks[cat] ?? []).some(l => l.id === outfitId));

  const isFavorited = (outfitId) => !!findSavedCat(outfitId);

  // Fetch weather
  useEffect(() => { loadWeather(); }, []);

  const loadWeather = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setWeather({ temp: '--', desc: '無法取得位置', en: 'N/A', icon: 'cloud-outline' });
        return;
      }
      const loc  = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const { latitude, longitude } = loc.coords;
      const res  = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&temperature_unit=celsius`
      );
      const data = await res.json();
      const info = getWeatherInfo(data.current.weathercode);
      setWeather({ temp: Math.round(data.current.temperature_2m), ...info });
    } catch {
      setWeather({ temp: '--', desc: '載入失敗', en: 'N/A', icon: 'cloud-outline' });
    } finally {
      setWeatherLoading(false);
    }
  };

  // Compute recommendations — stable: only re-runs when inputs actually change
  const recommendations = useMemo(
    () => recommendOutfits(wardrobe, weather, selectedOcc),
    [wardrobe, weather, selectedOcc]
  );

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
      scrollRef.current?.scrollTo({ y: 420, animated: true });
    }, 50);
  };

  // ── Render ──
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <WeatherAnimation icon={weather?.icon} />
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.titleTop}>What to</Text>
          <Text style={styles.titleBottom}>wear?</Text>
          <Text style={styles.subtitle}>A small ritual, every morning.</Text>
        </View>

        {/* 01. WEATHER */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>01. WEATHER</Text>
          {weatherLoading ? (
            <ActivityIndicator size="small" color={MUTED} style={{ alignSelf: 'flex-start' }} />
          ) : (
            <View style={styles.weatherRow}>
              <Ionicons name={weather.icon} size={26} color="#E8A020" />
              <Text style={styles.weatherTemp}>{weather.temp}°</Text>
              <Text style={styles.weatherDesc}>{weather.desc}</Text>
            </View>
          )}
        </View>

        {/* 02. OCCASIONS */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>02. OCCATIONS</Text>
          <View style={styles.chipRow}>
            {OCCASIONS.map((occ) => (
              <TouchableOpacity
                key={occ}
                style={[styles.chip, selectedOcc === occ && styles.chipOn]}
                onPress={() => { setSelectedOcc(occ); setShowRecs(false); }}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, selectedOcc === occ && styles.chipTextOn]}>
                  {occ}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* CTA */}
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={scrollToEdit}
        >
          {({ pressed }) => (
            <>
              <Text style={[styles.ctaMain, pressed && styles.ctaMainPressed]}>
                What to wear today
              </Text>
              {weather && (
                <Text style={[styles.ctaMeta, pressed && styles.ctaMetaPressed]}>
                  {selectedOcc}  ·  {weather.en}  ·  {weather.temp}°C
                </Text>
              )}
            </>
          )}
        </Pressable>

        {/* 03. TODAY'S EDIT */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>03. TODAY'S EDIT</Text>
          <Text style={styles.editSub}>
            {recommendations.length > 0
              ? `${recommendations.length} looks for you`
              : 'Three looks for you'}
          </Text>
        </View>

        {/* Look cards */}
        {!showRecs ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="arrow-up-outline" size={28} color={MUTED} />
            <Text style={styles.emptyDesc}>選好場合後，點上方按鈕查看推薦搭配</Text>
          </View>
        ) : weatherLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={MUTED} />
            <Text style={styles.loadingText}>取得天氣中…</Text>
          </View>
        ) : totalItems === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="shirt-outline" size={36} color={MUTED} />
            <Text style={styles.emptyTitle}>衣櫃還是空的</Text>
            <Text style={styles.emptyDesc}>先到 Closet 新增衣服，才能為你推薦搭配</Text>
          </View>
        ) : recommendations.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="cloudy-outline" size={36} color={MUTED} />
            <Text style={styles.emptyTitle}>今天找不到適合的搭配</Text>
            <Text style={styles.emptyDesc}>試試其他場合，或新增更多衣服</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={LOOK_W + 12}
            decelerationRate="fast"
            contentContainerStyle={styles.looksContainer}
          >
            {recommendations.map((outfit) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                isFavorite={isFavorited(outfit.id)}
                onToggleFav={() => toggleFav(outfit)}
                onAddToCalendar={() => openCalPicker(outfit)}
              />
            ))}
          </ScrollView>
        )}

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
  titleTop: {
    fontFamily: SERIF, fontSize: 38, fontWeight: '400', color: DARK, lineHeight: 44,
  },
  titleBottom: {
    fontFamily: SERIF, fontSize: 38, fontWeight: '700', color: DARK,
    lineHeight: 44, marginBottom: 8,
  },
  subtitle: { fontSize: 12, color: MUTED, fontStyle: 'italic' },

  section: { paddingHorizontal: 20, marginBottom: 22 },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: MUTED,
    letterSpacing: 1.8, marginBottom: 12,
  },

  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weatherTemp: { fontSize: 28, fontWeight: '600', color: DARK },
  weatherDesc: { fontSize: 14, color: MUTED },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1, borderColor: CHIP_BORDER,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
  },
  chipOn:     { backgroundColor: DARK, borderColor: DARK },
  chipText:   { fontSize: 13, color: DARK, fontWeight: '500' },
  chipTextOn: { color: BEIGE },

  cta: {
    marginHorizontal: 20, marginBottom: 28,
    backgroundColor: BEIGE, borderWidth: 1.5, borderColor: DARK,
    borderRadius: 14, paddingHorizontal: 20, paddingVertical: 18,
  },
  ctaPressed: {
    backgroundColor: DARK,
  },
  ctaMain: {
    fontFamily: SERIF, fontSize: 16, fontWeight: '700',
    color: DARK, letterSpacing: 0.2, marginBottom: 6,
  },
  ctaMainPressed: { color: BEIGE },
  ctaMeta: { fontSize: 11, color: MUTED, letterSpacing: 0.5 },
  ctaMetaPressed: { color: 'rgba(245,239,230,0.65)' },

  editSub: { fontSize: 13, color: MUTED, fontStyle: 'italic', marginBottom: 14 },

  looksContainer: { paddingLeft: 20, paddingRight: 20, gap: 12 },

  lookCard: {
    width: LOOK_W,
    height: LOOK_H,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: CARD_BG,
  },
  cardBtns: {
    position: 'absolute', top: 12, right: 12, zIndex: 10,
    flexDirection: 'row', gap: 6,
  },
  cardBtn: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16, padding: 6,
  },
  cardInner: {
    flex: 1,
    padding: 14,
    paddingTop: 44,
  },
  twoCol: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },

  loadingWrap: {
    paddingVertical: 40, alignItems: 'center', gap: 12,
  },
  loadingText: { fontSize: 13, color: MUTED, fontStyle: 'italic' },

  emptyWrap: {
    marginHorizontal: 20, paddingVertical: 36,
    alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#DDD5C8',
    borderStyle: 'dashed', borderRadius: 16,
  },
  emptyTitle: {
    fontFamily: SERIF, fontSize: 16, fontWeight: '700', color: DARK,
  },
  emptyDesc: { fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 18 },

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
