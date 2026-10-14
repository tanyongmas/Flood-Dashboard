/**
 * 🗺️ Admin Dashboard & Flood Risk Map Module
 * แดชบอร์ดสรุปภาพรวมสำหรับผู้บริหาร, แผนที่ระดับน้ำ, แผนที่ผู้ประสบภัย และแผนที่เสี่ยงภัย
 * เทศบาลตำบลตันหยงมัส
 */

let dashMainWaterChartInstance = null;
let dashWaterMap = null;
let dashMarkerLayer = L.layerGroup();

let floodReportMap = null;
let floodMarkerLayer = L.layerGroup();
let showOnlyUnnumbered = false;
window.floodMarkersMap = {};

window.renderAdminDashboard = function () {
    if (typeof window.updateDashWaterMapMarkers === 'function') window.updateDashWaterMapMarkers();

    if (typeof window.loadEvacuationMarkers === 'function') {
        window.loadEvacuationMarkers();
    }

    const evacuees = store.evacuees || [];
    const total = evacuees.length;

    const households = [...new Set(evacuees.map(r => String(r[2]).trim()).filter(a => a !== ''))].length;
    const male = evacuees.filter(r => r[6] === 'ชาย').length;
    const female = evacuees.filter(r => r[6] === 'หญิง').length;
    const ageGroups = {
        infant: evacuees.filter(r => r[5] >= 0 && r[5] <= 7).length,
        child: evacuees.filter(r => r[5] >= 8 && r[5] <= 15).length,
        adult: evacuees.filter(r => r[5] >= 16 && r[5] <= 59).length,
        elderly: evacuees.filter(r => r[5] >= 60).length
    };
    const sickCount = evacuees.filter(r => ['ผู้ป่วย', 'ผู้พิการ'].includes(String(r[8]).trim())).length;
    const vulnerableCount = evacuees.filter(r => String(r[8]).trim() === 'กลุ่มเปราะบาง').length;

    if (document.getElementById('dash_statTotalPeople')) document.getElementById('dash_statTotalPeople').innerText = total;
    if (document.getElementById('dash_statTotalHouseholds')) document.getElementById('dash_statTotalHouseholds').innerText = households;
    if (document.getElementById('dash_statSick')) document.getElementById('dash_statSick').innerText = sickCount;
    if (document.getElementById('dash_statVulnerable')) document.getElementById('dash_statVulnerable').innerText = vulnerableCount;

    if (document.getElementById('dash_numMale')) document.getElementById('dash_numMale').innerText = male;
    if (document.getElementById('dash_numFemale')) document.getElementById('dash_numFemale').innerText = female;
    if (document.getElementById('dash_numAgeInfant')) document.getElementById('dash_numAgeInfant').innerText = ageGroups.infant;
    if (document.getElementById('dash_numAgeChild')) document.getElementById('dash_numAgeChild').innerText = ageGroups.child;
    if (document.getElementById('dash_numAgeAdult')) document.getElementById('dash_numAgeAdult').innerText = ageGroups.adult;
    if (document.getElementById('dash_numAgeElderly')) document.getElementById('dash_numAgeElderly').innerText = ageGroups.elderly;

    const totalCapacity = typeof SHELTER_CAPACITY !== 'undefined' ? Object.values(SHELTER_CAPACITY).reduce((a, b) => a + b, 0) : 220;
    const occupancyRate = totalCapacity > 0 ? (total / totalCapacity) * 100 : 0;
    let capacityColorClass = 'bg-green-400';
    if (occupancyRate >= 90) capacityColorClass = 'bg-rose-500';
    else if (occupancyRate >= 60) capacityColorClass = 'bg-amber-400';

    if (document.getElementById('dash_statCapacityText')) {
        document.getElementById('dash_statCapacityText').innerText = `${total} / ${totalCapacity}`;
        const bar = document.getElementById('dash_statCapacityBar');
        if (bar) {
            bar.style.width = `${Math.min(occupancyRate, 100)}%`;
            bar.className = `h-full rounded-full transition-all duration-1000 ${capacityColorClass}`;
        }
    }

    if (typeof updateChart === 'function') {
        updateChart('dash_gender', 'dash_chartGender', ['ชาย', 'หญิง'], [male, female], ['#3b82f6', '#ec4899'], '65%', false);
        updateChart('dash_age', 'dash_chartAge', ['0-7 ปี', '8-15 ปี', '16-59 ปี', '60+ ปี'],
            [ageGroups.infant, ageGroups.child, ageGroups.adult, ageGroups.elderly], ['#10b981', '#3b82f6', '#f59e0b', '#f43f5e'], '65%', false);
    }

    let totalReliefDistributed = 0;
    if (store.reliefData) {
        totalReliefDistributed = store.reliefData.length;
    }
    if (document.getElementById('dash_totalReliefCount')) {
        document.getElementById('dash_totalReliefCount').innerText = totalReliefDistributed.toLocaleString();
    }

    let stockIn = 0;
    let stockOut = 0;
    if (store.reliefStock) {
        store.reliefStock.forEach(r => {
            const type = r[1] ? String(r[1]).toLowerCase().trim() : '';
            const amount = Number(r[2]) || 0;
            if (type === 'in' || type === 'รับเข้า') stockIn += amount;
            if (type === 'out' || type === 'จ่ายออก') stockOut += amount;
        });
    }
    let stockRemain = stockIn - stockOut;

    if (document.getElementById('dash_stockInCount')) document.getElementById('dash_stockInCount').innerText = stockIn.toLocaleString();
    if (document.getElementById('dash_stockOutCount')) document.getElementById('dash_stockOutCount').innerText = stockOut.toLocaleString();

    const dashRemainEl = document.getElementById('dash_stockRemainCount');
    if (dashRemainEl) {
        dashRemainEl.innerText = stockRemain.toLocaleString();
        if (stockRemain <= 0) dashRemainEl.className = "text-3xl font-black text-rose-500";
        else if (stockRemain <= 50) dashRemainEl.className = "text-3xl font-black text-amber-500";
        else dashRemainEl.className = "text-3xl font-black text-emerald-600";
    }
};

