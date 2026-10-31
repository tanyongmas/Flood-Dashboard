/**
 * 📦 Relief & Supply Distribution Module
 * บริหารจัดการการแจกจ่ายถุงยังชีพ, ตัดสต๊อกคงคลัง, จัดกลุ่มตามโซน และพิมพ์รายงาน
 * เทศบาลตำบลตันหยงมัส
 */

function initReliefForm() {
    let opts = "";
    for (let i = 1; i <= 30; i++) {
        opts += `<option value="${i}">${i} คน</option>`;
    }
    const membersSelect = document.getElementById('rel_members');
    if (membersSelect) membersSelect.innerHTML = opts;

    const relAddrSelect = document.getElementById('rel_address_select');
    if (relAddrSelect && store.addresses && store.addresses.length > 0) {
        const addrOpts = '<option value="" disabled selected>เลือกที่อยู่</option>' +
            store.addresses.map(a => `<option value="${a}">${a}</option>`).join('') +
            '<option value="other">อื่นๆ (ระบุเอง)</option>';
        relAddrSelect.innerHTML = addrOpts;
    }
}

function getReliefAddressList() {
    const evacAddrs = (typeof store !== 'undefined' && store.addressEvac && Array.isArray(store.addressEvac))
        ? store.addressEvac.map(row => row[0] ? row[0].toString().trim() : '').filter(a => a !== '')
        : ((typeof store !== 'undefined' && store.addresses && Array.isArray(store.addresses)) ? store.addresses : []);

    const reliefAddrs = (typeof store !== 'undefined' && store.reliefData && Array.isArray(store.reliefData))
        ? store.reliefData.map(r => r[4] ? r[4].toString().trim() : '').filter(a => a !== '')
        : [];

    return [...new Set([...evacAddrs, ...reliefAddrs])].filter(a => a !== '').sort();
}

window.handleReliefAddressSearch = function (val) {
    const resultBox = document.getElementById('rel_address_results');
    if (!resultBox) return;

    if (!val || val.trim().length < 1) {
        resultBox.classList.add('hidden');
        return;
    }

    if (!window.reliefAddressList || window.reliefAddressList.length === 0) {
        window.reliefAddressList = getReliefAddressList();
    }

    const searchVal = val.toLowerCase().trim();
    const filtered = window.reliefAddressList.filter(a => a.toLowerCase().includes(searchVal)).slice(0, 15);

    if (filtered.length > 0) {
        let html = '';
        filtered.forEach(addr => {
            html += `<div onclick='selectReliefAddress(${JSON.stringify(addr)})' class="p-3 hover:bg-amber-100 cursor-pointer border-b border-slate-100 text-sm text-slate-700 transition-colors flex items-center justify-between"><span class="font-medium">${addr}</span><i class="fas fa-chevron-right text-[10px] text-amber-400"></i></div>`;
        });
        resultBox.innerHTML = html;
        resultBox.classList.remove('hidden');
    } else {
        resultBox.innerHTML = '<div class="p-3 text-xs text-amber-600 font-bold bg-amber-50 flex items-center"><i class="fas fa-info-circle mr-2"></i>ไม่พบที่อยู่นี้ในระบบ (สามารถพิมพ์ต่อเพื่อระบุเป็นที่อยู่ใหม่ได้)</div>';
        resultBox.classList.remove('hidden');
    }
};

window.selectReliefAddress = function (addr) {
    const searchInput = document.getElementById('rel_address_search');
    if (searchInput) searchInput.value = addr;
    const resBox = document.getElementById('rel_address_results');
    if (resBox) resBox.classList.add('hidden');

    const sameAddrCheckbox = document.getElementById('rel_same_addr');
    if (sameAddrCheckbox && sameAddrCheckbox.checked) {
        if (typeof window.copyAddress === 'function') {
            window.copyAddress(true);
        }
    }
};

// ========================================================
// 🌟 ระบบสลับโหมดและบันทึกการแจกตามโซน (Quick Zone Distribution)
// ========================================================
window.currentReliefModalMode = 'zone';
window.currentModalZone = 'zone1';
window.modalZoneSearchQuery = '';

