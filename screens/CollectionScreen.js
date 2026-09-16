import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList, Image,
  StyleSheet, Dimensions, Platform, Modal, TextInput,
  KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCollection, STYLE_CATEGORIES } from '../context/CollectionContext';

const BEIGE  = '#F2EDE8';
const DARK   = '#1A1108';
const MUTED  = '#9E8C7A';
const BORDER = '#E5DDD4';
const LABEL  = '#8A7F75';
const SERIF  = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO   = 'JetBrainsMono_400Regular';
const { width, height } = Dimensions.get('window');
const LOOK_W  = (width - 48 - 12) / 2;
const CARD_H  = LOOK_W * 1.2;
const ROW_W   = 346;
const ROW_H   = 100;
const LOOK_BG = ['#EDE9E4', '#E4E9ED', '#EDE4E9', '#E4EDE9', '#E9EDE4'];

function LookCardItems({ look }) {
  const items = (look.items ?? []).filter(ci => ci.uri);
  if (items.length === 0) return null;

  const PAD = 8;
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

  const contentW = (maxX - minX) || 82;
  const contentH = (maxY - minY) || 82;
  const ratio = Math.min((LOOK_W - PAD * 2) / contentW, (CARD_H - PAD * 2) / contentH);
  const base  = 82 * ratio;
  const dx    = (LOOK_W - contentW * ratio) / 2 - minX * ratio;
  const dy    = (CARD_H - contentH * ratio) / 2 - minY * ratio;

  return items.map(ci => (
    <Image
      key={ci.id}
      source={{ uri: ci.uri }}
      style={{
        position: 'absolute',
        width: base,
        height: base,
        left: (ci.x ?? 0) * ratio + dx,
        top:  (ci.y ?? 0) * ratio + dy,
        transform: [{ scale: ci.scale ?? 1 }],
      }}
      resizeMode="contain"
    />
  ));
}

function computePreviewLayout(look) {
  const items = (look.items ?? []).filter(ci => ci.uri);
  const PAD = 28;
  const maxW = width - 32;
  const maxH = height * 0.80;

  if (items.length === 0) return { containerW: 160, containerH: 160, ratio: 1, dx: PAD, dy: PAD };

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

  const contentW = (maxX - minX) || 82;
  const contentH = (maxY - minY) || 82;
  const ratio = Math.min((maxW - PAD * 2) / contentW, (maxH - PAD * 2) / contentH);
  const containerW = contentW * ratio + PAD * 2;
  const containerH = contentH * ratio + PAD * 2;
  const dx = PAD - minX * ratio;
  const dy = PAD - minY * ratio;

  return { containerW, containerH, ratio, dx, dy };
}

function PreviewItems({ look, layout }) {
  const items = (look.items ?? []).filter(ci => ci.uri);
  const { ratio, dx, dy } = layout;
  const base = 82 * ratio;

  return items.map(ci => (
    <Image
      key={ci.id}
      source={{ uri: ci.uri }}
      style={{
        position: 'absolute',
        width: base,
        height: base,
        left: (ci.x ?? 0) * ratio + dx,
        top:  (ci.y ?? 0) * ratio + dy,
        transform: [{ scale: ci.scale ?? 1 }],
      }}
      resizeMode="contain"
    />
  ));
}