window.initDashWaterMap = function () {
    if (dashWaterMap) return;

    dashWaterMap = L.map('dashWaterMap').setView([6.29445, 101.72362], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(dashWaterMap);

    dashMarkerLayer.addTo(dashWaterMap);
};

window.updateDashWaterMapMarkers = function () {
    if (!dashWaterMap || !store.waterLevels) return;

    dashMarkerLayer.clearLayers();

    const latestData = {};
    store.waterLevels.forEach(r => {
        const loc = r[1];
        const time = new Date(r[0]).getTime();
        if (!latestData[loc] || time > latestData[loc].time) {
            latestData[loc] = { data: r, time: time };
        }
    });

    Object.values(latestData).forEach(item => {
        const r = item.data;
        const name = r[1];
        const level = parseFloat(r[2] || 0);
        let coordinateStr = String(r[5] || '').trim();
        if (!coordinateStr && window.waterPointsMap && window.waterPointsMap[name]) {
            coordinateStr = window.waterPointsMap[name];
        }

        let statusText = 'ปกติ', statusColor = 'bg-green-100 text-green-600';
        if (level >= 1 && level <= 30) { statusText = 'เฝ้าระวัง'; statusColor = 'bg-yellow-100 text-yellow-700'; }
        else if (level >= 31 && level <= 80) { statusText = 'เตือนภัย'; statusColor = 'bg-orange-100 text-orange-600'; }
        else if (level >= 81) { statusText = 'วิกฤต'; statusColor = 'bg-red-100 text-red-600'; }

        if (coordinateStr.includes(',')) {
            const [lat, lng] = coordinateStr.split(',').map(v => parseFloat(v.trim()));

            if (!isNaN(lat) && !isNaN(lng)) {
                const marker = L.marker([lat, lng], { icon: typeof getWaterIcon === 'function' ? getWaterIcon(level) : L.Icon.Default });

                const popupContent = `
                    <div class="font-sans">
                        <div class="px-4 py-2 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                            <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Live Report</span>
                            <span class="popup-badge ${statusColor}">${statusText}</span>
                        </div>
                        <div class="p-4 text-center">
                            <p class="text-[11px] font-bold text-slate-500 mb-1 leading-tight">${name}</p>
                            <div class="flex items-baseline justify-center space-x-1">
                                <span class="text-4xl font-black text-slate-800 tracking-tighter">${level}</span>
                                <span class="text-xs font-bold text-slate-400">ซม.</span>
                            </div>
                        </div>
                        <div class="px-4 py-2 bg-slate-50 text-center border-t border-slate-100">
                            <p class="text-[9px] text-slate-500 font-bold leading-tight">
                                <i class="far fa-calendar-alt mr-1 text-blue-400"></i> 
                                ${new Date(r[0]).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                                <span class="mx-1 text-slate-300">|</span>
                                <i class="far fa-clock mr-1 text-blue-400"></i> 
                                ${new Date(r[0]).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                            </p>
                        </div>
                    </div>
                `;

                marker.bindPopup(popupContent);
                dashMarkerLayer.addLayer(marker);
            }
        }
    });
};

window.initFloodReportMap = function () {
    if (floodReportMap) return;

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    });

    const esriSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    });

    floodReportMap = L.map('floodReportMap', {
        center: [6.29445, 101.72362],
        zoom: 14,
        layers: [osmLayer]
    });

    const baseLayers = {
        "แผนที่ปกติ (OpenStreetMap)": osmLayer,
        "ภาพดาวเทียม (Esri Satellite)": esriSatelliteLayer
    };

    const overlays = {
        "ตำแหน่งผู้ประสบภัย": floodMarkerLayer
    };

    L.control.layers(baseLayers, overlays, { position: 'topright' }).addTo(floodReportMap);
    floodMarkerLayer.addTo(floodReportMap);
};

window.toggleUnnumberedFilter = function () {
    showOnlyUnnumbered = !showOnlyUnnumbered;
    const btn = document.getElementById('floodUnnumberedFilterBtn');
    if (btn) {
        if (showOnlyUnnumbered) {
            btn.className = "px-4 py-3 border border-amber-500 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 shrink-0 bg-amber-50 text-amber-600 hover:bg-amber-100";
        } else {
            btn.className = "px-4 py-3 border border-slate-200 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 shrink-0 bg-slate-50 text-slate-600 hover:bg-slate-100";
        }
    }
    window.filterFloodMap();
};

window.handleRiskMapLoaded = function (img) {
    if (!img) return;
    img.dataset.fallbackStep = '0';
    img.classList.remove('hidden');
    const placeholder = document.getElementById('riskMapPlaceholder');
    if (placeholder) placeholder.classList.add('hidden');
};

window.handleRiskMapError = function (img) {
    if (!img) return;
    const currentSrc = img.src || '';
    if (!currentSrc || currentSrc === window.location.href || currentSrc.endsWith('/')) {
        img.classList.add('hidden');
        const p = document.getElementById('riskMapPlaceholder');
        if (p) p.classList.remove('hidden');
        return;
    }

    // สกัด Google Drive fileId เพื่อลอง Mirror สำรอง
    let fileId = '';
    const lh3Match = currentSrc.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
    const ucMatch = currentSrc.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (lh3Match && lh3Match[1]) fileId = lh3Match[1];
    else if (ucMatch && ucMatch[1]) fileId = ucMatch[1];

    const step = parseInt(img.dataset.fallbackStep || '0', 10);
    if (fileId && step === 0) {
        img.dataset.fallbackStep = '1';
        img.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
        return;
    } else if (fileId && step === 1) {
        img.dataset.fallbackStep = '2';
        img.src = `https://drive.google.com/uc?export=view&id=${fileId}`;
        return;
    }

    img.classList.add('hidden');
    const p = document.getElementById('riskMapPlaceholder');
    if (p) p.classList.remove('hidden');
};

window.openFullscreenRiskMap = function () {
    const img = document.getElementById('riskMapImg');
    if (!img || img.classList.contains('hidden') || !img.src) return;

    const overlay = document.createElement('div');
    overlay.id = 'riskMapFullscreenOverlay';
    overlay.className = 'fixed inset-0 bg-black/90 backdrop-blur-md z-[9999] flex items-center justify-center cursor-zoom-out opacity-0 transition-opacity duration-300';

    const fullImg = document.createElement('img');
    fullImg.referrerPolicy = 'no-referrer';
    fullImg.src = img.src;
    fullImg.className = 'max-w-[95%] max-h-[95%] object-contain rounded-lg shadow-2xl scale-95 transition-transform duration-300';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'absolute top-6 right-6 text-white/70 hover:text-white text-3xl font-bold bg-white/10 hover:bg-white/20 w-12 h-12 rounded-full flex items-center justify-center transition-all';
    closeBtn.innerHTML = '&times;';

    overlay.appendChild(fullImg);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        fullImg.classList.remove('scale-95');
    }, 10);

    const closeOverlay = () => {
        overlay.classList.add('opacity-0');
        fullImg.classList.add('scale-95');
        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 300);
    };

    overlay.addEventListener('click', closeOverlay);
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeOverlay();
    });
};

window.zoomToFloodMarker = function (name, lat, lng) {
    if (!floodReportMap) return;
    floodReportMap.setView([lat, lng], 18, { animate: true, duration: 1.5 });
    const md = window.floodMarkersMap ? window.floodMarkersMap[name] : null;
    if (md && md.marker) {
        md.marker.openPopup();
    }
};

