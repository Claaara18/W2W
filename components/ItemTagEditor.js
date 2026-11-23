/**
 * Bottom sheet for editing one closet item: name + clothing tags.
 * Purely presentational — saving goes through onSave(), which the Closet
 * screen routes to WardrobeContext.updateItem / updateItemTags.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, Modal, ScrollView, Image,
  KeyboardAvoidingView, StyleSheet, Platform, Dimensions, Alert, Keyboard,
} from 'react-native';
import {
  SLEEVE_LENGTHS, THICKNESS, COLORS, STYLES, FORMALITY, TAG_STATUS, TAG_STATUS_LABELS,
  getSubTypes, usesSleeve, getItemTags, estimateWarmth, customValue, isCustomValue,
} from '../utils/wardrobeSchema';
import { getCustomSubTypes, getCustomColors, countUsage } from '../utils/customTags';
import { useWardrobe } from '../context/WardrobeContext';
import CustomTagForm from './CustomTagForm';
import { EDITOR_MODE, editorConfig, needsFormReset, shouldScrollToTop } from '../utils/uploadOnboarding';

const BEIGE  = '#F5EFE6';
const DARK   = '#1A1108';
const MUTED  = '#9E8C7A';
const BORDER = '#E0D5C5';
const { height: SCREEN_H } = Dimensions.get('window');

const STATUS_COLORS = {
  untagged:     { bg: '#EDE7DC', fg: MUTED },
  ai_suggested: { bg: '#F6E7C8', fg: '#8A6420' },
  confirmed:    { bg: '#DDE8D6', fg: '#3F6B3A' },
};

function Chip({ label, selected, onPress, onLongPress, swatch, dashed }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.75}
      style={[styles.chip, dashed && styles.chipDashed, selected && styles.chipOn]}
    >
      {swatch !== undefined && (
        <View style={[styles.swatch, swatch ? { backgroundColor: swatch } : styles.swatchMulti]} />
      )}
      <Text style={[styles.chipTxt, dashed && styles.chipTxtDashed, selected && styles.chipTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, hint, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title}{hint ? <Text style={styles.sectionHint}>  {hint}</Text> : null}
      </Text>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

/**
 * mode: 'edit' (default — open an existing item from the Closet) or 'onboarding' (the guide
 * right after an upload: shows progress, "儲存並下一件 / 儲存並完成" and "稍後再說").
 */
