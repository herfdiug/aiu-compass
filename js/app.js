// AIU Compass - app orchestration.
// Flow: speak -> transcript -> resolve entity -> answer (Groq or local template) -> speak + fly map.

import { resolve, buildIndex } from './correction.js';
import { createMap } from './map3d.js';

const LANGS = [
  { code: 'th-TH', label: 'ไทย', short: 'th', bcp: 'th' },
  { code: 'en-US', label: 'English', short: 'en', bcp: 'en' },
  { code: 'id-ID', label: 'Bahasa Indonesia', short: 'id', bcp: 'id' },
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
    answerLabel: 'คำตอบ',
    searching: 'กำลังค้นหา',
    symptomLead: 'ถ้าอาการรุนแรงหรือเร่งด่วน ให้ไปที่ห้องพยาบาลทันที หรือติดต่อเจ้าหน้าที่ความปลอดภัยของมหาวิทยาลัย',
    floorsLabel: 'ชั้น',
    alsoInBuilding: 'ในอาคารนี้ยังมี:',
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
    micDenied: 'ยังไม่ได้อนุญาตให้ใช้ไมโครโฟน เปิดสิทธิ์ในเบราว์เซอร์แล้วลองใหม่ หรือพิมพ์แทน',
    micError: 'ไมโครโฟนมีปัญหา: ',
    notFound: 'ขออภัย ไม่พบสถานที่นี้ในระบบ ลองพิมพ์ชื่อห้องหรือชื่ออาคารอีกครั้ง',
    unrecordedRoom: 'ไม่มีข้อมูลห้อง {code} ในระบบ แต่ห้องนี้อยู่ในอาคารนี้',
    alreadyHere: 'คุณอยู่ที่นี่แล้ว',
    tapQuestion: 'สถานที่นี้คือที่ไหน: {place}',
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
    answerLabel: 'Answer',
    searching: 'searching',
    symptomLead: 'If this is urgent or severe, go to the clinic now, or call campus security for help.',
    floorsLabel: 'floors',
    alsoInBuilding: 'Also in this building:',
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
    micDenied: 'Microphone permission was refused. Allow it in the browser and try again, or type instead.',
    micError: 'Microphone error: ',
    notFound: 'Sorry, I could not find that place. Try a room code such as IT208, or a name such as registrar, clinic, library.',
    unrecordedRoom: 'Room {code} is not in the campus record, but it is in this building.',
    alreadyHere: 'You are already here.',
    tapQuestion: 'Where is this: {place}',
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
    answerLabel: 'Jawaban',
    searching: 'mencari',
    symptomLead: 'Jika ini darurat atau berat, segera ke klinik, atau hubungi keamanan kampus.',
    floorsLabel: 'lantai',
    alsoInBuilding: 'Juga di gedung ini:',
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
    micDenied: 'Izin mikrofon ditolak. Izinkan di browser lalu coba lagi, atau ketik saja.',
    micError: 'Kesalahan mikrofon: ',
    notFound: 'Maaf, tempat itu tidak ditemukan. Coba kode ruang seperti IT208, atau nama seperti registrasi, klinik, perpustakaan.',
    unrecordedRoom: 'Ruang {code} tidak ada di catatan kampus, tetapi berada di gedung ini.',
    alreadyHere: 'Anda sudah di sini.',
    tapQuestion: 'Di mana ini: {place}',
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
    answerLabel: 'Trả lời',
    searching: 'đang tìm',
    symptomLead: 'Nếu đây là trường hợp khẩn cấp hoặc nặng, hãy đến phòng y tế ngay, hoặc gọi bảo vệ trường.',
    floorsLabel: 'tầng',
    alsoInBuilding: 'Cũng trong tòa nhà này:',
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
    micDenied: 'Quyền dùng micro bị từ chối. Hãy cho phép trong trình duyệt rồi thử lại, hoặc gõ câu hỏi.',
    micError: 'Lỗi micro: ',
    notFound: 'Xin lỗi, không tìm thấy địa điểm đó. Thử mã phòng như IT208, hoặc tên như phòng đào tạo, phòng y tế, thư viện.',
    unrecordedRoom: 'Phòng {code} không có trong hồ sơ của trường, nhưng nằm trong tòa nhà này.',
    alreadyHere: 'Bạn đã ở đây rồi.',
    tapQuestion: 'Đây là đâu: {place}',
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
    answerLabel: '回答',
    searching: '正在查找',
    symptomLead: '如果情况紧急或严重，请立即前往医务室，或联系校园保安。',
    floorsLabel: '层',
    alsoInBuilding: '这栋楼里还有：',
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
    micDenied: '麦克风权限被拒绝。请在浏览器中允许后重试，或改用打字。',
    micError: '麦克风出错：',
    notFound: '抱歉，找不到这个地点。试试 IT208 这样的房间号，或注册处、医务室、图书馆等名称。',
    unrecordedRoom: '校园记录中没有 {code} 房间，但它在这栋楼里。',
    alreadyHere: '你已经在这里了。',
    tapQuestion: '这里是哪里：{place}',
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
  el.mapReset = $('#mapReset');
  el.langLabel = $('#langLabel');
  el.langLabelText = $('#langLabelText');
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
  // of swapping in the generic per-place sentence. A failed lookup has no place,
  // so it used to keep the old language's "not found" body under a new badge.
  if (changed && state.lastPlace) {
    if (state.lastQuestion) ask(state.lastQuestion, { speakIt: true, route: false });
    else showPlace(state.lastPlace, { speakIt: true });
  } else if (changed && state.lastQuestion) {
    ask(state.lastQuestion, { speakIt: true, route: false });
  }
}