window.getFloodRiskCategory = function (riskStr, detailsStr = '') {
    const r = String(riskStr || '').trim().toLowerCase();
    const d = String(detailsStr || '').trim().toLowerCase();

    // 1. หญิงตั้งครรภ์
    if (r.includes('ตั้งครรภ์') || r.includes('คนท้อง') || d.includes('ตั้งครรภ์') || d.includes('คนท้อง')) {
        return {
            key: 'pregnant',
            label: 'กลุ่มหญิงตั้งครรภ์',
            color: '#ec4899',
            shadowColor: 'rgba(236, 72, 153, 0.45)',
            badgeClass: 'bg-pink-100 text-pink-700 border border-pink-200',
            headerBg: 'from-pink-600 to-rose-500',
            headerText: 'text-white',
            badgeBg: 'bg-white/20 text-white',
            icon: 'fa-person-pregnant',
            extraClass: ''
        };
    }

    // 2. ผู้ป่วยฟอกไต
    if (r.includes('ฟอกไต') || r.includes('ล้างไต') || d.includes('ฟอกไต') || d.includes('ล้างไต')) {
        return {
            key: 'dialysis',
            label: 'กลุ่มผู้ป่วยฟอกไต',
            color: '#06b6d4',
            shadowColor: 'rgba(6, 182, 212, 0.45)',
            badgeClass: 'bg-cyan-100 text-cyan-800 border border-cyan-200',
            headerBg: 'from-cyan-600 to-teal-500',
            headerText: 'text-white',
            badgeBg: 'bg-white/20 text-white',
            icon: 'fa-stethoscope',
            extraClass: ''
        };
    }

    // 3. กลุ่มเปราะบาง
    if (r.includes('กลุ่มเปราะบาง') || r.includes('เปราะบาง') || d.includes('กลุ่มเปราะบาง') || d.includes('เปราะบาง')) {
        return {
            key: 'vulnerable',
            label: 'กลุ่มเปราะบาง',
            color: '#ef4444',
            shadowColor: 'rgba(239, 68, 68, 0.5)',
            badgeClass: 'bg-red-100 text-red-600 border border-red-200',
            headerBg: 'from-red-600 to-rose-500',
            headerText: 'text-white',
            badgeBg: 'bg-red-950/30 text-red-100',
            icon: 'fa-baby',
            extraClass: 'critical-pulse'
        };
    }

    // 4. ผู้พิการ / ผู้สูงอายุ / ติดเตียง
    if (r.includes('ผู้พิการ') || r.includes('ผู้สูงอายุ') || r.includes('สูงอายุ') || r.includes('พิการ') || r.includes('ติดเตียง') || d.includes('ติดเตียง')) {
        return {
            key: 'elderly_disabled',
            label: 'กลุ่มผู้พิการ/ผู้สูงอายุ',
            color: '#f59e0b',
            shadowColor: 'rgba(245, 158, 11, 0.45)',
            badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200',
            headerBg: 'from-amber-400 to-yellow-500',
            headerText: 'text-slate-900',
            badgeBg: 'bg-yellow-950/10 text-slate-900',
            icon: 'fa-wheelchair',
            extraClass: ''
        };
    }

    // 5. ปกติ
    return {
        key: 'normal',
        label: 'ปกติ',
        color: '#3b82f6',
        shadowColor: 'rgba(59, 130, 246, 0.4)',
        badgeClass: 'bg-blue-100 text-blue-700 border border-blue-200',
        headerBg: 'from-blue-600 to-indigo-500',
        headerText: 'text-white',
        badgeBg: 'bg-white/20 text-white',
        icon: 'fa-home',
        extraClass: ''
    };
};

