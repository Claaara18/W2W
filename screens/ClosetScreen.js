import React, { useState } from 'react';
import { useWardrobe } from '../context/WardrobeContext';
import CollectionScreen from './CollectionScreen';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList,
  StyleSheet, Dimensions, Modal, Image, Platform, Alert,
  ActivityIndicator, TextInput, KeyboardAvoidingView,
  TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

// ⚠️  TEST ONLY — EXPO_PUBLIC_ vars are bundled into the app binary.
// For production, move this call to a Firebase Cloud Function.

// ── Theme ────────────────────────────────────────────────────
const BEIGE  = '#F5EFE6';
const DARK   = '#1A1108';
const MUTED  = '#9E8C7A';
const BORDER = '#E0D5C5';
const SERIF  = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const { width } = Dimensions.get('window');
const ITEM_W = (width - 40 - 12) / 2;

// ── Category illustration images ──────────────────────────────
// Save your images to assets/clothing/ with these exact filenames:
//   tshirts.png  →  sage green crop top
//   jackets.png  →  pink jacket
//   skirts.png   →  dark navy skirt
//   pants.png    →  light blue jeans
//   dresses.png  →  yellow sundress
const CLOTHING_IMAGES = {
  tshirts: require('../assets/clothing/T-shirt.png'),
  jackets: require('../assets/clothing/Jacket.png'),
  skirts:  require('../assets/clothing/Skirts.png'),
  pants:   require('../assets/clothing/Pants.png'),
  dresses: require('../assets/clothing/Dress.png'),
};

// ── Card dimensions ──────────────────────────────────────────
const CARD_W = 354;
const CARD_H = 200;
const IMG_SIZE = CARD_H;
const MONO = 'JetBrainsMono_400Regular';
const LABEL_COLOR = '#8C8A6E';

// ── Categories ───────────────────────────────────────────────
// imgOffsetX: positive = right, imgOffsetY: positive = down (in pre-scale coords)
const CATEGORIES = [
  { id: 'tshirts', num: 'NO. 01', name: 'T-shirts', color: '#E8E2C8', stroke: '#848172', imgScale: 2.85, imgOffsetX: 10, imgOffsetY: 42 },
  { id: 'jackets', num: 'NO. 02', name: 'Jackets',  color: '#E8C8C9', stroke: '#9A898F', imgScale: 2.3,  imgOffsetX: 15, imgOffsetY: 15 },
  { id: 'skirts',  num: 'NO. 03', name: 'Skirts',   color: '#C8D2E8', stroke: '#9298A7', imgScale: 2.0,  imgOffsetX: 12, imgOffsetY: 20 },
  { id: 'pants',   num: 'NO. 04', name: 'Pants',    color: '#C8DDE8', stroke: '#9AA2AC', imgScale: 2.0,  imgOffsetX: 0,  imgOffsetY: 0  },
  { id: 'dresses', num: 'NO. 05', name: 'Dresses',  color: '#E8DCC8', stroke: '#A29E8E', imgScale: 1.7,  imgOffsetX: 0,  imgOffsetY: 38 },
];

// ── Background removal ────────────────────────────────────────
// Default: HuggingFace RMBG-1.4 Gradio Space (free, no key needed)
// Better:  fill REMOVE_BG_API_KEY (remove.bg free → 50 credits/month)

const SPACE = 'https://briaai-rmbg-1-4.hf.space';

