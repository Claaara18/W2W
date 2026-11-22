// Test-only stand-in for @react-native-async-storage/async-storage (in-memory, Node)
const store = new Map();
export default {
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => { store.set(k, v); },
  __store: store,
};
