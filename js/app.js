// AIU Compass - app orchestration.
// Flow: speak -> transcript -> resolve entity -> answer (Groq or local template) -> speak + fly map.

import { resolve, buildIndex } from './correction.js';
import { createMap } from './map3d.js';

const LANGS = [
  { code: 'th-TH', label: 'ไทย', short: 'th', bcp: 'th' },
  { code: 'en-US', label: 'English', short: 'en', bcp: 'en' },
  { code: 'id-ID', label: 'Indonesia', short: 'id', bcp: 'id' },
  { code: 'vi-VN', label: 'Tiếng Việt', short: 'vi', bcp: 'vi' },
  { code: 'zh-CN', label: '中文', short: 'zh', bcp: 'zh' }
];

// Every visible string lives here, so switching a language changes the whole
// screen, not just the answer. Chips, placeholders, buttons and notes all follow.
const UI = {
  th: {
    langLabel: 'ภาษา',
    hintTitle: 'แตะแล้วพูด',
    hintTry: 'ลองพูดว่า “ห้อง IT208 อยู่ไหน”',
    placeholder: '…หรือพิมพ์คำถาม',
    ask: 'ถาม',
    needQuestion: 'พิมพ์คำถามก่อน แล้วกดถาม',
    micLabel: 'แตะแล้วพูด',
    from: 'เริ่มจาก',
    fromNone: 'ยังไม่ได้ระบุ',
    walk: 'จาก',
    walkApprox: 'ระยะทางโดยประมาณ',
    minutes: 'นาที',
    meters: 'เมตร',
    transcript: 'พร้อมเมื่อคุณพร้อม',
    listening: 'กำลังฟัง…',
    nothing: 'ไม่ได้ยินอะไร ลองแตะไมโครโฟนอีกครั้ง',
    micBlocked: 'เบราว์เซอร์นี้ใช้ไมโครโฟนไม่ได้ พิมพ์แทนได้',
    micError: 'ไมโครโฟนมีปัญหา: ',
    notFound: 'ขออภัย ไม่พบสถานที่นี้ในระบบ ลองพิมพ์ชื่อห้องหรือชื่ออาคารอีกครั้ง',
    showMe: 'แสดงบนแผนที่',
    replay: 'ฟังอีกครั้ง',
    voiceMissing: 'เสียงอ่านภาษานี้ยังไม่มีในอุปกรณ์ — ข้อความด้านบนคือคำตอบ',
    hoursNote: 'เวลาข้างต้นมาจากข้อมูลของมหาวิทยาลัยและยังไม่ยืนยัน — โปรดสอบถามที่เคานเตอร์',
    offline: 'โหมดออฟไลน์ · ใช้คำตอบที่บันทึกไว้',
    footer: 'AIU Compass · แผนที่จำลอง ตรวจเวลาเปิดทำการก่อนใช้จริง',
    hint: 'เลือกภาษาที่ต้องการ แล้วถามเป็นเสียงหรือพิมพ์ก็ได้',
    voiceNote: 'เสียงอ่าน',
    answer: 'คำตอบ',
    schematic: 'แผนที่จำลอง · ไม่ได้สัดส่วนจริง',
    originDefault: 'แผนที่จังหวัด'
  },
  en: {
    langLabel: 'Language',
    hintTitle: 'Tap and speak',
    hintTry: 'Try: “where is IT208” or “where is the toilet”',
    placeholder: '…or type your question',
    ask: 'Ask',
    needQuestion: 'Type a question first, then press Ask.',
    micLabel: 'Tap to speak',
    from: 'Starting from',
    fromNone: 'Not set yet',
    walk: 'From',
    walkApprox: 'approx.',
    minutes: 'min walk',
    meters: 'm',
    transcript: 'Ready when you are.',
    listening: 'Listening…',
    nothing: 'Nothing heard. Tap the microphone and try again.',
    micBlocked: 'Speech input is not available in this browser. Type instead.',
    micError: 'Microphone error: ',
    notFound: 'Sorry, I could not find that place. Try a room code such as IT208, or a name such as registrar, clinic, library.',
    showMe: 'Show me on the map',
    replay: 'Replay',
    voiceMissing: 'This device has no voice for that language — the text above is the answer.',
    hoursNote: 'Those hours come from the campus record and are not confirmed yet — please check at the counter.',
    offline: 'Offline mode · cached answers only',
    footer: 'AIU Compass · schematic map, verify office hours before relying on them',
    hint: 'Pick your language, then ask by voice or by typing.',
    voiceNote: 'Spoken',
    answer: 'Answer',
    schematic: 'Illustrative campus layout, not to scale',
    originDefault: 'campus'
  },
  id: {
    langLabel: 'Bahasa',
    hintTitle: 'Ketuk dan bicara',
    hintTry: 'Coba: “di mana IT208” atau “di mana toilet”',
    placeholder: '…atau ketik pertanyaan Anda',
    ask: 'Tanya',
    needQuestion: 'Ketik pertanyaan dulu, lalu tekan Tanya.',
    micLabel: 'Ketuk dan bicara',
    from: 'Mulai dari',
    fromNone: 'Belum diatur',
    walk: 'Dari',
    walkApprox: 'kira-kira',
    minutes: 'menit jalan',
    meters: 'm',
    transcript: 'Siap saat Anda siap.',
    listening: 'Mendengarkan…',
    nothing: 'Tidak ada suara. Ketuk mikrofon dan coba lagi.',
    micBlocked: 'Input suara tidak tersedia di browser ini. Ketik saja.',
    micError: 'Kesalahan mikrofon: ',
    notFound: 'Maaf, tempat itu tidak ditemukan. Coba kode ruang seperti IT208, atau nama seperti registrasi, klinik, perpustakaan.',
    showMe: 'Tunjukkan di peta',
    replay: 'Putar lagi',
    voiceMissing: 'Perangkat ini tidak punya suara untuk bahasa itu — teks di atas adalah jawabannya.',
    hoursNote: 'Jam di atas berasal dari catatan kampus dan belum dikonfirmasi — silakan tanyakan di konter.',
    offline: 'Mode offline · hanya jawaban tersimpan',
    footer: 'AIU Compass · peta skematis, periksa jam kantor sebelum mengandalkannya',
    hint: 'Pilih bahasa Anda, lalu bertanya dengan suara atau ketik.',
    voiceNote: 'Diucapkan',
    answer: 'Jawaban',
    schematic: 'Tata letak kampus ilustratif, tidak berskala',
    originDefault: 'kampus'
  },
  vi: {
    langLabel: 'Ngôn ngữ',
    hintTitle: 'Chạm và nói',
    hintTry: 'Thử: “IT208 ở đâu” hoặc “nhà vệ sinh ở đâu”',
    placeholder: '…hoặc gõ câu hỏi của bạn',
    ask: 'Hỏi',
    needQuestion: 'Hãy gõ câu hỏi rồi nhấn Hỏi.',
    micLabel: 'Chạm và nói',
    from: 'Bắt đầu từ',
    fromNone: 'Chưa đặt',
    walk: 'Từ',
    walkApprox: 'khoảng',
    minutes: 'phút đi bộ',
    meters: 'm',
    transcript: 'Sẵn sàng khi bạn sẵn sàng.',
    listening: 'Đang nghe…',
    nothing: 'Không nghe thấy gì. Chạm micro và thử lại.',
    micBlocked: 'Trình duyệt này không hỗ trợ giọng nói. Hãy gõ.',
    micError: 'Lỗi micro: ',
    notFound: 'Xin lỗi, không tìm thấy địa điểm đó. Thử mã phòng như IT208, hoặc tên như phòng đào tạo, phòng y tế, thư viện.',
    showMe: 'Chỉ trên bản đồ',
    replay: 'Nghe lại',
    voiceMissing: 'Thiết bị này không có giọng đọc cho ngôn ngữ đó — văn bản ở trên là câu trả lời.',
    hoursNote: 'Giờ trên đây lấy từ hồ sơ của trường và chưa được xác nhận — vui lòng hỏi tại quầy.',
    offline: 'Chế độ ngoại tuyến · chỉ câu trả lời đã lưu',
    footer: 'AIU Compass · bản đồ sơ đồ, kiểm tra giờ làm việc trước khi dùng',
    hint: 'Chọn ngôn ngữ, rồi hỏi bằng giọng nói hoặc gõ.',
    voiceNote: 'Đọc',
    answer: 'Trả lời',
    schematic: 'Sơ đồ khuôn viên minh họa, không theo tỉ lệ',
    originDefault: 'khuôn viên'
  },
  zh: {
    langLabel: '语言',
    hintTitle: '点击并说话',
    hintTry: '试试：“IT208 在哪里”或“洗手间在哪里”',
    placeholder: '…或输入你的问题',
    ask: '提问',
    needQuestion: '请先输入问题，再按提问。',
    micLabel: '点击并说话',
    from: '出发地',
    fromNone: '尚未设置',
    walk: '从',
    walkApprox: '约',
    minutes: '分钟步行',
    meters: '米',
    transcript: '准备好了就开始。',
    listening: '正在听…',
    nothing: '没有听到声音。点击麦克风再试一次。',
    micBlocked: '此浏览器不支持语音输入，请改用打字。',
    micError: '麦克风出错：',
    notFound: '抱歉，找不到这个地点。试试 IT208 这样的房间号，或注册处、医务室、图书馆等名称。',
    showMe: '在地图上显示',
    replay: '再听一次',
    voiceMissing: '此设备没有该语言的语音——上面的文字就是答案。',
    hoursNote: '以上时间来自校园记录，尚未确认——请到柜台询问。',
    offline: '离线模式 · 仅使用已保存的答案',
    footer: 'AIU Compass · 示意地图，使用前请核实办公时间',
    hint: '选择语言，然后用语音或打字提问。',
    voiceNote: '朗读',
    answer: '答案',
    schematic: '示意校园布局，非实际比例',
    originDefault: '校园'
  }
};

