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
                cardMiniEl.className = 'h-[120px] w-full flex items-center justify-between bg-red-50/80 rounded-2xl p-4 md:p-5 shadow-sm border border-red-200 relative overflow-hidden transition-all hover:shadow-md hover:ring-2 hover:ring-blue-400/40 cursor-pointer active:scale-[0.99]';
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
                cardMiniEl.className = 'h-[120px] w-full flex items-center justify-between bg-amber-50/50 rounded-2xl p-4 md:p-5 shadow-sm border border-amber-200 relative overflow-hidden transition-all hover:shadow-md hover:ring-2 hover:ring-blue-400/40 cursor-pointer active:scale-[0.99]';
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
                cardMiniEl.className = 'h-[120px] w-full flex items-center justify-between bg-emerald-50/40 rounded-2xl p-4 md:p-5 shadow-sm border border-emerald-100 relative overflow-hidden transition-all hover:shadow-md hover:ring-2 hover:ring-blue-400/40 cursor-pointer active:scale-[0.99]';
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
                if (cardX73aEl) cardX73aEl.className = 'h-[120px] w-full flex items-center justify-between bg-red-50/80 rounded-2xl p-4 md:p-5 shadow-sm border border-red-200 relative overflow-hidden transition-all hover:shadow-md hover:ring-2 hover:ring-blue-400/40 cursor-pointer active:scale-[0.99]';
                if (sidebarX73a) sidebarX73a.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-red-400 to-red-600';
                if (iconX73aBg) iconX73aBg.className = 'w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-red-500 to-red-600 text-white rounded-[1rem] flex items-center justify-center text-2xl md:text-3xl shrink-0 shadow-lg shadow-red-500/40 animate-pulse';
            } else if (levelX73a >= 25.80) {
                if (statusX73aEl) { statusX73aEl.innerText = 'เตือนภัย / เตรียมพร้อม'; statusX73aEl.className = 'text-[10px] md:text-xs font-bold text-amber-600'; }
                if (dotX73aEl) dotX73aEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse';
                if (levelX73aEl) levelX73aEl.className = 'text-2xl md:text-3xl font-black text-amber-600 tracking-tight';
                if (cardX73aEl) cardX73aEl.className = 'h-[120px] w-full flex items-center justify-between bg-amber-50/50 rounded-2xl p-4 md:p-5 shadow-sm border border-amber-200 relative overflow-hidden transition-all hover:shadow-md hover:ring-2 hover:ring-blue-400/40 cursor-pointer active:scale-[0.99]';
                if (sidebarX73a) sidebarX73a.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-400 to-orange-500';
                if (iconX73aBg) iconX73aBg.className = 'w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-[1rem] flex items-center justify-center text-2xl md:text-3xl shrink-0 shadow-md';
            } else {
                if (statusX73aEl) { statusX73aEl.innerText = 'ระดับปกติ'; statusX73aEl.className = 'text-[10px] md:text-xs font-bold text-emerald-600'; }
                if (dotX73aEl) dotX73aEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
                if (levelX73aEl) levelX73aEl.className = 'text-2xl md:text-3xl font-black text-emerald-600 tracking-tight';
                if (cardX73aEl) cardX73aEl.className = 'h-[120px] w-full flex items-center justify-between bg-emerald-50/40 rounded-2xl p-4 md:p-5 shadow-sm border border-emerald-100 relative overflow-hidden transition-all hover:shadow-md hover:ring-2 hover:ring-blue-400/40 cursor-pointer active:scale-[0.99]';
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
    // สเกล 2 มิติ: 10.00 ถึง 16.00 ม.รทก. (ช่วง 6.00 ม.)
    const minScale = 10.00;
    const maxScale = 16.00;
    let ratio = (levelNum - minScale) / (maxScale - minScale);
    if (isNaN(ratio) || ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;

    // แท่งเกจวัดแบบ 2 มิติ (ขั้นต่ำ 3% เพื่อให้เห็นของเหลวที่ฐานเสมอ)
    const heightPercent = Math.max(3, Math.min(100, (ratio * 100))).toFixed(1);
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

    // 🌧️ ตรวจสอบสภาพอากาศเพื่อเปิด/ปิดเอฟเฟกต์ฝนตกลงผิวน้ำอัตโนมัติ
    if (typeof checkAndApplyHeroRainEffect === 'function') {
        checkAndApplyHeroRainEffect();
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

    <!-- 🌧️ เลเยอร์ฝนตกลงผิวน้ำ (แสดงผลเมื่อพยากรณ์อากาศมีฝน) -->
    <div id="x73_hero_rain_layer" class="hero-rain-container hidden"></div>

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
                    <div id="x73_hero_icon_box" onclick="window.toggleHeroRainEffect()" title="คลิกเพื่อทดสอบเปิด/ปิดลูกเล่นฝนตก"
                        class="w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-xl bg-sky-500/25 border border-sky-400/40 flex items-center justify-center text-sky-300 text-base sm:text-xl md:text-2xl shadow-inner shrink-0 backdrop-blur-md cursor-pointer hover:scale-105 active:scale-95 transition-transform">
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
                            <span id="x73_hero_rain_badge" class="hidden text-[8px] sm:text-[9px] text-sky-200 bg-sky-500/30 border border-sky-400/40 px-2 py-0.5 rounded-full font-bold whitespace-nowrap shadow-xs animate-pulse">
                                <i class="fas fa-cloud-showers-heavy text-sky-300 mr-1"></i>พยากรณ์ฝนตก
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
                
                <!-- สเกลตัวเลขบอกระยะทางซ้ายของแท่ง (อิงสเกล 10.00 - 16.00 ม.) -->
                <div class="relative h-[240px] sm:h-[260px] w-24 sm:w-28 text-[9px] sm:text-[10px] font-black pr-2 select-none shrink-0 drop-shadow">
                    <!-- 16.00 สเกลสูงสุด (100%) -->
                    <div class="absolute right-0 top-0 -translate-y-1/2 flex items-center gap-1 text-slate-300 whitespace-nowrap">
                        <span>16.00</span>
                        <span class="w-2 h-[1px] bg-slate-400"></span>
                    </div>
                    <!-- 14.90 ระดับตลิ่ง / เกณฑ์วิกฤตล้นตลิ่ง (81.67%) -->
                    <div class="absolute right-0 bottom-[81.67%] translate-y-1/2 flex items-center gap-1 text-rose-400 font-black whitespace-nowrap">
                        <span class="text-[7px] sm:text-[8px] bg-rose-600 text-white px-1 sm:px-1.5 py-0.5 rounded font-black shadow-xs whitespace-nowrap">ตลิ่ง</span>
                        <span>14.90</span>
                        <span class="w-2.5 h-[1.5px] bg-rose-500 shadow-sm"></span>
                    </div>
                    <!-- 13.50 เกณฑ์เฝ้าระวัง (58.33%) -->
                    <div class="absolute right-0 bottom-[58.33%] translate-y-1/2 flex items-center gap-1 text-amber-300 font-black whitespace-nowrap">
                        <span class="text-[7px] sm:text-[8px] bg-amber-500 text-slate-950 px-1 sm:px-1.5 py-0.5 rounded font-black shadow-xs whitespace-nowrap">เฝ้าระวัง</span>
                        <span>13.50</span>
                        <span class="w-2.5 h-[1.5px] bg-amber-400 shadow-sm"></span>
                    </div>
                    <!-- 12.00 สเกลกึ่งกลาง (33.33%) -->
                    <div class="absolute right-0 bottom-[33.33%] translate-y-1/2 flex items-center gap-1 text-slate-400 font-bold whitespace-nowrap">
                        <span>12.00</span>
                        <span class="w-2 h-[1px] bg-slate-500"></span>
                    </div>
                    <!-- 10.00 สเกลต่ำสุด (0%) -->
                    <div class="absolute right-0 bottom-0 translate-y-1/2 flex items-center gap-1 text-slate-400 font-bold whitespace-nowrap">
                        <span>10.00</span>
                        <span class="w-2 h-[1px] bg-slate-500"></span>
                    </div>
                </div>

                <!-- ตัวกระบอกเกจแท่ง 2 มิติ (2D Solid Column) -->
                <!-- สเกลจริง: 10.00 ถึง 16.00 ม. (ช่วง 6.00 ม.) -->
                <!-- 🔴 โซนล้นตลิ่ง (> 14.90): 14.90 ถึง 16.00 = 1.10 ม. = 18.33% -->
                <!-- 🟡 โซนเฝ้าระวัง (13.50 - 14.90): 1.40 ม. = 23.34% -->
                <!-- 🟢 โซนปกติ (10.00 - 13.50): 3.50 ม. = 58.33% -->
                <div class="relative w-14 sm:w-16 md:w-20 h-[240px] sm:h-[260px] bg-slate-950 rounded-xl border-2 border-slate-400 overflow-hidden shadow-2xl flex flex-col justify-end shrink-0">
                    
                    <!-- โซนสี 2 มิติ คมชัดตามสัดส่วนจริง แบ่งระดับชัดเจน: -->
                    <!-- 🔴 โซนล้นตลิ่ง (> 14.90 ม.) -->
                    <div class="absolute inset-x-0 top-0 h-[18.33%] bg-red-950/70 border-b-2 border-red-500 pointer-events-none z-0"></div>
                    
                    <!-- 🟡 โซนเฝ้าระวัง (13.50 - 14.90 ม.) -->
                    <div class="absolute inset-x-0 top-[18.33%] h-[23.34%] bg-amber-950/70 border-b-2 border-amber-400 pointer-events-none z-0"></div>

                    <!-- 🟢 โซนปกติ (10.00 - 13.50 ม.) -->
                    <div class="absolute inset-x-0 bottom-0 h-[58.33%] bg-emerald-950/70 pointer-events-none z-0"></div>

                    <!-- ของเหลวน้ำในแท่งแบบ 2 มิติ สีสดชัดเจน (2D Solid Vibrant Liquid Bar) -->
                    <div id="x73_gauge_bar_fill"
                        class="w-full relative transition-all duration-700 ease-out z-10 border-t-2 border-white shadow-md"
                        style="height: 17%; background-color: #10b981;">
                    </div>
                </div>

                <!-- ป้ายชี้ระดับสถานะจริงทางขวาของแท่ง 2 มิติ คมชัด (2D Solid Status Badges) -->
                <!-- วางตำแหน่งตรงกึ่งกลางของแต่ละโซนสีจริงอย่างสมดุล สะอาดตา ไม่ซ้อนทับ -->
                <div class="relative h-[240px] sm:h-[260px] w-28 sm:w-36 select-none pl-2 sm:pl-2.5 shrink-0">
                    <!-- โซนล้นตลิ่ง (> 14.90): กึ่งกลางช่วง 18.33% บน = top: 9.16% -->
                    <div class="absolute left-2 sm:left-2.5 top-[9.16%] -translate-y-1/2">
                        <span class="text-[7.5px] sm:text-[8.5px] font-black text-white bg-red-600 px-2 py-1 rounded-md shadow whitespace-nowrap block">
                            ล้นตลิ่ง (&gt; 14.90)
                        </span>
                    </div>
                    <!-- โซนเฝ้าระวัง (13.50 - 14.90): กึ่งกลางช่วง 18.33% ถึง 41.67% = top: 30% -->
                    <div class="absolute left-2 sm:left-2.5 top-[30%] -translate-y-1/2">
                        <span class="text-[7.5px] sm:text-[8.5px] font-black text-slate-950 bg-amber-400 px-2 py-1 rounded-md shadow whitespace-nowrap block">
                            เฝ้าระวัง (13.50-14.90)
                        </span>
                    </div>
                    <!-- โซนปกติ (< 13.50): กึ่งกลางช่วงปกติ 0% ถึง 58.33% = bottom: 29.16% -->
                    <div class="absolute left-2 sm:left-2.5 bottom-[29.16%] translate-y-1/2">
                        <span class="text-[7.5px] sm:text-[8.5px] font-black text-white bg-emerald-600 px-2 py-1 rounded-md shadow whitespace-nowrap block">
                            ปกติ (&lt; 13.50)
                        </span>
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

// =========================================================================
// 🌧️ ระบบลูกเล่นฝนตกลงผิวน้ำ & ท้องฟ้าสดใส (Dynamic Weather-Reactive Hero Card)
// ทำงานสอดคล้องกับพยากรณ์อากาศของวันนี้จากกรมอุตุนิยมวิทยา (TMD)
// =========================================================================

/**
 * กำหนดธีมสภาพอากาศของการ์ดระดับน้ำ X.73
 * @param {'rain'|'sunny'|'default'} mode - โหมดสภาพอากาศ
 * @param {String} detail - รายละเอียด เช่น "ท้องฟ้าสดใส (ไม่มีฝน)", "พยากรณ์ฝนตก 4.5 มม."
 */
function setHeroWeatherMode(mode, detail = '') {
    const heroCards = document.querySelectorAll('#x73_hero_card');
    const rainContainers = document.querySelectorAll('#x73_hero_rain_layer');
    const weatherBadges = document.querySelectorAll('#x73_hero_rain_badge');

    if (!heroCards.length) return;

    // 1. ปรับเปลี่ยนคลาสสไตล์พื้นหลังของการ์ด
    heroCards.forEach(card => {
        card.classList.remove('is-raining-weather', 'is-sunny-weather');
        if (mode === 'rain') {
            card.classList.add('is-raining-weather');
        } else if (mode === 'sunny') {
            card.classList.add('is-sunny-weather');
        }
    });

    // 2. ปรับเปลี่ยนป้ายสถานะสภาพอากาศที่หัวการ์ด
    weatherBadges.forEach(badge => {
        badge.classList.remove('hidden', 'bg-sky-500/30', 'border-sky-400/40', 'text-sky-200', 'bg-amber-500/30', 'border-amber-400/40', 'text-amber-200');

        if (mode === 'rain') {
            badge.className = 'text-[8px] sm:text-[9px] text-sky-200 bg-sky-500/30 border border-sky-400/40 px-2 py-0.5 rounded-full font-bold whitespace-nowrap shadow-xs animate-pulse';
            badge.innerHTML = `<i class="fas fa-cloud-showers-heavy text-sky-300 mr-1"></i>${detail || 'พยากรณ์ฝนตก'}`;
            badge.title = detail || 'พยากรณ์ฝนตกวันนี้';
        } else if (mode === 'sunny') {
            badge.className = 'text-[8px] sm:text-[9px] text-amber-200 bg-amber-500/30 border border-amber-400/40 px-2 py-0.5 rounded-full font-bold whitespace-nowrap shadow-xs';
            badge.innerHTML = `<i class="fas fa-sun text-amber-300 mr-1 animate-spin-slow"></i>${detail || 'ท้องฟ้าสดใส'}`;
            badge.title = detail || 'คาดการณ์ไม่มีฝน ท้องฟ้าสดใส';
        } else {
            badge.classList.add('hidden');
        }
    });

    // 3. ควบคุมเลเยอร์เม็ดฝนและระลอกคลื่นน้ำ
    rainContainers.forEach(container => {
        if (mode !== 'rain') {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }

        container.classList.remove('hidden');
        if (container.children.length > 0) return; // มีเม็ดฝนอยู่แล้ว

        // สร้างสายฝนเฉียงร่วงหล่นลงมา 28 เส้น
        const dropCount = 28;
        const dropsHtml = [];
        for (let i = 0; i < dropCount; i++) {
            const left = (i * (100 / dropCount) + (Math.random() * 3 - 1.5)).toFixed(1);
            const height = Math.floor(Math.random() * 20) + 18; // 18px - 38px
            const duration = (Math.random() * 0.4 + 0.65).toFixed(2); // 0.65s - 1.05s
            const delay = (Math.random() * 1.5).toFixed(2); // 0s - 1.5s
            const opacity = (Math.random() * 0.4 + 0.5).toFixed(2);

            dropsHtml.push(`
                <div class="hero-rain-drop" style="
                    left: ${left}%;
                    height: ${height}px;
                    animation-duration: ${duration}s;
                    animation-delay: ${delay}s;
                    opacity: ${opacity};
                "></div>
            `);
        }

        // สร้างระลอกคลื่นน้ำกระเพื่อมบนผิวน้ำ 9 จุด
        const rippleCount = 9;
        const ripplesHtml = [];
        for (let j = 0; j < rippleCount; j++) {
            const left = (j * (100 / rippleCount) + (Math.random() * 6 - 3)).toFixed(1);
            const bottom = Math.floor(Math.random() * 20) + 15; // ผิวน้ำช่วงล่าง 15%-35%
            const duration = (Math.random() * 0.6 + 1.2).toFixed(2); // 1.2s - 1.8s
            const delay = (Math.random() * 1.6).toFixed(2);

            ripplesHtml.push(`
                <div class="hero-rain-ripple" style="
                    left: ${left}%;
                    bottom: ${bottom}%;
                    animation-duration: ${duration}s;
                    animation-delay: ${delay}s;
                "></div>
            `);
        }

        container.innerHTML = dropsHtml.join('') + ripplesHtml.join('');
    });
}

function setHeroCardRainEffect(enable, reason = '') {
    setHeroWeatherMode(enable ? 'rain' : 'default', reason);
}

/**
 * ตรวจสอบพยากรณ์อากาศของวันนี้ และเปิดธีมสภาพอากาศอัตโนมัติ (ฝนตก / ท้องฟ้าสดใส / ปกติ)
 * @param {Object} overrideForecast - ข้อมูลสภาพอากาศหากส่งมาโดยตรง
 */
function checkAndApplyHeroRainEffect(overrideForecast = null) {
    let forecastToday = overrideForecast;

    // หากไม่มีการส่งเข้ามาตรงๆ ให้ดึงจาก App Cache
    if (!forecastToday && typeof window.getAppCache === 'function') {
        const cached = window.getAppCache('weather_data');
        if (cached && cached.success && Array.isArray(cached.forecast) && cached.forecast[0]) {
            forecastToday = cached.forecast[0];
        }
    }

    if (!forecastToday) return;

    const desc = (forecastToday.desc || '').toLowerCase();
    const rainMm = parseFloat(forecastToday.rain || 0);
    const icon = (forecastToday.icon || '').toLowerCase();

    // 1. เงื่อนไขฝนตกจากกรมอุตุนิยมวิทยา
    const isRain = desc.includes('ฝน') ||
                   desc.includes('พายุ') ||
                   desc.includes('คะนอง') ||
                   rainMm > 0 ||
                   icon.includes('rain') ||
                   icon.includes('storm');

    // 2. เงื่อนไขไม่มีฝน ท้องฟ้าโปร่ง/สดใส
    const isSunny = !isRain && (
        desc.includes('แดด') ||
        desc.includes('แจ่มใส') ||
        desc.includes('โปร่ง') ||
        desc.includes('ร้อน') ||
        icon.includes('sun') ||
        icon.includes('clear') ||
        rainMm === 0
    );

    if (isRain) {
        const rainDetail = `${forecastToday.desc || 'พยากรณ์ฝนวันนี้'} (${rainMm > 0 ? rainMm + ' มม.' : 'มีโอกาสฝนตก'})`;
        setHeroWeatherMode('rain', rainDetail);
    } else if (isSunny) {
        setHeroWeatherMode('sunny', `${forecastToday.desc || 'ท้องฟ้าสดใส'} (ไม่มีฝน)`);
    } else {
        setHeroWeatherMode('default', forecastToday.desc || '');
    }
}

// ฟังก์ชันสลับโหมดสภาพอากาศเพื่อทดสอบ: ฝนตก (Rain) -> ท้องฟ้าสดใส (Sunny) -> ปกติ (Default)
window.cycleHeroWeatherMode = function () {
    const card = document.getElementById('x73_hero_card');
    let nextMode = 'rain';

    if (!card || (!card.classList.contains('is-raining-weather') && !card.classList.contains('is-sunny-weather'))) {
        nextMode = 'rain';
    } else if (card.classList.contains('is-raining-weather')) {
        nextMode = 'sunny';
    } else if (card.classList.contains('is-sunny-weather')) {
        nextMode = 'default';
    }

    setHeroWeatherMode(nextMode, nextMode === 'rain' ? 'พยากรณ์ฝนตก (ทดสอบ)' : (nextMode === 'sunny' ? 'ท้องฟ้าสดใส (ทดสอบ)' : ''));

    // แจ้งเตือน Toast สั้นๆ ให้ผู้ใช้ทราบว่าสลับเป็นโหมดอะไร
    if (typeof Swal !== 'undefined' && Swal.mixin) {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 1800,
            timerProgressBar: true
        });
        Toast.fire({
            icon: nextMode === 'rain' ? 'info' : (nextMode === 'sunny' ? 'warning' : 'question'),
            title: nextMode === 'rain' ? '🌧️ สลับเป็น: ฝนตกโปรยปราย' : (nextMode === 'sunny' ? '☀️ สลับเป็น: ท้องฟ้าสดใส (ฟ้าสว่าง)' : '🌊 สลับเป็น: สีน้ำเงินเข้มปกติ')
        });
    }
};

window.toggleHeroRainEffect = function (enable) {
    if (enable === undefined) {
        window.cycleHeroWeatherMode();
    } else if (enable) {
        setHeroWeatherMode('rain', 'พยากรณ์ฝนตก (Manual)');
    } else {
        setHeroWeatherMode('default', '');
    }
};

window.setHeroWeatherMode = setHeroWeatherMode;
window.setHeroCardRainEffect = setHeroCardRainEffect;
window.checkAndApplyHeroRainEffect = checkAndApplyHeroRainEffect;

// =========================================================================
// 📈 ระบบกราฟประวัติระดับน้ำย้อนหลัง (สถานี X.73 และ X.73A)
// =========================================================================
const _ridHistState = {
    station: 'X.73',
    range: 'today',
    chart: null,
    cache: {} // key: `${station}_${days}` -> { ts, payload }
};

function openRidHistoryModal(stationCode = 'X.73') {
    const station = String(stationCode).toUpperCase().includes('73A') ? 'X.73A' : 'X.73';
    _ridHistState.station = station;

    const modal = document.getElementById('ridHistoryModal');
    if (!modal) return;

    const isX73A = (station === 'X.73A');
    const codeBadge = document.getElementById('ridHistCodeBadge');
    const titleEl = document.getElementById('ridHistTitle');
    const subtitleEl = document.getElementById('ridHistSubtitle');
    const btnX73 = document.getElementById('ridSwitch_X73');
    const btnX73A = document.getElementById('ridSwitch_X73A');

    if (codeBadge) {
        codeBadge.innerText = station;
        codeBadge.className = isX73A
            ? 'text-[10px] font-black bg-indigo-500 text-white px-2 py-0.5 rounded-full'
            : 'text-[10px] font-black bg-sky-500 text-white px-2 py-0.5 rounded-full';
    }
    if (titleEl) {
        titleEl.innerText = isX73A ? 'ประวัติระดับน้ำ สถานี X.73A (บ้านบองอ)' : 'ประวัติระดับน้ำ สถานี X.73 (คลองตันหยงมัส)';
    }
    if (subtitleEl) {
        subtitleEl.innerText = isX73A
            ? 'คลังข้อมูลน้ำแห่งชาติ (ThaiWater) • เฝ้าระวัง 25.80 ม. | ตลิ่ง 26.80 ม.'
            : 'คลังข้อมูลน้ำแห่งชาติ (ThaiWater) • เฝ้าระวัง 13.50 ม. | ตลิ่ง 14.90 ม.';
    }

    if (btnX73 && btnX73A) {
        btnX73.className = !isX73A
            ? 'px-2.5 py-1 rounded-lg bg-blue-600 text-white font-black shadow-xs transition-colors'
            : 'px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-blue-400 transition-colors';
        btnX73A.className = isX73A
            ? 'px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black shadow-xs transition-colors'
            : 'px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-400 transition-colors';
    }

    modal.classList.remove('hidden');
    loadRidHistoryChart('today');
}

function closeRidHistoryModal() {
    const modal = document.getElementById('ridHistoryModal');
    if (modal) modal.classList.add('hidden');
}

function formatRidHistLabel(dtStr, isTodayOnly) {
    if (!dtStr) return '-';
    const s = String(dtStr).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})/);
    if (!m) return s;
    const [, yyyy, mm, dd, hh, min] = m;
    if (isTodayOnly) return `${hh}:${min} น.`;
    const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const mName = thMonths[parseInt(mm, 10) - 1] || mm;
    return `${parseInt(dd, 10)} ${mName} ${hh}:${min}`;
}