export default function ItemTagEditor({
  visible, item, categoryId, onClose, onSave, onDelete,
  mode = EDITOR_MODE.EDIT, progress = null, onSkip,
}) {
  const [label, setLabel] = useState('');
  const [tags, setTags]   = useState(() => getItemTags(null, categoryId));
  const [dirty, setDirty] = useState(false);
  const [form, setForm]   = useState(null);   // { mode: 'subType' | 'color', editing: entry | null }
  const {
    items: wardrobe, customTags, customTagsReady,
    addCustomSubType, updateCustomSubType, deleteCustomSubType,
    addCustomColor, updateCustomColor, deleteCustomColor,
  } = useWardrobe();

  // Fill the form from the item whenever a different item is shown (or the sheet reopens).
  // Done during render — not in an effect — so the first frame of a new item already shows
  // its own name and tags (no flash of the previous item's data in the guide).
  const [formFor, setFormFor] = useState(null);
  if (!visible && formFor !== null) setFormFor(null);
  if (needsFormReset(visible, item?.id, formFor)) {
    setFormFor(item.id);
    setLabel(item.label ?? '');
    setTags(getItemTags(item, categoryId));
    setDirty(false);
    setForm(null);
  }

  // Guide only: after the data has switched to the next item, start again from the top
  const scrollRef = useRef(null);
  const shownId = useRef(null);
  useLayoutEffect(() => {
    const prev = shownId.current;
    shownId.current = visible ? item?.id ?? null : null;
    if (shouldScrollToTop(mode, prev, item?.id)) {
      Keyboard.dismiss();
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [visible, item?.id, mode]);

  if (!item) return null;

  // Single-choice: tap again to clear
  const pick = (field, value) => {
    setTags(t => ({ ...t, [field]: t[field] === value ? null : value }));
    setDirty(true);
  };

  // Type / colour picks also carry the custom snapshot (null for built-in values)
  const pickSubType = (value, snap = null) => {
    setTags(t => (t.subType === value
      ? { ...t, subType: null, customSubType: null }
      : { ...t, subType: value, customSubType: snap }));
    setDirty(true);
  };
  const pickColor = (value, snap = null) => {
    setTags(t => (t.primaryColor === value
      ? { ...t, primaryColor: null, customColor: null }
      : { ...t, primaryColor: value, customColor: snap }));
    setDirty(true);
  };

  const customTypes  = getCustomSubTypes(customTags, categoryId);
  const customColors = getCustomColors(customTags);
  // Selected custom option that is no longer in the library (deleted) — still shown from the snapshot
  const orphanType  = isCustomValue(tags.subType) && !customTypes.some(e => customValue(e.id) === tags.subType)
    ? tags.customSubType : null;
  const orphanColor = isCustomValue(tags.primaryColor) && !customColors.some(e => customValue(e.id) === tags.primaryColor)
    ? tags.customColor : null;

  const openForm = (mode, editing = null) => {
    if (!customTagsReady) {
      Alert.alert('自訂標籤暫時無法使用', '請完全關閉後重新開啟 App。');
      return;
    }
    setForm({ mode, editing });
  };

  // Returns an error message for the form, or null when done
  const submitForm = (input) => {
    const { mode, editing } = form;
    let r;
    if (mode === 'subType') {
      r = editing ? updateCustomSubType(categoryId, editing.id, input) : addCustomSubType(categoryId, input);
    } else {
      r = editing ? updateCustomColor(editing.id, input) : addCustomColor(input);
    }
    if (r.error) return r.error;
    const e = r.entry;
    const value = customValue(e.id);
    if (mode === 'subType') {
      if (!editing) pickSubType(value, e);   // new option → selected for this item
      else if (tags.subType === value) setTags(t => ({ ...t, customSubType: e }));
    } else {
      if (!editing) pickColor(value, e);
      else if (tags.primaryColor === value) setTags(t => ({ ...t, customColor: e }));
    }
    setForm(null);
    return null;
  };

  const manage = (mode, entry) => {
    const field = mode === 'subType' ? 'subType' : 'primaryColor';
    const used = countUsage(wardrobe, field, customValue(entry.id));
    Alert.alert(entry.label, used ? `${used} 件衣服使用中` : '目前沒有衣服使用', [
      { text: '編輯', onPress: () => openForm(mode, entry) },
      {
        text: '刪除', style: 'destructive',
        onPress: () => Alert.alert(
          `刪除「${entry.label}」？`,
          used ? `這 ${used} 件衣服會保留原本的標籤，只是之後不能再從選項選擇。` : '之後不能再從選項選擇。',
          [
            { text: '取消', style: 'cancel' },
            {
              text: '刪除', style: 'destructive',
              onPress: () => { mode === 'subType' ? deleteCustomSubType(categoryId, entry.id) : deleteCustomColor(entry.id); },
            },
          ]
        ),
      },
      { text: '取消', style: 'cancel' },
    ]);
  };
  const toggleStyle = (value) => {
    setTags(t => ({
      ...t,
      styles: t.styles.includes(value) ? t.styles.filter(s => s !== value) : [...t.styles, value],
    }));
    setDirty(true);
  };

  const isGuide = mode === EDITOR_MODE.ONBOARDING && !!progress;
  const cfg = editorConfig(isGuide ? EDITOR_MODE.ONBOARDING : EDITOR_MODE.EDIT, progress);
  // Unsaved changes: tags, name, or an open custom-tag form
  const hasChanges = dirty || label.trim() !== (item.label ?? '') || !!form;

  // Guide: "稍後再說" keeps the item as it is and moves on (asks first if something was changed)
  const skip = () => {
    if (!hasChanges) { onSkip?.(); return; }
    Alert.alert('略過這件？', '這件衣服會保留在衣櫃，但剛才的修改不會儲存。', [
      { text: '繼續編輯', style: 'cancel' },
      { text: '略過', style: 'destructive', onPress: () => onSkip?.() },
    ]);
  };
  // Closing the sheet: normal edit closes as before; the guide asks before ending
  const requestClose = () => {
    if (!isGuide) { onClose(); return; }
    const rest = cfg.remaining > 0 ? `還有 ${cfg.remaining} 件沒設定，之後可以在 Closet 補上標籤。` : '';
    Alert.alert('結束標籤設定？', `${hasChanges ? '這件的修改不會儲存。' : ''}${rest}` || '衣服都已保留在衣櫃。', [
      { text: '繼續設定', style: 'cancel' },
      { text: '結束', style: 'destructive', onPress: onClose },
    ]);
  };

  const status = tags.tagStatus ?? TAG_STATUS.UNTAGGED;
  const sc = STATUS_COLORS[status] ?? STATUS_COLORS.untagged;
  const warmth = estimateWarmth(tags, categoryId);

  const save = () => {
    onSave({
      label: label.trim() || item.label,
      tags,
      // Saving confirms tags if the user changed them, or accepts an AI suggestion as-is
      confirmTags: dirty || status === TAG_STATUS.AI_SUGGESTED,
    });
  };

  const confirmDelete = () => {
    Alert.alert('刪除這件衣服？', '刪除後無法復原。', [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={requestClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.headerRow}>
              <View style={styles.titleWrap}>
                <Text style={styles.title}>{cfg.title}</Text>
                {cfg.progressText && <Text style={styles.progress}>{cfg.progressText}</Text>}
              </View>
              <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                <Text style={[styles.statusTxt, { color: sc.fg }]}>
                  {dirty ? '已修改・未儲存' : TAG_STATUS_LABELS[status]}
                </Text>
              </View>
            </View>

            <ScrollView
              ref={scrollRef}
              style={{ maxHeight: SCREEN_H * 0.58 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.nameRow}>
                <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="contain" />
                <TextInput
                  style={styles.input}
                  value={label}
                  onChangeText={setLabel}
                  placeholder="名稱"
                  placeholderTextColor={MUTED}
                  returnKeyType="done"
                />
              </View>

              <Section title="類型" hint={customTypes.length ? '長按自訂選項可編輯' : null}>
                {getSubTypes(categoryId).map(o => (
                  <Chip key={o.value} label={o.label} selected={tags.subType === o.value} onPress={() => pickSubType(o.value)} />
                ))}
                {customTypes.map(e => (
                  <Chip
                    key={e.id}
                    label={e.label}
                    selected={tags.subType === customValue(e.id)}
                    onPress={() => pickSubType(customValue(e.id), e)}
                    onLongPress={() => manage('subType', e)}
                  />
                ))}
                {orphanType && (
                  <Chip label={`${orphanType.label}（已移除）`} selected onPress={() => pickSubType(tags.subType)} />
                )}
                {form?.mode !== 'subType' && (
                  <Chip label="＋ 自訂類型" dashed onPress={() => openForm('subType')} />
                )}
                {form?.mode === 'subType' && (
                  <CustomTagForm
                    key={form.editing?.id ?? 'new-type'}
                    mode="subType"
                    categoryId={categoryId}
                    initial={form.editing}
                    onSubmit={submitForm}
                    onCancel={() => setForm(null)}
                  />
                )}
              </Section>

              {usesSleeve(categoryId) && (
                <Section title="袖長">
                  {SLEEVE_LENGTHS.map(o => (
                    <Chip key={o.value} label={o.label} selected={tags.sleeveLength === o.value} onPress={() => pick('sleeveLength', o.value)} />
                  ))}
                </Section>
              )}

              <Section title="厚薄">
                {THICKNESS.map(o => (
                  <Chip key={o.value} label={o.label} selected={tags.thickness === o.value} onPress={() => pick('thickness', o.value)} />
                ))}
              </Section>

              <Section title="主要顏色" hint={customColors.length ? '長按自訂選項可編輯' : null}>
                {COLORS.map(o => (
                  <Chip key={o.value} label={o.label} swatch={o.hex} selected={tags.primaryColor === o.value} onPress={() => pickColor(o.value)} />
                ))}
                {customColors.map(e => (
                  <Chip
                    key={e.id}
                    label={e.label}
                    swatch={e.hex}
                    selected={tags.primaryColor === customValue(e.id)}
                    onPress={() => pickColor(customValue(e.id), e)}
                    onLongPress={() => manage('color', e)}
                  />
                ))}
                {orphanColor && (
                  <Chip label={`${orphanColor.label}（已移除）`} swatch={orphanColor.hex} selected onPress={() => pickColor(tags.primaryColor)} />
                )}
                {form?.mode !== 'color' && (
                  <Chip label="＋ 自訂顏色" dashed onPress={() => openForm('color')} />
                )}
                {form?.mode === 'color' && (
                  <CustomTagForm
                    key={form.editing?.id ?? 'new-color'}
                    mode="color"
                    categoryId={categoryId}
                    initial={form.editing}
                    onSubmit={submitForm}
                    onCancel={() => setForm(null)}
                  />
                )}
              </Section>

              <Section title="風格" hint="可多選">
                {STYLES.map(o => (
                  <Chip key={o.value} label={o.label} selected={tags.styles.includes(o.value)} onPress={() => toggleStyle(o.value)} />
                ))}
              </Section>

              <Section title="正式程度">
                {FORMALITY.map(o => (
                  <Chip key={o.value} label={o.label} selected={tags.formality === o.value} onPress={() => pick('formality', o.value)} />
                ))}
              </Section>

              <Text style={styles.warmth}>
                推算保暖度 {warmth} / 6　（依類型、袖長、厚薄自動計算）
              </Text>
            </ScrollView>

            <TouchableOpacity style={styles.saveBtn} onPress={save}>
              <Text style={styles.saveTxt}>
                {isGuide ? cfg.primaryLabel : (status === TAG_STATUS.AI_SUGGESTED && !dirty ? '確認並儲存' : '儲存')}
              </Text>
            </TouchableOpacity>
            {cfg.showSkip && (
              <TouchableOpacity style={styles.skipBtn} onPress={skip}>
                <Text style={styles.skipTxt}>{cfg.skipLabel}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
              <Text style={styles.deleteTxt}>刪除這件衣服</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: BEIGE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 15, fontWeight: '700', color: DARK },
  titleWrap: { flexShrink: 1 },
  progress: { fontSize: 12, color: MUTED, fontWeight: '600', marginTop: 2, fontVariant: ['tabular-nums'] },
  statusPill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusTxt: { fontSize: 11, fontWeight: '700' },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#F0EAE0' },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: DARK,
    backgroundColor: '#FDF8F2',
  },

  section: { marginTop: 14 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: DARK, letterSpacing: 0.5, marginBottom: 8 },
  sectionHint: { fontSize: 11, fontWeight: '500', color: MUTED },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    borderWidth: 1.2,
    borderColor: BORDER,
    backgroundColor: '#FDF8F2',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: DARK, borderColor: DARK },
  chipDashed: { borderStyle: 'dashed', borderColor: MUTED, backgroundColor: 'transparent' },
  chipTxt: { fontSize: 13, color: DARK, fontWeight: '500', flexShrink: 1 },
  chipTxtDashed: { color: '#7A6650' },
  chipTxtOn: { color: BEIGE },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  swatchMulti: { backgroundColor: '#E3874A', borderColor: '#8A63B8', borderWidth: 3 },

  warmth: { fontSize: 12, color: MUTED, marginTop: 16, marginBottom: 6 },

  saveBtn: { backgroundColor: DARK, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14, marginBottom: 6 },
  saveTxt: { fontSize: 15, color: BEIGE, fontWeight: '700' },
  skipBtn: { backgroundColor: '#EDE7DC', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 2 },
  skipTxt: { fontSize: 15, color: '#7A6650', fontWeight: '600' },
  deleteBtn: { paddingVertical: 12, alignItems: 'center' },
  deleteTxt: { fontSize: 14, color: '#C0392B', fontWeight: '600' },
});