const SUGGESTIONS = {
  th: ['ห้อง IT208 อยู่ไหน', 'จ่ายค่าหอพักที่ไหน', 'ห้องน้ำอยู่ไหน', 'น้ำดื่มอยู่ไหน'],
  en: ['Where is IT208?', 'Where do I pay the dorm fee?', 'Where is the toilet?', 'Where is the water fountain?'],
  id: ['Di mana IT208?', 'Di mana kantin?', 'Di mana toilet?', 'Di mana air minum?'],
  vi: ['IT208 ở đâu?', 'Nhà ăn ở đâu?', 'Nhà vệ sinh ở đâu?', 'Nước uống ở đâu?'],
  zh: ['IT208 在哪里？', '食堂在哪里？', '洗手间在哪里？', '饮水机在哪里？']
};

const state = {
  lang: 'th-TH',
  campus: null,
  faq: null,
  index: null,
  map: null,
  listening: false,
  busy: false,
  lastPlace: null,
  offline: false,
  groqKey: '',
  model: 'llama-3.3-70b-versatile',
  originBuilding: '',
  originSource: 'unset',
  lastAnswer: null
};

const $ = (sel) => document.querySelector(sel);
const el = {};

const ORIGIN_KEY = 'aiu.origin.building';

function t(key) {
  return (UI[shortLang(state.lang)] || UI.en)[key] || UI.en[key] || key;
}