const MODAL_ZONE_INFO = {
    zone1: { name: 'โซน 1: ชุมชนตลาดกลางผลไม้', short: 'ตลาดกลาง' },
    zone2: { name: 'โซน 2: หลังสระรพช-ตรอ', short: 'รพช-ตรอ' },
    zone3: { name: 'โซน 3: เขาพระ-โรงฆ่าสัตว์', short: 'เขาพระ' },
    zone4: { name: 'โซน 4: ดารุสสลาม-สุขาภิบาล', short: 'ดารุสสลาม' },
    zone5: { name: 'โซน 5: บาลูกา', short: 'บาลูกา' }
};

window.switchReliefModalMode = function (mode) {
    window.currentReliefModalMode = mode;
    const tabZone = document.getElementById('tab-relief-zone');
    const tabManual = document.getElementById('tab-relief-manual');
    const modeZone = document.getElementById('reliefModeZone');
    const modeManual = document.getElementById('reliefModeManual');

    if (mode === 'zone') {
        if (tabZone) {
            tabZone.className = 'flex-1 py-2.5 px-3 rounded-xl font-black text-xs md:text-sm flex items-center justify-center transition-all bg-white text-amber-600 shadow-sm';
        }
        if (tabManual) {
            tabManual.className = 'flex-1 py-2.5 px-3 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center transition-all text-slate-500 hover:text-slate-700';
        }
        if (modeZone) modeZone.classList.remove('hidden');
        if (modeManual) modeManual.classList.add('hidden');

        window.renderModalZoneAddresses();
    } else {
        if (tabZone) {
            tabZone.className = 'flex-1 py-2.5 px-3 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center transition-all text-slate-500 hover:text-slate-700';
        }
        if (tabManual) {
            tabManual.className = 'flex-1 py-2.5 px-3 rounded-xl font-black text-xs md:text-sm flex items-center justify-center transition-all bg-white text-amber-600 shadow-sm';
        }
        if (modeZone) modeZone.classList.add('hidden');
        if (modeManual) modeManual.classList.remove('hidden');
    }
};

window.selectModalZone = function (zoneKey) {
    window.currentModalZone = zoneKey;

    const zones = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];
    zones.forEach(z => {
        const btn = document.getElementById(`mzone-btn-${z}`);
        if (!btn) return;
        const isSpan2 = (z === 'zone5') ? ' col-span-2 sm:col-span-1' : '';
        if (z === zoneKey) {
            btn.className = 'modal-zone-btn p-2.5 rounded-2xl border-2 border-amber-400 bg-amber-50 text-amber-900 text-xs font-black shadow-sm transition-all text-center flex flex-col items-center justify-center ring-2 ring-amber-200' + isSpan2;
        } else {
            btn.className = 'modal-zone-btn p-2.5 rounded-2xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all text-center flex flex-col items-center justify-center' + isSpan2;
        }
    });

    const badge = document.getElementById('modalZoneSummaryBadge');
    if (badge && MODAL_ZONE_INFO[zoneKey]) {
        badge.innerText = MODAL_ZONE_INFO[zoneKey].name;
    }

    window.renderModalZoneAddresses();
};

window.handleModalZoneSearch = function (val) {
    window.modalZoneSearchQuery = (val || '').trim();
    window.renderModalZoneAddresses();
};

