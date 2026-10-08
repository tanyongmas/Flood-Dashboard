/**
 * 📢 Public Report & Citizen Evacuation Module
 * โหมดประชาชนแจ้งสถานการณ์ฉุกเฉิน (Safe / Evacuate) และระบบสืบค้นที่อยู่อัจฉริยะ
 * เทศบาลตำบลตันหยงมัส
 */

// สลับตัวเลือกสถานที่อพยพใน Popup (ศูนย์พักพิง / ที่อื่น)
window.toggleEvacDest = function (type) {
    const boxC = document.getElementById('box_dest_center');
    const boxO = document.getElementById('box_dest_other');
    const btnC = document.getElementById('btn_dest_center');
    const btnO = document.getElementById('btn_dest_other');
    const typeInput = document.getElementById('swal_evac_type');
    if (typeInput) typeInput.value = type;

    if (type === 'ศูนย์') {
        if (boxC) boxC.classList.remove('hidden');
        if (boxO) boxO.classList.add('hidden');
        if (btnC) btnC.className = "flex-1 py-3 rounded-xl border-2 border-orange-400 bg-orange-50 text-orange-600 font-bold text-xs transition-all";
        if (btnO) btnO.className = "flex-1 py-3 rounded-xl border-2 border-transparent bg-slate-50 text-slate-500 font-bold text-xs transition-all";
    } else {
        if (boxO) boxO.classList.remove('hidden');
        if (boxC) boxC.classList.add('hidden');
        if (btnO) btnO.className = "flex-1 py-3 rounded-xl border-2 border-orange-400 bg-orange-50 text-orange-600 font-bold text-xs transition-all";
        if (btnC) btnC.className = "flex-1 py-3 rounded-xl border-2 border-transparent bg-slate-50 text-slate-500 font-bold text-xs transition-all";
    }
};

// ดึงประวัติที่อยู่จากชีททั้งหมดในระบบ (Address_Evacuation, Addresses, Flood_DATA, Relief)
window.getEvacAddressList = function () {
    if (typeof store === 'undefined' || !store) return [];

    const evacAddrs = (store.addressEvac && Array.isArray(store.addressEvac))
        ? store.addressEvac.map(row => row[0] ? row[0].toString().trim() : '').filter(a => a !== '')
        : [];

    const regisAddrs = (store.addresses && Array.isArray(store.addresses))
        ? store.addresses.map(a => a ? a.toString().trim() : '').filter(a => a !== '')
        : [];

    const floodAddrs = (store.floodData && Array.isArray(store.floodData))
        ? store.floodData.map(row => row[2] ? row[2].toString().trim() : (row[1] ? row[1].toString().trim() : '')).filter(a => a !== '')
        : [];

    const reliefAddrs = (store.reliefData && Array.isArray(store.reliefData))
        ? store.reliefData.map(r => r[4] ? r[4].toString().trim() : '').filter(a => a !== '')
        : [];

    return [...new Set([...evacAddrs, ...regisAddrs, ...floodAddrs, ...reliefAddrs])].filter(a => a !== '').sort();
};

// ค้นหาที่อยู่แบบ Autocomplete
window.handleEvacAddressSearch = function (val) {
    const resultBox = document.getElementById('swal_evac_addr_results');
    if (!resultBox) return;

    if (!val || val.trim().length < 1) {
        resultBox.classList.add('hidden');
        return;
    }

    if (!window.evacAddressList || window.evacAddressList.length === 0) {
        window.evacAddressList = window.getEvacAddressList();
    }

    const searchVal = val.toLowerCase().trim();
    const filtered = window.evacAddressList.filter(a => a.toLowerCase().includes(searchVal)).slice(0, 15);

    if (filtered.length > 0) {
        let html = '';
        filtered.forEach(addr => {
            html += `<div onclick='selectEvacAddress(${JSON.stringify(addr)})' class="p-3 hover:bg-orange-100 cursor-pointer border-b border-slate-100 text-sm text-slate-700 transition-colors flex items-center justify-between"><span class="font-medium">${addr}</span><i class="fas fa-chevron-right text-[10px] text-orange-400"></i></div>`;
        });
        resultBox.innerHTML = html;
        resultBox.classList.remove('hidden');
    } else {
        resultBox.innerHTML = '<div class="p-3 text-xs text-orange-600 font-bold bg-orange-50 flex items-center"><i class="fas fa-info-circle mr-2"></i>ไม่พบที่อยู่นี้ในระบบ (สามารถเลือก "ระบุที่อยู่อื่นๆ" ด้านล่างได้)</div>';
        resultBox.classList.remove('hidden');
    }
};

window.selectEvacAddress = function (addr) {
    const input = document.getElementById('swal_evac_addr_search');
    if (input) input.value = addr;
    const resBox = document.getElementById('swal_evac_addr_results');
    if (resBox) resBox.classList.add('hidden');
};

window.toggleEvacOtherAddress = function (isChecked) {
    const boxOther = document.getElementById('box_evac_other_addr');
    const inputSearch = document.getElementById('swal_evac_addr_search');

    if (isChecked) {
        if (boxOther) boxOther.classList.remove('hidden');
        if (inputSearch) {
            inputSearch.disabled = true;
            inputSearch.classList.add('opacity-50');
        }
        window.getEvacLocation();
    } else {
        if (boxOther) boxOther.classList.add('hidden');
        if (inputSearch) {
            inputSearch.disabled = false;
            inputSearch.classList.remove('opacity-50');
        }
    }
};

window.getEvacLocation = function () {
    const coordsInput = document.getElementById('swal_evac_coords');
    if (!coordsInput) return;
    coordsInput.value = 'กำลังค้นหาตำแหน่งพิกัด GPS...';

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (p) => {
                coordsInput.value = `${p.coords.latitude},${p.coords.longitude}`;
            },
            (err) => {
                console.warn(err);
                coordsInput.value = 'กรุณาเปิด GPS และกดปุ่มดึงพิกัดอีกครั้ง';
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    } else {
        coordsInput.value = 'อุปกรณ์ไม่รองรับระบบพิกัด';
    }
};

