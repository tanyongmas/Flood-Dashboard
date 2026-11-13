/**
 * Content Script สำหรับช่วยกรอกข้อมูลใน Modal #resident-modal-form
 * บนเว็บ https://shelter.disaster.go.th/backoffice/residents (Vue 3 + Nuxt UI / Reka UI)
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ตั้งค่าให้ input / textarea ของ Vue 3 รับรู้การเปลี่ยนแปลง
 */
function setNativeValue(el, value) {
  if (!el) return false;
  const strVal = value == null ? '' : String(value).trim();
  const proto =
    el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

  el.focus();
  if (nativeSetter) {
    nativeSetter.call(el, strVal);
  } else {
    el.value = strVal;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}

/**
 * ปิด Popover / Listbox ที่เปิดค้างอยู่ทั้งหมดอย่างปลอดภัย
 */
async function closeAnyOpenPopover() {
  const openTriggers = document.querySelectorAll(
    '#resident-modal-form button[aria-expanded="true"], #resident-modal-form button[data-state="open"]'
  );
  for (const btn of openTriggers) {
    btn.click();
    await sleep(100);
  }
  if (document.querySelector('[data-reka-popper-content-wrapper]')) {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })
    );
    await sleep(100);
  }
}

/**
 * หาปุ่ม Trigger ของฟิลด์จาก label text ภายในฟอร์ม
 */
function findButtonByLabel(form, labelText) {
  const labels = form.querySelectorAll('label');
  for (const label of labels) {
    if (label.textContent.trim().startsWith(labelText)) {
      const root = label.closest('[data-slot="root"]');
      if (root) {
        const btn = root.querySelector('button[aria-haspopup], button[role="combobox"]');
        if (btn) return btn;
      }
    }
  }
  return null;
}

/**
 * หาปุ่ม Trigger ของ Select/Listbox จาก hidden input หรือ select ที่อยู่ติดกัน
 */
function findSelectTriggerByName(form, name) {
  const hiddenOrSelect = form.querySelector(`input[name="${name}"], select[name="${name}"]`);
  if (!hiddenOrSelect) return null;
  const container = hiddenOrSelect.parentElement;
  return container?.querySelector('button[role="combobox"], button[aria-haspopup="listbox"]') || null;
}

/**
 * รอจนกว่า element จะไม่ถูก disable (ใช้สำหรับ จังหวัด -> อำเภอ -> ตำบล)
 */
async function waitUntilEnabled(el, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (el && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
      return true;
    }
    await sleep(120);
  }
  return false;
}

/**
 * หา container ของ popup ที่เปิดอยู่สำหรับ triggerBtn
 */
function findPopupContainer(triggerBtn) {
  const controlsId = triggerBtn.getAttribute('aria-controls');
  if (controlsId) {
    const el = document.getElementById(controlsId);
    if (el) return el;
  }
  const wrappers = document.querySelectorAll('[data-reka-popper-content-wrapper]');
  return wrappers.length > 0 ? wrappers[wrappers.length - 1] : null;
}

/**
 * เปิด Reka UI Trigger (รองรับทั้ง Select role="combobox" และ SelectMenu aria-haspopup="listbox")
 */
async function openTrigger(triggerBtn) {
  triggerBtn.scrollIntoView({ block: 'center' });
  await sleep(60);
  triggerBtn.focus();

  const isSelectCombobox = triggerBtn.getAttribute('role') === 'combobox';
  if (isSelectCombobox) {
    // Reka UI Select เปิดด้วยคีย์บอร์ด Space/Enter หรือ pointerdown+pointerup เสถียรกว่า click()
    triggerBtn.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })
    );
    await sleep(150);
  } else {
    triggerBtn.click();
    await sleep(150);
  }

  const isOpen =
    triggerBtn.getAttribute('aria-expanded') === 'true' ||
    triggerBtn.getAttribute('data-state') === 'open';

  if (!isOpen) {
    triggerBtn.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerType: 'mouse',
        button: 0
      })
    );
    triggerBtn.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerType: 'mouse',
        button: 0
      })
    );
    triggerBtn.click();
    await sleep(150);
  }
}