function init() {
  cacheEls();
  restoreLang();
  buildChips();
  wireEvents();
  boot();
}

function cacheEls() {
  el.map = $('#map');
  el.mic = $('#mic');
  el.transcript = $('#transcript');
  el.typed = $('#typedInput');
  el.ask = $('#askBtn');
  el.answer = $('#answer');
  el.answerLang = $('#answerLang');
  el.answerMain = $('#answerMain');
  el.answerSecondary = $('#answerSecondary');
  el.answerNote = $('#answerNote');
  el.voiceNote = $('#voiceNote');
  el.showMe = $('#showMe');
  el.speakBtn = $('#speakBtn');
  el.suggestions = $('#suggestions');
  el.offlineBar = $('#offlineBar');
  el.langLabel = $('#langLabel');
  el.fromLabel = $('#fromLabel');
  el.fromSel = $('#fromSel');
  el.hintTitle = $('#hintTitle');
  el.hintTry = $('#hintTry');
  el.footer = $('#footer');
  el.stageNote = $('#stageNote');
  el.routeNote = $('#routeNote');
}

function restoreLang() {
  let saved = '';
  try { saved = localStorage.getItem('aiu.lang') || ''; } catch { /* private mode */ }
  if (saved && LANGS.some((l) => l.code === saved)) {
    state.lang = saved;
  } else {
    const nav = (navigator.language || '').toLowerCase();
    const match = LANGS.find((l) => nav.startsWith(l.bcp));
    state.lang = match ? match.code : 'en-US';
  }
  document.documentElement.lang = shortLang(state.lang);
}

