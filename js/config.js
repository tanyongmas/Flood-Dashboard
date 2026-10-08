/**
 * Configuration & Global Constants
 * ระบบรายงานสถานการณ์น้ำท่วม ทต.ตันหยงมัส
 */

// Google Apps Script API Web App URL สำหรับระบบแดชบอร์ดหลัก (Flood Dashboard)
const API_URL = "https://script.google.com/macros/s/AKfycbwahktsrfbMuVu4oIP2ChrGVsjiGhuGFQWBdnfTitRRRQy5P_ONiRYUUVpsbzh57bFy/exec";

// ⚡ Supabase Configuration (PostgreSQL Database ความเร็วสูง - โหมด Supabase 100%)
const SUPABASE_URL = "https://wixjaufsizqurdiovjdf.supabase.co";
const SUPABASE_KEY = "sb_publishable_cGgfJgxM5zQ1tqmvH9i2qQ_RgI9pING";
const USE_SUPABASE = true;         // ใช้งาน Supabase เป็นฐานข้อมูล 100%
const DUAL_WRITE_MODE = false;     // ปิดการบันทึกเข้า Google Sheets (บันทึกตรงเข้า Supabase เท่านั้น)

// Looker Studio Reporting Embed URL
const LOOKER_URL = "https://lookerstudio.google.com/embed/reporting/e87384f5-54c2-4bb3-b838-b9927c696f34/page/p_nqf5i1oswd";

// Google Apps Script API Web App URL สำหรับระบบปริมาณน้ำฝน (Rainfall Dashboard)
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbzLh2A9w0TyOJfUc1IVsTKrV661Yt2KmHtyBp0LyHbL8Q8LdS3lIHHt6-O0-hVRAI6W/exec";

// กฎการจัดโซนพื้นที่ในเทศบาลตำบลตันหยงมัส
window.ZONE_RULES = {
    zone1: ['ถนนประชาสามัคคี', 'ถนนระแงะมรรคา', 'ถนนระแงะมรรคา 1', 'ถนนระแงะมรรคา 2', 'ถนนระแงะมรรคา 3', 'ถนนระแงะมรรคา 4', 'ถนนระแงะมรรคา 5', 'ถนนระแงะมรรคา 6', 'ถนนมะรือโบ-บ่อทอง', 'ถนนลานไทร ซอย 1'],
    zone2: ['ถนนลานไทร ซอย 3', 'ถนนระแงะมรรคา 19'],
    zone3: ['ถนนเทศบาล 12', 'ถนนเทศบาล 15', 'ถนนเทศบาล 15 ซอย 1', 'ถนนเทศบาล 15 ซอย 2', 'ถนนเทศบาล 15 ซอย 2/1'],
    zone4: ['ถนนเทศบาล 8 ซอย 2', 'ถนนเทศบาล 8', 'ถนนเทศบาล 11 ซอย 1', 'ถนนเทศบาล 11 ซอย 3', 'ถนนเทศบาล 11 ซอย 5'],
    zone5: ['ถนนเทศบาล 17', 'ถนนเทศบาล 17 ซอย 1ก', 'ถนนเทศบาล 17 ซอย 3', 'ถนนพระยาระแงะ ซอย 3']
};

// คำนวณปีพุทธศักราชและเดือนปัจจุบันสำหรับการกรองข้อมูลตามรอบปี
function getCurrentDefaultPeriodInfo() {
    const now = new Date();
    const curYearBE = (now.getFullYear() + 543).toString();
    const curMonthStr = (now.getMonth() + 1).toString();
    const curMonthPeriod = `${curYearBE}_${curMonthStr}`;
    return { curYearBE, curMonthStr, curMonthPeriod };
}