window.filterFloodMap = function () {
    if (!floodReportMap) return;

    floodMarkerLayer.clearLayers();
    window.floodMarkersMap = {};

    const searchInput = document.getElementById('floodSearchInput');
    const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const riskFilter = document.getElementById('floodRiskFilter');
    const riskVal = riskFilter ? riskFilter.value : 'all';

    const floodData = (store.floodData && store.floodData.length > 0) ? store.floodData : [];
    const headers = floodData[0] || [];
    const findColIdx = (kws) => {
        return headers.findIndex(h => {
            const clean = String(h || '').trim().toLowerCase();
            return kws.some(kw => clean.includes(kw.toLowerCase()) || kw.toLowerCase().includes(clean));
        });
    };

    const houseIdIdx = findColIdx(['house id', 'house_id', 'รหัสบ้าน']);
    const roadIdx = findColIdx(['ถนน', 'road']);
    const addressIdx = findColIdx(['ที่อยู่', 'address']);
    const nameIdx = findColIdx(['ชื่อ-สกุล', 'ชื่อสกุล', 'ชื่อ', 'name']);
    const statusIdx = findColIdx(['สถานะ', 'status']);
    const residentsIdx = findColIdx(['จำนวนผู้อาศัย', 'ประชากร', 'จำนวนสมาชิก', 'สมาชิก', 'people', 'members', 'population', 'residents']);
    const contactIdx = findColIdx(['ติดต่อ', 'เบอร์', 'phone', 'contact']);
    const latIdx = findColIdx(['latitude', 'ละติจูด', 'lat']);
    const lngIdx = findColIdx(['longtitude', 'longitude', 'ลองจิจูด', 'lng']);
    const riskIdx = findColIdx(['ความเสี่ยง', 'risk']);
    const detailsIdx = findColIdx(['รายละเอียด', 'note', 'detail', 'details']);
    const idIdx = findColIdx(['id', 'rowid', 'row_id']);

    const isSuperadmin = (typeof userRole !== 'undefined' && userRole === 'superadmin');
    const thActions = document.getElementById('thFloodDataActions');
    if (thActions) {
        if (isSuperadmin) thActions.classList.remove('hidden');
        else thActions.classList.add('hidden');
    }

    const rows = floodData.slice(1);
    let filteredRows = [];

    rows.forEach((r, idx) => {
        const name = nameIdx !== -1 ? String(r[nameIdx] || '').trim() : 'ไม่ระบุชื่อ';
        const road = roadIdx !== -1 ? String(r[roadIdx] || '').trim() : '';
        const address = addressIdx !== -1 ? String(r[addressIdx] || '').trim() : 'ไม่ระบุที่อยู่';
        const status = statusIdx !== -1 ? String(r[statusIdx] || '').trim() : '';
        const risk = riskIdx !== -1 ? String(r[riskIdx] || '').trim() : '';
        const houseId = houseIdIdx !== -1 ? String(r[houseIdIdx] || '').trim() : '';
        const residents = residentsIdx !== -1 ? (parseInt(r[residentsIdx]) || 1) : 1;
        const contact = contactIdx !== -1 ? String(r[contactIdx] || '').trim() : '';
        const details = detailsIdx !== -1 ? String(r[detailsIdx] || '').trim() : '';
        const rowId = idIdx !== -1 ? String(r[idIdx] || '').trim() : '';

        let isUnnumbered = false;
        if (status.includes('ไม่มีเลขที่') || status.includes('ไม่มี') || address.includes('ไม่มีเลขที่')) {
            isUnnumbered = true;
        }

        if (showOnlyUnnumbered && !isUnnumbered) return;

        const cat = window.getFloodRiskCategory(risk, details);

        if (riskVal !== 'all') {
            if (riskVal === 'กลุ่มเปราะบาง' && cat.key !== 'vulnerable') return;
            if (riskVal === 'กลุ่มผู้พิการ/ผู้สูงอายุ' && cat.key !== 'elderly_disabled') return;
            if (riskVal === 'กลุ่มหญิงตั้งครรภ์' && cat.key !== 'pregnant') return;
            if (riskVal === 'กลุ่มผู้ป่วยฟอกไต' && cat.key !== 'dialysis') return;
            if (riskVal === 'ปกติ' && cat.key !== 'normal') return;
        }

        if (searchVal) {
            let cleanSearchVal = searchVal;
            if (cleanSearchVal.startsWith("ถนน")) cleanSearchVal = cleanSearchVal.substring(4).trim();
            else if (cleanSearchVal.startsWith("ถ.")) cleanSearchVal = cleanSearchVal.substring(2).trim();

            const nameMatch = name.toLowerCase().includes(searchVal);
            const addressMatch = address.toLowerCase().includes(searchVal);
            const roadMatch = road.toLowerCase().includes(searchVal) || (cleanSearchVal && road.toLowerCase().includes(cleanSearchVal));
            const houseIdMatch = houseId.toLowerCase().includes(searchVal);
            if (!nameMatch && !addressMatch && !roadMatch && !houseIdMatch) return;
        }

        const rowItem = {
            id: rowId,
            originalIndex: idx + 1,
            houseId, name, road, address, status, risk, residents, contact, details, isUnnumbered, cat
        };
        filteredRows.push(rowItem);

        let lat = NaN, lng = NaN;
        if (latIdx !== -1 && lngIdx !== -1) {
            lat = parseFloat(r[latIdx]);
            lng = parseFloat(r[lngIdx]);
        } else {
            const possibleCoordCols = [latIdx, lngIdx, addressIdx].filter(i => i !== -1);
            for (let i of possibleCoordCols) {
                const val = String(r[i] || '').trim();
                if (val.includes(',')) {
                    const parts = val.split(',');
                    const pLat = parseFloat(parts[0]);
                    const pLng = parseFloat(parts[1]);
                    if (!isNaN(pLat) && !isNaN(pLng)) {
                        lat = pLat;
                        lng = pLng;
                        break;
                    }
                }
            }
        }

        if (!isNaN(lat) && !isNaN(lng)) {
            rowItem.lat = lat;
            rowItem.lng = lng;

            const markerIcon = L.divIcon({
                className: 'custom-flood-marker',
                html: `
                    <div class="${cat.extraClass}" style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background-color: ${cat.color}; 
                        width: 22px; 
                        height: 22px; 
                        border-radius: 50%; 
                        border: 2px solid white; 
                        box-shadow: 0 0 0 3px ${cat.shadowColor}, 0 2px 8px rgba(0,0,0,0.25);
                        color: white;
                        font-size: 10px;
                    ">
                        <i class="fas ${cat.icon}"></i>
                    </div>
                `,
                iconSize: [26, 26],
                iconAnchor: [13, 13]
            });

            const marker = L.marker([lat, lng], { icon: markerIcon });

            const encodedRow = encodeURIComponent(JSON.stringify(rowItem));
            const safeName = name.replace(/'/g, "\\'");
            const safeAddr = address.replace(/'/g, "\\'");

            const superadminPopupFooter = isSuperadmin ? `
                <div class="flex gap-2 pt-2.5 border-t border-slate-100">
                    <button onclick="openEditFloodDataModal('${rowId}', '${encodedRow}')" 
                        class="flex-1 py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition">
                        <i class="fas fa-edit"></i> แก้ไข
                    </button>
                    <button onclick="confirmDeleteFloodData('${rowId}', '${safeName}', '${safeAddr}', ${idx + 1})" 
                        class="flex-1 py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition">
                        <i class="fas fa-trash-alt"></i> ลบ
                    </button>
                </div>
            ` : '';

            const popupContent = `
                <div class="font-sans text-slate-700 min-w-[240px] rounded-2xl overflow-hidden shadow-lg border border-slate-100 bg-white">
                    <div class="px-4 py-2.5 flex justify-between items-center bg-gradient-to-r ${cat.headerBg} ${cat.headerText}">
                        <span class="text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-1.5">
                            <i class="fas ${cat.icon}"></i> ข้อมูลครัวเรือน
                        </span>
                        <span class="text-[9px] font-black px-2.5 py-0.5 rounded-full ${cat.badgeBg} shadow-sm border border-white/10">
                            ${cat.label}
                        </span>
                    </div>
                    <div class="p-4 space-y-3">
                        <div>
                            <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider block">ชื่อ-สกุลผู้ประสบภัย</span>
                            <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                                <i class="far fa-user text-blue-500 shrink-0"></i> ${name}
                            </span>
                        </div>
                        <div>
                            <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider block">ที่อยู่ / ถนน</span>
                            <span class="text-[11px] font-medium text-slate-600 flex items-start gap-1.5 mt-0.5 leading-normal">
                                <i class="fas fa-map-marker-alt text-rose-500 shrink-0 mt-0.5"></i> 
                                <span>${address}${road ? ' ถ.' + road : ''}</span>
                            </span>
                        </div>
                        ${details ? `
                        <div class="pt-2 border-t border-slate-50">
                            <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider block">รายละเอียด</span>
                            <span class="text-[10px] text-slate-500 flex items-start gap-1.5 mt-0.5 leading-tight">
                                <i class="fas fa-info-circle text-indigo-400 shrink-0 mt-0.5"></i>
                                <span>${details}</span>
                            </span>
                        </div>
                        ` : ''}
                        <div class="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-100 text-center">
                            <div class="bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                                <span class="text-[8px] font-black text-slate-400 block uppercase">จำนวนสมาชิก</span>
                                <span class="text-xs font-extrabold text-slate-700 mt-0.5 block">${residents} คน</span>
                            </div>
                            <div class="bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                                <span class="text-[8px] font-black text-slate-400 block uppercase">ติดต่อ</span>
                                <span class="text-[10px] font-bold text-blue-600 mt-0.5 block truncate" title="${contact || 'ไม่มีเบอร์'}">
                                    <i class="fas fa-phone mr-0.5"></i> ${contact || '-'}
                                </span>
                            </div>
                        </div>
                        ${superadminPopupFooter}
                    </div>
                </div>
            `;

            marker.bindPopup(popupContent);
            floodMarkerLayer.addLayer(marker);

            window.floodMarkersMap[name] = { marker, lat, lng, address, road };
        }
    });

    let tableHtml = '';
    filteredRows.forEach(row => {
        const fullAddress = `${row.address}${row.road ? ' ถ.' + row.road : ''}`;
        const markerData = window.floodMarkersMap ? window.floodMarkersMap[row.name] : null;
        const clickAttr = markerData ? `onclick="zoomToFloodMarker('${row.name.replace(/'/g, "\\'")}', ${markerData.lat}, ${markerData.lng})"` : '';
        const cursorClass = markerData ? 'cursor-pointer hover:text-blue-600 transition-colors' : '';

        const encodedRow = encodeURIComponent(JSON.stringify(row));
        const safeName = row.name.replace(/'/g, "\\'");
        const safeAddr = row.address.replace(/'/g, "\\'");

        const superadminCell = isSuperadmin ? `
            <td class="p-3 whitespace-nowrap text-center">
                <div class="inline-flex items-center gap-1.5">
                    <button onclick="openEditFloodDataModal('${row.id || ''}', '${encodedRow}')" 
                        class="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 flex items-center gap-1" title="แก้ไขข้อมูล">
                        <i class="fas fa-edit"></i>
                        <span class="hidden sm:inline">แก้ไข</span>
                    </button>
                    <button onclick="confirmDeleteFloodData('${row.id || ''}', '${safeName}', '${safeAddr}', ${row.originalIndex})" 
                        class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 flex items-center gap-1" title="ลบข้อมูล">
                        <i class="fas fa-trash-alt"></i>
                        <span class="hidden sm:inline">ลบ</span>
                    </button>
                </div>
            </td>
        ` : '';

        tableHtml += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="p-4 whitespace-nowrap font-bold text-slate-800 ${cursorClass}" ${clickAttr}>
                    ${markerData ? `<i class="fas fa-search-location text-[10px] mr-1.5 text-blue-500"></i>` : ''}${row.name}
                </td>
                <td class="p-4 whitespace-nowrap text-slate-700">${fullAddress}</td>
                <td class="p-4 whitespace-nowrap text-center">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${row.cat.badgeClass}">
                        <i class="fas ${row.cat.icon} text-[9px]"></i> ${row.cat.label}
                    </span>
                </td>
                <td class="p-4 whitespace-nowrap text-center font-sans font-bold text-slate-600">${row.residents} คน</td>
                ${superadminCell}
            </tr>
        `;
    });

    const colSpanCount = isSuperadmin ? 5 : 4;
    const tableBody = document.getElementById('floodTableBody');
    if (tableBody) {
        tableBody.innerHTML = tableHtml || `
            <tr>
                <td colspan="${colSpanCount}" class="p-8 text-center text-slate-400 font-bold whitespace-nowrap">
                    <i class="fas fa-inbox text-2xl mb-2 block"></i>ไม่พบข้อมูลผู้ประสบภัยที่ตรงตามเงื่อนไข
                </td>
            </tr>
        `;
    }

    const tableCount = document.getElementById('floodTableCount');
    if (tableCount) tableCount.innerText = `${filteredRows.length} ครัวเรือน`;
};

window.renderFloodReportDashboard = function () {
    let totalHouseholds = 0;
    let totalPopulation = 0;
    let totalNoHouseNumber = 0;
    let totalVulnerable = 0;
    let totalElderlyDisabled = 0;
    let totalPregnant = 0;
    let totalDialysis = 0;

    const floodData = (store.floodData && store.floodData.length > 0) ? store.floodData : [];
    const headers = floodData[0] || [];
    const findColIdx = (kws) => {
        return headers.findIndex(h => {
            const clean = String(h || '').trim().toLowerCase();
            return kws.some(kw => clean.includes(kw.toLowerCase()) || kw.toLowerCase().includes(clean));
        });
    };

    const houseIdIdx = findColIdx(['house id', 'house_id', 'รหัสบ้าน']);
    const roadIdx = findColIdx(['ถนน', 'road']);
    const addressIdx = findColIdx(['ที่อยู่', 'address']);
    const nameIdx = findColIdx(['ชื่อ-สกุล', 'ชื่อสกุล', 'ชื่อ', 'name']);
    const statusIdx = findColIdx(['สถานะ', 'status']);
    const residentsIdx = findColIdx(['จำนวนผู้อาศัย', 'ประชากร', 'จำนวนสมาชิก', 'สมาชิก', 'people', 'members', 'population', 'residents']);
    const riskIdx = findColIdx(['ความเสี่ยง', 'risk']);
    const detailsIdx = findColIdx(['รายละเอียด', 'note', 'detail', 'details']);

    const rows = floodData.slice(1);
    const suggestionsSet = new Set();
    const roadsSet = new Set();

    rows.forEach(r => {
        totalHouseholds++;

        if (residentsIdx !== -1) {
            totalPopulation += parseInt(r[residentsIdx]) || 1;
        } else {
            totalPopulation += 1;
        }

        let isUnnumbered = false;
        const statusStr = statusIdx !== -1 ? String(r[statusIdx] || '').trim().toLowerCase() : '';
        const addressStr = addressIdx !== -1 ? String(r[addressIdx] || '').trim().toLowerCase() : '';
        if (statusStr.includes('ไม่มีเลขที่') || statusStr.includes('ไม่มี') || addressStr.includes('ไม่มีเลขที่')) {
            isUnnumbered = true;
        }
        if (isUnnumbered) totalNoHouseNumber++;

        const riskStr = riskIdx !== -1 ? String(r[riskIdx] || '').trim() : '';
        const detailsStr = detailsIdx !== -1 ? String(r[detailsIdx] || '').trim() : '';

        const cat = window.getFloodRiskCategory(riskStr, detailsStr);
        if (cat.key === 'pregnant') totalPregnant++;
        else if (cat.key === 'dialysis') totalDialysis++;
        else if (cat.key === 'vulnerable') totalVulnerable++;
        else if (cat.key === 'elderly_disabled') totalElderlyDisabled++;

        const nameVal = nameIdx !== -1 ? String(r[nameIdx] || '').trim() : '';
        const roadVal = roadIdx !== -1 ? String(r[roadIdx] || '').trim() : '';
        const addressVal = addressIdx !== -1 ? String(r[addressIdx] || '').trim() : '';
        const houseIdVal = houseIdIdx !== -1 ? String(r[houseIdIdx] || '').trim() : '';

        if (nameVal) suggestionsSet.add(nameVal);
        if (addressVal) suggestionsSet.add(addressVal);
        if (roadVal) {
            suggestionsSet.add(roadVal);
            roadsSet.add(roadVal);
        }
        if (houseIdVal) suggestionsSet.add(houseIdVal);
    });

    // รวมชื่อถนนจาก ZONE_RULES เข้า datalist ด้วย
    if (window.ZONE_RULES) {
        Object.values(window.ZONE_RULES).forEach(roads => {
            if (Array.isArray(roads)) {
                roads.forEach(rd => roadsSet.add(rd.replace(/^ถนน/, '').trim()));
            }
        });
    }

    // อัปเดต datalist ของถนน
    const roadDatalist = document.getElementById('floodRoadList');
    if (roadDatalist) {
        roadDatalist.innerHTML = Array.from(roadsSet).sort().map(rd => `<option value="${rd}">`).join('');
    }

    window.floodSuggestionsList = Array.from(suggestionsSet);

    if (document.getElementById('flood_statHouseholds')) document.getElementById('flood_statHouseholds').innerText = totalHouseholds.toLocaleString();
    if (document.getElementById('flood_statPopulation')) document.getElementById('flood_statPopulation').innerText = totalPopulation.toLocaleString();
    if (document.getElementById('flood_statNoHouseNumber')) document.getElementById('flood_statNoHouseNumber').innerText = totalNoHouseNumber.toLocaleString();
    if (document.getElementById('flood_statVulnerable')) document.getElementById('flood_statVulnerable').innerText = totalVulnerable.toLocaleString();
    if (document.getElementById('flood_statElderlyDisabled')) document.getElementById('flood_statElderlyDisabled').innerText = totalElderlyDisabled.toLocaleString();
    if (document.getElementById('flood_statPregnant')) document.getElementById('flood_statPregnant').innerText = totalPregnant.toLocaleString();
    if (document.getElementById('flood_statDialysis')) document.getElementById('flood_statDialysis').innerText = totalDialysis.toLocaleString();

    // ควบคุมการแสดงผลปุ่มสำหรับ Superadmin เท่านั้น
    const isSuperadmin = (typeof userRole !== 'undefined' && userRole === 'superadmin');
    const btnAddFloodData = document.getElementById('btnOpenAddFloodDataModal');
    if (btnAddFloodData) {
        if (isSuperadmin) btnAddFloodData.classList.remove('hidden');
        else btnAddFloodData.classList.add('hidden');
    }
    const thActions = document.getElementById('thFloodDataActions');
    if (thActions) {
        if (isSuperadmin) thActions.classList.remove('hidden');
        else thActions.classList.add('hidden');
    }

    const img = document.getElementById('riskMapImg');
    const placeholder = document.getElementById('riskMapPlaceholder');
    let mapUrl = store.riskMapImageUrl || '';
    if (!mapUrl) {
        try { mapUrl = localStorage.getItem('risk_map_image_url') || ''; } catch (e) {}
    }
    if (!mapUrl) {
        mapUrl = 'https://lh3.googleusercontent.com/d/1tIGTXKoPI88Y_7-NSISSGPCuFy31Cfeh';
    }
    if (mapUrl.includes('drive.google.com/uc') || mapUrl.includes('docs.google.com/uc')) {
        const match = mapUrl.match(/[?&]id=([^&]+)/);
        if (match && match[1]) {
            mapUrl = 'https://lh3.googleusercontent.com/d/' + match[1];
        }
    }

    if (mapUrl && img) {
        img.referrerPolicy = 'no-referrer';
        img.dataset.fallbackStep = '0';
        img.src = mapUrl;
        img.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');
    } else if (img) {
        img.classList.add('hidden');
        if (placeholder) placeholder.classList.remove('hidden');
    }

    const uploadEl = document.getElementById('riskMapAdminUpload');
    if (uploadEl) {
        if (isSuperadmin) {
            uploadEl.classList.remove('hidden');
        } else {
            uploadEl.classList.add('hidden');
        }
    }

    window.filterFloodMap();
};

// ==========================================
// 📝 ระบบ Modal เพิ่ม / แก้ไข / ลบ ข้อมูลผู้ประสบภัยน้ำท่วม (Superadmin Only)
// ==========================================

window.openAddFloodDataModal = function () {
    if (typeof userRole !== 'undefined' && userRole !== 'superadmin') {
        Swal.fire('สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบระดับ Superadmin เท่านั้นที่สามารถเพิ่มข้อมูลได้', 'warning');
        return;
    }

    const form = document.getElementById('floodDataForm');
    if (form) form.reset();

    document.getElementById('floodForm_id').value = '';
    document.getElementById('floodForm_originalIndex').value = '';
    document.getElementById('floodForm_oldName').value = '';
    document.getElementById('floodForm_oldAddress').value = '';
    document.getElementById('floodForm_status').value = 'เจ้าบ้าน';
    document.getElementById('floodForm_risk').value = 'ปกติ';
    document.getElementById('floodForm_residents').value = '1';

    const modalTitle = document.getElementById('floodModalTitle');
    if (modalTitle) modalTitle.innerText = 'เพิ่มข้อมูลผู้ประสบภัยน้ำท่วม';
    const modalIcon = document.getElementById('floodModalIcon');
    if (modalIcon) modalIcon.className = 'fas fa-user-plus text-xl';

    const hint = document.getElementById('mapPickHint');
    if (hint) hint.classList.add('hidden');

    const modal = document.getElementById('floodDataModal');
    if (modal) modal.classList.remove('hidden');
};

window.openEditFloodDataModal = function (rowId, rowDataEncoded) {
    if (typeof userRole !== 'undefined' && userRole !== 'superadmin') {
        Swal.fire('สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบระดับ Superadmin เท่านั้นที่สามารถแก้ไขข้อมูลได้', 'warning');
        return;
    }

    let data = {};
    try {
        data = JSON.parse(decodeURIComponent(rowDataEncoded));
    } catch (e) {
        console.error("Parse row data error:", e);
        return;
    }

    document.getElementById('floodForm_id').value = rowId || data.id || '';
    document.getElementById('floodForm_originalIndex').value = data.originalIndex || '';
    document.getElementById('floodForm_oldName').value = data.name || '';
    document.getElementById('floodForm_oldAddress').value = data.address || '';

    document.getElementById('floodForm_name').value = data.name || '';
    document.getElementById('floodForm_address').value = data.address || '';
    document.getElementById('floodForm_road').value = data.road || '';
    document.getElementById('floodForm_status').value = data.status || 'เจ้าบ้าน';
    document.getElementById('floodForm_residents').value = data.residents || 1;
    document.getElementById('floodForm_contact').value = data.contact || '';
    document.getElementById('floodForm_lat').value = data.lat !== undefined ? data.lat : '';
    document.getElementById('floodForm_lng').value = data.lng !== undefined ? data.lng : '';
    document.getElementById('floodForm_details').value = data.details || '';

    // แมปค่าความเสี่ยงเดิม
    const riskSelect = document.getElementById('floodForm_risk');
    if (riskSelect) {
        const cat = data.cat ? data.cat.key : '';
        if (cat === 'pregnant') riskSelect.value = 'กลุ่มหญิงตั้งครรภ์';
        else if (cat === 'dialysis') riskSelect.value = 'กลุ่มผู้ป่วยฟอกไต';
        else if (cat === 'vulnerable') riskSelect.value = 'กลุ่มเปราะบาง';
        else if (cat === 'elderly_disabled') riskSelect.value = 'กลุ่มผู้พิการ/ผู้สูงอายุ';
        else if (data.risk && ['ปกติ', 'กลุ่มเปราะบาง', 'กลุ่มผู้พิการ/ผู้สูงอายุ', 'กลุ่มหญิงตั้งครรภ์', 'กลุ่มผู้ป่วยฟอกไต'].includes(data.risk)) {
            riskSelect.value = data.risk;
        } else {
            riskSelect.value = 'ปกติ';
        }
    }

    const modalTitle = document.getElementById('floodModalTitle');
    if (modalTitle) modalTitle.innerText = 'แก้ไขข้อมูลผู้ประสบภัยน้ำท่วม';
    const modalIcon = document.getElementById('floodModalIcon');
    if (modalIcon) modalIcon.className = 'fas fa-user-pen text-xl';

    const hint = document.getElementById('mapPickHint');
    if (hint) hint.classList.add('hidden');

    const modal = document.getElementById('floodDataModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeFloodDataModal = function () {
    const modal = document.getElementById('floodDataModal');
    if (modal) modal.classList.add('hidden');
};

window.getCurrentGpsForFloodForm = function () {
    if (!navigator.geolocation) {
        Swal.fire('แจ้งเตือน', 'อุปกรณ์หรือเบราว์เซอร์ไม่รองรับการดึงพิกัด GPS', 'warning');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude.toFixed(6);
            const lng = pos.coords.longitude.toFixed(6);
            document.getElementById('floodForm_lat').value = lat;
            document.getElementById('floodForm_lng').value = lng;
            Swal.fire({
                title: 'ดึงพิกัดสำเร็จ',
                text: `พิกัดปัจจุบัน: ${lat}, ${lng}`,
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
                customClass: { popup: 'rounded-[2rem]' }
            });
        },
        (err) => {
            Swal.fire('ไม่สามารถดึงพิกัดได้', err.message || 'โปรดเปิดสิทธิ์เข้าถึงตำแหน่งที่ตั้งในเบราว์เซอร์', 'error');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
};

window.enableMapPickForFloodForm = function () {
    if (!floodReportMap) {
        Swal.fire('ข้อผิดพลาด', 'แผนที่ยังโหลดไม่พร้อมใช้งาน', 'error');
        return;
    }

    const modal = document.getElementById('floodDataModal');
    if (modal) modal.classList.add('hidden');

    const hint = document.getElementById('mapPickHint');
    if (hint) hint.classList.remove('hidden');

    const mapEl = document.getElementById('floodReportMap');
    if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    Swal.fire({
        title: '📍 คลิกตำแหน่งบนแผนที่',
        text: 'โปรดคลิกบนแผนที่เพื่อเลือกพิกัดของบ้านผู้ประสบภัย',
        icon: 'info',
        timer: 2000,
        showConfirmButton: false,
        customClass: { popup: 'rounded-[2rem]' }
    });

    floodReportMap.once('click', function (e) {
        const lat = e.latlng.lat.toFixed(6);
        const lng = e.latlng.lng.toFixed(6);

        document.getElementById('floodForm_lat').value = lat;
        document.getElementById('floodForm_lng').value = lng;

        if (modal) modal.classList.remove('hidden');

        Swal.fire({
            title: 'เลือกพิกัดแล้ว',
            text: `พิกัดที่เลือก: ${lat}, ${lng}`,
            icon: 'success',
            timer: 1500,
            showConfirmButton: false,
            customClass: { popup: 'rounded-[2rem]' }
        });
    });
};

window.handleFloodDataFormSubmit = async function (e) {
    e.preventDefault();

    if (typeof userRole !== 'undefined' && userRole !== 'superadmin') {
        Swal.fire('สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบระดับ Superadmin เท่านั้นที่สามารถบันทึกข้อมูลได้', 'warning');
        return;
    }

    const id = document.getElementById('floodForm_id').value.trim();
    const originalIndex = parseInt(document.getElementById('floodForm_originalIndex').value) || 0;
    const oldName = document.getElementById('floodForm_oldName').value.trim();
    const oldAddress = document.getElementById('floodForm_oldAddress').value.trim();

    const name = document.getElementById('floodForm_name').value.trim();
    const address = document.getElementById('floodForm_address').value.trim();
    const road = document.getElementById('floodForm_road').value.trim();
    const status = document.getElementById('floodForm_status').value.trim();
    const risk = document.getElementById('floodForm_risk').value.trim();
    const residents = parseInt(document.getElementById('floodForm_residents').value) || 1;
    const contact = document.getElementById('floodForm_contact').value.trim();
    const lat = document.getElementById('floodForm_lat').value.trim();
    const lng = document.getElementById('floodForm_lng').value.trim();
    const details = document.getElementById('floodForm_details').value.trim();

    if (!name || !address) {
        Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุชื่อ-สกุล และที่อยู่ให้ชัดเจน', 'warning');
        return;
    }

    const btnSubmit = document.getElementById('btnSubmitFloodForm');
    const oldBtnText = btnSubmit ? btnSubmit.innerHTML : '';
    if (btnSubmit) {
        btnSubmit.innerHTML = '<i class="fas fa-spinner animate-spin"></i> กำลังบันทึก...';
        btnSubmit.disabled = true;
    }

    const payload = {
        id, originalIndex, oldName, oldAddress,
        name, address, road, status, risk, residents, contact, lat, lng, details
    };

    const targetPeriod = (typeof currentPeriod !== 'undefined' && currentPeriod) ? currentPeriod : '2569';

    try {
        if (typeof sbSaveFloodDataRecord === 'function') {
            await sbSaveFloodDataRecord(payload, targetPeriod);
        }

        // อัปเดตข้อมูลในหน่วยความจำ store.floodData
        if (!store.floodData || store.floodData.length === 0) {
            store.floodData = [[
                'ถนน', 'ที่อยู่', 'ชื่อ-สกุล', 'สถานะ', 'จำนวนผู้อาศัย',
                'ติดต่อ', 'Latitude', 'Longtitude', 'ความเสี่ยง', 'รายละเอียด'
            ]];
        }

        const headers = store.floodData[0] || [];
        const findColIdx = (kws) => {
            return headers.findIndex(h => {
                const clean = String(h || '').trim().toLowerCase();
                return kws.some(kw => clean.includes(kw.toLowerCase()) || kw.toLowerCase().includes(clean));
            });
        };

        const roadIdx = findColIdx(['ถนน', 'road']);
        const addressIdx = findColIdx(['ที่อยู่', 'address']);
        const nameIdx = findColIdx(['ชื่อ-สกุล', 'ชื่อสกุล', 'ชื่อ', 'name']);
        const statusIdx = findColIdx(['สถานะ', 'status']);
        const residentsIdx = findColIdx(['จำนวนผู้อาศัย', 'ประชากร', 'จำนวนสมาชิก', 'สมาชิก']);
        const contactIdx = findColIdx(['ติดต่อ', 'เบอร์', 'phone']);
        const latIdx = findColIdx(['latitude', 'ละติจูด', 'lat']);
        const lngIdx = findColIdx(['longtitude', 'longitude', 'ลองจิจูด', 'lng']);
        const riskIdx = findColIdx(['ความเสี่ยง', 'risk']);
        const detailsIdx = findColIdx(['รายละเอียด', 'note', 'detail']);
        const idIdx = findColIdx(['id']);

        let targetRowIdx = -1;
        if (id && idIdx !== -1) {
            targetRowIdx = store.floodData.findIndex((r, idx) => idx > 0 && String(r[idIdx]) === id);
        }
        if (targetRowIdx === -1 && originalIndex > 0 && originalIndex < store.floodData.length) {
            targetRowIdx = originalIndex;
        }
        if (targetRowIdx === -1 && oldName && oldAddress) {
            targetRowIdx = store.floodData.findIndex((r, idx) => idx > 0 && String(r[nameIdx] || '').trim() === oldName && String(r[addressIdx] || '').trim() === oldAddress);
        }

        if (targetRowIdx > 0) {
            // อัปเดตแถวเดิม
            const row = store.floodData[targetRowIdx];
            if (roadIdx !== -1) row[roadIdx] = road;
            if (addressIdx !== -1) row[addressIdx] = address;
            if (nameIdx !== -1) row[nameIdx] = name;
            if (statusIdx !== -1) row[statusIdx] = status;
            if (residentsIdx !== -1) row[residentsIdx] = residents;
            if (contactIdx !== -1) row[contactIdx] = contact;
            if (latIdx !== -1) row[latIdx] = lat;
            if (lngIdx !== -1) row[lngIdx] = lng;
            if (riskIdx !== -1) row[riskIdx] = risk;
            if (detailsIdx !== -1) row[detailsIdx] = details;
        } else {
            // สร้างแถวใหม่ตามลำดับคอลัมน์ของ headers
            const newRow = new Array(headers.length).fill('');
            if (roadIdx !== -1) newRow[roadIdx] = road;
            if (addressIdx !== -1) newRow[addressIdx] = address;
            if (nameIdx !== -1) newRow[nameIdx] = name;
            if (statusIdx !== -1) newRow[statusIdx] = status;
            if (residentsIdx !== -1) newRow[residentsIdx] = residents;
            if (contactIdx !== -1) newRow[contactIdx] = contact;
            if (latIdx !== -1) newRow[latIdx] = lat;
            if (lngIdx !== -1) newRow[lngIdx] = lng;
            if (riskIdx !== -1) newRow[riskIdx] = risk;
            if (detailsIdx !== -1) newRow[detailsIdx] = details;
            if (idIdx !== -1 && id) newRow[idIdx] = id;
            store.floodData.push(newRow);
        }

        window.closeFloodDataModal();

        Swal.fire({
            title: 'บันทึกสำเร็จ',
            text: 'ข้อมูลผู้ประสบภัยน้ำท่วมถูกบันทึกเรียบร้อยแล้ว',
            icon: 'success',
            timer: 1800,
            showConfirmButton: false,
            customClass: { popup: 'rounded-[2rem]' }
        });

        // รีเรนเดอร์แดชบอร์ดและแผนที่ทันที
        window.renderFloodReportDashboard();

    } catch (err) {
        console.error("Save flood data error:", err);
        Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
        if (btnSubmit) {
            btnSubmit.innerHTML = oldBtnText;
            btnSubmit.disabled = false;
        }
    }
};

window.confirmDeleteFloodData = async function (rowId, name, address, originalIndex) {
    if (typeof userRole !== 'undefined' && userRole !== 'superadmin') {
        Swal.fire('สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ดูแลระบบระดับ Superadmin เท่านั้นที่สามารถลบข้อมูลได้', 'warning');
        return;
    }

    const result = await Swal.fire({
        title: 'ยืนยันการลบข้อมูล?',
        html: `ต้องการลบข้อมูลของ <b>${name || 'ผู้ประสบภัย'}</b><br><span class="text-xs text-slate-500">${address || ''}</span> หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ใช่, ลบข้อมูล',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        customClass: { popup: 'rounded-[2rem]' }
    });

    if (!result.isConfirmed) return;

    Swal.fire({
        title: 'กำลังลบข้อมูล...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
        customClass: { popup: 'rounded-[2rem]' }
    });

    const targetPeriod = (typeof currentPeriod !== 'undefined' && currentPeriod) ? currentPeriod : '2569';

    try {
        if (typeof sbDeleteFloodDataRecord === 'function') {
            await sbDeleteFloodDataRecord({ id: rowId, name, address, originalIndex }, targetPeriod);
        }

        // ลบออกจาก store.floodData
        if (store.floodData && store.floodData.length > 1) {
            const headers = store.floodData[0] || [];
            const findColIdx = (kws) => {
                return headers.findIndex(h => {
                    const clean = String(h || '').trim().toLowerCase();
                    return kws.some(kw => clean.includes(kw.toLowerCase()) || kw.toLowerCase().includes(clean));
                });
            };
            const idIdx = findColIdx(['id']);
            const nameIdx = findColIdx(['ชื่อ-สกุล', 'ชื่อสกุล', 'ชื่อ', 'name']);
            const addressIdx = findColIdx(['ที่อยู่', 'address']);

            let delIdx = -1;
            if (rowId && idIdx !== -1) {
                delIdx = store.floodData.findIndex((r, idx) => idx > 0 && String(r[idIdx]) === rowId);
            }
            if (delIdx === -1 && originalIndex > 0 && originalIndex < store.floodData.length) {
                delIdx = originalIndex;
            }
            if (delIdx === -1 && name && address) {
                delIdx = store.floodData.findIndex((r, idx) => idx > 0 && String(r[nameIdx] || '').trim() === name && String(r[addressIdx] || '').trim() === address);
            }

            if (delIdx > 0) {
                store.floodData.splice(delIdx, 1);
            }
        }

        Swal.fire({
            title: 'ลบข้อมูลสำเร็จ',
            text: 'ลบข้อมูลผู้ประสบภัยออกจากระบบเรียบร้อยแล้ว',
            icon: 'success',
            timer: 1600,
            showConfirmButton: false,
            customClass: { popup: 'rounded-[2rem]' }
        });

        // รีเรนเดอร์แดชบอร์ดและแผนที่ทันที
        window.renderFloodReportDashboard();

    } catch (err) {
        console.error("Delete flood data error:", err);
        Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถลบข้อมูลได้', 'error');
    }
};

window.handleFloodSearchInput = function (val) {
    window.filterFloodMap();

    const suggestions = document.getElementById('floodSearchSuggestions');
    if (!suggestions) return;

    const cleanVal = val.trim().toLowerCase();
    if (!cleanVal) {
        suggestions.classList.add('hidden');
        suggestions.innerHTML = '';
        return;
    }

    const matches = (window.floodSuggestionsList || []).filter(item =>
        item.toLowerCase().includes(cleanVal)
    ).slice(0, 10);

    if (matches.length === 0) {
        suggestions.classList.add('hidden');
        suggestions.innerHTML = '';
        return;
    }

    let html = '';
    matches.forEach(match => {
        const index = match.toLowerCase().indexOf(cleanVal);
        let displayHtml = match;
        if (index !== -1) {
            const originalPart = match.substring(index, index + cleanVal.length);
            displayHtml = match.substring(0, index) + `<span class="text-blue-600 font-extrabold">${originalPart}</span>` + match.substring(index + cleanVal.length);
        }

        html += `
            <div onclick="selectFloodSuggestion('${match.replace(/'/g, "\\'")}')" 
                 class="px-4 py-3 hover:bg-blue-50/55 cursor-pointer transition-colors flex items-center gap-2">
                <i class="fas fa-search text-slate-300 text-[10px]"></i>
                <span>${displayHtml}</span>
            </div>
        `;
    });

    suggestions.innerHTML = html;
    suggestions.classList.remove('hidden');
};

window.handleFloodSearchFocus = function () {
    const input = document.getElementById('floodSearchInput');
    if (input) {
        window.handleFloodSearchInput(input.value);
    }
};

window.selectFloodSuggestion = function (val) {
    const input = document.getElementById('floodSearchInput');
    if (input) input.value = val;
    const suggestions = document.getElementById('floodSearchSuggestions');
    if (suggestions) suggestions.classList.add('hidden');
    window.filterFloodMap();

    if (window.floodMarkersMap) {
        const cleanVal = val.toLowerCase().trim();
        if (window.floodMarkersMap[val]) {
            const md = window.floodMarkersMap[val];
            window.zoomToFloodMarker(val, md.lat, md.lng);
            return;
        }

        for (const name in window.floodMarkersMap) {
            const md = window.floodMarkersMap[name];
            if (md.address.toLowerCase().trim() === cleanVal || md.road.toLowerCase().trim() === cleanVal) {
                window.zoomToFloodMarker(name, md.lat, md.lng);
                break;
            }
        }
    }
};

window.uploadRiskMapImage = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const btn = document.getElementById('uploadRiskMapBtn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = `<i class="fas fa-spinner animate-spin"></i> กำลังอัปโหลด...`;
        btn.disabled = true;
    }

    try {
        const reader = new FileReader();
        reader.onload = async function () {
            const base64Data = reader.result;

            // 1. Instant Local Preview: แสดงรูปภาพทันทีไม่ต้องรอ Drive CDN หรือเสี่ยง 404
            const img = document.getElementById('riskMapImg');
            const placeholder = document.getElementById('riskMapPlaceholder');
            if (img) {
                img.referrerPolicy = 'no-referrer';
                img.dataset.fallbackStep = '0';
                img.src = base64Data;
                img.classList.remove('hidden');
            }
            if (placeholder) placeholder.classList.add('hidden');

            let finalUrl = "";

            try {
                const resp = await fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'saveRiskMapImage',
                        imageType: file.type || 'image/jpeg',
                        imageData: base64Data
                    })
                });
                const result = await resp.json();
                if (result && result.success && result.url) {
                    finalUrl = result.url;
                }
            } catch (driveErr) {
                console.warn("⚠️ [Google Drive] อัปโหลดเข้า Drive ขัดข้อง:", driveErr);
            }

            if (!finalUrl) finalUrl = base64Data;

            if (typeof sbSaveRiskMapUrl === 'function') {
                try { await sbSaveRiskMapUrl(finalUrl); } catch (sbErr) {}
            }

            store.riskMapImageUrl = finalUrl;
            try { localStorage.setItem('risk_map_image_url', finalUrl); } catch (e) {}

            // รีเซ็ต input value เพื่อให้สามารถเลือกรูปเดิมซ้ำได้ถ้าต้องการ
            if (event.target) event.target.value = '';

            Swal.fire({
                title: 'อัปโหลดสำเร็จ',
                text: 'อัปโหลดและบันทึกรูปภาพแผนที่พื้นที่เสี่ยงภัยเรียบร้อยแล้ว',
                icon: 'success',
                customClass: { popup: 'rounded-[2rem]' }
            });
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        };
        reader.readAsDataURL(file);
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', 'เกิดปัญหาขณะอัปโหลดไฟล์', 'error');
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        if (event.target) event.target.value = '';
    }
};

document.addEventListener('click', function (e) {
    const wrapper = document.getElementById('floodSearchWrapper');
    const suggestions = document.getElementById('floodSearchSuggestions');
    if (wrapper && suggestions && !wrapper.contains(e.target)) {
        suggestions.classList.add('hidden');
    }
});
