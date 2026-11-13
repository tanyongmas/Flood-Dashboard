const STORAGE_KEY = 'flood_resident_state_v2';
const SETTINGS_KEY = 'flood_resident_settings_v1';

const CSV_TEMPLATE_HEADERS = [
  'ศูนย์พักพิงที่เข้าพัก',
  'วันที่เข้าพัก',
  'วันที่ออกจากศูนย์พักพิง',
  'เหตุผลการเข้าพัก',
  'ประเภทเลขประจำตัว',
  'เลขบัตรประชาชน',
  'คำนำหน้า',
  'ชื่อ',
  'นามสกุล',
  'สัญชาติ',
  'เพศ',
  'วันเกิด',
  'ผู้พิการ',
  'ผู้ป่วยติดเตียง',
  'หญิงตั้งครรภ์',
  'โรคหัวใจและหลอดเลือด',
  'โรคมะเร็ง',
  'โรคเบาหวาน',
  'โรคปอดอุดกั้นเรื้อรัง',
  'โรคความดันโลหิตสูง',
  'โรคอื่นๆ',
  'หมายเหตุเพิ่มเติม',
  'เบอร์โทรศัพท์',
  'เบอร์โทรศัพท์ผู้ติดต่อฉุกเฉิน',
  'ผู้ติดต่อฉุกเฉิน',
  'ทะเบียนรถ',
  'ที่อยู่',
  'จังหวัด',
  'อำเภอ',
  'ตำบล',
  'รหัสไปรษณีย์'
];

const HEADER_ALIASES = {
  shelterName: ['ศูนย์พักพิงที่เข้าพัก', 'ศูนย์พักพิง', 'shelterName', 'shelter'],
  checkInDate: ['วันที่เข้าพัก', 'checkInDate'],
  checkOutDate: ['วันที่ออกจากศูนย์พักพิง', 'วันที่ออก', 'checkOutDate'],
  reason: ['เหตุผลการเข้าพัก', 'เหตุผลการเข้าพัก / ออกจากศูนย์พักพิง', 'เหตุผล', 'reason'],
  idType: ['ประเภทเลขประจำตัว', 'idType'],
  idNumber: ['เลขบัตรประชาชน', 'หมายเลขประจำตัวลงทะเบียน', 'เลขบัตร', 'idNumber', 'registrationIdNumber'],
  title: ['คำนำหน้า', 'title'],
  firstName: ['ชื่อ', 'firstName'],
  lastName: ['นามสกุล', 'lastName'],
  nationality: ['สัญชาติ', 'nationality', 'nationalityCode'],
  gender: ['เพศ', 'gender'],
  birthDate: ['วันเกิด', 'birthDate'],
  isDisabled: ['ผู้พิการ', 'ผู้พิการหรือผู้ทุพพลภาพ', 'isDisabled'],
  isBedridden: ['ผู้ป่วยติดเตียง', 'isBedridden'],
  isPregnant: ['หญิงตั้งครรภ์', 'isPregnant'],
  hasHeartDisease: ['โรคหัวใจและหลอดเลือด', 'hasHeartDisease'],
  hasCancer: ['โรคมะเร็ง', 'hasCancer'],
  hasDiabetes: ['โรคเบาหวาน', 'hasDiabetes'],
  hasCopd: ['โรคปอดอุดกั้นเรื้อรัง', 'hasCopd'],
  hasHypertension: ['โรคความดันโลหิตสูง', 'hasHypertension'],
  hasOtherDisease: ['โรคอื่นๆ', 'อื่นๆ', 'hasOtherDisease'],
  notes: ['หมายเหตุเพิ่มเติม', 'หมายเหตุ', 'notes'],
  phoneNumber: ['เบอร์โทรศัพท์', 'เบอร์โทร', 'phoneNumber'],
  emergencyContactPhone: ['เบอร์โทรศัพท์ผู้ติดต่อฉุกเฉิน', 'เบอร์ฉุกเฉิน', 'emergencyContactPhone'],
  emergencyContactName: ['ผู้ติดต่อฉุกเฉิน', 'ชื่อผู้ติดต่อฉุกเฉิน', 'emergencyContactName'],
  vehiclePlate: ['ทะเบียนรถ', 'ทะเบียนรถ (ถ้ามี)', 'vehiclePlate'],
  addressText: ['ที่อยู่', 'addressText', 'registeredAddressText'],
  province: ['จังหวัด', 'province'],
  district: ['อำเภอ', 'อำเภอ/เขต', 'district'],
  subdistrict: ['ตำบล', 'ตำบล/แขวง', 'subdistrict'],
  postalCode: ['รหัสไปรษณีย์', 'postalCode', 'registeredPostalCode']
};

