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

        // 🌧️ ตรวจสอบสภาพอากาศเพื่อเปิด/ปิดเอฟเฟกต์ฝนตกลงผิวน้ำบนการ์ดระดับน้ำ X.73
        if (typeof window.checkAndApplyHeroRainEffect === 'function' && Array.isArray(result.forecast) && result.forecast[0]) {
            window.checkAndApplyHeroRainEffect(result.forecast[0]);
        }
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
            title: 'สถานการณ์ปกติ',
            badge: '🟢 สภาพการณ์ปกติ',
            badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            text: 'ขณะนี้ระดับน้ำคลองตันหยงมัสอยู่ในเกณฑ์ปกติ โปรดติดตามข่าวสารจากทางเทศบาล',
            iconHtml: '<div class="w-14 h-14 bg-green-50 border-2 border-green-200 text-green-500 rounded-2xl flex items-center justify-center shadow-sm mx-auto"><i class="fas fa-check-circle text-2xl"></i></div>',
            color: '#22c55e',
            btnConfirmText: 'ส่งประกาศ (ปกติ)'
        },
        warning: {
            title: 'เฝ้าระวังระดับน้ำ',
            badge: '🟡 เฝ้าระวังระดับน้ำ',
            badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
            text: 'ระดับน้ำคลองตันหยงมัสกำลังเพิ่มสูงขึ้น ขอให้ประชาชนในพื้นที่ลุ่มต่ำเฝ้าติดตามข่าวสารอย่างใกล้ชิด',
            iconHtml: '<div class="w-14 h-14 bg-amber-50 border-2 border-amber-200 text-amber-500 rounded-2xl flex items-center justify-center shadow-sm mx-auto"><i class="fas fa-exclamation-triangle text-2xl"></i></div>',
            color: '#f59e0b',
            btnConfirmText: 'ส่งประกาศ (เฝ้าระวัง)'
        },
        danger: {
            title: 'วิกฤต! เตรียมอพยพ',
            badge: '🔴 วิกฤต! เตรียมอพยพ',
            badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
            text: 'ระดับน้ำล้นตลิ่งและเข้าสู่สภาวะวิกฤต โปรดเคลื่อนย้ายทรัพย์สินขึ้นที่สูงและเตรียมพร้อมอพยพทันที!',
            iconHtml: '<div class="w-14 h-14 bg-red-50 border-2 border-red-200 text-red-500 rounded-2xl flex items-center justify-center shadow-sm mx-auto"><i class="fas fa-bullhorn text-2xl animate-pulse"></i></div>',
            color: '#ef4444',
            btnConfirmText: 'ส่งประกาศ (วิกฤต)'
        },
        news: {
            title: 'รายงานสถานการณ์และข่าวสาร',
            badge: '📢 ข่าวสารสถานการณ์',
            badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
            text: 'รายงานสถานการณ์น้ำท่วม ภาพถ่ายสดจุดเสี่ยง หรือประชาสัมพันธ์การให้ความช่วยเหลือประชาชน เทศบาลตำบลตันหยงมัส',
            iconHtml: '<div class="w-14 h-14 bg-sky-50 border-2 border-sky-200 text-sky-500 rounded-2xl flex items-center justify-center shadow-sm mx-auto"><i class="fas fa-camera text-2xl"></i></div>',
            color: '#0284c7',
            btnConfirmText: 'ส่งประกาศข่าวสาร'
        }
    };

    const setup = config[type];
    if (!setup) return;

    if (typeof checkAdminReadOnlyAction === 'function' && checkAdminReadOnlyAction()) return;

    let attachedImageData = "";
    let attachedImageType = "image/jpeg";

    const modalHTML = `
        <div class="text-left space-y-3 mt-2">
            <!-- ป้ายแสดงระดับภัยและกลุ่มเป้าหมาย -->
            <div class="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <span class="text-xs font-black px-2.5 py-1 rounded-full border ${setup.badgeClass}">
                    ${setup.badge}
                </span>
                <span class="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                    <i class="fab fa-line text-emerald-500 text-sm"></i>
                    ส่งเข้ากลุ่ม: <b class="text-slate-700">เฝ้าระวังอุทกภัย'69</b>
                </span>
            </div>

            <!-- ช่องแก้ไขหัวข้อประกาศ -->
            <div>
                <label class="block text-[11px] font-bold text-slate-600 mb-1">
                    <i class="fas fa-heading text-slate-400 mr-1"></i>หัวข้อประกาศ:
                </label>
                <input type="text" id="swal_line_title" value="${setup.title}"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                    placeholder="ระบุหัวข้อประกาศ...">
            </div>

            <!-- ช่องแก้ไขรายละเอียดข้อความ -->
            <div>
                <label class="block text-[11px] font-bold text-slate-600 mb-1">
                    <i class="fas fa-align-left text-slate-400 mr-1"></i>เนื้อหาข้อความประกาศ (แก้ไข/พิมพ์เพิ่มได้):
                </label>
                <textarea id="swal_line_message" rows="3"
                    class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all custom-scrollbar leading-relaxed"
                    placeholder="พิมพ์รายละเอียดสถานการณ์ คำแนะนำ หรือข้อมูลเพิ่มเติมที่นี่...">${setup.text}</textarea>
            </div>

            <!-- 📸 ส่วนแนบรูปภาพสถานการณ์ (จัดเก็บบน Google Drive) -->
            <div class="p-3 bg-slate-50/80 border border-slate-200 rounded-xl space-y-2">
                <div class="flex items-center justify-between">
                    <label class="block text-[11px] font-bold text-slate-700">
                        <i class="fas fa-camera text-sky-500 mr-1"></i>แนบรูปภาพสถานการณ์ (ไม่บังคับ):
                    </label>
                    <span class="text-[9px] text-slate-400 flex items-center gap-1">
                        <i class="fab fa-google-drive text-emerald-600"></i> บันทึกบน Google Drive
                    </span>
                </div>

                <div class="flex items-center gap-2">
                    <label for="swal_line_img_file" class="cursor-pointer px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0">
                        <i class="fas fa-folder-open text-sky-600"></i>
                        <span>เลือกรูป / ถ่ายภาพ</span>
                    </label>
                    <input type="file" id="swal_line_img_file" accept="image/*" class="hidden">
                    <span id="swal_line_img_filename" class="text-[11px] text-slate-400 truncate flex-1">ยังไม่ได้เลือกรูปภาพ</span>
                </div>

                <!-- กล่องพรีวิวรูปภาพก่อนส่ง -->
                <div id="swal_line_img_preview_box" class="hidden relative rounded-xl overflow-hidden border border-slate-200 bg-white">
                    <img id="swal_line_img_preview" src="" alt="พรีวิวรูป" class="w-full max-h-40 object-cover rounded-xl">
                    <button type="button" id="swal_line_img_remove_btn" class="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs shadow-md hover:bg-rose-700 transition-all" title="ยกเลิกการแนบรูป">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- ช่องวาง Image URL สำรอง -->
                <div>
                    <input type="url" id="swal_line_img_url"
                        class="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 outline-none focus:border-sky-400 transition-all placeholder:text-slate-300"
                        placeholder="หรือวางลิงก์รูปภาพโดยตรง (https://...)">
                </div>
            </div>

            <!-- ข้อมูลแจ้งเตือนปลายทาง -->
            <div class="p-2.5 bg-emerald-50/70 border border-emerald-200/60 rounded-xl flex items-center gap-2 text-[10px] text-emerald-800">
                <i class="fas fa-info-circle text-xs text-emerald-600 shrink-0"></i>
                <span>ข้อความนี้จะส่งตรงเข้ากลุ่มไลน์ <b>เฝ้าระวังอุทกภัย'69 ทต.ตันหยงมัส</b> ในรูปแบบ Flex Card (ไม่สิ้นเปลืองโควต้าบรอดแคสต์)</span>
            </div>
        </div>
    `;

    const result = await Swal.fire({
        html: modalHTML,
        iconHtml: setup.iconHtml,
        showCancelButton: true,
        confirmButtonColor: setup.color,
        cancelButtonColor: '#94a3b8',
        confirmButtonText: `<i class="fas fa-paper-plane mr-1.5"></i> ${setup.btnConfirmText}`,
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true,
        borderRadius: '1.5rem',
        width: '460px',
        customClass: {
            icon: 'border-none w-auto h-auto m-0 mt-4 bg-transparent',
            popup: 'p-5 md:p-6 rounded-[2rem]'
        },
        didOpen: () => {
            const fileInput = document.getElementById('swal_line_img_file');
            const previewBox = document.getElementById('swal_line_img_preview_box');
            const previewImg = document.getElementById('swal_line_img_preview');
            const filenameLabel = document.getElementById('swal_line_img_filename');
            const removeBtn = document.getElementById('swal_line_img_remove_btn');
            const urlInput = document.getElementById('swal_line_img_url');

            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;

                    attachedImageType = file.type || 'image/jpeg';
                    if (filenameLabel) filenameLabel.textContent = file.name;

                    const reader = new FileReader();
                    reader.onload = (loadEvt) => {
                        attachedImageData = loadEvt.target.result;
                        if (previewImg) previewImg.src = attachedImageData;
                        if (previewBox) previewBox.classList.remove('hidden');
                        if (urlInput) urlInput.value = ''; // ล้าง URL ถ้าเลือกไฟล์
                    };
                    reader.readAsDataURL(file);
                });
            }

            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    attachedImageData = "";
                    if (fileInput) fileInput.value = '';
                    if (previewImg) previewImg.src = '';
                    if (previewBox) previewBox.classList.add('hidden');
                    if (filenameLabel) filenameLabel.textContent = 'ยังไม่ได้เลือกรูปภาพ';
                });
            }
        },
        preConfirm: () => {
            const titleInput = document.getElementById('swal_line_title');
            const messageInput = document.getElementById('swal_line_message');
            const urlInput = document.getElementById('swal_line_img_url');

            const customTitle = titleInput ? titleInput.value.trim() : '';
            const customMessage = messageInput ? messageInput.value.trim() : '';
            const customImageUrl = urlInput ? urlInput.value.trim() : '';

            if (!customTitle) {
                Swal.showValidationMessage('กรุณาระบุหัวข้อประกาศ');
                return false;
            }
            if (!customMessage) {
                Swal.showValidationMessage('กรุณาระบุเนื้อหาข้อความประกาศ');
                return false;
            }

            return {
                customTitle,
                customMessage,
                imageData: attachedImageData || null,
                imageType: attachedImageType || 'image/jpeg',
                imageUrl: customImageUrl || null
            };
        }
    });

    if (result.isConfirmed && result.value) {
        const { customTitle, customMessage, imageData, imageType, imageUrl } = result.value;

        Swal.fire({
            title: 'กำลังส่งประกาศเข้ากลุ่มไลน์...',
            text: imageData ? 'กำลังอัปโหลดรูปภาพลง Google Drive และส่งเข้ากลุ่มไลน์...' : 'กลุ่ม: เฝ้าระวังอุทกภัย\'69 ทต.ตันหยงมัส',
            allowOutsideClick: false,
            width: '320px',
            borderRadius: '1.25rem',
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'broadcastLine',
                    alertType: type,
                    customTitle: customTitle,
                    customMessage: customMessage,
                    imageData: imageData || null,
                    imageType: imageType || 'image/jpeg',
                    imageUrl: imageUrl || null
                })
            });
            const data = await res.json();

            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'ส่งประกาศสำเร็จ',
                    html: `<p class="text-xs text-slate-500 mt-1">ส่งประกาศเข้ากลุ่มไลน์ <b class="text-slate-700">เฝ้าระวังอุทกภัย'69</b> เรียบร้อยแล้ว</p>`,
                    timer: 2500,
                    showConfirmButton: false,
                    width: '320px',
                    borderRadius: '1.25rem'
                });
            } else {
                throw new Error(data.error || 'ไม่สามารถส่งข้อความได้');
            }
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'ส่งประกาศล้มเหลว',
                text: e.message,
                width: '320px',
                borderRadius: '1.25rem'
            });
        }
    }
}

window.loadWeatherForecast = loadWeatherForecast;
window.setWeatherMode = setWeatherMode;
window.sendMessagingAPI = sendMessagingAPI;