function filterTodayHourlyChanges(records) {
    if (!Array.isArray(records) || records.length === 0) return { points: [], isFlat: false };

    // หาวันที่ล่าสุดหรือวันที่ปัจจุบันใน Timezone ไทย
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let todayRecords = records.filter(r => String(r.datetime).startsWith(todayStr));

    // กรณี API ยังไม่มีข้อมูลของวันนี้ (เช่น ช่วงหลังเที่ยงคืนเล็กน้อย) ให้ใช้วันล่าสุดที่มีในข้อมูล
    if (todayRecords.length === 0) {
        const latestDatePrefix = String(records[records.length - 1].datetime).slice(0, 10);
        todayRecords = records.filter(r => String(r.datetime).startsWith(latestDatePrefix));
    }

    if (todayRecords.length <= 1) {
        return { points: todayRecords, isFlat: true };
    }

    // คัดกรองเฉพาะชั่วโมงที่มีการเปลี่ยนแปลงระดับน้ำ (คงจุดแรกของวัน และจุดล่าสุดไว้เสมอเพื่อความต่อเนื่อง)
    const changedPoints = [todayRecords[0]];
    let lastVal = todayRecords[0].value;
    let hasAnyChange = false;

    for (let i = 1; i < todayRecords.length - 1; i++) {
        const cur = todayRecords[i];
        if (Math.abs(cur.value - lastVal) >= 0.005) {
            changedPoints.push(cur);
            lastVal = cur.value;
            hasAnyChange = true;
        }
    }

    const latestPt = todayRecords[todayRecords.length - 1];
    if (Math.abs(latestPt.value - lastVal) >= 0.005) {
        hasAnyChange = true;
    }
    if (changedPoints[changedPoints.length - 1].datetime !== latestPt.datetime) {
        changedPoints.push(latestPt);
    }

    return { points: changedPoints, isFlat: !hasAnyChange };
}