function buildChips() {
  const wrap = $('#chips');
  wrap.innerHTML = '';
  for (const l of LANGS) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = l.label;
    b.dataset.code = l.code;
    b.title = 'Answer and interface in ' + l.label;
    b.setAttribute('aria-pressed', String(l.code === state.lang));
    b.addEventListener('click', () => setLang(l.code));
    wrap.appendChild(b);
  }
}

function setLang(code) {
  const changed = state.lang !== code;
  state.lang = code;
  try { localStorage.setItem('aiu.lang', code); } catch { /* ignore */ }
  document.documentElement.lang = shortLang(code);
  for (const c of document.querySelectorAll('.chip')) {
    c.setAttribute('aria-pressed', String(c.dataset.code === code));
  }
  applyChrome();
  if (state.map && state.map.relabel) state.map.relabel();
  stopSpeaking();
  if (state.listening) startListening();
  // Re-answer the last question in the new language so the change is visible.
  // Going back through ask() keeps the FAQ wording in the new language instead
  // of swapping in the generic per-place sentence.
  if (changed && state.lastPlace) {
    if (state.lastQuestion) ask(state.lastQuestion, { speakIt: true });
    else showPlace(state.lastPlace, { speakIt: true });
  }
}

// Every static string on the page follows the selected language.
function applyChrome() {
  el.langLabel.textContent = t('langLabel');
  el.hintTitle.textContent = t('hintTitle');
  el.hintTry.textContent = t('hintTry');
  el.typed.placeholder = t('placeholder');
  el.ask.textContent = t('ask');
  el.fromLabel.textContent = t('from');
  el.showMe.textContent = t('showMe');
  el.speakBtn.textContent = t('replay');
  el.mic.setAttribute('aria-label', t('micLabel'));
  el.footer.textContent = t('footer');
  if (el.stageNote) el.stageNote.textContent = t('schematic');
  if (!el.transcript.dataset.locked) el.transcript.textContent = t('transcript');
  el.offlineBar.textContent = t('offline');
  if (state.lastAnswer) el.answerLang.textContent = (LANGS.find((l) => l.code === state.lang) || {}).label;
  renderSuggestions();
  buildOriginOptions();
  updateRouteNote();
}

function buildingLabel(b) {
  const lang = shortLang(state.lang);
  if (lang === 'th') return b.th;
  if (lang !== 'en' && b.names && b.names[lang]) return b.names[lang];
  return b.en;
}

function buildOriginOptions() {
  if (!state.campus) return;
  const current = state.originBuilding;
  el.fromSel.innerHTML = '';

  // No silent default: until the visitor says where they are, no route is drawn.
  const none = document.createElement('option');
  none.value = '';
  none.textContent = t('fromNone');
  if (!current) none.selected = true;
  el.fromSel.appendChild(none);

  for (const b of state.campus.buildings) {
    const o = document.createElement('option');
    o.value = b.id;
    o.textContent = buildingLabel(b).replace(' Building', '');
    if (b.id === current) o.selected = true;
    el.fromSel.appendChild(o);
  }
}

function sayStatus(key) {
  // No status pill in the header any more: the transcript line carries state.
  el.transcript.dataset.locked = '1';
  el.transcript.textContent = t(key);
  window.setTimeout(() => { delete el.transcript.dataset.locked; }, 2600);
}