/**
 * เปิด Reka UI Listbox/Combobox แล้วคลิก Option ที่ตรงกับข้อความ
 */
async function selectRekaOption(triggerBtn, targetText, warnings, fieldLabel) {
  if (!targetText) return false;
  const desired = String(targetText).trim();
  if (!desired) return false;

  if (!triggerBtn) {
    warnings.push(`ไม่พบช่อง "${fieldLabel}"`);
    return false;
  }

  await closeAnyOpenPopover();

  const isEnabled = await waitUntilEnabled(triggerBtn, 5000);
  if (!isEnabled) {
    warnings.push(`ช่อง "${fieldLabel}" ยังไม่พร้อมใช้งาน (อาจต้องเลือกข้อมูลก่อนหน้าก่อน)`);
    return false;
  }

  await openTrigger(triggerBtn);

  // รอ option โผล่ใน portal ของปุ่มนี้ (สูงสุด ~3 วินาที เผื่อ API กำลังโหลดอำเภอ/ตำบล)
  let popup = null;
  let options = [];
  for (let i = 0; i < 25; i++) {
    popup = findPopupContainer(triggerBtn);
    if (popup) {
      options = Array.from(popup.querySelectorAll('[role="option"]'));
      if (options.length > 0) break;
    }
    await sleep(120);
  }

  // ถ้ามีช่องค้นหาภายในและยังหาไม่เจอ หรือมีตัวเลือกเยอะ ให้ลองพิมพ์ค้นหา
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const compact = (s) => s.replace(/\s+/g, '');
  const findMatch = (list) =>
    list.find((opt) => norm(opt.textContent) === norm(desired)) ||
    list.find((opt) => compact(opt.textContent) === compact(desired)) ||
    list.find((opt) => norm(opt.textContent).includes(norm(desired)));

  let match = findMatch(options);

  if (!match && popup) {
    const searchBox = popup.querySelector('input[type="text"], input:not([type="hidden"])');
    if (searchBox) {
      setNativeValue(searchBox, desired);
      await sleep(250);
      options = Array.from(popup.querySelectorAll('[role="option"]'));
      match = findMatch(options);
    }
  }

  if (match) {
    match.scrollIntoView({ block: 'nearest' });
    if (triggerBtn.getAttribute('role') === 'combobox') {
      match.focus();
      match.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
      );
      await sleep(120);
      if (triggerBtn.getAttribute('aria-expanded') === 'true') {
        match.click();
      }
    } else {
      match.click();
    }
    await sleep(200);
    return true;
  }

  await closeAnyOpenPopover();
  if (options.length === 0) {
    warnings.push(`ไม่พบตัวเลือกใน "${fieldLabel}" (ข้อมูลในระบบอาจยังไม่โหลดหรือไม่มีรายการ)`);
  } else {
    warnings.push(`ไม่พบตัวเลือก "${desired}" ใน "${fieldLabel}"`);
  }
  return false;
}

/**
 * คลิก Radio button ของ Reka UI
 */
function clickRekaRadio(form, value) {
  const radio = form.querySelector(`button[role="radio"][value="${value}"]`);
  if (!radio) return false;
  if (radio.getAttribute('aria-checked') !== 'true') {
    radio.click();
  }
  return true;
}

/**
 * ตั้งค่า Checkbox ของ Reka UI ตามค่า boolean
 */
function setRekaCheckbox(form, ariaLabel, shouldCheck) {
  const cb = form.querySelector(`button[role="checkbox"][aria-label="${ariaLabel}"]`);
  if (!cb) return false;
  const isChecked = cb.getAttribute('aria-checked') === 'true';
  if (Boolean(shouldCheck) !== isChecked) {
    cb.click();
  }
  return true;
}

/**
 * แปลงค่าข้อความจาก CSV ให้เป็น boolean (รองรับ 1, true, yes, ใช่, มี, x)
 */
function parseBool(val) {
  if (typeof val === 'boolean') return val;
  const s = String(val ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'ใช่', 'มี', 'x', '✓'].includes(s);
}

/**
 * แปลงวันที่รูปแบบ DD/MM/YYYY (พ.ศ. หรือ ค.ศ.) หรือ YYYY-MM-DD
 */
