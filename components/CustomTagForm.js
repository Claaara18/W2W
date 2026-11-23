/**
 * Inline form (inside the item editor, no extra modal) for adding / editing
 * a custom clothing type or a custom colour. Core React Native only — Expo Go safe.
 *
 * The user only enters a name (and a colour). How the recommender reads a custom type or
 * colour is decided automatically (category / sleeve / thickness / formality / style tags,
 * and the HEX code) — there is no "treated as" choice in the form.
 *
 * props:
 *   mode        'subType' | 'color'
 *   categoryId  clothing category of the item being edited
 *   initial     existing entry when editing ({ label, hex }) or null
 *   onSubmit    (input) => string | null   — returns an error message, or null on success
 *   onCancel    () => void
 */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { CUSTOM_LABEL_MAX, normalizeHex, labelLength } from '../utils/wardrobeSchema';
import { PALETTE } from '../utils/customTags';

const BEIGE  = '#F5EFE6';
const DARK   = '#1A1108';
const MUTED  = '#9E8C7A';
const BORDER = '#E0D5C5';
const ERROR  = '#B0412E';


export default function CustomTagForm({ mode, categoryId, initial, onSubmit, onCancel }) {
  const isColor = mode === 'color';
  const [label, setLabel] = useState(initial?.label ?? '');
  const [hexText, setHexText] = useState(initial?.hex ?? '');
  const [error, setError] = useState(null);

  const hex = normalizeHex(hexText);

  const setHexAndSuggest = (text) => {
    setHexText(text);
    setError(null);
  };
  const pickPalette = (p) => {
    setHexText(p.hex);
    if (!label.trim()) setLabel(p.name);
    setError(null);
  };
  const submit = () => {
    // No base here: custom types keep any existing internal base; colours get theirs from the HEX
    const input = isColor ? { label, hex: hexText } : { label };
    const err = onSubmit(input);
    if (err) setError(err);
  };

  const count = labelLength(label.trim());

  return (
    <View style={styles.box}>
      <Text style={styles.title}>
        {initial ? (isColor ? '編輯自訂顏色' : '編輯自訂類型') : (isColor ? '新增自訂顏色' : '新增自訂類型')}
      </Text>

      <View style={styles.inputRow}>
        {isColor && <View style={[styles.preview, hex ? { backgroundColor: hex } : styles.previewEmpty]} />}
        <TextInput
          style={styles.input}
          value={label}
          onChangeText={(t) => { setLabel(t); setError(null); }}
          placeholder={isColor ? '顏色名稱，例如：酒紅' : '類型名稱，例如：針織背心'}
          placeholderTextColor={MUTED}
          maxLength={CUSTOM_LABEL_MAX + 4}
          returnKeyType="done"
        />
        <Text style={[styles.count, count > CUSTOM_LABEL_MAX && { color: ERROR }]}>{count}/{CUSTOM_LABEL_MAX}</Text>
      </View>

      {isColor && (
        <>
          <View style={styles.palette}>
            {PALETTE.map(p => (
              <TouchableOpacity
                key={p.hex}
                onPress={() => pickPalette(p)}
                style={[styles.paletteDot, { backgroundColor: p.hex }, hex === p.hex && styles.paletteDotOn]}
                accessibilityLabel={p.name}
              />
            ))}
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.fieldLabel}>HEX</Text>
            <TextInput
              style={[styles.input, styles.hexInput]}
              value={hexText}
              onChangeText={setHexAndSuggest}
              placeholder="#722F37"
              placeholderTextColor={MUTED}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
            />
          </View>
          {!!hexText && !hex && <Text style={styles.hint}>色碼格式：# 加 6 位數，例如 #722F37</Text>}
        </>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelTxt}>取消</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.okBtn} onPress={submit}>
          <Text style={styles.okTxt}>{initial ? '儲存' : '新增'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    marginTop: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: BORDER,
    backgroundColor: '#FBF7F0',
  },
  title: { fontSize: 13, fontWeight: '700', color: DARK, marginBottom: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  input: {
    flex: 1,
    borderWidth: 1.2,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: DARK,
    backgroundColor: '#FDF8F2',
  },
  hexInput: { flex: 0, width: 120, fontVariant: ['tabular-nums'] },
  count: { fontSize: 11, color: MUTED, minWidth: 34, textAlign: 'right' },
  preview: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  previewEmpty: { backgroundColor: '#FDF8F2', borderStyle: 'dashed', borderColor: MUTED },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginVertical: 6 },
  paletteDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  paletteDotOn: { borderWidth: 3, borderColor: DARK },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: DARK, marginTop: 4 },
  hint: { fontSize: 11, color: MUTED, marginTop: 2, marginBottom: 6 },
  error: { fontSize: 12, color: ERROR, marginTop: 8, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cancelBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#EDE7DC' },
  cancelTxt: { fontSize: 14, color: MUTED, fontWeight: '600' },
  okBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: DARK },
  okTxt: { fontSize: 14, color: BEIGE, fontWeight: '700' },
});
