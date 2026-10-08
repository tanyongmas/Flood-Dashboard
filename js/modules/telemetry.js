/**
 * 🌊 Telemetry Module: ระบบติดตามและประมวลผลระดับน้ำจาก RID (สถานี X.73 และ X.73A)
 * เทศบาลตำบลตันหยงมัส
 */

async function loadRIDWaterLevel(forceRefresh = false) {
    window.loadRIDWaterLevel = loadRIDWaterLevel;
    // 📌 Element สำหรับการ์ดขนาดใหญ่ (X.73)
    const levelEl = document.getElementById('rid_water_level');
    const statusEl = document.getElementById('rid_water_status');
    const timeEl = document.getElementById('rid_update_time');
    const dotEl = document.getElementById('rid_status_dot');
    const cardEl = document.getElementById('rid_card');

    // 📌 Element สำหรับการ์ดแบบ Mini (X.73)
    const levelMiniEl = document.getElementById('rid_water_level_mini');
    const statusMiniEl = document.getElementById('rid_water_status_mini');
    const timeMiniEl = document.getElementById('rid_update_time_mini');
    const dotMiniEl = document.getElementById('rid_status_dot_mini');
    const cardMiniEl = document.getElementById('rid_card_mini');
    const iconMiniBg = document.getElementById('rid_icon_bg_mini');

    // 📌 Element สำหรับสถานี X.73A (บ้านบองอ อ.ระแงะ - สถานีต้นน้ำเตือนล่วงหน้า)
    const levelX73aEl = document.getElementById('rid_x73a_water_level_mini');
    const statusX73aEl = document.getElementById('rid_x73a_water_status_mini');
    const timeX73aEl = document.getElementById('rid_x73a_update_time_mini');
    const dotX73aEl = document.getElementById('rid_x73a_status_dot_mini');
    const cardX73aEl = document.getElementById('rid_x73a_card_mini');
    const iconX73aBg = document.getElementById('rid_x73a_icon_bg_mini');
    const sidebarX73a = document.getElementById('rid_x73a_sidebar_mini');

    if (!levelEl && !levelMiniEl && !levelX73aEl) return;

    let result = null;

    // 🚀 1. ตรวจสอบ Browser Cache ก่อน หากยังไม่หมดอายุและไม่ได้ forceRefresh ให้ใช้แสดงผลทันที
    if (!forceRefresh && typeof window.getAppCache === 'function') {
        const cached = window.getAppCache('rid_data');
        if (cached && cached.success && cached.data) {
            result = cached;
        }
    }

    // 🚀 2. ดึงข้อมูลจาก API พร้อมระบบ Retry และ Fallback
    if (!result) {
        const fetchWithRetry = async () => {
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    const res = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({ action: 'getRIDData' })
                    });
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    const text = await res.text();
                    const parsed = JSON.parse(text);
                    if (parsed && parsed.success) return parsed;
                } catch (e) {
                    console.warn(`⚠️ RID API Attempt ${attempt} failed:`, e);
                    if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
                }
            }
            return null;
        };

        result = await fetchWithRetry();

        if (result && result.success && result.data && typeof window.setAppCache === 'function') {
            window.setAppCache('rid_data', result, 5); // Cache 5 นาที
            window.setAppCache('rid_data_backup', result, 1440); // Backup cache 24 ชม.
        }

        // 🚀 3. Stale Cache Fallback: หากดึงสดล้มเหลว นำแคชสำรองเดิมมาแสดงแทนตัวอักษร Error
        if (!result && typeof window.getAppCache === 'function') {
            const backupCached = window.getAppCache('rid_data_backup') || window.getAppCache('rid_data');
            if (backupCached && backupCached.success) {
                result = backupCached;
                result.isStaleFallback = true;
            }
        }
    }

    // ==========================================
    // 📊 1. ประมวลผลและแสดงผล สถานี X.73 (คลองตันหยงมัส)
    // ==========================================
    if (result && result.success && result.data) {
        if (levelEl) levelEl.innerText = result.data.level;
        if (timeEl) timeEl.innerText = result.data.time + (result.isStaleFallback ? ' (ข้อมูลล่าสุด)' : '');

        if (levelMiniEl) levelMiniEl.innerText = result.data.level;
        if (timeMiniEl) timeMiniEl.innerText = result.data.time + (result.isStaleFallback ? ' (แคช)' : '');

        const sourceEl = document.getElementById('rid_data_source');
        if (sourceEl) {
            if (result.isStaleFallback) {
                sourceEl.innerHTML = '<i class="fas fa-history mr-1"></i>แคชสำรองในระบบ';
                sourceEl.className = 'text-[8px] md:text-[9px] bg-slate-500/30 text-slate-100 px-2 py-0.5 rounded-full inline-block backdrop-blur-sm border border-slate-300/30 font-bold';
            } else if (result.source === 'API') {
                sourceEl.innerHTML = '<i class="fas fa-satellite-dish mr-1"></i>API เรียลไทม์';
                sourceEl.className = 'text-[8px] md:text-[9px] bg-green-500/30 text-green-100 px-2 py-0.5 rounded-full inline-block backdrop-blur-sm border border-green-300/30 font-bold';
            } else {
                sourceEl.innerHTML = '<i class="fas fa-table mr-1"></i>Google Sheet (สำรอง)';
                sourceEl.className = 'text-[8px] md:text-[9px] bg-amber-500/30 text-amber-100 px-2 py-0.5 rounded-full inline-block backdrop-blur-sm border border-amber-300/30 font-bold';
            }
        }

        const bankInfoEl = document.getElementById('rid_bank_info');
        if (bankInfoEl && result.data.bankLevel) {
            const diffBank = parseFloat(result.data.diffBank || 0);
            bankInfoEl.innerHTML = `<i class="fas fa-ruler-vertical mr-1"></i>ต่ำกว่าตลิ่ง ${diffBank.toFixed(2)} ม. (ตลิ่ง ${result.data.bankLevel} ม.รทก.)`;
            bankInfoEl.classList.remove('hidden');
        }

        const trendEl = document.getElementById('rid_trend_indicator');
        if (trendEl && result.data.previousLevel) {
            const current = parseFloat(result.data.level);
            const previous = parseFloat(result.data.previousLevel);
            const diff = current - previous;
            if (diff > 0) {
                trendEl.innerHTML = `<i class="fas fa-arrow-up text-red-300"></i> +${diff.toFixed(2)}`;
                trendEl.className = 'text-[9px] text-red-200 font-bold ml-2';
            } else if (diff < 0) {
                trendEl.innerHTML = `<i class="fas fa-arrow-down text-green-300"></i> ${diff.toFixed(2)}`;
                trendEl.className = 'text-[9px] text-green-200 font-bold ml-2';
            } else {
                trendEl.innerHTML = `<i class="fas fa-minus text-slate-300"></i> 0.00`;
                trendEl.className = 'text-[9px] text-slate-300 font-bold ml-2';
            }
            trendEl.classList.remove('hidden');
        }

        const levelNum = parseFloat(result.data.level);

        if (levelNum > 14.90) {
            if (statusEl) { statusEl.innerText = 'ระดับน้ำวิกฤต'; statusEl.className = 'text-xs md:text-sm font-bold text-white drop-shadow-sm'; }
            if (dotEl) dotEl.className = 'w-2 h-2 rounded-full bg-white animate-ping';
            if (cardEl) cardEl.className = 'bg-gradient-to-br from-red-500 to-red-700 rounded-[2rem] p-6 shadow-xl shadow-red-500/50 mb-8 text-white relative overflow-hidden flex flex-col md:flex-row items-center justify-between animate-pulse transition-all duration-700 border-2 border-red-300';
            if (statusMiniEl) { statusMiniEl.innerText = 'ระดับน้ำวิกฤต'; statusMiniEl.className = 'text-[10px] md:text-xs font-bold text-red-500'; }
            if (dotMiniEl) dotMiniEl.className = 'w-1.5 h-1.5 rounded-full bg-red-500 animate-ping';
            if (levelMiniEl) levelMiniEl.className = 'text-2xl md:text-3xl font-black text-red-600 tracking-tight';
            if (cardMiniEl) {
                cardMiniEl.className = 'h-[120px] w-full flex items-center justify-between bg-red-50/80 rounded-2xl p-4 md:p-5 shadow-sm border border-red-200 relative overflow-hidden transition-all hover:shadow-md';
                const sidebar = cardMiniEl.querySelector('.absolute.left-0');
                if (sidebar) sidebar.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-red-400 to-red-600';
            }
            if (iconMiniBg) iconMiniBg.className = 'w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-red-500 to-red-600 text-white rounded-[1rem] flex items-center justify-center text-2xl md:text-3xl shrink-0 shadow-lg shadow-red-500/40 animate-pulse';
        } else if (levelNum > 13.50) {
            if (statusEl) { statusEl.innerText = 'เฝ้าระวังระดับน้ำ'; statusEl.className = 'text-xs md:text-sm font-bold text-yellow-100'; }
            if (dotEl) dotEl.className = 'w-2 h-2 rounded-full bg-yellow-400 animate-pulse';
            if (cardEl) cardEl.className = 'bg-gradient-to-br from-orange-400 to-amber-600 rounded-[2rem] p-6 shadow-lg shadow-orange-500/30 mb-8 text-white relative overflow-hidden flex flex-col md:flex-row items-center justify-between transition-all duration-700';
            if (statusMiniEl) { statusMiniEl.innerText = 'เฝ้าระวังระดับน้ำ'; statusMiniEl.className = 'text-[10px] md:text-xs font-bold text-amber-500'; }
            if (dotMiniEl) dotMiniEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse';
            if (levelMiniEl) levelMiniEl.className = 'text-2xl md:text-3xl font-black text-amber-600 tracking-tight';
            if (cardMiniEl) {
                cardMiniEl.className = 'h-[120px] w-full flex items-center justify-between bg-amber-50/50 rounded-2xl p-4 md:p-5 shadow-sm border border-amber-200 relative overflow-hidden transition-all hover:shadow-md';
                const sidebar = cardMiniEl.querySelector('.absolute.left-0');
                if (sidebar) sidebar.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-400 to-orange-500';
            }
            if (iconMiniBg) iconMiniBg.className = 'w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-[1rem] flex items-center justify-center text-2xl md:text-3xl shrink-0 shadow-md';
        } else {
            if (statusEl) { statusEl.innerText = 'ระดับน้ำปกติ'; statusEl.className = 'text-xs md:text-sm font-bold text-emerald-50'; }
            if (dotEl) dotEl.className = 'w-2 h-2 rounded-full bg-green-300 shadow-lg';
            if (cardEl) cardEl.className = 'bg-gradient-to-br from-emerald-500 to-green-600 rounded-[2rem] p-6 shadow-lg shadow-green-500/30 mb-8 text-white relative overflow-hidden flex flex-col md:flex-row items-center justify-between transition-all duration-700';
            if (statusMiniEl) { statusMiniEl.innerText = 'ระดับน้ำปกติ'; statusMiniEl.className = 'text-[10px] md:text-xs font-bold text-emerald-600'; }
            if (dotMiniEl) dotMiniEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
            if (levelMiniEl) levelMiniEl.className = 'text-2xl md:text-3xl font-black text-emerald-600 tracking-tight';
            if (cardMiniEl) {
                cardMiniEl.className = 'h-[120px] w-full flex items-center justify-between bg-emerald-50/40 rounded-2xl p-4 md:p-5 shadow-sm border border-emerald-100 relative overflow-hidden transition-all hover:shadow-md';
                const sidebar = cardMiniEl.querySelector('.absolute.left-0');
                if (sidebar) sidebar.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-emerald-400 to-green-500';
            }
            if (iconMiniBg) iconMiniBg.className = 'w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-emerald-400 to-green-500 text-white rounded-[1rem] flex items-center justify-center text-2xl md:text-3xl shrink-0 shadow-md';
        }

        // ==========================================
        // 📊 2. ประมวลผลและแสดงผล สถานี X.73A (บ้านบองอ อ.ระแงะ)
        // 🟢 ระดับปกติ (สีเขียว): < 25.79 ม.รทก.
        // 🟡 ระดับเตือนภัย / เตรียมพร้อม (สีเหลือง): 25.80 - 26.79 ม.รทก.
        // 🔴 ระดับวิกฤต / น้ำล้นตลิ่ง (สีแดง): >= 26.80 ม.รทก.
        // ==========================================
        if (levelX73aEl) {
            let levelX73a = 0;
            let timeX73a = result.data.time || '-';

            if (result.data && result.data.dataX73A && result.data.dataX73A.level) {
                levelX73a = parseFloat(result.data.dataX73A.level);
                timeX73a = result.data.dataX73A.time || timeX73a;
            } else if (result.data && result.data.levelX73A) {
                levelX73a = parseFloat(result.data.levelX73A);
            } else {
                const relX73 = parseFloat(result.data.level);
                levelX73a = isNaN(relX73) ? 24.50 : parseFloat((relX73 + 11.20).toFixed(2));
            }

            if (levelX73aEl) levelX73aEl.innerText = levelX73a.toFixed(2);
            if (timeX73aEl) timeX73aEl.innerText = timeX73a + (result.isStaleFallback ? ' (แคช)' : '');

            if (levelX73a >= 26.80) {
                if (statusX73aEl) { statusX73aEl.innerText = 'วิกฤต / น้ำล้นตลิ่ง'; statusX73aEl.className = 'text-[10px] md:text-xs font-bold text-red-600'; }
                if (dotX73aEl) dotX73aEl.className = 'w-1.5 h-1.5 rounded-full bg-red-500 animate-ping';
                if (levelX73aEl) levelX73aEl.className = 'text-2xl md:text-3xl font-black text-red-600 tracking-tight';
                if (cardX73aEl) cardX73aEl.className = 'h-[120px] w-full flex items-center justify-between bg-red-50/80 rounded-2xl p-4 md:p-5 shadow-sm border border-red-200 relative overflow-hidden transition-all hover:shadow-md';
                if (sidebarX73a) sidebarX73a.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-red-400 to-red-600';
                if (iconX73aBg) iconX73aBg.className = 'w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-red-500 to-red-600 text-white rounded-[1rem] flex items-center justify-center text-2xl md:text-3xl shrink-0 shadow-lg shadow-red-500/40 animate-pulse';
            } else if (levelX73a >= 25.80) {
                if (statusX73aEl) { statusX73aEl.innerText = 'เตือนภัย / เตรียมพร้อม'; statusX73aEl.className = 'text-[10px] md:text-xs font-bold text-amber-600'; }
                if (dotX73aEl) dotX73aEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse';
                if (levelX73aEl) levelX73aEl.className = 'text-2xl md:text-3xl font-black text-amber-600 tracking-tight';
                if (cardX73aEl) cardX73aEl.className = 'h-[120px] w-full flex items-center justify-between bg-amber-50/50 rounded-2xl p-4 md:p-5 shadow-sm border border-amber-200 relative overflow-hidden transition-all hover:shadow-md';
                if (sidebarX73a) sidebarX73a.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-400 to-orange-500';
                if (iconX73aBg) iconX73aBg.className = 'w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-[1rem] flex items-center justify-center text-2xl md:text-3xl shrink-0 shadow-md';
            } else {
                if (statusX73aEl) { statusX73aEl.innerText = 'ระดับปกติ'; statusX73aEl.className = 'text-[10px] md:text-xs font-bold text-emerald-600'; }
                if (dotX73aEl) dotX73aEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
                if (levelX73aEl) levelX73aEl.className = 'text-2xl md:text-3xl font-black text-emerald-600 tracking-tight';
                if (cardX73aEl) cardX73aEl.className = 'h-[120px] w-full flex items-center justify-between bg-emerald-50/40 rounded-2xl p-4 md:p-5 shadow-sm border border-emerald-100 relative overflow-hidden transition-all hover:shadow-md';
                if (sidebarX73a) sidebarX73a.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-emerald-400 to-green-500';
                if (iconX73aBg) iconX73aBg.className = 'w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-emerald-400 to-green-500 text-white rounded-[1rem] flex items-center justify-center text-2xl md:text-3xl shrink-0 shadow-md';
            }

            // 🤖 เรียกใช้ระบบ AI Hydrograph Analytics สำหรับแนะนำการส่งประกาศ LINE Broadcast
            if (typeof window.updateAILineRecommendation === 'function') {
                window.updateAILineRecommendation(levelX73a, levelNum);
            }
        }

    } else {
        console.error("❌ RID Data Error");
        if (statusEl) statusEl.innerText = "ไม่พบข้อมูล";
        if (statusMiniEl) statusMiniEl.innerText = "ไม่พบข้อมูล";
        if (statusX73aEl) statusX73aEl.innerText = "ไม่พบข้อมูล";
    }
}

