import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Keyboard, StyleSheet, Dimensions, Platform,
  PanResponder, Animated, Modal, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { STICKER_CATS, STICKER_SOURCES } from '../data/stickers';

const { width: SCREEN_W } = Dimensions.get('window');
const BG       = '#F2EDE8';
const DARK     = '#1A1108';
const GRID     = '#C8B5A5';
const MUTED    = '#9E8C7A';
const DIARY_BG = '#FAF7F2';
const SERIF    = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO     = 'JetBrainsMono_400Regular';

const CAL_PAD      = 12;
const CELL_W       = Math.floor((SCREEN_W - CAL_PAD * 2) / 7);
const CELL_H       = CELL_W;
const DATE_SAFE    = 12;
const MONTH_HDR_H  = 58;
const DAY_HDR_H    = 26;
const DIARY_H      = 340;
const TOOLBAR_H    = 48;
const PHOTO_SIZE   = 150;
// Adjust-photo overlay preview size
const PREVIEW_SZ   = Math.min(SCREEN_W - 48, 300);

const DAY_HDRS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── Text editor constants ──────────────────────────────────────
const TEXT_FONTS = [
  { key: 'classic',    label: 'Classic',   family: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  { key: 'handwriting',label: 'Writing',   family: Platform.OS === 'ios' ? 'Noteworthy-Light' : 'cursive' },
  { key: 'modern',     label: 'Modern',    family: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif' },
  { key: 'typewriter', label: 'Typer',     family: 'Courier New' },
];
// 6 non-duplicate preset colors
const TEXT_COLORS = ['#17120E', '#806750', '#F8F4EC', '#E9B6B0', '#8499A5', '#8B9273'];
const TEXT_BGS = [
  { key: 'none',  label: '—',    bg: null },
  { key: 'white', label: 'White',bg: '#FFFFFF',               radius: 6  },
  { key: 'cream', label: 'Cream',bg: '#F5EFE0',               radius: 6  },
  { key: 'dark',  label: 'Dark', bg: '#2A1F14',               radius: 20 },
  { key: 'fog',   label: 'Fog',  bg: 'rgba(255,255,255,0.5)', radius: 6  },
];

// Photo frames cycle order
const PHOTO_FRAME_CYCLE = ['rounded','square','circle','polaroid','torn'];

// ── Storage ────────────────────────────────────────────────────
const journalKey = (year, month) => `@w2w_journal_${year}_${month}`;

async function loadMonthData(year, month) {
  try {
    const raw = await AsyncStorage.getItem(journalKey(year, month));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
async function saveMonthData(year, month, items) {
  try {
    await AsyncStorage.setItem(journalKey(year, month), JSON.stringify(items));
  } catch (e) { console.warn('Journal save error:', e); }
}

// ── HSB ↔ Hex ──────────────────────────────────────────────────
function hsbToHex(h, s, b) {
  h = ((h % 360) + 360) % 360; s /= 100; b /= 100;
  const k = n => (n + h / 60) % 6;
  const f = n => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return '#' + [Math.round(f(5)*255), Math.round(f(3)*255), Math.round(f(1)*255)]
    .map(v => v.toString(16).padStart(2,'0')).join('');
}
function hexToHsb(hex) {
  if (!hex || hex.length < 7) return [0, 0, 0];
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r)      h = ((g-b)/d%6+6)%6;
    else if (max === g) h = (b-r)/d + 2;
    else                h = (r-g)/d + 4;
    h *= 60;
  }
  return [h, max ? (d/max)*100 : 0, max*100];
}

// ── Helpers ────────────────────────────────────────────────────
function calRows(year, month) {
  const startCol    = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array(startCol).fill(null),
    ...Array.from({ length: daysInMonth }, (_,i) => i+1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_,i) => cells.slice(i*7, i*7+7));
}

function boundingBox(items) {
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  items.forEach(ci => {
    const s=ci.scale??1, x=ci.x??0, y=ci.y??0;
    minX=Math.min(minX,x+41*(1-s)); maxX=Math.max(maxX,x+41*(1+s));
    minY=Math.min(minY,y+41*(1-s)); maxY=Math.max(maxY,y+41*(1+s));
  });
  return { minX, minY, w:(maxX-minX)||82, h:(maxY-minY)||82 };
}

function JCellThumb({ entry }) {
  const items = (entry?.items ?? []).filter(i => i.uri);
  if (!items.length) return null;
  const { minX, minY, w, h } = boundingBox(items);
  const availW = CELL_W-4, availH = CELL_H-DATE_SAFE-2;
  const ratio = Math.min(availW/w, availH/h);
  const base  = 82 * ratio;
  const dx = (availW - w*ratio)/2 - minX*ratio + 2;
  const dy = DATE_SAFE - minY*ratio;
  return (
    <View style={{ position:'absolute', width:CELL_W, height:CELL_H, overflow:'hidden' }}>
      {items.map(ci => (
        <Image key={ci.id} source={{ uri: ci.uri }}
          style={{ position:'absolute', width:base, height:base,
            left:(ci.x??0)*ratio+dx, top:(ci.y??0)*ratio+dy,
            transform:[{scale:ci.scale??1}] }}
          resizeMode="contain" />
      ))}
    </View>
  );
}

const pinchDist  = t => { const dx=t[1].pageX-t[0].pageX, dy=t[1].pageY-t[0].pageY; return Math.sqrt(dx*dx+dy*dy); };
const touchAngle = t => Math.atan2(t[1].pageY-t[0].pageY, t[1].pageX-t[0].pageX)*180/Math.PI;

function getFontFamily(key) {
  return TEXT_FONTS.find(f => f.key === key)?.family ?? SERIF;
}
function getTextBgStyle(key) {
  const b = TEXT_BGS.find(x => x.key === key);
  if (!b || !b.bg) return {};
  return { backgroundColor:b.bg, borderRadius:b.radius??6,
    paddingHorizontal:key==='dark'?12:8, paddingVertical:key==='dark'?6:4 };
}

// ── Photo frame ────────────────────────────────────────────────
// Renders photo with inner content offset/scale support.
// All frames clip with overflow:'hidden'; polaroid adds white border outside clip.
function PhotoFrameView({ uri, frame, contentScale=1, contentOffsetX=0, contentOffsetY=0, originalWidth, originalHeight }) {
  const sz  = PHOTO_SIZE;
  const pW  = originalWidth  || sz;
  const pH  = originalHeight || sz;
  const cs  = Math.max(1, contentScale);
  // Cover scale: scales photo so shorter side fills the frame
  const coverS = Math.max(sz / pW, sz / pH);
  const totalS = coverS * cs;
  // Position image so its center aligns to frame center + offset
  const imgLeft = (sz - pW) / 2 + contentOffsetX;
  const imgTop  = (sz - pH) / 2 + contentOffsetY;

  const inner = (
    <Image source={{ uri }}
      style={{ position:'absolute', width:pW, height:pH,
        left:imgLeft, top:imgTop,
        transform:[{scale:totalS}] }}
      resizeMode="stretch" />
  );

  if (frame === 'circle') return (
    <View style={{ width:sz, height:sz, borderRadius:sz/2, overflow:'hidden' }}>
      {inner}
    </View>
  );
  if (frame === 'polaroid') {
    const pad = Math.round(sz*0.055), bot = Math.round(sz*0.19);
    return (
      <View style={{ backgroundColor:'#FAFAF8', padding:pad, paddingBottom:bot,
        shadowColor:'#000', shadowOpacity:0.16, shadowRadius:6,
        shadowOffset:{width:0,height:2}, elevation:5 }}>
        <View style={{ width:sz, height:sz, overflow:'hidden' }}>
          {inner}
        </View>
      </View>
    );
  }
  if (frame === 'torn') return (
    <View style={{ shadowColor:'#6B4B2A', shadowOpacity:0.18,
      shadowRadius:5, shadowOffset:{width:1,height:3}, elevation:4 }}>
      <View style={{ width:sz, height:sz, overflow:'hidden',
        borderTopLeftRadius:18, borderTopRightRadius:6,
        borderBottomLeftRadius:10, borderBottomRightRadius:22 }}>
        {inner}
      </View>
    </View>
  );
  if (frame === 'square') return (
    <View style={{ width:sz, height:sz, overflow:'hidden' }}>
      {inner}
    </View>
  );
  // rounded (default)
  return (
    <View style={{ width:sz, height:sz, borderRadius:12, overflow:'hidden' }}>
      {inner}
    </View>
  );
}

// ── Color Picker Modal ─────────────────────────────────────────
// 3-strip HSB picker (hue, saturation, brightness) using colored View segments.
const STRIP_W = SCREEN_W - 56;
const STRIP_H = 30;
const HUE_N = 36;   // 10° per segment
const SB_N  = 24;   // segments per saturation/brightness strip

function ColorPickerModal({ initialColor, onChange, onDone, onCancel }) {
  const insets = useSafeAreaInsets();
  const [h, setH] = useState(0);
  const [s, setS] = useState(100);
  const [bv, setBv] = useState(80);
  const hRef = useRef(0), sRef = useRef(100), bRef = useRef(80);

  useEffect(() => {
    const [ih, is, ib] = hexToHsb(initialColor ?? '#17120E');
    setH(ih); setS(is); setBv(ib);
    hRef.current=ih; sRef.current=is; bRef.current=ib;
  }, []);

  const notify = useCallback((nh, ns, nb) => {
    onChange?.(hsbToHex(nh, ns, nb));
  }, [onChange]);

  // Strip layout offsets captured via onLayout
  const hueX = useRef(0), satX = useRef(0), brtX = useRef(0);

  const makePR = useCallback((which) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (evt) => {
      const lx = evt.nativeEvent.pageX - (which==='h'?hueX:which==='s'?satX:brtX).current;
      const t  = Math.max(0, Math.min(1, lx / STRIP_W));
      if (which==='h') { const v=t*360; hRef.current=v; setH(v); notify(v,sRef.current,bRef.current); }
      if (which==='s') { const v=t*100; sRef.current=v; setS(v); notify(hRef.current,v,bRef.current); }
      if (which==='b') { const v=t*100; bRef.current=v; setBv(v); notify(hRef.current,sRef.current,v); }
    },
    onPanResponderMove: (evt) => {
      const lx = evt.nativeEvent.pageX - (which==='h'?hueX:which==='s'?satX:brtX).current;
      const t  = Math.max(0, Math.min(1, lx / STRIP_W));
      if (which==='h') { const v=t*360; hRef.current=v; setH(v); notify(v,sRef.current,bRef.current); }
      if (which==='s') { const v=t*100; sRef.current=v; setS(v); notify(hRef.current,v,bRef.current); }
      if (which==='b') { const v=t*100; bRef.current=v; setBv(v); notify(hRef.current,sRef.current,v); }
    },
  }), [notify]);

  const huePR = useRef(makePR('h')).current;
  const satPR = useRef(makePR('s')).current;
  const brtPR = useRef(makePR('b')).current;

  const hueColors = useMemo(() => Array.from({length:HUE_N},(_,i)=>hsbToHex(i*(360/HUE_N),100,100)),[]);
  const satColors = useMemo(() => Array.from({length:SB_N},(_,i)=>hsbToHex(h,(i/(SB_N-1))*100,bv)),[h,bv]);
  const brtColors = useMemo(() => Array.from({length:SB_N},(_,i)=>hsbToHex(h,s,(i/(SB_N-1))*100)),[h,s]);

  const preview = hsbToHex(h, s, bv);

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'flex-end' }}>
        <View style={[cp.sheet, { paddingBottom: Math.max(insets.bottom,16) }]}>
          <View style={cp.topBar}>
            <TouchableOpacity onPress={onCancel} hitSlop={12}>
              <Text style={cp.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <View style={[cp.preview, { backgroundColor: preview }]} />
            <TouchableOpacity onPress={() => onDone(preview)} hitSlop={12}>
              <Text style={cp.doneTxt}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={cp.strips}>
            <Text style={cp.label}>Hue</Text>
            <View style={{ width:STRIP_W, height:STRIP_H, flexDirection:'row',
              borderRadius:STRIP_H/2, overflow:'hidden', marginBottom:4 }}
              onLayout={e => { hueX.current = e.nativeEvent.layout.x; }}
              {...huePR.panHandlers}>
              {hueColors.map((c,i)=><View key={i} style={{flex:1,backgroundColor:c}}/>)}
              <View pointerEvents="none" style={[cp.indicator, { left: (h/360)*STRIP_W - 10 }]} />
            </View>

            <Text style={cp.label}>Saturation</Text>
            <View style={{ width:STRIP_W, height:STRIP_H, flexDirection:'row',
              borderRadius:STRIP_H/2, overflow:'hidden', marginBottom:4 }}
              onLayout={e => { satX.current = e.nativeEvent.layout.x; }}
              {...satPR.panHandlers}>
              {satColors.map((c,i)=><View key={i} style={{flex:1,backgroundColor:c}}/>)}
              <View pointerEvents="none" style={[cp.indicator, { left: (s/100)*STRIP_W - 10 }]} />
            </View>

            <Text style={cp.label}>Brightness</Text>
            <View style={{ width:STRIP_W, height:STRIP_H, flexDirection:'row',
              borderRadius:STRIP_H/2, overflow:'hidden' }}
              onLayout={e => { brtX.current = e.nativeEvent.layout.x; }}
              {...brtPR.panHandlers}>
              {brtColors.map((c,i)=><View key={i} style={{flex:1,backgroundColor:c}}/>)}
              <View pointerEvents="none" style={[cp.indicator, { left: (bv/100)*STRIP_W - 10 }]} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Text editor overlay ────────────────────────────────────────
function TextEditorOverlay({ initialText, initialFont, initialColor, initialBg, onDone, onCancel }) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef();
  const [text,  setText]  = useState(initialText ?? '');
  const [font,  setFont]  = useState(initialFont  ?? 'classic');
  const [color, setColor] = useState(initialColor ?? '#17120E');
  const [bg,    setBg]    = useState(initialBg    ?? 'none');
  const [showPicker, setShowPicker] = useState(false);

  // kbAnim: keyboard height. Drives styleBar `bottom` (layout-based, hitbox correct) AND
  // text-area paddingBottom. Both derived nodes are memoised — inline Animated.add/multiply
  // creates a new node each render, causing Animated.View to briefly reset to 0 on font/color
  // change, moving the TextInput behind the keyboard and triggering iOS keyboard dismiss.
  const kbAnim          = useRef(new Animated.Value(0)).current;
  const styleBarHRef    = useRef(new Animated.Value(150)).current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const textAreaPadding = useMemo(() => Animated.add(kbAnim, styleBarHRef), []);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => Animated.timing(kbAnim, {
        toValue: e.endCoordinates.height, duration: e.duration ?? 250,
        useNativeDriver: false,
      }).start()
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => Animated.timing(kbAnim, {
        toValue: 0, duration: e.duration ?? 250,
        useNativeDriver: false,
      }).start()
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 160);
    return () => clearTimeout(t);
  }, []);

  const handleDone = () => { Keyboard.dismiss(); onDone(text, font, color, bg); };
  const handleCancel = () => { Keyboard.dismiss(); onCancel(); };

  const bgViewStyle  = getTextBgStyle(bg);
  const fontFamily   = getFontFamily(font);
  const displayColor = bg === 'dark' ? '#F2EDE8' : color;
  const isPreset     = TEXT_COLORS.includes(color);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      {/* No KeyboardAvoidingView — layout is driven entirely by kbAnim */}
      <View style={{ flex:1, backgroundColor:'rgba(242,237,232,0.93)' }}>

        <View style={[te.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={handleCancel} style={te.teBtn} hitSlop={12}>
            <Text style={te.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDone} style={te.teBtn} hitSlop={12}>
            <Text style={te.doneTxt}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* textAreaPadding is memoised — prevents new Animated node on every re-render */}
        <Animated.View style={{ flex:1, justifyContent:'center', alignItems:'center',
          paddingHorizontal:28, paddingBottom: textAreaPadding }}>
          <TouchableOpacity activeOpacity={1}
            style={{ width:'100%', alignItems:'center' }}
            onPress={() => inputRef.current?.focus()}>
            <View style={bgViewStyle}>
              <TextInput ref={inputRef} multiline value={text} onChangeText={setText}
                textAlign="center"
                style={{ fontFamily, fontSize:22, color:displayColor,
                  width: SCREEN_W - 80, lineHeight:32 }}
                placeholder="Type something..."
                placeholderTextColor="rgba(154,140,122,0.45)"
                scrollEnabled={false}
                blurOnSubmit={false} />
            </View>
          </TouchableOpacity>
        </Animated.View>

      </View>

      {/* StyleBar: absolute, bottom:kbAnim (layout prop) — hitbox tracks the animated position.
          Using transform instead would keep hitbox at bottom:0 (behind keyboard). */}
      <Animated.View
        style={[te.styleBar, {
          position:'absolute', left:0, right:0,
          bottom: kbAnim,
          paddingBottom: Math.max(insets.bottom, 8),
        }]}
        onLayout={e => styleBarHRef.setValue(e.nativeEvent.layout.height)}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always" contentContainerStyle={te.fontRow}>
          {TEXT_FONTS.map(f => (
            <TouchableOpacity key={f.key} onPress={() => setFont(f.key)}
              style={[te.fontBtn, font===f.key && te.fontBtnOn]}>
              <Text style={[te.fontBtnTxt, { fontFamily:f.family },
                font===f.key ? te.fontTxtOn : te.fontTxt]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={te.colorRow}>
          {TEXT_COLORS.map(c => (
            <TouchableOpacity key={c} onPress={() => setColor(c)}
              style={[te.colorDot, { backgroundColor:c },
                (c==='#F8F4EC'||c==='#E9B6B0') && te.colorDotLight,
                color===c && te.colorDotRing]}>
              {color===c && <View style={te.colorCheck}/>}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => setShowPicker(true)}
            style={[te.paletteBtn, !isPreset && te.paletteBtnOn]}>
            <Ionicons name="color-palette-outline" size={22}
              color={!isPreset ? DARK : MUTED} />
          </TouchableOpacity>
        </View>

        <View style={te.bgRow}>
          {TEXT_BGS.map(b => (
            <TouchableOpacity key={b.key} onPress={() => setBg(b.key)}
              style={[te.bgBtn,
                b.bg && { backgroundColor:b.bg },
                b.key==='none' && te.bgBtnNone,
                bg===b.key && te.bgBtnOn]}>
              <Text style={[te.bgTxt, b.key==='dark' && { color:'#F2EDE8' }]}>{b.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      {showPicker && (
        <ColorPickerModal
          initialColor={color}
          onChange={setColor}
          onDone={c => { setColor(c); setShowPicker(false); setTimeout(() => inputRef.current?.focus(), 50); }}
          onCancel={() => { setShowPicker(false); setTimeout(() => inputRef.current?.focus(), 50); }}
        />
      )}
    </Modal>
  );
}

// ── Adjust Photo Overlay ───────────────────────────────────────
// Double-tap a photo → enter inner-content pan/pinch mode.
// Outer frame (position/scale/rotation) stays fixed.
// Inner content (photo's crop position and zoom) is adjustable.
function AdjustPhotoOverlay({ item, onDone, onCancel }) {
  const insets = useSafeAreaInsets();
  const SCALE_F = PREVIEW_SZ / PHOTO_SIZE; // storage coords → preview coords

  const pW = item.originalWidth  || PHOTO_SIZE;
  const pH = item.originalHeight || PHOTO_SIZE;

  // Cover scale in PHOTO_SIZE space (storage units)
  const coverS = Math.max(PHOTO_SIZE / pW, PHOTO_SIZE / pH);
  // Cover scale in PREVIEW_SZ space
  const coverSPrev = coverS * SCALE_F;

  // State in preview-space pixels (converted from stored PHOTO_SIZE coords)
  const csRef = useRef(Math.max(1, item.contentScale ?? 1));
  const oxRef = useRef((item.contentOffsetX ?? 0) * SCALE_F);
  const oyRef = useRef((item.contentOffsetY ?? 0) * SCALE_F);

  // Animated values for image transform (in preview space)
  // We use 3 separate anims: imgLeft, imgTop, imgScale
  const imgLeftAnim  = useRef(new Animated.Value(0)).current;
  const imgTopAnim   = useRef(new Animated.Value(0)).current;
  const imgScaleAnim = useRef(new Animated.Value(1)).current;

  const commitAnims = useCallback((cs, ox, oy) => {
    imgLeftAnim.setValue((PREVIEW_SZ - pW) / 2 + ox);
    imgTopAnim.setValue((PREVIEW_SZ - pH) / 2 + oy);
    imgScaleAnim.setValue(coverSPrev * cs);
  }, [pW, pH, coverSPrev]);

  useEffect(() => {
    commitAnims(csRef.current, oxRef.current, oyRef.current);
  }, []);

  // Clamp offset so photo always covers the preview frame
  const clamp = useCallback((cs, ox, oy) => {
    const totalS = coverSPrev * cs;
    const maxOx = Math.max(0, (pW * totalS - PREVIEW_SZ) / 2);
    const maxOy = Math.max(0, (pH * totalS - PREVIEW_SZ) / 2);
    return [Math.max(-maxOx, Math.min(maxOx, ox)), Math.max(-maxOy, Math.min(maxOy, oy))];
  }, [pW, pH, coverSPrev]);

  const gesData   = useRef({});
  const lastTX    = useRef(0);
  const lastTY    = useRef(0);

  const pr = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderTerminationRequest: () => false,

    onPanResponderGrant: evt => {
      const t = evt.nativeEvent.touches;
      lastTX.current = t[0].pageX;
      lastTY.current = t[0].pageY;
      gesData.current = {
        startDist: t.length >= 2 ? pinchDist(t) : null,
        startCS: csRef.current,
        startOX: oxRef.current,
        startOY: oyRef.current,
      };
    },

    onPanResponderMove: evt => {
      const t  = evt.nativeEvent.touches;
      const gd = gesData.current;

      if (t.length >= 2) {
        if (gd.startDist == null) {
          gd.startDist = pinchDist(t);
          gd.startCS   = csRef.current;
        }
        // Zoom around the midpoint of the two fingers
        const rawCS = Math.max(1, Math.min(5, gd.startCS * (pinchDist(t) / gd.startDist)));
        const [cx, cy] = clamp(rawCS, oxRef.current, oyRef.current);
        csRef.current = rawCS; oxRef.current = cx; oyRef.current = cy;
        commitAnims(rawCS, cx, cy);
        return;
      }

      if (gd.startDist != null) {
        gd.startDist = null;
        lastTX.current = t[0].pageX;
        lastTY.current = t[0].pageY;
        return;
      }

      const dx = t[0].pageX - lastTX.current;
      const dy = t[0].pageY - lastTY.current;
      lastTX.current = t[0].pageX;
      lastTY.current = t[0].pageY;

      const [cx, cy] = clamp(csRef.current, oxRef.current + dx, oyRef.current + dy);
      oxRef.current = cx; oyRef.current = cy;
      commitAnims(csRef.current, cx, cy);
    },

    onPanResponderRelease: () => { gesData.current.startDist = null; },
  })).current;

  const handleDone = () => {
    onDone({
      contentScale:   csRef.current,
      contentOffsetX: oxRef.current / SCALE_F,
      contentOffsetY: oyRef.current / SCALE_F,
    });
  };

  // Frame container at PREVIEW_SZ
  const renderFrame = () => {
    const inner = (
      <Animated.Image source={{ uri: item.content }}
        style={{ position:'absolute', width:pW, height:pH,
          left:imgLeftAnim, top:imgTopAnim,
          transform:[{ scale: imgScaleAnim }] }}
        resizeMode="stretch" />
    );
    const frame = item.frame ?? 'rounded';
    const sz = PREVIEW_SZ;
    if (frame === 'circle') return (
      <View style={{ width:sz, height:sz, borderRadius:sz/2, overflow:'hidden' }}
        {...pr.panHandlers}>{inner}</View>
    );
    if (frame === 'polaroid') {
      const pad = Math.round(sz*0.055), bot = Math.round(sz*0.19);
      return (
        <View style={{ backgroundColor:'#FAFAF8', padding:pad, paddingBottom:bot,
          shadowColor:'#000', shadowOpacity:0.16, shadowRadius:8,
          shadowOffset:{width:0,height:3}, elevation:6 }}>
          <View style={{ width:sz, height:sz, overflow:'hidden' }}
            {...pr.panHandlers}>{inner}</View>
        </View>
      );
    }
    if (frame === 'torn') return (
      <View style={{ shadowColor:'#6B4B2A', shadowOpacity:0.2,
        shadowRadius:6, shadowOffset:{width:1,height:3}, elevation:5 }}>
        <View style={{ width:sz, height:sz, overflow:'hidden',
          borderTopLeftRadius:36, borderTopRightRadius:12,
          borderBottomLeftRadius:20, borderBottomRightRadius:44 }}
          {...pr.panHandlers}>{inner}</View>
      </View>
    );
    if (frame === 'square') return (
      <View style={{ width:sz, height:sz, overflow:'hidden' }}
        {...pr.panHandlers}>{inner}</View>
    );
    return (
      <View style={{ width:sz, height:sz, borderRadius:24, overflow:'hidden' }}
        {...pr.panHandlers}>{inner}</View>
    );
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.88)' }}>

        {/* Opaque toolbar — safe area aware, never overlaps content */}
        <View style={[ap.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={onCancel} hitSlop={12} style={ap.apBtn}>
            <Text style={ap.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
          <Text style={ap.titleTxt}>ADJUST PHOTO</Text>
          <TouchableOpacity onPress={handleDone} hitSlop={12} style={ap.apBtn}>
            <Text style={ap.doneTxt}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Frame centered in remaining space */}
        <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
          {renderFrame()}
          <Text style={ap.hint}>Drag or pinch to adjust photo content</Text>
        </View>
      </View>
    </Modal>
  );
}

// ── Canvas item ────────────────────────────────────────────────
// Photos:    single tap → cycle frame  |  long press (500ms) → Adjust Photo  |  drag → move
// Text/Sticker: immediate drag, double tap text = open editor
function CanvasItem({
  item, isSelected,
  onSelect, onDelete, onSingleTap, onDoubleTap, onLongPress,
  onDragStart, onDragEnd, onTransformChange,
  onBringToFront, onSendToBack,
  capturing,
}) {
  const cb = useRef({});
  cb.current = { onSelect, onDelete, onSingleTap, onDoubleTap, onLongPress,
    onDragStart, onDragEnd, onTransformChange,
    onBringToFront, onSendToBack, isSelected };

  const isPhoto   = item.type === 'photo';
  const initX     = item.x ?? item.initX ?? 0;
  const initY     = item.y ?? item.initY ?? 0;
  const initScale = item.scale ?? 1;
  const initRot   = item.rot ?? 0;

  const posX      = useRef(initX);
  const posY      = useRef(initY);
  const panX      = useRef(new Animated.Value(initX)).current;
  const panY      = useRef(new Animated.Value(initY)).current;
  const scaleAnim = useRef(new Animated.Value(initScale)).current;
  const rotAnim   = useRef(new Animated.Value(initRot)).current;
  const lastScale = useRef(initScale);
  const lastRot   = useRef(initRot);
  const lastTX    = useRef(0);
  const lastTY    = useRef(0);
  const wasSelRef = useRef(false);
  const gesData        = useRef({});
  // Long-press timer — fires onLongPress for photos, cleared if finger moves
  const adjustTimer    = useRef(null);
  const longPressFired = useRef(false);

  const pr = useRef(PanResponder.create({
    onStartShouldSetPanResponder:     () => true,
    onMoveShouldSetPanResponder:      () => true,
    onPanResponderTerminationRequest: () => false,

    onPanResponderGrant: evt => {
      clearTimeout(adjustTimer.current);
      longPressFired.current = false;
      wasSelRef.current = cb.current.isSelected;
      cb.current.onSelect();
      const t = evt.nativeEvent.touches;
      lastTX.current = t[0].pageX; lastTY.current = t[0].pageY;
      gesData.current = {
        didMove: false, totalDx: 0, totalDy: 0,
        startDist: t.length>=2 ? pinchDist(t) : null,
        startAngle: t.length>=2 ? touchAngle(t) : 0,
        startScale: lastScale.current, startRot: lastRot.current,
      };
      // Photos: start long-press timer for Adjust Photo; drag is always immediate
      if (isPhoto) {
        adjustTimer.current = setTimeout(() => {
          longPressFired.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          cb.current.onLongPress?.();
        }, 500);
      }
      cb.current.onDragStart?.();
    },

    onPanResponderMove: evt => {
      const t  = evt.nativeEvent.touches;
      const gd = gesData.current;

      if (t.length >= 2) {
        // Two fingers: cancel long-press, handle scale/rotate
        clearTimeout(adjustTimer.current);
        gd.didMove = true;
        if (gd.startDist == null) {
          gd.startDist=pinchDist(t); gd.startAngle=touchAngle(t);
          gd.startScale=lastScale.current; gd.startRot=lastRot.current;
        } else {
          const ns = Math.max(0.3, Math.min(5, gd.startScale*(pinchDist(t)/gd.startDist)));
          const nr = gd.startRot + (touchAngle(t) - gd.startAngle);
          scaleAnim.setValue(ns); rotAnim.setValue(nr);
          lastScale.current=ns; lastRot.current=nr;
        }
        return;
      }

      if (gd.startDist != null) {
        gd.startDist=null; lastTX.current=t[0].pageX; lastTY.current=t[0].pageY; return;
      }

      const dx = t[0].pageX-lastTX.current, dy = t[0].pageY-lastTY.current;
      gd.totalDx+=Math.abs(dx); gd.totalDy+=Math.abs(dy);

      // Cancel long-press if finger moved more than 10px
      if (isPhoto && (gd.totalDx>10 || gd.totalDy>10)) {
        clearTimeout(adjustTimer.current);
      }

      lastTX.current=t[0].pageX; lastTY.current=t[0].pageY;
      posX.current+=dx; posY.current+=dy;
      panX.setValue(posX.current); panY.setValue(posY.current);
      if (Math.abs(dx)>2||Math.abs(dy)>2) gd.didMove=true;
    },

    onPanResponderRelease: () => {
      clearTimeout(adjustTimer.current);
      cb.current.onDragEnd?.();
      gesData.current.startDist=null;
      cb.current.onTransformChange?.({
        x:posX.current, y:posY.current,
        scale:lastScale.current, rot:lastRot.current,
      });
      // Only fire tap actions if finger didn't move AND long press didn't already fire
      if (!gesData.current.didMove && !longPressFired.current) {
        cb.current.onSingleTap?.();
      }
      longPressFired.current = false;
    },

    onPanResponderTerminate: () => {
      clearTimeout(adjustTimer.current);
      longPressFired.current = false;
      cb.current.onDragEnd?.();
      gesData.current.startDist=null;
      cb.current.onTransformChange?.({
        x:posX.current, y:posY.current,
        scale:lastScale.current, rot:lastRot.current,
      });
    },
  })).current;

  const rotStr = rotAnim.interpolate({inputRange:[-10000,10000],outputRange:['-10000deg','10000deg']});
  const animStyle = { transform:[{translateX:panX},{translateY:panY},{scale:scaleAnim},{rotate:rotStr}] };

  let content = null;
  if (item.type === 'sticker') {
    if (item.stickerType === 'image') {
      // source may be absent if the sticker sheet was re-processed;
      // render nothing rather than showing the raw ID string
      if (STICKER_SOURCES[item.content]) {
        content = (
          <Image
            source={STICKER_SOURCES[item.content]}
            style={cs.stickerImg}
            resizeMode="contain"
          />
        );
      }
    } else {
      content = <Text style={cs.stickerText}>{item.content}</Text>;
    }
  } else if (item.type === 'photo') {
    content = (
      <PhotoFrameView
        uri={item.content}
        frame={item.frame ?? 'rounded'}
        contentScale={item.contentScale}
        contentOffsetX={item.contentOffsetX}
        contentOffsetY={item.contentOffsetY}
        originalWidth={item.originalWidth}
        originalHeight={item.originalHeight}
      />
    );
  } else if (item.type === 'text') {
    const textColor = item.bgStyle==='dark' ? '#F2EDE8' : (item.color ?? '#17120E');
    content = (
      <View style={getTextBgStyle(item.bgStyle)}>
        <Text style={[cs.textBase, { fontFamily:getFontFamily(item.font), color:textColor }]}>
          {item.content}
        </Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={[cs.itemWrap, { zIndex: isSelected?200:100 }, animStyle,
        isSelected && !capturing && cs.selected]}
      {...pr.panHandlers}>
      {content}
      {isSelected && !capturing && (
        <TouchableOpacity style={cs.deleteBtn} onPress={() => cb.current.onDelete()} hitSlop={8}>
          <Ionicons name="close-circle" size={20} color="#B09080" />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ── Main journal screen ────────────────────────────────────────
export default function JournalScreen({ visible, onClose, viewYear, viewMonth, entries }) {
  const insets = useSafeAreaInsets();

  const [jYear,         setJYear]         = useState(viewYear);
  const [jMonth,        setJMonth]        = useState(viewMonth);
  const [selectedCat,   setSelectedCat]   = useState(STICKER_CATS[0].id);
  const [canvasItems,   setCanvasItems]   = useState([]);
  const [selectedId,    setSelectedId]    = useState(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [capturing,     setCapturing]     = useState(false);
  const [calGridH,      setCalGridH]      = useState(0);
  const [textEditor,    setTextEditor]    = useState(null);
  const [adjustingItem, setAdjustingItem] = useState(null);
  const [journalReady,  setJournalReady]  = useState(false);

  const canvasRef        = useRef();
  const scrollRef        = useRef();
  const saveTimerRef     = useRef(null);
  const switchKeyRef     = useRef(null);
  const journalReadyRef  = useRef(false);
  const jYearRef         = useRef(jYear);
  const jMonthRef        = useRef(jMonth);
  const canvasItemsRef   = useRef(canvasItems);
  jYearRef.current       = jYear;
  jMonthRef.current      = jMonth;
  canvasItemsRef.current = canvasItems;

  const loadMonth = async (year, month) => {
    const key = `${year}_${month}`;
    switchKeyRef.current = key;
    setJournalReady(false); journalReadyRef.current = false;
    setCanvasItems([]);
    const items = await loadMonthData(year, month);
    if (switchKeyRef.current !== key) return;
    setCanvasItems(items); setJournalReady(true); journalReadyRef.current = true;
  };

  const switchMonth = async (ny, nm) => {
    clearTimeout(saveTimerRef.current);
    await saveMonthData(jYearRef.current, jMonthRef.current, canvasItemsRef.current);
    jYearRef.current=ny; jMonthRef.current=nm;
    setJYear(ny); setJMonth(nm); setSelectedId(null);
    await loadMonth(ny, nm);
  };
  const prevMonth = () => { const [y,m]=jMonth===0?[jYear-1,11]:[jYear,jMonth-1]; switchMonth(y,m); };
  const nextMonth = () => { const [y,m]=jMonth===11?[jYear+1,0]:[jYear,jMonth+1]; switchMonth(y,m); };

  useEffect(() => {
    if (visible) {
      jYearRef.current=viewYear; jMonthRef.current=viewMonth;
      setJYear(viewYear); setJMonth(viewMonth); setSelectedId(null);
      loadMonth(viewYear, viewMonth);
    } else {
      if (journalReadyRef.current) {
        clearTimeout(saveTimerRef.current);
        saveMonthData(jYearRef.current, jMonthRef.current, canvasItemsRef.current);
        journalReadyRef.current = false;
      }
    }
  }, [visible]);

  useEffect(() => {
    if (!journalReadyRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMonthData(jYearRef.current, jMonthRef.current, canvasItemsRef.current);
    }, 900);
    return () => clearTimeout(saveTimerRef.current);
  }, [canvasItems]);

  const rows    = calRows(jYear, jMonth);
  const dateKey = d => `${jYear}-${String(jMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const today   = new Date();
  const isToday = d => d===today.getDate()&&jMonth===today.getMonth()&&jYear===today.getFullYear();

  const DIARY_TOP = MONTH_HDR_H + calGridH;
  const CANVAS_H  = DIARY_TOP + DIARY_H + 60;

  const addItem = (type, content, extra={}) => {
    const id = `item_${Date.now()}_${Math.floor(Math.random()*9999)}`;
    const x  = SCREEN_W/2 - (type==='text'?60:75);
    const y  = type==='sticker' ? DIARY_TOP/2-24 : DIARY_TOP+60;
    setCanvasItems(prev => {
      const maxZ = Math.max(0, ...prev.map(i => i.zOrder ?? 0));
      return [...prev, { id, type, content, x, y, scale:1, rot:0, zOrder:maxZ+1, ...extra }];
    });
    setSelectedId(id);
  };

  const deleteItem = id => {
    setCanvasItems(prev => prev.filter(i => i.id!==id));
    setSelectedId(null);
  };

  const handleSelect = id => {
    setSelectedId(id);
    setCanvasItems(prev => {
      const maxZ = Math.max(0, ...prev.map(i => i.zOrder ?? 0));
      return prev.map(i => i.id === id ? {...i, zOrder: maxZ + 1} : i);
    });
  };

  const bringToFront = id => {
    setCanvasItems(prev => {
      const maxZ = Math.max(0, ...prev.map(i => i.zOrder ?? 0));
      return prev.map(i => i.id === id ? {...i, zOrder: maxZ + 1} : i);
    });
  };

  const sendToBack = id => {
    setCanvasItems(prev => {
      const minZ = Math.min(0, ...prev.map(i => i.zOrder ?? 0));
      return prev.map(i => i.id === id ? {...i, zOrder: minZ - 1} : i);
    });
  };

  const handleTransformChange = (itemId, t) => {
    setCanvasItems(prev => prev.map(i => i.id===itemId ? {...i,...t} : i));
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status!=='granted') { Alert.alert('需要相簿權限','請到設定中開啟相簿存取權限'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true, quality: 0.85,
    });
    if (!result.canceled) {
      result.assets.forEach((asset, i) => {
        const id = `item_${Date.now()}_${i}`;
        setCanvasItems(prev => {
          const maxZ = Math.max(0, ...prev.map(it => it.zOrder ?? 0));
          return [...prev, {
            id, type:'photo', content:asset.uri, frame:'rounded',
            originalWidth:asset.width, originalHeight:asset.height,
            contentScale:1, contentOffsetX:0, contentOffsetY:0,
            x: SCREEN_W/2-75+i*14, y: DIARY_TOP+60+i*16, scale:1, rot:0,
            zOrder: maxZ + 1 + i,
          }];
        });
        setSelectedId(id);
      });
    }
  };

  const openTextEditor = (mode, item=null) => {
    setTextEditor({
      mode, itemId:item?.id??null,
      text:item?.content??'', font:item?.font??'classic',
      color:item?.color??'#17120E', bgStyle:item?.bgStyle??'none',
    });
  };

  const handleTextDone = (text, font, color, bgStyle) => {
    if (!text.trim()) { setTextEditor(null); return; }
    if (textEditor.mode==='new') {
      addItem('text', text, { font, color, bgStyle });
    } else {
      setCanvasItems(prev => prev.map(i =>
        i.id===textEditor.itemId ? {...i, content:text, font, color, bgStyle} : i
      ));
    }
    setTextEditor(null);
  };

  const handleSingleTap = (item) => {
    if (item.type === 'photo') {
      const cur  = item.frame ?? 'rounded';
      const next = PHOTO_FRAME_CYCLE[(PHOTO_FRAME_CYCLE.indexOf(cur)+1)%PHOTO_FRAME_CYCLE.length];
      setCanvasItems(prev => prev.map(i => i.id===item.id ? {...i, frame:next} : i));
    } else if (item.type === 'text') {
      openTextEditor('edit', item);
    }
  };

  // Double tap only applies to text items (re-edit)
  const handleDoubleTap = (item) => {
    if (item.type==='text') openTextEditor('edit', item);
  };

  // Long press opens Adjust Photo for photos
  const handleLongPress = (item) => {
    if (item.type==='photo') setAdjustingItem({...item});
  };

  const handleAdjustDone = ({ contentScale, contentOffsetX, contentOffsetY }) => {
    setCanvasItems(prev => prev.map(i =>
      i.id===adjustingItem.id ? {...i, contentScale, contentOffsetX, contentOffsetY} : i
    ));
    setAdjustingItem(null);
  };

  const handleSave = async () => {
    setSelectedId(null); setCapturing(true);
    scrollRef.current?.scrollTo({ y:0, animated:false });
    await new Promise(r => setTimeout(r,150));
    try {
      const uri = await captureRef(canvasRef, { format:'png', quality:1.0 });
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status!=='granted') {
        Alert.alert('需要相簿權限','請到 設定 → W2W → 相片 開啟存取權限'); return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('儲存成功 ✓','手帳圖片已儲存至相簿');
    } catch (e) {
      console.warn('Journal capture error:',e);
      Alert.alert('儲存失敗','請再試一次');
    } finally { setCapturing(false); }
  };

  const currentCat  = STICKER_CATS.find(c => c.id===selectedCat) ?? STICKER_CATS[0];
  const hasContent  = canvasItems.length > 0;
  const sortedItems = [...canvasItems].sort((a,b) => (a.zOrder ?? 0) - (b.zOrder ?? 0));

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={{ flex:1, backgroundColor:BG }}>

        {/* Toolbar */}
        <View style={[js.toolbar, { paddingTop: insets.top+6 }]}>
          <TouchableOpacity style={js.toolBtn} onPress={onClose} hitSlop={12}>
            <Ionicons name="chevron-down" size={22} color={MUTED} />
          </TouchableOpacity>
          <Text style={js.toolTitle}>OUTFIT JOURNAL</Text>
          <View style={js.toolRight}>
            <TouchableOpacity onPress={pickPhoto} hitSlop={10} style={js.toolIconBtn}>
              <Ionicons name="image-outline" size={21} color={MUTED} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openTextEditor('new')} hitSlop={10} style={js.toolIconBtn}>
              <Ionicons name="text-outline" size={20} color={MUTED} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} hitSlop={10} style={js.toolIconBtn}>
              <Ionicons name="arrow-down-circle-outline" size={22} color={DARK} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Canvas */}
        <KeyboardAvoidingView style={{ flex:1 }}
          behavior={Platform.OS==='ios'?'padding':'height'}
          keyboardVerticalOffset={TOOLBAR_H+insets.top}>
          <ScrollView ref={scrollRef} scrollEnabled={scrollEnabled}
            showsVerticalScrollIndicator={false} removeClippedSubviews={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ width:SCREEN_W }}>
            <View ref={canvasRef} collapsable={false}
              style={{ width:SCREEN_W, minHeight:CANVAS_H, backgroundColor:BG }}>

              <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1}
                onPress={() => setSelectedId(null)} />

              {/* Month header */}
              <View style={js.monthHdr} pointerEvents="box-none">
                <TouchableOpacity onPress={prevMonth} hitSlop={14} style={js.navBtn}>
                  <Ionicons name="chevron-back" size={22} color={MUTED} />
                </TouchableOpacity>
                <Text style={js.monthName} numberOfLines={1} adjustsFontSizeToFit>
                  {MONTH_NAMES[jMonth]}
                </Text>
                <TouchableOpacity onPress={nextMonth} hitSlop={14} style={js.navBtn}>
                  <Ionicons name="chevron-forward" size={22} color={MUTED} />
                </TouchableOpacity>
              </View>

              {/* Calendar grid */}
              <View style={js.calWrap} pointerEvents="none"
                onLayout={e => setCalGridH(e.nativeEvent.layout.height)}>
                <View style={js.hdrRow}>
                  {DAY_HDRS.map((d,i) => (
                    <View key={i} style={[js.hdrCell, i>0&&js.borderL]}>
                      <Text style={js.hdrTxt}>{d}</Text>
                    </View>
                  ))}
                </View>
                {rows.map((row,ri) => (
                  <View key={ri} style={js.dateRow}>
                    {row.map((day,ci) => {
                      const key   = day ? dateKey(day) : null;
                      const entry = key ? (entries[key]??null) : null;
                      const tod   = day && isToday(day);
                      return (
                        <View key={ci} style={[js.dateCell, ci>0&&js.borderL, tod&&js.todayCell]}>
                          {entry && <JCellThumb entry={entry} />}
                          <Text style={[js.dayNum, tod&&js.todayNum]}>{day??''}</Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>

              {/* Diary section */}
              <View style={[js.diarySection, { top:DIARY_TOP, height:DIARY_H }]} pointerEvents="box-none">
                <View style={js.diaryHdr} pointerEvents="none">
                  <View style={js.diaryHdrLine}/>
                  <Text style={js.diaryHdrTxt}>MY OUTFIT DIARY</Text>
                  <View style={js.diaryHdrLine}/>
                </View>
                {!capturing && !hasContent && (
                  <View style={js.emptyHint} pointerEvents="none">
                    <Ionicons name="book-outline" size={28} color="#D4C4B4" />
                    <Text style={js.emptyTxt}>
                      Add photos, text or stickers{'\n'}to start your journal
                    </Text>
                  </View>
                )}
              </View>

              {/* Canvas items */}
              {sortedItems.map(item => (
                <CanvasItem key={item.id} item={item}
                  isSelected={selectedId===item.id}
                  onSelect={() => handleSelect(item.id)}
                  onDelete={() => deleteItem(item.id)}
                  onSingleTap={() => handleSingleTap(item)}
                  onDoubleTap={() => handleDoubleTap(item)}
                  onLongPress={() => handleLongPress(item)}
                  onDragStart={() => {
                    scrollRef.current?.setNativeProps?.({scrollEnabled:false});
                    setScrollEnabled(false);
                  }}
                  onDragEnd={() => {
                    scrollRef.current?.setNativeProps?.({scrollEnabled:true});
                    setScrollEnabled(true);
                  }}
                  onTransformChange={t => handleTransformChange(item.id, t)}
                  onBringToFront={() => bringToFront(item.id)}
                  onSendToBack={() => sendToBack(item.id)}
                  capturing={capturing}
                />
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Sticker picker */}
        <View style={[js.pickerWrap, { paddingBottom: Math.max(insets.bottom,8) }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={js.catRow}>
            {STICKER_CATS.map(cat => (
              <TouchableOpacity key={cat.id}
                style={[js.catBtn, selectedCat===cat.id&&js.catBtnOn]}
                onPress={() => setSelectedCat(cat.id)}>
                <Text style={[js.catTxt, selectedCat===cat.id&&js.catTxtOn]}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={js.stickerRow}>
            {currentCat.items.map(item => (
              <TouchableOpacity key={item.id} style={js.stickerCell}
                onPress={() => item.type === 'image'
                  ? addItem('sticker', item.id, { stickerType: 'image' })
                  : addItem('sticker', item.emoji)
                } activeOpacity={0.65}>
                {item.type === 'image'
                  ? <Image source={STICKER_SOURCES[item.id]} style={js.stickerImgThumb} resizeMode="contain" />
                  : <Text style={js.stickerEmoji}>{item.emoji}</Text>
                }
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Text editor overlay */}
      {textEditor && (
        <TextEditorOverlay
          initialText={textEditor.text} initialFont={textEditor.font}
          initialColor={textEditor.color} initialBg={textEditor.bgStyle}
          onDone={handleTextDone} onCancel={() => setTextEditor(null)}
        />
      )}

      {/* Adjust photo overlay */}
      {adjustingItem && (
        <AdjustPhotoOverlay
          item={adjustingItem}
          onDone={handleAdjustDone}
          onCancel={() => setAdjustingItem(null)}
        />
      )}
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const cs = StyleSheet.create({
  itemWrap:    { position:'absolute' },
  selected:    { borderWidth:1.5, borderColor:'#C8B5A5', borderStyle:'dashed', borderRadius:6, padding:2 },
  stickerText: { fontSize:44, lineHeight:52 },
  stickerImg:  { width:100, height:100 },
  textBase:    { fontSize:18, maxWidth: SCREEN_W * 0.72 },
  deleteBtn:   { position:'absolute', top:-11, right:-11,
    backgroundColor:'rgba(242,237,232,0.94)', borderRadius:11 },
});

const cp = StyleSheet.create({
  sheet:    { backgroundColor:'#F2EDE8', borderTopLeftRadius:24, borderTopRightRadius:24,
    paddingTop:16, paddingHorizontal:28 },
  topBar:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
    marginBottom:20 },
  cancelTxt:{ fontFamily:MONO, fontSize:13, color:MUTED },
  doneTxt:  { fontFamily:MONO, fontSize:13, color:DARK, fontWeight:'700' },
  preview:  { width:36, height:36, borderRadius:18,
    borderWidth:2, borderColor:'rgba(0,0,0,0.12)' },
  strips:   { gap:8, paddingBottom:4 },
  label:    { fontFamily:MONO, fontSize:9, color:MUTED, letterSpacing:1.2, marginBottom:2 },
  indicator:{ position:'absolute', top:5, width:20, height:20,
    borderRadius:10, borderWidth:2.5, borderColor:'#FFFFFF',
    backgroundColor:'transparent',
    shadowColor:'#000', shadowOpacity:0.3, shadowRadius:3,
    shadowOffset:{width:0,height:1} },
});

const te = StyleSheet.create({
  topBar:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingHorizontal:20, paddingBottom:10 },
  teBtn:     { minWidth:64 },
  cancelTxt: { fontFamily:MONO, fontSize:13, color:MUTED },
  doneTxt:   { fontFamily:MONO, fontSize:13, color:DARK, fontWeight:'700', textAlign:'right' },
  styleBar:  { backgroundColor:'rgba(255,255,255,0.78)', borderTopWidth:1,
    borderTopColor:'#DDD5C8', paddingTop:12, gap:10 },
  fontRow:    { paddingHorizontal:16, gap:8, paddingBottom:2 },
  // Fixed height + no paddingVertical so button size never changes with font metrics
  fontBtn:    { paddingHorizontal:14, height:38, borderRadius:19, borderWidth:1,
    borderColor:'#C8BAA8', justifyContent:'center', alignItems:'center' },
  fontBtnOn:  { backgroundColor:DARK, borderColor:DARK },
  // Fixed lineHeight overrides per-font ascender/descender differences on iOS
  fontBtnTxt: { fontSize:13, lineHeight:17 },
  fontTxt:    { color:MUTED },
  fontTxtOn:  { color:'#F2EDE8' },
  colorRow:  { flexDirection:'row', paddingHorizontal:20, gap:10, alignItems:'center' },
  colorDot:  { width:28, height:28, borderRadius:14, justifyContent:'center', alignItems:'center' },
  colorDotLight:{ borderWidth:1, borderColor:'#C8BAA8' },
  colorDotRing: { borderWidth:2.5, borderColor:MUTED },
  colorCheck:   { width:10, height:10, borderRadius:5, backgroundColor:'rgba(0,0,0,0.25)' },
  paletteBtn:   { width:30, height:30, borderRadius:15, justifyContent:'center', alignItems:'center' },
  paletteBtnOn: { borderWidth:2.5, borderColor:MUTED },
  bgRow:    { flexDirection:'row', paddingHorizontal:16, gap:8, paddingBottom:4, flexWrap:'wrap' },
  bgBtn:    { paddingHorizontal:12, paddingVertical:6, borderRadius:20, borderWidth:1, borderColor:'#C8BAA8' },
  bgBtnNone:{ borderStyle:'dashed' },
  bgBtnOn:  { borderWidth:2, borderColor:DARK },
  bgTxt:    { fontFamily:MONO, fontSize:11, color:MUTED },
});

const ap = StyleSheet.create({
  topBar:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingHorizontal:24, paddingBottom:14,
    backgroundColor:'rgba(0,0,0,0.6)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor:'rgba(255,255,255,0.1)' },
  apBtn:     { minWidth:64 },
  cancelTxt: { fontFamily:MONO, fontSize:13, color:'rgba(255,255,255,0.65)' },
  doneTxt:   { fontFamily:MONO, fontSize:13, color:'#FFFFFF', fontWeight:'700', textAlign:'right' },
  titleTxt:  { fontFamily:MONO, fontSize:10, color:'rgba(255,255,255,0.55)', letterSpacing:1.6 },
  hint:      { marginTop:24, fontFamily:MONO, fontSize:10, color:'rgba(255,255,255,0.4)',
    letterSpacing:0.5 },
});

const js = StyleSheet.create({
  toolbar:  { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingBottom:10,
    backgroundColor:BG, borderBottomWidth:1, borderBottomColor:'#DDD5C8', minHeight:TOOLBAR_H },
  toolBtn:  { width:40, alignItems:'center' },
  toolTitle:{ flex:1, textAlign:'center', fontFamily:MONO, fontSize:10, color:MUTED,
    letterSpacing:1.8, fontWeight:'600' },
  toolRight:{ flexDirection:'row', alignItems:'center' },
  toolIconBtn:{ paddingHorizontal:7, paddingVertical:4 },

  monthHdr: { flexDirection:'row', alignItems:'center', height:MONTH_HDR_H, paddingHorizontal:8 },
  navBtn:   { padding:8 },
  monthName:{ flex:1, textAlign:'center', fontFamily:SERIF, fontSize:34, fontWeight:'700',
    color:DARK, letterSpacing:-0.5 },

  calWrap:  { paddingHorizontal:CAL_PAD },
  hdrRow:   { flexDirection:'row', borderBottomWidth:1.5, borderBottomColor:GRID },
  hdrCell:  { width:CELL_W, height:DAY_HDR_H, justifyContent:'center', alignItems:'center' },
  hdrTxt:   { fontFamily:MONO, fontSize:8, color:MUTED, fontWeight:'600', letterSpacing:0.2 },
  dateRow:  { flexDirection:'row', borderTopWidth:1.5, borderTopColor:GRID },
  dateCell: { width:CELL_W, height:CELL_H, overflow:'hidden', position:'relative', padding:2 },
  borderL:  { borderLeftWidth:1.5, borderLeftColor:GRID },
  todayCell:{ backgroundColor:'rgba(155,130,110,0.10)' },
  dayNum:   { fontFamily:MONO, fontSize:8, color:DARK, position:'absolute', top:2, left:3 },
  todayNum: { fontWeight:'700' },

  diarySection:{ position:'absolute', left:0, right:0, backgroundColor:DIARY_BG,
    borderTopWidth:1.5, borderTopColor:GRID, paddingHorizontal:18, paddingTop:12, overflow:'visible' },
  diaryHdr:    { flexDirection:'row', alignItems:'center', marginBottom:10, gap:8 },
  diaryHdrLine:{ flex:1, height:1, backgroundColor:'#D4C4B4' },
  diaryHdrTxt: { fontFamily:MONO, fontSize:9, color:MUTED, letterSpacing:1.6 },
  emptyHint:   { alignItems:'center', paddingTop:56, gap:10 },
  emptyTxt:    { fontFamily:MONO, fontSize:10, color:'#C4B4A4', textAlign:'center', lineHeight:16 },

  pickerWrap:  { backgroundColor:'#EDE8E0', borderTopWidth:1, borderTopColor:'#DDD5C8' },
  catRow:      { paddingHorizontal:12, paddingTop:10, paddingBottom:6, gap:6, flexDirection:'row' },
  catBtn:      { paddingHorizontal:14, paddingVertical:5, borderRadius:20, borderWidth:1,
    borderColor:'#C8BAA8', backgroundColor:'transparent' },
  catBtnOn:    { backgroundColor:DARK, borderColor:DARK },
  catTxt:      { fontFamily:MONO, fontSize:10, color:MUTED },
  catTxtOn:    { color:'#EDE8E0' },
  stickerRow:  { paddingHorizontal:12, paddingBottom:10, gap:8, flexDirection:'row' },
  stickerCell: { width:56, height:56, borderRadius:14,
    backgroundColor:'rgba(255,255,255,0.72)', justifyContent:'center', alignItems:'center' },
  stickerEmoji:    { fontSize:34 },
  stickerImgThumb: { width:46, height:46 },
});