// Every static string on the page follows the selected language.
function applyChrome() {
  el.langLabelText.textContent = t('langLabel');
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
  // Before an answer, the card header is the only English word on an otherwise
  // fully translated page ("Answer" in the heading of the card).
  el.answerLang.textContent = state.lastAnswer
    ? (LANGS.find((l) => l.code === state.lang) || {}).label
    : t('answerLabel');
  el.answerLang.classList.toggle('latin', /^[A-Za-z]/.test(el.answerLang.textContent || ''));
  renderSuggestions();
  buildOriginOptions();
  updateRouteNote();
}

function buildingLabel(b, langArg) {
  const lang = langArg || shortLang(state.lang);
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
  state.index = buildIndex(campus.places, campus.buildings);

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
    el.map.onPick = (place) => {
      // A tap is its own turn: forget the previous typed question so switching
      // language later re-renders the tapped place, not the old search.
      state.lastQuestion = '';
      showPlace(place, { speakIt: false });
    };
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
function updateRouteNote(langArg) {
  if (!el.routeNote) return;
  const lang = shortLang(langArg || state.lang);
  const tt = (key) => (UI[lang] || UI.en)[key] || UI.en[key] || key;
  const info = state.map && state.map.routeInfo ? state.map.routeInfo() : null;
  if (!info || !state.campus) {
    // Standing where you already are is not an error, and silently hiding the
    // line read as "the route broke". Say it instead.
    const dbg = state.map && state.map.debug ? state.map.debug() : null;
    if (dbg && dbg.originId && dbg.selectedId && dbg.originId === dbg.selectedId) {
      el.routeNote.textContent = tt('alreadyHere');
      el.routeNote.classList.add('show');
      return;
    }
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
  const fromName = buildingLabel(from, lang);
  el.routeNote.textContent = `${tt('walk')} ${fromName} · ${tt('walkApprox')} ${info.metres} ${tt('meters')} · ${info.minutes} ${tt('minutes')}`;
  el.routeNote.classList.add('show');
}

function wireEvents() {
  el.mic.addEventListener('click', toggleListen);
  el.ask.addEventListener('click', submitTyped);
  el.typed.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitTyped();
  });
  el.fromSel.addEventListener('change', () => setOrigin(el.fromSel.value, 'picked'));
  el.mapReset.addEventListener('click', () => {
    if (!state.map) return;
    state.map.reset();
    updateRouteNote();
  });
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
    if (state.lastAnswer) speak(state.lastAnswer.main, state.lastAnswer.lang, { showWarning: true });
  });

  window.addEventListener('online', () => { state.offline = false; el.offlineBar.classList.remove('show'); });
  window.addEventListener('offline', () => { state.offline = true; el.offlineBar.classList.add('show'); });

  // Developer shortcuts used to fire on a bare keypress, so typing "s" anywhere
  // outside the input opened an API-key prompt with no context. They now require
  // an explicit ?dev=1 in the URL, which no visitor or student will type.
  let devMode = false;
  try { devMode = new URLSearchParams(location.search).has('dev'); } catch { /* old browser */ }
  if (devMode) {
    document.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === 'l') toggleListen();
      if (k === 't') el.typed.focus();
      if (k === 'o') { state.offline = !state.offline; el.offlineBar.classList.toggle('show', state.offline); }
      if (k === 'r') { if (state.map) state.map.reset(); }
      if (k === 's') promptForKey();
    });
  }
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
  // Headless browsers (and some Android WebViews) never fire onend when there is
  // no microphone, so the button stayed on "Listening…" forever. A watchdog stops
  // it and says what happened.
  const watchdog = window.setTimeout(() => {
    if (!state.listening) return;
    stopListening();
    // If the engine never even fired onend, reset the UI by hand.
    window.setTimeout(() => {
      if (!state.listening) return;
      state.listening = false;
      el.mic.classList.remove('listening');
      el.transcript.classList.remove('live');
      if (!finalText.trim()) el.transcript.textContent = t('nothing');
    }, 800);
  }, 8000);
  const clearWatchdog = () => window.clearTimeout(watchdog);

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
    clearWatchdog();
    if (ev.error === 'aborted' || ev.error === 'no-speech') return;
    // "not-allowed" means the visitor (or the browser) refused the microphone.
    // Saying "this browser does not support voice" sent them to the wrong fix.
    const denied = ev.error === 'not-allowed' || ev.error === 'service-not-allowed';
    el.transcript.textContent = denied
      ? t('micDenied')
      : t('micError') + ev.error + '. ' + t('micBlocked');
  };
  recognition.onend = () => {
    clearWatchdog();
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
// The hours, building name and floor are localized, so the other three
// languages get a composed answer instead of English prose with a translated
// "Jam buka" glued on (which is what fell back and read as broken).
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
  // A building synthesised from the building table has no description of its own,
  // so the composed answer names it and gives the floor count.
  if (place.synthetic) {
    const b = state.campus && state.campus.buildings.find((x) => x.id === place.building);
    const name = b ? buildingLabel(b) : '';
    const floors = b ? Number(b.floors) || 0 : 0;
    const label = { id: 'Jam buka', vi: 'Giờ mở cửa', zh: '开放时间' }[lang] || 'Hours';
    const floorsWord = { id: 'lantai', vi: 'tầng', zh: '层' }[lang] || 'floors';
    let t = name + (floors ? ' · ' + floors + ' ' + floorsWord : '') + (hours ? ' · ' + label + ': ' + hours : '');
    if (lang === 'zh') return t.replace(/ · /g, '，') + '。';
    return t + '.';
  }
  const words = {
    id: { hours: 'Jam buka', floor: 'Lantai' },
    vi: { hours: 'Giờ mở cửa', floor: 'Tầng' },
    zh: { hours: '开放时间', floor: '层' }
  }[lang] || { hours: 'Hours', floor: 'Floor' };
  const b = state.campus && state.campus.buildings.find((x) => x.id === place.building);
  const bName = b ? buildingLabel(b) : '';
  const room = place.room || '';
  // Only keep a room *code* ("IT208"); a prose room string is English and would
  // put untranslated words back into the answer. The building name covers it.
  const roomCode = /^[A-Z]{1,4}\s?\d{1,4}$/.test(room) ? room : '';
  // Compose: "<room code> · <building>, <floor>F · <hours label>: <hours>"
  const bits = [];
  if (roomCode) bits.push(roomCode);
  if (bName) bits.push(bName);
  if (Number(place.floor) > 1) bits.push(words.floor + ' ' + place.floor);
  let text = bits.join(' · ');
  if (!text) text = bName || room || '';
  if (hours) text += (text ? ' · ' : '') + words.hours + ': ' + hours;
  if (lang === 'zh') return text.replace(/ · /g, '，') + '。';
  return text + '.';
}