async function resolveModel() {
  if (!state.groqKey) return;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: 'Bearer ' + state.groqKey }
    });
    if (!res.ok) return;
    const data = await res.json();
    const ids = (data.data || []).map((m) => m.id);
    if (!ids.length) return;
    if (ids.includes(state.model)) return;
    const preferred = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b'];
    const pick = preferred.find((p) => ids.includes(p)) || ids.find((id) => /llama|gpt-oss|qwen/i.test(id)) || ids[0];
    state.model = pick;
  } catch { /* keep the configured model; the call will fall back locally */ }
}

async function boot() {
  let campus = null;
  let faq = null;
  try {
    const [c, f] = await Promise.all([
      fetch('data/campus.json').then((r) => r.json()),
      fetch('data/faq.json').then((r) => r.json())
    ]);
    campus = c;
    faq = f;
  } catch (err) {
    el.transcript.textContent = 'Data failed to load.';
    console.error('data load failed', err);
    return;
  }

  state.campus = campus;
  state.faq = faq;
  state.index = buildIndex(campus.places);

  let saved = '';
  try { saved = localStorage.getItem(ORIGIN_KEY) || ''; } catch { /* ignore */ }
  if (saved && campus.buildings.some((b) => b.id === saved)) {
    state.originBuilding = saved;
    state.originSource = 'saved';
  }
  try {
    state.map = createMap(el.map, campus);
    state.map.setLang(() => shortLang(state.lang));
    state.map.setOrigin(state.originBuilding);
    state.map.start();
    el.map.onPick = (place) => showPlace(place, { speakIt: false });
  } catch (err) {
    console.error('map failed, text mode only', err);
  }

  applyChrome();
  loadKey();
  resolveModel();
  registerSW();
}

function loadKey() {
  let key = '';
  try { key = localStorage.getItem('aiu.groq.key') || ''; } catch { /* private mode */ }
  const cfg = (typeof window.AIU_CONFIG === 'object' && window.AIU_CONFIG) || {};
  if (!key) key = cfg.groqKey || '';
  if (cfg.model) state.model = cfg.model;
  state.groqKey = key;
}

function registerSW() {
  const secure = location.protocol === 'https:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!('serviceWorker' in navigator) || !secure) return;
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.warn('service worker not registered', err);
  });
}

function renderSuggestions() {
  const list = SUGGESTIONS[shortLang(state.lang)] || SUGGESTIONS.en;
  el.suggestions.innerHTML = '';
  for (const s of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s;
    b.addEventListener('click', () => ask(s));
    el.suggestions.appendChild(b);
  }
}

function setOrigin(buildingId, source, opts) {
  // An empty value means "I have not said where I am" - clear the route.
  state.originBuilding = buildingId || '';
  state.originSource = buildingId ? (source || 'picked') : 'unset';
  try {
    if (buildingId) localStorage.setItem(ORIGIN_KEY, buildingId);
    else localStorage.removeItem(ORIGIN_KEY);
  } catch { /* ignore */ }
  if (state.map) state.map.setOrigin(buildingId || null);
  el.fromSel.value = buildingId || '';
  if (state.lastPlace) {
    showPlace(state.lastPlace, { speakIt: false, keepRoute: true, question: state.lastQuestion });
  } else {
    updateRouteNote();
  }
  if (opts && opts.remember === false) return;
}

// Turn "Starting from" into something the visitor can act on: a distance and a
// walking time next to the map, plus the dashed line itself.
function updateRouteNote() {
  if (!el.routeNote) return;
  const info = state.map && state.map.routeInfo ? state.map.routeInfo() : null;
  if (!info || !state.campus) {
    el.routeNote.classList.remove('show');
    el.routeNote.textContent = '';
    return;
  }
  const from = state.campus.buildings.find((b) => b.id === info.from);
  const to = state.campus.buildings.find((b) => b.id === info.to);
  if (!from || !to) {
    el.routeNote.classList.remove('show');
    return;
  }
  const fromName = buildingLabel(from);
  el.routeNote.textContent = `${t('walk')} ${fromName} · ${t('walkApprox')} ${info.metres} ${t('meters')} · ${info.minutes} ${t('minutes')}`;
  el.routeNote.classList.add('show');
}

