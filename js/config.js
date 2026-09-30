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