window.renderModalZoneAddresses = function () {
    const listContainer = document.getElementById('reliefZoneList');
    if (!listContainer) return;

    if (!window.reliefAddressList || window.reliefAddressList.length === 0) {
        window.reliefAddressList = getReliefAddressList();
    }
    const allAddresses = window.reliefAddressList || [];

    // แผนที่ตรวจสอบบ้านที่เคยรับไปแล้วในรอบปัจจุบัน
    const receivedMap = new Map();
    if (store && store.reliefData && Array.isArray(store.reliefData)) {
        store.reliefData.forEach(r => {
            const addr = r[4] ? r[4].toString().trim() : '';
            if (addr && !receivedMap.has(addr)) {
                receivedMap.set(addr, {
                    distributedAt: r[0] || '',
                    name: r[1] || '',
                    status: r[2] || '',
                    members: r[3] || 1
                });
            }
        });
    }

    // คำนวณจำนวนบ้านทั้งหมดในแต่ละโซนเพื่ออัปเดต Badge บนปุ่มทั้ง 5 โซน
    const zoneCounts = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };
    allAddresses.forEach(addr => {
        const exact = window.getExactZoneForAddress ? window.getExactZoneForAddress(addr) : 'zone 5';
        const key = exact.replace(/\s+/g, '').toLowerCase();
        if (zoneCounts[key] !== undefined) {
            zoneCounts[key]++;
        }
    });

    ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'].forEach(zKey => {
        const badge = document.getElementById(`mzone-count-${zKey}`);
        if (badge) badge.innerText = zoneCounts[zKey] || 0;
    });

    // กรองที่อยู่เฉพาะโซนปัจจุบัน
    const currentZone = window.currentModalZone || 'zone1';
    const zoneAddresses = allAddresses.filter(addr => {
        const exact = window.getExactZoneForAddress ? window.getExactZoneForAddress(addr) : 'zone 5';
        const key = exact.replace(/\s+/g, '').toLowerCase();
        return key === currentZone;
    });

    // กรองตามคำค้นหา (บ้านเลขที่ / ชื่อถนน / ข้อความ)
    let filtered = zoneAddresses;
    const q = (window.modalZoneSearchQuery || '').toLowerCase();
    if (q) {
        filtered = zoneAddresses.filter(addr => {
            const lowerAddr = addr.toLowerCase();
            if (lowerAddr.includes(q)) return true;
            if (typeof window.extractAddressComponents === 'function') {
                const comps = window.extractAddressComponents(addr);
                if (comps.houseNo && comps.houseNo.toLowerCase().includes(q)) return true;
                if (comps.streetName && comps.streetName.toLowerCase().includes(q)) return true;
            }
            return false;
        });
    }

    // จัดเรียง: หลังที่ยังไม่ได้รับขึ้นก่อน -> เรียงตามลำดับบ้านเลขที่/ชื่อ
    filtered.sort((a, b) => {
        const aRec = receivedMap.has(a);
        const bRec = receivedMap.has(b);
        if (aRec !== bRec) {
            return aRec ? 1 : -1;
        }
        return a.localeCompare(b, 'th', { numeric: true });
    });

    // คำนวณสถิติในโซนนี้
    const totalInZone = zoneAddresses.length;
    const receivedInZone = zoneAddresses.filter(a => receivedMap.has(a)).length;
    const pendingInZone = totalInZone - receivedInZone;

    const statSummaryEl = document.getElementById('modalZoneStatSummary');
    if (statSummaryEl) {
        if (q) {
            statSummaryEl.innerHTML = `ค้นพบ <span class="text-amber-600 font-black">${filtered.length}</span> จากทั้งหมด ${totalInZone} หลังคาเรือน`;
        } else {
            statSummaryEl.innerHTML = `ทั้งหมด <span class="text-slate-800 font-black">${totalInZone}</span> หลังคาเรือน`;
        }
    }
    const statRecEl = document.getElementById('mzone-stat-received');
    if (statRecEl) statRecEl.innerText = receivedInZone;
    const statPenEl = document.getElementById('mzone-stat-pending');
    if (statPenEl) statPenEl.innerText = pendingInZone;

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="py-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <i class="fas fa-search-minus text-3xl mb-2 block opacity-30"></i>
                <p class="font-bold text-sm text-slate-600">ไม่พบที่อยู่ที่ตรงกับเงื่อนไขในโซนนี้</p>
                <p class="text-xs text-slate-400 mt-1">สามารถสลับไปที่แท็บ "บันทึกแบบเดิม" เพื่อระบุที่อยู่ใหม่ได้</p>
            </div>
        `;
        return;
    }

    let html = '';
    filtered.forEach(addr => {
        const isReceived = receivedMap.has(addr);
        if (isReceived) {
            const item = receivedMap.get(addr);
            let dateStr = '';
            if (item.distributedAt) {
                try {
                    const d = new Date(item.distributedAt);
                    dateStr = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' น.';
                } catch (e) {
                    dateStr = item.distributedAt;
                }
            }
            html += `
                <div class="p-3 md:p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex items-center justify-between gap-3 transition-all">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs flex-shrink-0">
                                <i class="fas fa-home"></i>
                            </span>
                            <span class="font-black text-slate-800 text-sm truncate">${addr}</span>
                        </div>
                        <div class="text-[11px] text-emerald-700 font-bold mt-1 flex items-center gap-1.5 ml-8 flex-wrap">
                            <span class="inline-flex items-center text-emerald-600">
                                <i class="fas fa-check-circle mr-1"></i>รับแล้ว ${dateStr ? `(${dateStr})` : ''}
                            </span>
                            ${item.name ? `<span class="text-slate-500 font-normal">| ผู้รับ: ${item.name}</span>` : ''}
                        </div>
                    </div>
                    <button type="button" disabled
                        class="px-3.5 py-2 bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl cursor-not-allowed opacity-80 flex items-center whitespace-nowrap flex-shrink-0">
                        <i class="fas fa-check mr-1.5"></i>รับแล้ว
                    </button>
                </div>
            `;
        } else {
            html += `
                <div class="p-3 md:p-3.5 bg-white hover:bg-amber-50/40 border border-slate-200 hover:border-amber-300 rounded-2xl flex items-center justify-between gap-3 shadow-sm hover:shadow transition-all group">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-lg bg-slate-100 group-hover:bg-amber-100 text-slate-400 group-hover:text-amber-600 flex items-center justify-center text-xs flex-shrink-0 transition-colors">
                                <i class="fas fa-home"></i>
                            </span>
                            <span class="font-bold text-slate-800 text-sm truncate">${addr}</span>
                        </div>
                        <div class="text-[11px] text-slate-400 font-medium mt-1 flex items-center gap-1 ml-8">
                            <i class="far fa-circle text-[9px] text-slate-300"></i>
                            <span>ยังไม่ได้รับถุงยังชีพ</span>
                        </div>
                    </div>
                    <button type="button" onclick='quickSaveReliefByAddress(${JSON.stringify(addr)}, this)'
                        class="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs rounded-xl shadow-md shadow-amber-200 transition-all flex items-center whitespace-nowrap flex-shrink-0 cursor-pointer">
                        <i class="fas fa-bolt mr-1.5"></i>บันทึกแจก
                    </button>
                </div>
            `;
        }
    });

    listContainer.innerHTML = html;
};

window.quickSaveReliefByAddress = async function (addr, btnEl) {
    if (typeof checkAdminReadOnlyAction === 'function' && checkAdminReadOnlyAction()) return;

    if (!addr || !addr.trim()) {
        Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลที่อยู่', 'warning');
        return;
    }

    const cleanAddr = addr.trim();

    // ตรวจสอบการแจกซ้ำ
    if (store && store.reliefData && store.reliefData.length > 0) {
        const isDuplicate = store.reliefData.some(r => {
            const existingAddress = r[4] ? r[4].toString().trim() : '';
            return existingAddress === cleanAddr;
        });

        if (isDuplicate) {
            Swal.fire({
                title: 'ไม่สามารถบันทึกได้!',
                html: `ที่อยู่ <b>"${cleanAddr}"</b> <br><span class="text-rose-500">มีการรับถุงยังชีพไปแล้ว</span>`,
                icon: 'error',
                confirmButtonColor: '#ef4444'
            });
            window.renderModalZoneAddresses();
            return;
        }
    }

    const originalBtnHTML = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>บันทึก...';
    }

    const payload = {
        action: 'saveRelief',
        name: '', // เว้นว่างตามความต้องการเพื่อความรวดเร็ว
        status: 'เจ้าบ้าน',
        members: 1,
        address: cleanAddr,
        regisAddress: cleanAddr,
        period: typeof currentPeriod !== 'undefined' ? currentPeriod : ''
    };

    try {
        if (typeof sbSaveRelief === 'function') {
            await sbSaveRelief(payload);
        } else {
            throw new Error('Supabase Service ไม่พร้อมทำงาน');
        }

        // เพิ่มข้อมูลลงใน local store ทันที (Optimistic UI)
        if (!store.reliefData) store.reliefData = [];
        const nowIso = new Date().toISOString();
        store.reliefData.unshift([nowIso, '', 'เจ้าบ้าน', 1, cleanAddr, cleanAddr]);

        // อัปเดตตารางหลักและ Dashboard ด้านหลัง
        if (typeof renderReliefTable === 'function') renderReliefTable();
        if (typeof renderStockDashboard === 'function') renderStockDashboard();

        // รีเฟรชรายการใน Modal ทันที ให้เปลี่ยนเป็นสถานะ "รับแล้ว"
        window.renderModalZoneAddresses();

        // แสดงแจ้งเตือนแบบ Toast สั้นๆ ไม่รบกวนหน้าจอ
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true
        });
        Toast.fire({
            icon: 'success',
            title: `บันทึกแจกถุงยังชีพสำเร็จ:<br><span class="text-xs text-slate-600 font-bold">${cleanAddr}</span>`
        });
    } catch (err) {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = originalBtnHTML;
        }
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
};

window.openReliefModal = function () {
    const form = document.getElementById('reliefForm');
    if (form) form.reset();

    const sameAddrCheckbox = document.getElementById('rel_same_addr');
    if (sameAddrCheckbox) sameAddrCheckbox.checked = false;

    if (typeof window.copyAddress === 'function') {
        window.copyAddress(false);
    }

    const ocrInput = document.getElementById('ocr_id_card');
    if (ocrInput) ocrInput.value = '';

    const resultBox = document.getElementById('rel_address_results');
    if (resultBox) resultBox.classList.add('hidden');

    const searchInput = document.getElementById('reliefZoneSearchInput');
    if (searchInput) searchInput.value = '';
    window.modalZoneSearchQuery = '';

    window.reliefAddressList = getReliefAddressList();
    const modal = document.getElementById('reliefModal');
    if (modal) modal.classList.remove('hidden');

    // เริ่มต้นแสดงผลโหมดที่เลือกไว้ (ค่าเริ่มต้นคือแบบเลือกตามโซน)
    window.switchReliefModalMode(window.currentReliefModalMode || 'zone');
};

window.closeReliefModal = function () {
    const modal = document.getElementById('reliefModal');
    if (modal) modal.classList.add('hidden');

    const resultBox = document.getElementById('rel_address_results');
    if (resultBox) resultBox.classList.add('hidden');
};

window.copyAddress = function (isChecked) {
    const regisInput = document.getElementById('rel_regis_address');
    if (!regisInput) return;
    if (isChecked) {
        const address = document.getElementById('rel_address_search').value;
        regisInput.value = address;
    } else {
        regisInput.value = '';
    }
};

window.saveReliefData = async function (e) {
    if (e && e.preventDefault) e.preventDefault();
    if (typeof checkAdminReadOnlyAction === 'function' && checkAdminReadOnlyAction()) return;
    const address = document.getElementById('rel_address_search').value.trim();

    if (!address) {
        Swal.fire('แจ้งเตือน', 'กรุณาระบุที่อยู่ปัจจุบันให้ครบถ้วน', 'warning');
        return;
    }

    if (store.reliefData && store.reliefData.length > 0) {
        const isDuplicate = store.reliefData.some(r => {
            const existingAddress = r[4] ? r[4].toString().trim() : '';
            return existingAddress === address;
        });

        if (isDuplicate) {
            Swal.fire({
                title: 'ไม่สามารถบันทึกได้!',
                html: `ที่อยู่ <b>"${address}"</b> <br><span class="text-rose-500">มีการรับถุงยังชีพไปแล้ว</span>`,
                icon: 'error',
                confirmButtonColor: '#ef4444'
            });
            return;
        }
    }

    const payload = {
        action: 'saveRelief',
        name: document.getElementById('rel_name').value,
        status: document.getElementById('rel_status').value,
        members: document.getElementById('rel_members').value,
        address: address,
        regisAddress: document.getElementById('rel_regis_address').value,
        period: typeof currentPeriod !== 'undefined' ? currentPeriod : ''
    };

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });

    try {
        if (typeof sbSaveRelief === 'function') {
            await sbSaveRelief(payload);
        } else {
            throw new Error('Supabase Service ไม่พร้อมทำงาน');
        }

        Swal.fire({
            title: 'สำเร็จ',
            text: 'บันทึกข้อมูลแจกถุงยังชีพเรียบร้อย',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });

        e.target.reset();
        document.getElementById('rel_address_search').value = '';

        window.closeReliefModal();
        if (typeof loadData === 'function') await loadData();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
};

window.renderStockDashboard = function () {
    if (!store.reliefStock) return;

    let totalIn = 0;
    let totalOut = 0;

    store.reliefStock.forEach(r => {
        const type = r[1] ? r[1].toString().toLowerCase().trim() : '';
        const amount = Number(r[2]) || 0;
        if (type === 'in' || type === 'รับเข้า') totalIn += amount;
        if (type === 'out' || type === 'จ่ายออก') totalOut += amount;
    });

    const remain = totalIn - totalOut;

    if (document.getElementById('stockInCount')) document.getElementById('stockInCount').innerText = totalIn;
    if (document.getElementById('stockOutCount')) document.getElementById('stockOutCount').innerText = totalOut;

    const remainEl = document.getElementById('stockRemainCount');
    if (remainEl) {
        remainEl.innerText = remain;
        if (remain <= 0) {
            remainEl.className = "text-5xl font-black text-rose-500";
        } else if (remain <= 50) {
            remainEl.className = "text-5xl font-black text-amber-500";
        } else {
            remainEl.className = "text-5xl font-black text-emerald-500";
        }
    }
};

function openStockModal() {
    const modal = document.getElementById('stockModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    if (store && store.reliefStock) {
        renderStockTable();
    } else {
        const tbody = document.getElementById('stockTableBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-400 italic text-xs">ไม่พบข้อมูลในระบบ หรือ กำลังโหลด...</td></tr>`;
        if (typeof loadData === "function") loadData();
    }

    setTimeout(() => {
        modal.classList.remove('opacity-0');
        const box = modal.querySelector('.bg-white');
        if (box) box.classList.remove('scale-95');
    }, 10);
}

