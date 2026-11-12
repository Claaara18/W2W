/**
 * Rule-based outfit recommendation engine
 * Input:  wardrobe { tshirts, jackets, skirts, pants, dresses } — each item: { id, uri, label }
 *         weather  { temp: number, icon: string, en: string }
 *         occasion 'Casual' | 'School' | 'Work' | 'Date'
 * Output: up to 3 outfit objects { id, items: [{...item, categoryId}], score }
 */

// Occasion preference weights for bottom type
const BOTTOM_PREF = {
  Casual: { pants: 1.0, skirts: 1.0 },
  School: { pants: 1.1, skirts: 0.7 },
  Work:   { pants: 1.2, skirts: 0.6 },
  Date:   { pants: 0.8, skirts: 1.2 },
};

const DRESS_PREF = {
  Casual: 0.9,
  School: 0.6,
  Work:   0.8,
  Date:   1.3,
};

const JACKET_BONUS = {
  Casual: 0.0,
  School: 0.1,
  Work:   0.3,
  Date:   0.1,
};

const getTier = (temp) => {
  if (temp >= 28) return 'hot';
  if (temp >= 20) return 'warm';
  if (temp >= 13) return 'cool';
  return 'cold';
};

const isRainy = (weather) => {
  const icon = weather?.icon ?? '';
  const en   = (weather?.en ?? '').toLowerCase();
  return icon === 'rainy' || icon === 'thunderstorm' ||
    en.includes('rain') || en.includes('drizzle') || en.includes('shower');
};

const tagged = (items, categoryId) =>
  (items ?? []).map(i => ({ ...i, categoryId }));

export const recommendOutfits = (wardrobe, weather, occasion) => {
  if (!wardrobe) return [];

  const temp    = typeof weather?.temp === 'number' ? weather.temp : 22;
  const tier    = getTier(temp);
  const rainy   = isRainy(weather);
  const occ     = occasion ?? 'Casual';

  const tops    = tagged(wardrobe.tshirts,  'tshirts');
  const jackets = tagged(wardrobe.jackets,  'jackets');
  const skirts  = tagged(wardrobe.skirts,   'skirts');
  const pants   = tagged(wardrobe.pants,    'pants');
  const dresses = tagged(wardrobe.dresses,  'dresses');

  // Filter skirts: not in cold weather, not rainy Work/School
  const validSkirts = skirts.filter(() => {
    if (tier === 'cold') return false;
    if (rainy && (occ === 'Work' || occ === 'School')) return false;
    return true;
  });

  const bottoms = [
    ...pants.map(i => ({ item: i, pref: BOTTOM_PREF[occ]?.pants ?? 1.0 })),
    ...validSkirts.map(i => ({ item: i, pref: BOTTOM_PREF[occ]?.skirts ?? 1.0 })),
  ];

  const candidates = [];

  const push = (items, wScore, oScore) =>
    candidates.push({ items, wScore, oScore });

  // ── Hot (≥28°C) ──
  if (tier === 'hot') {
    tops.forEach(top => {
      bottoms.forEach(({ item: b, pref }) => push([top, b], 1.0, pref));
    });
    dresses.forEach(d => push([d], 0.95, DRESS_PREF[occ]));
  }

  // ── Warm (20–27°C) ──
  if (tier === 'warm') {
    tops.forEach(top => {
      bottoms.forEach(({ item: b, pref }) => {
        push([top, b], 0.9, pref);
        jackets.forEach(j => push([top, b, j], 0.8, pref + JACKET_BONUS[occ]));
      });
    });
    dresses.forEach(d => {
      push([d], 0.85, DRESS_PREF[occ]);
      jackets.forEach(j => push([d, j], 0.8, DRESS_PREF[occ] + JACKET_BONUS[occ]));
    });
  }

  // ── Cool (13–19°C) ──
  if (tier === 'cool') {
    if (jackets.length > 0) {
      tops.forEach(top => {
        jackets.forEach(j => {
          bottoms.forEach(({ item: b, pref }) =>
            push([top, j, b], 0.95, pref + JACKET_BONUS[occ]));
        });
      });
      dresses.forEach(d =>
        jackets.forEach(j => push([d, j], 0.85, DRESS_PREF[occ] + JACKET_BONUS[occ])));
    } else {
      // No jackets — lower weather score
      tops.forEach(top =>
        bottoms.forEach(({ item: b, pref }) => push([top, b], 0.55, pref)));
    }
  }

  // ── Cold (<13°C) ──
  if (tier === 'cold') {
    if (jackets.length > 0) {
      tops.forEach(top => {
        jackets.forEach(j => {
          pants.forEach(p => push([top, j, p], 1.0, BOTTOM_PREF[occ]?.pants ?? 1.0));
        });
      });
      dresses.forEach(d =>
        jackets.forEach(j => push([d, j], 0.75, DRESS_PREF[occ] + JACKET_BONUS[occ])));
    } else {
      tops.forEach(top =>
        pants.forEach(p => push([top, p], 0.4, BOTTOM_PREF[occ]?.pants ?? 1.0)));
    }
  }

  if (candidates.length === 0) return [];

  // ── Score & sort ──
  const scored = candidates
    .map(c => ({
      ...c,
      total: c.wScore * 0.35 + c.oScore * 0.30 + 0.35,
      id: c.items.map(i => i.id).join('|'),
    }))
    .sort((a, b) => b.total - a.total);

  // ── Select up to 3 diverse outfits ──
  const selected = [];
  const used = new Set();

  for (const c of scored) {
    if (selected.length >= 3) break;
    const ids = c.items.map(i => i.id);
    const overlap = ids.filter(id => used.has(id)).length / ids.length;
    if (overlap < 0.6 || selected.length === 0) {
      selected.push(c);
      ids.forEach(id => used.add(id));
    }
  }

  // Relax diversity if still fewer than 3
  if (selected.length < 3) {
    for (const c of scored) {
      if (selected.length >= 3) break;
      if (!selected.find(s => s.id === c.id)) selected.push(c);
    }
  }

  return selected.slice(0, 3).map((c, i) => ({
    id: `outfit_${i}_${c.id}`,
    items: c.items,
    score: Math.round(c.total * 100),
  }));
};
