/**
 * Bottom sheet for editing one closet item: name + clothing tags.
 * Purely presentational — saving goes through onSave(), which the Closet
 * screen routes to WardrobeContext.updateItem / updateItemTags.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, Modal, ScrollView, Image,
  KeyboardAvoidingView, StyleSheet, Platform, Dimensions, Alert,
} from 'react-native';
import {
  SLEEVE_LENGTHS, THICKNESS, COLORS, STYLES, FORMALITY, TAG_STATUS, TAG_STATUS_LABELS,
  getSubTypes, usesSleeve, getItemTags, estimateWarmth,
} from '../utils/wardrobeSchema';

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

function Chip({ label, selected, onPress, swatch }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.chip, selected && styles.chipOn]}
    >
      {swatch !== undefined && (
        <View style={[styles.swatch, swatch ? { backgroundColor: swatch } : styles.swatchMulti]} />
      )}
      <Text style={[styles.chipTxt, selected && styles.chipTxtOn]}>{label}</Text>
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

export default function ItemTagEditor({ visible, item, categoryId, onClose, onSave, onDelete }) {
  const [label, setLabel] = useState('');
  const [tags, setTags]   = useState(() => getItemTags(null, categoryId));
  const [dirty, setDirty] = useState(false);

  // Reset form whenever a different item is opened
  useEffect(() => {
    if (visible && item) {
      setLabel(item.label ?? '');
      setTags(getItemTags(item, categoryId));
      setDirty(false);
    }
  }, [visible, item?.id]);

  if (!item) return null;

  // Single-choice: tap again to clear
  const pick = (field, value) => {
    setTags(t => ({ ...t, [field]: t[field] === value ? null : value }));
    setDirty(true);
  };
  const toggleStyle = (value) => {
    setTags(t => ({
      ...t,
      styles: t.styles.includes(value) ? t.styles.filter(s => s !== value) : [...t.styles, value],
    }));
    setDirty(true);
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>編輯單品</Text>
              <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                <Text style={[styles.statusTxt, { color: sc.fg }]}>
                  {dirty ? '已修改・未儲存' : TAG_STATUS_LABELS[status]}
                </Text>
              </View>
            </View>

            <ScrollView
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

              <Section title="類型">
                {getSubTypes(categoryId).map(o => (
                  <Chip key={o.value} label={o.label} selected={tags.subType === o.value} onPress={() => pick('subType', o.value)} />
                ))}
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

              <Section title="主要顏色">
                {COLORS.map(o => (
                  <Chip key={o.value} label={o.label} swatch={o.hex} selected={tags.primaryColor === o.value} onPress={() => pick('primaryColor', o.value)} />
                ))}
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
                {status === TAG_STATUS.AI_SUGGESTED && !dirty ? '確認並儲存' : '儲存'}
              </Text>
            </TouchableOpacity>
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
    borderWidth: 1.2,
    borderColor: BORDER,
    backgroundColor: '#FDF8F2',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: DARK, borderColor: DARK },
  chipTxt: { fontSize: 13, color: DARK, fontWeight: '500' },
  chipTxtOn: { color: BEIGE },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  swatchMulti: { backgroundColor: '#E3874A', borderColor: '#8A63B8', borderWidth: 3 },

  warmth: { fontSize: 12, color: MUTED, marginTop: 16, marginBottom: 6 },

  saveBtn: { backgroundColor: DARK, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14, marginBottom: 6 },
  saveTxt: { fontSize: 15, color: BEIGE, fontWeight: '700' },
  deleteBtn: { paddingVertical: 12, alignItems: 'center' },
  deleteTxt: { fontSize: 14, color: '#C0392B', fontWeight: '600' },
});