let state = {
  records: [],
  currentIndex: 0,
  filter: 'all',
  search: '',
  rangeStart: '',
  rangeEnd: ''
};

let settings = {
  shelterName: '',
  province: '',
  district: '',
  subdistrict: '',
  postalCode: '',
  autoNext: true
};

const els = {
  csvFile: document.getElementById('csvFile'),
  btnDownloadTemplate: document.getElementById('btnDownloadTemplate'),
  btnExportReport: document.getElementById('btnExportReport'),
  btnReset: document.getElementById('btnReset'),
  defShelter: document.getElementById('defShelter'),
  defProvince: document.getElementById('defProvince'),
  defDistrict: document.getElementById('defDistrict'),
  defSubdistrict: document.getElementById('defSubdistrict'),
  defPostal: document.getElementById('defPostal'),
  optAutoNext: document.getElementById('optAutoNext'),
  workspace: document.getElementById('workspace'),
  statTotal: document.getElementById('statTotal'),
  statDone: document.getElementById('statDone'),
  statMissing: document.getElementById('statMissing'),
  progressBar: document.getElementById('progressBar'),
  rangeStart: document.getElementById('rangeStart'),
  rangeEnd: document.getElementById('rangeEnd'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  curIndexLabel: document.getElementById('curIndexLabel'),
  curName: document.getElementById('curName'),
  curMeta: document.getElementById('curMeta'),
  preflightWarn: document.getElementById('preflightWarn'),
  btnFill: document.getElementById('btnFill'),
  btnMarkDone: document.getElementById('btnMarkDone'),
  btnSkip: document.getElementById('btnSkip'),
  statusBox: document.getElementById('statusBox'),
  searchInput: document.getElementById('searchInput'),
  residentList: document.getElementById('residentList'),
  tabs: document.querySelectorAll('.tab')
};

async function readTextSmart(file) {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  if (utf8Text.includes('\uFFFD')) {
    return new TextDecoder('windows-874').decode(buffer);
  }
  return utf8Text.replace(/^\uFEFF/, '');
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function mapRowsToRecords(rows) {
  if (rows.length < 2) return [];
  const rawHeaders = rows[0].map((h) => h.trim());
  const colIndexByKey = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = rawHeaders.findIndex((h) => aliases.includes(h));
    if (idx !== -1) colIndexByKey[key] = idx;
  }
  return rows.slice(1).map((r, i) => {
    const rec = { _id: i + 1, _done: false };
    for (const [key, idx] of Object.entries(colIndexByKey)) {
      rec[key] = (r[idx] ?? '').trim();
    }
    return rec;
  });
}

function applyDefaults(rec) {
  return {
    ...rec,
    shelterName: rec.shelterName || settings.shelterName || '',
    province: rec.province || settings.province || '',
    district: rec.district || settings.district || '',
    subdistrict: rec.subdistrict || settings.subdistrict || '',
    postalCode: rec.postalCode || settings.postalCode || ''
  };
}

function getMissingFields(rec) {
  const merged = applyDefaults(rec);
  const missing = [];
  const idClean = String(merged.idNumber || '').replace(/[-\s]/g, '');
  if ((merged.idType || 'ID_CARD').toUpperCase() === 'ID_CARD' && idClean.length !== 13) {
    missing.push('เลขบัตรไม่ครบ 13 หลัก');
  }
  if (!merged.birthDate) missing.push('วันเกิด');
  if (!merged.phoneNumber) missing.push('เบอร์โทร');
  if (!merged.emergencyContactPhone || !merged.emergencyContactName) {
    missing.push('ผู้ติดต่อฉุกเฉิน');
  }
  return missing;
}

function saveState() {
  chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function saveSettings() {
  chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

function showStatus(type, message) {
  els.statusBox.className = `status-box status-${type}`;
  els.statusBox.textContent = message;
  els.statusBox.style.display = 'block';
}

function hideStatus() {
  els.statusBox.style.display = 'none';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getInRangeRecords() {
  const start = Number(state.rangeStart) || 1;
  const end = Number(state.rangeEnd) || state.records.length;
  return state.records
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => r._id >= start && r._id <= end);
}

function render() {
  const total = state.records.length;
  if (total === 0) {
    els.workspace.style.display = 'none';
    els.btnReset.style.display = 'none';
    els.btnExportReport.style.display = 'none';
    return;
  }

  els.workspace.style.display = 'block';
  els.btnReset.style.display = 'inline-flex';
  els.btnExportReport.style.display = 'inline-flex';

  const inRange = getInRangeRecords();
  const doneCount = inRange.filter(({ r }) => r._done).length;
  const missingCount = inRange.filter(({ r }) => getMissingFields(r).length > 0).length;

  els.statTotal.textContent = inRange.length;
  els.statDone.textContent = doneCount;
  els.statMissing.textContent = missingCount;
  const pct = inRange.length > 0 ? Math.round((doneCount / inRange.length) * 100) : 0;
  els.progressBar.style.width = `${pct}%`;

  const current = state.records[state.currentIndex] || state.records[0];
  if (current) {
    const merged = applyDefaults(current);
    const fullName =
      [merged.title, merged.firstName, merged.lastName].filter(Boolean).join(' ') ||
      `รายการที่ ${merged._id}`;
    els.curIndexLabel.textContent = `ลำดับที่ #${merged._id} / ${total}`;
    els.curName.textContent = fullName;
    els.curMeta.innerHTML = `
      <div><span class="meta-k">บัตร:</span> ${escapeHtml(merged.idNumber || '-')}</div>
      <div><span class="meta-k">วันเกิด:</span> ${escapeHtml(merged.birthDate || '-')}</div>
      <div><span class="meta-k">โทร:</span> ${escapeHtml(merged.phoneNumber || '-')}</div>
      <div><span class="meta-k">ศูนย์:</span> ${escapeHtml(merged.shelterName || '-')}</div>
      <div class="full"><span class="meta-k">ที่อยู่:</span> ${escapeHtml(
        [merged.addressText, merged.subdistrict, merged.district, merged.province].filter(Boolean).join(' ') || '-'
      )}</div>
    `;

    const missing = getMissingFields(current);
    if (missing.length > 0) {
      els.preflightWarn.style.display = 'block';
      els.preflightWarn.textContent = `⚠️ ข้อมูลไม่ครบ: ${missing.join(', ')}`;
    } else {
      els.preflightWarn.style.display = 'none';
    }

    els.btnPrev.disabled = state.currentIndex <= 0;
    els.btnNext.disabled = state.currentIndex >= total - 1;
  }

  const q = state.search.trim().toLowerCase();
  const filtered = inRange.filter(({ r }) => {
    if (state.filter === 'pending' && r._done) return false;
    if (state.filter === 'done' && !r._done) return false;
    if (state.filter === 'missing' && getMissingFields(r).length === 0) return false;
    if (q) {
      const hay = `${r.firstName || ''} ${r.lastName || ''} ${r.idNumber || ''}`.toLowerCase();
      return hay.includes(q);
    }
    return true;
  });

  els.residentList.innerHTML = '';
  let activeEl = null;
  for (const { r, idx } of filtered) {
    const item = document.createElement('div');
    const isActive = idx === state.currentIndex;
    item.className = `list-item${isActive ? ' active' : ''}`;
    const name = [r.title, r.firstName, r.lastName].filter(Boolean).join(' ') || `รายการที่ ${r._id}`;
    const hasMissing = getMissingFields(r).length > 0;
    item.innerHTML = `
      <div style="min-width:0;">
        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">#${r._id} ${escapeHtml(name)}</div>
        <div style="font-size:11px;color:#64748b;">${escapeHtml(r.idNumber || 'ไม่มีเลขบัตร')}</div>
      </div>
      <div style="display:flex;align-items:center;">
        ${hasMissing ? '<span class="badge badge-missing">ไม่ครบ</span>' : ''}
        <span class="badge ${r._done ? 'badge-done' : 'badge-pending'}">${r._done ? 'เสร็จแล้ว' : 'รอกรอก'}</span>
      </div>
    `;
    item.addEventListener('click', () => {
      state.currentIndex = idx;
      hideStatus();
      saveState();
      render();
    });
    els.residentList.appendChild(item);
    if (isActive) activeEl = item;
  }

  if (activeEl) {
    activeEl.scrollIntoView({ block: 'nearest' });
  }
}

async function triggerFill() {
  const current = state.records[state.currentIndex];
  if (!current) return;

  els.btnFill.disabled = true;
  els.btnFill.textContent = '⏳ กำลังเปิดฟอร์มและกรอกข้อมูล...';
  hideStatus();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes('shelter.disaster.go.th')) {
      showStatus('err', 'กรุณาเปิดหน้าเว็บ shelter.disaster.go.th/backoffice/residents ก่อนใช้งาน');
      return;
    }

    const res = await chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_RESIDENT',
      payload: applyDefaults(current)
    });

    if (!res?.ok) {
      showStatus('err', res?.error || 'ไม่สามารถกรอกข้อมูลได้ กรุณาตรวจสอบหน้าเว็บ');
    } else if (res.warnings?.length > 0) {
      showStatus(
        'warn',
        `กรอกสำเร็จ ${res.filledCount} ช่อง\nข้อควรตรวจสอบ:\n- ${res.warnings.join('\n- ')}`
      );
    } else {
      showStatus('ok', `กรอกสำเร็จครบถ้วน (${res.filledCount} ช่อง) ตรวจสอบแล้วกด "บันทึก" บนหน้าเว็บได้เลย`);
    }
  } catch (err) {
    showStatus('err', 'เชื่อมต่อหน้าเว็บไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ shelter.disaster.go.th แล้วลองอีกครั้ง');
  } finally {
    els.btnFill.disabled = false;
    els.btnFill.textContent = '⚡ กรอกข้อมูลลงฟอร์ม (Alt+F)';
  }
}