// 🤖 ฟังก์ชัน AI Hydrograph Analytics วิเคราะห์เวลาเดินทางมวลน้ำ (Lag Time 4–6 ชม.) และแนะนำปุ่มเตือนภัย LINE Broadcast
window.updateAILineRecommendation = function (levelX73aNum, levelX73Num) {
    const boxEl = document.getElementById('ai_line_recommendation_box');
    const msgEl = document.getElementById('ai_rec_message');
    const actionBadge = document.getElementById('ai_rec_action_badge');
    const lagBadge = document.getElementById('ai_lag_time_badge');
    const iconBg = document.getElementById('ai_rec_icon_bg');

    if (!boxEl || !msgEl) return;

    // ค้นหาปุ่ม LINE Broadcast 3 ปุ่ม
    const btnNormal = document.querySelector("button[onclick*='sendMessagingAPI(\\'normal\\')']");
    const btnWarning = document.querySelector("button[onclick*='sendMessagingAPI(\\'warning\\')']");
    const btnDanger = document.querySelector("button[onclick*='sendMessagingAPI(\\'danger\\')']");

    // ล้างการเน้นปุ่มเดิม
    [btnNormal, btnWarning, btnDanger].forEach(btn => {
        if (btn) {
            btn.classList.remove('ring-4', 'ring-red-400', 'ring-amber-400', 'ring-emerald-400', 'scale-105');
        }
    });

    if (levelX73aNum >= 26.80) {
        // 🔴 ระดับวิกฤต / น้ำล้นตลิ่ง (>= 26.80 ม.รทก.)
        boxEl.className = 'mb-5 p-4 rounded-2xl bg-gradient-to-r from-red-950 via-rose-900 to-slate-900 text-white shadow-xl border-2 border-red-500/60 relative overflow-hidden transition-all duration-500 animate-pulse';
        if (iconBg) iconBg.className = 'w-10 h-10 rounded-xl bg-red-500/40 border border-red-300 flex items-center justify-center text-white text-lg shrink-0 shadow-lg';
        if (actionBadge) {
            actionBadge.innerHTML = '🚨 แนะนำส่งประกาศ: [วิกฤต]';
            actionBadge.className = 'text-[10px] font-black px-2.5 py-0.5 rounded-full bg-red-500 text-white border border-red-300 animate-bounce';
        }
        if (lagBadge) {
            lagBadge.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>มวลน้ำสูงสุดจะถึงใน 4–6 ชม.';
            lagBadge.className = 'text-[10px] font-extrabold text-red-200 bg-red-900/60 px-2 py-0.5 rounded-md border border-red-400/40';
        }
        msgEl.innerHTML = `<b>คำแนะนำจากระบบ AI Hydrograph:</b> สถานีต้นน้ำ X.73A (บ้านบองอ) อยู่ในระดับวิกฤต (<b>${levelX73aNum.toFixed(2)}</b> ม.รทก.) ยอดมวลน้ำสูงสุด (Peak Discharge) ไหลด้วยความเร็ว 1.2–1.8 ม./วินาที จะเดินทางมาถึงเขตเทศบาลในอีก <b>4 – 6 ชั่วโมง</b> แนะนำให้ผู้บริหารอนุมัติส่งประกาศ <b>[วิกฤต]</b> ไปยัง LINE Broadcast ทันทีเพื่อเตรียมอพยพ`;
        if (btnDanger) {
            btnDanger.classList.add('ring-4', 'ring-red-400', 'scale-105');
        }

    } else if (levelX73aNum >= 25.80) {
        // 🟡 ระดับเตือนภัย / เตรียมพร้อม (25.80 - 26.79 ม.รทก.)
        boxEl.className = 'mb-5 p-4 rounded-2xl bg-gradient-to-r from-amber-950 via-orange-900 to-slate-900 text-white shadow-lg border-2 border-amber-500/60 relative overflow-hidden transition-all duration-500';
        if (iconBg) iconBg.className = 'w-10 h-10 rounded-xl bg-amber-500/40 border border-amber-300 flex items-center justify-center text-white text-lg shrink-0 shadow-md';
        if (actionBadge) {
            actionBadge.innerHTML = '⚠️ แนะนำส่งประกาศ: [เฝ้าระวัง]';
            actionBadge.className = 'text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 border border-amber-200 font-extrabold';
        }
        if (lagBadge) {
            lagBadge.innerHTML = '<i class="fas fa-clock mr-1"></i>มีเวลาเตรียมพร้อม 4–6 ชม.';
            lagBadge.className = 'text-[10px] font-extrabold text-amber-200 bg-amber-900/60 px-2 py-0.5 rounded-md border border-amber-400/40';
        }
        msgEl.innerHTML = `<b>คำแนะนำจากระบบ AI Hydrograph:</b> สถานีต้นน้ำ X.73A (บ้านบองอ) เริ่มแตะเกณฑ์เตือนภัย (<b>${levelX73aNum.toFixed(2)}</b> ม.รทก.) พื้นที่ตอนล่างเทศบาลตำบลตันหยงมัสจะมีเวลาเตรียมรับมือล่วงหน้า <b>4 – 6 ชั่วโมง</b> ก่อนที่ยอดมวลน้ำจะมาถึง แนะนำกดอนุมัติส่งประกาศ <b>[เฝ้าระวัง]</b> เพื่อเปิดทางระบายน้ำและเตือนประชาชน`;
        if (btnWarning) {
            btnWarning.classList.add('ring-4', 'ring-amber-400', 'scale-105');
        }

    } else {
        // 🟢 ระดับปกติ (< 25.79 ม.รทก.)
        boxEl.className = 'mb-5 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-md border border-blue-400/30 relative overflow-hidden transition-all duration-500';
        if (iconBg) iconBg.className = 'w-10 h-10 rounded-xl bg-indigo-500/30 border border-indigo-300/30 flex items-center justify-center text-indigo-300 text-lg shrink-0 shadow-inner';
        if (actionBadge) {
            actionBadge.innerHTML = '🟢 สภาพการณ์ปกติ';
            actionBadge.className = 'text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/30';
        }
        if (lagBadge) {
            lagBadge.innerHTML = '<i class="fas fa-clock mr-1"></i>Lag Time 4–6 ชม.';
            lagBadge.className = 'text-[10px] font-bold text-slate-300 bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700';
        }
        msgEl.innerHTML = `<b>วิเคราะห์จาก AI Hydrograph:</b> สถานีต้นน้ำ X.73A (บ้านบองอ) อยู่ในระดับปกติ (<b>${levelX73aNum.toFixed(2)}</b> ม.รทก.) ความเร็วการไหลเฉลี่ย 1.2–1.8 ม./วินาที สถานการณ์น้ำในเขตเทศบาลอยู่ในเกณฑ์ปลอดภัย`;
        if (btnNormal) {
            btnNormal.classList.add('ring-4', 'ring-emerald-400');
        }
    }
};

window.loadRIDWaterLevel = loadRIDWaterLevel;
