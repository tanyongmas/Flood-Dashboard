/**
 * Utility Functions & Helpers
 * ระบบรายงานสถานการณ์น้ำท่วม ทต.ตันหยงมัส
 */

// ฟังก์ชันปรับมาตรฐานที่อยู่ไทย (แปลงตัวย่อจากบัตรประชาชน OCR ให้เป็นคำเต็มและลบช่องว่างส่วนเกิน)
window.normalizeThaiAddress = function (address) {
    if (!address) return '';
    let text = address.toString().trim();

    // 1. แปลงคำย่อหลักจากบัตรประชาชน
    text = text.replace(/ถ\./g, 'ถนน ');
    text = text.replace(/ซ\./g, 'ซอย ');
    text = text.replace(/ต\./g, 'ตำบล ');
    text = text.replace(/อ\./g, 'อำเภอ ');
    text = text.replace(/จ\./g, 'จังหวัด ');
    text = text.replace(/ม\./g, 'หมู่ ');

    // 2. ปรับคำสะกดผิด/เพี้ยนทั่วไป
    text = text.replace(/มรรรคา/g, 'มรรคา');

    // 3. ปรับการเว้นวรรคระหว่างข้อความไทยกับตัวเลข (เช่น เทศบาล15 -> เทศบาล 15)
    text = text.replace(/([ก-๙]+)(\d+)/g, '$1 $2');

    // 4. ยุบช่องว่างที่ติดกันหลายตัวให้เหลือช่องว่างเดียว
    return text.replace(/\s+/g, ' ').trim();
};

// ฟังก์ชันวิเคราะห์หาโซนที่แม่นยำที่สุด ป้องกันปัญหาคำซ้อนทับกัน (Substring Overlap) และรองรับที่อยู่จาก OCR
window.getExactZoneForAddress = function (address) {
    if (!address) return 'zone 5';

    const normalizedInput = window.normalizeThaiAddress(address);
    const compactInput = normalizedInput.replace(/\s+/g, '');

    let matchedZone = 'zone 5';
    let maxMatchLength = 0;

    for (const [zone, streets] of Object.entries(window.ZONE_RULES)) {
        for (const street of streets) {
            const normalizedStreet = window.normalizeThaiAddress(street);
            const compactStreet = normalizedStreet.replace(/\s+/g, '');

            if (normalizedInput.includes(normalizedStreet) || compactInput.includes(compactStreet)) {
                if (compactStreet.length > maxMatchLength) {
                    maxMatchLength = compactStreet.length;
                    matchedZone = zone;
                }
            }
        }
    }
    return matchedZone;
};

// ฟังก์ชันสกัดบ้านเลขที่ และ ชื่อถนน/ซอย/ชุมชน จากข้อความที่อยู่ภาษาไทย
window.extractAddressComponents = function (fullAddress) {
    if (!fullAddress) return { houseNo: '', streetName: '', normalized: '' };

    const normalized = typeof window.normalizeThaiAddress === 'function'
        ? window.normalizeThaiAddress(fullAddress)
        : fullAddress.toString().trim();

    // 1. สกัดบ้านเลขที่ (เช่น 123/45, 99/9, 45, 12/34)
    let houseNo = '';
    const houseNoMatch = normalized.match(/(?:บ้านเลขที่\s*)?(\d+(?:\/\d+)?(?:\,\d+)*)/);
    if (houseNoMatch) {
        houseNo = houseNoMatch[1].trim();
    }

    // 2. สกัดชื่อถนน / ซอย / ชุมชน จาก ZONE_RULES
    let streetName = '';
    let maxMatchLen = 0;

    if (window.ZONE_RULES) {
        for (const [zone, streets] of Object.entries(window.ZONE_RULES)) {
            for (const st of streets) {
                const normSt = typeof window.normalizeThaiAddress === 'function' ? window.normalizeThaiAddress(st) : st;
                const compactSt = normSt.replace(/\s+/g, '');
                const compactNorm = normalized.replace(/\s+/g, '');

                if (normalized.includes(normSt) || compactNorm.includes(compactSt)) {
                    if (compactSt.length > maxMatchLen) {
                        maxMatchLen = compactSt.length;
                        streetName = normSt;
                    }
                }
            }
        }
    }

    return { houseNo, streetName, normalized };
};

