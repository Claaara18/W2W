/**
 * DEV-ONLY floating "DATA" button + report panel (Phase 1 · Step 0).
 * Rendered only when __DEV__ is true (Expo Go / Metro), never in a release build.
 * Read-only: it only calls inspectAppData() — no AsyncStorage or file writes.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator,
  StyleSheet, Share, Platform,
} from 'react-native';
import { inspectAppData, formatReport } from '../utils/devDataInspector';
import { runRecommendationPreview } from '../utils/devRecommendationPreview';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

// Metro truncates very long single log lines, so print in chunks
const logChunked = (tag, text) => {
  const SIZE = 3000;
  for (let i = 0; i < text.length; i += SIZE) console.log(`${tag} ${text.slice(i, i + SIZE)}`);
};

export default function DevDataInspector() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [json, setJson] = useState('');

  const run = async () => {
    setBusy(true);
    try {
      const report = await inspectAppData();
      const t = formatReport(report);
      const j = JSON.stringify(report, null, 2);
      setText(t);
      setJson(j);
      logChunked('[W2W-INSPECT]', t);
      logChunked('[W2W-INSPECT-JSON]', j);
    } catch (e) {
      setText(`檢查失敗（未寫入任何資料）：${e?.message ?? String(e)}`);
      setJson('');
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setBusy(true);
    try {
      const t = await runRecommendationPreview();
      setText(t);
      setJson('');
      logChunked('[W2W-REC-PREVIEW]', t);
    } catch (e) {
      setText(`推薦預覽失敗（未寫入任何資料）：${e?.message ?? String(e)}`);
      setJson('');
    } finally {
      setBusy(false);
    }
  };

  const openPanel = () => { setOpen(true); run(); };

  const share = (withJson) => {
    Share.share({ message: withJson && json ? `${text}\n\n===== RAW JSON =====\n${json}` : text }).catch(() => {});
  };

  return (
    <>
      <TouchableOpacity style={styles.fab} onPress={openPanel} activeOpacity={0.8}>
        <Text style={styles.fabTxt}>DATA</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>Data Inspector · read-only</Text>
            <TouchableOpacity onPress={() => setOpen(false)}><Text style={styles.btn}>關閉</Text></TouchableOpacity>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity onPress={run} disabled={busy}><Text style={styles.btn}>資料檢查</Text></TouchableOpacity>
            <TouchableOpacity onPress={runPreview} disabled={busy}><Text style={styles.btn}>推薦預覽</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => share(false)} disabled={busy || !text}><Text style={styles.btn}>分享</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => share(true)} disabled={busy || !json}><Text style={styles.btn}>JSON</Text></TouchableOpacity>
          </View>
          {busy ? (
            <ActivityIndicator style={{ marginTop: 40 }} />
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 60 }}>
              <ScrollView horizontal>
                <Text selectable style={styles.report}>{text}</Text>
              </ScrollView>
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', left: 10, bottom: 92,
    backgroundColor: 'rgba(26,17,8,0.55)', borderRadius: 12,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  fabTxt: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  panel: { flex: 1, backgroundColor: '#FBF9F5', paddingTop: 60, paddingHorizontal: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#1A1108' },
  actions: { flexDirection: 'row', gap: 18, marginVertical: 12 },
  btn: { fontSize: 15, color: '#5C4A2A', fontWeight: '600' },
  scroll: { flex: 1 },
  report: { fontFamily: MONO, fontSize: 10.5, lineHeight: 15, color: '#1A1108' },
});