function parseDateInput(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  let day, month, year;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    year = y;
    month = m;
    day = d;
  } else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(s)) {
    const [d, m, y] = s.split(/[/-]/).map(Number);
    day = d;
    month = m;
    year = y;
  } else {
    return null;
  }

  const yearAD = year > 2400 ? year - 543 : year;
  const yearBE = yearAD + 543;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    day,
    month,
    yearAD,
    yearBE,
    isoAD: `${yearAD}-${pad(month)}-${pad(day)}`
  };
}

/**
 * พยายามเลือกวันที่ใน Reka UI Popover Calendar
 */
async function fillRekaDate(form, labelText, rawDate, warnings) {
  if (!rawDate || !String(rawDate).trim()) return false;
  const parsed = parseDateInput(rawDate);
  if (!parsed) {
    warnings.push(`รูปแบบวันที่ "${labelText}" ไม่ถูกต้อง (${rawDate}) ควรเป็น วว/ดด/ปปปป`);
    return false;
  }

  const triggerBtn = findButtonByLabel(form, labelText);
  if (!triggerBtn) {
    warnings.push(`ไม่พบปุ่มเลือกวันที่ "${labelText}"`);
    return false;
  }

  await closeAnyOpenPopover();
  triggerBtn.scrollIntoView({ block: 'center' });
  await sleep(60);
  triggerBtn.click();
  await sleep(220);

  const popover = findPopupContainer(triggerBtn);
  if (!popover) {
    warnings.push(`เปิดปฏิทิน "${labelText}" ไม่สำเร็จ กรุณาเลือกวันที่ ${rawDate} เอง`);
    return false;
  }

  // ลองหา <select> สำหรับเลือกปี/เดือน ถ้ามี
  const selects = Array.from(popover.querySelectorAll('select'));
  for (const sel of selects) {
    const opts = Array.from(sel.options);
    const yearOpt = opts.find(
      (o) =>
        o.value === String(parsed.yearAD) ||
        o.text.includes(String(parsed.yearBE)) ||
        o.text.includes(String(parsed.yearAD))
    );
    if (yearOpt) {
      sel.value = yearOpt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(100);
    }
    const monthOpt = opts.find(
      (o) => Number(o.value) === parsed.month || Number(o.value) === parsed.month - 1
    );
    if (monthOpt && opts.length === 12) {
      sel.value = monthOpt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(100);
    }
  }

  // ถ้าไม่มี <select> ให้ลองกดปุ่มเปลี่ยนปี / เดือน ในหัวปฏิทิน (Nuxt UI UCalendar)
  let targetCell = popover.querySelector(`[data-value="${parsed.isoAD}"]`);
  if (!targetCell) {
    const THAI_MONTHS = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const targetMonthTh = THAI_MONTHS[parsed.month - 1];
    const headerBtns = Array.from(popover.querySelectorAll('header button, [data-slot="header"] button'));

    const findNavBtn = (patterns) =>
      headerBtns.find((b) => {
        const lbl = (b.getAttribute('aria-label') || b.textContent || '').toLowerCase();
        return patterns.some((p) => lbl.includes(p));
      });

    const prevYearBtn = findNavBtn(['previous year', 'prev year', 'ปีก่อน', '<<']) || (headerBtns.length >= 4 ? headerBtns[0] : null);
    const prevMonthBtn = findNavBtn(['previous month', 'prev month', 'เดือนก่อน']) || (headerBtns.length >= 4 ? headerBtns[1] : headerBtns[0]);
    const nextMonthBtn = findNavBtn(['next month', 'เดือนถัด']) || (headerBtns.length >= 4 ? headerBtns[2] : headerBtns[headerBtns.length - 1]);
    const nextYearBtn = findNavBtn(['next year', 'ปีถัด', '>>']) || (headerBtns.length >= 4 ? headerBtns[3] : null);

    // เลื่อนปีให้ตรงก่อน (สูงสุด 100 ปี)
    for (let i = 0; i < 100; i++) {
      const txt = popover.textContent || '';
      if (txt.includes(String(parsed.yearBE)) || txt.includes(String(parsed.yearAD))) break;
      const currentYearMatch = txt.match(/\b(24\d{2}|25\d{2}|19\d{2}|20\d{2})\b/);
      const curYear = currentYearMatch ? Number(currentYearMatch[1]) : null;
      const curYearAD = curYear && curYear > 2400 ? curYear - 543 : curYear;
      if (curYearAD && parsed.yearAD < curYearAD && prevYearBtn) {
        prevYearBtn.click();
      } else if (curYearAD && parsed.yearAD > curYearAD && nextYearBtn) {
        nextYearBtn.click();
      } else {
        break;
      }
      await sleep(30);
    }

    // เลื่อนเดือนให้ตรง (สูงสุด 12 เดือน)
    for (let i = 0; i < 12; i++) {
      const txt = popover.textContent || '';
      if (txt.includes(targetMonthTh)) break;
      if (prevMonthBtn) prevMonthBtn.click();
      else if (nextMonthBtn) nextMonthBtn.click();
      else break;
      await sleep(40);
    }

    targetCell = popover.querySelector(`[data-value="${parsed.isoAD}"]`);
  }

  // กรณีไม่มี data-value แต่เป็นเดือน/ปีปัจจุบันอยู่แล้ว ให้หาจากเลขวันใน gridcell
  if (!targetCell) {
    const headerText = popover.textContent || '';
    const isSameYear =
      headerText.includes(String(parsed.yearBE)) || headerText.includes(String(parsed.yearAD));
    if (isSameYear) {
      const dayButtons = Array.from(
        popover.querySelectorAll('[role="gridcell"] button, [data-reka-calendar-cell-trigger]')
      );
      targetCell = dayButtons.find(
        (b) =>
          b.textContent.trim() === String(parsed.day) &&
          !b.hasAttribute('data-outside-view') &&
          !b.hasAttribute('data-disabled')
      );
    }
  }

  if (targetCell) {
    targetCell.click();
    await sleep(150);
    return true;
  }

  await closeAnyOpenPopover();
  warnings.push(`กรุณาเลือก "${labelText}" (${rawDate}) ในปฏิทินด้วยตนเอง`);
  return false;
}