function shortLang(code) {
  const m = LANGS.find((l) => l.code === code);
  return m ? m.short : 'en';
}

function faqHit(place, question) {
  if (!state.faq || !place) return null;
  const q = question.toLowerCase();
  // An entry may only answer for the place the resolver already picked. A global
  // scan let "Where is the library and is the clinic open" highlight the Library
  // while the clinic entry's text replaced the answer — the map and the card
  // described two different buildings.
  for (const entry of state.faq.entries) {
    if (entry.place !== place.id) continue;
    if (entry.patterns.some((p) => p && q.includes(p.toLowerCase()))) return entry;
  }
  // The resolved place's own entry, even with no pattern hit: the FAQ text is
  // better written than the generated sentence.
  return state.faq.entries.find((e) => e.place === place.id && e.id === place.id) || null;
}

function submitTyped() {
  const q = el.typed.value.trim();
  if (q) {
    ask(q);
    return;
  }
  // An empty box used to replay the previous answer, which looked like a bug.
  // The hint now appears on the input itself: on a phone the transcript line is
  // scrolled out of view, so a message there read as "nothing happened".
  el.typed.focus();
  const original = el.typed.dataset.ph || el.typed.placeholder;
  el.typed.dataset.ph = original;
  el.typed.placeholder = t('needQuestion');
  el.typed.classList.add('need-input');
  el.typed.setAttribute('aria-invalid', 'true');
  window.setTimeout(() => {
    if (el.typed.dataset.ph) el.typed.placeholder = el.typed.dataset.ph;
    el.typed.classList.remove('need-input');
    el.typed.removeAttribute('aria-invalid');
  }, 2600);
  // Do not replace the question line here: if an answer is on screen, changing
  // the question text would leave the card answering a question that is no
  // longer shown. The input itself carries the hint.
}