function wireEvents() {
  el.mic.addEventListener('click', toggleListen);
  el.ask.addEventListener('click', submitTyped);
  el.typed.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitTyped();
  });
  el.fromSel.addEventListener('change', () => setOrigin(el.fromSel.value, 'picked'));
  el.showMe.addEventListener('click', () => {
    // The answer already framed the building, so a no-op click read as a dead
    // button. This one moves in closer and re-centres, which is visibly different.
    if (!state.lastPlace || !state.map) return;
    state.map.focus(state.lastPlace, { zoom: 2.6 });
    updateRouteNote();
    el.showMe.classList.add('used');
    window.setTimeout(() => el.showMe.classList.remove('used'), 600);
  });
  el.speakBtn.addEventListener('click', () => {
    if (state.lastAnswer) speak(state.lastAnswer.main, state.lastAnswer.lang);
  });

  window.addEventListener('online', () => { state.offline = false; el.offlineBar.classList.remove('show'); });
  window.addEventListener('offline', () => { state.offline = true; el.offlineBar.classList.add('show'); });

  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'l') toggleListen();
    if (k === 't') el.typed.focus();
    if (k === 'o') { state.offline = !state.offline; el.offlineBar.classList.toggle('show', state.offline); }
    if (k === 'r') { if (state.map) state.map.reset(); }
    if (k === 's') promptForKey();
  });
}

function promptForKey() {
  const key = window.prompt('Groq API key (kept in this browser only):', state.groqKey ? '••••' + state.groqKey.slice(-4) : '');
  if (key && !key.startsWith('••••')) {
    state.groqKey = key.trim();
    try { localStorage.setItem('aiu.groq.key', state.groqKey); } catch { /* ignore */ }
  }
}

/* ---------- speech in ---------- */

let recognition = null;

function speechSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function toggleListen() {
  if (state.listening) stopListening();
  else startListening();
}

function startListening() {
  if (!speechSupported()) {
    el.transcript.textContent = t('micBlocked');
    el.typed.focus();
    return;
  }
  if (state.busy) return;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new Rec();
  recognition.lang = state.lang;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  state.listening = true;
  el.mic.classList.add('listening');
  el.transcript.classList.add('live');
  el.transcript.textContent = t('listening');

  let finalText = '';

  recognition.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    el.transcript.textContent = (finalText + ' ' + interim).trim() || t('listening');
  };
  recognition.onerror = (ev) => {
    if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
      el.transcript.textContent = t('micError') + ev.error + '. ' + t('micBlocked');
    }
  };
  recognition.onend = () => {
    state.listening = false;
    el.mic.classList.remove('listening');
    el.transcript.classList.remove('live');
    const text = finalText.trim();
    if (text) ask(text);
    else if (!el.transcript.textContent.startsWith(t('micError'))) el.transcript.textContent = t('nothing');
  };
  try { recognition.start(); } catch { state.listening = false; el.mic.classList.remove('listening'); }
}

function stopListening() {
  if (recognition) { try { recognition.stop(); } catch { /* ignore */ } }
}

/* ---------- answer ---------- */

function localisedHours(place, lang) {
  const raw = place.hours || '';
  if (/^not confirmed/i.test(raw)) return '';
  const table = (state.campus && state.campus.meta && state.campus.meta.hoursI18n) || {};
  if (lang === 'en') return raw;
  const row = table[raw];
  return row && row[lang] ? row[lang] : raw;
}