export default function CollectionScreen() {
  const [view, setView]         = useState('list');
  const [selCat, setSelCat]     = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [previewItem, setPreviewItem] = useState(null);

  const { looks, updateLook, removeLook } = useCollection();

  const totalLooks = Object.values(looks).reduce((sum, arr) => sum + arr.length, 0);
  const lookCount  = (catId) => looks[catId]?.length ?? 0;

  const openDetail = (cat) => { setSelCat(cat); setView('detail'); };
  const goBack     = ()    => { setView('list'); setSelCat(null); };

  const openEdit = (look) => {
    setEditItem(look);
    setEditLabel(look.label);
    setEditModal(true);
  };

  const saveLabel = () => {
    if (!editItem) return;
    updateLook(selCat.id, editItem.id, { label: editLabel.trim() || editItem.label });
    setEditModal(false);
  };

  const deleteLook = () => {
    if (!editItem) return;
    removeLook(selCat.id, editItem.id);
    setEditModal(false);
  };

  // ── LIST VIEW ─────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.listHeader}>
          <View>
            <Text style={styles.chapter}>Chapter . II</Text>
            <Text style={styles.pageTitle}>Collection</Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalNum}>{totalLooks}</Text>
            <Text style={styles.totalLabel}>SAVED LOOKS</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          {STYLE_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={styles.catRow}
              onPress={() => openDetail(cat)}
              activeOpacity={0.82}
            >
              <View style={[styles.catSwatch, { backgroundColor: cat.color }]} />
              <Text style={styles.catName}>{cat.name}</Text>
              <Text style={styles.catCount}>{lookCount(cat.id)} looks</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── DETAIL VIEW ───────────────────────────────────────────────
  const catLooks = looks[selCat?.id] ?? [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: selCat?.color ?? BEIGE }]} edges={['top']}>
      <View style={[styles.detailHeader, { backgroundColor: selCat?.color ?? BEIGE }]}>
        <TouchableOpacity onPress={goBack} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={DARK} />
        </TouchableOpacity>
        <Text style={styles.detailTitle}>{selCat?.name}</Text>
        <Text style={styles.detailCount}>{catLooks.length} LOOKS</Text>
      </View>

      <View style={styles.detailContent}>
        {catLooks.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={44} color={BORDER} />
            <Text style={styles.emptyTitle}>還沒有收藏的穿搭</Text>
            <Text style={styles.emptySub}>在 Match 頁按星星即可收藏</Text>
          </View>
        ) : (
          <FlatList
            data={catLooks}
            keyExtractor={l => l.id}
            numColumns={2}
            columnWrapperStyle={styles.lookRow}
            contentContainerStyle={styles.lookGrid}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <View style={styles.lookItem}>
                {/* Card — tap to preview */}
                <TouchableOpacity
                  style={[styles.lookCard, { backgroundColor: item.bg ?? LOOK_BG[index % LOOK_BG.length] }]}
                  onPress={() => setPreviewItem(item)}
                  activeOpacity={0.9}
                >
                  <LookCardItems look={item} />
                  {/* ⋯ button — tap to edit, does NOT bubble to card press */}
                  <TouchableOpacity
                    style={styles.moreBtn}
                    hitSlop={8}
                    onPress={() => openEdit(item)}
                  >
                    <Ionicons name="ellipsis-horizontal" size={14} color={MUTED} />
                  </TouchableOpacity>
                </TouchableOpacity>
                <Text style={styles.lookLabel}>{item.label}</Text>
              </View>
            )}
          />
        )}
      </View>

      {/* ── Edit bottom sheet ── */}
      <Modal visible={editModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setEditModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.editSheet}>
                  <Text style={styles.editTitle}>編輯搭配</Text>
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
                  <TouchableOpacity style={styles.editDeleteBtn} onPress={deleteLook}>
                    <Text style={styles.editDeleteTxt}>刪除這個搭配</Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Full-screen preview ── */}
      <Modal visible={!!previewItem} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setPreviewItem(null)}>
          <View style={styles.previewOverlay}>
            <TouchableWithoutFeedback>
              <View>
                {previewItem && (() => {
                  const layout = computePreviewLayout(previewItem);
                  return (
                    <View style={[styles.previewCanvas, { width: layout.containerW, height: layout.containerH }]}>
                      <PreviewItems look={previewItem} layout={layout} />
                    </View>
                  );
                })()}
              </View>
            </TouchableWithoutFeedback>
            <Text style={styles.previewHint}>點任何地方關閉</Text>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BEIGE },

  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 14,
  },
  chapter: { fontSize: 11, color: MUTED, letterSpacing: 0.8, marginBottom: 2 },
  pageTitle: { fontFamily: SERIF, fontSize: 38, fontWeight: '700', color: DARK, lineHeight: 42 },
  totalBox: { alignItems: 'flex-end', paddingBottom: 4 },
  totalNum: { fontFamily: SERIF, fontSize: 20, fontWeight: '700', color: DARK, lineHeight: 22 },
  totalLabel: { fontFamily: MONO, fontSize: 8, color: MUTED, letterSpacing: 1.2 },
  divider: { height: 1, backgroundColor: BORDER, marginHorizontal: 22, marginBottom: 10 },

  listContent: { paddingTop: 14, paddingBottom: 32, gap: 20, alignItems: 'center' },
  catRow: {
    width: ROW_W, height: ROW_H,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 4,
  },
  catSwatch: { width: 45, height: 45, borderRadius: 11, marginRight: 18 },
  catName: { flex: 1, fontFamily: MONO, fontSize: 13, color: LABEL },
  catCount: { fontFamily: MONO, fontSize: 11, color: LABEL },

  detailHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 18, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1, shadowRadius: 3, elevation: 6, zIndex: 10,
  },
  detailContent: { flex: 1, backgroundColor: BEIGE },
  detailTitle: { fontFamily: SERIF, fontSize: 34, fontWeight: '700', color: DARK, flex: 1 },
  detailCount: { fontFamily: MONO, fontSize: 11, color: MUTED, letterSpacing: 1.5 },

  lookGrid: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 32, gap: 20 },
  lookRow: { gap: 12 },
  lookItem: { width: LOOK_W },
  lookCard: {
    width: LOOK_W, height: CARD_H,
    borderRadius: 16, overflow: 'hidden',
    shadowColor: '#8C7B6A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 2, marginBottom: 6,
  },
  moreBtn: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
  },
  lookLabel: { fontSize: 13, color: DARK, fontWeight: '400', paddingHorizontal: 2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60 },
  emptyTitle: { fontFamily: SERIF, fontSize: 18, color: MUTED, marginTop: 8 },
  emptySub: { fontSize: 13, color: MUTED, opacity: 0.7 },

  // Edit bottom sheet (same style as Closet)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  editSheet: {
    backgroundColor: BEIGE, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  editTitle: { fontSize: 15, fontWeight: '700', color: DARK, marginBottom: 16, textAlign: 'center' },
  editInput: {
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, color: DARK, marginBottom: 14, backgroundColor: '#FDF8F2',
  },
  editSaveBtn: {
    backgroundColor: DARK, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginBottom: 10,
  },
  editSaveTxt: { fontSize: 15, color: BEIGE, fontWeight: '700' },
  editDeleteBtn: { paddingVertical: 14, alignItems: 'center' },
  editDeleteTxt: { fontSize: 14, color: '#C0392B', fontWeight: '600' },

  // Full-screen preview
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  previewCanvas: {
    backgroundColor: '#FAFAF8',
    borderRadius: 20,
    overflow: 'hidden',
  },
  previewHint: {
    fontFamily: MONO,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
});
