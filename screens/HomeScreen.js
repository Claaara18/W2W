import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

const BEIGE = '#F5EFE6';
const DARK = '#1A1108';
const MUTED = '#9E8C7A';
const CHIP_BORDER = '#C8BAA8';
const { width } = Dimensions.get('window');
const LOOK_W = width * 0.65;
const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const OCCASIONS = ['Casual', 'School', 'Work', 'Date'];

const LOOKS = [
  { id: '1', bg: '#E4DDD4', title: 'Look 01', desc: '知性簡約' },
  { id: '2', bg: '#D4DCE4', title: 'Look 02', desc: '休閒清爽' },
  { id: '3', bg: '#D4E4DC', title: 'Look 03', desc: '優雅精緻' },
];

const getWeatherInfo = (code) => {
  if (code === 0)   return { desc: '晴天',   en: 'Sunny',       icon: 'sunny' };
  if (code <= 2)    return { desc: '大致晴', en: 'Clear',       icon: 'partly-sunny' };
  if (code <= 3)    return { desc: '多雲',   en: 'Cloudy',      icon: 'cloud' };
  if (code <= 48)   return { desc: '有霧',   en: 'Foggy',       icon: 'cloud-outline' };
  if (code <= 55)   return { desc: '毛毛雨', en: 'Drizzle',     icon: 'rainy' };
  if (code <= 65)   return { desc: '下雨',   en: 'Rainy',       icon: 'rainy' };
  if (code <= 77)   return { desc: '下雪',   en: 'Snowy',       icon: 'snow' };
  if (code <= 82)   return { desc: '陣雨',   en: 'Showers',     icon: 'rainy' };
  return              { desc: '雷雨',   en: 'Thunderstorm', icon: 'thunderstorm' };
};

export default function HomeScreen() {
  const [selectedOcc, setSelectedOcc] = useState('Casual');
  const [favorites, setFavorites] = useState(new Set());
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadWeather(); }, []);

  const loadWeather = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setWeather({ temp: '--', desc: '無法取得位置', en: 'N/A', icon: 'cloud-outline' });
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const { latitude, longitude } = loc.coords;
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&temperature_unit=celsius`
      );
      const data = await res.json();
      const info = getWeatherInfo(data.current.weathercode);
      setWeather({ temp: Math.round(data.current.temperature_2m), ...info });
    } catch {
      setWeather({ temp: '--', desc: '載入失敗', en: 'N/A', icon: 'cloud-outline' });
    } finally {
      setLoading(false);
    }
  };

  const toggleFav = (id) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.titleTop}>What to</Text>
          <Text style={styles.titleBottom}>wear?</Text>
          <Text style={styles.subtitle}>A small ritual, every morning.</Text>
        </View>

        {/* ── 01. WEATHER ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>01. WEATHER</Text>
          {loading ? (
            <ActivityIndicator size="small" color={MUTED} style={{ alignSelf: 'flex-start' }} />
          ) : (
            <View style={styles.weatherRow}>
              <Ionicons name={weather.icon} size={26} color="#E8A020" />
              <Text style={styles.weatherTemp}>{weather.temp}°</Text>
              <Text style={styles.weatherDesc}>{weather.desc}</Text>
            </View>
          )}
        </View>

        {/* ── 02. OCCASIONS ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>02. OCCATIONS</Text>
          <View style={styles.chipRow}>
            {OCCASIONS.map((occ) => (
              <TouchableOpacity
                key={occ}
                style={[styles.chip, selectedOcc === occ && styles.chipOn]}
                onPress={() => setSelectedOcc(occ)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, selectedOcc === occ && styles.chipTextOn]}>
                  {occ}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── CTA Button ── */}
        <TouchableOpacity style={styles.cta} activeOpacity={0.85}>
          <View style={styles.ctaTop}>
            <Text style={styles.ctaMain}>What to wear today</Text>
            <View style={styles.ctaArrow}>
              <Ionicons name="arrow-forward" size={16} color={DARK} />
            </View>
          </View>
          {weather && (
            <Text style={styles.ctaMeta}>
              {selectedOcc}  ·  {weather.en}  ·  {weather.temp}°C
            </Text>
          )}
        </TouchableOpacity>

        {/* ── 03. TODAY'S EDIT ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>03. TODAY'S EDIT</Text>
          <Text style={styles.editSub}>Three looks for you</Text>
        </View>

        {/* Horizontal scroll look cards */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={LOOK_W + 12}
          decelerationRate="fast"
          contentContainerStyle={styles.looksContainer}
        >
          {LOOKS.map((look) => (
            <View key={look.id} style={[styles.lookCard, { backgroundColor: look.bg }]}>
              <TouchableOpacity
                style={styles.heartBtn}
                onPress={() => toggleFav(look.id)}
                hitSlop={8}
              >
                <Ionicons
                  name={favorites.has(look.id) ? 'heart' : 'heart-outline'}
                  size={16}
                  color={favorites.has(look.id) ? '#C0392B' : '#888'}
                />
              </TouchableOpacity>
              <View style={styles.lookFooter}>
                <Text style={styles.lookTitle}>{look.title}</Text>
                <Text style={styles.lookDesc}>{look.desc}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BEIGE },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 28,
  },
  titleTop: {
    fontFamily: SERIF,
    fontSize: 38,
    fontWeight: '400',
    color: DARK,
    lineHeight: 44,
  },
  titleBottom: {
    fontFamily: SERIF,
    fontSize: 38,
    fontWeight: '700',
    color: DARK,
    lineHeight: 44,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: MUTED,
    fontStyle: 'italic',
  },

  // Sections
  section: {
    paddingHorizontal: 20,
    marginBottom: 22,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 1.8,
    marginBottom: 12,
  },

  // Weather
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weatherTemp: {
    fontSize: 28,
    fontWeight: '600',
    color: DARK,
  },
  weatherDesc: {
    fontSize: 14,
    color: MUTED,
  },

  // Occasion chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipOn: {
    backgroundColor: DARK,
    borderColor: DARK,
  },
  chipText: {
    fontSize: 13,
    color: DARK,
    fontWeight: '500',
  },
  chipTextOn: {
    color: BEIGE,
  },

  // CTA — beige background, dark text, two rows
  cta: {
    marginHorizontal: 20,
    marginBottom: 28,
    backgroundColor: BEIGE,
    borderWidth: 1.5,
    borderColor: DARK,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  ctaTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  ctaMain: {
    fontFamily: SERIF,
    fontSize: 16,
    fontWeight: '700',
    color: DARK,
    letterSpacing: 0.2,
  },
  ctaArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: DARK,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaMeta: {
    fontSize: 11,
    color: MUTED,
    letterSpacing: 0.5,
  },

  // Today's Edit
  editSub: {
    fontSize: 13,
    color: MUTED,
    fontStyle: 'italic',
    marginBottom: 14,
  },

  // Horizontal look cards
  looksContainer: {
    paddingLeft: 20,
    paddingRight: 20,
    gap: 12,
  },
  lookCard: {
    width: LOOK_W,
    height: LOOK_W * 1.45,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  heartBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
    padding: 6,
  },
  lookFooter: {
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  lookTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: DARK,
    letterSpacing: 0.5,
  },
  lookDesc: {
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },
});