const saveBase64 = async (b64) => {
  const dest = `${FileSystem.documentDirectory}item_${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(dest, b64, { encoding: 'base64' });
  return dest;
};

// Convert ArrayBuffer to base64 — more reliable than FileReader in React Native
const abToBase64 = (ab) => {
  const bytes = new Uint8Array(ab);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

const fetchImageAsBase64 = async (url) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  const ab = await res.arrayBuffer();
  return abToBase64(ab);
};

const handleGradioOutput = async (output) => {
  if (!output) return null;
  // data-URL string
  if (typeof output === 'string' && output.startsWith('data:image')) {
    return saveBase64(output.split(',')[1]);
  }
  // Dict with url or path
  const imgUrl = output?.url
    ?? (output?.path ? `${SPACE}/file=${output.path}` : null);
  if (!imgUrl) return null;
  const b64 = await fetchImageAsBase64(imgUrl);
  return b64 ? saveBase64(b64) : null;
};

const removeBackground = async (uri) => removeWithRemoveBg(uri);

// Free — HuggingFace RMBG-1.4 (supports both Gradio 3 and Gradio 4 API)
const removeWithHuggingFace = async (uri) => {
  try {
    // 1. Upload image to space
    const form = new FormData();
    form.append('files', { uri, name: 'image.jpg', type: 'image/jpeg' });
    const upRes = await fetch(`${SPACE}/upload`, { method: 'POST', body: form });
    if (!upRes.ok) return null;  // null = failed, caller handles
    const paths = await upRes.json();
    if (!paths?.[0]) return null;

    const imgData = { path: paths[0], orig_name: 'image.jpg', mime_type: 'image/jpeg', size: null };
    const sessionHash = Math.random().toString(36).slice(2, 10);

    // 2a. Gradio 4 — /call/predict (SSE-based)
    const g4Res = await fetch(`${SPACE}/call/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [imgData], session_hash: sessionHash }),
    }).catch(() => null);

    if (g4Res?.ok) {
      const { event_id } = await g4Res.json();
      if (event_id) {
        const sseRes = await fetch(`${SPACE}/call/predict/${event_id}`);
        const text = await sseRes.text();
        // Parse SSE: find last "data: [...]" line
        const dataLines = text.split('\n').filter(l => l.startsWith('data: '));
        for (let i = dataLines.length - 1; i >= 0; i--) {
          try {
            const parsed = JSON.parse(dataLines[i].slice(6));
            if (Array.isArray(parsed)) {
              const result = await handleGradioOutput(parsed[0]);
              if (result) return result;
              break;
            }
          } catch {}
        }
      }
    }

    // 2b. Gradio 3 fallback — /run/predict
    const g3Res = await fetch(`${SPACE}/run/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [imgData], session_hash: sessionHash }),
    }).catch(() => null);

    if (g3Res?.ok) {
      const json = await g3Res.json();
      const result = await handleGradioOutput(json?.data?.[0]);
      if (result) return result;
    }

    return null; // all methods failed
  } catch (e) {
    console.warn('HF bg removal error:', e?.message);
    return null;
  }
};

// remove.bg — base64 JSON（RN 0.76+ 不再支援 FormData { uri } 物件）
const removeWithRemoveBg = async (uri) => {
  const apiKey = process.env.EXPO_PUBLIC_REMOVE_BG_API_KEY;
  if (!apiKey) throw new Error('REMOVE_BG_API_KEY 未設定（請檢查 .env.local）');

  console.log('[remove.bg] 開始去背，uri:', uri);

  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  console.log('[remove.bg] 圖片轉 base64 完成，length:', base64.length);

  console.log('[remove.bg] 送出 POST /v1.0/removebg');
  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_file_b64: base64,
      size: 'auto',
      format: 'png',
      type: 'product',
      crop: 'true',
    }),
  });

  console.log('[remove.bg] HTTP status:', res.status);

  if (!res.ok) {
    let errBody = '';
    try { errBody = await res.text(); } catch {}
    console.error('[remove.bg] 錯誤 body:', errBody);
    const msg = {
      400: `請求格式錯誤：${errBody}`,
      401: 'API Key 無效或未設定',
      402: '帳戶額度不足（本月免費額度已用完）',
      403: '沒有權限',
      429: '呼叫頻率超限，請稍後再試',
      500: `remove.bg 伺服器錯誤：${errBody}`,
    };
    throw new Error(msg[res.status] ?? `remove.bg 回傳 ${res.status}：${errBody}`);
  }

  console.log('[remove.bg] 成功，讀取 binary...');
  const ab = await res.arrayBuffer();
  console.log('[remove.bg] 收到', ab.byteLength, 'bytes');

  const b64 = abToBase64(ab);
  const dest = await saveBase64(b64);
  console.log('[remove.bg] 去背 PNG 儲存至：', dest);
  return dest;
};

// ─────────────────────────────────────────────────────────────
export default function ClosetScreen() {
  const [view, setView]             = useState('list');   // 'list' | 'detail'
  const [selCat, setSelCat]         = useState(null);
  const [showCollection, setShowCollection] = useState(false);
  const { items, addItem, updateItem, removeItem } = useWardrobe();

  // Modals
  const [editModal, setEditModal] = useState(false);   // edit item
  const [editItem, setEditItem]   = useState(null);    // { catId, item }
  const [editLabel, setEditLabel] = useState('');

  // ── helpers ────────────────────────────────────────────────
  const pieceCount = (catId) => items[catId]?.length ?? 0;

  const openDetail = (cat) => { setSelCat(cat); setView('detail'); };
  const goBack     = ()    => { setView('list'); setSelCat(null); };

  // ── image flow ─────────────────────────────────────────────
  // targetCatId: if set, saves directly to that category; if null, shows category picker
  const onCameraPress = (targetCatId = null) => {
    Alert.alert(
      '新增單品',
      undefined,
      [
        { text: '拍照',       onPress: () => pickImage('camera',  targetCatId) },
        { text: '從相簿選取', onPress: () => pickImage('library', targetCatId) },
        { text: '取消', style: 'cancel' },
      ]
    );
  };

  const pickImage = async (source, targetCatId) => {
    await new Promise(r => setTimeout(r, 300));
    try {
      const { status } = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          '需要權限',
          source === 'camera'
            ? '請到設定 > W2W > 開啟相機權限'
            : '請到設定 > W2W > 開啟照片權限',
          [{ text: '好' }]
        );
        return;
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.85,
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            selectionLimit: 10,
          });

      if (result.canceled) return;
      const uris = result.assets.map(a => a.uri);

      if (targetCatId) {
        processAndAdd(targetCatId, uris);
      } else {
        // wait for image picker to fully dismiss before showing Alert
        await new Promise(r => setTimeout(r, 600));
        const msg = uris.length > 1 ? `已選取 ${uris.length} 張，加入哪個類別？` : '加入哪個類別？';
        Alert.alert('選擇類別', msg, [
          ...CATEGORIES.map(cat => ({
            text: cat.name,
            onPress: () => { processAndAdd(cat.id, uris); openDetail(cat); },
          })),
          { text: '取消', style: 'cancel' },
        ]);
      }
    } catch (e) {
      Alert.alert('發生錯誤', e.message ?? '請重試');
    }
  };

  const processAndAdd = async (catId, uris) => {
    const baseCount = items[catId]?.length ?? 0;
    const errors = [];
    let added = 0;
    for (let i = 0; i < uris.length; i++) {
      const ts = Date.now() + i;
      try {
        const processedUri = await removeBackground(uris[i]);
        addItem(catId, {
          id: `${catId}_${ts}`,
          uri: processedUri,
          label: `look ${baseCount + added + 1}`,
        });
        added++;
      } catch (err) {
        console.error(`[processAndAdd] 第 ${i + 1} 張失敗：`, err.message);
        errors.push(`第 ${i + 1} 張：${err.message}`);
      }
    }
    if (errors.length > 0) {
      Alert.alert('去背失敗', errors.join('\n\n'));
    }
  };

  // ── edit / delete ───────────────────────────────────────────
  const openEditModal = (item) => {
    setEditItem(item);
    setEditLabel(item.label);
    setEditModal(true);
  };

  const saveLabel = () => {
    if (!editItem) return;
    updateItem(editItem.catId, editItem.id, { label: editLabel.trim() || editItem.label });
    setEditModal(false);
  };

  const deleteItem = () => {
    if (!editItem) return;
    removeItem(editItem.catId, editItem.id);
    setEditModal(false);
  };

  if (showCollection) {
    return <CollectionScreen onBack={() => setShowCollection(false)} />;
  }

  // ── ─────────────────────────────────────────────────────────
  // RENDER: List view
  // ── ─────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={styles.listHeader}>
          <Text style={styles.pageTitle}>Closet</Text>
          <TouchableOpacity
            onPress={() => setShowCollection(true)}
            hitSlop={12}
            style={styles.collectionBtn}
          >
            <Ionicons name="heart" size={26} color="#A99A8A" />
          </TouchableOpacity>
        </View>
        <View style={styles.divider} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 16, gap: 14 }}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryCard, { backgroundColor: cat.color, borderColor: cat.stroke }]}
              onPress={() => openDetail(cat)}
              activeOpacity={0.85}
            >
              {/* Left: text */}
              <View style={styles.cardLeft}>
                <View>
                  <Text style={styles.cardNum}>{cat.num}</Text>
                  <Text style={styles.cardName} numberOfLines={1} adjustsFontSizeToFit>{cat.name}</Text>
                  <Text style={styles.cardCount}>{pieceCount(cat.id)} PIECES</Text>
                </View>
                <Text style={styles.openDrawer}>OPEN DRAWER  ›</Text>
              </View>

              {/* Right: clothing image */}
              <View style={styles.cardImageWrapper}>
                <Image
                  source={CLOTHING_IMAGES[cat.id]}
                  style={[styles.cardImage, {
                    transform: [
                      { scale: cat.imgScale },
                      { translateX: cat.imgOffsetX },
                      { translateY: cat.imgOffsetY },
                    ],
                  }]}
                  resizeMode="contain"
                />
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 16 }} />
        </ScrollView>

      </SafeAreaView>
    );
  }

  // ── ─────────────────────────────────────────────────────────
  // RENDER: Detail view
  // ── ─────────────────────────────────────────────────────────
  const catItems = items[selCat?.id] ?? [];
  const gridData = [{ id: '__add__' }, ...catItems]; // first cell = add button

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={goBack} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={DARK} />
        </TouchableOpacity>
        <Text style={styles.detailTitle}>{selCat?.name}</Text>
        <Text style={styles.detailCount}>{catItems.length} PIECES</Text>
      </View>
      <View style={styles.divider} />

      <FlatList
        data={gridData}
        keyExtractor={i => i.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          // Add button cell
          if (item.id === '__add__') {
            return (
              <TouchableOpacity
                style={styles.addCell}
                onPress={() => onCameraPress(selCat?.id)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={32} color={MUTED} />
                <Text style={styles.addCellText}>新增單品</Text>
              </TouchableOpacity>
            );
          }
          // Clothing item cell
          return (
            <TouchableOpacity
              style={styles.itemCell}
              onPress={() => openEditModal({ ...item, catId: selCat.id })}
              activeOpacity={0.85}
            >
              <Image source={{ uri: item.uri }} style={styles.itemImage} resizeMode="contain" />
              <Text style={styles.itemLabel}>{item.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Edit modal */}
      <Modal visible={editModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setEditModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.editSheet}>
                  <Text style={styles.editTitle}>編輯單品</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editLabel}
                    onChangeText={setEditLabel}
                    placeholder="名稱"
                    placeholderTextColor={MUTED}
                    autoFocus
                  />
                  <TouchableOpacity style={styles.editSaveBtn} onPress={saveLabel}>
                    <Text style={styles.editSaveTxt}>儲存</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editDeleteBtn} onPress={deleteItem}>
                    <Text style={styles.editDeleteTxt}>刪除這件衣服</Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────
const ProcessingOverlay = () => (
  <View style={styles.overlay}>
    <View style={styles.overlayBox}>
      <ActivityIndicator size="large" color={DARK} />
      <Text style={styles.overlayText}>AI 去背中…</Text>
    </View>
  </View>
);

const CategoryModal = ({ visible, onClose, onSelect }) => (
  <Modal visible={visible} transparent animationType="fade">
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableWithoutFeedback>
          <View style={styles.catSheet}>
            <Text style={styles.srcTitle}>選擇要加入的類別</Text>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.catRow}
                onPress={() => onSelect(cat)}
              >
                <Text style={styles.catEmoji}>{cat.emoji}</Text>
                <Text style={styles.catRowName}>{cat.name}</Text>
                <Ionicons name="chevron-forward" size={16} color={MUTED} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.srcCancelBtn} onPress={onClose}>
              <Text style={styles.srcCancelTxt}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  </Modal>
);

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BEIGE },

  // List header
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  chapter: {
    fontSize: 11,
    color: MUTED,
    letterSpacing: 1,
    marginBottom: 4,
  },
  pageTitle: {
    fontFamily: SERIF,
    fontSize: 36,
    fontWeight: '700',
    color: DARK,
  },
  collectionBtn: {
    paddingBottom: 4,
  },
  cameraCircle: {
    width: 40, height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: DARK,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 20,
    marginBottom: 4,
  },

  // Category card
  categoryCard: {
    width: CARD_W,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    height: CARD_H,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  cardLeft: {
    flex: 1,
    paddingLeft: 18,
    paddingTop: 16,
    paddingBottom: 16,
    justifyContent: 'space-between',
  },
  cardNum: {
    fontFamily: MONO,
    fontSize: 9,
    color: LABEL_COLOR,
    letterSpacing: 1,
    marginBottom: 3,
  },
  cardName: {
    fontFamily: SERIF,
    fontSize: 30,
    fontWeight: '700',
    color: DARK,
    lineHeight: 34,
    marginBottom: 3,
    flexShrink: 1,
  },
  cardCount: {
    fontFamily: MONO,
    fontSize: 9,
    color: LABEL_COLOR,
    letterSpacing: 1,
  },
  openDrawer: {
    fontFamily: MONO,
    fontSize: 10,
    color: LABEL_COLOR,
    letterSpacing: 0.5,
  },
  cardImageWrapper: {
    width: IMG_SIZE,
    height: IMG_SIZE,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  cardImage: {
    width: IMG_SIZE,
    height: IMG_SIZE,
  },

  // Detail header
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
  },
  detailTitle: {
    fontFamily: SERIF,
    fontSize: 28,
    fontWeight: '700',
    color: DARK,
    flex: 1,
  },
  detailCount: {
    fontSize: 10,
    color: MUTED,
    letterSpacing: 1.5,
    fontWeight: '600',
  },

  // Grid
  gridContent: { padding: 20, paddingTop: 16 },
  row: { gap: 12, marginBottom: 20 },

  // Item cell
  itemCell: { width: ITEM_W },
  itemImage: {
    width: ITEM_W,
    height: ITEM_W * 1.15,
    borderRadius: 14,
    backgroundColor: '#F0EAE0',
    marginBottom: 6,
  },
  itemLabel: {
    fontSize: 12,
    color: DARK,
    fontWeight: '500',
  },

  // Add cell
  addCell: {
    width: ITEM_W,
    height: ITEM_W * 1.15,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  addCellText: {
    fontSize: 12,
    color: MUTED,
  },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  overlayBox: {
    backgroundColor: BEIGE,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 14,
  },
  overlayText: {
    fontSize: 14,
    color: DARK,
    fontWeight: '600',
  },

  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },

  // Source sheet
  srcSheet: {
    backgroundColor: BEIGE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  srcTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: DARK,
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  srcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  srcBtnTxt: {
    fontSize: 16,
    color: DARK,
    fontWeight: '500',
  },
  srcDivider: {
    height: 1,
    backgroundColor: BORDER,
  },
  srcCancelBtn: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#EDE7DC',
    borderRadius: 12,
  },
  srcCancelTxt: {
    fontSize: 15,
    color: MUTED,
    fontWeight: '600',
  },

  // Category sheet
  catSheet: {
    backgroundColor: BEIGE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  catEmoji: { fontSize: 22 },
  catRowName: {
    flex: 1,
    fontSize: 16,
    color: DARK,
    fontWeight: '500',
  },

  // Edit sheet
  editSheet: {
    backgroundColor: BEIGE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  editTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: DARK,
    marginBottom: 16,
    textAlign: 'center',
  },
  editInput: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: DARK,
    marginBottom: 14,
    backgroundColor: '#FDF8F2',
  },
  editSaveBtn: {
    backgroundColor: DARK,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  editSaveTxt: { fontSize: 15, color: BEIGE, fontWeight: '700' },
  editDeleteBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  editDeleteTxt: { fontSize: 14, color: '#C0392B', fontWeight: '600' },
});