function advanceToNextPending(markCurrentDone) {
  if (!state.records[state.currentIndex]) return;
  if (markCurrentDone) {
    state.records[state.currentIndex]._done = true;
  }

  const start = Number(state.rangeStart) || 1;
  const end = Number(state.rangeEnd) || state.records.length;

  const nextInRange = state.records.findIndex(
    (r, i) => i > state.currentIndex && r._id >= start && r._id <= end && !r._done
  );
  const anyInRange = state.records.findIndex(
    (r) => r._id >= start && r._id <= end && !r._done
  );

  if (nextInRange !== -1) {
    state.currentIndex = nextInRange;
  } else if (anyInRange !== -1) {
    state.currentIndex = anyInRange;
  } else if (state.currentIndex < state.records.length - 1) {
    state.currentIndex++;
  }

  hideStatus();
  saveState();
  render();
}

// Event Listeners
els.csvFile.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await readTextSmart(file);
  const rows = parseCSV(text);
  const records = mapRowsToRecords(rows);
  if (records.length === 0) {
    alert('ไม่พบข้อมูลในไฟล์ CSV หรือรูปแบบหัวตารางไม่ถูกต้อง');
    return;
  }
  state = {
    records,
    currentIndex: 0,
    filter: 'all',
    search: '',
    rangeStart: '',
    rangeEnd: ''
  };
  els.rangeStart.value = '';
  els.rangeEnd.value = '';
  hideStatus();
  saveState();
  render();
});