// ฟังก์ชันจัดการ UI หลัง Login
function setupUserInterface(user) {
    if (!user) return;

    const nameDisplay = document.getElementById('displayUserName');
    const roleDisplay = document.getElementById('displayUserRole');

    if (nameDisplay) nameDisplay.innerText = user.name;
    if (roleDisplay) {
        const roleLabels = {
            'superadmin': 'SUPER ADMIN',
            'admin': 'ADMIN (ดูข้อมูลอย่างเดียว)',
            'shelter': 'SHELTER',
            'water_staff': 'WATER STAFF',
            'relief': 'RELIEF',
            'community': 'COMMUNITY',
            'flood_report': 'FLOOD REPORT'
        };
        roleDisplay.innerText = roleLabels[user.role] || user.role.toUpperCase();
    }
}

function updateMenuByRole() {
    let currentRole = (typeof userRole !== 'undefined' && userRole) ? userRole : '';
    if (!currentRole) {
        try {
            const saved = localStorage.getItem('user_session');
            if (saved) currentRole = JSON.parse(saved).role || '';
        } catch (e) {}
    }

    const roleAccessMap = {
        'superadmin': ['dashboard', 'water', 'addWater', 'shelter', 'evacuation', 'regis', 'relief', 'looker', 'userManagement'],
        'admin': ['dashboard', 'water', 'addWater', 'shelter', 'evacuation', 'regis', 'relief', 'looker'],
        'shelter': ['shelter', 'regis', 'looker'],
        'water_staff': ['water', 'addWater', 'looker'],
        'relief': ['relief', 'looker'],
        'community': ['water', 'addWater', 'evacuation', 'looker'],
        'flood_report': ['looker']
    };
    const accessMap = (typeof PAGE_ACCESS !== 'undefined') ? PAGE_ACCESS : roleAccessMap;
    const allowed = accessMap[currentRole] || ['shelter'];

    document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(btn => {
        const page = btn.getAttribute('data-page');
        if (page) {
            if (allowed.includes(page)) {
                btn.style.display = 'flex';
                btn.classList.remove('hidden');
            } else {
                btn.style.setProperty('display', 'none', 'important');
                btn.classList.add('hidden');
            }
        }
    });

    // 📊 ควบคุมปุ่ม looker บนแถบ Bottom Navigation:
    // แสดงเฉพาะกรณีเข้าสู่ระบบด้วยสิทธิ์ flood_report เท่านั้น (สิทธิ์อื่นจะเข้าถึงผ่านเมนู 3 ขีดด้านบน)
    const mobileLookerBtn = document.querySelector('.bottom-nav-mobile .mobile-nav-btn[data-page="looker"]');
    if (mobileLookerBtn) {
        if (currentRole === 'flood_report') {
            mobileLookerBtn.style.display = 'flex';
            mobileLookerBtn.classList.remove('hidden');
        } else {
            mobileLookerBtn.style.setProperty('display', 'none', 'important');
            mobileLookerBtn.classList.add('hidden');
        }
    }

    // 🎯 ปรับตำแหน่งไอคอนบน Bottom Navigation: กรณีมีเพียง 1 ไอคอน ให้แสดงตรงกลางหน้าจออย่างสมบูรณ์
    const bottomNav = document.querySelector('.bottom-nav-mobile');
    if (bottomNav) {
        const visibleBtns = Array.from(bottomNav.querySelectorAll('.mobile-nav-btn')).filter(btn => {
            return !btn.classList.contains('hidden') && btn.style.display !== 'none';
        });
        const groups = bottomNav.querySelectorAll('.mobile-nav-group');

        if (visibleBtns.length === 1) {
            bottomNav.classList.add('single-nav-mode');
            groups.forEach(group => {
                const hasVisible = Array.from(group.querySelectorAll('.mobile-nav-btn')).some(btn => {
                    return !btn.classList.contains('hidden') && btn.style.display !== 'none';
                });
                if (hasVisible) {
                    group.style.display = 'flex';
                    group.style.flex = 'none';
                    group.style.width = 'auto';
                    group.style.justifyContent = 'center';
                } else {
                    group.style.setProperty('display', 'none', 'important');
                }
            });
        } else {
            bottomNav.classList.remove('single-nav-mode');
            groups.forEach(group => {
                group.style.display = '';
                group.style.flex = '';
                group.style.width = '';
                group.style.justifyContent = '';
            });
        }
    }

    // ปุ่มและเมนูภาพรวมสำหรับ Superadmin และ Admin
    document.querySelectorAll('.admin-only').forEach(el => {
        if (userRole === 'admin' || userRole === 'superadmin') {
            el.style.display = 'flex';
            el.classList.remove('hidden');
        } else {
            el.style.display = 'none';
            el.classList.add('hidden');
        }
    });

    // เมนูจัดการผู้ใช้งาน (User Management) เฉพาะ Superadmin เท่านั้น
    const adminBtn = document.getElementById('adminMenuBtn');
    if (adminBtn) {
        if (userRole === 'superadmin') {
            adminBtn.style.display = 'flex';
            adminBtn.classList.remove('hidden');
        } else {
            adminBtn.style.display = 'none';
            adminBtn.classList.add('hidden');
        }
    }

    // จัดการโหมดดูข้อมูลอย่างเดียว (View-Only Mode) สำหรับ Admin
    if (userRole === 'admin') {
        document.body.classList.add('view-only-mode');
        const badge = document.getElementById('viewOnlyBadge');
        if (badge) badge.classList.remove('hidden');
    } else {
        document.body.classList.remove('view-only-mode');
        const badge = document.getElementById('viewOnlyBadge');
        if (badge) badge.classList.add('hidden');
    }
}

