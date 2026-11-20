/**
 * Image path resolver — read-time repair for stale absolute file:// URIs.
 *
 * Why: closet images are always saved at the top level of documentDirectory as
 * item_<digits>.png / item_<digits>_orig.jpg, but the stored URI is absolute and
 * contains the iOS container path, which changes when Expo Go is updated.
 *
 * Rule: if an item_* URI is not under the CURRENT documentDirectory, look for the
 * same file name in the current documentDirectory. The candidate is used only after
 * getInfoAsync confirms it exists; otherwise the original URI is kept (never a fake path).
 *
 * This module never writes, moves, renames or deletes files, and never touches AsyncStorage.
 */
import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

const ITEM_FILE_RE = /^item_\d+(_orig)?\.(png|jpe?g)$/i;

// original uri → verified uri (candidate if it exists, otherwise the original)
const verified = new Map();
// original uris whose candidate file was NOT found
const missing = new Set();

export const fileNameOf = (uri) => {
  if (typeof uri !== 'string' || !uri) return null;
  const last = uri.split('?')[0].split('#')[0].split('/').pop() || null;
  if (!last) return null;
  try { return decodeURIComponent(last); } catch { return last; }
};

/** True for our own item_* image files whose stored path points outside the current documentDirectory. */
export const isStaleItemUri = (uri) => {
  const docDir = FileSystem.documentDirectory;
  if (!docDir || typeof uri !== 'string' || !uri.startsWith('file://')) return false;
  if (uri.startsWith(docDir)) return false;
  return ITEM_FILE_RE.test(fileNameOf(uri) ?? '');
};

/** Synchronous lookup. Returns the verified replacement, or the original uri unchanged. */
export const resolveImageUri = (uri) => {
  if (!isStaleItemUri(uri)) return uri;
  return verified.get(uri) ?? uri;
};

/** Verify stale uris once (cached). Resolves to { changed, missing: [...] }. Read-only. */
export async function verifyImageUris(uris) {
  const docDir = FileSystem.documentDirectory;
  let changed = false;
  const todo = [...new Set((uris ?? []).filter(u => isStaleItemUri(u) && !verified.has(u)))];
  for (const uri of todo) {
    const candidate = docDir + fileNameOf(uri);
    let exists = false;
    try {
      const info = await FileSystem.getInfoAsync(candidate);
      exists = !!info.exists && !info.isDirectory;
    } catch {}
    if (exists) {
      verified.set(uri, candidate);
      missing.delete(uri);
      changed = true;
    } else {
      verified.set(uri, uri);   // keep original — no fake path
      missing.add(uri);
      console.warn('[imageUri] 找不到圖片檔案，保留原始路徑：', uri);
    }
  }
  return { changed, missing: [...missing] };
}

export const getMissingImageUris = () => [...missing];

/**
 * React hook for contexts: verifies any not-yet-checked stale uris and returns a
 * version number that bumps when new replacements become available.
 */
export function useImageUriVersion(uris) {
  const [version, setVersion] = useState(0);
  const pending = (uris ?? []).filter(u => isStaleItemUri(u) && !verified.has(u));
  const key = [...new Set(pending)].sort().join('\n');
  useEffect(() => {
    if (!key) return;
    let alive = true;
    verifyImageUris(key.split('\n')).then(r => { if (alive && r.changed) setVersion(v => v + 1); });
    return () => { alive = false; };
  }, [key]);
  return version;
}

/** Copy of a snapshot item list with resolved uris (unchanged items keep identity). */
export const resolveItemList = (list) => {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const out = list.map(it => {
    const r = resolveImageUri(it?.uri);
    if (r === it?.uri) return it;
    changed = true;
    return { ...it, uri: r };
  });
  return changed ? out : list;
};