/**
 * แปลงคำนำหน้าย่อให้ตรงกับ Dropdown บนเว็บ
 */
function normalizeTitle(rawTitle) {
  const t = String(rawTitle ?? '').trim();
  const map = {
    'ด.ช.': 'เด็กชาย',
    'ดช.': 'เด็กชาย',
    'ด.ญ.': 'เด็กหญิง',
    'ดญ.': 'เด็กหญิง',
    'น.ส.': 'นางสาว',
    'นส.': 'นางสาว'
  };
  return map[t] || t;
}

/**
 * แปลงเพศให้ตรงกับ Dropdown บนเว็บ (ชาย, หญิง, อื่นๆ)
 */
function normalizeGender(rawGender, normalizedTitle) {
  const g = String(rawGender ?? '').trim().toLowerCase();
  if (['ชาย', 'ช', 'male', 'm'].includes(g)) return 'ชาย';
  if (['หญิง', 'ญ', 'female', 'f'].includes(g)) return 'หญิง';
  if (['อื่นๆ', 'other', 'o'].includes(g)) return 'อื่นๆ';

  if (['นาย', 'เด็กชาย'].includes(normalizedTitle)) return 'ชาย';
  if (['นาง', 'นางสาว', 'เด็กหญิง'].includes(normalizedTitle)) return 'หญิง';
  return '';
}

/**
 * เปิด Modal "+ เพิ่มผู้พักพิง" อัตโนมัติหากยังไม่เปิดอยู่
 */
async function ensureModalOpen() {
  let form = document.querySelector('#resident-modal-form');
  if (form) return form;

  const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
    b.textContent.replace(/\s+/g, ' ').includes('เพิ่มผู้พักพิง')
  );
  if (!addBtn) return null;

  addBtn.click();
  for (let i = 0; i < 25; i++) {
    await sleep(120);
    form = document.querySelector('#resident-modal-form');
    if (form) {
      await sleep(150);
      return form;
    }
  }
  return null;
}

/**
 * ฟังก์ชันหลักสำหรับกรอกข้อมูล 1 แถวลงใน #resident-modal-form
 */