/**
 * ตรวจสอบและบล็อกการแก้ไข/ลบ/เพิ่มข้อมูลสำหรับสิทธิ์ Admin (View-Only)
 */
function checkAdminReadOnlyAction() {
    if (typeof userRole !== 'undefined' && userRole === 'admin') {
        Swal.fire({
            icon: 'info',
            title: 'สิทธิ์ดูข้อมูลเท่านั้น',
            text: 'บัญชีผู้ใช้งาน Admin สามารถดูข้อมูลได้อย่างเดียว ไม่สามารถแก้ไข เพิ่ม หรือลบข้อมูลใดๆ ได้',
            confirmButtonColor: '#3b82f6',
            customClass: { popup: 'rounded-2xl' }
        });
        return true;
    }
    return false;
}
window.checkAdminReadOnlyAction = checkAdminReadOnlyAction;

// ฟังก์ชันออกจากระบบ
function handleLogout() {
    Swal.fire({
        title: 'ยืนยันการออกจากระบบ?',
        text: "คุณต้องเข้าสู่ระบบใหม่เพื่อใช้งานอีกครั้ง",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem('user_session');
            location.reload();
        }
    });
}

// ==========================================
// 🛡️ ระบบรักษาความปลอดภัย PDPA Step-up Authentication (Security PIN)
// ==========================================

/**
 * ขอรหัสผ่าน Security PIN ก่อนเข้าถึงข้อมูลส่วนบุคคลอ่อนไหว
 * มี Session Cache 15 นาที เพื่อไม่ต้องกรอกซ้ำบ่อยเกินไป
 */
