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
            'admin': 'ADMIN',
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
    const allowed = PAGE_ACCESS[userRole] || ['shelter'];

    document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(btn => {
        const page = btn.getAttribute('data-page');
        if (page) {
            btn.style.display = allowed.includes(page) ? 'flex' : 'none';
        }
    });

    document.querySelectorAll('.admin-only').forEach(el => {
        if (userRole === 'admin') {
            el.style.display = 'flex';
            el.classList.remove('hidden');
        } else {
            el.style.display = 'none';
            el.classList.add('hidden');
        }
    });

    const adminBtn = document.getElementById('adminMenuBtn');
    if (adminBtn) {
        if (userRole === 'admin') {
            adminBtn.style.display = 'flex';
            adminBtn.classList.remove('hidden');
        } else {
            adminBtn.style.display = 'none';
            adminBtn.classList.add('hidden');
        }
    }
}

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

// ฟังก์ชันตรวจสอบรหัสผ่านดูข้อมูลส่วนบุคคล
async function checkPasswordBeforeDetailByData(idCard, name) {
    const { value: password } = await Swal.fire({
        title: 'ระบบรักษาความปลอดภัย',
        text: 'กรุณาระบุรหัสผ่านเพื่อดูข้อมูลส่วนตัว',
        input: 'password',
        inputPlaceholder: ' ',
        confirmButtonText: 'ยืนยัน',
        confirmButtonColor: '#2563eb',
        showCancelButton: true,
        cancelButtonText: 'ยกเลิก'
    });

    if (password === '1111') {
        showDetailsByData(idCard, name);
    } else if (password) {
        Swal.fire('รหัสผ่านไม่ถูกต้อง', 'คุณไม่ได้รับอนุญาตให้ดูข้อมูลนี้', 'error');
    }
}

async function checkPasswordBeforeDetail(index) {
    const { value: password } = await Swal.fire({
        title: 'ระบบรักษาความปลอดภัย',
        text: 'กรุณาระบุรหัสผ่านเพื่อดูข้อมูลส่วนตัว',
        input: 'password',
        inputPlaceholder: ' ',
        confirmButtonText: 'ยืนยัน',
        confirmButtonColor: '#2563eb',
        showCancelButton: true,
        cancelButtonText: 'ยกเลิก'
    });

    if (password === '1111') {
        showDetails(index);
    } else if (password) {
        Swal.fire('รหัสผ่านไม่ถูกต้อง', 'คุณไม่ได้รับอนุญาตให้ดูข้อมูลนี้', 'error');
    }
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