els.btnFill.addEventListener('click', triggerFill);
els.btnMarkDone.addEventListener('click', () => advanceToNextPending(true));
els.btnSkip.addEventListener('click', () => advanceToNextPending(false));

els.btnPrev.addEventListener('click', () => {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    hideStatus();
    saveState();
    render();
  }
});

els.btnNext.addEventListener('click', () => {
  if (state.currentIndex < state.records.length - 1) {
    state.currentIndex++;
    hideStatus();
    saveState();
    render();
  }
});

els.searchInput.addEventListener('input', (e) => {
  state.search = e.target.value;
  render();
});

els.rangeStart.addEventListener('input', (e) => {
  state.rangeStart = e.target.value;
  saveState();
  render();
});

els.rangeEnd.addEventListener('input', (e) => {
  state.rangeEnd = e.target.value;
  saveState();
  render();
});

els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    els.tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    state.filter = tab.dataset.filter;
    render();
  });
});

els.btnReset.addEventListener('click', () => {
  if (!confirm('ต้องการล้างรายการ CSV และความคืบหน้าทั้งหมดใช่หรือไม่?')) return;
  state = { records: [], currentIndex: 0, filter: 'all', search: '', rangeStart: '', rangeEnd: '' };
  els.csvFile.value = '';
  chrome.storage.local.remove(STORAGE_KEY);
  render();
});