async function promptPdpaSecurityPin(targetDesc, onSuccess) {
    const allowedRoles = ['superadmin', 'admin', 'shelter', 'relief'];
    let currentRole = (typeof userRole !== 'undefined' && userRole) ? userRole.toLowerCase() : '';
    if (!currentRole) {
        try {
            const saved = localStorage.getItem('user_session');
            if (saved) currentRole = (JSON.parse(saved).role || '').toLowerCase();
        } catch(e) {}
    }
    const staffName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : 'เจ้าหน้าที่';

    // 1. ตรวจสอบสิทธิ์ Role ขั้นแรก
    if (!allowedRoles.includes(currentRole)) {
        Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์เข้าถึงข้อมูล',
            text: 'เฉพาะเจ้าหน้าที่ศูนย์พักพิงและผู้ดูแลระบบเท่านั้นที่สามารถดูข้อมูลส่วนบุคคลได้ (ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล PDPA)',
            confirmButtonColor: '#e11d48'
        });
        return;
    }

    // 2. ตรวจสอบว่าเคยยืนยันรหัสผ่านใน Session นี้แล้วหรือยัง (Cache 15 นาที)
    const unlockedAt = sessionStorage.getItem('pdpa_unlocked_at');
    const isSessionActive = unlockedAt && (Date.now() - Number(unlockedAt) < 15 * 60 * 1000);

    if (isSessionActive) {
        if (typeof onSuccess === 'function') onSuccess();
        return;
    }

    // 3. แสดงหน้าต่างยืนยัน PDPA พร้อมช่องกรอกรหัสผ่าน PIN
    const { value: pin, isConfirmed } = await Swal.fire({
        title: '<div class="text-blue-700 text-lg font-bold flex items-center justify-center gap-2"><i class="fas fa-shield-alt text-amber-500"></i>ยืนยันรหัสผ่าน PDPA PIN</div>',
        html: `
            <div class="text-left space-y-2 text-xs text-slate-600 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 mt-2 mb-3">
                <p><strong>ผู้ปฏิบัติงาน:</strong> <span class="text-blue-700 font-bold">${staffName}</span> (${currentRole.toUpperCase()})</p>
                <p><strong>เป้าหมาย:</strong> <span class="text-slate-800 font-medium">${targetDesc || 'ข้อมูลส่วนบุคคล'}</span></p>
                <div class="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200 mt-2">
                    <i class="fas fa-exclamation-triangle mr-1 text-amber-600"></i>
                    กรุณากรอกรหัสผ่านความปลอดภัย (PIN) เพื่อปลดล็อกข้อมูลตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
                </div>
            </div>
            <div class="mt-2 text-left">
                <label class="text-[11px] font-bold text-slate-500 block mb-1">รหัสผ่านความปลอดภัย (Security PIN)</label>
                <input id="swal_pdpa_pin_input" type="password" maxlength="12" placeholder="••••" autocomplete="off"
                    class="w-full p-3.5 text-center text-xl tracking-[0.3em] font-black border-2 border-slate-200 focus:border-blue-500 rounded-2xl outline-none transition-all bg-white text-slate-800">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="fas fa-unlock mr-1.5"></i> ยืนยันและเปิดดู',
        cancelButtonText: 'ยกเลิก',
        customClass: { popup: 'rounded-[2rem]' },
        didOpen: () => {
            const input = document.getElementById('swal_pdpa_pin_input');
            if (input) {
                input.focus();
                input.addEventListener('keyup', (e) => {
                    if (e.key === 'Enter') Swal.clickConfirm();
                });
            }
        },
        preConfirm: () => {
            const val = document.getElementById('swal_pdpa_pin_input').value;
            if (!val || val.trim().length === 0) {
                Swal.showValidationMessage('กรุณาระบุรหัสผ่าน PDPA PIN');
                return false;
            }
            return val.trim();
        }
    });

    if (!isConfirmed || !pin) return;

    // 4. ตรวจสอบรหัสผ่านกับ Supabase Service
    Swal.fire({
        title: 'กำลังตรวจสอบสิทธิ์...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const isValid = typeof sbVerifyPdpaPin === 'function' ? await sbVerifyPdpaPin(pin) : (pin === '1111');
        if (!isValid) {
            Swal.fire({
                icon: 'error',
                title: 'รหัสผ่านไม่ถูกต้อง',
                text: 'รหัสผ่าน PDPA PIN ไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบหากท่านจำรหัสผ่านไม่ได้',
                confirmButtonColor: '#e11d48',
                customClass: { popup: 'rounded-2xl' }
            });
            return;
        }

        // ปลดล็อกสำเร็จ: บันทึกลง Session นาน 15 นาที
        sessionStorage.setItem('pdpa_unlocked_at', Date.now());
        Swal.close();

        if (typeof onSuccess === 'function') {
            onSuccess();
        }
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถตรวจสอบรหัสผ่านได้', 'error');
    }
}

// ฟังก์ชันตรวจสอบสิทธิ์และยืนยันการเข้าถึงข้อมูลส่วนบุคคลตามชื่อ/เลขบัตร
async function checkPasswordBeforeDetailByData(idCard, name) {
    const staffName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : 'เจ้าหน้าที่';
    const currentRole = (typeof userRole !== 'undefined' ? userRole : '').toLowerCase();

    promptPdpaSecurityPin(`คุณ ${name || 'ผู้ประสบภัย'}`, () => {
        console.log(`🔒 [PDPA Audit] ${new Date().toISOString()} - User: ${staffName} (${currentRole}) accessed details of: ${name}`);
        if (typeof showDetailsByData === 'function') {
            showDetailsByData(idCard, name);
        }
    });
}

// ฟังก์ชันตรวจสอบสิทธิ์และยืนยันการเข้าถึงข้อมูลส่วนบุคคลตาม index แถว
async function checkPasswordBeforeDetail(index) {
    const staffName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : 'เจ้าหน้าที่';
    const currentRole = (typeof userRole !== 'undefined' ? userRole : '').toLowerCase();

    promptPdpaSecurityPin(`ผู้ประสบภัยลำดับที่ ${index + 1}`, () => {
        console.log(`🔒 [PDPA Audit] ${new Date().toISOString()} - User: ${staffName} (${currentRole}) accessed details index #${index}`);
        if (typeof showDetails === 'function') {
            showDetails(index);
        }
    });
}