// ==========================================
// 🏛️ พิกัดขอบเขตเทศบาลตำบลตันหยงมัส (Municipality Boundary)
// ==========================================
window.MUNICIPALITY_BOUNDARY = [
    [6.287240427280289, 101.70468249509999],
    [6.291291459811804, 101.70575515418483],
    [6.302293051933469, 101.7045537760098],
    [6.3029326722100345, 101.705669341458],
    [6.3000756955363375, 101.70875859962234],
    [6.30314587879364, 101.71751149775464],
    [6.3022504105536505, 101.73686226764508],
    [6.296152657166034, 101.73651901673792],
    [6.282677647589206, 101.73939374308529],
    [6.285620005430542, 101.7281093695128],
    [6.280332277974188, 101.71691080866711]
];

/**
 * ตรวจสอบว่าพิกัด (lat, lng) อยู่ภายในเขตเทศบาลตำบลตันหยงมัสหรือไม่ (Ray-Casting Algorithm)
 */
window.isInsideMunicipality = function (lat, lng) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return false;

    const poly = window.MUNICIPALITY_BOUNDARY;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        const intersect = ((yi > lngNum) !== (yj > lngNum)) &&
            (latNum < (xj - xi) * (lngNum - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

/**
 * แสดงข้อความแจ้งเตือนเมื่อปักหมุดหรือคลิกนอกเขตเทศบาล
 */
window.showOutsideMunicipalityAlert = function (customMsg = null) {
    const msg = customMsg || 'ตำแหน่งที่ท่านเลือกอยู่นอกเขตเทศบาลตำบลตันหยงมัส กรุณาปักหมุดหรือเลือกตำแหน่งภายในเขตเทศบาลเท่านั้น';
    if (typeof Swal !== 'undefined') {
        const toast = Swal.mixin({
            toast: true,
            position: 'top',
            showConfirmButton: false,
            timer: 3500,
            timerProgressBar: true
        });
        toast.fire({
            icon: 'warning',
            title: '⚠️ อยู่นอกเขตเทศบาล',
            text: msg
        });
    } else {
        alert(msg);
    }
};

/**
 * ฟังก์ชันสร้าง Inverted Mask สีเทาปิดทับพื้นที่นอกเขตเทศบาล (Donut Polygon)
 * และวาดเส้นขอบเขตเทศบาลตำบลตันหยงมัส
 */
window.addMunicipalityMaskToMap = function (mapInstance, options = {}) {
    if (!mapInstance || typeof L === 'undefined') return null;

    // กรอบพิกัดวงนอกสุด (ครอบคลุมทั้งโลก)
    const worldOuterBounds = [
        [-90, -180],
        [-90, 180],
        [90, 180],
        [90, -180]
    ];

    // Donut Polygon: วงนอก (โลก) + วงในเจาะรู (ขอบเขตเทศบาล)
    const maskCoords = [worldOuterBounds, window.MUNICIPALITY_BOUNDARY];

    const maskLayer = L.polygon(maskCoords, {
        color: options.borderColor || '#334155',
        weight: options.borderWeight || 1.5,
        opacity: options.borderOpacity || 0.6,
        fillColor: options.fillColor || '#0f172a',
        fillOpacity: options.fillOpacity !== undefined ? options.fillOpacity : 0.5,
        interactive: options.interactive !== undefined ? options.interactive : true,
        className: 'municipality-outer-mask'
    }).addTo(mapInstance);

    // ดักคลิกบนพื้นที่สีเทานอกเขต
    maskLayer.on('click', function (e) {
        if (options.onClickOutside) {
            options.onClickOutside(e);
        } else {
            window.showOutsideMunicipalityAlert();
        }
    });

    // เส้นขอบเขตเทศบาล (Boundary Line เด่นชัด สวยงาม)
    const boundaryCoords = window.MUNICIPALITY_BOUNDARY.concat([window.MUNICIPALITY_BOUNDARY[0]]);
    const outlineLayer = L.polyline(boundaryCoords, {
        color: options.outlineColor || '#3b82f6',
        weight: options.outlineWeight || 2.5,
        dashArray: options.dashArray || '6, 6',
        opacity: options.outlineOpacity || 0.9,
        interactive: false
    }).addTo(mapInstance);

    return { maskLayer, outlineLayer };
};