async function saveEvacuationData(data) {
    Swal.fire({
        title: 'กำลังบันทึกข้อมูล...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    const nameInput = document.getElementById('evac_name');
    const payload = {
        action: 'saveEvacuation',
        address: data.address,
        count: data.count,
        type: data.type,
        dest: data.dest,
        user: typeof currentUser !== 'undefined' ? currentUser : 'ประชาชน',
        coords: data.coords,
        evacName: data.evacName,
        status: data.status,
        note: data.note,
        period: typeof currentPeriod !== 'undefined' ? currentPeriod : ''
    };

    try {
        if (typeof sbSaveEvacuation === 'function') {
            await sbSaveEvacuation(payload);
        } else {
            throw new Error('Supabase Service ไม่พร้อมทำงาน');
        }

        const isPublic = window.isPublicMode || false;
        Swal.fire({
            title: 'บันทึกสำเร็จ',
            text: isPublic ? 'เทศบาลตำบลตันหยงมัสได้รับรายงานของท่านแล้ว ขอบคุณครับ' : 'อัปเดตรายงานสถานะเรียบร้อยแล้ว',
            icon: 'success',
            timer: isPublic ? 3000 : 1500,
            showConfirmButton: false
        });

        if (nameInput) nameInput.value = '';

        if (!isPublic && typeof loadData === 'function') {
            await loadData();
            if (typeof loadEvacuationMarkers === 'function') {
                loadEvacuationMarkers();
            }
        }
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

window.promptSafetyCheck = function () {
    Swal.fire({
        title: '<div class="text-2xl font-black text-slate-800">รายงานสถานะปัจจุบัน</div>',
        html: `
            <p class="text-sm text-slate-500 mb-6">กรุณาเลือกสถานะของคุณ หรือผู้ประสบภัย</p>
            <div class="space-y-3 px-2">
                <button onclick="Swal.close(); setTimeout(() => openEvacReportModal('ปลอดภัย'), 300)" 
                        class="w-full flex items-center p-4 bg-emerald-50 border-2 border-emerald-200 rounded-2xl hover:bg-emerald-100 hover:border-emerald-400 transition-all active:scale-95 group text-left shadow-sm">
                    <div class="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-sm mr-4 shrink-0">
                        <i class="fas fa-check-circle"></i> 
                    </div>
                    <div>
                        <div class="text-lg font-bold text-emerald-700">ปลอดภัย (Safe)</div>
                        <div class="text-xs text-emerald-600/80 font-medium">น้ำไม่ท่วม / อาศัยอยู่ชั้นบนได้ / ยังรับมือไหว</div>
                    </div>
                </button>
                
                <button onclick="Swal.close(); setTimeout(() => openEvacReportModal('อพยพ'), 300)" 
                        class="w-full flex items-center p-4 bg-orange-50 border-2 border-orange-200 rounded-2xl hover:bg-orange-100 hover:border-orange-400 transition-all active:scale-95 group text-left shadow-sm">
                    <div class="w-14 h-14 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-sm mr-4 shrink-0">
                        <i class="fas fa-person-running"></i>
                    </div>
                    <div>
                        <div class="text-lg font-bold text-orange-700">อพยพ (Evacuate)</div>
                        <div class="text-xs text-orange-600/80 font-medium">ย้ายออก / น้ำท่วมสูง / ต้องการความช่วยเหลือ</div>
                    </div>
                </button>
            </div>
        `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'ยกเลิก',
        customClass: {
            popup: 'rounded-[2.5rem] pb-6',
            cancelButton: 'w-full py-3 mt-4 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 font-bold max-w-[200px] transition-colors',
        }
    });
};

window.openEvacReportModal = function (status = 'อพยพ') {
    window.evacAddressList = (typeof window.getEvacAddressList === 'function') ? window.getEvacAddressList() : [];

    const shelters = ["ศูนย์เทศบาลตำบลตันหยงมัส", "ศูนย์มัสยิดตันหยงมัส", "ศูนย์โรงเรียนบ้านเขาพระ"];
    const shelterOptions = shelters.map(s => `<option value="${s}">${s}</option>`).join('');

    const isSafe = (status === 'ปลอดภัย');
    const titleColor = isSafe ? 'text-emerald-600' : 'text-orange-600';
    const titleIcon = isSafe ? 'fa-check-circle' : 'fa-bullhorn';
    const titleText = isSafe ? 'รายงานสถานะ: ปลอดภัย' : 'รายงานสถานะ: อพยพ';
    const btnColor = isSafe ? '#10b981' : '#f97316';

    const destSectionHtml = isSafe ? '' : `
        <div id="evac_dest_wrapper">
            <div>
                <label class="text-[11px] font-bold text-slate-500 ml-1">อพยพไปที่ใด?</label>
                <div class="flex gap-2 mt-1">
                    <button onclick="toggleEvacDest('ศูนย์')" id="btn_dest_center" class="flex-1 py-3 rounded-xl border-2 border-orange-400 bg-orange-50 text-orange-600 font-bold text-xs transition-all">ศูนย์พักพิง</button>
                    <button onclick="toggleEvacDest('ที่อื่น')" id="btn_dest_other" class="flex-1 py-3 rounded-xl border-2 border-transparent bg-slate-50 text-slate-500 font-bold text-xs transition-all">ที่อื่น ๆ</button>
                </div>
            </div>
            
            <div id="box_dest_center" class="animate-fade-in mt-3">
                <label class="text-[11px] font-bold text-slate-500 ml-1">เลือกศูนย์พักพิง</label>
                <select id="swal_evac_shelter" class="w-full p-3 border border-slate-200 bg-white rounded-xl outline-none text-sm focus:border-orange-400">
                    ${shelterOptions}
                </select>
            </div>
            <div id="box_dest_other" class="hidden animate-fade-in mt-3">
                <label class="text-[11px] font-bold text-slate-500 ml-1">ระบุสถานที่อพยพ (คร่าวๆ)</label>
                <input type="text" id="swal_evac_other_text" class="w-full p-3 border border-slate-200 bg-white rounded-xl outline-none text-sm focus:border-orange-400" placeholder="เช่น บ้านญาติ, ตึกแถวชั้น 2">
            </div>
            <input type="hidden" id="swal_evac_type" value="ศูนย์">
        </div>
    `;

    Swal.fire({
        title: `<div class="flex items-center justify-center gap-2 ${titleColor} text-lg font-black"><i class="fas ${titleIcon}"></i> ${titleText}</div>`,
        html: `
            <div class="text-left space-y-4 p-2 mt-2" style="overflow: visible;">
                <input type="hidden" id="swal_evac_status" value="${status}">

                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">ชื่อ-สกุล (หัวหน้าครอบครัว/ผู้อพยพ)</label>
                    <input type="text" id="swal_evac_name" class="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-50 transition-all" placeholder="ระบุชื่อ-สกุล..." required>
                </div>

                <div class="relative">
                    <label class="text-[11px] font-bold text-slate-500 ml-1">ค้นหาที่อยู่ / ชุมชน</label>
                    <input type="text" id="swal_evac_addr_search" onkeyup="handleEvacAddressSearch(this.value)" autocomplete="off" class="w-full p-3 border border-orange-100 bg-orange-50 rounded-xl outline-none text-sm focus:ring-2 focus:ring-orange-300" placeholder="พิมพ์เพื่อค้นหาที่อยู่เดิม...">
                    <div id="swal_evac_addr_results" class="absolute z-[99] w-full bg-white border border-slate-200 rounded-xl shadow-2xl hidden max-h-40 overflow-y-auto mt-1"></div>
                    
                    <div class="mt-3 flex items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <input type="checkbox" id="swal_evac_is_other" onchange="toggleEvacOtherAddress(this.checked)" class="w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-500">
                        <label for="swal_evac_is_other" class="ml-2 text-xs font-bold text-slate-600">ระบุที่อยู่อื่นๆ (ดึงพิกัดปัจจุบันอัตโนมัติ)</label>
                    </div>
                </div>

                <div id="box_evac_other_addr" class="hidden animate-fade-in bg-slate-100 p-3 rounded-xl border border-slate-200 shadow-inner">
                    <label class="text-[11px] font-bold text-slate-500 ml-1">พิมพ์ที่อยู่อื่นๆ ที่ไม่ได้อยู่ในระบบ</label>
                    <input type="text" id="swal_evac_custom_addr" class="w-full p-3 border border-slate-200 bg-white rounded-xl outline-none text-sm focus:border-orange-400 mb-3" placeholder="ระบุบ้านเลขที่/ซอย/จุดสังเกต">
                    
                    <label class="text-[11px] font-bold text-slate-500 ml-1">พิกัด GPS (ดึงอัตโนมัติ)</label>
                    <div class="flex gap-2">
                        <input type="text" id="swal_evac_coords" readonly class="w-full p-3 border border-slate-200 bg-white text-slate-500 rounded-xl outline-none text-[10px]" placeholder="รอการดึงพิกัด...">
                        <button type="button" onclick="getEvacLocation()" class="bg-blue-100 text-blue-600 px-4 rounded-xl hover:bg-blue-200 transition shadow-sm active:scale-95">
                            <i class="fas fa-map-marker-alt"></i>
                        </button>
                    </div>
                </div>

                <div>
                    <label class="text-[11px] font-bold text-slate-500 ml-1">จำนวนคนที่อยู่ด้วยกัน (คน)</label>
                    <input type="number" id="swal_evac_count" min="1" class="w-full p-3 border border-orange-100 bg-orange-50 rounded-xl outline-none text-sm focus:ring-2 focus:ring-orange-300" placeholder="ระบุจำนวนคน">
                </div>

                ${destSectionHtml}

                <div class="mt-4">
                    <label class="text-[11px] font-bold text-slate-500 ml-1">รายละเอียดเพิ่มเติม / ความช่วยเหลือที่ต้องการ</label>
                    <textarea id="swal_evac_note" rows="2" class="w-full p-3 border border-slate-200 bg-white rounded-xl outline-none text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-50 placeholder-slate-300" placeholder="เช่น ต้องการน้ำดื่ม, ยารักษาโรค, ต้องการเรือเข้ามารับ..."></textarea>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'บันทึกรายงาน',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: btnColor,
        customClass: { popup: 'rounded-[2rem]' },
        didOpen: () => {
            const content = Swal.getHtmlContainer();
            if (content) content.style.overflow = 'visible';
        },
        preConfirm: () => {
            const evacName = document.getElementById('swal_evac_name').value.trim();
            const isOtherAddr = document.getElementById('swal_evac_is_other').checked;
            let address = document.getElementById('swal_evac_addr_search').value.trim();
            let coords = '';
            const currentStatus = document.getElementById('swal_evac_status').value;
            const note = document.getElementById('swal_evac_note').value.trim();

            if (!evacName) { Swal.showValidationMessage('กรุณาระบุชื่อ-สกุล'); return false; }

            if (isOtherAddr) {
                address = document.getElementById('swal_evac_custom_addr').value.trim();
                coords = document.getElementById('swal_evac_coords').value;
                if (!address || !coords || coords.includes('กำลัง') || coords.includes('กรุณา')) {
                    Swal.showValidationMessage('กรุณาระบุที่อยู่อื่นๆ และตรวจสอบพิกัด GPS'); return false;
                }
            } else if (!address) {
                Swal.showValidationMessage('กรุณาค้นหาและเลือกที่อยู่ หรือติ๊กเพื่อระบุที่อยู่อื่น'); return false;
            }

            const count = document.getElementById('swal_evac_count').value;
            if (!count) { Swal.showValidationMessage('กรุณาระบุจำนวนคน'); return false; }

            let type = '-';
            let dest = '-';

            if (currentStatus === 'อพยพ') {
                type = document.getElementById('swal_evac_type').value;
                dest = (type === 'ศูนย์') ? document.getElementById('swal_evac_shelter').value : document.getElementById('swal_evac_other_text').value;
                if (!dest) { Swal.showValidationMessage('กรุณาระบุปลายทางที่อพยพไป'); return false; }
            }

            return { evacName, address, count, type, dest, coords, status: currentStatus, note };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            saveEvacuationData(result.value);
        }
    });
};

function openEvacuationForm(status) {
    const statusInput = document.getElementById('evac_status');
    if (statusInput) statusInput.value = status;

    const destWrapper = document.getElementById('evac_dest_wrapper');
    const statusDisplay = document.getElementById('evac_status_display');

    if (status === 'ปลอดภัย') {
        if (destWrapper) destWrapper.classList.add('hidden');
        if (statusDisplay) statusDisplay.innerHTML = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-shield-check mr-1"></i> รายงานสถานะ: ปลอดภัย</span>';
    } else {
        if (destWrapper) destWrapper.classList.remove('hidden');
        if (statusDisplay) statusDisplay.innerHTML = '<span class="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-person-running mr-1"></i> รายงานสถานะ: อพยพ</span>';
    }

    const modal = document.getElementById('evacuationModal');
    if (modal) modal.classList.remove('hidden');
}

window.showQRCode = function () {
    const publicUrl = "https://tanyongmas.github.io/Dashboard_Flood/?mode=report";
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(publicUrl)}`;

    Swal.fire({
        title: '<div class="text-indigo-700 font-black"><i class="fas fa-qrcode mr-2"></i> QR Code ประชาชน</div>',
        html: `
            <p class="text-xs text-slate-500 mb-4">สแกนเพื่อรายงานสถานะน้ำท่วม (ไม่ต้องล็อคอิน)</p>
            <div class="flex justify-center mb-4">
                <div class="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <img src="${qrImageUrl}" class="w-48 h-48" alt="QR Code" onerror="this.src='https://placehold.co/300x300?text=QR+Error'">
                </div>
            </div>
            <div class="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">ลิงก์สำหรับส่งในไลน์กลุ่ม / Facebook</label>
                <input type="text" readonly value="${publicUrl}" class="w-full p-2 text-[10px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg text-center outline-none focus:border-indigo-400" onclick="this.select()">
            </div>
        `,
        confirmButtonText: 'ปิดหน้าต่าง',
        confirmButtonColor: '#4f46e5',
        customClass: { popup: 'rounded-[2rem]' }
    });
};

window.saveEvacuationData = saveEvacuationData;
window.openEvacuationForm = openEvacuationForm;

// ==========================================
// 🌟 Clean Minimal Citizen Portal (โหมดประชาชน mode=report)
// ==========================================

// พิกัดสถานีระดับน้ำสะพานตันหยงมัส (X.73)
const PUBLIC_WATER_STATION = {
    name: 'สะพานตันหยงมัส (สถานี X.73)',
    sub: 'สถานีโทรมาตรตรวจวัดระดับน้ำหลัก กรมชลประทาน',
    lat: 6.297816981850148,
    lng: 101.73172224850232,
    bankLevel: 14.90,
    warningLevel: 13.50,
    criticalLevel: 14.90
};

// ข้อมูลศูนย์พักพิงหลัก 3 แห่ง
const PUBLIC_SHELTERS_DATA = [
    {
        name: 'ศูนย์เทศบาลตำบลตันหยงมัส',
        detail: 'อาคารอเนกประสงค์ เทศบาลตำบลตันหยงมัส',
        lat: 6.2942468005304475,
        lng: 101.72202727872536,
        capacity: 80,
        badge: 'ศูนย์หลัก'
    },
    {
        name: 'ศูนย์มัสยิดตันหยงมัส',
        detail: 'บริเวณมัสยิดกลางตันหยงมัส ชุมชนตลาด',
        lat: 6.29778118011179,
        lng: 101.72990501280613,
        capacity: 80,
        badge: 'เปิดรองรับ'
    },
    {
        name: 'ศูนย์โรงเรียนบ้านเขาพระ',
        detail: 'อาคารเรียน โรงเรียนบ้านเขาพระ',
        lat: 6.298263196460374,
        lng: 101.710772727857,
        capacity: 60,
        badge: 'เปิดรองรับ'
    }
];

let publicMiniMapInstance = null;

/**
 * ดึงข้อมูลระดับน้ำเรียลไทม์จาก RID API หรือ Cache
 */
async function getPublicRealtimeWaterData() {
    let result = null;

    // 1. ตรวจสอบ Browser Cache ก่อน
    if (typeof window.getAppCache === 'function') {
        const cached = window.getAppCache('rid_data') || window.getAppCache('rid_data_backup');
        if (cached && cached.success && cached.data) {
            result = cached;
        }
    }

    // 2. ดึงสดจาก API_URL ผ่าน action: 'getRIDData'
    if (!result && typeof API_URL !== 'undefined') {
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getRIDData' })
            });
            if (res.ok) {
                const parsed = await res.json();
                if (parsed && parsed.success && parsed.data) {
                    result = parsed;
                    if (typeof window.setAppCache === 'function') {
                        window.setAppCache('rid_data', result, 5);
                    }
                }
            }
        } catch (e) {
            console.warn("⚠️ [Public Mode] ดึงข้อมูลสด RID ขัดข้อง:", e);
        }
    }

    // 3. Fallback: ถ้ายังไม่มี ให้ดึงจาก store.waterLogs
    if (!result && typeof store !== 'undefined' && store.waterLogs && store.waterLogs.length > 0) {
        const top = store.waterLogs[0];
        result = {
            success: true,
            source: 'Google Sheet',
            data: {
                level: top[1] || '11.02',
                time: top[0] || 'ล่าสุด',
                trend: top[2] || 'ทรงตัว',
                bankLevel: 14.90,
                diffBank: '3.88'
            }
        };
    }

    return result;
}

/**
 * ฟังก์ชันหลักในการสร้างหน้าจอโหมดประชาชน (Clean Minimal Dashboard)
 */
window.renderPublicPortal = async function () {
    // 1. ดึงข้อมูลระดับน้ำสดเรียลไทม์
    const ridResult = await getPublicRealtimeWaterData();

    // เกณฑ์ระดับน้ำตรงตามหน้า Dashboard หลักและกรมชลประทาน
    const BANK_LEVEL = (ridResult && ridResult.data && parseFloat(ridResult.data.bankLevel)) || 14.90;      // ระดับตลิ่ง (14.90 ม.รทก.)
    const WARNING_LEVEL = 13.50;   // ระดับเฝ้าระวัง (13.50 ม.รทก.)
    const CRITICAL_LEVEL = 14.90;  // ระดับวิกฤต/ล้นตลิ่ง (>14.90 ม.รทก.)

    let latestLevel = 11.02;
    let latestTimeStr = 'ล่าสุด';
    let waterTrend = 'ทรงตัว';
    let dataSourceBadge = 'ข้อมูลสำรองในระบบ';
    let diffBankText = '';

    if (ridResult && ridResult.success && ridResult.data) {
        latestLevel = parseFloat(ridResult.data.level) || 11.02;
        latestTimeStr = ridResult.data.time || 'ล่าสุด';

        // คำนวณแนวโน้ม
        if (ridResult.data.previousLevel) {
            const diff = latestLevel - parseFloat(ridResult.data.previousLevel);
            if (diff > 0) waterTrend = `เพิ่มขึ้น (+${diff.toFixed(2)} ม.)`;
            else if (diff < 0) waterTrend = `ลดลง (${diff.toFixed(2)} ม.)`;
            else waterTrend = 'ทรงตัว';
        } else if (ridResult.data.trend) {
            waterTrend = ridResult.data.trend;
        }

        // ป้ายแหล่งที่มา
        if (ridResult.source === 'API') {
            dataSourceBadge = 'API เรียลไทม์ (กรมชลประทาน X.73)';
        } else if (ridResult.isStaleFallback) {
            dataSourceBadge = 'แคชสำรองล่าสุด';
        } else {
            dataSourceBadge = 'ฐานข้อมูลกลางเทศบาล';
        }

        // คำนวณระยะห่างจากตลิ่ง
        const diffBank = BANK_LEVEL - latestLevel;
        if (diffBank > 0) {
            diffBankText = `ต่ำกว่าตลิ่ง ${diffBank.toFixed(2)} ม.`;
        } else if (diffBank < 0) {
            diffBankText = `ล้นตลิ่งแล้ว ${Math.abs(diffBank).toFixed(2)} ม.`;
        } else {
            diffBankText = `เสมอตลิ่งพอดี (14.90 ม.)`;
        }
    }

    // ประเมินสถานะระดับน้ำตามเกณฑ์ Dashboard หลัก (เขียว <= 13.50 / ส้ม 13.51 - 14.90 / แดง > 14.90)
    let statusTheme = {
        title: 'ระดับน้ำปกติ',
        sub: diffBankText ? `${diffBankText} (การสัญจรและระดับน้ำในลำคลองปกติ)` : 'ระดับน้ำต่ำกว่าระดับตลิ่ง การสัญจรปกติ',
        badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotColor: 'bg-emerald-500',
        cardBorder: 'border-emerald-100',
        waterColor: 'text-emerald-600',
        progressWidth: Math.min(Math.max(((latestLevel - 8) / (16 - 8)) * 100, 10), 100),
        barColor: 'bg-emerald-500'
    };

    if (latestLevel > CRITICAL_LEVEL) {
        statusTheme = {
            title: 'ระดับน้ำวิกฤต (ล้นตลิ่ง)',
            sub: diffBankText ? `${diffBankText} (น้ำล้นตลิ่งเข้าท่วมพื้นที่ลุ่มต่ำ เตรียมพร้อมอพยพทันที)` : 'น้ำล้นตลิ่งเข้าท่วมพื้นที่ลุ่มต่ำ เตรียมพร้อมอพยพทันที',
            badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
            dotColor: 'bg-rose-500',
            cardBorder: 'border-rose-200',
            waterColor: 'text-rose-600',
            progressWidth: 100,
            barColor: 'bg-rose-500 animate-pulse'
        };
    } else if (latestLevel > WARNING_LEVEL) {
        statusTheme = {
            title: 'เฝ้าระวังระดับน้ำ (เตือนภัย)',
            sub: diffBankText ? `${diffBankText} (ระดับน้ำเข้าใกล้ระดับตลิ่ง ยกของขึ้นที่สูงและติดตามข่าวใกล้ชิด)` : 'ระดับน้ำใกล้ตลิ่ง ยกของขึ้นที่สูงและติดตามข่าวใกล้ชิด',
            badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
            dotColor: 'bg-amber-500',
            cardBorder: 'border-amber-200',
            waterColor: 'text-amber-600',
            progressWidth: Math.min(((latestLevel - 8) / (16 - 8)) * 100, 95),
            barColor: 'bg-amber-500'
        };
    }

    // 2. เคลียร์และสร้าง Container โหมดประชาชนแบบ Clean Minimal
    let container = document.getElementById('publicPortalContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'publicPortalContainer';
        container.className = "w-full max-w-4xl mx-auto px-4 py-6 md:py-10 space-y-6 animate-fade-in";
        document.body.appendChild(container);
    }

    const currentDateStr = new Date().toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    container.innerHTML = `
        <!-- 1. Header: สัญลักษณ์เทศบาล & หัวข้อระบบ -->
        <header class="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-4 text-center md:text-left">
                <img src="assets/logo.png" class="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-sm shrink-0" alt="ตราเทศบาลตำบลตันหยงมัส">
                <div>
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${statusTheme.badgeBg} mb-1">
                        <span class="w-2 h-2 rounded-full ${statusTheme.dotColor} animate-ping"></span>
                        <span>${statusTheme.title}</span>
                    </span>
                    <h1 class="text-xl md:text-2xl font-black text-slate-800 tracking-tight">รายงานสถานการณ์อุทกภัย</h1>
                    <p class="text-xs text-slate-400 font-medium">เทศบาลตำบลตันหยงมัส อ.ระแงะ จ.นราธิวาส • ${currentDateStr}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="openCitizenWaterReportModal()" class="px-3.5 py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-sky-500/20 active:scale-95">
                    <i class="fas fa-droplet text-xs animate-bounce"></i>
                    <span>รายงานระดับน้ำ</span>
                </button>
                <button onclick="location.reload()" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95">
                    <i class="fas fa-rotate"></i>
                    <span>รีเฟรช</span>
                </button>
            </div>
        </header>

        <!-- 2. ส่วนกล่องการทำงานหลัก: แยกเป็น 2 กล่อง (แจ้งขอความช่วยเหลือ vs รายงานระดับน้ำ) โทนสีอ่อน สวยงามเป็นระเบียบ -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
            
            <!-- กล่องที่ 1: แจ้งสถานะ / ขอความช่วยเหลือ (โทนสีส้ม-กุหลาบอ่อน สบายตา) -->
            <div class="bg-gradient-to-br from-rose-50/90 via-amber-50/30 to-white rounded-[2.5rem] p-6 md:p-7 border-2 border-rose-200/70 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
                <div class="absolute -right-6 -bottom-6 w-32 h-32 bg-rose-200/20 rounded-full blur-2xl pointer-events-none"></div>
                <div>
                    <div class="flex items-center justify-between gap-2 mb-4">
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-rose-100/90 text-rose-700 border border-rose-200/80 shadow-xs">
                            <i class="fas fa-hand-holding-heart text-rose-500"></i>
                            <span>ศูนย์ช่วยเหลือฉุกเฉิน 24 ชม.</span>
                        </span>
                        <span class="text-[10px] text-rose-500 font-extrabold uppercase tracking-wider bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100">Hotline & Relief</span>
                    </div>

                    <div class="flex items-start gap-3.5 mb-3">
                        <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 via-rose-600 to-amber-500 text-white flex items-center justify-center text-xl shadow-md shadow-rose-500/20 shrink-0 group-hover:scale-105 transition-transform">
                            <i class="fas fa-bullhorn text-amber-100"></i>
                        </div>
                        <div>
                            <h2 class="text-lg md:text-xl font-black text-slate-800 tracking-tight">แจ้งสถานะ / ขอความช่วยเหลือ</h2>
                            <p class="text-[11px] text-slate-500 font-medium mt-0.5">ส่งข้อมูลตรงถึงศูนย์ปฏิบัติการเทศบาลตำบลตันหยงมัส</p>
                        </div>
                    </div>

                    <p class="text-xs text-slate-600 leading-relaxed bg-white/80 p-3.5 rounded-2xl border border-rose-100 shadow-xs mb-3">
                        สำหรับประชาชนในพื้นที่แจ้งสถานะ <b>"ปลอดภัย"</b> หรือ <b>"ขอรับถุงยังชีพ / เรือรับส่ง / อพยพด่วน"</b> พร้อมพิกัด GPS เพื่อให้เจ้าหน้าที่เข้าช่วยเหลือได้ตรงจุด
                    </p>

                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        <span class="px-2.5 py-1 rounded-xl bg-white border border-rose-100 text-rose-700 text-[10px] font-bold shadow-xs flex items-center gap-1.5">
                            <i class="fas fa-location-crosshairs text-rose-500"></i> ระบุพิกัด GPS อัตโนมัติ
                        </span>
                        <span class="px-2.5 py-1 rounded-xl bg-white border border-rose-100 text-rose-700 text-[10px] font-bold shadow-xs flex items-center gap-1.5">
                            <i class="fas fa-truck-medical text-rose-500"></i> ประสานกู้ชีพ & ปภ. ทันที
                        </span>
                    </div>
                </div>

                <button onclick="promptSafetyCheck()" 
                    class="w-full mt-4 py-3.5 px-5 bg-gradient-to-r from-rose-500 via-rose-600 to-amber-600 hover:from-rose-600 hover:to-amber-700 text-white font-black text-sm rounded-2xl shadow-md shadow-rose-500/25 active:scale-98 transition-all flex items-center justify-center gap-2.5">
                    <i class="fas fa-paper-plane text-amber-200 text-sm"></i>
                    <span>กดแจ้งสถานะ / ขอความช่วยเหลือ</span>
                </button>
            </div>

            <!-- กล่องที่ 2: รายงานระดับน้ำในพื้นที่ (โทนสีฟ้าอ่อน นุ่มนวล สบายตา) -->
            <div class="bg-gradient-to-br from-sky-50/90 via-blue-50/30 to-white rounded-[2.5rem] p-6 md:p-7 border-2 border-sky-200/70 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
                <div class="absolute -right-6 -bottom-6 w-32 h-32 bg-sky-200/20 rounded-full blur-2xl pointer-events-none"></div>
                <div>
                    <div class="flex items-center justify-between gap-2 mb-4">
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-sky-100/90 text-sky-700 border border-sky-200/80 shadow-xs">
                            <i class="fas fa-water text-sky-500"></i>
                            <span>ระบบแจ้งเตือนระดับน้ำภาคประชาชน</span>
                        </span>
                        <span class="text-[10px] text-sky-500 font-extrabold uppercase tracking-wider bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-100">Crowdsourced</span>
                    </div>

                    <div class="flex items-start gap-3.5 mb-3">
                        <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 via-sky-600 to-blue-600 text-white flex items-center justify-center text-xl shadow-md shadow-sky-500/20 shrink-0 group-hover:scale-105 transition-transform">
                            <i class="fas fa-droplet text-sky-100 animate-pulse"></i>
                        </div>
                        <div>
                            <h2 class="text-lg md:text-xl font-black text-slate-800 tracking-tight">รายงานระดับน้ำในพื้นที่</h2>
                            <p class="text-[11px] text-slate-500 font-medium mt-0.5">ร่วมแชร์สภาพน้ำท่วมในจุดที่คุณอยู่ขึ้นแผนที่รวม</p>
                        </div>
                    </div>

                    <p class="text-xs text-slate-600 leading-relaxed bg-white/80 p-3.5 rounded-2xl border border-sky-100 shadow-xs mb-3">
                        ช่วยกันรายงานระดับน้ำ <b>(แห้ง / ข้อเท้า / หัวเข่า / เอว / อก / มิดหัว)</b> และแนวโน้มน้ำ เพื่อแจ้งเตือนเพื่อนบ้านในชุมชนและแสดงหมุดบนแผนที่ทันที
                    </p>

                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        <span class="px-2.5 py-1 rounded-xl bg-white border border-sky-100 text-sky-700 text-[10px] font-bold shadow-xs flex items-center gap-1.5">
                            <i class="fas fa-map-pin text-sky-500"></i> จิ้มเลือกจุดบนแผนที่ได้
                        </span>
                        <span class="px-2.5 py-1 rounded-xl bg-white border border-sky-100 text-sky-700 text-[10px] font-bold shadow-xs flex items-center gap-1.5">
                            <i class="fas fa-ruler-vertical text-sky-500"></i> เลือกความลึก 6 ระดับง่าย ๆ
                        </span>
                    </div>
                </div>

                <button onclick="openCitizenWaterReportModal()" 
                    class="w-full mt-4 py-3.5 px-5 bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-black text-sm rounded-2xl shadow-md shadow-sky-500/25 active:scale-98 transition-all flex items-center justify-center gap-2.5">
                    <i class="fas fa-plus-circle text-sky-200 text-sm"></i>
                    <span>ร่วมรายงานระดับน้ำในพื้นที่</span>
                </button>
            </div>

        </div>

        <!-- 3. Grid ข้อมูลระดับน้ำ & สายด่วนแจ้งเหตุ -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <!-- กล่องการ์ด: ระดับน้ำเรียลไทม์ (สะพานตันหยงมัส X.73) -->
            <div class="bg-white rounded-[2.5rem] p-6 shadow-sm border ${statusTheme.cardBorder} flex flex-col justify-between">
                <div>
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3">
                            <div class="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg">
                                <i class="fas fa-water"></i>
                            </div>
                            <div>
                                <h3 class="font-bold text-slate-800 text-base">ระดับน้ำสะพานตันหยงมัส</h3>
                                <p class="text-[11px] text-slate-400">สถานีโทรมาตร X.73 • อัปเดต ${latestTimeStr}</p>
                            </div>
                        </div>
                        <span class="px-2.5 py-1 rounded-xl text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-100 flex items-center gap-1">
                            <i class="fas fa-satellite-dish"></i>
                            <span>${dataSourceBadge}</span>
                        </span>
                    </div>

                    <div class="bg-slate-50 rounded-2xl p-4 mb-4 flex items-baseline justify-between border border-slate-100">
                        <div>
                            <span class="text-xs text-slate-400 font-bold block mb-1">ระดับน้ำตรวจวัดจริง</span>
                            <div class="flex items-baseline gap-2">
                                <span class="text-4xl md:text-5xl font-black ${statusTheme.waterColor} tracking-tight">${latestLevel.toFixed(2)}</span>
                                <span class="text-sm font-bold text-slate-500">ม. (รทก.)</span>
                            </div>
                            <span class="text-[10px] font-bold text-slate-500 mt-1 block">
                                แนวโน้ม: <span class="text-blue-600 font-extrabold">${waterTrend}</span>
                            </span>
                        </div>
                        <div class="text-right text-xs space-y-1">
                            <div class="bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm">
                                <span class="text-slate-400 text-[10px] block font-bold">ระดับตลิ่ง</span>
                                <span class="text-amber-600 font-black">${BANK_LEVEL.toFixed(2)} ม.</span>
                            </div>
                            <div class="bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm">
                                <span class="text-slate-400 text-[10px] block font-bold">ระดับวิกฤต</span>
                                <span class="text-rose-600 font-black">&gt; ${CRITICAL_LEVEL.toFixed(2)} ม.</span>
                            </div>
                        </div>
                    </div>

                    <!-- Progress Bar ระดับน้ำ -->
                    <div class="space-y-1.5 mb-3">
                        <div class="flex justify-between text-[10px] text-slate-400 font-bold">
                            <span>ปกติ (&lt; ${WARNING_LEVEL.toFixed(2)})</span>
                            <span class="text-amber-500">เฝ้าระวัง (${WARNING_LEVEL.toFixed(2)} - ${BANK_LEVEL.toFixed(2)})</span>
                            <span class="text-rose-500 font-bold">วิกฤต (&gt; ${CRITICAL_LEVEL.toFixed(2)})</span>
                        </div>
                        <div class="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                            <div class="h-full rounded-full transition-all duration-700 ${statusTheme.barColor}" style="width: ${statusTheme.progressWidth}%"></div>
                        </div>
                    </div>
                </div>

                <p class="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <i class="fas fa-info-circle text-blue-500 mr-1.5"></i>
                    ${statusTheme.sub}
                </p>

                <button onclick="openCitizenWaterReportModal()" class="w-full mt-3 py-2.5 rounded-2xl bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold text-xs border border-sky-200 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm">
                    <i class="fas fa-droplet text-sky-500"></i>
                    <span>ร่วมรายงานระดับน้ำในจุดของคุณ (Crowdsource)</span>
                </button>
            </div>

            <!-- กล่องการ์ด: สายด่วนฉุกเฉิน 24 ชั่วโมง (พร้อมเบอร์โทรทางการ) -->
            <div class="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
                <div>
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-lg">
                            <i class="fas fa-phone-volume"></i>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800 text-base">สายด่วนช่วยเหลือฉุกเฉิน 24 ชั่วโมง</h3>
                            <p class="text-[11px] text-slate-400">กดปุ่มโทรออกได้ทันทีเมื่อเกิดเหตุการณ์ฉุกเฉิน</p>
                        </div>
                    </div>

                    <div class="space-y-2.5">
                        <!-- 1. งานป้องกันและบรรเทาสาธารณภัย (ปภ.) ทต.ตันหยงมัส -->
                        <a href="tel:073671886" class="p-3.5 bg-rose-50/70 hover:bg-rose-100/90 border border-rose-100 rounded-2xl flex items-center justify-between transition-all group active:scale-98">
                            <div class="flex items-center gap-3 min-w-0 pr-2">
                                <div class="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center text-sm shadow-sm shrink-0">
                                    <i class="fas fa-fire-extinguisher"></i>
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-xs font-bold text-slate-800 truncate">งานป้องกันและบรรเทาสาธารณภัย (ปภ.)</h4>
                                    <p class="text-[10px] text-slate-500 truncate">ทต.ตันหยงมัส (เหตุน้ำท่วม/ขอเรือ/กระสอบทราย)</p>
                                </div>
                            </div>
                            <span class="text-xs font-black text-rose-600 bg-white px-3 py-1.5 rounded-xl shadow-sm border border-rose-100 group-hover:scale-105 transition-transform shrink-0 flex items-center gap-1.5">
                                <i class="fas fa-phone-alt text-[10px]"></i> 073-671886
                            </span>
                        </a>

                        <!-- 2. สถานีตำรวจภูธรระแงะ -->
                        <a href="tel:073671967" class="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl flex items-center justify-between transition-all group active:scale-98">
                            <div class="flex items-center gap-3 min-w-0 pr-2">
                                <div class="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center text-xs shadow-sm shrink-0">
                                    <i class="fas fa-building-shield"></i>
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-xs font-bold text-slate-800 truncate">สถานีตำรวจภูธรระแงะ</h4>
                                    <p class="text-[10px] text-slate-400 truncate">แจ้งเหตุด่วนเหตุร้าย ความปลอดภัยและทรัพย์สิน</p>
                                </div>
                            </div>
                            <span class="text-xs font-black text-blue-600 bg-white px-3 py-1.5 rounded-xl shadow-sm border border-slate-200 group-hover:scale-105 transition-transform shrink-0 flex items-center gap-1.5">
                                <i class="fas fa-phone-alt text-[10px]"></i> 073-671967 (191)
                            </span>
                        </a>

                        <!-- 3. หน่วยแพทย์กู้ชีพ - ฉุกเฉิน -->
                        <a href="tel:1669" class="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl flex items-center justify-between transition-all group active:scale-98">
                            <div class="flex items-center gap-3 min-w-0 pr-2">
                                <div class="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-xs shadow-sm shrink-0">
                                    <i class="fas fa-ambulance"></i>
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-xs font-bold text-slate-800 truncate">หน่วยแพทย์กู้ชีพ - ฉุกเฉิน</h4>
                                    <p class="text-[10px] text-slate-400 truncate">ผู้ป่วยติดเตียง / ผู้บาดเจ็บ / หญิงมีครรภ์</p>
                                </div>
                            </div>
                            <span class="text-xs font-black text-emerald-600 bg-white px-3 py-1.5 rounded-xl shadow-sm border border-slate-200 group-hover:scale-105 transition-transform shrink-0 flex items-center gap-1.5">
                                <i class="fas fa-phone-alt text-[10px]"></i> 1669
                            </span>
                        </a>

                        <!-- 4. สายด่วนนิรภัย ปภ. กระทรวงมหาดไทย -->
                        <a href="tel:1784" class="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl flex items-center justify-between transition-all group active:scale-98">
                            <div class="flex items-center gap-3 min-w-0 pr-2">
                                <div class="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xs shadow-sm shrink-0">
                                    <i class="fas fa-shield-alt"></i>
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-xs font-bold text-slate-800 truncate">สายด่วนนิรภัย (ปภ. มหาดไทย)</h4>
                                    <p class="text-[10px] text-slate-400 truncate">แจ้งเตือนและประสานงานสาธารณภัยทั่วประเทศ</p>
                                </div>
                            </div>
                            <span class="text-xs font-black text-amber-600 bg-white px-3 py-1.5 rounded-xl shadow-sm border border-slate-200 group-hover:scale-105 transition-transform shrink-0 flex items-center gap-1.5">
                                <i class="fas fa-phone-alt text-[10px]"></i> 1784
                            </span>
                        </a>
                    </div>
                </div>
            </div>
        </div>

        <!-- 3.5. กล่องรายงานเส้นทางปิด / ไม่สามารถสัญจรได้ (Road Closures Alert) -->
        <section class="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100 space-y-4">
            <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="flex items-center gap-3">
                    <div class="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg">
                        <i class="fas fa-road-barrier"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-800 text-base">เส้นทางปิด / ไม่สามารถสัญจรได้</h3>
                        <p class="text-[11px] text-slate-400">อัปเดตสภาพถนนและเส้นทางน้ำท่วมขังในเขตเทศบาลตำบลตันหยงมัส</p>
                    </div>
                </div>
                ${(typeof store !== 'undefined' && store.roadClosures && store.roadClosures.length > 0) ? `
                    <span class="px-3 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        ปิดสัญจร ${store.roadClosures.length} เส้นทาง
                    </span>
                ` : `
                    <span class="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        สัญจรได้ปกติทุกเส้นทาง
                    </span>
                `}
            </div>

            ${(typeof store !== 'undefined' && store.roadClosures && store.roadClosures.length > 0) ? `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${store.roadClosures.map((rc, idx) => {
                        const isFullyClosed = (rc.status || '').includes('ทุกชนิด') || (rc.status || '').includes('ปิดการจราจร');
                        const statusBadgeClass = isFullyClosed ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-amber-100 text-amber-700 border-amber-200';
                        const lat = parseFloat(rc.lat) || 0;
                        const lng = parseFloat(rc.lng) || 0;
                        const hasCoords = lat !== 0 && lng !== 0;

                        return `
                            <div class="bg-slate-50/80 border border-slate-100 rounded-2xl p-4 flex flex-col justify-between hover:bg-slate-100/80 transition-colors">
                                <div>
                                    <div class="flex items-start justify-between gap-2 mb-2">
                                        <h4 class="font-bold text-slate-800 text-sm leading-snug">${rc.title}</h4>
                                        <span class="text-[9px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeClass} shrink-0 whitespace-nowrap">
                                            ${rc.status || 'ปิดสัญจร'}
                                        </span>
                                    </div>

                                    ${rc.image ? `
                                        <div class="my-2 rounded-xl overflow-hidden border border-slate-200/80 relative cursor-pointer group" onclick="typeof zoomImageModal === 'function' ? zoomImageModal('${rc.image}', '${rc.title}') : Swal.fire({ imageUrl: '${rc.image}', confirmButtonColor: '#64748b', confirmButtonText: 'ปิด' })">
                                            <img src="${rc.image}" class="w-full h-32 object-cover group-hover:scale-105 transition duration-300" alt="${rc.title}">
                                            <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-bold gap-1">
                                                <i class="fas fa-search-plus"></i> แตะดูรูปใหญ่
                                            </div>
                                        </div>
                                    ` : ''}

                                    ${rc.detail ? `<p class="text-xs text-slate-600 mb-2 leading-relaxed bg-white/70 p-2 rounded-xl border border-slate-100">${rc.detail}</p>` : ''}

                                    <div class="space-y-1.5 text-xs mb-3">
                                        ${rc.waterDepth ? `
                                            <div class="flex items-center gap-1.5 text-rose-600 font-bold text-[11px]">
                                                <i class="fas fa-water text-xs"></i>
                                                <span>ระดับน้ำบนผิวทาง: ${rc.waterDepth}</span>
                                            </div>
                                        ` : ''}
                                        ${rc.detour ? `
                                            <div class="flex items-start gap-1.5 text-emerald-700 bg-emerald-50 p-2 rounded-xl border border-emerald-100 text-[11px]">
                                                <i class="fas fa-route text-xs mt-0.5 shrink-0"></i>
                                                <span><b>เส้นทางเลี่ยง:</b> ${rc.detour}</span>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>

                                <div class="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs mt-2">
                                    <span class="text-[10px] text-slate-400">
                                        <i class="far fa-clock mr-1"></i>${rc.createdAt ? new Date(rc.createdAt).toLocaleDateString('th-TH') : 'ล่าสุด'}
                                    </span>
                                    ${hasCoords ? `
                                        <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank"
                                            class="py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-amber-700 rounded-xl font-bold text-[11px] shadow-sm transition-all flex items-center gap-1.5 active:scale-95">
                                            <i class="fas fa-location-arrow text-amber-600"></i>
                                            <span>นำทาง Google Maps</span>
                                        </a>
                                    ` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : `
                <div class="p-6 text-center bg-emerald-50/50 rounded-2xl border border-emerald-100">
                    <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg mx-auto mb-2">
                        <i class="fas fa-check"></i>
                    </div>
                    <p class="text-xs font-bold text-emerald-800">ขณะนี้ไม่มีรายงานเส้นทางปิดสัญจร</p>
                    <p class="text-[11px] text-emerald-600 mt-0.5">ถนนและเส้นทางหลักในเขตเทศบาลตำบลตันหยงมัสสามารถสัญจรได้ตามปกติ</p>
                </div>
            `}
        </section>

        <!-- 4. รายชื่อศูนย์พักพิงชั่วคราว พร้อมพิกัดและความจุ & ปุ่มนำทาง Google Maps -->
        <section class="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100 space-y-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg">
                        <i class="fas fa-campground"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-800 text-base">ศูนย์พักพิงชั่วคราวรองรับผู้ประสบภัย</h3>
                        <p class="text-[11px] text-slate-400">มีอาหาร น้ำดื่ม สุขอนามัย และเจ้าหน้าที่ดูแลตลอด 24 ชั่วโมง</p>
                    </div>
                </div>
                <span class="px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                    3 ศูนย์หลัก
                </span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                ${PUBLIC_SHELTERS_DATA.map((s, idx) => `
                    <div class="bg-slate-50/70 border border-slate-100 rounded-2xl p-5 flex flex-col justify-between hover:bg-slate-100/70 transition-colors">
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <span class="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center">${idx + 1}</span>
                                <span class="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-emerald-100 text-emerald-700">${s.badge}</span>
                            </div>
                            <h4 class="font-bold text-slate-800 text-sm mb-1">${s.name}</h4>
                            <p class="text-xs text-slate-400 mb-3">${s.detail}</p>
                            <p class="text-[11px] text-slate-500 font-bold mb-4">
                                <i class="fas fa-users text-indigo-500 mr-1"></i> รองรับได้: <span class="text-indigo-600 font-black">${s.capacity}</span> คน
                            </p>
                        </div>
                        <a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}" target="_blank"
                            class="w-full py-2.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-indigo-600 rounded-xl font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 active:scale-95">
                            <i class="fas fa-location-arrow text-indigo-500"></i>
                            <span>นำทาง Google Maps</span>
                        </a>
                    </div>
                `).join('')}
            </div>
        </section>

        <!-- 5. แผนที่พิกัดน้ำท่วมและศูนย์พักพิง (Interactive Map) -->
        <section class="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100 space-y-4">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div class="flex items-center gap-3">
                    <div class="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg">
                        <i class="fas fa-map-location-dot"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-800 text-base">แผนที่พิกัดน้ำท่วม & ตำแหน่งศูนย์พักพิง</h3>
                        <p class="text-[11px] text-slate-400">ตรวจสอบจุดที่มีน้ำท่วมขังและที่ตั้งศูนย์พักพิงในเขตเทศบาลตำบลตันหยงมัส</p>
                    </div>
                </div>
                <button onclick="locateCitizenUser()" class="self-start md:self-auto px-4 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95">
                    <i class="fas fa-crosshairs"></i>
                    <span>หาตำแหน่งของฉัน (GPS)</span>
                </button>
            </div>

            <div id="publicMiniMap" class="w-full h-80 md:h-96 rounded-2xl overflow-hidden border border-slate-200 relative z-0"></div>
            
            <div class="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-100">
                <div class="flex items-center gap-1.5">
                    <span class="w-3 h-3 rounded-full bg-indigo-600"></span>
                    <span>ศูนย์พักพิงชั่วคราว</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="w-3 h-3 rounded-full bg-blue-500"></span>
                    <span>สะพานตันหยงมัส (X.73)</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="w-3 h-3 rounded-full bg-rose-500"></span>
                    <span>จุดที่มีรายงานน้ำท่วมขัง</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="w-3 h-3 rounded-full bg-amber-600"></span>
                    <span>เส้นทางปิด / ไม่สามารถสัญจรได้</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="w-3 h-3 rounded-full bg-sky-500"></span>
                    <span>รายงานระดับน้ำ (ประชาชน)</span>
                </div>
            </div>
        </section>

        <!-- 6. Footer ประชาสัมพันธ์ -->
        <footer class="text-center py-6 text-xs text-slate-400 space-y-2">
            <p class="font-medium">ระบบรายงานสถานการณ์อุทกภัย เทศบาลตำบลตันหยงมัส เพื่อประโยชน์สาธารณะ</p>
            <p class="text-[11px] text-slate-300">
                หากท่านเป็นเจ้าหน้าที่ สามารถ <a href="index.html" class="underline hover:text-blue-500 font-bold">เข้าสู่ระบบสำหรับเจ้าหน้าที่</a>
            </p>
        </footer>
    `;

    // 3. เริ่มต้นแผนที่ Mini Map หลังสร้าง DOM เสร็จ
    setTimeout(() => {
        initPublicMiniMap(latestLevel);
    }, 200);
};

/**
 * สร้างและโหลดแผนที่ Leaflet ในโหมดประชาชน พร้อม Popup ดีไซน์สวยงาม
 */
function initPublicMiniMap(currentWaterLevel = 14.20) {
    const mapEl = document.getElementById('publicMiniMap');
    if (!mapEl) return;

    if (publicMiniMapInstance) {
        publicMiniMapInstance.invalidateSize();
        return;
    }

    try {
        // จุดศูนย์กลางแผนที่เทศบาลตำบลตันหยงมัส
        publicMiniMapInstance = L.map('publicMiniMap', {
            zoomControl: true,
            attributionControl: false
        }).setView([6.2960, 101.7240], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18
        }).addTo(publicMiniMapInstance);

        // 🏛️ ตีกรอบขอบเขตเทศบาลและทำพื้นที่นอกเขตเป็นสีเทา (Inverted Mask)
        if (typeof window.addMunicipalityMaskToMap === 'function') {
            window.addMunicipalityMaskToMap(publicMiniMapInstance, {
                fillColor: '#0f172a',
                fillOpacity: 0.45,
                borderColor: '#334155',
                outlineColor: '#2563eb'
            });
        }

        // 1. หมุดสะพานตันหยงมัส (X.73) - พิกัด: 6.297816981850148, 101.73172224850232
        const bridgeIcon = L.divIcon({
            className: 'bridge-pin',
            html: `<div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center shadow-lg border-2 border-white animate-bounce"><i class="fas fa-water text-base"></i></div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        const curLevelNum = parseFloat(currentWaterLevel) || 11.02;
        const bridgeStatusColor = curLevelNum > 14.90 ? 'text-rose-600' : (curLevelNum > 13.50 ? 'text-amber-600' : 'text-blue-600');
        const bridgeStatusText = curLevelNum > 14.90 ? 'ระดับวิกฤต (ล้นตลิ่ง)' : (curLevelNum > 13.50 ? 'เฝ้าระวังระดับน้ำ' : 'ระดับน้ำปกติ');
        const bridgeBadgeBg = curLevelNum > 14.90 ? 'bg-rose-100 text-rose-700' : (curLevelNum > 13.50 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700');

        const bridgePopupHtml = `
            <div class="font-prompt p-2 text-slate-700 min-w-[240px]">
                <div class="flex items-center gap-2.5 mb-2.5 pb-2 border-b border-slate-100">
                    <div class="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm shrink-0 border border-blue-100">
                        <i class="fas fa-water"></i>
                    </div>
                    <div>
                        <h4 class="font-black text-slate-800 text-sm leading-tight">${PUBLIC_WATER_STATION.name}</h4>
                        <span class="text-[9px] ${bridgeBadgeBg} font-bold px-2 py-0.5 rounded-full inline-block mt-0.5">${bridgeStatusText}</span>
                    </div>
                </div>

                <div class="bg-gradient-to-br from-blue-50/60 to-slate-50 p-2.5 rounded-2xl border border-blue-100/70 mb-3 space-y-2">
                    <div class="flex items-baseline justify-between">
                        <span class="text-[10px] text-slate-400 font-bold">ระดับน้ำปัจจุบัน</span>
                        <div class="flex items-baseline gap-1">
                            <span class="text-2xl font-black ${bridgeStatusColor}">${curLevelNum.toFixed(2)}</span>
                            <span class="text-[10px] text-slate-500 font-bold">ม.รทก.</span>
                        </div>
                    </div>
                    <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1.5 border-t border-slate-200/60">
                        <span class="font-medium">ตลิ่ง: <strong class="text-amber-600 font-bold">14.90 ม.</strong></span>
                        <span class="font-medium">วิกฤต: <strong class="text-rose-600 font-bold">&gt; 14.90 ม.</strong></span>
                    </div>
                </div>

                <a href="https://www.google.com/maps/dir/?api=1&destination=${PUBLIC_WATER_STATION.lat},${PUBLIC_WATER_STATION.lng}" target="_blank"
                    class="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-300 text-blue-600 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 active:scale-95">
                    <i class="fas fa-location-arrow text-[10px] text-blue-500"></i>
                    <span>นำทางไปสะพานตันหยงมัส</span>
                </a>
            </div>
        `;

        L.marker([PUBLIC_WATER_STATION.lat, PUBLIC_WATER_STATION.lng], { icon: bridgeIcon })
            .bindPopup(bridgePopupHtml, { maxWidth: 280, className: 'clean-popup' })
            .addTo(publicMiniMapInstance);

        // 2. หมุดศูนย์พักพิง 3 แห่ง (พร้อมพิกัดใหม่และ Popup สวยงาม)
        PUBLIC_SHELTERS_DATA.forEach(s => {
            const shelterIcon = L.divIcon({
                className: 'shelter-pin',
                html: `<div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-lg border-2 border-white"><i class="fas fa-campground text-base"></i></div>`,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });

            const shelterPopupHtml = `
                <div class="font-prompt p-2 text-slate-700 min-w-[240px]">
                    <div class="flex items-center gap-2.5 mb-2.5 pb-2 border-b border-slate-100">
                        <div class="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm shrink-0 border border-indigo-100">
                            <i class="fas fa-campground"></i>
                        </div>
                        <div>
                            <h4 class="font-black text-slate-800 text-sm leading-tight">${s.name}</h4>
                            <span class="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full inline-block mt-0.5">${s.badge}</span>
                        </div>
                    </div>

                    <div class="space-y-2 mb-3 text-xs">
                        <p class="text-slate-500 text-[11px] leading-relaxed flex items-start gap-1">
                            <i class="fas fa-map-pin text-slate-400 mt-0.5 shrink-0"></i>
                            <span>${s.detail}</span>
                        </p>
                        <div class="bg-indigo-50/60 p-2.5 rounded-xl flex items-center justify-between border border-indigo-100/60">
                            <span class="text-indigo-600 text-[10px] font-bold flex items-center gap-1">
                                <i class="fas fa-users"></i> ความจุรองรับ:
                            </span>
                            <span class="font-black text-indigo-700 text-sm">${s.capacity} คน</span>
                        </div>
                    </div>

                    <a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}" target="_blank"
                        class="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-300 text-indigo-600 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 active:scale-95">
                        <i class="fas fa-location-arrow text-[10px] text-indigo-500"></i>
                        <span>นำทาง Google Maps</span>
                    </a>
                </div>
            `;

            L.marker([s.lat, s.lng], { icon: shelterIcon })
                .bindPopup(shelterPopupHtml, { maxWidth: 280, className: 'clean-popup' })
                .addTo(publicMiniMapInstance);
        });

        // 3. หมุดจุดน้ำท่วมขัง (ถ้ามีข้อมูลใน store.floodData)
        if (typeof store !== 'undefined' && store.floodData && Array.isArray(store.floodData)) {
            store.floodData.forEach(r => {
                const isFlooded = r[4] === 'ท่วมขัง' || r[4] === 'น้ำท่วมขัง';
                if (!isFlooded) return;

                const coords = r[5] ? String(r[5]).split(',') : null;
                if (coords && coords.length === 2) {
                    const lat = parseFloat(coords[0]);
                    const lng = parseFloat(coords[1]);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        const floodIcon = L.divIcon({
                            className: 'flood-pin',
                            html: `<div class="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg border-2 border-white text-xs"><i class="fas fa-exclamation"></i></div>`,
                            iconSize: [32, 32],
                            iconAnchor: [16, 16]
                        });

                        const floodPopupHtml = `
                            <div class="font-prompt p-1 text-slate-700 min-w-[200px]">
                                <div class="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                                    <div class="w-6 h-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xs shrink-0">
                                        <i class="fas fa-water"></i>
                                    </div>
                                    <h4 class="font-bold text-slate-800 text-sm leading-tight">${r[2] || r[1] || 'จุดน้ำท่วมขัง'}</h4>
                                </div>
                                <div class="bg-rose-50 p-2 rounded-xl border border-rose-100 text-xs mb-2">
                                    <span class="text-rose-700 font-bold block">ระดับน้ำ: ${r[3] || 'ไม่ระบุ'} ซม.</span>
                                    <span class="text-rose-500 text-[10px]">สถานะ: ${r[4] || 'ท่วมขัง'}</span>
                                </div>
                                <p class="text-[10px] text-slate-400"><i class="fas fa-clock mr-1"></i>${r[0] ? new Date(r[0]).toLocaleDateString('th-TH') : '-'}</p>
                            </div>
                        `;

                        L.marker([lat, lng], { icon: floodIcon })
                            .bindPopup(floodPopupHtml, { maxWidth: 260, className: 'clean-popup' })
                            .addTo(publicMiniMapInstance);
                    }
                }
            });
        }

        // 4. หมุดเส้นทางปิด / ไม่สามารถสัญจรได้ (Road Closures Alert Pins)
        if (typeof store !== 'undefined' && store.roadClosures && Array.isArray(store.roadClosures)) {
            store.roadClosures.forEach(rc => {
                const lat = parseFloat(rc.lat);
                const lng = parseFloat(rc.lng);
                if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return;

                const isFullyClosed = (rc.status || '').includes('ทุกชนิด') || (rc.status || '').includes('ปิดการจราจร');
                const badgeColor = isFullyClosed ? 'bg-rose-600' : 'bg-amber-600';
                const badgeText = rc.status || 'ปิดสัญจร';

                const roadIcon = L.divIcon({
                    className: 'road-pin',
                    html: `<div class="w-10 h-10 rounded-2xl ${badgeColor} text-white flex items-center justify-center shadow-lg border-2 border-white animate-bounce"><i class="fas fa-road-barrier text-base"></i></div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });

                let imgHtml = '';
                if (rc.image) {
                    imgHtml = `
                        <div class="my-2 rounded-xl overflow-hidden border border-slate-200 cursor-pointer" onclick="typeof zoomImageModal === 'function' ? zoomImageModal('${rc.image}', '${rc.title}') : Swal.fire({ imageUrl: '${rc.image}', confirmButtonColor: '#64748b', confirmButtonText: 'ปิด' })">
                            <img src="${rc.image}" class="w-full h-28 object-cover" title="คลิกเพื่อดูรูปใหญ่">
                        </div>
                    `;
                }

                const roadPopupHtml = `
                    <div class="font-prompt p-2 text-slate-700 min-w-[240px] max-w-[280px]">
                        <div class="flex items-center gap-2.5 mb-2 pb-2 border-b border-slate-100">
                            <div class="w-8 h-8 rounded-xl ${isFullyClosed ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'} flex items-center justify-center text-sm shrink-0 border border-amber-100">
                                <i class="fas fa-road-barrier"></i>
                            </div>
                            <div>
                                <h4 class="font-black text-slate-800 text-sm leading-tight">${rc.title}</h4>
                                <span class="text-[9px] ${isFullyClosed ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'} font-bold px-2 py-0.5 rounded-full inline-block mt-0.5">${badgeText}</span>
                            </div>
                        </div>

                        ${rc.detail ? `<p class="text-xs text-slate-600 mb-2 leading-relaxed bg-slate-50 p-2 rounded-xl">${rc.detail}</p>` : ''}
                        ${rc.waterDepth ? `<p class="text-[11px] text-rose-600 font-bold mb-1"><i class="fas fa-water mr-1"></i>ระดับน้ำบนผิวทาง: ${rc.waterDepth}</p>` : ''}
                        ${rc.detour ? `<p class="text-[11px] text-emerald-700 bg-emerald-50 p-1.5 rounded-lg border border-emerald-100 font-medium mb-1"><i class="fas fa-route mr-1"></i>เส้นทางเลี่ยง: ${rc.detour}</p>` : ''}
                        ${imgHtml}

                        <!-- ปุ่มนำทางสีขาว ตามคำสั่งผู้ใช้ -->
                        <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank"
                            class="w-full mt-2 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-amber-300 text-amber-700 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 active:scale-95">
                            <i class="fas fa-location-arrow text-[10px] text-amber-600"></i>
                            <span>นำทาง Google Maps</span>
                        </a>
                    </div>
                `;

                L.marker([lat, lng], { icon: roadIcon })
                    .bindPopup(roadPopupHtml, { maxWidth: 280, className: 'clean-popup' })
                    .addTo(publicMiniMapInstance);
            });
        }

        // 5. หมุดรายงานระดับน้ำโดยประชาชน (Citizen Crowdsourced Water Level Reports)
        if (typeof store !== 'undefined' && store.citizenWaterReports && Array.isArray(store.citizenWaterReports)) {
            store.citizenWaterReports.forEach(r => {
                const lat = parseFloat(r.lat);
                const lng = parseFloat(r.lng);
                if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return;

                let pinColor = 'bg-sky-500';
                if ((r.levelCategory || '').includes('มิดหัว') || (r.levelCategory || '').includes('อกขึ้นไป')) {
                    pinColor = 'bg-rose-600';
                } else if ((r.levelCategory || '').includes('เอว-อก') || (r.levelCategory || '').includes('เข่า-เอว')) {
                    pinColor = 'bg-amber-500';
                } else if ((r.levelCategory || '').includes('แห้ง')) {
                    pinColor = 'bg-emerald-500';
                }

                const cIcon = L.divIcon({
                    className: 'cwater-pin',
                    html: `
                        <div class="relative flex flex-col items-center">
                            <div class="${pinColor} text-white w-7 h-7 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[10px] animate-pulse">
                                <i class="fas fa-droplet"></i>
                            </div>
                            <span class="bg-slate-900 text-white text-[8px] font-black px-1.5 py-0.2 rounded-full shadow mt-0.5 whitespace-nowrap border border-white/20">${r.levelCmRange || ''}</span>
                        </div>
                    `,
                    iconSize: [32, 40],
                    iconAnchor: [16, 40]
                });

                const cPopup = `
                    <div class="font-prompt p-2 text-slate-700 min-w-[220px]">
                        <div class="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-slate-100">
                            <span class="w-2.5 h-2.5 rounded-full ${pinColor}"></span>
                            <div>
                                <h4 class="font-bold text-slate-800 text-xs">${r.locationName || 'รายงานระดับน้ำ'}</h4>
                                <span class="text-[9px] text-sky-700 font-bold bg-sky-50 px-1.5 py-0.2 rounded-full inline-block">รายงานโดยประชาชน</span>
                            </div>
                        </div>
                        <p class="text-xs text-slate-700 mb-1">ระดับน้ำ: <b class="text-blue-600">${r.levelCategory}</b></p>
                        <p class="text-[11px] text-slate-600 mb-1">แนวโน้ม: <b>${r.trend || 'ทรงตัว'}</b></p>
                        ${r.note ? `<p class="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded-lg border border-slate-100 my-1">${r.note}</p>` : ''}
                        <div class="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-slate-100">
                            <span><i class="far fa-user mr-1"></i>${r.reporterName || 'ประชาชน'}</span>
                            <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" class="text-blue-600 font-bold hover:underline flex items-center gap-1">
                                <i class="fas fa-location-arrow"></i> นำทาง
                            </a>
                        </div>
                    </div>
                `;

                L.marker([lat, lng], { icon: cIcon }).bindPopup(cPopup, { maxWidth: 260, className: 'clean-popup' }).addTo(publicMiniMapInstance);
            });
        }

        setTimeout(() => {
            if (publicMiniMapInstance) publicMiniMapInstance.invalidateSize();
        }, 400);
    } catch (e) {
        console.warn("⚠️ ไม่สามารถโหลดแผนที่ได้:", e);
    }
}

/**
 * ดึงพิกัด GPS ประชาชนและซูมบนแผนที่
 */
window.locateCitizenUser = function () {
    if (!publicMiniMapInstance) return;
    if (!navigator.geolocation) {
        Swal.fire('ข้อผิดพลาด', 'อุปกรณ์ของท่านไม่รองรับการระบุพิกัด GPS', 'warning');
        return;
    }

    Swal.fire({
        title: 'กำลังค้นหาตำแหน่งของท่าน...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    navigator.geolocation.getCurrentPosition(
        (p) => {
            Swal.close();
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;

            publicMiniMapInstance.setView([lat, lng], 16, { animate: true });

            const myIcon = L.divIcon({
                className: 'my-loc-pin',
                html: `<div class="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xl border-2 border-white animate-pulse"><i class="fas fa-user"></i></div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            L.marker([lat, lng], { icon: myIcon })
                .bindPopup(`<b>ตำแหน่งของคุณในขณะนี้</b><br>พิกัด: ${lat.toFixed(4)}, ${lng.toFixed(4)}`)
                .addTo(publicMiniMapInstance)
                .openPopup();
        },
        (err) => {
            Swal.fire('ค้นหาพิกัดไม่สำเร็จ', 'กรุณาเปิดการใช้งาน GPS บนอุปกรณ์ของท่าน', 'info');
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
};

// ==========================================
// 🌊 ระบบรายงานระดับน้ำโดยประชาชน (Citizen Water Report Modal)
// ==========================================

window._citizenModalMap = null;
window._citizenModalMarker = null;

window.openCitizenWaterReportModal = function () {
    let defaultLat = 6.294450;
    let defaultLng = 101.723620;

    const WATER_LEVEL_OPTIONS = [
        {
            title: 'แห้ง',
            range: '< 10 ซม.',
            desc: 'ผิวทางแห้ง / มีน้ำขังเล็กน้อย',
            color: 'emerald',
            activeClass: 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-400',
            icon: 'fa-sun'
        },
        {
            title: 'ข้อเท้า - เข่า',
            range: '10-50 ซม.',
            desc: 'น้ำท่วมผิวทาง รถเล็กสัญจรลำบาก',
            color: 'sky',
            activeClass: 'border-sky-500 bg-sky-50 text-sky-800 ring-2 ring-sky-400',
            icon: 'fa-shoe-prints'
        },
        {
            title: 'เข่า - เอว',
            range: '50-100 ซม.',
            desc: 'น้ำท่วมสูง รถเล็กห้ามผ่าน',
            color: 'amber',
            activeClass: 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-400',
            icon: 'fa-person-walking'
        },
        {
            title: 'เอว - อก',
            range: '100-130 ซม.',
            desc: 'ระดับน้ำอันตราย เข้าท่วมบ้านเรือน',
            color: 'orange',
            activeClass: 'border-orange-500 bg-orange-50 text-orange-800 ring-2 ring-orange-400',
            icon: 'fa-person-swimming'
        },
        {
            title: 'อกขึ้นไป',
            range: '130-180 ซม.',
            desc: 'วิกฤต น้ำท่วมชั้น 1 ต้องเตรียมอพยพ',
            color: 'rose',
            activeClass: 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-400',
            icon: 'fa-triangle-exclamation'
        },
        {
            title: 'มิดหัว',
            range: '> 180 ซม.',
            desc: 'วิกฤตขั้นสูงสุด มิดหลังคา/ชั้น 1',
            color: 'purple',
            activeClass: 'border-purple-600 bg-purple-50 text-purple-900 ring-2 ring-purple-500',
            icon: 'fa-house-crack'
        }
    ];

    Swal.fire({
        title: `
            <div class="flex items-center justify-center gap-2.5 text-blue-700 font-black text-lg">
                <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-base">
                    <i class="fas fa-droplet"></i>
                </div>
                <span>รายงานระดับน้ำในพื้นที่</span>
            </div>
        `,
        html: `
            <div class="text-left space-y-4 mt-2 font-prompt text-xs">
                <!-- 1. ตำแหน่ง (GPS หรือ แผนที่) -->
                <div>
                    <div class="flex items-center justify-between mb-1.5">
                        <label class="font-black text-slate-800">
                            <i class="fas fa-map-pin text-rose-500 mr-1.5"></i> 1. ตำแหน่งที่เกิดเหตุ / พิกัด *
                        </label>
                        <button type="button" onclick="getCitizenWaterGps()" class="px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[10px] flex items-center gap-1 transition-all active:scale-95 shadow-sm">
                            <i class="fas fa-crosshairs"></i>
                            <span>ใช้พิกัดปัจจุบัน (GPS)</span>
                        </button>
                    </div>

                    <input type="text" id="cwater_loc_name" class="w-full p-2.5 border border-slate-200 rounded-xl outline-none text-xs bg-slate-50 font-bold focus:border-blue-400 mb-2" placeholder="ชื่อถนน / ซอย / ชุมชน / จุดสังเกตใกล้เคียง">

                    <div class="grid grid-cols-2 gap-2 mb-2">
                        <input type="text" id="cwater_lat" value="${defaultLat.toFixed(6)}" class="p-2 border border-slate-200 rounded-xl outline-none text-xs font-mono bg-slate-50 focus:border-blue-400" placeholder="Latitude">
                        <input type="text" id="cwater_lng" value="${defaultLng.toFixed(6)}" class="p-2 border border-slate-200 rounded-xl outline-none text-xs font-mono bg-slate-50 focus:border-blue-400" placeholder="Longitude">
                    </div>

                    <!-- Interactive Map Picker -->
                    <div class="rounded-2xl overflow-hidden border border-slate-200 relative">
                        <div id="swal_cwater_map" class="w-full h-36 bg-slate-100"></div>
                        <div class="absolute bottom-2 left-2 right-2 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[9px] text-slate-600 font-bold border border-slate-200 shadow-sm pointer-events-none flex items-center justify-between">
                            <span>👆 แตะบนแผนที่หรือลากหมุด เพื่อเลือกตำแหน่ง</span>
                            <span class="text-blue-600 font-mono" id="cwater_coords_preview">${defaultLat.toFixed(4)}, ${defaultLng.toFixed(4)}</span>
                        </div>
                    </div>
                </div>

                <!-- 2. ระดับน้ำ (ปุ่มเลือก 6 ระดับ) -->
                <div>
                    <label class="font-black text-slate-800 block mb-1.5 flex items-center justify-between">
                        <span><i class="fas fa-ruler-vertical text-blue-500 mr-1.5"></i> 2. ระดับน้ำ *</span>
                        <span id="cwater_level_badge" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200">ข้อเท้า - เข่า (10-50 ซม.)</span>
                    </label>
                    <input type="hidden" id="cwater_level_val" value="ข้อเท้า - เข่า (10-50 ซม.)">
                    <input type="hidden" id="cwater_level_cm" value="10-50">

                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                        ${WATER_LEVEL_OPTIONS.map((opt, i) => `
                            <button type="button" onclick="selectCitizenWaterLevel('${opt.title} (${opt.range})', '${opt.range}', this)" 
                                class="cwater-level-btn p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between ${i === 1 ? opt.activeClass : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="font-black text-xs leading-tight">${opt.title}</span>
                                    <i class="fas ${opt.icon} text-xs text-${opt.color}-500"></i>
                                </div>
                                <span class="text-[10px] font-extrabold text-${opt.color}-600 block">${opt.range}</span>
                                <span class="text-[9px] text-slate-400 mt-0.5 line-clamp-1">${opt.desc}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- 3. แนวโน้มระดับน้ำ -->
                <div>
                    <label class="font-black text-slate-800 block mb-1.5">
                        <i class="fas fa-chart-line text-blue-500 mr-1.5"></i> 3. แนวโน้มระดับน้ำ *
                    </label>
                    <input type="hidden" id="cwater_trend_val" value="ทรงตัว">
                    <div class="grid grid-cols-3 gap-2">
                        <button type="button" onclick="selectCitizenWaterTrend('กำลังขึ้น', this)" class="cwater-trend-btn py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-100 transition-all">
                            <i class="fas fa-arrow-trend-up text-rose-500"></i>
                            <span>กำลังขึ้น</span>
                        </button>
                        <button type="button" onclick="selectCitizenWaterTrend('ทรงตัว', this)" class="cwater-trend-btn py-2 px-3 rounded-xl border-2 border-amber-500 bg-amber-50 text-amber-800 font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all">
                            <i class="fas fa-minus text-amber-500"></i>
                            <span>ทรงตัว</span>
                        </button>
                        <button type="button" onclick="selectCitizenWaterTrend('กำลังลด', this)" class="cwater-trend-btn py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-100 transition-all">
                            <i class="fas fa-arrow-trend-down text-emerald-500"></i>
                            <span>กำลังลด</span>
                        </button>
                    </div>
                </div>

                <!-- 4. หมายเหตุอื่น ๆ (ถ้ามี) -->
                <div>
                    <label class="font-bold text-slate-700 block mb-1">
                        <i class="far fa-comment-dots text-slate-400 mr-1.5"></i> 4. หมายเหตุอื่น ๆ (ถ้ามี)
                    </label>
                    <textarea id="cwater_note" class="w-full p-2.5 border border-slate-200 rounded-xl outline-none text-xs bg-slate-50 h-16 focus:border-blue-400" placeholder="เช่น น้ำไหลเชี่ยว, น้ำเริ่มเข้าบ้าน, ซอยนี้รถเล็กห้ามเข้า..."></textarea>
                </div>

                <!-- 5. ข้อมูลผู้รายงาน (ไม่บังคับ) -->
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="text-[10px] text-slate-500 font-bold block mb-1">ชื่อผู้รายงาน (ไม่บังคับ)</label>
                        <input type="text" id="cwater_reporter_name" class="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50" placeholder="ชื่อประชาชน / ชุมชน">
                    </div>
                    <div>
                        <label class="text-[10px] text-slate-500 font-bold block mb-1">เบอร์ติดต่อ (ไม่บังคับ)</label>
                        <input type="tel" id="cwater_reporter_phone" class="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50" placeholder="08x-xxx-xxxx">
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-paper-plane mr-1.5"></i> ส่งรายงานระดับน้ำ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#64748b',
        customClass: { popup: 'rounded-[2.5rem] max-w-lg p-5' },
        didOpen: () => {
            initCitizenWaterModalMap(defaultLat, defaultLng);
        },
        preConfirm: () => {
            const levelCategory = document.getElementById('cwater_level_val').value;
            const levelCmRange = document.getElementById('cwater_level_cm').value;
            const trend = document.getElementById('cwater_trend_val').value;
            const locationName = (document.getElementById('cwater_loc_name').value || '').trim();
            const lat = parseFloat(document.getElementById('cwater_lat').value);
            const lng = parseFloat(document.getElementById('cwater_lng').value);
            const note = (document.getElementById('cwater_note').value || '').trim();
            const reporterName = (document.getElementById('cwater_reporter_name').value || '').trim() || 'ประชาชน';
            const reporterPhone = (document.getElementById('cwater_reporter_phone').value || '').trim();

            if (!levelCategory) {
                Swal.showValidationMessage('กรุณาเลือกระดับน้ำ');
                return false;
            }
            if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
                Swal.showValidationMessage('กรุณาระบุพิกัดตำแหน่งบนแผนที่');
                return false;
            }
            if (typeof window.isInsideMunicipality === 'function' && !window.isInsideMunicipality(lat, lng)) {
                Swal.showValidationMessage('⚠️ พิกัดที่ระบุอยู่นอกเขตเทศบาลตำบลตันหยงมัส กรุณาปักหมุดภายในเขตเทศบาลเท่านั้น');
                return false;
            }

            return {
                levelCategory,
                levelCmRange,
                trend,
                locationName: locationName || `จุดสังเกต (${levelCategory})`,
                lat,
                lng,
                note,
                reporterName,
                reporterPhone
            };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const payload = result.value;
            Swal.fire({
                title: 'กำลังส่งข้อมูลระดับน้ำ...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            try {
                if (typeof sbSaveCitizenWaterReport === 'function') {
                    await sbSaveCitizenWaterReport(payload);
                } else {
                    throw new Error('ระบบฐานข้อมูลไม่พร้อมใช้งาน');
                }

                Swal.fire({
                    title: 'ขอบคุณสำหรับการรายงาน!',
                    text: 'ข้อมูลระดับน้ำของท่านถูกส่งถึงศูนย์บัญชาการเทศบาลตำบลตันหยงมัสเรียบร้อยแล้ว',
                    icon: 'success',
                    timer: 2500,
                    showConfirmButton: false,
                    customClass: { popup: 'rounded-[2rem]' }
                });

                if (typeof loadData === 'function') await loadData();
                if (typeof addCitizenWaterMarkerToPublicMap === 'function') {
                    addCitizenWaterMarkerToPublicMap(payload);
                }
            } catch (err) {
                Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
            }
        }
    });
};

window.initCitizenWaterModalMap = function (initialLat, initialLng) {
    setTimeout(() => {
        const mapContainer = document.getElementById('swal_cwater_map');
        if (!mapContainer) return;

        const map = L.map('swal_cwater_map', {
            zoomControl: false,
            attributionControl: false
        }).setView([initialLat, initialLng], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18
        }).addTo(map);

        // 🏛️ ตีกรอบขอบเขตเทศบาลและทำพื้นที่นอกเขตเป็นสีเทา (Inverted Mask)
        if (typeof window.addMunicipalityMaskToMap === 'function') {
            window.addMunicipalityMaskToMap(map, {
                fillColor: '#0f172a',
                fillOpacity: 0.55,
                borderColor: '#475569',
                outlineColor: '#3b82f6',
                onClickOutside: () => {
                    window.showOutsideMunicipalityAlert();
                }
            });
        }

        const pinIcon = L.divIcon({
            className: 'picker-pin',
            html: `<div class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg border-2 border-white animate-bounce"><i class="fas fa-droplet text-xs"></i></div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });

        let lastValidLat = initialLat;
        let lastValidLng = initialLng;

        const marker = L.marker([initialLat, initialLng], {
            icon: pinIcon,
            draggable: true
        }).addTo(map);

        function updateCoords(lat, lng) {
            const latEl = document.getElementById('cwater_lat');
            const lngEl = document.getElementById('cwater_lng');
            const previewEl = document.getElementById('cwater_coords_preview');
            if (latEl) latEl.value = lat.toFixed(6);
            if (lngEl) lngEl.value = lng.toFixed(6);
            if (previewEl) previewEl.innerText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }

        marker.on('dragend', function (e) {
            const pos = e.target.getLatLng();
            if (typeof window.isInsideMunicipality === 'function' && !window.isInsideMunicipality(pos.lat, pos.lng)) {
                window.showOutsideMunicipalityAlert();
                marker.setLatLng([lastValidLat, lastValidLng]);
                return;
            }
            lastValidLat = pos.lat;
            lastValidLng = pos.lng;
            updateCoords(pos.lat, pos.lng);
        });

        map.on('click', function (e) {
            if (typeof window.isInsideMunicipality === 'function' && !window.isInsideMunicipality(e.latlng.lat, e.latlng.lng)) {
                window.showOutsideMunicipalityAlert();
                return;
            }
            lastValidLat = e.latlng.lat;
            lastValidLng = e.latlng.lng;
            marker.setLatLng(e.latlng);
            updateCoords(e.latlng.lat, e.latlng.lng);
        });

        window._citizenModalMap = map;
        window._citizenModalMarker = marker;

        setTimeout(() => { map.invalidateSize(); }, 200);
    }, 150);
};

window.getCitizenWaterGps = function () {
    if (!navigator.geolocation) {
        alert('อุปกรณ์ของท่านไม่รองรับระบบ GPS');
        return;
    }
    const latEl = document.getElementById('cwater_lat');
    const lngEl = document.getElementById('cwater_lng');
    if (latEl) latEl.value = 'กำลังดึง GPS...';
    if (lngEl) lngEl.value = 'กำลังดึง GPS...';

    navigator.geolocation.getCurrentPosition(
        (p) => {
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;

            if (typeof window.isInsideMunicipality === 'function' && !window.isInsideMunicipality(lat, lng)) {
                window.showOutsideMunicipalityAlert('⚠️ ตำแหน่ง GPS ของท่านอยู่นอกเขตเทศบาลตำบลตันหยงมัส กรุณาปักหมุดเลือกตำแหน่งภายในเขตเทศบาล');
                if (latEl) latEl.value = '6.294450';
                if (lngEl) lngEl.value = '101.723620';
                return;
            }

            if (latEl) latEl.value = lat.toFixed(6);
            if (lngEl) lngEl.value = lng.toFixed(6);
            const previewEl = document.getElementById('cwater_coords_preview');
            if (previewEl) previewEl.innerText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

            if (window._citizenModalMap && window._citizenModalMarker) {
                window._citizenModalMap.setView([lat, lng], 16, { animate: true });
                window._citizenModalMarker.setLatLng([lat, lng]);
            }
        },
        (err) => {
            alert('ไม่สามารถดึงตำแหน่ง GPS ได้ กรุณาเปิดระบบ Location บนมือถือ');
            if (latEl) latEl.value = '6.294450';
            if (lngEl) lngEl.value = '101.723620';
        },
        { enableHighAccuracy: true, timeout: 8000 }
    );
};

window.selectCitizenWaterLevel = function (titleWithRange, range, btn) {
    const valInput = document.getElementById('cwater_level_val');
    const cmInput = document.getElementById('cwater_level_cm');
    const badge = document.getElementById('cwater_level_badge');
    if (valInput) valInput.value = titleWithRange;
    if (cmInput) cmInput.value = range;
    if (badge) badge.innerText = titleWithRange;

    document.querySelectorAll('.cwater-level-btn').forEach(b => {
        b.className = "cwater-level-btn p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100";
    });

    btn.className = "cwater-level-btn p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-400";
};

window.selectCitizenWaterTrend = function (trend, btn) {
    const valInput = document.getElementById('cwater_trend_val');
    if (valInput) valInput.value = trend;

    document.querySelectorAll('.cwater-trend-btn').forEach(b => {
        b.className = "cwater-trend-btn py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-100 transition-all";
    });

    if (trend === 'กำลังขึ้น') {
        btn.className = "cwater-trend-btn py-2 px-3 rounded-xl border-2 border-rose-500 bg-rose-50 text-rose-800 font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all";
    } else if (trend === 'ทรงตัว') {
        btn.className = "cwater-trend-btn py-2 px-3 rounded-xl border-2 border-amber-500 bg-amber-50 text-amber-800 font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all";
    } else {
        btn.className = "cwater-trend-btn py-2 px-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all";
    }
};

window.addCitizenWaterMarkerToPublicMap = function (report) {
    if (!publicMiniMapInstance) return;
    const lat = parseFloat(report.lat);
    const lng = parseFloat(report.lng);
    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return;

    const icon = L.divIcon({
        className: 'cwater-pin',
        html: `<div class="w-8 h-8 rounded-2xl bg-sky-500 text-white flex items-center justify-center shadow-lg border-2 border-white animate-bounce text-xs"><i class="fas fa-droplet"></i></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    const popupHtml = `
        <div class="font-prompt p-2 text-slate-700 min-w-[220px]">
            <div class="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                <div class="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center text-xs shrink-0">
                    <i class="fas fa-droplet"></i>
                </div>
                <div>
                    <h4 class="font-bold text-slate-800 text-xs">${report.locationName || 'รายงานระดับน้ำ'}</h4>
                    <span class="text-[9px] text-sky-700 font-bold bg-sky-50 px-2 py-0.5 rounded-full inline-block">รายงานโดยประชาชน</span>
                </div>
            </div>
            <p class="text-xs text-slate-700 mb-1">ระดับน้ำ: <b class="text-sky-600">${report.levelCategory}</b></p>
            <p class="text-[11px] text-slate-600 mb-1">แนวโน้ม: <b>${report.trend}</b></p>
            ${report.note ? `<p class="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded-lg border border-slate-100 my-1">${report.note}</p>` : ''}
            <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank"
                class="w-full mt-2 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-sky-600 rounded-xl text-[11px] font-bold shadow-sm transition-all flex items-center justify-center gap-1 active:scale-95">
                <i class="fas fa-location-arrow text-[10px]"></i> นำทาง
            </a>
        </div>
    `;

    L.marker([lat, lng], { icon }).bindPopup(popupHtml, { maxWidth: 260, className: 'clean-popup' }).addTo(publicMiniMapInstance).openPopup();
    publicMiniMapInstance.setView([lat, lng], 15, { animate: true });
};