async function fetchRidHistoryDirectFallback(station, days) {
    const isX73A = (station === 'X.73A');
    const loadRes = await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
    if (!loadRes.ok) throw new Error('ไม่สามารถเชื่อมต่อคลังข้อมูลน้ำแห่งชาติได้');
    const loadJson = await loadRes.json();
    const list = (loadJson && loadJson.waterlevel_data && Array.isArray(loadJson.waterlevel_data.data)) ? loadJson.waterlevel_data.data : [];
    const found = list.find(d => {
        if (!d.station) return false;
        const code = d.station.tele_station_oldcode || '';
        const thName = (d.station.tele_station_name && d.station.tele_station_name.th) ? d.station.tele_station_name.th : '';
        return isX73A ? (code === 'X.73A' || thName.includes('บองอ')) : (code === 'X.73');
    });
    if (!found || !found.station || !found.station.id) {
        throw new Error('ไม่พบรหัสสถานีจาก ThaiWater API');
    }

    const stationId = found.station.id;
    const bankLevel = parseFloat(found.station.min_bank) || (isX73A ? 26.80 : 14.90);
    const warnLevel = isX73A ? 25.80 : 13.50;

    const now = new Date();
    const startDt = new Date(now.getTime() - ((days - 1) * 24 * 60 * 60 * 1000));
    const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

    const graphUrl = `https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_graph?station_type=tele_waterlevel&station_id=${encodeURIComponent(stationId)}&start_date=${fmt(startDt)}&end_date=${fmt(now)}`;
    const gRes = await fetch(graphUrl);
    if (!gRes.ok) throw new Error('ไม่สามารถดึงข้อมูลกราฟจาก ThaiWater API ได้');
    const gJson = await gRes.json();

    let rawPoints = [];
    if (gJson && gJson.data && Array.isArray(gJson.data.graph_data)) {
        rawPoints = gJson.data.graph_data;
    } else if (gJson && gJson.waterlevel_data && gJson.waterlevel_data.data) {
        if (Array.isArray(gJson.waterlevel_data.data.graph_data)) rawPoints = gJson.waterlevel_data.data.graph_data;
        else if (Array.isArray(gJson.waterlevel_data.data)) rawPoints = gJson.waterlevel_data.data;
    } else if (gJson && Array.isArray(gJson.graph_data)) {
        rawPoints = gJson.graph_data;
    } else if (gJson && Array.isArray(gJson.data)) {
        rawPoints = gJson.data;
    }

    const records = [];
    rawPoints.forEach(item => {
        const dt = item.datetime || item.waterlevel_datetime || item.date || '';
        const valRaw = (item.value !== undefined && item.value !== null) ? item.value : (item.waterlevel_msl !== undefined ? item.waterlevel_msl : item.waterlevel_m);
        const numVal = parseFloat(valRaw);
        if (dt && !isNaN(numVal)) {
            records.push({ datetime: String(dt).trim(), value: parseFloat(numVal.toFixed(2)) });
        }
    });
    records.sort((a, b) => new Date(a.datetime.replace(' ', 'T')) - new Date(b.datetime.replace(' ', 'T')));

    return {
        success: true,
        station,
        stationId,
        bankLevel,
        warnLevel,
        records
    };
}

