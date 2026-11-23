/**
 * "Tag the clothes you just added" guide — pure state helpers.
 *
 * The guide is an explicit mode: it only exists as a queue created from the ids the
 * upload pipeline actually saved. Opening an existing item from the Closet never
 * creates a queue, so it always uses the normal edit mode.
 *
 *   queue = { catId, ids: [...], index }   (ids in the order the photos were picked)
 */

export const EDITOR_MODE = { EDIT: 'edit', ONBOARDING: 'onboarding' };

export const startQueue = (catId, ids) =>
  (catId && Array.isArray(ids) && ids.length ? { catId, ids: [...ids], index: 0 } : null);

export const currentId = (q) => (q ? q.ids[q.index] ?? null : null);

/** Next item, or null when the last one is done / skipped (guide ends). */
export const nextQueue = (q) => (q && q.index + 1 < q.ids.length ? { ...q, index: q.index + 1 } : null);

export const progressOf = (q) =>
  (q ? { index: q.index, total: q.ids.length, isLast: q.index >= q.ids.length - 1 } : null);

/**
 * The editor's form must be (re)filled from the item whenever the shown item changes,
 * or the sheet is opened again. `formFor` is the item id the form currently holds.
 */
export const needsFormReset = (visible, itemId, formFor) => !!visible && itemId != null && itemId !== formFor;

/** Scroll the tag list back to the top only when the guide moves to another item. */
export const shouldScrollToTop = (mode, prevItemId, itemId) =>
  mode === EDITOR_MODE.ONBOARDING && prevItemId != null && itemId != null && prevItemId !== itemId;

/** What the editor shows in each mode. */
export function editorConfig(mode, progress) {
  if (mode === EDITOR_MODE.ONBOARDING && progress) {
    return {
      title: '設定新衣服標籤',
      primaryLabel: progress.isLast ? '儲存並完成' : '儲存並下一件',
      showSkip: true,
      skipLabel: '稍後再說',
      progressText: `第 ${progress.index + 1} / ${progress.total} 件`,
      remaining: progress.total - progress.index - 1,
    };
  }
  return { title: '編輯單品', primaryLabel: '儲存', showSkip: false, skipLabel: null, progressText: null, remaining: 0 };
}