function closeStockModal() {
    const modal = document.getElementById('stockModal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    const box = modal.querySelector('.bg-white');
    if (box) box.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
}

async function saveStock(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (typeof checkAdminReadOnlyAction === 'function' && checkAdminReadOnlyAction()) return;
    const btn = e.target.querySelector('button');
    btn.innerText = "กำลังบันทึก..."; btn.disabled = true;

    const payload = {
        action: 'saveStock',
        type: document.getElementById('stock_type').value,
        amount: document.getElementById('stock_amount').value,
        note: document.getElementById('stock_note').value,
        user: typeof currentUser !== 'undefined' ? currentUser : '',
        period: typeof currentPeriod !== 'undefined' ? currentPeriod : ''
    };

    try {
        if (typeof sbSaveStock === 'function') {
            await sbSaveStock(payload);
        } else {
            throw new Error('Supabase Service ไม่พร้อมทำงาน');
        }
        Swal.fire('สำเร็จ', 'อัปเดตสต๊อกเรียบร้อยแล้ว', 'success');
        document.getElementById('stockForm').reset();
        closeStockModal();
        if (typeof loadData === 'function') loadData();
    } catch (err) { Swal.fire('ผิดพลาด', err.message || 'บันทึกไม่สำเร็จ', 'error'); }
    btn.innerText = "บันทึกสต๊อก"; btn.disabled = false;
}

function renderStockTable() {
    const tbody = document.getElementById('stockTableBody');
    if (!tbody) return;

    if (!store || !store.reliefStock || store.reliefStock.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-300 italic text-xs">ยังไม่มีประวัติการทำรายการในขณะนี้</td></tr>`;
        return;
    }

    const displayData = [...store.reliefStock].reverse();

    tbody.innerHTML = displayData.map(r => {
        let dateStr = "-";
        let timeStr = "";
        try {
            if (r[0]) {
                const d = new Date(r[0]);
                dateStr = d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
                timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            }
        } catch (e) { console.error("Date error", e); }

        const type = (r[1] || '').toString().toLowerCase() === 'in' ?
            '<span class="text-blue-500 font-bold text-[10px]">รับเข้า</span>' :
            '<span class="text-rose-500 font-bold text-[10px]">จ่ายออก</span>';

        const amount = Number(r[2] || 0).toLocaleString();
        const note = r[3] || '-';

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">
                <td class="p-2">
                    <div class="font-bold text-slate-700 text-[11px]">${dateStr}</div>
                    <div class="text-[8px] opacity-40">${timeStr}</div>
                </td>
                <td class="p-2 text-center">${type}</td>
                <td class="p-2 text-right font-black ${r[1] === 'in' ? 'text-blue-600' : 'text-rose-600'} text-[11px]">
                    ${amount}
                </td>
                <td class="p-2 text-right">
                    <div class="text-[10px] text-slate-400 leading-tight truncate max-w-[70px] ml-auto" title="${note}">
                        ${note}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderReliefTable(data, isSearching = false) {
    const tableBody = document.getElementById('reliefTableBody');
    if (!tableBody) return;

    const summaryData = isSearching ? data : (store.reliefData || []);

    if (document.getElementById('totalReliefCount')) {
        document.getElementById('totalReliefCount').innerText = summaryData.length;
    }

    let counts = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };

    summaryData.forEach(r => {
        const address = r[4] ? r[4].toString() : '';
        const exactZone = window.getExactZoneForAddress ? window.getExactZoneForAddress(address) : 'zone 5';
        const zoneKey = exactZone.replace(' ', '');

        if (counts[zoneKey] !== undefined) {
            counts[zoneKey]++;
        }
    });

    if (document.getElementById('zone1Count')) document.getElementById('zone1Count').innerText = counts.zone1;
    if (document.getElementById('zone2Count')) document.getElementById('zone2Count').innerText = counts.zone2;
    if (document.getElementById('zone3Count')) document.getElementById('zone3Count').innerText = counts.zone3;
    if (document.getElementById('zone4Count')) document.getElementById('zone4Count').innerText = counts.zone4;
    if (document.getElementById('zone5Count')) document.getElementById('zone5Count').innerText = counts.zone5;

    if (!data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-20 text-slate-400 font-bold"><i class="fas fa-search-minus text-3xl mb-3 block opacity-20"></i>ไม่พบข้อมูล</td></tr>`;
        return;
    }

    let displayData = isSearching ? data : [...data].reverse();
    window.currentReliefDisplayData = displayData;

    tableBody.innerHTML = displayData.map((r, index) => {
        const timestamp = r[0] ? new Date(r[0]).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
        const statusClass = r[2] === 'เจ้าบ้าน' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-amber-50 text-amber-600 border-amber-100';

        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="p-5 text-center font-bold text-slate-300">
                    ${isSearching ? '•' : (displayData.length - index)}
                </td>
                <td class="p-5">
                    <div class="text-[9px] text-slate-400 font-bold mb-1"><i class="far fa-clock mr-1"></i>${timestamp}</div>
                    <div class="font-black text-slate-700 text-sm">${r[1] || 'ไม่ระบุชื่อ'}</div>
                </td>
                <td class="p-5 text-slate-600 font-medium leading-relaxed">${r[4] || '-'}</td>
                <td class="p-5 text-center">
                    <span class="bg-slate-100 text-slate-600 px-3 py-1 rounded-xl font-black">${r[3] || 0}</span>
                </td>
                <td class="p-5 text-center">
                    <span class="px-3 py-1 rounded-full font-black text-[9px] border ${statusClass} shadow-sm uppercase">
                        ${r[2] || 'ปกติ'}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

function filterByZone(zoneKey) {
    if (!store.reliefData) return;
    window.currentZoneFilter = zoneKey;

    const searchInput = document.getElementById('reliefSearchInput');
    if (searchInput) searchInput.value = '';

    const clearArea = document.getElementById('clearFilterArea');
    if (clearArea) clearArea.classList.remove('hidden');

    const filteredData = store.reliefData.filter(r => {
        const address = r[4] ? r[4].toString() : '';
        return (window.getExactZoneForAddress ? window.getExactZoneForAddress(address) : 'zone 5') === zoneKey;
    });

    document.querySelectorAll('.zone-filter-btn').forEach(btn => {
        btn.classList.replace('bg-blue-50', 'bg-white');
        btn.style.opacity = "0.5";
        btn.classList.remove('ring-2');
    });

    const activeBtn = document.getElementById(`btn-${zoneKey}`);
    if (activeBtn) {
        activeBtn.style.opacity = "1";
        activeBtn.classList.add('ring-2');
    }

    renderReliefTable(filteredData, true);
}

function clearZoneFilter() {
    window.currentZoneFilter = '';
    const clearArea = document.getElementById('clearFilterArea');
    if (clearArea) clearArea.classList.add('hidden');

    const searchInput = document.getElementById('reliefSearchInput');
    if (searchInput) searchInput.value = '';

    document.querySelectorAll('.zone-filter-btn').forEach(btn => {
        btn.classList.replace('bg-white', 'bg-blue-50');
        btn.style.opacity = "1";
        btn.classList.remove('ring-2');
    });

    renderReliefTable(store.reliefData || []);
}

function filterReliefTable() {
    const input = document.getElementById('reliefSearchInput');
    const searchTerm = input ? input.value.toLowerCase() : '';
    const allData = store.reliefData || [];

    const filtered = allData.filter(r => {
        const name = (r[1] || "").toLowerCase();
        const address = (r[4] || "").toLowerCase();
        return name.includes(searchTerm) || address.includes(searchTerm);
    });

    const matchCountEl = document.getElementById('reliefMatchCount');
    if (matchCountEl) {
        matchCountEl.innerText = `พบ ${filtered.length} จาก ${allData.length} รายการ`;
    }

    renderReliefTable(filtered, true);
}

window.printReliefTable = function () {
    const data = window.currentReliefDisplayData || [];

    if (data.length === 0) {
        Swal.fire('ไม่พบข้อมูล', 'ไม่มีข้อมูลสำหรับพิมพ์', 'warning');
        return;
    }

    const printArea = document.getElementById('printArea');
    const searchInputRaw = document.getElementById('reliefSearchInput') ? document.getElementById('reliefSearchInput').value : '';
    const searchText = searchInputRaw.toLowerCase().trim();
    const activeZoneVar = typeof window.currentZoneFilter !== 'undefined' ? window.currentZoneFilter : '';

    let filterText = "ข้อมูลทั้งหมด";
    const getZoneDetailsString = (zoneKey) => {
        if (window.ZONE_RULES && window.ZONE_RULES[zoneKey]) {
            return ` (${window.ZONE_RULES[zoneKey].join(', ')})`;
        }
        return '';
    };

    if (activeZoneVar && activeZoneVar !== 'all') {
        const zoneKey = activeZoneVar.toLowerCase();
        filterText = `กรองตามโซน: ${activeZoneVar.toUpperCase()}${getZoneDetailsString(zoneKey)}`;
        if (searchText) filterText += ` | ค้นหาเพิ่มเติม: "${searchInputRaw}"`;
    } else if (searchText) {
        filterText = `ค้นหาคำว่า: "${searchInputRaw}"`;
    }

    const originalChildren = [];
    Array.from(printArea.children).forEach(child => {
        originalChildren.push({ el: child, display: child.style.display });
        child.style.display = 'none';
    });

    const tempDiv = document.createElement('div');
    tempDiv.className = "print-page";
    tempDiv.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #334155; padding-bottom: 15px;">
            <h2 style="font-size: 18px; font-weight: bold; margin: 0;">รายงานการแจกถุงยังชีพ เทศบาลตำบลตันหยงมัส</h2>
            <p style="font-size: 12px; margin: 5px 0; color: #64748b; font-weight: bold;">เงื่อนไขข้อมูล: ${filterText}</p>
            
            <div style="display: inline-block; background: #fffbeb; border: 1px solid #fcd34d; padding: 6px 20px; border-radius: 20px; margin-top: 8px;">
                <span style="font-size: 14px; font-weight: bold; color: #d97706;">จำนวนถุงยังชีพที่แจกแล้ว: ${data.length} ชุด</span>
            </div>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead style="background-color: #f1f5f9;">
                <tr>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 40px;">ลำดับ</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">วัน-เวลา ที่รับ</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">ชื่อ-นามสกุลผู้รับ</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">ที่อยู่</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">จำนวนผู้อาศัย</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">สถานะผู้รับ</th>
                </tr>
            </thead>
            <tbody>
                ${data.map((r, i) => {
                    const timestamp = r[0] ? new Date(r[0]).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
                    return `
                        <tr>
                            <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${i + 1}</td>
                            <td style="border: 1px solid #cbd5e1; padding: 6px;">${timestamp}</td>
                            <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${r[1] || '-'}</td>
                            <td style="border: 1px solid #cbd5e1; padding: 6px;">${r[4] || '-'}</td>
                            <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${r[3] || 0}</td>
                            <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${r[2] || '-'}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    printArea.appendChild(tempDiv);
    printArea.classList.remove('hidden');

    setTimeout(() => {
        window.print();
        printArea.classList.add('hidden');
        printArea.removeChild(tempDiv);
        originalChildren.forEach(item => { item.el.style.display = item.display; });
    }, 300);
};

window.initReliefForm = initReliefForm;
window.getReliefAddressList = getReliefAddressList;
window.openStockModal = openStockModal;
window.closeStockModal = closeStockModal;
window.saveStock = saveStock;
window.renderStockTable = renderStockTable;
window.renderReliefTable = renderReliefTable;
window.filterByZone = filterByZone;
window.clearZoneFilter = clearZoneFilter;
window.filterReliefTable = filterReliefTable;
window.switchReliefModalMode = switchReliefModalMode;
window.selectModalZone = selectModalZone;
window.handleModalZoneSearch = handleModalZoneSearch;
window.renderModalZoneAddresses = renderModalZoneAddresses;
window.quickSaveReliefByAddress = quickSaveReliefByAddress;