/* "from the library to the cafeteria" / "rute dari perpustakaan ke kantin" —
   an explicit origin in the question used to be ignored, so the app answered
   with the origin's own hours and said "you are already here". */
const ROUTE_RE = /(?:\bfrom\b|\bdari\b|\btu\b|\bde\b|จาก|ตั้งแต่)\s+(.+?)\s+(?:\bto\b|\bke\b|\bden\b|ถึง|ไป)\s+(.+?)[?.!]*$/i;

// A question about a symptom, not about the clinic's hours. Kept narrow: it is
// only used to put first-aid advice in front of the timetable.
const SYMPTOM_RE = /ปวด|เจ็บ|เป็นไข้|ไม่สบาย|ท้องเสีย|มีอาการ|headache|head ache|migraine|fever|nausea|dizzy|sick|ill\b|pain|hurt|sakit|demam|pusing|mual|đau|sốt|chóng mặt|buồn nôn|头疼|頭疼|发烧|發燒|恶心|噁心|头晕|頭暈|不舒服/i;

function takeRoute(question, lang) {
  const m = ROUTE_RE.exec(String(question));
  if (!m || !state.index) return false;
  const fromHit = resolve(m[1], state.index);
  const toHit = resolve(m[2], state.index);
  if (!fromHit.place || !toHit.place) return false;
  if (fromHit.place.id === toHit.place.id) return false;
  const fromBuilding = fromHit.place.building;
  // Prefer a whole building as an origin, since the route is drawn between blocks.
  if (fromBuilding && state.campus && state.campus.buildings.some((b) => b.id === fromBuilding)) {
    setOrigin(fromBuilding, 'picked');
  }
  state.lastQuestion = question;
  el.transcript.dataset.locked = '1';
  el.transcript.textContent = question;
  if (state.map) state.map.focus(toHit.place);
  showPlace(toHit.place, { speakIt: false, question });
  updateRouteNote();
  return true;
}

