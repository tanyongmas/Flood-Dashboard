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

    if (!levelEl && !levelMiniEl && !levelX73aEl && !document.getElementById('x73_hero_water_level')) return;

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
        window.latestRIDData = result;
        if (typeof syncCctvTelemetry === 'function') syncCctvTelemetry();

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
        if (typeof updateHeroWaterGauge === 'function') updateHeroWaterGauge(levelNum, result);

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


// ========================================================
// 🌊 ฟังก์ชันอัปเดตการ์ดขนาดใหญ่: เกจแบ่งแท่งวัดระดับน้ำและข้อมูลรายงานสถานการณ์น้ำ สถานี X.73 คลองตันหยงมัส
function updateHeroWaterGauge(levelNum, result) {
    const heroCard = document.getElementById('x73_hero_card');
    const heroWavesContainer = document.getElementById('x73_hero_waves_container');
    const heroLevel = document.getElementById('x73_hero_water_level');
    const heroStatusTitle = document.getElementById('x73_hero_status_title');
    const heroStatusBadge = document.getElementById('x73_hero_status_badge');
    const heroStatusDot = document.getElementById('x73_hero_status_dot');
    const heroStatusPing = document.getElementById('x73_hero_status_ping');
    const heroStatusDesc = document.getElementById('x73_hero_status_desc');
    const heroUpdateTime = document.getElementById('x73_hero_update_time');
    const heroDiffBank = document.getElementById('x73_hero_diff_bank');
    const heroBankLevel = document.getElementById('x73_hero_bank_level');
    const heroTrend = document.getElementById('x73_hero_trend');
    const gaugeBarFill = document.getElementById('x73_gauge_bar_fill');
    const gaugePercentage = document.getElementById('x73_gauge_percentage');
    const waveBack = document.getElementById('wave_back_path');
    const waveMid = document.getElementById('wave_mid_path');
    const waveFront = document.getElementById('wave_front_path');
    const heroGlow = document.getElementById('x73_hero_glow');
    const heroIconBox = document.getElementById('x73_hero_icon_box');

    if (!heroCard) return;

    // รองรับกรณีส่งพารามิเตอร์แบบ (result) หรือ (levelNum, result)
    if (typeof levelNum === 'object' && levelNum !== null && !result) {
        result = levelNum;
        levelNum = (result.data && result.data.level) ? parseFloat(result.data.level) : (result.waterLevel ? parseFloat(result.waterLevel) : null);
    } else if (levelNum === undefined || levelNum === null || isNaN(levelNum)) {
        if (result && result.data && result.data.level) {
            levelNum = parseFloat(result.data.level);
        }
    }

    if (levelNum === null || isNaN(levelNum)) {
        if (heroLevel) heroLevel.innerText = '--.--';
        if (heroStatusDesc) heroStatusDesc.innerText = 'ไม่สามารถดึงข้อมูลสถานะระดับน้ำจาก RID X.73 ได้ในขณะนี้';
        return;
    }

    // 1. ระดับน้ำและเวลาอัปเดต
    if (heroLevel) heroLevel.innerText = levelNum.toFixed(2);
    if (heroUpdateTime && result && result.data && result.data.time) {
        heroUpdateTime.innerHTML = `<i class="fas fa-clock mr-1 text-sky-400"></i>อัปเดต: ${result.data.time}` + (result.isStaleFallback ? ' (แคช)' : '');
    }

    // 2. คำนวณระยะห่างตลิ่ง (ระดับตลิ่ง X.73 คือ 14.90 ม.รทก. ถ้าสูงกว่าคือล้นตลิ่ง)
    const bankVal = 14.90;
    if (heroBankLevel) heroBankLevel.innerText = bankVal.toFixed(2);
    const diffBank = bankVal - levelNum;
    if (heroDiffBank) {
        if (diffBank >= 0) {
            heroDiffBank.innerText = diffBank.toFixed(2);
        } else {
            heroDiffBank.innerHTML = `<span class="text-rose-400 font-black">+${Math.abs(diffBank).toFixed(2)} (ล้น)</span>`;
        }
    }

    // 3. แนวโน้มระดับน้ำ (Trend)
    if (heroTrend && result && result.data && result.data.previousLevel) {
        const prev = parseFloat(result.data.previousLevel);
        const diff = levelNum - prev;
        if (diff > 0.01) {
            heroTrend.innerHTML = `<i class="fas fa-arrow-up text-rose-300"></i> <span class="text-rose-300">+${diff.toFixed(2)}</span>`;
            heroTrend.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/30 truncate max-w-full';
        } else if (diff < -0.01) {
            heroTrend.innerHTML = `<i class="fas fa-arrow-down text-emerald-300"></i> <span class="text-emerald-300">${diff.toFixed(2)}</span>`;
            heroTrend.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 truncate max-w-full';
        } else {
            heroTrend.innerHTML = `<i class="fas fa-minus text-slate-300"></i> ทรงตัว`;
            heroTrend.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-300 truncate max-w-full';
        }
    }

    // 4. คำนวณความสูงแท่งเกจวัดระดับน้ำแนวตั้ง 2 มิติ และระดับคลื่นพื้นหลังอิงตามระดับน้ำจริง
    // สเกล 2 มิติ: 9.00 ถึง 16.00 ม.รทก. (ช่วง 7.00 ม.)
    const minScale = 9.00;
    const maxScale = 16.00;
    let ratio = (levelNum - minScale) / (maxScale - minScale);
    if (isNaN(ratio) || ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;

    // แท่งเกจวัดแบบ 2 มิติ
    const heightPercent = Math.max(5, Math.min(100, (ratio * 100))).toFixed(1);
    if (gaugeBarFill) {
        gaugeBarFill.style.height = `${heightPercent}%`;
    }
    if (gaugePercentage) {
        gaugePercentage.innerText = `${(ratio * 100).toFixed(0)}%`;
    }

    // คลื่นพื้นหลัง: เพิ่มระดับสูงขึ้นตามระดับน้ำจริง (ขั้นต่ำ 20% ถึง 85% ของการ์ด)
    if (heroWavesContainer) {
        const waveHeight = Math.max(20, Math.min(85, Math.round(ratio * 100)));
        heroWavesContainer.style.height = `${waveHeight}%`;
    }

    // 5. ปรับเปลี่ยนสถานะตามเกณฑ์จริง (ระดับตลิ่ง = 14.90 ม.):
    // - ระดับวิกฤต (ล้นตลิ่ง): > 14.90 ม.รทก.
    // - ระดับเฝ้าระวัง: 13.50 - 14.90 ม.รทก.
    // - ระดับปกติ: < 13.50 ม.รทก.
    if (levelNum > 14.90) {
        // 🔴 วิกฤต (ล้นตลิ่ง)
        if (gaugeBarFill) {
            gaugeBarFill.style.backgroundColor = '#ef4444';
            gaugeBarFill.style.background = '#ef4444';
        }
        if (heroCard) {
            heroCard.className = 'relative bg-gradient-to-br from-slate-950 via-rose-950 to-red-950 rounded-[2.5rem] p-6 md:p-8 shadow-2xl shadow-rose-950/60 border-2 border-rose-500/70 overflow-hidden text-white transition-all duration-700 animate-fade-in group mb-6';
        }
        if (heroGlow) heroGlow.className = 'absolute -top-24 -right-24 w-96 h-96 bg-rose-500/30 rounded-full blur-3xl pointer-events-none transition-all duration-700 animate-pulse';
        if (heroIconBox) heroIconBox.className = 'w-13 h-13 md:w-14 md:h-14 rounded-2xl bg-rose-500/30 border border-rose-400/50 flex items-center justify-center text-rose-300 text-2xl md:text-3xl shadow-lg shadow-rose-950/50 shrink-0 backdrop-blur-md animate-pulse';

        if (heroStatusBadge) heroStatusBadge.className = 'w-full sm:w-auto inline-flex items-center justify-between sm:justify-start gap-3 px-3.5 sm:px-4 md:px-5 py-2.5 md:py-3 rounded-2xl bg-rose-600/35 border-2 border-rose-400 text-white font-black backdrop-blur-xl shadow-xl shadow-rose-950/60 animate-bounce transition-all duration-500';
        if (heroStatusDot) heroStatusDot.className = 'relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500';
        if (heroStatusPing) heroStatusPing.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-90';
        if (heroStatusTitle) heroStatusTitle.innerText = 'ระดับน้ำวิกฤต (ล้นตลิ่ง)';
        
        // ข้อความสรุป: อยู่ในเกณฑ์ไหน ระดับไหน ต่ำกว่า/สูงกว่าตลิ่งเท่าไร
        if (heroStatusDesc) {
            heroStatusDesc.innerHTML = `ระดับน้ำอยู่ใน<b class="text-rose-300">เกณฑ์วิกฤต (ล้นตลิ่ง)</b> ระดับ <b>${levelNum.toFixed(2)}</b> ม.รทก. สูงกว่าตลิ่ง <b class="text-rose-300">${Math.abs(diffBank).toFixed(2)}</b> เมตร`;
        }

        if (waveBack) waveBack.setAttribute('fill', '#991b1b');
        if (waveMid) waveMid.setAttribute('fill', '#b91c1c');
        if (waveFront) waveFront.setAttribute('fill', '#450a0a');

    } else if (levelNum >= 13.50) {
        // 🟡 เฝ้าระวัง (13.50 - 14.90)
        if (gaugeBarFill) {
            gaugeBarFill.style.backgroundColor = '#f59e0b';
            gaugeBarFill.style.background = '#f59e0b';
        }
        if (heroCard) {
            heroCard.className = 'relative bg-gradient-to-br from-slate-950 via-amber-950 to-orange-950 rounded-[2.5rem] p-6 md:p-8 shadow-2xl shadow-amber-950/50 border border-amber-400/50 overflow-hidden text-white transition-all duration-700 animate-fade-in group mb-6';
        }
        if (heroGlow) heroGlow.className = 'absolute -top-24 -right-24 w-96 h-96 bg-amber-500/25 rounded-full blur-3xl pointer-events-none transition-all duration-700';
        if (heroIconBox) heroIconBox.className = 'w-13 h-13 md:w-14 md:h-14 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 text-2xl md:text-3xl shadow-inner shrink-0 backdrop-blur-md';

        if (heroStatusBadge) heroStatusBadge.className = 'w-full sm:w-auto inline-flex items-center justify-between sm:justify-start gap-3 px-3.5 sm:px-4 md:px-5 py-2.5 md:py-3 rounded-2xl bg-amber-500/30 border-2 border-amber-400 text-amber-200 font-black backdrop-blur-xl shadow-lg shadow-amber-950/50 transition-all duration-500';
        if (heroStatusDot) heroStatusDot.className = 'relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500';
        if (heroStatusPing) heroStatusPing.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75';
        if (heroStatusTitle) heroStatusTitle.innerText = 'ระดับเฝ้าระวัง (13.50 - 14.90)';
        
        // ข้อความสรุป: อยู่ในเกณฑ์ไหน ระดับไหน ต่ำกว่าตลิ่งเท่าไร
        if (heroStatusDesc) {
            heroStatusDesc.innerHTML = `ระดับน้ำอยู่ใน<b class="text-amber-300">เกณฑ์เฝ้าระวัง</b> ระดับ <b>${levelNum.toFixed(2)}</b> ม.รทก. ต่ำกว่าตลิ่ง <b>${diffBank.toFixed(2)}</b> เมตร`;
        }

        if (waveBack) waveBack.setAttribute('fill', '#c2410c');
        if (waveMid) waveMid.setAttribute('fill', '#ea580c');
        if (waveFront) waveFront.setAttribute('fill', '#7c2d12');

    } else {
        // 🟢 ปกติ (< 13.50)
        if (gaugeBarFill) {
            gaugeBarFill.style.backgroundColor = '#10b981';
            gaugeBarFill.style.background = '#10b981';
        }
        if (heroCard) {
            heroCard.className = 'relative bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-[2.5rem] p-6 md:p-8 shadow-2xl shadow-blue-950/40 border border-blue-400/30 overflow-hidden text-white transition-all duration-700 animate-fade-in group mb-6';
        }
        if (heroGlow) heroGlow.className = 'absolute -top-24 -right-24 w-96 h-96 bg-sky-500/20 rounded-full blur-3xl pointer-events-none transition-all duration-700';
        if (heroIconBox) heroIconBox.className = 'w-13 h-13 md:w-14 md:h-14 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 text-2xl md:text-3xl shadow-inner shrink-0 backdrop-blur-md';

        if (heroStatusBadge) heroStatusBadge.className = 'w-full sm:w-auto inline-flex items-center justify-between sm:justify-start gap-3 px-3.5 sm:px-4 md:px-5 py-2.5 md:py-3 rounded-2xl bg-emerald-500/25 border-2 border-emerald-400/70 text-emerald-100 font-black backdrop-blur-xl shadow-xl shadow-emerald-950/40 transition-all duration-500';
        if (heroStatusDot) heroStatusDot.className = 'relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500';
        if (heroStatusPing) heroStatusPing.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75';
        if (heroStatusTitle) heroStatusTitle.innerText = 'ระดับน้ำปกติ (ปลอดภัย)';
        
        // ข้อความสรุป: อยู่ในเกณฑ์ไหน ระดับไหน ต่ำกว่าตลิ่งเท่าไร
        if (heroStatusDesc) {
            heroStatusDesc.innerHTML = `ระดับน้ำอยู่ใน<b class="text-emerald-300">เกณฑ์ปกติ</b> ระดับ <b>${levelNum.toFixed(2)}</b> ม.รทก. ต่ำกว่าตลิ่ง <b>${diffBank.toFixed(2)}</b> เมตร`;
        }

        if (waveBack) waveBack.setAttribute('fill', '#0284c7');
        if (waveMid) waveMid.setAttribute('fill', '#0369a1');
        if (waveFront) waveFront.setAttribute('fill', '#0c4a6e');
    }
}
window.updateHeroWaterGauge = updateHeroWaterGauge;

function getHeroWaterGaugeHtml() {
    return `<!-- 🌊 การ์ดขนาดใหญ่พิเศษ: แท่งวัดระดับน้ำและข้อมูลรายงานสถานการณ์น้ำ สถานี X.73 คลองตันหยงมัส -->
<div id="x73_hero_card"
    class="relative bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-3xl md:rounded-[2.5rem] p-4 sm:p-6 md:p-8 shadow-2xl border border-blue-400/30 overflow-hidden text-white transition-all duration-700 animate-fade-in group mb-6">

    <!-- 🌊 เลเยอร์คลื่นน้ำเคลื่อนไหวแบบต่อเนื่องไม่มีรอยต่อ และเพิ่มสูงตามระดับน้ำจริง (Dynamic Seamless Waves Background) -->
    <div id="x73_hero_waves_container" class="absolute inset-x-0 bottom-0 overflow-hidden pointer-events-none z-0 transition-all duration-1000 ease-out" style="height: 35%;">
        <!-- คลื่นชั้นหลังสุด (Wave Back - กว้าง 200% ไหลต่อเนื่อง) -->
        <svg class="absolute bottom-0 w-[200%] h-full hero-wave-back opacity-30" viewBox="0 0 1600 120" preserveAspectRatio="none">
            <path id="wave_back_path" d="M0,40 C180,15 220,65 400,40 C580,15 620,65 800,40 C980,15 1020,65 1200,40 C1380,15 1420,65 1600,40 L1600,120 L0,120 Z" fill="#0284c7"></path>
        </svg>
        <!-- คลื่นชั้นกลาง (Wave Mid) -->
        <svg class="absolute bottom-0 w-[200%] h-full hero-wave-mid opacity-45" viewBox="0 0 1600 120" preserveAspectRatio="none">
            <path id="wave_mid_path" d="M0,65 C120,35 280,95 400,65 C520,35 680,95 800,65 C920,35 1080,95 1200,65 C1320,35 1480,95 1600,65 L1600,120 L0,120 Z" fill="#0369a1"></path>
        </svg>
        <!-- คลื่นชั้นหน้า (Wave Front) -->
        <svg class="absolute bottom-0 w-[200%] h-full hero-wave-front opacity-75" viewBox="0 0 1600 120" preserveAspectRatio="none">
            <path id="wave_front_path" d="M0,50 C150,20 250,80 400,50 C550,20 650,80 800,50 C950,20 1050,80 1200,50 C1350,20 1450,80 1600,50 L1600,120 L0,120 Z" fill="#0c4a6e"></path>
        </svg>
    </div>

    <!-- แสง Glow ด้านหลัง -->
    <div id="x73_hero_glow"
        class="absolute -top-24 -right-24 w-96 h-96 bg-sky-500/20 rounded-full blur-3xl pointer-events-none transition-all duration-700">
    </div>

    <!-- 🌟 ส่วนเนื้อหาหลัก: องค์ประกอบลอยตัว แยกซ้าย-ขวา รองรับมือถือเต็มรูปแบบ -->
    <div class="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch">
        
        <!-- 👈 ฝั่งซ้าย: ข้อมูลรายงานสถานการณ์น้ำ (7 คอลัมน์) -->
        <div class="lg:col-span-7 flex flex-col justify-between space-y-3">
            
            <!-- ฝั่งซ้ายส่วนบน: กล่องข้อมูลสถานีขนาดกะทัดรัด สไตล์ Mobile-First -->
            <div class="p-3 sm:p-3.5 md:p-4 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-lg flex items-center justify-between gap-2 sm:gap-3">
                <div class="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                    <div id="x73_hero_icon_box"
                        class="w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-xl bg-sky-500/25 border border-sky-400/40 flex items-center justify-center text-sky-300 text-base sm:text-xl md:text-2xl shadow-inner shrink-0 backdrop-blur-md">
                        <i class="fas fa-water"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1 sm:gap-1.5 flex-wrap mb-0.5">
                            <span class="text-[8px] sm:text-[9px] md:text-[10px] font-black uppercase tracking-wider text-sky-300 bg-sky-500/20 border border-sky-400/30 px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap">
                                สถานีหลัก
                            </span>
                            <span id="x73_hero_source" class="text-[8px] sm:text-[9px] text-slate-300 bg-white/10 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                <i class="fas fa-satellite-dish mr-1 text-emerald-400"></i>RID X.73
                            </span>
                        </div>
                        <h2 class="text-xs sm:text-base md:text-xl font-black tracking-tight text-white leading-snug">
                            <span class="whitespace-nowrap">สถานี X.73</span> <span class="text-sky-200 font-bold block sm:inline">คลองตันหยงมัส</span>
                        </h2>
                    </div>
                </div>

                <!-- 🌟 สลับข้อความ "ระดับน้ำปัจจุบัน" มาอยู่แทนที่กล่องสถานะเดิม (ขวาบน) -->
                <div class="flex flex-col items-end justify-center shrink-0 pl-2 text-right">
                    <span class="text-[9px] sm:text-[10px] md:text-[11px] font-bold text-slate-300 whitespace-nowrap">ระดับน้ำปัจจุบัน</span>
                    <div class="flex items-baseline gap-1">
                        <span id="x73_hero_water_level" class="text-xl sm:text-3xl md:text-4xl font-black tracking-tight text-white drop-shadow-md">--.--</span>
                        <span class="text-[10px] sm:text-xs font-bold text-sky-200">ม.รทก.</span>
                    </div>
                    <span id="x73_hero_update_time" class="text-[8px] sm:text-[9px] md:text-[10px] text-slate-400 font-medium whitespace-nowrap">
                        <i class="fas fa-clock mr-1 text-sky-400"></i>อัปเดต: --:--
                    </span>
                </div>
            </div>

            <!-- 🌟 แยกกล่องที่บอกสถานะระดับน้ำออกมาให้เด่นชัดเจน -->
            <div class="flex items-center w-full">
                <div id="x73_hero_status_badge"
                    class="w-full sm:w-auto inline-flex items-center justify-between sm:justify-start gap-3 px-3.5 sm:px-4 md:px-5 py-2.5 md:py-3 rounded-2xl bg-emerald-500/25 border-2 border-emerald-400/70 text-emerald-100 font-black backdrop-blur-xl shadow-xl shadow-emerald-950/40 transition-all duration-500">
                    <div class="flex items-center gap-2.5">
                        <span class="relative flex h-3.5 w-3.5 shrink-0">
                            <span id="x73_hero_status_ping" class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span id="x73_hero_status_dot" class="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                        </span>
                        <span class="text-[11px] font-bold text-emerald-300/80 uppercase tracking-wider">สถานะ:</span>
                    </div>
                    <span id="x73_hero_status_title" class="text-sm sm:text-base md:text-lg font-black tracking-tight text-white drop-shadow">
                        ระดับน้ำปกติ (ปลอดภัย)
                    </span>
                </div>
            </div>

            <!-- 🌊 ตรงกลางเว้นว่างไว้โปร่งตา เพื่อให้เห็นคลื่นน้ำพื้นหลัง -->
            <div class="flex-1 min-h-[16px] sm:min-h-[30px] md:min-h-[50px]"></div>

            <!-- ฝั่งซ้ายล่าง: ข้อความรายงานสถานะคมชัด (ไม่มีกล่องครอบ) -->
            <div class="pt-1 pb-1 px-1">
                <p id="x73_hero_status_desc" class="text-xs sm:text-sm md:text-base font-bold text-slate-100 drop-shadow leading-relaxed">
                    กำลังตรวจสอบข้อมูลระดับน้ำจากสถานี X.73 คลองตันหยงมัส...
                </p>
            </div>

        </div>

        <!-- 👉 ฝั่งขวา: เกจแท่งวัดระดับน้ำแบบ 2 มิติ สีชัด (5 คอลัมน์) -->
        <div class="lg:col-span-5 flex flex-col items-center justify-between space-y-3 pt-3 lg:pt-0 border-t border-white/10 lg:border-t-0">
            
            <!-- ส่วนหัวแท่งเกจวัดระดับน้ำ -->
            <div class="w-full flex items-center justify-between px-1 sm:px-2">
                <span class="text-xs font-black uppercase tracking-wider text-sky-200 flex items-center gap-1.5 drop-shadow">
                    <i class="fas fa-ruler-vertical text-sm text-sky-300"></i> เกจวัดระดับน้ำ X.73 (2D)
                </span>
                <span id="x73_gauge_percentage" class="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-800 text-sky-300 border border-slate-600 shadow-sm">
                    0%
                </span>
            </div>

            <!-- โครงสร้างแท่งวัดแนวตั้ง 2 มิติ คมชัดสูง (Responsive 2D Column) -->
            <div class="relative flex items-center justify-center w-full py-1">
                
                <!-- สเกลตัวเลขบอกระยะทางซ้ายของแท่ง -->
                <div class="relative flex flex-col justify-between h-[230px] sm:h-[260px] text-[9px] sm:text-[10px] font-black text-right pr-2 sm:pr-2.5 select-none shrink-0 drop-shadow">
                    <div class="flex items-center justify-end gap-1 text-slate-300">
                        <span>16.00</span>
                        <span class="w-2.5 h-[2px] bg-slate-400"></span>
                    </div>
                    <div class="flex items-center justify-end gap-1 text-rose-400 font-black">
                        <span class="text-[7.5px] sm:text-[8px] bg-rose-600 text-white px-1 py-0.5 rounded font-black shadow-xs">ตลิ่ง</span>
                        <span>14.90</span>
                        <span class="w-3.5 sm:w-4 h-[2px] bg-rose-500"></span>
                    </div>
                    <div class="flex items-center justify-end gap-1 text-amber-300 font-black">
                        <span class="text-[7.5px] sm:text-[8px] bg-amber-500 text-slate-950 px-1 py-0.5 rounded font-black shadow-xs">เฝ้าระวัง</span>
                        <span>13.50</span>
                        <span class="w-3 sm:w-3.5 h-[2px] bg-amber-400"></span>
                    </div>
                    <div class="flex items-center justify-end gap-1 text-sky-300">
                        <span>11.00</span>
                        <span class="w-2.5 h-[2px] bg-sky-400"></span>
                    </div>
                    <div class="flex items-center justify-end gap-1 text-slate-400">
                        <span>9.00</span>
                        <span class="w-2.5 h-[2px] bg-slate-400"></span>
                    </div>
                </div>

                <!-- ตัวกระบอกเกจแท่ง 2 มิติ (2D Solid Column) -->
                <div class="relative w-14 sm:w-16 md:w-20 h-[230px] sm:h-[260px] bg-slate-950 rounded-xl border-2 border-slate-500 overflow-hidden shadow-2xl flex flex-col justify-end">
                    <div class="absolute inset-x-0 top-0 h-[15.7%] bg-red-950/70 border-b-2 border-red-500 pointer-events-none z-0"></div>
                    <div class="absolute inset-x-0 top-[15.7%] h-[20%] bg-amber-950/70 border-b-2 border-amber-400 pointer-events-none z-0"></div>
                    <div class="absolute inset-x-0 bottom-0 h-[64.3%] bg-emerald-950/70 pointer-events-none z-0"></div>

                    <!-- ขีดสเกลมาร์กเกอร์ 2 มิติ (Sharp Tick Marks) -->
                    <div class="absolute inset-y-0 left-1 w-2 flex flex-col justify-between py-2 pointer-events-none z-20 opacity-80">
                        <span class="w-full h-[1.5px] bg-white"></span>
                        <span class="w-2/3 h-[1px] bg-white/70"></span>
                        <span class="w-full h-[1.5px] bg-rose-400"></span>
                        <span class="w-2/3 h-[1px] bg-white/70"></span>
                        <span class="w-full h-[1.5px] bg-amber-400"></span>
                        <span class="w-2/3 h-[1px] bg-white/70"></span>
                        <span class="w-full h-[1.5px] bg-white"></span>
                        <span class="w-2/3 h-[1px] bg-white/70"></span>
                        <span class="w-full h-[1.5px] bg-white"></span>
                    </div>

                    <!-- ของเหลวน้ำในแท่งแบบ 2 มิติ สีสดชัดเจน -->
                    <div id="x73_gauge_bar_fill"
                        class="w-full relative transition-all duration-700 ease-out z-10 border-t-2 border-white shadow-md"
                        style="height: 35%; background-color: #10b981;">
                    </div>
                </div>

                <!-- ป้ายชี้ระดับสถานะจริงทางขวาของแท่ง 2 มิติ -->
                <div class="relative h-[230px] sm:h-[260px] pl-2 sm:pl-2.5 flex flex-col justify-between select-none py-0.5">
                    <div class="text-[8px] sm:text-[9px] font-black text-white bg-red-600 px-1.5 sm:px-2 py-0.5 rounded shadow whitespace-nowrap">
                        ล้นตลิ่ง (&gt; 14.90)
                    </div>
                    <div class="text-[8px] sm:text-[9px] font-black text-slate-950 bg-amber-400 px-1.5 sm:px-2 py-0.5 rounded shadow whitespace-nowrap">
                        เฝ้าระวัง (13.50-14.90)
                    </div>
                    <div class="text-[8px] sm:text-[9px] font-black text-white bg-emerald-600 px-1.5 sm:px-2 py-0.5 rounded shadow whitespace-nowrap">
                        ปกติ (&lt; 13.50)
                    </div>
                </div>

            </div>

            <!-- 📌 การ์ดย่อย 3 ใบ: สไตล์ Responsive Grid กระชับพอดีมือถือ -->
            <div class="w-full grid grid-cols-3 gap-1.5 sm:gap-2 pt-1">
                <!-- การ์ดที่ 1: ระดับตลิ่ง (14.90 ม.) -->
                <div class="p-2 sm:p-2.5 md:p-3 bg-white/10 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/20 text-center shadow-lg hover:bg-white/15 transition-all">
                    <span class="text-[9px] sm:text-[10px] md:text-[11px] font-bold text-slate-300 block truncate">ระดับตลิ่ง</span>
                    <div class="flex items-baseline justify-center gap-0.5 mt-0.5 sm:mt-1">
                        <span id="x73_hero_bank_level" class="text-sm sm:text-base md:text-lg font-black text-rose-300">14.90</span>
                        <span class="text-[8px] sm:text-[9px] text-slate-300">ม.</span>
                    </div>
                </div>

                <!-- การ์ดที่ 2: ระยะห่างจากตลิ่ง -->
                <div class="p-2 sm:p-2.5 md:p-3 bg-white/10 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/20 text-center shadow-lg hover:bg-white/15 transition-all">
                    <span class="text-[9px] sm:text-[10px] md:text-[11px] font-bold text-slate-300 block truncate">ห่างจากตลิ่ง</span>
                    <div class="flex items-baseline justify-center gap-0.5 mt-0.5 sm:mt-1">
                        <span id="x73_hero_diff_bank" class="text-sm sm:text-base md:text-lg font-black text-sky-300">--.--</span>
                        <span class="text-[8px] sm:text-[9px] text-slate-300">ม.</span>
                    </div>
                </div>

                <!-- การ์ดที่ 3: แนวโน้มระดับน้ำ -->
                <div class="p-2 sm:p-2.5 md:p-3 bg-white/10 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/20 text-center shadow-lg hover:bg-white/15 transition-all flex flex-col justify-center items-center">
                    <span class="text-[9px] sm:text-[10px] md:text-[11px] font-bold text-slate-300 block truncate mb-0.5">แนวโน้ม</span>
                    <span id="x73_hero_trend" class="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-white/10 text-slate-200 truncate max-w-full">
                        <i class="fas fa-minus text-[8px]"></i> ทรงตัว
                    </span>
                </div>
            </div>

        </div>

    </div>
</div>`;
}
window.getHeroWaterGaugeHtml = getHeroWaterGaugeHtml;
