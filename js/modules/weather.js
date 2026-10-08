/**
 * 🌤️ Weather & Notification Module: พยากรณ์อากาศ 7 วัน และ LINE Broadcast
 * เทศบาลตำบลตันหยงมัส
 */

async function loadWeatherForecast(forceRefresh = false) {
    const listEl = document.getElementById('weather-forecast-list');
    const loadingEl = document.getElementById('weather-loading');
    if (!listEl) return;

    let result = null;

    // 🚀 ตรวจสอบ Browser Cache ก่อน หากยังไม่หมดอายุและไม่ได้ forceRefresh ให้ใช้แสดงผลทันที
    if (!forceRefresh && typeof window.getAppCache === 'function') {
        const cached = window.getAppCache('weather_data');
        if (cached && cached.success && cached.forecast) {
            result = cached;
        }
    }

    if (!result) {
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getWeatherData' })
            });

            if (!res.ok) throw new Error("การร้องขอข้อมูลล้มเหลว");
            const text = await res.text();
            try {
                result = JSON.parse(text);
                if (result && result.success && result.forecast && typeof window.setAppCache === 'function') {
                    window.setAppCache('weather_data', result, 30); // Cache 30 นาที
                }
            } catch (e) {
                console.error("Weather Data response non-JSON:", text.substring(0, 100));
                return;
            }
        } catch (e) {
            console.error("🚨 Weather Forecast Load Error:", e);
            if (loadingEl) {
                loadingEl.innerHTML = `
                    <div class="text-center py-4 text-slate-400">
                        <i class="fas fa-exclamation-circle text-amber-500 mb-1"></i>
                        <p class="text-xs">ไม่สามารถดึงข้อมูลพยากรณ์อากาศได้</p>
                    </div>
                `;
            }
            return;
        }
    }

    if (result && result.success && result.forecast) {
        if (loadingEl) loadingEl.classList.add('hidden');
        listEl.classList.remove('hidden');

        listEl.innerHTML = result.forecast.map((f, index) => {
            const isToday = index === 0;

            // ========================================================
            // 🛠️ ระบบแปลงไอคอนอัตโนมัติ
            // ========================================================
            let iconClass = "fa-solid fa-cloud-sun text-sky-400";
            const desc = f.desc || "";
            const apiIcon = f.icon || "";

            if (desc.includes("ฝนฟ้าคะนอง") || desc.includes("พายุ")) {
                iconClass = "fa-solid fa-cloud-bolt text-amber-600";
            } else if (desc.includes("ฝนตกหนัก") || desc.includes("ฝนหนัก")) {
                iconClass = "fa-solid fa-cloud-showers-heavy text-blue-500";
            } else if (desc.includes("ฝน")) {
                iconClass = "fa-solid fa-cloud-rain text-sky-400";
            } else if (desc.includes("แดด") || desc.includes("แจ่มใส") || desc.includes("ร้อน")) {
                iconClass = "fa-solid fa-sun text-amber-500";
            } else if (desc.includes("หมอก")) {
                iconClass = "fa-solid fa-smog text-slate-400";
            } else if (desc.includes("เมฆมาก") || desc.includes("เมฆเป็นส่วนมาก")) {
                iconClass = "fa-solid fa-cloud text-slate-400";
            } else if (desc.includes("เมฆ")) {
                iconClass = "fa-solid fa-cloud-sun text-sky-400";
            } else if (apiIcon.includes("sun") || apiIcon.includes("clear")) {
                iconClass = "fa-solid fa-sun text-amber-500";
            } else if (apiIcon.includes("rain")) {
                iconClass = "fa-solid fa-cloud-rain text-sky-400";
            } else if (apiIcon.includes("cloud")) {
                iconClass = "fa-solid fa-cloud text-slate-400";
            } else if (apiIcon.startsWith("fa-")) {
                iconClass = `fa-solid ${apiIcon} text-blue-500`;
            }

            return `
                <div class="flex-1 min-w-[125px] shrink-0 snap-center bg-gradient-to-b ${isToday ? 'from-blue-50/80 to-sky-100/50 border-blue-200/80 shadow-md shadow-blue-500/5' : 'from-white to-slate-50/40 border-slate-100'} border rounded-2xl p-4 flex flex-col items-center text-center relative overflow-hidden transition-all hover:shadow-md">
                    ${isToday ? '<span class="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>' : ''}
                    <p class="text-[10px] font-bold ${isToday ? 'text-blue-600' : 'text-slate-400'} uppercase tracking-wide mb-1">${isToday ? 'วันนี้' : f.day}</p>
                    <p class="text-[10px] font-bold text-slate-400 mb-3">${f.date ? f.date.split('-').reverse().slice(0, 2).join('/') : ''}</p>
                    
                    <div class="text-3xl my-2 drop-shadow-sm flex items-center justify-center h-10">
                        <i class="${iconClass} transition-transform hover:scale-110"></i>
                    </div>
                    
                    <p class="text-xs font-bold text-slate-700 truncate w-full mt-1 mb-3" title="${f.desc}">${f.desc}</p>
                    
                    <div class="w-full border-t border-slate-100/80 pt-3 flex items-center justify-around text-center mt-auto">
                        <div>
                            <p class="text-[8px] font-bold text-slate-400 uppercase">สูงสุด</p>
                            <p class="text-xs font-black text-red-500">${f.tempMax}°C</p>
                        </div>
                        <div class="h-6 w-px bg-slate-100"></div>
                        <div>
                            <p class="text-[8px] font-bold text-slate-400 uppercase">ต่ำสุด</p>
                            <p class="text-xs font-black text-blue-500">${f.tempMin}°C</p>
                        </div>
                    </div>

                    <div class="w-full bg-slate-100/40 rounded-xl p-2 mt-3 text-[9px] font-bold text-slate-500 flex flex-col gap-1">
                        <div class="flex justify-between items-center">
                            <span><i class="fa-solid fa-cloud-showers-heavy text-sky-400 mr-1"></i>ฝน:</span>
                            <span class="text-slate-700">${f.rain} มม.</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span><i class="fa-solid fa-wind text-slate-400 mr-1"></i>ลม:</span>
                            <span class="text-slate-700">${f.wind} กม/ชม</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } else if (result) {
        console.error("🚨 Weather Forecast Load Error:", result.error);
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div class="text-center text-red-500 p-4">
                    <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                    <p class="text-xs font-bold">ไม่สามารถดึงข้อมูลสภาพอากาศได้</p>
                    <p class="text-[10px] text-slate-400 mt-1">${result.error || ''}</p>
                </div>
            `;
        }
    }
}