// The free-text description of each place only exists in Thai and English.
// The hours, however, are fully translated, so no answer mixes Indonesian or
// Chinese labels with English day names any more.
function localAnswer(place, lang) {
  const hours = localisedHours(place, lang);
  const end = (s) => (/[.!?\u3002]$/.test(s) ? s : s + '.');
  if (lang === 'th') {
    const bits = [place.th.replace(/\s+$/, '')];
    if (hours) bits.push('เวลาเปิดทำการ ' + hours);
    return bits.join(' ');
  }
  if (lang === 'en') {
    const bits = [end(place.en)];
    if (hours) bits.push('Hours: ' + hours);
    return bits.join(' ');
  }
  const label = { id: 'Jam buka', vi: 'Giờ mở cửa', zh: '开放时间' };
  if (lang === 'zh') return `${place.en}。${label.zh}：${hours || '—'}。`;
  return `${end(place.en)} ${label[lang] || label.id}: ${hours || '-'}.`;
}

function shortLang(code) {
  const m = LANGS.find((l) => l.code === code);
  return m ? m.short : 'en';
}

function faqHit(place, question) {
  if (!state.faq) return null;
  const q = question.toLowerCase();
  for (const entry of state.faq.entries) {
    if (place && entry.place === place.id) return entry;
    if (entry.patterns.some((p) => q.includes(p.toLowerCase()))) return entry;
  }
  return null;
}

function submitTyped() {
  const q = el.typed.value.trim();
  if (q) {
    ask(q);
    return;
  }
  // An empty box used to replay the previous answer, which looked like a bug.
  el.typed.focus();
  sayStatus('needQuestion');
}

async function ask(question, opts) {
  if (state.busy || !question) return;
  state.busy = true;
  state.lastQuestion = question;
  el.transcript.dataset.locked = '1';
  el.transcript.textContent = question;
  const lang = shortLang(state.lang);
  const hit = resolve(question, state.index);
  const place = hit.place;
  state.lastPlace = place;

  const local = place ? localAnswer(place, lang) : null;
  const localEn = place ? localAnswer(place, 'en') : null;

  if (place && state.map) state.map.focus(place);

  if (!place) {
    // A failed lookup must not leave the previous building lit and the previous
    // route drawn: the map would contradict the answer.
    if (state.map) state.map.clear();
    showAnswer({
      lang: state.lang,
      main: t('notFound'),
      secondary: null,
      place: null
    });
    state.busy = false;
    return;
  }

  const faqEntry = faqHit(place, question);
  const useNetwork = !state.offline && navigator.onLine !== false && Boolean(state.groqKey) && !faqEntry;

  if (useNetwork) {
    try {
      const json = await askGroq(question, place, lang);
      if (json) {
        showAnswer({
          lang: state.lang,
          main: json.answer,
          secondary: lang === 'en' ? null : (json.answer_en || localEn),
          secondaryLabel: lang === 'en' ? null : 'English',
          place,
          source: 'AI'
        });
        if (opts && opts.speakIt === false) stopSpeaking();
        state.busy = false;
        return;
      }
    } catch (err) {
      // fall through to the local answer - never show an error to a visitor
    }
  }

  const textLocal = faqEntry && faqEntry.answers ? faqEntry.answers[lang] || faqEntry.answers.en : local;
  // The English line under the answer must say the same thing as the answer
  // above it. Preferring the generated place text made the toilet answer say
  // "every floor" in Thai and "Hours: Open with the building" in English.
  const textEn = faqEntry && faqEntry.answers ? faqEntry.answers.en : (localEn || local);
  showAnswer({
    lang: state.lang,
    main: textLocal,
    secondary: lang === 'en' ? null : textEn,
    secondaryLabel: lang === 'en' ? null : 'English',
    place
  });
  if (opts && opts.speakIt === false) stopSpeaking();
  state.busy = false;
}

async function askGroq(question, place, lang) {
  const sys = [
    'You are the AIU Compass campus concierge for Asia-Pacific International University.',
    'Answer ONLY from the CAMPUS RECORD provided. Reply with strict JSON:',
    '{"answer": string, "answer_en": string}',
    'Rules: answer in the user language; at most 2 sentences; repeat the room code and floor if present;',
    'never invent opening hours, prices or room numbers.'
  ].join(' ');

  const user = JSON.stringify({
    question,
    answer_language: lang,
    campus_record: {
      en: place.en, th: place.th, room: place.room || null,
      floor: place.floor, hours: place.hours,
      building_en: buildingName(place, 'en'), building_th: buildingName(place, 'th')
    }
  });

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + state.groqKey
    },
    body: JSON.stringify({
      model: state.model,
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ]
    })
  });
  if (!res.ok) throw new Error('groq ' + res.status);
  const data = await res.json();
  const raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!raw) throw new Error('empty');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed.answer !== 'string') throw new Error('bad shape');
  return parsed;
}