els.btnDownloadTemplate.addEventListener('click', () => {
  const sampleRow1 = [
    'ศูนย์พักพิงเทศบาลตำบลตันหยงมัส', '13/11/2569', '', 'เข้าพักชั่วคราวเนื่องจากน้ำท่วม',
    'ID_CARD', '1960100123456', 'นาย', 'สมชาย', 'ใจดี', 'ไทย', 'ชาย', '15/05/2525',
    '0', '0', '0', '0', '0', '1', '0', '0', '0', 'ต้องรับประทานยาเบาหวาน',
    '0812345678', '0898765432', 'นางสมหญิง ใจดี', 'กข 1234 นราธิวาส',
    '123 หมู่ 1 ต.ตันหยงมัส', 'นราธิวาส', 'ระแงะ', 'ตันหยงมัส', '96130'
  ];
  const csvContent = '\uFEFF' + [CSV_TEMPLATE_HEADERS.join(','), sampleRow1.join(',')].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template_residents.csv';
  a.click();
  URL.revokeObjectURL(url);
});

els.btnExportReport.addEventListener('click', () => {
  if (!state.records.length) return;
  const header = ['ลำดับ', 'ชื่อ-นามสกุล', 'เลขบัตรประชาชน', 'สถานะ', 'หมายเหตุข้อมูลไม่ครบ'];
  const lines = state.records.map((r) => {
    const name = [r.title, r.firstName, r.lastName].filter(Boolean).join(' ');
    const missing = getMissingFields(r).join(' / ');
    return [
      r._id,
      `"${name.replace(/"/g, '""')}"`,
      `"${(r.idNumber || '').replace(/"/g, '""')}"`,
      r._done ? 'เสร็จแล้ว' : 'รอกรอก',
      `"${missing.replace(/"/g, '""')}"`
    ].join(',');
  });
  const csvContent = '\uFEFF' + [header.join(','), ...lines].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report_residents_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// บันทึก Settings อัตโนมัติเมื่อแก้ไข
[
  ['defShelter', 'shelterName'],
  ['defProvince', 'province'],
  ['defDistrict', 'district'],
  ['defSubdistrict', 'subdistrict'],
  ['defPostal', 'postalCode']
].forEach(([elId, key]) => {
  els[elId].addEventListener('input', (e) => {
    settings[key] = e.target.value.trim();
    saveSettings();
    render();
  });
});

els.optAutoNext.addEventListener('change', (e) => {
  settings.autoNext = e.target.checked;
  saveSettings();
});

// รับคำสั่ง Auto-Next เมื่อกดบันทึกบนหน้าเว็บ และคีย์ลัด Alt+F
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'RESIDENT_SAVED_ON_PAGE' && settings.autoNext && state.records.length > 0) {
    advanceToNextPending(true);
    showStatus('ok', '✓ บันทึกข้อมูลบนหน้าเว็บแล้ว เลื่อนมาคนถัดไปให้อัตโนมัติ');
  }
  if (msg?.type === 'COMMAND_TRIGGER_AUTOFILL' && state.records.length > 0) {
    triggerFill();
  }
});

// คีย์ลัด Alt+F ขณะโฟกัสอยู่ใน Side Panel
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key.toLowerCase() === 'f' && state.records.length > 0) {
    e.preventDefault();
    triggerFill();
  }
});

// โหลด Settings และ State เดิมเมื่อเปิด Side Panel
chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], (res) => {
  if (res?.[SETTINGS_KEY]) {
    settings = { ...settings, ...res[SETTINGS_KEY] };
  }
  els.defShelter.value = settings.shelterName || '';
  els.defProvince.value = settings.province || '';
  els.defDistrict.value = settings.district || '';
  els.defSubdistrict.value = settings.subdistrict || '';
  els.defPostal.value = settings.postalCode || '';
  els.optAutoNext.checked = settings.autoNext !== false;

  if (res?.[STORAGE_KEY]?.records?.length) {
    state = { ...state, ...res[STORAGE_KEY] };
    els.rangeStart.value = state.rangeStart || '';
    els.rangeEnd.value = state.rangeEnd || '';
  }
  render();
});
