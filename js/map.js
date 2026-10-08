/**
 * Leaflet Map & GIS Layer Management
 * ระบบรายงานสถานการณ์น้ำท่วม ทต.ตันหยงมัส
 */

let evacMap;
let evacDrawnItems;
let evacMarkerLayer;

function createCustomWaterMarkerIcon(waterLevelStatus) {
    let color = '#22c55e';
    let shadowColor = 'rgba(34, 197, 94, 0.4)';
    let extraClass = '';

    if (waterLevelStatus === 'วิกฤต' || waterLevelStatus === 'ล้นตลิ่ง') {
        color = '#ef4444';
        shadowColor = 'rgba(239, 68, 68, 0.6)';
        extraClass = 'critical-pulse';
    } else if (waterLevelStatus === 'เตือนภัย' || waterLevelStatus === 'เฝ้าระวัง') {
        color = '#f59e0b';
        shadowColor = 'rgba(245, 158, 11, 0.5)';
    }

    return L.divIcon({
        className: 'custom-water-marker',
        html: `
    <div class="${extraClass}" style="
        background-color: ${color}; 
        width: 18px; 
        height: 18px; 
        border-radius: 50%; 
        border: 3px solid white; 
        box-shadow: 0 0 0 4px ${shadowColor}, 0 2px 10px rgba(0,0,0,0.2);
    "></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

function initEvacMap() {
    if (evacMap) return;

    evacMap = L.map('evacMap').setView([6.29445, 101.72362], 15);
    window.evacMap = evacMap;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(evacMap);

    setTimeout(() => { if (evacMap) evacMap.invalidateSize(); }, 300);

    evacDrawnItems = new L.FeatureGroup();
    evacMap.addLayer(evacDrawnItems);
    evacMarkerLayer = L.layerGroup().addTo(evacMap);

    if (userRole === 'superadmin') {
        const drawControl = new L.Control.Draw({
            edit: {
                featureGroup: evacDrawnItems,
                remove: true
            },
            draw: {
                polygon: {
                    allowIntersection: false,
                    showArea: true,
                    shapeOptions: { color: '#3b82f6', weight: 3, fillOpacity: 0.3 }
                },
                polyline: false,
                rectangle: { shapeOptions: { color: '#f59e0b', weight: 3, fillOpacity: 0.3 } },
                circle: { shapeOptions: { color: '#ef4444', weight: 3, fillOpacity: 0.3 } },
                marker: true,
                circlemarker: false
            }
        });

        evacMap.addControl(drawControl);

        evacMap.on(L.Draw.Event.CREATED, function (e) {
            const type = e.layerType;
            const layer = e.layer;

            Swal.fire({
                title: '<div class="text-blue-700 text-lg font-black"><i class="fas fa-edit"></i> บันทึกรายละเอียดพื้นที่</div>',
                html: `
            <div class="text-left space-y-3 mt-2">
                <div>
                    <label class="text-[11px] font-bold text-slate-500 ml-1">ชื่อสถานที่/จุดสังเกต</label>
                    <input type="text" id="draw_title" class="w-full p-3 border border-slate-200 rounded-xl outline-none text-sm focus:border-blue-400" placeholder="ระบุชื่อ...">
                </div>
                <div>
                    <label class="text-[11px] font-bold text-slate-500 ml-1">รายละเอียดเพิ่มเติม</label>
                    <textarea id="draw_detail" class="w-full p-3 border border-slate-200 rounded-xl outline-none text-sm h-20 focus:border-blue-400" placeholder="รายละเอียด เช่น สถานะ, ความจุ, เส้นทาง..."></textarea>
                </div>
                <div>
                    <label class="text-[11px] font-bold text-slate-500 ml-1">ประเภท</label>
                    <select id="draw_type" class="w-full p-3 border border-slate-200 rounded-xl outline-none text-sm">
                        <option value="จุดอพยพ">จุดอพยพชั่วคราว</option>
                        <option value="พื้นที่เสี่ยง">พื้นที่เสี่ยงภัย</option>
                        <option value="จุดแจกของ">จุดแจกถุงยังชีพ</option>
                        <option value="อื่นๆ">อื่นๆ</option>
                    </select>
                </div>
            </div>
        `,
                showCancelButton: true,
                confirmButtonText: 'บันทึกข้อมูล',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#2563eb',
                customClass: { popup: 'rounded-[2rem]' },
                preConfirm: () => {
                    const title = document.getElementById('draw_title').value;
                    if (!title) {
                        Swal.showValidationMessage('กรุณาระบุชื่อสถานที่');
                        return false;
                    }
                    return {
                        title: title,
                        detail: document.getElementById('draw_detail').value,
                        drawType: document.getElementById('draw_type').value
                    };
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    const data = result.value;
                    let locationText = '';

                    let theme = { bg: 'bg-blue-600', text: 'text-blue-600', lightBg: 'bg-blue-50', icon: 'fa-campground', hex: '#2563eb' };
                    if (data.drawType === 'พื้นที่เสี่ยง') {
                        theme = { bg: 'bg-rose-500', text: 'text-rose-600', lightBg: 'bg-rose-50', icon: 'fa-exclamation-triangle', hex: '#f43f5e' };
                    } else if (data.drawType === 'จุดแจกของ') {
                        theme = { bg: 'bg-amber-500', text: 'text-amber-600', lightBg: 'bg-amber-50', icon: 'fa-box-open', hex: '#f59e0b' };
                    } else if (data.drawType === 'อื่นๆ') {
                        theme = { bg: 'bg-slate-600', text: 'text-slate-600', lightBg: 'bg-slate-100', icon: 'fa-map-pin', hex: '#475569' };
                    }

                    if (type === 'marker') {
                        const latlng = layer.getLatLng();
                        locationText = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;

                        const customIcon = L.divIcon({
                            className: 'custom-type-marker bg-transparent border-0',
                            html: `
                        <div class="${theme.bg} text-white w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-md text-[14px]">
                            <i class="fas ${theme.icon}"></i>
                        </div>
                        <div class="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-${theme.bg.split('-')[1]}-${theme.bg.split('-')[2]} mx-auto -mt-[2px]"></div>
                    `,
                            iconSize: [32, 40],
                            iconAnchor: [16, 40],
                            popupAnchor: [0, -40]
                        });
                        layer.setIcon(customIcon);

                    } else {
                        locationText = 'ขอบเขตพื้นที่ถูกกำหนดไว้แล้ว';

                        layer.setStyle({
                            color: theme.hex,
                            fillColor: theme.hex,
                            weight: 3,
                            fillOpacity: 0.3
                        });
                    }

                    const popupHTML = `
                <div class="w-full font-sans bg-white relative">
                    <div class="${theme.bg} p-3 flex justify-between items-center text-white relative overflow-hidden">
                        <i class="fas ${theme.icon} absolute -right-2 -bottom-2 text-5xl opacity-20 transform -rotate-12"></i>
                        <span class="text-[9px] font-black uppercase tracking-widest bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/20 z-10 shadow-sm">
                            <i class="fas ${theme.icon} mr-1"></i> ${data.drawType}
                        </span>
                    </div>
                    
                    <div class="p-4">
                        <h4 class="font-black text-slate-800 text-[14px] leading-tight mb-2">${data.title}</h4>
                        ${data.detail ? `
                        <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-3 shadow-inner">
                            <p class="text-[11px] text-slate-600 leading-relaxed line-clamp-4">${data.detail}</p>
                        </div>` : ''}
                        
                        <div class="flex items-center text-[9px] font-bold text-slate-400 border-t border-slate-100 pt-3">
                            <div class="w-6 h-6 rounded-full ${theme.lightBg} ${theme.text} flex items-center justify-center mr-2 shrink-0">
                                <i class="fas fa-location-arrow"></i>
                            </div>
                            <span class="truncate tracking-wide">${locationText}</span>
                        </div>
                    </div>
                </div>
            `;

                    layer.bindPopup(popupHTML);
                    evacDrawnItems.addLayer(layer);

                    setTimeout(() => { layer.openPopup(); }, 300);
                }
            });
        });
    }
}