function buildingName(place, lang) {
  const b = state.campus.buildings.find((x) => x.id === place.building);
  if (!b) return '';
  return lang === 'th' ? b.th : b.en;
}

function showAnswer({ lang, main, secondary, secondaryLabel, place, source }) {
  el.answer.classList.add('show');
  document.body.classList.add('has-answer');
  state.lastAnswer = { main, lang };
  el.answerLang.textContent = (LANGS.find((l) => l.code === lang) || {}).label || lang;
  el.answerMain.textContent = main || '';
  if (secondary && secondaryLabel) {
    el.answerSecondary.style.display = 'block';
    el.answerSecondary.innerHTML = '<b>' + secondaryLabel + '</b><br>' + escapeHtml(secondary);
  } else {
    el.answerSecondary.style.display = 'none';
  }
  el.showMe.style.display = place ? 'inline-block' : 'none';
  el.speakBtn.style.display = 'inline-block';

  const globallyVerified = state.campus && state.campus.meta && state.campus.meta.hoursVerified === true;
  const hoursUnverified = Boolean(place && place.hours && !globallyVerified && place.hoursVerified !== true);
  el.answerNote.classList.toggle('show', Boolean(hoursUnverified));
  el.answerNote.textContent = hoursUnverified ? t('hoursNote') : '';

  updateRouteNote();
  if (window.innerWidth < 860) {
    requestAnimationFrame(() => {
      el.answer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
  speak(main, lang, { showWarning: true });
}

function showPlace(place, opts) {
  state.lastPlace = place;
  const lang = shortLang(state.lang);
  showAnswer({
    lang: state.lang,
    main: localAnswer(place, lang),
    secondary: lang === 'en' ? null : localAnswer(place, 'en'),
    secondaryLabel: lang === 'en' ? null : 'English',
    place
  });
  if (opts && opts.speakIt === false) stopSpeaking();
}

// Small debug hook so the route state can be asserted from a test harness.
window.AIU = {
  get state() { return state; },
  mapDebug: () => (state.map && state.map.debug ? state.map.debug() : null)
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- speech out ---------- */

function pickVoice(lang) {
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  if (!voices.length) return null;
  const exact = voices.find((v) => v.lang === lang);
  if (exact) return exact;
  const base = String(lang).split('-')[0].toLowerCase();
  // Prefer a local voice: the demo phone may be offline on stage.
  const sameBase = voices.filter((v) => v.lang.toLowerCase().split('-')[0] === base);
  return sameBase.find((v) => v.localService) || sameBase[0] || null;
}

function stopSpeaking() {
  if (window.speechSynthesis) speechSynthesis.cancel();
}

function speak(text, lang, opts) {
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const v = pickVoice(lang);
  const wanted = shortLang(lang);
  const got = v ? v.lang.toLowerCase().split('-')[0] : '';
  const missing = wanted !== 'en' && got !== wanted;

  // A Replay button that cannot speak is a dead control. When the device really
  // has no voice for this language, disable it rather than let it do nothing.
  if (el.speakBtn) {
    const dead = missing && voices.length > 0;
    el.speakBtn.disabled = dead;
    el.speakBtn.setAttribute('aria-disabled', dead ? 'true' : 'false');
    el.speakBtn.title = dead ? t('voiceMissing') : '';
  }

  // Name the voice language in the UI so it is clear what is being spoken.
  if (el.voiceNote && opts && opts.showWarning) {
    el.voiceNote.textContent = missing ? t('voiceMissing') : '';
    el.voiceNote.classList.toggle('show', missing);
  }

  if (!text || !window.speechSynthesis) return;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.98;
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

window.addEventListener('load', () => {
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { /* warm the voice list */ };
});

init();