async function fillResidentForm(record) {
  const form = await ensureModalOpen();
  if (!form) {
    return {
      ok: false,
      error: 'ไม่พบปุ่มหรือหน้าต่าง "+ เพิ่มผู้พักพิง" กรุณาตรวจสอบว่าอยู่ที่หน้าจัดการผู้พักพิง'
    };
  }

  const warnings = [];
  let filledCount = 0;

  // 1. ข้อมูลการเข้าพัก
  if (record.shelterName) {
    const shelterBtn = findSelectTriggerByName(form, 'shelterId');
    if (await selectRekaOption(shelterBtn, record.shelterName, warnings, 'ศูนย์พักพิงที่เข้าพัก')) {
      filledCount++;
    }
  }
  if (record.checkInDate) {
    if (await fillRekaDate(form, 'วันที่เข้าพัก', record.checkInDate, warnings)) filledCount++;
  }
  if (record.checkOutDate) {
    if (await fillRekaDate(form, 'วันที่ออกจากศูนย์พักพิง', record.checkOutDate, warnings)) filledCount++;
  }
  if (record.reason) {
    setNativeValue(form.querySelector('textarea[name="reason"]'), record.reason);
    filledCount++;
  }

  // 2. ข้อมูลระบุตัวบุคคล
  const cleanId = String(record.idNumber ?? '').replace(/[-\s]/g, '').trim();
  const idType = String(record.idType ?? '').trim().toUpperCase();
  if (idType === 'PASSPORT') {
    clickRekaRadio(form, 'PASSPORT');
    await sleep(80);
    if (cleanId) {
      setNativeValue(form.querySelector('input[type="text"][name="registrationIdNumber"]'), cleanId);
      filledCount++;
    }
  } else if (idType === 'NONE' || (!cleanId && record.idType !== 'ID_CARD')) {
    clickRekaRadio(form, 'NONE');
    await sleep(80);
  } else {
    clickRekaRadio(form, 'ID_CARD');
    await sleep(80);
    if (cleanId) {
      setNativeValue(form.querySelector('input[type="text"][name="registrationIdNumber"]'), cleanId);
      filledCount++;
    }
  }

  const titleVal = normalizeTitle(record.title);
  if (titleVal) {
    const titleBtn = findSelectTriggerByName(form, 'title');
    if (await selectRekaOption(titleBtn, titleVal, warnings, 'คำนำหน้า')) filledCount++;
  }

  if (record.firstName) {
    setNativeValue(form.querySelector('input[name="firstName"]'), record.firstName);
    filledCount++;
  }
  if (record.lastName) {
    setNativeValue(form.querySelector('input[name="lastName"]'), record.lastName);
    filledCount++;
  }
  if (record.nationality) {
    setNativeValue(form.querySelector('input[name="nationalityCode"]'), record.nationality);
    filledCount++;
  }

  const genderVal = normalizeGender(record.gender, titleVal);
  if (genderVal) {
    const genderBtn = findSelectTriggerByName(form, 'gender');
    if (await selectRekaOption(genderBtn, genderVal, warnings, 'เพศ')) filledCount++;
  }

  if (record.birthDate) {
    if (await fillRekaDate(form, 'วันเกิด', record.birthDate, warnings)) filledCount++;
  }

  // 3. ข้อมูลความเสี่ยง / คุณลักษณะ
  const vulnMap = [
    ['isDisabled', 'ผู้พิการหรือผู้ทุพพลภาพ'],
    ['isBedridden', 'ผู้ป่วยติดเตียง'],
    ['isPregnant', 'หญิงตั้งครรภ์']
  ];
  for (const [key, label] of vulnMap) {
    if (record[key] !== undefined && record[key] !== '') {
      setRekaCheckbox(form, label, parseBool(record[key]));
    }
  }

  const diseaseMap = [
    ['hasHeartDisease', 'โรคหัวใจและหลอดเลือด'],
    ['hasCancer', 'โรคมะเร็ง'],
    ['hasDiabetes', 'โรคเบาหวาน'],
    ['hasCopd', 'โรคปอดอุดกั้นเรื้อรัง'],
    ['hasHypertension', 'โรคความดันโลหิตสูง'],
    ['hasOtherDisease', 'อื่นๆ']
  ];
  for (const [key, label] of diseaseMap) {
    if (record[key] !== undefined && record[key] !== '') {
      setRekaCheckbox(form, label, parseBool(record[key]));
    }
  }

  if (record.notes) {
    setNativeValue(form.querySelector('textarea[name="notes"]'), record.notes);
    filledCount++;
  }

  // 4. ข้อมูลการติดต่อ
  if (record.phoneNumber) {
    setNativeValue(form.querySelector('input[name="phoneNumber"]'), record.phoneNumber);
    filledCount++;
  }
  if (record.emergencyContactPhone) {
    setNativeValue(form.querySelector('input[name="emergencyContactPhone"]'), record.emergencyContactPhone);
    filledCount++;
  }
  if (record.emergencyContactName) {
    setNativeValue(form.querySelector('input[name="emergencyContactName"]'), record.emergencyContactName);
    filledCount++;
  }

  if (record.vehiclePlate && String(record.vehiclePlate).trim()) {
    setRekaCheckbox(form, 'ทะเบียนรถ (ถ้ามี)', true);
    await sleep(100);
    const plateInput = form.querySelector('input[type="text"][name="vehiclePlate"]');
    if (await waitUntilEnabled(plateInput, 1000)) {
      setNativeValue(plateInput, record.vehiclePlate);
      filledCount++;
    }
  }

  // 5. ข้อมูลที่อยู่ (Cascading Dropdown: จังหวัด -> อำเภอ -> ตำบล)
  if (record.addressText) {
    setNativeValue(form.querySelector('input[name="registeredAddressText"]'), record.addressText);
    filledCount++;
  }

  if (record.province) {
    const provBtn = findSelectTriggerByName(form, 'registeredProvinceCode');
    const provOk = await selectRekaOption(provBtn, record.province, warnings, 'จังหวัด');
    if (provOk) {
      filledCount++;
      await sleep(400);
      if (record.district) {
        const distBtn = findSelectTriggerByName(form, 'registeredDistrictCode');
        const distOk = await selectRekaOption(distBtn, record.district, warnings, 'อำเภอ/เขต');
        if (distOk) {
          filledCount++;
          await sleep(400);
          if (record.subdistrict) {
            const subBtn = findSelectTriggerByName(form, 'registeredSubdistrictCode');
            if (await selectRekaOption(subBtn, record.subdistrict, warnings, 'ตำบล/แขวง')) {
              filledCount++;
            }
          }
        }
      }
    }
  }

  if (record.postalCode) {
    setNativeValue(form.querySelector('input[name="registeredPostalCode"]'), record.postalCode);
    filledCount++;
  }

  clickRekaRadio(form, 'same');

  return {
    ok: true,
    filledCount,
    warnings
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'FILL_RESIDENT') {
    fillResidentForm(message.payload)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }
  if (message?.type === 'CHECK_MODAL') {
    const exists = Boolean(document.querySelector('#resident-modal-form'));
    sendResponse({ exists });
  }
});

// ตรวจจับเมื่อเจ้าหน้าที่กดปุ่ม "บันทึก" และ Modal ปิดลงสำเร็จ เพื่อแจ้ง Side Panel เลื่อนไปคนถัดไป
let saveWatchTimer = null;
document.addEventListener(
  'click',
  (e) => {
    const btn = e.target?.closest?.('button');
    if (!btn) return;
    const text = btn.textContent.replace(/\s+/g, ' ').trim();
    if (!text.includes('บันทึก') || text.includes('ยกเลิก')) return;
    if (!document.querySelector('#resident-modal-form')) return;

    if (saveWatchTimer) clearInterval(saveWatchTimer);
    let elapsed = 0;
    saveWatchTimer = setInterval(() => {
      elapsed += 200;
      if (!document.querySelector('#resident-modal-form')) {
        clearInterval(saveWatchTimer);
        saveWatchTimer = null;
        chrome.runtime.sendMessage({ type: 'RESIDENT_SAVED_ON_PAGE' }).catch(() => {});
      } else if (elapsed >= 8000) {
        clearInterval(saveWatchTimer);
        saveWatchTimer = null;
      }
    }, 200);
  },
  true
);