function setWeatherMode(mode) {
    const apiView = document.getElementById('weather-api-view');
    const widgetView = document.getElementById('weather-widget-view');
    const btnApi = document.getElementById('btn-weather-api');
    const btnWidget = document.getElementById('btn-weather-widget');

    if (mode === 'api') {
        if (apiView) apiView.classList.remove('hidden');
        if (widgetView) widgetView.classList.add('hidden');
        if (btnApi) {
            btnApi.className = "px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 bg-white text-blue-600 shadow-sm border border-slate-200/30";
        }
        if (btnWidget) {
            btnWidget.className = "px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-800";
        }
    } else {
        if (apiView) apiView.classList.add('hidden');
        if (widgetView) widgetView.classList.remove('hidden');
        if (btnApi) {
            btnApi.className = "px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-800";
        }
        if (btnWidget) {
            btnWidget.className = "px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 bg-white text-blue-600 shadow-sm border border-slate-200/30";
        }
    }
}

async function sendMessagingAPI(type) {
    const config = {
        normal: {
            title: 'สถานะ: ปกติ',
            text: 'ยืนยันแจ้งสถานการณ์ปกติ?',
            iconHtml: '<div class="w-16 h-16 bg-green-50 border-2 border-green-200 text-green-500 rounded-full flex items-center justify-center shadow-sm mx-auto"><i class="fas fa-check-circle text-3xl"></i></div>',
            color: '#22c55e'
        },
        warning: {
            title: 'สถานะ: เฝ้าระวัง',
            text: 'ยืนยันแจ้งเตือนเฝ้าระวังภัย?',
            iconHtml: '<div class="w-16 h-16 bg-amber-50 border-2 border-amber-200 text-amber-500 rounded-full flex items-center justify-center shadow-sm mx-auto"><i class="fas fa-exclamation-triangle text-3xl"></i></div>',
            color: '#f59e0b'
        },
        danger: {
            title: 'สถานะ: วิกฤต',
            text: 'ยืนยันประกาศภาวะวิกฤต?',
            iconHtml: '<div class="w-16 h-16 bg-red-50 border-2 border-red-200 text-red-500 rounded-full flex items-center justify-center shadow-sm mx-auto"><i class="fas fa-bullhorn text-3xl animate-pulse"></i></div>',
            color: '#ef4444'
        }
    };

    const setup = config[type];
    if (!setup) return;

    const result = await Swal.fire({
        title: setup.title,
        text: setup.text,
        iconHtml: setup.iconHtml,
        showCancelButton: true,
        confirmButtonColor: setup.color,
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ยืนยันส่ง',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true,
        borderRadius: '1.25rem',
        width: '300px',
        customClass: {
            icon: 'border-none w-auto h-auto m-0 mt-5 bg-transparent',
            title: 'text-lg font-black text-slate-800 mt-2',
            htmlContainer: 'text-xs text-slate-500 font-medium'
        }
    });

    if (result.isConfirmed) {
        Swal.fire({
            title: 'กำลังส่ง...',
            allowOutsideClick: false,
            width: '250px',
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'broadcastLine', alertType: type })
            });
            const data = await res.json();

            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'สำเร็จ',
                    timer: 1500,
                    showConfirmButton: false,
                    width: '250px',
                    borderRadius: '1.25rem'
                });
            } else {
                throw new Error(data.error);
            }
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'ล้มเหลว',
                text: e.message,
                width: '300px'
            });
        }
    }
}

window.loadWeatherForecast = loadWeatherForecast;
window.setWeatherMode = setWeatherMode;
window.sendMessagingAPI = sendMessagingAPI;
