// AIU Compass - campus vocabulary layer.
// Pure functions, no DOM. Imported by the browser app and by node --test.

const TH_DIGIT = {
  '\u0E50': '0', '\u0E51': '1', '\u0E52': '2', '\u0E53': '3', '\u0E54': '4',
  '\u0E55': '5', '\u0E56': '6', '\u0E57': '7', '\u0E58': '8', '\u0E59': '9'
};

// Thai number words, longest first so "สิบ" is not eaten by "สิบเอ็ด".
const TH_NUM_WORDS = [
  ['ศูนย์', '0'], ['หนึ่ง', '1'], ['สอง', '2'], ['สาม', '3'], ['สี่', '4'],
  ['ห้า', '5'], ['หก', '6'], ['เจ็ด', '7'], ['แปด', '8'], ['เก้า', '9']
];

// Thai vowels, tone marks and diacritics - removed to build a consonant skeleton.
const TH_MARKS = /[\u0E30-\u0E3A\u0E40-\u0E4E\u0E47-\u0E4F]/g;

export function normalize(input) {
  let s = String(input == null ? '' : input).normalize('NFC');
  s = s.replace(/[\u0E50-\u0E59]/g, (d) => TH_DIGIT[d] || d);
  for (const [word, digit] of TH_NUM_WORDS) s = s.split(word).join(digit);
  s = s.toLowerCase();
  // Keep Thai combining marks: the Thai block is a letter system, not punctuation.
  s = s.replace(/[^\p{L}\p{N}\s\u0E00-\u0E7F]/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

export function compact(input) {
  return normalize(input).replace(/\s+/g, '');
}

export function thaiSkeleton(input) {
  const s = normalize(input);
  if (!/[\u0E00-\u0E7F]/.test(s)) return s.replace(/\s+/g, '');
  return s.replace(TH_MARKS, '').replace(/\s+/g, '');
}

export function buildIndex(places, buildingsArg) {
  const byId = new Map();
  const aliases = [];
  for (const place of places) {
    byId.set(place.id, place);
    const list = new Set([place.id, place.room || '', ...(place.aliases || [])]);
    for (const raw of list) {
      const c = compact(raw);
      if (!c) continue;
      aliases.push({ place, alias: c, raw: String(raw) });
    }
  }
  aliases.sort((a, b) => b.alias.length - a.alias.length);
  // A room code that is not in the record still tells us which building it is in.
  // Prefer a place that is the whole building; fall back to the building's main
  // service point (library desk, registrar) so LIB101 / AD101 still answer.
  const placeByBuilding = (buildingId) =>
    places.find((p) => p.building === buildingId && p.id === buildingId + '_building') ||
    places.find((p) => p.building === buildingId && /\bbuilding\b/i.test(p.en || '')) ||
    places.find((p) => p.building === buildingId) ||
    null;
  const buildings = places.map((p) => p.building).filter(Boolean);
  return { byId, aliases, places, placeByBuilding, buildingMeta: Array.isArray(buildingsArg) ? buildingsArg : [], buildings: [...new Set(buildings)] };
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const t = prev; prev = cur; cur = t;
  }
  return prev[n];
}

function similarity(a, b) {
  const len = Math.max(a.length, b.length);
  if (!len) return 0;
  return 1 - levenshtein(a, b) / len;
}

// Best match of a short alias inside a longer utterance.
function windowScore(text, alias) {
  if (!text || !alias) return 0;
  if (text.length <= alias.length) return similarity(text, alias);
  const widths = [alias.length];
  if (alias.length > 4) widths.push(alias.length - 1, alias.length + 1);
  let best = 0;
  for (const w of widths) {
    for (let i = 0; i + w <= text.length; i++) {
      const s = similarity(text.slice(i, i + w), alias);
      if (s > best) best = s;
    }
  }
  return best;
}

// Room codes: IT208, IT 208, ที208, ห้อง 208, T208, plus LIB101 / SC101 / AD101.
// `compact` removes spaces, so the prefix cannot be boundary-anchored. Longest
// alternatives come first, and each must be followed directly by digits, so
// "library" or "floor3" cannot match.
const ROOM_RE = /(lib|it|ti|t|sc|ad|l|s|a)(\d{1,4})/;
// Thai room forms: "ที208" and "ห้อง208" (compact strips the space).
const ROOM_RE_TH = /(?:\u0E17\u0E35|\u0E2B\u0E49\u0E2D\u0E07)(\d{1,4})/;

export function resolve(input, index) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return { place: null, id: null, confidence: 0, method: 'empty', alternatives: [] };

  const c = compact(raw);
  if (!c) return { place: null, id: null, confidence: 0, method: 'empty', alternatives: [] };

  // 1. Room code, e.g. T208 / ที 208 / ห้อง 208 / IT 208.
  const thRoom = ROOM_RE_TH.exec(c);
  const room = thRoom ? null : ROOM_RE.exec(c);
  if (thRoom || room) {
    const letter = thRoom ? 'T' : room[1].toUpperCase();
    const digits = String(Number(thRoom ? thRoom[1] : room[2]));
    const id = (letter + digits).toLowerCase();
    // IT208 is stored under the legacy id t208, so IT and T both mean that record.
    const isIt = letter === 'IT' || letter === 'TI' || letter === 'T';
    const direct = index.byId.get(id) || (isIt ? index.byId.get('t' + digits) : null);
    if (direct) {
      return { place: direct, id: direct.id, confidence: 0.97, method: 'room_regex', alternatives: [] };
    }
    // A floor number with no recorded room: answer with the building it is in
    // rather than "not found", which made the hint's promise untrue. The floor
    // must actually exist in that building, so T999 stays not-found.
    const block = { IT: 'it', TI: 'it', T: 'it', LIB: 'library', L: 'library', SC: 'science', S: 'science', AD: 'admin', A: 'admin' }[letter];
    const floorNo = Number(digits.slice(0, 1));
    const bMeta = block && index.buildingMeta ? index.buildingMeta.find((b) => b.id === block) : null;
    const maxFloor = bMeta ? Number(bMeta.floors) || 1 : 0;
    const building = block && index.placeByBuilding ? index.placeByBuilding(block) : null;
    if (building && floorNo >= 1 && floorNo <= maxFloor) {
      return { place: building, id: building.id, confidence: 0.62, method: 'room_building', alternatives: [], unrecordedRoom: id.toUpperCase() };
    }
  }

  // 2. A bare room number, the way students actually ask: "208" or "ห้อง 208".
  // It is ambiguous between buildings, so it answers with the building that owns
  // that floor and says the room is not individually recorded. The match is
  // anchored: a query that also names a place ("where is IT208") must not be
  // captured here, and the room-code regex above handles those.
  const bare = /^(?:[\u0E2B\u0E49\u0E2D\u0E07\u0E17\u0E35]*|room)?(\d{3})$/.exec(c);
  if (bare) {
    const n = Number(bare[1]);
    const floorNo = Number(String(n)[0]);
    // 2xx on this campus means the IT building's second floor; 1xx means the
    // Administration ground floor. No other block has a documented mapping, so
    // anything else stays not-found rather than guessing.
    const guessBlock = floorNo === 2 ? 'it' : floorNo === 1 ? 'admin' : null;
    const bMeta = guessBlock && index.buildingMeta ? index.buildingMeta.find((b) => b.id === guessBlock) : null;
    const place = guessBlock && index.placeByBuilding ? index.placeByBuilding(guessBlock) : null;
    if (place && bMeta && floorNo <= (Number(bMeta.floors) || 1)) {
      return { place, id: place.id, confidence: 0.5, method: 'bare_room', alternatives: [], unrecordedRoom: String(n) };
    }
  }

  // 3. Alias containment, longest alias wins.
  const hits = [];
  for (const entry of index.aliases) {
    const len = entry.alias.length;
    const nonAscii = /[^\x00-\x7F]/.test(entry.alias);
    const longEnough = len >= 4 || (nonAscii && len >= 3);
    if (!longEnough) continue;
    if (c.includes(entry.alias)) hits.push(entry);
  }
  if (hits.length) {
    hits.sort((a, b) => b.alias.length - a.alias.length);
    let top = hits[0];
    // "…where do I pay my dormitory fee…" contains "dormitory", which is a longer
    // alias than "dorm fee", so it answered with Solomon Hall. A fee question is
    // about the counter that takes the money, not the building the fee is for.
    const PAY_RE = /\b(fee|fees|tuition|cashier|dorm fee|dormitory fee|housing fee)\b|ค่าเทอม|ค่าหอ|ค่าเล่าเรียน|biaya|học phí|学费|缴费/i;
    if (/^dorm_/.test(top.place.id) && PAY_RE.test(raw)) {
      const fin = index.byId.get('finance');
      if (fin) top = { place: fin, alias: top.alias };
    }
    const second = hits.find((h) => h.place.id !== top.place.id);
    const margin = second ? top.alias.length - second.alias.length : top.alias.length;
    const confidence = margin >= 2 ? 0.94 : 0.72;
    return {
      place: top.place,
      id: top.place.id,
      confidence,
      method: 'alias',
      alternatives: hits.slice(1, 4).map((h) => h.place.id)
    };
  }

  // 4. Fuzzy match against aliases (typos, spacing, partial phrasing).
  let best = { score: 0, place: null };
  for (const entry of index.aliases) {
    const score = windowScore(c, entry.alias);
    if (score > best.score) best = { score, place: entry.place };
  }
  if (best.place && best.score >= 0.86) {
    return { place: best.place, id: best.place.id, confidence: 0.82, method: 'fuzzy', alternatives: [] };
  }

  // 5. Thai consonant skeleton, last resort.
  // Only for Thai input. Running the skeleton pass over English text made
  // "Where is the rocket launch pad?" resolve to Esther Hall, because stripping
  // vowels from Latin words matches almost anything.
  if (!/[\u0E00-\u0E7F]/.test(raw)) {
    return { place: null, id: null, confidence: 0, method: 'none', alternatives: [] };
  }
  const sk = thaiSkeleton(raw);
  let skBest = { score: 0, place: null };
  for (const entry of index.aliases) {
    const aliasSk = thaiSkeleton(entry.alias);
    if (aliasSk.length < 3) continue;
    const score = windowScore(sk, aliasSk);
    if (score > skBest.score) skBest = { score, place: entry.place };
  }
  if (skBest.place && skBest.score >= 0.85) {
    return { place: skBest.place, id: skBest.place.id, confidence: 0.74, method: 'thai_skeleton', alternatives: [] };
  }

  return { place: null, id: null, confidence: 0, method: 'none', alternatives: [] };
}

export function summarise(place) {
  if (!place) return '';
  const parts = [place.en];
  if (place.hours) parts.push(`Hours: ${place.hours}`);
  return parts.join('. ');
}