async function ask(question, opts) {
  if (state.busy || !question) return;
  if (!state.index) {
    // The very first Ask on a cold load can arrive before the campus data has
    // initialised the index and FAQ. That made the whole panel stay blank; wait
    // briefly instead of silently returning nothing.
    await new Promise((resolve) => {
      const t0 = Date.now();
      const poll = () => {
        if (state.index && state.faq) return resolve();
        if (Date.now() - t0 > 5000) return resolve();
        setTimeout(poll, 100);
      };
      poll();
    });
  }
  state.busy = true;
  if (!opts || opts.route !== false) {
    if (takeRoute(question, shortLang(state.lang))) {
      state.busy = false;
      return;
    }
  }
  state.lastQuestion = question;
  el.transcript.dataset.locked = '1';
  el.transcript.textContent = question;
  // A visible pending state: the Thai symptom query once took 15s while the line
  // showed only the question, which looked frozen. The text after the question
  // keeps the question readable and says something is happening.
  el.transcript.textContent = question + ' … ' + t('searching');
  // Snapshot the language for this turn. Reading state.lang again after an await
  // let a mid-flight switch render (and speak) the previous language's text under
  // the new language's badge, which is the worst kind of wrong answer.
  const turnLang = state.lang;
  const lang = shortLang(turnLang);
  // The UI strings must come from the same language as the body, not from
  // whatever the page switched to while an answer was in flight.
  const tt = (key) => (UI[lang] || UI.en)[key] || UI.en[key] || key;
  // If the visitor changed language while this lookup was running, the result is
  // in the old language. Throw it away and redo the turn in the new one, so a
  // badge never sits above text in a different language.
  const stale = () => state.lang !== turnLang;
  const finish = () => {
    state.busy = false;
    if (stale()) ask(question, opts);
  };
  let hit = resolve(question, state.index);
  let place = hit.place;
  // A symptom question ("I have a bad headache") names no place, so it fell
  // straight to "not found" — the one query where the clinic is the right answer.
  if (!place && SYMPTOM_RE.test(String(question))) {
    const clinic = (state.campus.places || []).find((p) => p.id === 'clinic');
    if (clinic) {
      place = clinic;
      hit = { place: clinic, id: clinic.id, confidence: 0.6, method: 'symptom', alternatives: [] };
    }
  }
  state.lastPlace = place;

  const local = place ? localAnswer(place, lang) : null;
  const localEn = place ? localAnswer(place, 'en') : null;

  if (place && state.map) state.map.focus(place);

  if (!place) {
    // A failed lookup must not leave the previous building lit and the previous
    // route drawn: the map would contradict the answer.
    if (state.map) state.map.clear();
    showAnswer({
      lang: turnLang,
      main: tt('notFound'),
      secondary: null,
      place: null
    });
    el.transcript.textContent = question;
    finish();
    return;
  }

  const faqEntry = faqHit(place, question);
  // A symptom query ("I have a bad headache") deserves advice first, not a
  // timetable: the same paragraph answered a person in pain with opening hours.
  const symptom = place.id === 'clinic' && SYMPTOM_RE.test(String(question));
  const symptomLead = symptom ? tt('symptomLead') + ' ' : '';
  const useNetwork = !state.offline && navigator.onLine !== false && Boolean(state.groqKey) && !faqEntry;

  if (useNetwork) {
    try {
      const json = await askGroq(question, place, lang);
      if (json) {
        showAnswer({
          lang: turnLang,
          main: json.answer,
          secondary: lang === 'en' ? null : (json.answer_en || localEn),
          secondaryLabel: lang === 'en' ? null : 'English',
          place,
          source: 'AI'
        });
        if (opts && opts.speakIt === false) stopSpeaking();
        el.transcript.textContent = question;
        finish();
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
  // A room code we only know by floor is answered with the building, and says so,
  // instead of pretending the exact room is on record. The building text comes
  // from the building record, not from a facility filed under it (the Wi-Fi
  // entry used to be glued on here).
  const roomCaveat = hit.unrecordedRoom ? tt('unrecordedRoom').replace('{code}', hit.unrecordedRoom) : '';
  let buildingLine = '';
  if (roomCaveat) {
    const bMeta = state.campus && state.campus.buildings.find((b) => b.id === place.building);
    if (bMeta) {
      const floors = Number(bMeta.floors) || 0;
      // Localized name only. Using bMeta.en here put an English sentence inside
      // an Indonesian or Chinese answer.
      buildingLine = buildingLabel(bMeta, lang);
      if (floors > 0) buildingLine += ' · ' + floors + ' ' + tt('floorsLabel');
    }
  }
  showAnswer({
    lang: turnLang,
    main: roomCaveat ? roomCaveat + ' ' + buildingLine : textLocal,
    secondary: lang === 'en' ? null : (roomCaveat ? tt('unrecordedRoom').replace('{code}', hit.unrecordedRoom) + ' ' + buildingLine : textEn),
    secondaryLabel: lang === 'en' ? null : 'English',
    place,
    lead: symptomLead
  });
  if (opts && opts.speakIt === false) stopSpeaking();
  el.transcript.textContent = question;
  finish();
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

function showAnswer({ lang, main, secondary, secondaryLabel, place, source, lead }) {
  el.answer.classList.add('show');
  document.body.classList.add('has-answer');
  const body = (lead ? lead : '') + (main || '');
  state.lastAnswer = { main: body, lang };
  const langMeta = LANGS.find((l) => l.code === lang) || {};
  // Notes under the card must use the same language as the card body.
  const tt = (key) => (UI[shortLang(lang)] || UI.en)[key] || UI.en[key] || key;
  el.answerLang.textContent = langMeta.label || lang;
  // Only Latin gets the uppercase/letter-spaced treatment.
  el.answerLang.classList.toggle('latin', /^[A-Za-z]/.test(langMeta.label || ''));
  el.answerMain.textContent = body;
  if (secondary && secondaryLabel) {
    el.answerSecondary.style.display = 'block';
    el.answerSecondary.innerHTML = '<b>' + secondaryLabel + '</b><br>' + escapeHtml(secondary);
  } else {
    // Clear the node, not just hide it. A hidden block kept the previous place's
    // English sentence in the DOM, so a screen reader read the wrong place.
    el.answerSecondary.style.display = 'none';
    el.answerSecondary.innerHTML = '';
  }
  el.showMe.style.display = place ? 'inline-block' : 'none';
  el.speakBtn.style.display = 'inline-block';

  const globallyVerified = state.campus && state.campus.meta && state.campus.meta.hoursVerified === true;
  const hoursUnverified = Boolean(place && place.hours && !globallyVerified && place.hoursVerified !== true);
  el.answerNote.classList.toggle('show', Boolean(hoursUnverified));
  el.answerNote.textContent = hoursUnverified ? tt('hoursNote') : '';

  updateRouteNote(lang);  // Scrolling the card under a sticky row is what hid the start of the answer.
  // The panel scroll position is computed from live rects, not offsetTop: the
  // answer's offsetParent is the body, so offsetTop was measured against the
  // wrong origin and the card still parked under the bar.
  if (window.innerWidth < 860) {
    requestAnimationFrame(() => {
      const panel = el.answer.parentElement;
      const bar = document.querySelector('.micRow');
      const barH = bar ? Math.ceil(bar.getBoundingClientRect().height) : 0;
      const panelRect = panel.getBoundingClientRect();
      const ansRect = el.answer.getBoundingClientRect();
      const topInPanel = ansRect.top - panelRect.top; // may be negative if scrolled
      const target = Math.max(0, panel.scrollTop + topInPanel - barH - 12);
      // Only correct when the card would be hidden behind the bar.
      if (topInPanel < barH) panel.scrollTop = target;
    });
  }
  speak(main, lang, { showWarning: true });
}

function showPlace(place, opts) {
  state.lastPlace = place;
  const lang = shortLang(state.lang);
  // A tap must read as one coherent turn: the question line says where the
  // visitor just pointed, and the answer uses the same FAQ entry a typed
  // question would, so the same place never gets two different answers.
  const question = (opts && opts.question) || t('tapQuestion');
  // `place.id` is the record identifier, so never index by language code blindly:
  // the Indonesian code is "id" and would print "t208" instead of a name.
  const langName = lang !== 'id' ? place[lang] : (place.names && place.names.id);
  const placeName = langName || place.en || place.room || place.id;
  el.transcript.dataset.locked = '1';
  el.transcript.textContent = String(question).replace('{place}', placeName);
  const faqEntry = faqHit(place, '');
  // A building tap should list what is inside, not one arbitrary room. The
  // whole-building list is capped so a phone answer stays readable, and the
  // building's own name and floor count lead it.
  const inBuilding = place.type === 'building'
    ? (state.campus.places || [])
      .filter((p) => p.building === place.building && p.id !== place.id && p.type !== 'facility')
      .map((p) => {
        const nm = lang !== 'id' ? p[p.type === 'room' ? 'room' : lang] : ((p.names && p.names.id) || p.room);
        return (nm || p.room || '').split(',')[0].trim();
      })
      .filter(Boolean)
    : [];
  // A sibling whose name is the building itself (or a repeat of another row) adds
  // nothing but noise: "Library. Also in this building: Library · Library".
  const bLabel = (() => {
    const b = state.campus && state.campus.buildings.find((x) => x.id === place.building);
    return b ? buildingLabel(b) : '';
  })();
  const uniq = [...new Set(inBuilding)].filter((n) => {
    if (!n) return false;
    const l = n.toLowerCase();
    const b = bLabel.toLowerCase();
    if (!b) return true;
    // "Library service desk" under Library repeats the heading.
    return !l.includes(b) && !b.includes(l);
  });
  const alsoHere = uniq.length
    ? ' ' + t('alsoInBuilding') + ' ' + uniq.slice(0, 5).join(' · ')
    : '';
  showAnswer({
    lang: state.lang,
    main: (faqEntry && faqEntry.answers ? (faqEntry.answers[lang] || faqEntry.answers.en) : localAnswer(place, lang)) + alsoHere,
    secondary: lang === 'en' ? null : (faqEntry && faqEntry.answers ? faqEntry.answers.en : localAnswer(place, 'en')),
    secondaryLabel: lang === 'en' ? null : 'English',
    place
  });
  if (opts && opts.speakIt === false) stopSpeaking();
}

// Small debug hook so the route state can be asserted from a test harness.
window.AIU = {
  get state() { return state; },
  mapDebug: () => (state.map && state.map.debug ? state.map.debug() : null),
  // Same entry point the map's tap handler uses, so a test can exercise the
  // tap path without guessing which pixel is over which building.
  pickPlace: (placeId) => {
    const place = state.campus && state.campus.places.find((p) => p.id === placeId);
    if (!place) return false;
    if (state.map && state.map.focus) state.map.focus(place);
    showPlace(place, { speakIt: false });
    return true;
  }
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

// Chrome fills the voice list asynchronously. Until the browser has reported at
// least one voice, an empty list means "not ready yet", not "no speech here".
function voicesReady() {
  return Boolean(window.speechSynthesis) && speechSynthesis.getVoices().length > 0;
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
  // (Zero voices at cold load is normal in Chrome — the list arrives late — so
  // an empty list is not proof that speech is unavailable.)
  if (el.speakBtn) {
    const dead = missing && voices.length > 0;
    el.speakBtn.disabled = dead;
    el.speakBtn.setAttribute('aria-disabled', dead ? 'true' : 'false');
    el.speakBtn.title = dead ? t('voiceMissing') : '';
  }

  // Name the voice language in the UI so it is clear what is being spoken. The
  // note belongs to the answer's language, not to whatever chip was clicked last.
  const tt = (key) => (UI[shortLang(lang)] || UI.en)[key] || UI.en[key] || key;
  if (el.voiceNote && opts && opts.showWarning) {
    el.voiceNote.textContent = missing ? tt('voiceMissing') : '';
    el.voiceNote.classList.toggle('show', missing);
  }

  if (!text || !window.speechSynthesis) return;
  // A dry run only refreshes the button state after the voice list arrives; it
  // must not speak.
  if (opts && opts.dryRun) return;
  // Speaking Thai text with an English voice is worse than silence: the visitor
  // hears gibberish and thinks the app is broken. When the device has no voice
  // for this language, the answer stays on screen and the note says why.
  if (missing && voices.length > 0) return;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.98;
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

window.addEventListener('load', () => {
  if (!window.speechSynthesis) return;
  speechSynthesis.onvoiceschanged = () => {
    // The voice list arrives late in Chrome. Re-check the Replay button once it
    // does, so a language with no voice is disabled only after the list is real.
    if (state.lastAnswer) speak(state.lastAnswer.main, state.lastAnswer.lang, { showWarning: true, dryRun: true });
  };
});

init();
