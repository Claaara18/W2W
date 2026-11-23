/**
 * Upload pipeline — the same per-photo loop the Closet screen used before, moved here
 * unchanged so it can be tested. For each photo, in the order the user picked them:
 *   prepare (resize) → remove background → on failure keep the original photo
 *   → addItem once (id `${catId}_${ts}`, label `look N`, bgRemoved)
 * A photo whose original can't be kept either is skipped; the rest of the batch continues.
 *
 * Returns { addedIds, failed } — addedIds in pick order (only items that were saved),
 * failed = 1-based photo numbers whose background removal failed (as before).
 */
export async function processUploads(catId, uris, deps) {
  const {
    prepareImage, removeBackground, keepOriginal, addItem,
    baseCount = 0, now = Date.now, onStep, onOutcome, log = console,
  } = deps;
  const failed = [];
  const addedIds = [];
  const used = new Set();
  for (let i = 0; i < uris.length; i++) {
    onStep?.(i);
    let ts = now() + i;
    while (used.has(ts)) ts++;          // never two items with the same id in one batch
    used.add(ts);
    let finalUri = null;
    let bgRemoved = true;
    let prepared = uris[i];
    try {
      prepared = await prepareImage(uris[i]);
      finalUri = await removeBackground(prepared);
    } catch (err) {
      log.warn?.(`[processAndAdd] 第 ${i + 1} 張去背失敗，改存原圖：`, err?.message);
      failed.push(i + 1);
      bgRemoved = false;
      try { finalUri = await keepOriginal(prepared); }
      catch (e2) { log.error?.('[processAndAdd] 保存原圖也失敗：', e2?.message); }
    }
    if (finalUri) {
      const id = `${catId}_${ts}`;
      addItem(catId, {
        id,
        uri: finalUri,
        label: `look ${baseCount + addedIds.length + 1}`,
        bgRemoved,
      });
      addedIds.push(id);
    }
    onOutcome?.(finalUri && bgRemoved ? 'ok' : 'fail');
  }
  return { addedIds, failed };
}