// ปิด Data Modal
function closeDataModal() {
    const modal = document.getElementById('dataModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ==========================================
// 🚀 ระบบ Browser Storage Caching (TTL Support)
// ==========================================
window.setAppCache = function (key, data, ttlMinutes = 15) {
    try {
        const item = {
            data: data,
            expiry: Date.now() + (ttlMinutes * 60 * 1000)
        };
        localStorage.setItem(`flood_cache_${key}`, JSON.stringify(item));
    } catch (e) {
        console.warn("Storage Cache Write Error:", e);
    }
};

window.getAppCache = function (key) {
    try {
        const itemStr = localStorage.getItem(`flood_cache_${key}`);
        if (!itemStr) return null;
        const item = JSON.parse(itemStr);
        if (Date.now() > item.expiry) {
            localStorage.removeItem(`flood_cache_${key}`);
            return null;
        }
        return item.data;
    } catch (e) {
        console.warn("Storage Cache Read Error:", e);
        return null;
    }
};

window.clearAppCache = function (key) {
    try {
        if (key) {
            localStorage.removeItem(`flood_cache_${key}`);
        } else {
            Object.keys(localStorage).forEach(k => {
                if (k.startsWith('flood_cache_')) localStorage.removeItem(k);
            });
        }
    } catch (e) { }
};

// สลับการแสดงผลข้อมูลส่วนบุคคลที่พรางไว้ (Data Masking Toggle)
window.toggleModalMask = function (elementId, rawValue, maskedValue, btnElement) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const isCurrentlyMasked = el.innerText.trim() === maskedValue.trim();
    if (isCurrentlyMasked) {
        el.innerText = rawValue;
        if (el.tagName === 'A') el.href = 'tel:' + rawValue;
        if (btnElement) {
            btnElement.innerHTML = '<i class="fas fa-eye-slash text-[10px]"></i> ซ่อนข้อมูล';
        }
    } else {
        el.innerText = maskedValue;
        if (el.tagName === 'A') el.href = 'tel:' + rawValue;
        if (btnElement) {
            btnElement.innerHTML = '<i class="fas fa-eye text-[10px]"></i> แสดงข้อมูลเต็ม';
        }
    }
};
