import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList, Image,
  StyleSheet, Dimensions, Platform, Modal, TextInput,
  KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Animated, Easing,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useCollection } from '../context/CollectionContext';
import { useWardrobe } from '../context/WardrobeContext';

const BEIGE  = '#F3EEE5';
const DARK   = '#1A120B';
const MUTED  = '#8C7758';
const LABEL  = '#7A6650';
const LINE   = '#C9B9A6';
const CARD   = '#FBF9F5';
const CARD_LINE = '#E6DCCD';
const SERIF  = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO   = 'JetBrainsMono_400Regular';
const { width, height } = Dimensions.get('window');
const LOOK_W  = (width - 48 - 12) / 2;
const CARD_H  = LOOK_W * 1.2;
const MONTHS  = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// "2 LOOKS · LATEST NOV 22" — the date only counts looks that carry savedAt
function catSummary(catLooks) {
  if (catLooks.length === 0) return '還沒有收藏';
  const count = `${catLooks.length} ${catLooks.length === 1 ? 'LOOK' : 'LOOKS'}`;
  const latest = Math.max(0, ...catLooks.map(l => (typeof l.savedAt === 'number' ? l.savedAt : 0)));
  if (!latest) return count;
  const d = new Date(latest);
  return `${count} · LATEST ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const DANGER = '#B5473A';
const MONTHS_TITLE = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ITEM_TAGS = { tshirts: 'TOP', jackets: 'JACKET', skirts: 'SKIRT', pants: 'PANTS', dresses: 'DRESS' };

const hasSavedAt  = (look) => typeof look?.savedAt === 'number';
const customLabel = (look) => (typeof look?.label === 'string' && look.label.trim() ? look.label.trim() : null);

// Custom label wins; otherwise the save date ("Nov 22"); old looks without savedAt keep their old label
function lookName(look) {
  const label = customLabel(look);
  if (label) return label;
  if (hasSavedAt(look)) {
    const d = new Date(look.savedAt);
    return `${MONTHS_TITLE[d.getMonth()]} ${d.getDate()}`;
  }
  return look?.label ?? '';
}

// Newest first; looks without savedAt keep their stored order at the end
function sortLooks(arr) {
  return arr
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const ta = hasSavedAt(a.l) ? a.l.savedAt : -1;
      const tb = hasSavedAt(b.l) ? b.l.savedAt : -1;
      return tb - ta || a.i - b.i;
    })
    .map(x => x.l);
}

// Saved look items only keep the wardrobe id (Match adds "_n" or "shake_…_ts_i" around it)
function itemTagFinder(wardrobe) {
  const byId = {}, byUri = {};
  Object.keys(wardrobe ?? {}).forEach(catId => {
    (Array.isArray(wardrobe[catId]) ? wardrobe[catId] : []).forEach(w => {
      if (w?.id != null) byId[String(w.id)] = catId;
      if (w?.uri) byUri[w.uri] = catId;
    });
  });
  return (ci) => {
    const id = String(ci?.id ?? '');
    const shake = id.match(/^shake_(.+)_\d+_\d+$/);
    const catId = byId[id]
      ?? (shake && byId[shake[1]])
      ?? byId[id.replace(/_\d+$/, '')]
      ?? byUri[ci?.uri];
    return catId ? (ITEM_TAGS[catId] ?? catId.toUpperCase()) : null;
  };
}

// "TOP · JACKET · SKIRT"; a custom name gets the date in front ("NOV 22 · TOP · SKIRT")
function lookMeta(look, tagOf) {
  const tags = (look?.items ?? []).map(tagOf).filter(Boolean);
  const n = (look?.items ?? []).length;
  const parts = tags.length ? [tags.join(' · ')] : (n ? [`${n} ${n === 1 ? 'ITEM' : 'ITEMS'}`] : []);
  if (customLabel(look) && hasSavedAt(look)) {
    const d = new Date(look.savedAt);
    parts.unshift(`${MONTHS[d.getMonth()]} ${d.getDate()}`);
  }
  return parts.join(' · ');
}

// Fade-in + lift on entering a category; cards mounted later (scrolling) just appear
function CardRise({ index, animate, children }) {
  const v = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    const a = Animated.timing(v, {
      toValue: 1, duration: 380, delay: Math.min(index, 12) * 40,
      easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return <Animated.View style={{ opacity: v, transform: [{ translateY }] }}>{children}</Animated.View>;
}

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

export default function CollectionScreen({ onBack } = {}) {
  const [view, setView]         = useState('list');
  const [selCatId, setSelCatId] = useState(null);
  // Detail bottom sheet: { mode: 'look'|'rename'|'move', look } or { mode: 'renameCat' }
  const [sheet, setSheet]       = useState(null);
  const [sheetText, setSheetText] = useState('');
  const [confirmDel, setConfirmDel]       = useState(false);   // look delete, 2nd tap
  const [confirmCatDel, setConfirmCatDel] = useState(false);   // category delete, 2nd tap
  const [previewItem, setPreviewItem] = useState(null);
  const [addSheet, setAddSheet] = useState(false);
  const [newName, setNewName]   = useState('');
  const [toast, setToast]       = useState(null);
  const toastTimer = useRef(null);

  const {
    looks, categories, addCategory, updateLook, removeLook,
    renameCategory, deleteCategory, moveLook,
  } = useCollection();
  const { items: wardrobe } = useWardrobe();
  const navigation = useNavigation();
  const enterAt = useRef(0);   // cards mounted within ~600ms of entering animate in

  const catLooksOf = (catId) => (Array.isArray(looks[catId]) ? looks[catId] : []);
  const totalLooks = categories.reduce((sum, c) => sum + catLooksOf(c.id).length, 0);

  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  const openAddSheet = () => { setNewName(''); setAddSheet(true); };
  const submitNewCat = () => {
    const name = newName.trim();
    if (!name) return;
    const cat = addCategory(name);
    if (!cat) { showToast(`已經有 ${name} 了`); return; }
    setAddSheet(false);
    showToast(`已新增 ${cat.name}`);
  };

  const openDetail = (cat) => {
    enterAt.current = Date.now();
    setSelCatId(cat.id);
    setConfirmCatDel(false);
    setView('detail');
  };
  const goBack = () => { setView('list'); setSelCatId(null); setSheet(null); setConfirmCatDel(false); };

  const openSheet = (next, text = '') => { setSheet(next); setSheetText(text); setConfirmDel(false); };
  const closeSheet = () => { Keyboard.dismiss(); setSheet(null); setConfirmDel(false); };

  const selCat = categories.find(c => c.id === selCatId) ?? null;

  const saveLookName = () => {
    const look = sheet?.look;
    if (!look || !selCat) return;
    const name = sheetText.trim();
    // Blank goes back to showing the date; old looks without a date keep their old label
    if (!name && !hasSavedAt(look)) { closeSheet(); return; }
    updateLook(selCat.id, look.id, { label: name || null });
    closeSheet();
    showToast('已改名稱');
  };

  const moveTo = (cat) => {
    const look = sheet?.look;
    if (!look || !selCat || cat.id === selCat.id) return;
    moveLook(selCat.id, cat.id, look.id);
    closeSheet();
    showToast(`已移到 ${cat.name}`);
  };

  const deleteLook = () => {
    const look = sheet?.look;
    if (!look || !selCat) return;
    if (!confirmDel) { setConfirmDel(true); return; }
    removeLook(selCat.id, look.id);
    closeSheet();
    showToast('已刪除');
  };

  const saveCatName = () => {
    if (!selCat) return;
    const name = sheetText.trim();
    if (!name) return;
    if (!renameCategory(selCat.id, name)) { showToast(`已經有 ${name} 了`); return; }
    closeSheet();
    showToast('已改類別名稱');
  };

  const removeCategory = () => {
    if (!selCat?.custom) return;
    if (!confirmCatDel) { setConfirmCatDel(true); return; }
    const { name } = selCat;
    deleteCategory(selCat.id);
    goBack();
    showToast(`已刪除 ${name}，穿搭移到 Casual`);
  };

  // ── LIST VIEW ─────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.listHeader}>
          <View style={styles.listHeaderLeft}>
            {onBack && (
              <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={26} color={DARK} />
              </TouchableOpacity>
            )}
            <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              Collection
            </Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalNum}>{totalLooks}</Text>
            <Text style={styles.totalLabel}>SAVED LOOKS</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={styles.catRow}
              onPress={() => openDetail(cat)}
              activeOpacity={0.82}
            >
              <View style={[styles.catIconBox, { backgroundColor: cat.color }]}>
                <Feather name={cat.icon} size={24} color={DARK} />
              </View>
              <View style={styles.catMid}>
                <View style={styles.catNameRow}>
                  <Text style={styles.catName} numberOfLines={1}>{cat.name}</Text>
                  {cat.custom && (
                    <View style={styles.customPill}>
                      <Text style={styles.customPillTxt}>CUSTOM</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.catMeta} numberOfLines={1}>{catSummary(catLooksOf(cat.id))}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={MUTED} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.addCatBtn} onPress={openAddSheet} activeOpacity={0.75}>
            <Feather name="plus" size={16} color={LABEL} />
            <Text style={styles.addCatTxt}>新增類別</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ── Add-category bottom sheet ── */}
        <Modal visible={addSheet} transparent animationType="slide" onRequestClose={() => setAddSheet(false)}>
          <TouchableWithoutFeedback onPress={() => setAddSheet(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                  <View style={styles.addSheet}>
                    <View style={styles.sheetHandle} />
                    <Text style={styles.sheetTitle}>新增類別</Text>
                    <View style={styles.addRow}>
                      <TextInput
                        style={styles.addInput}
                        value={newName}
                        onChangeText={setNewName}
                        placeholder="類別名稱，例如 Travel"
                        placeholderTextColor={MUTED}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={submitNewCat}
                      />
                      <TouchableOpacity
                        style={[styles.addSubmit, !newName.trim() && { opacity: 0.4 }]}
                        onPress={submitNewCat}
                        disabled={!newName.trim()}
                      >
                        <Text style={styles.addSubmitTxt}>新增</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {toast && (
          <View style={styles.toastWrap} pointerEvents="none">
            <Text style={styles.toastTxt}>{toast}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── DETAIL VIEW ───────────────────────────────────────────────
  if (!selCat) return null;   // category was removed; goBack() runs alongside
  const catLooks = sortLooks(catLooksOf(selCat.id));
  const tagOf = itemTagFinder(wardrobe);
  const sheetLook = sheet?.look;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: selCat.color }]} edges={['top']}>
      <View style={[styles.detailHeader, { backgroundColor: selCat.color }]}>
        <View style={styles.detailTop}>
          <TouchableOpacity onPress={goBack} hitSlop={12}>
            <Feather name="chevron-left" size={26} color={DARK} />
          </TouchableOpacity>
          <Text style={styles.detailTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {selCat.name}
          </Text>
          <Text style={styles.detailCount}>
            {catLooks.length} {catLooks.length === 1 ? 'LOOK' : 'LOOKS'}
          </Text>
        </View>
        {selCat.custom && (
          <View style={styles.catActions}>
            <TouchableOpacity
              style={styles.catActionPill}
              onPress={() => { setConfirmCatDel(false); openSheet({ mode: 'renameCat' }, selCat.name); }}
              activeOpacity={0.75}
            >
              <Feather name="edit-2" size={12} color={DARK} />
              <Text style={styles.catActionTxt}>改類別名稱</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.catActionPill, confirmCatDel && styles.catActionDanger]}
              onPress={removeCategory}
              activeOpacity={0.75}
            >
              <Feather name="trash-2" size={12} color={confirmCatDel ? CARD : DANGER} />
              <Text style={[styles.catActionTxt, { color: confirmCatDel ? CARD : DANGER }]}>
                {confirmCatDel ? '再按一次確定刪除' : '刪除類別'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.detailContent}>
        {catLooks.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyBox}>
              <Feather name={selCat.icon} size={40} color={LINE} />
              <Text style={styles.emptyTitle}>還沒有收藏的穿搭</Text>
              <Text style={styles.emptySub}>在首頁推薦卡按 ♡，選『{selCat.name}』，就會出現在這裡。</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('HOME')} activeOpacity={0.8}>
                <Text style={styles.emptyBtnTxt}>去首頁挑一套</Text>
              </TouchableOpacity>
            </View>
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
              <CardRise index={index} animate={Date.now() - enterAt.current < 600}>
                <View style={styles.lookItem}>
                  {/* Card — tap to preview */}
                  <TouchableOpacity
                    style={styles.lookCard}
                    onPress={() => setPreviewItem(item)}
                    activeOpacity={0.9}
                  >
                    <LookCardItems look={item} />
                    {/* ⋯ button — opens the look sheet, does NOT bubble to card press */}
                    <TouchableOpacity
                      style={styles.moreBtn}
                      hitSlop={8}
                      onPress={() => openSheet({ mode: 'look', look: item })}
                    >
                      <Feather name="more-horizontal" size={16} color={LABEL} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                  <Text style={styles.lookLabel} numberOfLines={1}>{lookName(item)}</Text>
                  <Text style={styles.lookMeta} numberOfLines={1}>{lookMeta(item, tagOf)}</Text>
                </View>
              </CardRise>
            )}
          />
        )}
      </View>

      {/* ── Bottom sheet: look options / rename / move / rename category ── */}
      <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={closeSheet}>
        <TouchableWithoutFeedback onPress={closeSheet}>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TouchableWithoutFeedback>
              <View style={styles.addSheet}>
                <View style={styles.sheetHandle} />

                {sheet?.mode === 'look' && sheetLook && (
                  <>
                    <Text style={styles.optTitle} numberOfLines={1}>{lookName(sheetLook)}</Text>
                    <Text style={styles.optSub} numberOfLines={1}>{lookMeta(sheetLook, tagOf)}</Text>
                    <TouchableOpacity
                      style={styles.optRow}
                      onPress={() => openSheet({ mode: 'rename', look: sheetLook }, customLabel(sheetLook) ?? '')}
                      activeOpacity={0.75}
                    >
                      <Feather name="edit-2" size={18} color={DARK} />
                      <Text style={styles.optTxt}>改名稱</Text>
                      <Feather name="chevron-right" size={16} color={MUTED} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.optRow}
                      onPress={() => openSheet({ mode: 'move', look: sheetLook })}
                      activeOpacity={0.75}
                    >
                      <Feather name="folder" size={18} color={DARK} />
                      <Text style={styles.optTxt}>移到其他類別</Text>
                      <Feather name="chevron-right" size={16} color={MUTED} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.optRow, styles.optRowLast]} onPress={deleteLook} activeOpacity={0.75}>
                      <Feather name="trash-2" size={18} color={DANGER} />
                      <Text style={[styles.optTxt, styles.optDanger]}>
                        {confirmDel ? '再按一次確定刪除' : '刪除'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {sheet?.mode === 'rename' && sheetLook && (
                  <>
                    <Text style={styles.sheetTitle}>改名稱</Text>
                    <View style={styles.addRow}>
                      <TextInput
                        style={styles.addInput}
                        value={sheetText}
                        onChangeText={setSheetText}
                        placeholder={hasSavedAt(sheetLook) ? `留白就顯示日期（${lookName({ savedAt: sheetLook.savedAt })}）` : '名稱'}
                        placeholderTextColor={MUTED}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={saveLookName}
                      />
                      <TouchableOpacity style={styles.addSubmit} onPress={saveLookName}>
                        <Text style={styles.addSubmitTxt}>儲存</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {sheet?.mode === 'move' && sheetLook && (
                  <>
                    <Text style={styles.sheetTitle}>移到哪個類別？</Text>
                    <ScrollView style={styles.moveScroll}>
                      {categories.map(cat => {
                        const current = cat.id === selCat.id;
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            style={[styles.optRow, current && { opacity: 0.35 }]}
                            onPress={() => moveTo(cat)}
                            disabled={current}
                            activeOpacity={0.75}
                          >
                            <View style={[styles.moveSwatch, { backgroundColor: cat.color }]}>
                              <Feather name={cat.icon} size={15} color={DARK} />
                            </View>
                            <Text style={styles.optTxt} numberOfLines={1}>{cat.name}</Text>
                            {!current && <Feather name="chevron-right" size={16} color={MUTED} />}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </>
                )}

                {sheet?.mode === 'renameCat' && (
                  <>
                    <Text style={styles.sheetTitle}>改類別名稱</Text>
                    <View style={styles.addRow}>
                      <TextInput
                        style={styles.addInput}
                        value={sheetText}
                        onChangeText={setSheetText}
                        placeholder="類別名稱"
                        placeholderTextColor={MUTED}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={saveCatName}
                      />
                      <TouchableOpacity
                        style={[styles.addSubmit, !sheetText.trim() && { opacity: 0.4 }]}
                        onPress={saveCatName}
                        disabled={!sheetText.trim()}
                      >
                        <Text style={styles.addSubmitTxt}>儲存</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
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

      {toast && (
        <View style={styles.toastWrap} pointerEvents="none">
          <Text style={styles.toastTxt}>{toast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BEIGE },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 14,
  },
  listHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  backBtn: {
    marginRight: 6,
  },
  chapter: { fontSize: 11, color: MUTED, letterSpacing: 0.8, marginBottom: 2 },
  pageTitle: { fontFamily: SERIF, fontSize: 32, fontWeight: '700', color: DARK, lineHeight: 36, flexShrink: 1 },
  totalBox: { alignItems: 'flex-end' },
  totalNum: { fontFamily: SERIF, fontSize: 20, fontWeight: '700', color: DARK, lineHeight: 22 },
  totalLabel: { fontFamily: MONO, fontSize: 8, color: MUTED, letterSpacing: 1.2 },
  divider: { height: 1, backgroundColor: LINE, marginHorizontal: 22, marginBottom: 10 },

  listContent: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 40, gap: 14 },
  catRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: CARD_LINE,
    paddingHorizontal: 16, paddingVertical: 16, gap: 16,
  },
  catIconBox: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  catMid: { flex: 1, minWidth: 0 },
  catNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catName: { flexShrink: 1, fontFamily: SERIF, fontSize: 22, fontWeight: '700', color: DARK },
  customPill: {
    borderWidth: 1, borderColor: LINE, borderRadius: 999,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  customPillTxt: { fontFamily: MONO, fontSize: 8, color: LABEL, letterSpacing: 1 },
  catMeta: { fontFamily: MONO, fontSize: 10, color: LABEL, letterSpacing: 1, marginTop: 4 },
  addCatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: LINE, borderRadius: 20,
    paddingVertical: 20,
  },
  addCatTxt: { fontSize: 15, color: LABEL, fontWeight: '600' },

  // Add-category sheet (same look as Home's "儲存到哪個類別？")
  addSheet: {
    backgroundColor: BEIGE, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 14, paddingBottom: 40,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#C8BAA8', alignSelf: 'center', marginBottom: 18,
  },
  sheetTitle: { fontFamily: SERIF, fontSize: 17, fontWeight: '700', color: DARK, marginBottom: 18 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addInput: {
    flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: DARK, backgroundColor: CARD,
  },
  addSubmit: { backgroundColor: DARK, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 13 },
  addSubmitTxt: { fontSize: 15, color: BEIGE, fontWeight: '700' },

  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 28, alignItems: 'center' },
  toastTxt: {
    backgroundColor: DARK, color: BEIGE, fontSize: 13, overflow: 'hidden',
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
  },

  detailHeader: {
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(26,18,11,0.10)',
  },
  detailTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailTitle: { fontFamily: SERIF, fontSize: 44, fontWeight: '700', color: DARK, flex: 1, lineHeight: 50 },
  detailCount: { fontFamily: MONO, fontSize: 11, color: LABEL, letterSpacing: 1.5 },
  catActions: { flexDirection: 'row', gap: 8, marginTop: 10, marginLeft: 36 },
  catActionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: 'rgba(26,18,11,0.25)', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(251,249,245,0.55)',
  },
  catActionDanger: { backgroundColor: DANGER, borderColor: DANGER },
  catActionTxt: { fontSize: 12, color: DARK, fontWeight: '600' },
  detailContent: { flex: 1, backgroundColor: BEIGE },

  lookGrid: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 40, gap: 22 },
  lookRow: { gap: 12 },
  lookItem: { width: LOOK_W },
  lookCard: {
    width: LOOK_W, height: CARD_H,
    borderRadius: 20, overflow: 'hidden',
    backgroundColor: CARD, borderWidth: 1, borderColor: CARD_LINE,
    marginBottom: 8,
  },
  moreBtn: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(243,238,229,0.9)',
    borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3,
  },
  lookLabel: { fontFamily: SERIF, fontSize: 18, fontWeight: '700', color: DARK, paddingHorizontal: 2 },
  lookMeta: { fontFamily: MONO, fontSize: 9, color: LABEL, letterSpacing: 1, marginTop: 3, paddingHorizontal: 2 },

  emptyWrap: { flex: 1, paddingHorizontal: 22, paddingTop: 24 },
  emptyBox: {
    alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: LINE, borderRadius: 20,
    paddingHorizontal: 24, paddingVertical: 36,
  },
  emptyTitle: { fontFamily: SERIF, fontSize: 18, fontWeight: '700', color: DARK, marginTop: 6 },
  emptySub: { fontSize: 13, color: LABEL, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { backgroundColor: DARK, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 11, marginTop: 8 },
  emptyBtnTxt: { fontSize: 14, color: BEIGE, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  optTitle: { fontFamily: SERIF, fontSize: 20, fontWeight: '700', color: DARK },
  optSub: { fontFamily: MONO, fontSize: 10, color: LABEL, letterSpacing: 1, marginTop: 4, marginBottom: 10 },
  optRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#EDE5D8',
  },
  optRowLast: { borderBottomWidth: 0 },
  optTxt: { flex: 1, fontSize: 15, color: DARK, fontWeight: '500' },
  optDanger: { color: DANGER, fontWeight: '600' },
  moveScroll: { maxHeight: height * 0.5 },
  moveSwatch: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

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