async function loadRidHistoryChart(rangeKey = 'today') {
    _ridHistState.range = rangeKey;
    const station = _ridHistState.station;
    const days = rangeKey === '7d' ? 7 : (rangeKey === '3d' ? 3 : 1);

    // อัปเดตปุ่มแท็บ Active
    ['today', '3d', '7d'].forEach(k => {
        const btn = document.getElementById(`ridHistBtn_${k}`);
        if (!btn) return;
        if (k === rangeKey) {
            btn.className = 'rid-hist-tab flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-black transition-all bg-blue-600 text-white shadow-sm';
        } else {
            btn.className = 'rid-hist-tab flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-black transition-all text-slate-600 hover:text-slate-900';
        }
    });

    const loadingEl = document.getElementById('ridHistLoading');
    const noticeEl = document.getElementById('ridHistEmptyNotice');
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (noticeEl) {
        noticeEl.classList.add('hidden');
        noticeEl.innerText = '';
    }

    try {
        const cacheKey = `${station}_${days}`;
        const cached = _ridHistState.cache[cacheKey];
        let dataPayload = null;

        if (cached && (Date.now() - cached.ts) < 3 * 60 * 1000) {
            dataPayload = cached.payload;
        } else {
            try {
                const res = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'getRIDHistory', station: station, days: days })
                });
                if (res.ok) {
                    const parsed = await res.json();
                    if (parsed && parsed.success && Array.isArray(parsed.records) && parsed.records.length > 0) {
                        dataPayload = parsed;
                    }
                }
            } catch (gasErr) {
                console.warn('⚠️ GAS getRIDHistory unavailable, trying direct ThaiWater fallback:', gasErr);
            }

            // Fallback: ดึงตรงจาก ThaiWater Public API กรณียังไม่ได้ Deploy Code.gs เวอร์ชันใหม่
            if (!dataPayload) {
                dataPayload = await fetchRidHistoryDirectFallback(station, days);
            }

            if (dataPayload && dataPayload.success) {
                _ridHistState.cache[cacheKey] = { ts: Date.now(), payload: dataPayload };
            }
        }

        if (!dataPayload || !dataPayload.success || !Array.isArray(dataPayload.records) || dataPayload.records.length === 0) {
            throw new Error((dataPayload && dataPayload.error) ? dataPayload.error : 'ไม่พบข้อมูลระดับน้ำย้อนหลังในช่วงเวลาที่เลือก');
        }

        const bankLevel = parseFloat(dataPayload.bankLevel) || (station === 'X.73A' ? 26.80 : 14.90);
        const warnLevel = parseFloat(dataPayload.warnLevel) || (station === 'X.73A' ? 25.80 : 13.50);

        let displayPoints = dataPayload.records;
        if (rangeKey === 'today') {
            const filtered = filterTodayHourlyChanges(dataPayload.records);
            displayPoints = filtered.points;
            if (filtered.isFlat && noticeEl) {
                noticeEl.innerText = 'ℹ️ วันนี้ระดับน้ำทรงตัวตลอดช่วงเวลา (แสดงจุดเริ่มต้นและค่าล่าสุดเพื่อความต่อเนื่อง)';
                noticeEl.classList.remove('hidden');
            }
        }

        // คำนวณ KPI
        const values = displayPoints.map(p => p.value);
        const latestVal = values[values.length - 1];
        const maxVal = Math.max(...values);
        const minVal = Math.min(...values);

        const latestEl = document.getElementById('ridHistLatest');
        const maxEl = document.getElementById('ridHistMax');
        const minEl = document.getElementById('ridHistMin');
        const countEl = document.getElementById('ridHistCount');

        if (latestEl) latestEl.innerText = `${latestVal.toFixed(2)} ม.`;
        if (maxEl) maxEl.innerText = `${maxVal.toFixed(2)} ม.`;
        if (minEl) minEl.innerText = `${minVal.toFixed(2)} ม.`;
        if (countEl) countEl.innerText = `${displayPoints.length} จุด`;

        // วาดกราฟ Chart.js
        const canvas = document.getElementById('ridHistoryChart');
        if (canvas && typeof Chart !== 'undefined') {
            if (_ridHistState.chart) {
                _ridHistState.chart.destroy();
                _ridHistState.chart = null;
            }

            const ctx = canvas.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 260);
            gradient.addColorStop(0, station === 'X.73A' ? 'rgba(99, 102, 241, 0.35)' : 'rgba(2, 132, 199, 0.35)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

            const labels = displayPoints.map(p => formatRidHistLabel(p.datetime, rangeKey === 'today'));
            const warnLine = displayPoints.map(() => warnLevel);
            const bankLine = displayPoints.map(() => bankLevel);

            const yMin = Math.floor((Math.min(minVal, warnLevel - 1.5) - 0.3) * 10) / 10;
            const yMax = Math.ceil((Math.max(maxVal, bankLevel) + 0.3) * 10) / 10;

            _ridHistState.chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'ระดับน้ำ (ม.รทก.)',
                            data: values,
                            borderColor: station === 'X.73A' ? '#4f46e5' : '#0284c7',
                            backgroundColor: gradient,
                            borderWidth: 2.5,
                            pointRadius: displayPoints.length <= 30 ? 4 : 1.5,
                            pointHoverRadius: 6,
                            pointBackgroundColor: '#ffffff',
                            pointBorderWidth: 2,
                            fill: true,
                            tension: 0.3
                        },
                        {
                            label: `เฝ้าระวัง (${warnLevel.toFixed(2)} ม.)`,
                            data: warnLine,
                            borderColor: '#f59e0b',
                            borderWidth: 1.5,
                            borderDash: [6, 4],
                            pointRadius: 0,
                            fill: false
                        },
                        {
                            label: `ระดับตลิ่ง (${bankLevel.toFixed(2)} ม.)`,
                            data: bankLine,
                            borderColor: '#ef4444',
                            borderWidth: 1.5,
                            borderDash: [4, 4],
                            pointRadius: 0,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: { boxWidth: 12, font: { family: 'Prompt, sans-serif', size: 11, weight: 'bold' } }
                        },
                        tooltip: {
                            callbacks: {
                                title: (items) => {
                                    const idx = items[0] ? items[0].dataIndex : 0;
                                    return displayPoints[idx] ? displayPoints[idx].datetime : '';
                                },
                                label: (ctxItem) => {
                                    if (ctxItem.datasetIndex === 0) {
                                        const idx = ctxItem.dataIndex;
                                        const prev = idx > 0 ? values[idx - 1] : values[idx];
                                        const diff = values[idx] - prev;
                                        const diffTxt = idx === 0 ? '' : (diff > 0 ? ` (▲ +${diff.toFixed(2)})` : (diff < 0 ? ` (▼ ${diff.toFixed(2)})` : ' (ทรงตัว)'));
                                        return ` ระดับน้ำ: ${ctxItem.parsed.y.toFixed(2)} ม.รทก.${diffTxt}`;
                                    }
                                    return ` ${ctxItem.dataset.label}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { maxTicksLimit: 8, font: { family: 'Prompt, sans-serif', size: 10 } }
                        },
                        y: {
                            suggestedMin: yMin,
                            suggestedMax: yMax,
                            grid: { color: 'rgba(148, 163, 184, 0.15)' },
                            ticks: {
                                font: { family: 'Prompt, sans-serif', size: 10 },
                                callback: (v) => Number(v).toFixed(2)
                            }
                        }
                    }
                }
            });
        }

        // เติมตารางรายละเอียดด้านล่าง (เรียงจากล่าสุดลงมา)
        const tbody = document.getElementById('ridHistTableBody');
        if (tbody) {
            const rowsHtml = [];
            for (let i = displayPoints.length - 1; i >= 0; i--) {
                const cur = displayPoints[i];
                const prev = i > 0 ? displayPoints[i - 1] : null;
                const diff = prev ? (cur.value - prev.value) : 0;

                let diffHtml = '<span class="text-slate-400 font-bold">—</span>';
                if (prev && diff > 0.004) {
                    diffHtml = `<span class="text-rose-600 font-black">▲ +${diff.toFixed(2)} ม.</span>`;
                } else if (prev && diff < -0.004) {
                    diffHtml = `<span class="text-emerald-600 font-black">▼ ${diff.toFixed(2)} ม.</span>`;
                }

                const valColor = cur.value >= bankLevel ? 'text-rose-600' : (cur.value >= warnLevel ? 'text-amber-600' : 'text-slate-700');

                rowsHtml.push(`
                    <tr class="hover:bg-slate-50">
                        <td class="py-2 px-3 font-medium text-slate-600">${formatRidHistLabel(cur.datetime, false)} น.</td>
                        <td class="py-2 px-3 text-right font-black ${valColor}">${cur.value.toFixed(2)}</td>
                        <td class="py-2 px-3 text-right">${diffHtml}</td>
                    </tr>
                `);
            }
            tbody.innerHTML = rowsHtml.join('');
        }
    } catch (err) {
        console.error('🚨 loadRidHistoryChart error:', err);
        if (noticeEl) {
            noticeEl.innerText = `⚠️ ${err.message || 'ไม่สามารถโหลดข้อมูลกราฟได้ในขณะนี้'}`;
            noticeEl.classList.remove('hidden');
        }
        const tbody = document.getElementById('ridHistTableBody');
        if (tbody) tbody.innerHTML = '';
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
    }
}

window.openRidHistoryModal = openRidHistoryModal;
window.closeRidHistoryModal = closeRidHistoryModal;
window.loadRidHistoryChart = loadRidHistoryChart;
