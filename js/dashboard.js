let store = { waterPoints: [], waterLevels: [], reliefStock: [] };
let currentUser = "";
let userRole = "";

const { curYearBE, curMonthStr, curMonthPeriod } = getCurrentDefaultPeriodInfo();
let currentPeriod = ""; // ปล่อยว่างในครั้งแรก เพื่อให้ GAS ดึงจาก Sheet ล่าสุดที่มีจริงในระบบ (เช่น 2569)
let waterChartInstance = null;
let currentZoneFilter = null;
window.currentFilteredData = [];

// 🗺️ One Map Global Declarations (Top-level to prevent TDZ error)
let dashOneMap = null;
let dashOsmLayer = null;
let dashSatLayer = null;
let dashDrawnItems = null;

let dashLayers = {
    water: null,
    shelter: null,
    relief: null,
    evac: null,
    flood: null,
    polygon: null
};

let dashLayerStates = {
    water: true,
    shelter: true,
    relief: true,
    evac: true,
    flood: true,
    polygon: true
};

// ==========================================
        // ระบบตรวจสอบโหมดการใช้งานตอนโหลดหน้าเว็บ
        // ==========================================
        /// เช็คสถานะเมื่อโหลดหน้าเว็บ และ ตรวจสอบโหมดประชาชน
        window.isPublicMode = false;

        window.addEventListener('DOMContentLoaded', async () => {
            // 1. เช็คว่ามีคำว่า mode=report ใน URL ไหม
            window.isPublicMode = window.location.href.includes('mode=report');

            if (window.isPublicMode) {
                // ==========================================
                // 🟢 โหมดประชาชน (ลบหน้า Login ทิ้งทันที) 🟢
                // ==========================================
                currentUser = "ประชาชน (สแกน QR)";
                userRole = "public";

                // 🌟 สั่งลบหน้า Login และหน้าแอดมินออกจากระบบ 100%
                const loginPage = document.getElementById('loginPage');
                if (loginPage) loginPage.remove();

                const mainApp = document.getElementById('mainApp');
                if (mainApp) mainApp.remove();

                // เปลี่ยนสีพื้นหลังให้ดูเป็นหน้าฉุกเฉิน
                document.body.style.backgroundColor = '#0f172a';

                // สร้าง UI หน้าประชาชน
                const publicUI = document.createElement('div');
                publicUI.className = "flex flex-col items-center justify-center min-h-screen p-6 text-center animate-fade-in w-full max-w-sm mx-auto";
                publicUI.innerHTML = `
            <img src="assets/logo.png" class="w-24 mx-auto mb-6 drop-shadow-lg">
            <h1 class="text-2xl font-black text-white mb-2">ระบบรายงานสถานการณ์น้ำท่วม</h1>
            <p class="text-slate-400 text-sm mb-10">เทศบาลตำบลตันหยงมัส</p>
            
            <button onclick="promptSafetyCheck()" class="w-full bg-blue-600 text-white px-8 py-5 rounded-[2rem] font-black shadow-lg shadow-blue-500/30 text-lg hover:bg-blue-700 active:scale-95 transition-all animate-bounce">
                <i class="fas fa-bullhorn mr-2"></i> กดเพื่อรายงานสถานะ
            </button>
            
            <p class="text-slate-500 text-[10px] mt-10 italic">ข้อมูลของท่านจะถูกส่งตรงถึงเทศบาลตำบลตันหยงมัสทันที</p>
        `;
                document.body.appendChild(publicUI);

                // โหลดข้อมูลแผนที่เงียบๆ เผื่อต้องใช้
                try { await loadData(); } catch (e) { }

                return; // 🌟 จบการทำงานตรงนี้ ไม่รันโค้ดล็อกอินต่อ
            }

            // ==========================================
            // 🔵 โหมดเจ้าหน้าที่ (Login Mode ปกติ) 🔵
            // ==========================================
            const savedSession = localStorage.getItem('user_session');

            if (savedSession) {
                try {
                    const userData = JSON.parse(savedSession);
                    currentUser = userData.username;
                    userRole = userData.role;

                    const loginPage = document.getElementById('loginPage');
                    if (loginPage) loginPage.style.display = 'none';

                    const mainApp = document.getElementById('mainApp');
                    if (mainApp) mainApp.classList.remove('hidden');

                    if (typeof setupUserInterface === 'function') setupUserInterface(userData);
                    if (typeof updateMenuByRole === 'function') updateMenuByRole();

                    // 🚀 โหลดข้อมูลหลัก, ระดับน้ำ RID และพยากรณ์อากาศพร้อมกันแบบขนาน (Parallel Fetching)
                    await Promise.allSettled([
                        loadData(),
                        typeof loadRIDWaterLevel === 'function' ? loadRIDWaterLevel() : Promise.resolve(),
                        typeof loadWeatherForecast === 'function' ? loadWeatherForecast() : Promise.resolve()
                    ]);

                    let targetPage = 'water';
                    if (userRole === 'admin') targetPage = 'dashboard';
                    else if (userRole === 'shelter') targetPage = 'shelter';
                    else if (userRole === 'water_staff') targetPage = 'addWater';
                    else if (userRole === 'relief') targetPage = 'relief';
                    else if (userRole === 'community') targetPage = 'water';

                    if (typeof showPage === 'function') showPage(targetPage);
                } catch (e) {
                    console.error("Session Error:", e);
                    localStorage.removeItem('user_session');
                }
            } else {
                // ถ้ายังไม่ได้เข้าสู่ระบบ ให้โหลดข้อมูลระดับน้ำและพยากรณ์อากาศแบบขนาน
                try {
                    await Promise.allSettled([
                        typeof loadRIDWaterLevel === 'function' ? loadRIDWaterLevel() : Promise.resolve(),
                        typeof loadWeatherForecast === 'function' ? loadWeatherForecast() : Promise.resolve()
                    ]);
                } catch (e) { console.warn(e); }
            }

            // ตั้งระบบ Auto-Refresh ดึงข้อมูลระดับน้ำเรียลไทม์ทุก 60 วินาที
            if (!window._ridAutoRefreshTimer) {
                window._ridAutoRefreshTimer = setInterval(() => {
                    if (typeof loadRIDWaterLevel === 'function') loadRIDWaterLevel();
                }, 60000);
            }
        });

        // กำหนดว่าแต่ละสิทธิ์เข้าหน้าไหนได้บ้าง (แก้ dashboardPage เป็น dashboard)
        const PAGE_ACCESS = {
            'admin': ['dashboard', 'water', 'addWater', 'shelter', 'evacuation', 'regis', 'relief', 'looker', 'userManagement'],
            'shelter': ['shelter', 'regis', 'looker'],
            'water_staff': ['water', 'addWater', 'looker'],
            'relief': ['relief', 'looker'],
            'community': ['water', 'addWater', 'evacuation', 'looker']
        };
        // --- Navigation Logic ---
        // --- Navigation Logic ---
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const sideIcon = document.getElementById('sideIcon');
            sidebar.classList.toggle('sidebar-expanded');
            sidebar.classList.toggle('sidebar-collapsed');
            sideIcon.classList.toggle('fa-chevron-left');
            sideIcon.classList.toggle('fa-chevron-right');
        }

        const originalShowPage = showPage;

        function showPage(pageId) {
            // 1. ตรวจสอบสิทธิ์การเข้าถึง
            const allowed = PAGE_ACCESS[userRole] || ['shelter'];
            if (!allowed.includes(pageId)) {
                return Swal.fire({
                    title: 'สิทธิ์ไม่เพียงพอ',
                    text: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้',
                    icon: 'warning',
                    customClass: { popup: 'rounded-[2rem]' }
                });
            }

            // 2. สลับการแสดงผลหน้า Page
            document.querySelectorAll('.content-page, .page-section').forEach(p => p.classList.add('hidden'));
            const target = document.getElementById(pageId + 'Page'); // เช่น 'dashboard' + 'Page' = 'dashboardPage'
            if (target) {
                target.classList.remove('hidden');
            }

            // 3. อัปเดตสถานะปุ่มเมนู (Active State)
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active-menu', 'bg-blue-50', 'text-blue-600'));
            const activeDesktop = document.querySelector(`.nav-btn[data-page="${pageId}"]`);
            if (activeDesktop) {
                activeDesktop.classList.add('active-menu', 'bg-blue-50', 'text-blue-600');
            }

            document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active-menu-mobile', 'text-blue-600'));
            const activeMobile = document.querySelector(`.mobile-nav-btn[data-page="${pageId}"]`);
            if (activeMobile) {
                activeMobile.classList.add('active-menu-mobile', 'text-blue-600');
            }

            // 4. อัปเดตหัวข้อหน้า (เพิ่ม title ของหน้าหลัก)
            const titles = {
                dashboard: 'ภาพรวมสถานการณ์ (Dashboard)', // <-- เพิ่มตรงนี้
                water: 'สถานการณ์ระดับน้ำ',
                addWater: 'รายงานระดับน้ำ',
                shelter: 'ข้อมูลศูนย์พักพิง',
                regis: 'ลงทะเบียนผู้ประสบภัย',
                relief: 'ข้อมูลผู้รับถุงยังชีพ',
                looker: 'รายงานสรุปข้อมูล',
                evacuation: 'สถานะการอพยพและแผนที่',
                userManagement: 'จัดการผู้ใช้งานระบบ'
            };
            const titleElement = document.getElementById('pageTitle');
            if (titleElement) {
                titleElement.innerText = titles[pageId] || "ระบบรายงานสถานการณ์น้ำท่วม";
            }

            // 5. Logic เฉพาะแต่ละหน้า (พร้อมระบบ invalidateSize หลายสเต็ปเพื่อป้องกันภาพแหว่ง)
            if (pageId === 'dashboard') {
                if (typeof initDashOneMap === 'function') initDashOneMap();
                if (typeof renderDashOneMapLayers === 'function') renderDashOneMapLayers();
                [100, 300, 500, 800].forEach(delay => {
                    setTimeout(() => {
                        if (window.dashOneMap && typeof window.dashOneMap.invalidateSize === 'function') {
                            window.dashOneMap.invalidateSize();
                        }
                    }, delay);
                });
            }
            if (pageId === 'userManagement' && userRole === 'admin') loadUsers();

            if (pageId === 'looker') {
                if (typeof initFloodReportMap === 'function') initFloodReportMap();
                if (typeof renderFloodReportDashboard === 'function') renderFloodReportDashboard();
                [100, 300, 500, 800].forEach(delay => {
                    setTimeout(() => {
                        if (window.floodReportMap && typeof window.floodReportMap.invalidateSize === 'function') {
                            window.floodReportMap.invalidateSize();
                        }
                    }, delay);
                });
            }

            if (pageId === 'relief') renderReliefTable(store.reliefData);

            if (pageId === 'water') {
                if (typeof initWaterMap === 'function') initWaterMap();
                if (typeof updateWaterMapMarkers === 'function') updateWaterMapMarkers();
                [100, 300, 500, 800].forEach(delay => {
                    setTimeout(() => {
                        if (window.waterMap && typeof window.waterMap.invalidateSize === 'function') {
                            window.waterMap.invalidateSize();
                        }
                    }, delay);
                });
            }

            if (pageId === 'evacuation') {
                if (typeof initEvacMap === 'function') initEvacMap();
                [100, 300, 500, 800].forEach(delay => {
                    setTimeout(() => {
                        if (window.evacMap && typeof window.evacMap.invalidateSize === 'function') {
                            window.evacMap.invalidateSize();
                            loadEvacuationMarkers();
                        }
                    }, delay);
                });
            }

            // 6. เลื่อนหน้าจอกลับไปด้านบนสุด
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // 🌟 ดักจับการย่อ-ขยายหน้าจอเพื่อรีเฟรชขนาดแผนที่ทุกตัวอัตโนมัติ
        window.addEventListener('resize', () => {
            if (window.dashOneMap && typeof window.dashOneMap.invalidateSize === 'function') window.dashOneMap.invalidateSize();
            if (window.waterMap && typeof window.waterMap.invalidateSize === 'function') window.waterMap.invalidateSize();
            if (window.evacMap && typeof window.evacMap.invalidateSize === 'function') window.evacMap.invalidateSize();
            if (window.floodReportMap && typeof window.floodReportMap.invalidateSize === 'function') window.floodReportMap.invalidateSize();
        });
        // --- Auth & Data ---
        async function doLogin() {
            const user = document.getElementById('username').value.trim();
            if (!user) return Swal.fire('แจ้งเตือน', 'กรุณาระบุชื่อผู้ใช้งาน', 'warning');

            const btn = document.getElementById('loginBtn');
            btn.innerText = 'กำลังตรวจสอบสิทธิ์...';
            btn.disabled = true;

            try {
                let data = null;

                // ⚡ เข้าสู่ระบบผ่าน Supabase 100%
                if (typeof sbLogin === 'function') {
                    data = await sbLogin(user);
                } else {
                    throw new Error('Supabase Service ไม่พร้อมทำงาน');
                }

                if (data && data.success) {
                    const userData = {
                        username: user,
                        name: data.name || user,
                        role: data.role
                    };

                    localStorage.setItem('user_session', JSON.stringify(userData));

                    currentUser = userData.username;
                    userRole = userData.role;

                    document.getElementById('loginPage').style.display = 'none';
                    document.getElementById('mainApp').classList.remove('hidden');

                    if (typeof setupUserInterface === 'function') setupUserInterface(userData);
                    if (typeof updateMenuByRole === 'function') updateMenuByRole();

                    // --- แก้ไขตรงนี้: เปลี่ยนจาก dashboardPage เป็น dashboard ---
                    let firstPage = 'water';

                    if (userRole === 'admin') firstPage = 'dashboard'; // <-- แก้ตรงนี้
                    else if (userRole === 'shelter') firstPage = 'shelter';
                    else if (userRole === 'water_staff') firstPage = 'addWater';
                    else if (userRole === 'relief') firstPage = 'relief';
                    else if (userRole === 'community') firstPage = 'water';

                    if (typeof showPage === 'function') showPage(firstPage);

                    await loadData();

                } else {
                    Swal.fire('ผิดพลาด', data.error || 'ชื่อผู้ใช้ไม่ถูกต้อง', 'error');
                    btn.innerText = 'เข้าใช้งานระบบ'; btn.disabled = false;
                }
            } catch (e) {
                console.error(e);
                Swal.fire('การเชื่อมต่อขัดข้อง', 'โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต', 'error');
                btn.innerText = 'เข้าใช้งานระบบ'; btn.disabled = false;
            }
        }


        function toggleDashboardSkeleton(show) {
            const skeleton = document.getElementById('dashboardSkeleton');
            const content = document.getElementById('dashboardActualContent');
            if (!skeleton || !content) return;

            if (show) {
                skeleton.classList.remove('hidden');
                content.classList.add('hidden');
            } else {
                setTimeout(() => {
                    skeleton.classList.add('hidden');
                    content.classList.remove('hidden');
                }, 200);
            }
        }
        window.toggleDashboardSkeleton = toggleDashboardSkeleton;

        async function loadData(forceRefresh = false) {
            toggleDashboardSkeleton(true);
            const cacheKey = `initial_data_${currentPeriod || 'default'}`;

            // 🚀 เช็ค Browser Cache ก่อน เพื่อเรนเดอร์ข้อมูลขึ้นมาทันที (Stale-While-Revalidate)
            if (!forceRefresh && typeof window.getAppCache === 'function') {
                const cachedData = window.getAppCache(cacheKey);
                if (cachedData && cachedData.waterLevels) {
                    store = cachedData;
                }
            }

            try {
                let data = null;

                // ⚡ โหลดข้อมูลจาก Supabase 100% (ข้อมูลเริ่มต้นว่างเปล่าตามตารางจริง)
                if (typeof sbFetchInitialData === 'function') {
                    data = await sbFetchInitialData(currentPeriod);
                }

                if (!data) {
                    data = {
                        success: true,
                        isFromSupabase: true,
                        periods: ['2569', '2568'],
                        waterPoints: [],
                        waterLevels: [],
                        evacuees: [],
                        addresses: [],
                        addressEvac: [],
                        reliefData: [],
                        reliefStock: [],
                        floodPolygons: [],
                        evacReports: [],
                        floodData: [],
                        riskMapImageUrl: ""
                    };
                }

                store = data;
                if (typeof window.setAppCache === 'function') {
                    window.setAppCache(cacheKey, data, 3);
                }

                // อัปเดต Dropdown การเลือกปี/เดือน โดยเลือกช่วงเวลาปัจจุบันก่อนเสมอ
                if (store.periods && store.periods.length > 0) {
                    const bestPeriod = resolveBestPeriod(store.periods);
                    if (bestPeriod !== currentPeriod && !window._hasResolvedPeriodOnce) {
                        window._hasResolvedPeriodOnce = true;
                        currentPeriod = bestPeriod;
                        await loadData(true);
                        return;
                    }
                    window._hasResolvedPeriodOnce = true;

                    const periodSelector = document.getElementById('periodSelector');
                    if (periodSelector) {
                        periodSelector.innerHTML = store.periods.map(p => {
                            const displayName = formatPeriodDisplay(p);
                            return `<option value="${p}" ${p === currentPeriod ? 'selected' : ''}>${displayName}</option>`;
                        }).join('');
                    }
                }

                // 🌟 1. จุดสำคัญที่แก้ปัญหา: ถ้าเป็นโหมดประชาชน โหลดข้อมูลเสร็จแล้วให้หยุดทำงานตรงนี้เลย ไม่ต้องวาดตาราง/กราฟ
                if (window.isPublicMode) {
                    toggleDashboardSkeleton(false);
                    return;
                }

                // เพิ่มคำสั่งนี้ลงในฟังก์ชัน loadData() ของคุณ (หลังบรรทัด if (window.isPublicMode) return;)
                if (typeof loadRIDWaterLevel === 'function') {
                    loadRIDWaterLevel();
                }
                if (typeof loadWeatherForecast === 'function') {
                    loadWeatherForecast();
                }
                // 1. จัดการ Dropdown สำหรับรายงานน้ำ
                if (store.waterPoints) {
                    const pOpts = store.waterPoints.map(v => `<option value="${v}">${v}</option>`).join('');
                    const waterLocEl = document.getElementById('water_loc');
                    if (waterLocEl) {
                        waterLocEl.innerHTML = pOpts;
                        // อัปเดตพิกัดอัตโนมัติให้ตรงกับจุดวัดเริ่มต้น
                        const coordsEl = document.getElementById('water_coords');
                        if (coordsEl && window.waterPointsMap && window.waterPointsMap[waterLocEl.value]) {
                            coordsEl.value = window.waterPointsMap[waterLocEl.value];
                        }
                        if (!waterLocEl._hasCoordsBinding) {
                            waterLocEl._hasCoordsBinding = true;
                            waterLocEl.addEventListener('change', function () {
                                const cEl = document.getElementById('water_coords');
                                if (cEl && window.waterPointsMap && window.waterPointsMap[this.value]) {
                                    cEl.value = window.waterPointsMap[this.value];
                                }
                            });
                        }
                    }

                    // กรองเฉพาะพื้นที่ที่มีข้อมูลรายงานน้ำแล้วมาทำเป็น Filter
                    const activeWaterAreas = [...new Set(store.waterLevels.map(r => r[1]))].sort();
                    const filterHtml = '<option value="all">ทุกพื้นที่ (ที่มีข้อมูล)</option>' +
                        activeWaterAreas.map(v => `<option value="${v}">${v}</option>`).join('');

                    const chartLocEl = document.getElementById('chartLocFilter');
                    const cardLocEl = document.getElementById('cardLocFilter');
                    const dashChartLocEl = document.getElementById('dashChartLocFilter');

                    if (chartLocEl) chartLocEl.innerHTML = filterHtml;
                    if (cardLocEl) cardLocEl.innerHTML = filterHtml;
                    if (dashChartLocEl) dashChartLocEl.innerHTML = filterHtml;
                }

                // 2. จัดการ Dropdown ที่อยู่ในหน้าลงทะเบียนใหม่
                if (store.addresses) {
                    const addrOpts = '<option value="" disabled selected>เลือกที่อยู่/ชุมชน</option>' +
                        store.addresses.map(a => `<option value="${a}">${a}</option>`).join('') +
                        '<option value="other">อื่น ๆ (ระบุเอง)</option>';
                    const regisAddrEl = document.getElementById('regis_address_select');
                    if (regisAddrEl) regisAddrEl.innerHTML = addrOpts;

                    if (typeof initReliefForm === 'function') initReliefForm();
                }

                // 3. ประมวลผลหน้าสถานการณ์น้ำ (กราฟ + การ์ด)
                if (typeof setDateFilter === 'function') setDateFilter('week');

                // 🌟 ตั้งค่าเวลาพื้นฐาน (7 วัน) ให้กราฟหน้า Dashboard
                if (typeof setDashDateFilter === 'function') setDashDateFilter('week');

                if (typeof renderWaterCards === 'function') renderWaterCards();

                // 4. ประมวลผลตารางข้อมูลผู้รับถุงยังชีพ (แยกส่วนการทำงาน)
                if (store.reliefData) {
                    renderReliefTable(store.reliefData);
                }

                // 5. ประมวลผลยอดสต๊อกถุงยังชีพ (แยกออกมาประมวลผลอิสระ)
                if (store.reliefStock) {
                    renderStockDashboard();
                }

                // 6. ประมวลผลหน้าศูนย์พักพิง (สถิติ + กราฟวงกลม + รายชื่อ)
                if (store.evacuees && typeof window.filterShelter === 'function') {
                    window.filterShelter('all');
                }

                // หลังจากโหลดข้อมูลหน้าอื่นๆ เสร็จหมดแล้ว ให้โหลดข้อมูลเข้าหน้าหลักด้วย
                if (typeof userRole !== 'undefined' && userRole === 'admin') {
                    renderAdminDashboard();
                }
                if (typeof initDashOneMap === 'function') initDashOneMap();
                if (typeof renderDashOneMapLayers === 'function') renderDashOneMapLayers();
                if (typeof window.loadEvacuationMarkers === 'function') window.loadEvacuationMarkers();

                // โหลดข้อมูลเข้าหน้ารายงานน้ำท่วมด้วย
                if (typeof renderFloodReportDashboard === 'function') {
                    renderFloodReportDashboard();
                }

                // อัปเดตเวลาล่าสุด
                const lastUpdateEl = document.getElementById('lastUpdate');
                if (lastUpdateEl) lastUpdateEl.innerText = new Date().toLocaleTimeString('th-TH') + " น.";

                toggleDashboardSkeleton(false);
            } catch (e) {
                console.error("Load Data Error", e);
                toggleDashboardSkeleton(false);
                // 🌟 2. ดักไว้อีกชั้น: ถ้าเกิด Error ขึ้นมาในโหมดประชาชน ก็ไม่ต้องโชว์แจ้งเตือนให้ชาวบ้านตกใจครับ
                if (!window.isPublicMode) {
                    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้', 'error');
                }
            }
        }

        // --- Period Selection Functions ---
        const THAI_MONTHS = {
            "1": "มกราคม", "2": "กุมภาพันธ์", "3": "มีนาคม", "4": "เมษายน",
            "5": "พฤษภาคม", "6": "มิถุนายน", "7": "กรกฎาคม", "8": "สิงหาคม",
            "9": "กันยายน", "10": "ตุลาคม", "11": "พฤศจิกายน", "12": "ธันวาคม"
        };

        function resolveBestPeriod(availablePeriods) {
            if (!availablePeriods || availablePeriods.length === 0) return curMonthPeriod;

            // 1. ถ้ามีปีและเดือนปัจจุบันในระบบ (เช่น "2569_7") ให้เลือกก่อน
            if (availablePeriods.includes(curMonthPeriod)) {
                return curMonthPeriod;
            }

            // 2. ถ้าไม่มีเดือน ให้เลือกปีปัจจุบัน (เช่น "2569")
            if (availablePeriods.includes(curYearBE)) {
                return curYearBE;
            }

            // 3. ถ้ามีช่วงเวลาอื่นของปีปัจจุบัน ให้เลือกช่วงเวลานั้น
            const currentYearMatches = availablePeriods.filter(p => p.startsWith(curYearBE + "_"));
            if (currentYearMatches.length > 0) {
                return currentYearMatches[currentYearMatches.length - 1];
            }

            // 4. ถ้าไม่มีข้อมูลปีปัจจุบัน ให้เลือกช่วงเวลาล่าสุดในระบบ
            return availablePeriods[availablePeriods.length - 1];
        }

        function formatPeriodDisplay(period) {
            if (!period) return "";
            const parts = period.split("_");
            if (parts.length === 1) {
                return `ปี พ.ศ. ${parts[0]}`;
            } else if (parts.length === 2) {
                const monthName = THAI_MONTHS[parts[1]] || parts[1];
                return `${monthName} พ.ศ. ${parts[0]}`;
            }
            return period;
        }

        async function changePeriod(value) {
            currentPeriod = value;
            window._hasResolvedPeriodOnce = true;
            Swal.fire({
                title: 'กำลังเปลี่ยนช่วงเวลา...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });
            await loadData();
            Swal.close();
        }

        function openCreatePeriodModal() {
            Swal.fire({
                title: 'สร้างช่วงเวลาข้อมูลใหม่',
                html: `
                    <div class="text-left space-y-4 p-2">
                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-1">ประเภทช่วงเวลา</label>
                            <select id="swal_period_type" onchange="toggleSwalMonthSelect(this.value)" class="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 bg-slate-50">
                                <option value="year">รายปี (เช่น 2569)</option>
                                <option value="month">รายเดือน (เช่น ตุลาคม 2568)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-1">ปี พ.ศ. (ระบุเป็นตัวเลขสี่หลัก เช่น 2569)</label>
                            <input type="number" id="swal_period_year" value="${new Date().getFullYear() + 543}" min="2500" max="2700" class="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 bg-slate-50 text-center font-bold">
                        </div>
                        <div id="swal_month_container" class="hidden">
                            <label class="block text-sm font-bold text-slate-700 mb-1">เดือน</label>
                            <select id="swal_period_month" class="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 bg-slate-50">
                                <option value="1">มกราคม</option>
                                <option value="2">กุมภาพันธ์</option>
                                <option value="3">มีนาคม</option>
                                <option value="4">เมษายน</option>
                                <option value="5">พฤษภาคม</option>
                                <option value="6">มิถุนายน</option>
                                <option value="7">กรกฎาคม</option>
                                <option value="8">สิงหาคม</option>
                                <option value="9">กันยายน</option>
                                <option value="10">ตุลาคม</option>
                                <option value="11">พฤศจิกายน</option>
                                <option value="12">ธันวาคม</option>
                            </select>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'สร้างช่วงเวลา',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#4f46e5',
                cancelButtonColor: '#64748b',
                focusConfirm: false,
                preConfirm: () => {
                    const type = document.getElementById('swal_period_type').value;
                    const year = document.getElementById('swal_period_year').value.trim();
                    const month = document.getElementById('swal_period_month').value;

                    if (!year || isNaN(year) || year.length !== 4) {
                        Swal.showValidationMessage('กรุณาระบุปี พ.ศ. เป็นตัวเลข 4 หลัก เช่น 2569');
                        return false;
                    }

                    return { type, year, month };
                }
            }).then(async (result) => {
                if (result.isConfirmed) {
                    const { type, year, month } = result.value;
                    let periodSuffix = year;
                    if (type === 'month') {
                        periodSuffix = `${year}_${month}`;
                    }

                    Swal.fire({
                        title: 'กำลังสร้างช่วงเวลา...',
                        text: 'และสร้างแท็บใหม่ใน Google Sheets',
                        allowOutsideClick: false,
                        didOpen: () => Swal.showLoading()
                    });

                    try {
                        if (typeof sbCreateNewPeriod === 'function') {
                            await sbCreateNewPeriod(periodSuffix);
                        }
                        if (store.periods && !store.periods.includes(periodSuffix)) {
                            store.periods.unshift(periodSuffix);
                        }
                        Swal.fire({
                            title: 'สำเร็จ',
                            text: 'สร้างช่วงเวลาเรียบร้อยแล้ว',
                            icon: 'success',
                            timer: 1500
                        });
                        currentPeriod = periodSuffix;
                        await loadData();
                    } catch (err) {
                        Swal.fire('ผิดพลาด', err.message, 'error');
                    }
                }
            });
        }

        function toggleSwalMonthSelect(type) {
            const el = document.getElementById('swal_month_container');
            if (el) {
                if (type === 'month') el.classList.remove('hidden');
                else el.classList.add('hidden');
            }
        }
        // --- Relief Functions ---
        function initReliefForm() {
            // 1. สร้างตัวเลือกจำนวนสมาชิก 1-30
            let opts = "";
            for (let i = 1; i <= 30; i++) {
                opts += `<option value="${i}">${i} คน</option>`;
            }
            const membersSelect = document.getElementById('rel_members');
            if (membersSelect) membersSelect.innerHTML = opts;

            // 2. สร้างตัวเลือกที่อยู่จากข้อมูลใน store
            const relAddrSelect = document.getElementById('rel_address_select');
            if (relAddrSelect && store.addresses && store.addresses.length > 0) {
                const addrOpts = '<option value="" disabled selected>เลือกที่อยู่</option>' +
                    store.addresses.map(a => `<option value="${a}">${a}</option>`).join('') +
                    '<option value="other">อื่นๆ (ระบุเอง)</option>';
                relAddrSelect.innerHTML = addrOpts;
            }
        }


        // ==========================================
        // ส่วนจัดการ Modal แจกถุงยังชีพ
        // ==========================================

        // ฟังก์ชันดึงประวัติที่อยู่จากชีท Address_Evacuation และประวัติถุงยังชีพ
        function getReliefAddressList() {
            const evacAddrs = (typeof store !== 'undefined' && store.addressEvac && Array.isArray(store.addressEvac))
                ? store.addressEvac.map(row => row[0] ? row[0].toString().trim() : '').filter(a => a !== '')
                : ((typeof store !== 'undefined' && store.addresses && Array.isArray(store.addresses)) ? store.addresses : []);

            const reliefAddrs = (typeof store !== 'undefined' && store.reliefData && Array.isArray(store.reliefData))
                ? store.reliefData.map(r => r[4] ? r[4].toString().trim() : '').filter(a => a !== '')
                : [];

            return [...new Set([...evacAddrs, ...reliefAddrs])].filter(a => a !== '').sort();
        }

        // 1. ระบบ AutoComplete สำหรับที่อยู่
        window.handleReliefAddressSearch = function (val) {
            const resultBox = document.getElementById('rel_address_results');
            if (!resultBox) return;

            if (!val || val.trim().length < 1) {
                resultBox.classList.add('hidden');
                return;
            }

            if (!window.reliefAddressList || window.reliefAddressList.length === 0) {
                window.reliefAddressList = getReliefAddressList();
            }

            const searchVal = val.toLowerCase().trim();
            const filtered = window.reliefAddressList.filter(a => a.toLowerCase().includes(searchVal)).slice(0, 15);

            if (filtered.length > 0) {
                let html = '';
                filtered.forEach(addr => {
                    html += `<div onclick='selectReliefAddress(${JSON.stringify(addr)})' class="p-3 hover:bg-amber-100 cursor-pointer border-b border-slate-100 text-sm text-slate-700 transition-colors flex items-center justify-between"><span class="font-medium">${addr}</span><i class="fas fa-chevron-right text-[10px] text-amber-400"></i></div>`;
                });
                resultBox.innerHTML = html;
                resultBox.classList.remove('hidden');
            } else {
                resultBox.innerHTML = '<div class="p-3 text-xs text-amber-600 font-bold bg-amber-50 flex items-center"><i class="fas fa-info-circle mr-2"></i>ไม่พบที่อยู่นี้ในระบบ (สามารถพิมพ์ต่อเพื่อระบุเป็นที่อยู่ใหม่ได้)</div>';
                resultBox.classList.remove('hidden');
            }
        };

        // เมื่อคลิกเลือกที่อยู่จาก Dropdown
        window.selectReliefAddress = function (addr) {
            document.getElementById('rel_address_search').value = addr;
            document.getElementById('rel_address_results').classList.add('hidden');

            const sameAddrCheckbox = document.getElementById('rel_same_addr');
            if (sameAddrCheckbox && sameAddrCheckbox.checked) {
                if (typeof copyAddress === 'function') {
                    copyAddress(true);
                }
            }
        };

        /// 2. ฟังก์ชันเปิด/ปิด Modal (อัปเดตให้โหลดประวัติที่อยู่และเคลียร์ฟอร์มทุกครั้งที่เปิด)
        window.openReliefModal = function () {
            // ==========================================
            // 🌟 ส่วนที่เพิ่มใหม่: เคลียร์ฟอร์มก่อนเปิดใช้งาน
            // ==========================================
            const form = document.getElementById('reliefForm');
            if (form) form.reset(); // ล้างข้อความทุกช่อง

            const sameAddrCheckbox = document.getElementById('rel_same_addr');
            if (sameAddrCheckbox) sameAddrCheckbox.checked = false; // เอาเครื่องหมายถูกออก

            if (typeof copyAddress === 'function') {
                copyAddress(false); // ปลดล็อคช่องที่อยู่ทะเบียนบ้านให้กลับมาพิมพ์ได้
            }

            const ocrInput = document.getElementById('ocr_id_card');
            if (ocrInput) ocrInput.value = ''; // ล้างไฟล์รูปภาพ AI OCR เดิมออก

            const resultBox = document.getElementById('rel_address_results');
            if (resultBox) resultBox.classList.add('hidden'); // ซ่อนกล่องค้นหา (ถ้ามีค้างอยู่)


            // ==========================================
            // ส่วนเดิม: โหลดข้อมูลประวัติที่อยู่สำหรับ AutoComplete จากชีท Address_Evacuation และประวัติแจกถุงยังชีพ
            // ==========================================
            window.reliefAddressList = getReliefAddressList();

            // สั่งเปิด Modal
            document.getElementById('reliefModal').classList.remove('hidden');
        };

        window.closeReliefModal = function () {
            // สั่งปิด Modal
            document.getElementById('reliefModal').classList.add('hidden');

            // ซ่อนกล่องค้นหาด้วย
            const resultBox = document.getElementById('rel_address_results');
            if (resultBox) resultBox.classList.add('hidden');
        };

        // (ลบฟังก์ชัน toggleRelOtherAddr ของเดิมทิ้งไปได้เลยครับ เพราะเรารวมช่องแล้ว)

        // 3. ฟังก์ชันคัดลอกที่อยู่ (อัปเดตให้ดึงจากช่อง Search)
        window.copyAddress = function (isChecked) {
            if (isChecked) {
                // ดึงค่าจากช่องค้นหา AutoComplete เลย
                const address = document.getElementById('rel_address_search').value;
                document.getElementById('rel_regis_address').value = address;
            } else {
                document.getElementById('rel_regis_address').value = '';
            }
        };

        // 4. ฟังก์ชันบันทึกข้อมูล (อัปเดตให้ดึงข้อมูลส่ง Backend อย่างถูกต้อง)
        // 4. ฟังก์ชันบันทึกข้อมูล (อัปเดตระบบตรวจสอบที่อยู่ซ้ำ)
        window.saveReliefData = async function (e) {
            e.preventDefault();

            const address = document.getElementById('rel_address_search').value.trim();

            if (!address) {
                Swal.fire('แจ้งเตือน', 'กรุณาระบุที่อยู่ปัจจุบันให้ครบถ้วน', 'warning');
                return;
            }

            // 🌟 ส่วนที่เพิ่มใหม่: ตรวจสอบประวัติว่าที่อยู่นี้เคยรับถุงยังชีพไปแล้วหรือยัง
            if (store.reliefData && store.reliefData.length > 0) {
                const isDuplicate = store.reliefData.some(r => {
                    const existingAddress = r[4] ? r[4].toString().trim() : '';
                    return existingAddress === address; // เทียบว่าที่อยู่ตรงกัน 100% หรือไม่
                });

                if (isDuplicate) {
                    Swal.fire({
                        title: 'ไม่สามารถบันทึกได้!',
                        html: `ที่อยู่ <b>"${address}"</b> <br><span class="text-rose-500">มีการรับถุงยังชีพไปแล้ว</span>`,
                        icon: 'error',
                        confirmButtonColor: '#ef4444'
                    });
                    return; // หยุดการทำงาน ไม่ส่งข้อมูลไปบันทึก
                }
            }

            // เตรียมแพ็กเกจข้อมูลเพื่อส่งไป Code.gs
            const payload = {
                action: 'saveRelief',
                name: document.getElementById('rel_name').value,
                status: document.getElementById('rel_status').value,
                members: document.getElementById('rel_members').value,
                address: address, // ใช้ค่าจากช่องค้นหา
                regisAddress: document.getElementById('rel_regis_address').value,
                period: currentPeriod
            };

            Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });

            try {
                if (typeof sbSaveRelief === 'function') {
                    await sbSaveRelief(payload);
                } else {
                    throw new Error('Supabase Service ไม่พร้อมทำงาน');
                }

                Swal.fire({
                    title: 'สำเร็จ',
                    text: 'บันทึกข้อมูลแจกถุงยังชีพเรียบร้อย',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });

                // เคลียร์ฟอร์มให้สะอาด เผื่อกดเพิ่มคนต่อไป
                e.target.reset();
                document.getElementById('rel_address_search').value = '';

                closeReliefModal();
                await loadData(); // โหลดข้อมูลมาอัปเดตตารางและกราฟใหม่
            } catch (err) {
                Swal.fire('ผิดพลาด', err.message, 'error');
            }
        };


        // 1. ฟังก์ชันคำนวณสต๊อก
        window.renderStockDashboard = function () {
            // ต้องมีข้อมูลจากชีทสต๊อก (ReliefStock) ถึงจะทำงาน
            if (!store.reliefStock) return;

            let totalIn = 0;
            let totalOut = 0;

            // วนลูปอ่านค่าจากแท็บ ReliefStock โดยตรงเท่านั้น
            store.reliefStock.forEach(r => {
                const type = r[1] ? r[1].toString().toLowerCase().trim() : '';
                const amount = Number(r[2]) || 0;

                // รองรับทั้งภาษาอังกฤษและภาษาไทย
                if (type === 'in' || type === 'รับเข้า') totalIn += amount;
                if (type === 'out' || type === 'จ่ายออก') totalOut += amount;
            });

            const remain = totalIn - totalOut;

            // อัปเดตตัวเลขขึ้นหน้าจอ
            if (document.getElementById('stockInCount')) document.getElementById('stockInCount').innerText = totalIn;
            if (document.getElementById('stockOutCount')) document.getElementById('stockOutCount').innerText = totalOut;

            const remainEl = document.getElementById('stockRemainCount');
            if (remainEl) {
                remainEl.innerText = remain;

                // (Optional) เปลี่ยนสีตัวเลขตามยอดคงเหลือ เพื่อให้แอดมินสังเกตง่ายขึ้น
                if (remain <= 0) {
                    remainEl.className = "text-5xl font-black text-rose-500"; // สีแดง ถ้ายอดหมด
                } else if (remain <= 50) {
                    remainEl.className = "text-5xl font-black text-amber-500"; // สีส้ม ถ้ายอดเหลือน้อย
                } else {
                    remainEl.className = "text-5xl font-black text-emerald-500"; // สีเขียว ปกติ
                }
            }
        };
        // 3. ฟังก์ชันเปิด-ปิด Modal
        function openStockModal() {
            const modal = document.getElementById('stockModal');
            if (!modal) return;

            modal.classList.remove('hidden');

            // --- จุดสำคัญ: ตรวจสอบข้อมูลก่อนวาดตาราง ---
            if (store && store.reliefStock) {
                renderStockTable();
            } else {
                // ถ้ายังไม่มีข้อมูลใน store ให้แสดงข้อความรอ
                const tbody = document.getElementById('stockTableBody');
                if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-400 italic text-xs">ไม่พบข้อมูลในระบบ หรือ กำลังโหลด...</td></tr>`;

                // ลองโหลดข้อมูลใหม่ (ถ้าคุณมีฟังก์ชัน loadData)
                if (typeof loadData === "function") loadData();
            }

            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modal.querySelector('.bg-white').classList.remove('scale-95');
            }, 10);
        }

        function closeStockModal() {
            const modal = document.getElementById('stockModal');
            modal.classList.add('opacity-0');
            modal.querySelector('.bg-white').classList.add('scale-95');
            setTimeout(() => { modal.classList.add('hidden'); }, 300);
        }




        function changeMapLayer(type) {
            const btnOsm = document.getElementById('btn-osm');
            const btnSat = document.getElementById('btn-sat');

            if (type === 'satellite') {
                evacMap.removeLayer(osmLayer);
                satelliteLayer.addTo(evacMap);

                // สลับ Style ปุ่ม
                btnSat.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
                btnSat.classList.remove('text-slate-500');
                btnOsm.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
                btnOsm.classList.add('text-slate-500');
            } else {
                evacMap.removeLayer(satelliteLayer);
                osmLayer.addTo(evacMap);

                // สลับ Style ปุ่ม
                btnOsm.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
                btnOsm.classList.remove('text-slate-500');
                btnSat.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
                btnSat.classList.add('text-slate-500');
            }
        }

        // 4. บันทึกข้อมูลสต๊อก
        async function saveStock(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            btn.innerText = "กำลังบันทึก..."; btn.disabled = true;

            const payload = {
                action: 'saveStock',
                type: document.getElementById('stock_type').value,
                amount: document.getElementById('stock_amount').value,
                note: document.getElementById('stock_note').value,
                user: currentUser,
                period: currentPeriod
            };

            try {
                if (typeof sbSaveStock === 'function') {
                    await sbSaveStock(payload);
                } else {
                    throw new Error('Supabase Service ไม่พร้อมทำงาน');
                }
                Swal.fire('สำเร็จ', 'อัปเดตสต๊อกเรียบร้อยแล้ว', 'success');
                document.getElementById('stockForm').reset();
                closeStockModal();
                loadData(); // โหลดข้อมูลใหม่เพื่อคำนวณยอด
            } catch (err) { Swal.fire('ผิดพลาด', err.message || 'บันทึกไม่สำเร็จ', 'error'); }
            btn.innerText = "บันทึกสต๊อก"; btn.disabled = false;
        }
        // ฟังก์ชันคำนวณยอดสต๊อก (อิงจากการกดปุ่ม จัดการสต๊อก เท่านั้น)
        window.updateStockSummary = function () {
            if (!store.stockData) return; // ต้องมีข้อมูลจากชีทสต๊อก

            let totalIn = 0;
            let totalOut = 0;

            // วนลูปบวกลบเลขจากข้อมูลสต๊อก
            store.stockData.forEach(r => {
                // ⚠️ หมายเหตุ: ตรวจสอบ index ให้ตรงกับคอลัมน์ในชีทสต๊อกของคุณ 
                // สมมติว่า r[1] คือประเภท (รับเข้า/จ่ายออก) และ r[2] คือจำนวน
                const type = r[1] ? String(r[1]).trim() : '';
                const amount = parseInt(r[2]) || 0;

                // เช็คเงื่อนไขให้ครอบคลุมทั้งภาษาไทยและอังกฤษ (เผื่อ value ใน select เป็นแบบไหน)
                if (type === 'รับเข้า' || type === 'IN') {
                    totalIn += amount;
                } else if (type === 'จ่ายออก' || type === 'OUT') {
                    totalOut += amount;
                }
            });

            const balance = totalIn - totalOut; // ยอดคงเหลือสุทธิ

            // แสดงผลตัวเลขขึ้นการ์ดสรุปยอด (รบกวนเปลี่ยน ID ให้ตรงกับ ID ของการ์ดที่คุณใช้อยู่)
            if (document.getElementById('cardTotalIn')) document.getElementById('cardTotalIn').innerText = totalIn;
            if (document.getElementById('cardTotalOut')) document.getElementById('cardTotalOut').innerText = totalOut;

            // การ์ดยอดคงเหลือ
            const balanceEl = document.getElementById('cardStockBalance');
            if (balanceEl) {
                balanceEl.innerText = balance;
                // เปลี่ยนสีตัวเลขถ้ายอดเหลือน้อย
                if (balance <= 0) {
                    balanceEl.className = "text-5xl font-black text-rose-500";
                } else if (balance <= 50) {
                    balanceEl.className = "text-5xl font-black text-amber-500";
                } else {
                    balanceEl.className = "text-5xl font-black text-emerald-500";
                }
            }
        };
        // 1. ฟังก์ชันวาดตารางประวัติสต็อก
        function renderStockTable() {
            const tbody = document.getElementById('stockTableBody');
            if (!tbody) return;

            // ตรวจสอบว่ามีข้อมูลใน store หรือไม่
            if (!store || !store.reliefStock || store.reliefStock.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-300 italic text-xs">ยังไม่มีประวัติการทำรายการในขณะนี้</td></tr>`;
                return;
            }

            // นำข้อมูลล่าสุดขึ้นก่อน
            const displayData = [...store.reliefStock].reverse();

            tbody.innerHTML = displayData.map(r => {
                // ป้องกันค่า Error จากวันที่
                let dateStr = "-";
                let timeStr = "";
                try {
                    if (r[0]) {
                        const d = new Date(r[0]);
                        dateStr = d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
                        timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                    }
                } catch (e) { console.error("Date error", e); }

                const type = (r[1] || '').toString().toLowerCase() === 'in' ?
                    '<span class="text-blue-500 font-bold text-[10px]">รับเข้า</span>' :
                    '<span class="text-rose-500 font-bold text-[10px]">จ่ายออก</span>';

                const amount = Number(r[2] || 0).toLocaleString();
                const note = r[3] || '-';

                return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">
                <td class="p-2">
                    <div class="font-bold text-slate-700 text-[11px]">${dateStr}</div>
                    <div class="text-[8px] opacity-40">${timeStr}</div>
                </td>
                <td class="p-2 text-center">${type}</td>
                <td class="p-2 text-right font-black ${r[1] === 'in' ? 'text-blue-600' : 'text-rose-600'} text-[11px]">
                    ${amount}
                </td>
                <td class="p-2 text-right">
                    <div class="text-[10px] text-slate-400 leading-tight truncate max-w-[70px] ml-auto" title="${note}">
                        ${note}
                    </div>
                </td>
            </tr>
        `;
            }).join('');
        }


        // --- กฎเกณฑ์การแยก Zone ตามชื่อถนน ---
        const zoneRules = window.ZONE_RULES;

        function renderReliefTable(data, isSearching = false) {
            const tableBody = document.getElementById('reliefTableBody');
            if (!tableBody) return;

            // 1. กำหนดข้อมูลที่จะนำมาใช้นับสรุป (รวมทั้งหมด หรือ เฉพาะที่ค้นหา)
            const summaryData = isSearching ? data : (store.reliefData || []);

            // อัปเดตยอดรวมทั้งหมด
            if (document.getElementById('totalReliefCount')) {
                document.getElementById('totalReliefCount').innerText = summaryData.length;
            }

            // 2. ตัวแปรเก็บจำนวนของแต่ละ Zone
            let counts = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };

            // 3. วนลูปเช็คที่อยู่ (สมมติว่าที่อยู่เก็บในช่อง r[4])
            summaryData.forEach(r => {
                const address = r[4] ? r[4].toString() : '';

                // เรียกใช้ฟังก์ชันวิเคราะห์โซนแบบแม่นยำ (ป้องกันคำซ้อนทับกัน)
                const exactZone = window.getExactZoneForAddress(address);

                // นำผลลัพธ์ (เช่น 'zone 1') มาตัดช่องว่างออกเป็น 'zone1' เพื่อบวกเลขเข้าตัวแปร counts ให้ตรงจุด
                const zoneKey = exactZone.replace(' ', '');

                if (counts[zoneKey] !== undefined) {
                    counts[zoneKey]++;
                }
            });

            // 4. แสดงผลตัวเลขขึ้นการ์ด
            if (document.getElementById('zone1Count')) document.getElementById('zone1Count').innerText = counts.zone1;
            if (document.getElementById('zone2Count')) document.getElementById('zone2Count').innerText = counts.zone2;
            if (document.getElementById('zone3Count')) document.getElementById('zone3Count').innerText = counts.zone3;
            if (document.getElementById('zone4Count')) document.getElementById('zone4Count').innerText = counts.zone4;
            if (document.getElementById('zone5Count')) document.getElementById('zone5Count').innerText = counts.zone5;

            // --- ส่วนตารางด้านล่าง ---
            if (!data || data.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-20 text-slate-400 font-bold"><i class="fas fa-search-minus text-3xl mb-3 block opacity-20"></i>ไม่พบข้อมูล</td></tr>`;
                return;
            }

            let displayData = isSearching ? data : [...data].reverse();
            window.currentReliefDisplayData = displayData;

            tableBody.innerHTML = displayData.map((r, index) => {
                const timestamp = r[0] ? new Date(r[0]).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
                const statusClass = r[2] === 'เจ้าบ้าน' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-amber-50 text-amber-600 border-amber-100';

                return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="p-5 text-center font-bold text-slate-300">
                    ${isSearching ? '•' : (displayData.length - index)}
                </td>
                <td class="p-5">
                    <div class="text-[9px] text-slate-400 font-bold mb-1"><i class="far fa-clock mr-1"></i>${timestamp}</div>
                    <div class="font-black text-slate-700 text-sm">${r[1] || 'ไม่ระบุชื่อ'}</div>
                </td>
                <td class="p-5 text-slate-600 font-medium leading-relaxed">${r[4] || '-'}</td>
                <td class="p-5 text-center">
                    <span class="bg-slate-100 text-slate-600 px-3 py-1 rounded-xl font-black">${r[3] || 0}</span>
                </td>
                <td class="p-5 text-center">
                    <span class="px-3 py-1 rounded-full font-black text-[9px] border ${statusClass} shadow-sm uppercase">
                        ${r[2] || 'ปกติ'}
                    </span>
                </td>
            </tr>
        `;
            }).join('');
        }
        async function loadUsers() {
            const tbody = document.getElementById('userTableBody');
            tbody.innerHTML = `<tr><td colspan="3" class="text-center py-10"><i class="fas fa-spinner fa-spin text-slate-300 text-2xl"></i></td></tr>`;

            try {
                const users = typeof sbGetUsers === 'function' ? await sbGetUsers() : [];
                if (users && users.length > 0) {
                    tbody.innerHTML = users.map((u) => `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-4 font-bold text-slate-700">${u[0]}</td>
                    <td class="p-4 text-center">
                        <span class="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${u[1] === 'admin' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}">${u[1]}</span>
                    </td>
                    <td class="p-4 text-center">
                        <button onclick="deleteUser('${u[0]}')" class="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm"><i class="fas fa-trash-alt text-xs"></i></button>
                    </td>
                </tr>
            `).join('');
                } else {
                    tbody.innerHTML = `<tr><td colspan="3" class="text-center py-6 text-slate-400 font-bold">ยังไม่มีรายชื่อผู้ใช้งาน</td></tr>`;
                }
            } catch (err) {
                console.error(err);
                tbody.innerHTML = `<tr><td colspan="3" class="text-center text-red-400 py-4">ดึงข้อมูลล้มเหลว</td></tr>`;
            }
        }


        /**
         * ฟังก์ชันสำหรับกรองข้อมูลในตารางตาม Zone
         * @param {string} zoneKey - ชื่อโซน (zone1, zone2, ...)
         */
        function filterByZone(zoneKey) {
            if (!store.reliefData) return;

            window.currentZoneFilter = zoneKey;

            const searchInput = document.getElementById('reliefSearchInput');
            if (searchInput) searchInput.value = '';

            document.getElementById('clearFilterArea').classList.remove('hidden');

            // 🌟 เปลี่ยนเงื่อนไขการกรองมาใช้ getExactZoneForAddress
            const filteredData = store.reliefData.filter(r => {
                const address = r[4] ? r[4].toString() : '';
                return window.getExactZoneForAddress(address) === zoneKey;
            });

            document.querySelectorAll('.zone-filter-btn').forEach(btn => {
                btn.classList.replace('bg-blue-50', 'bg-white');
                btn.style.opacity = "0.5";
                btn.classList.remove('ring-2');
            });

            const activeBtn = document.getElementById(`btn-${zoneKey}`);
            if (activeBtn) {
                activeBtn.style.opacity = "1";
                activeBtn.classList.add('ring-2');
            }

            renderReliefTable(filteredData, true);
            console.log(`Filtering by ${zoneKey}: พบ ${filteredData.length} รายการ`);
        }

        /**
         * ฟังก์ชันล้างตัวกรอง กลับไปแสดงข้อมูลทั้งหมด
         */
        function clearZoneFilter() {
            // 1. รีเซ็ตค่า Global เพื่อให้หัวกระดาษพิมพ์กลับไปแสดงคำว่า "ข้อมูลทั้งหมด"
            window.currentZoneFilter = '';

            // 2. ซ่อนปุ่มล้างตัวกรอง
            document.getElementById('clearFilterArea').classList.add('hidden');

            // 3. เคลียร์ข้อความในช่องค้นหา (เพื่อไม่ให้เงื่อนไขค้นหาเก่าค้างอยู่)
            const searchInput = document.getElementById('reliefSearchInput');
            if (searchInput) searchInput.value = '';

            // 4. รีเซ็ตสไตล์ปุ่ม Zone กลับเป็นค่าเริ่มต้น
            document.querySelectorAll('.zone-filter-btn').forEach(btn => {
                btn.style.opacity = "1";
                btn.classList.remove('ring-2');
            });

            // 5. แสดงข้อมูลทั้งหมดใหม่
            if (store.reliefData) {
                renderReliefTable(store.reliefData);
                console.log(`Cleared filters: แสดงข้อมูลทั้งหมด ${store.reliefData.length} รายการ`);
            }
        }
        // ==========================================
        // ระบบ AI OCR (สแกนบัตรประชาชน)
        // ==========================================

        // ฟังก์ชันสำหรับย่อขนาดรูปภาพก่อนส่งให้ AI (แก้ปัญหาไฟล์รูปใหญ่เกินไป)
        function compressImage(file, maxWidth, maxHeight, quality) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = event => {
                    const img = new Image();
                    img.src = event.target.result;
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;

                        // คำนวณสัดส่วนใหม่ถ้าภาพใหญ่เกิน
                        if (width > height) {
                            if (width > maxWidth) {
                                height = Math.round((height * maxWidth) / width);
                                width = maxWidth;
                            }
                        } else {
                            if (height > maxHeight) {
                                width = Math.round((width * maxHeight) / height);
                                height = maxHeight;
                            }
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        // คืนค่าเป็น Base64
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    }
                }
            });
        }
        // ฟังก์ชันท่าไม้ตายสำหรับบังคับยัดข้อมูลผ่าน AutoComplete
        function forceFillInput(elementId, value) {
            const el = document.getElementById(elementId);
            if (!el) return; // ถ้าหาช่องไม่เจอให้ข้ามไป

            // 1. ใส่ข้อความลงไปตรงๆ
            el.value = value;

            // 2. ถ้าในระบบของคุณมีการใช้ jQuery (ปลั๊กอิน AutoComplete ส่วนใหญ่ใช้)
            if (typeof window.jQuery !== 'undefined') {
                window.jQuery(el).val(value).trigger('input').trigger('change').trigger('keyup');
            }

            // 3. จำลอง Event คีย์บอร์ดทุกรูปแบบ (หลอก AutoComplete ว่ามีคนกำลังพิมพ์)
            const eventsToTrigger = ['focus', 'keydown', 'input', 'keyup', 'change', 'blur'];
            eventsToTrigger.forEach(eventType => {
                let event;
                if (eventType.includes('key')) {
                    // จำลองการกดคีย์บอร์ด
                    event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true, key: 'a', charCode: 65, keyCode: 65 });
                } else {
                    event = new Event(eventType, { bubbles: true, cancelable: true });
                }
                el.dispatchEvent(event);
            });
        }
        async function processIdCardOCR(event) {
            const file = event.target.files[0];
            if (!file) return;

            event.target.value = '';

            Swal.fire({
                title: 'กำลังอ่านข้อมูลด้วย AI...',
                html: 'ระบบกำลังดึงชื่อและที่อยู่จากบัตรประชาชน<br><span class="text-xs text-indigo-500 font-bold mt-2 block">Powered by Typhoon OCR & AksonOCR</span>',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            try {
                // 1. ย่อรูปและแปลงเป็น Base64
                const base64DataUrl = await compressImage(file, 1200, 1200, 0.7);
                const base64Image = base64DataUrl.split(',')[1];

                // 🌟 1.1 ดึงค่า Engine ที่ผู้ใช้เลือกจาก Dropdown (ถ้าหาไม่เจอให้ค่าเริ่มต้นเป็น typhoon)
                const engineSelect = document.getElementById('swal_ocr_engine');
                const selectedEngine = engineSelect ? engineSelect.value : 'typhoon';

                // 2. ส่งรูปภาพและชื่อระบบ AI ไปให้ Google Apps Script 
                const payload = {
                    action: 'ocrIdCard',
                    image: base64Image,
                    engine: selectedEngine // 🌟 ส่งค่า engine ('typhoon' หรือ 'akson') ไปให้ Code.gs สลับราง
                };

                const response = await fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.error || 'ไม่สามารถอ่านข้อมูลได้');
                }

                // 🌟 เพิ่ม console.log เพื่อให้ดูข้อมูลดิบในหน้าต่าง Developer Tools ได้
                console.log(`ข้อมูลที่ AI (${selectedEngine}) ส่งกลับมา:`, result.data);

                // 3. นำข้อมูลที่ได้จาก Apps Script มากรอกลงฟอร์ม
                const extractedName = result.data.name || result.data.Name || result.data.ชื่อ || result.data['ชื่อ-นามสกุล'] || "";
                const extractedAddress = result.data.address || result.data.nationality || result.data.Address || result.data.ที่อยู่ || result.data['ที่อยู่'] || "";

                if (!extractedAddress) {
                    Swal.fire('พบปัญหา!', 'ดึงข้อมูลสำเร็จ แต่ไม่พบฟิลด์ที่อยู่ (AI อาจตอบมาผิดรูปแบบ)', 'warning');
                    return;
                }

                // กรอกชื่อ
                if (extractedName) {
                    document.getElementById('rel_name').value = extractedName;
                }

                // 🌟 จัดการเรื่องที่อยู่ (แก้ปัญหาช่องว่างเปล่า)
                if (extractedAddress) {

                    // 1. นำข้อมูลไปใส่ในช่อง "ที่อยู่ตามทะเบียนบ้าน"
                    const regisInput = document.getElementById('rel_regis_address');
                    if (regisInput) {
                        regisInput.value = extractedAddress;
                    }

                    // 2. นำข้อมูลไปใส่ในช่อง "ที่อยู่ปัจจุบัน (ค้นหา)" ด้วย 
                    // เพื่อป้องกันไม่ให้ copyAddress ก๊อปค่าว่างเปล่ามาทับ
                    const searchInput = document.getElementById('rel_address_search');
                    if (searchInput) {
                        searchInput.value = extractedAddress;
                    }

                    // 3. ติ๊กถูกที่ช่อง Checkbox "ที่อยู่ตรงกัน"
                    const sameAddrCheckbox = document.getElementById('rel_same_addr');
                    if (sameAddrCheckbox) {
                        sameAddrCheckbox.checked = true; // สั่งติ๊กถูก

                        // เรียกฟังก์ชัน copyAddress ของคุณให้ทำงานตามปกติ (ตอนนี้ปลอดภัยแล้วเพราะช่องปัจจุบันมีข้อมูลแล้ว)
                        if (typeof copyAddress === 'function') {
                            copyAddress(true);
                        }
                    }

                    // 4. ซ่อนกล่องค้นหา (ถ้ามันเด้งขึ้นมา)
                    const searchResults = document.getElementById('rel_address_results');
                    if (searchResults) {
                        searchResults.classList.add('hidden');
                    }
                }

                // 4. แสดงผล Popup แจ้งเตือนแบบมีชื่อและที่อยู่
                Swal.fire({
                    icon: 'success',
                    title: 'ดึงข้อมูลสำเร็จ!',
                    html: '<div class="text-left text-sm mt-2 bg-slate-50 p-4 rounded-xl border border-slate-100">' +
                        '<p class="mb-2"><strong class="text-slate-700">ชื่อ-สกุล:</strong> <span class="text-blue-600">' + extractedName + '</span></p>' +
                        '<p><strong class="text-slate-700">ที่อยู่:</strong> <span class="text-emerald-600">' + extractedAddress + '</span></p>' +
                        '</div>' +
                        '<p class="text-[10px] text-slate-400 mt-3 font-bold">กรุณาตรวจสอบความถูกต้องในฟอร์มอีกครั้ง</p>',
                    timer: 4000,
                    showConfirmButton: false
                });

            } catch (error) {
                console.error("OCR Error:", error);
                Swal.fire({
                    icon: 'error',
                    title: 'อ่านข้อมูลไม่สำเร็จ',
                    text: error.message || 'ภาพอาจไม่ชัดเจน หรือระบบ AI ขัดข้อง กรุณาลองใหม่อีกครั้ง'
                });
            }
        }
        async function saveUser(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            btn.innerText = "กำลังบันทึก..."; btn.disabled = true;

            const payload = {
                action: 'saveUser',
                targetUser: document.getElementById('manage_username').value.trim(),
                targetRole: document.getElementById('manage_role').value
            };

            try {
                if (typeof sbSaveUser === 'function') {
                    await sbSaveUser(payload.targetUser, payload.targetRole);
                } else {
                    throw new Error('Supabase Service ไม่พร้อมทำงาน');
                }
                Swal.fire('สำเร็จ', 'บันทึกสิทธิ์ผู้ใช้งานแล้ว', 'success');
                document.getElementById('userForm').reset();
                loadUsers(); // โหลดตารางใหม่
            } catch (err) { Swal.fire('ผิดพลาด', err.message || 'บันทึกไม่สำเร็จ', 'error'); }
            btn.innerText = "บันทึกข้อมูล"; btn.disabled = false;
        }

        async function deleteUser(username) {
            if (username === currentUser) return Swal.fire('ปฏิเสธ', 'ไม่สามารถลบบัญชีตัวเองขณะใช้งานได้', 'warning');

            const confirm = await Swal.fire({ title: 'ยืนยันการลบ?', text: `ต้องการลบผู้ใช้ ${username} ใช่หรือไม่`, icon: 'warning', showCancelButton: true, confirmButtonText: 'ลบข้อมูล', confirmButtonColor: '#ef4444' });
            if (!confirm.isConfirmed) return;

            try {
                if (typeof sbDeleteUser === 'function') {
                    await sbDeleteUser(username);
                } else {
                    throw new Error('Supabase Service ไม่พร้อมทำงาน');
                }
                Swal.fire('ลบแล้ว', 'ลบผู้ใช้งานสำเร็จ', 'success');
                loadUsers();
            } catch (err) { Swal.fire('ผิดพลาด', err.message || 'ลบไม่สำเร็จ', 'error'); }
        }
        function selectTrend(value, btn) {
            // เก็บค่าลงใน Input Hidden เพื่อส่งไปพร้อมฟอร์ม
            document.getElementById('water_trend').value = value;

            // เคลียร์สถานะปุ่มอื่นทั้งหมด
            document.querySelectorAll('.trend-btn').forEach(el => {
                el.classList.remove('active-trend');
            });

            // เพิ่มสถานะให้ปุ่มที่ถูกกด
            btn.classList.add('active-trend');
        }
        function setDateFilter(type) {
            const end = new Date(); let start = new Date();
            if (type === 'today') start.setHours(0, 0, 0, 0);
            else if (type === 'yesterday') { start.setDate(end.getDate() - 1); start.setHours(0, 0, 0, 0); end.setDate(end.getDate() - 1); end.setHours(23, 59, 59); }
            else if (type === 'week') start.setDate(end.getDate() - 7);
            document.getElementById('startDate').valueAsDate = start;
            document.getElementById('endDate').valueAsDate = end;
            updateWaterChart();
        }

        function updateWaterChart() {
            const loc = document.getElementById('chartLocFilter').value;
            const start = new Date(document.getElementById('startDate').value);
            const end = new Date(document.getElementById('endDate').value);
            if (!isNaN(end)) end.setHours(23, 59, 59);
            let filtered = store.waterLevels.filter(r => {
                const d = new Date(r[0]);
                return (loc === 'all' || r[1] === loc) && (isNaN(start) || d >= start) && (isNaN(end) || d <= end);
            }).sort((a, b) => new Date(a[0]) - new Date(b[0]));
            const datasets = [];
            const activeAreas = loc === 'all' ? [...new Set(filtered.map(r => r[1]))] : [loc];
            const colors = ['#2563eb', '#dc2626', '#059669', '#ca8a04', '#7c3aed'];
            activeAreas.forEach((area, i) => {
                const areaData = filtered.filter(r => r[1] === area);
                datasets.push({
                    label: area,
                    data: areaData.map(r => ({ x: new Date(r[0]), y: r[2] })),
                    borderColor: colors[i % colors.length],
                    borderWidth: 2, tension: 0.3, pointRadius: 3, pointHoverRadius: 6
                });
            });
            const ctx = document.getElementById('waterChart').getContext('2d');
            if (waterChartInstance) waterChartInstance.destroy();
            waterChartInstance = new Chart(ctx, {
                type: 'line', data: { datasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'nearest', intersect: false, axis: 'x' },
                    plugins: {
                        tooltip: { backgroundColor: 'rgba(255, 255, 255, 0.95)', titleColor: '#1e40af', bodyColor: '#334155', borderColor: '#e2e8f0', borderWidth: 1, padding: 10 },
                        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } }
                    },
                    scales: {
                        x: { type: 'time', time: { displayFormats: { day: 'dd MMM' } }, grid: { display: false }, ticks: { font: { size: 9 } } },
                        y: { ticks: { font: { size: 9 } } }
                    }
                }
            });
        }

        function renderWaterCards() {
            const filter = document.getElementById('cardLocFilter').value;
            let displayData = [];

            // 1. Logic การกรองข้อมูล (คงเดิม)
            if (filter === 'all') {
                const activeAreas = [...new Set(store.waterLevels.map(r => r[1]))];
                activeAreas.forEach(area => {
                    const latest = store.waterLevels.filter(r => r[1] === area).sort((a, b) => new Date(b[0]) - new Date(a[0]))[0];
                    if (latest) displayData.push(latest);
                });
                displayData.sort((a, b) => new Date(b[0]) - new Date(a[0]));
            } else {
                displayData = store.waterLevels.filter(r => r[1] === filter).sort((a, b) => new Date(b[0]) - new Date(a[0]));
            }

            // 2. แสดงผล Card พร้อมฟังก์ชัน Pan to Marker
            document.getElementById('waterList').innerHTML = displayData.slice(0, 12).map(r => {
                const locationName = r[1]; // ชื่อพื้นที่/จุดวัด
                const trend = r[4] || 'คงตัว';
                const photoUrl = r[6] || '';
                let displayLink = photoUrl.includes("id=") ? `https://drive.google.com/thumbnail?id=${photoUrl.split("id=")[1]}&sz=w600` : photoUrl;

                let cardStyle = "bg-white text-slate-700", badgeStyle = "bg-blue-100 text-blue-600";
                if (trend === 'เพิ่มขึ้น') { cardStyle = "bg-red-600 text-white animate-pulse-fast"; badgeStyle = "bg-red-800 text-white"; }
                else if (trend === 'คงตัว') { cardStyle = "bg-yellow-400 text-slate-900"; badgeStyle = "bg-yellow-600 text-white"; }
                else if (trend === 'ลดลง') { cardStyle = "bg-green-500 text-white"; badgeStyle = "bg-green-700 text-white"; }

                return `
            <div onclick="focusOnLocation('${locationName}')" 
                 class="rounded-[2rem] border shadow-md overflow-hidden transition-all active:scale-[0.98] cursor-pointer hover:shadow-xl ${cardStyle} flex flex-col h-full group">
                
                <div class="water-card-img-container relative overflow-hidden">
                    ${displayLink ? `<img src="${displayLink}" 
                        onclick="event.stopPropagation(); openLightbox('${displayLink}')" 
                        class="w-full h-full object-cover cursor-zoom-in group-hover:scale-110 transition-transform duration-500" 
                        alt="สถานการณ์น้ำ"
                        onerror="this.src='https://placehold.co/600x400?text=No+Photo'">` :
                        `<div class="w-full h-full flex flex-col items-center justify-center text-slate-300 italic text-xs">
                            <i class="fas fa-image text-3xl mb-2"></i>รอการอัปโหลดภาพ
                        </div>`}
                    
                    <div class="absolute top-3 right-3 bg-black/20 backdrop-blur-md p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <i class="fas fa-location-arrow text-white text-xs"></i>
                    </div>
                </div>

                <div class="p-4 flex-1 flex flex-col justify-between">
                    <div>
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-[10px] font-black px-2 py-1 rounded-full ${badgeStyle} uppercase">
                                ${new Date(r[0]).toLocaleTimeString('th-TH')}
                            </span>
                            <i class="fas ${trend === 'เพิ่มขึ้น' ? 'fa-arrow-up' : (trend === 'ลดลง' ? 'fa-arrow-down' : 'fa-arrows-alt-h')} text-sm"></i>
                        </div>
                        <p class="text-sm font-black truncate mb-1">${locationName}</p>
                        <p class="text-2xl font-black">${r[2]} <span class="text-xs font-normal opacity-70 italic">ซม.</span></p>
                    </div>
                    
                    <div class="mt-3 pt-3 border-t border-black/10">
                        <p class="text-[9px] font-bold opacity-80 uppercase leading-tight">
                            <i class="fas fa-user-edit mr-1"></i> ${r[3]}
                        </p>
                        ${r[7] ? `<p class="text-[9px] mt-1 italic line-clamp-2 opacity-80">${r[7]}</p>` : ''}
                    </div>
                </div>
            </div>`;
            }).join('');
        }
        // --- Utils ---
        function getLocation() {
            if (navigator.geolocation) {
                Swal.fire({ title: 'กำลังดึงพิกัด...', didOpen: () => Swal.showLoading() });
                navigator.geolocation.getCurrentPosition((p) => {
                    document.getElementById('water_coords').value = `${p.coords.latitude},${p.coords.longitude}`;
                    Swal.close();
                }, () => Swal.fire('กรุณาเปิด GPS', '', 'error'));
            }
        }

        function previewImg(e) {
            const f = e.target.files[0];
            if (f) {
                const r = new FileReader();
                r.onload = (ev) => { document.getElementById('img_preview_box').innerHTML = `<img src="${ev.target.result}" class="h-full w-full object-cover">`; };
                r.readAsDataURL(f);
            }
        }

        async function saveWater(e) {
            e.preventDefault();
            const btn = document.getElementById('saveWaterBtn');
            Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                btn.disabled = true;
                const file = document.getElementById('water_img').files[0];
                let imageData = null, imageType = null;
                if (file) {
                    imageData = await new Promise(res => {
                        const r = new FileReader();
                        r.onload = (ev) => res(ev.target.result);
                        r.readAsDataURL(file);
                    });
                    imageType = file.type;
                }
                const payload = { action: 'saveWater', location: document.getElementById('water_loc').value, level: document.getElementById('water_val').value, trend: document.getElementById('water_trend').value, coords: document.getElementById('water_coords').value, note: document.getElementById('water_note').value, reporter: currentUser, imageData, imageType, period: currentPeriod };
                if (typeof sbSaveWater === 'function') {
                    await sbSaveWater(payload);
                } else {
                    throw new Error('Supabase Service ไม่พร้อมทำงาน');
                }
                Swal.fire('สำเร็จ', 'บันทึกเรียบร้อยแล้ว', 'success').then(() => {
                    document.getElementById('waterForm').reset();
                    document.getElementById('img_preview_box').innerHTML = `<i class="fas fa-camera text-3xl text-blue-300"></i><p class="text-xs text-blue-400 mt-2 font-bold">แตะเพื่อเปิดกล้อง</p>`;
                    loadData(); showPage('water');
                });
            } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); } finally { btn.disabled = false; }
        }
        let shelterPieInstance = null;

        let waterMap;
        let markerLayer = L.layerGroup();

        // ฟังก์ชันสร้างไอคอนหมุดตามระดับน้ำ
        function getWaterIcon(level) {
            let color = '#22c55e'; // เขียว (ปกติ 0)
            let shadowColor = 'rgba(34, 197, 94, 0.4)';
            let extraClass = ''; // คลาสเสริมสำหรับ Animation

            if (level >= 1 && level <= 30) {
                color = '#facc15'; // เหลือง
                shadowColor = 'rgba(250, 204, 21, 0.4)';
            } else if (level >= 31 && level <= 80) {
                color = '#f97316'; // ส้ม
                shadowColor = 'rgba(249, 115, 22, 0.4)';
            } else if (level >= 81) {
                color = '#dc2626'; // แดง (วิกฤต)
                shadowColor = 'rgba(220, 38, 38, 0.5)';
                extraClass = 'critical-pulse'; // ใส่คลาสกระพริบ
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
        //---------------ฟังก์ชั่นที่เกี่ยวข้องกับหน้า "สถานะการอพยพ"-----------//
        //------------------------------------------------------------//

        window.loadEvacuationMarkers = function () {
            if (evacMap && evacMarkerLayer) {
                evacMarkerLayer.clearLayers();
            }

            const coordsMap = {};
            if (store.addressEvac) {
                store.addressEvac.forEach(row => {
                    const address = row[0] ? row[0].toString().trim() : '';
                    const lat = parseFloat(row[1]);
                    const lng = parseFloat(row[2]);
                    if (address && !isNaN(lat) && !isNaN(lng)) {
                        coordsMap[address] = { lat, lng };
                    }
                });
            }

            // จัดกลุ่มผู้เข้าพักพิงในศูนย์พักพิง (store.evacuees) แยกตามที่อยู่บ้าน
            const evacuees = store.evacuees || [];
            const houseShelterMap = {};
            evacuees.forEach(r => {
                const sName = (r[1] || '').toString().trim();
                const address = (r[2] || '').toString().trim();
                const name = (r[4] || '').toString().trim();
                const health = (r[8] || 'ปกติ').toString().trim();
                const status = (r[10] || '').toString().trim();

                if (address && status !== 'กลับบ้านแล้ว') {
                    if (!houseShelterMap[address]) {
                        houseShelterMap[address] = { count: 0, members: [], shelters: new Set() };
                    }
                    houseShelterMap[address].count += 1;
                    houseShelterMap[address].members.push({ name, shelter: sName, health });
                    if (sName) houseShelterMap[address].shelters.add(sName);
                }
            });

            const latestReports = {};
            if (store.evacReports && store.evacReports.length > 0) {
                store.evacReports.forEach(report => {
                    const address = report[1] ? report[1].toString().trim() : '';
                    const time = new Date(report[0]).getTime();
                    if (address && (!latestReports[address] || time > latestReports[address].time)) {
                        latestReports[address] = { data: report, time: time };
                    }
                });
            }

            let evacPeople = 0;
            let evacHouseholds = 0;
            let centerPeople = 0;
            let otherPeople = 0;

            let safePeople = 0;
            let safeHouseholds = 0;

            const processedAddresses = new Set();

            // 1. ประมวลผลจากรายงานสถานะ (Evacuation Reports)
            Object.values(latestReports).forEach(item => {
                const report = item.data;
                const timestamp = new Date(report[0]).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
                const address = report[1].toString().trim();
                processedAddresses.add(address);

                let count = parseInt(report[2]) || 0;
                let destType = report[3];
                let destName = report[4];
                const reporter = report[5] || 'ไม่มีข้อมูล';
                const customCoords = report[6] ? report[6].toString().trim() : '';
                const evacName = report[7] ? report[7].toString().trim() : '<span class="text-slate-400 italic font-normal">ไม่ระบุชื่อ</span>';
                const status = report[8] ? report[8].toString().trim() : 'อพยพ';
                const note = report[9] ? report[9].toString().trim() : '-';

                const shelterHouseData = houseShelterMap[address];
                if (shelterHouseData && status !== 'ปลอดภัย') {
                    count = Math.max(count, shelterHouseData.count);
                    destType = 'ศูนย์';
                    if (shelterHouseData.shelters.size > 0) {
                        destName = Array.from(shelterHouseData.shelters).join(', ');
                    }
                }

                // สรุปยอด
                if (status === 'ปลอดภัย') {
                    safeHouseholds++;
                    safePeople += count;
                } else {
                    evacHouseholds++;
                    evacPeople += count;
                    if (destType === 'ศูนย์' || shelterHouseData) {
                        centerPeople += count;
                    } else {
                        otherPeople += count;
                    }
                }

                // วาดหมุด
                let pos = null;
                if (customCoords && customCoords.includes(',')) {
                    const parts = customCoords.split(',');
                    pos = { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };
                } else {
                    pos = coordsMap[address];
                }

                if (pos) {
                    let markerColor = '#8b5cf6';
                    let iconClass = 'fa-house-user';
                    let bgHeaderColor = 'bg-orange-500';
                    let statusBadge = '';

                    if (status === 'ปลอดภัย') {
                        markerColor = '#10b981';
                        iconClass = 'fa-check-circle';
                        bgHeaderColor = 'bg-emerald-500';
                        statusBadge = '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[9px] font-bold ml-2">ปลอดภัย</span>';
                    } else if (destType === 'ศูนย์' || shelterHouseData) {
                        markerColor = '#3b82f6';
                        iconClass = 'fa-campground';
                        bgHeaderColor = 'bg-blue-500';
                        statusBadge = '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[9px] font-bold ml-2">เข้าศูนย์พักพิง</span>';
                    } else {
                        bgHeaderColor = 'bg-purple-500';
                    }

                    const evacIcon = L.divIcon({
                        className: 'custom-evac-marker bg-transparent border-0',
                        html: `
                    <div class="relative flex flex-col items-center">
                        <div style="color: ${markerColor}; border-color: ${markerColor}" class="bg-white w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-md text-sm z-10 relative">
                            <i class="fas ${iconClass}"></i>
                            <span class="absolute -top-1.5 -right-1.5 ${status === 'ปลอดภัย' ? 'bg-emerald-500' : 'bg-blue-600'} text-white text-[8px] font-black min-w-[16px] h-[16px] flex items-center justify-center rounded-full border border-white shadow-sm leading-none px-1">${count}</span>
                        </div>
                        <div style="border-top-color: ${markerColor}" class="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent mx-auto -mt-[1px] z-0"></div>
                    </div>
                `,
                        iconSize: [32, 38],
                        iconAnchor: [16, 38],
                        popupAnchor: [0, -38]
                    });

                    const marker = L.marker([pos.lat, pos.lng], { icon: evacIcon });

                    const destHtml = status === 'ปลอดภัย' ? '' : `
                <p class="text-[11px] text-slate-600 flex items-start">
                    <span class="font-bold text-slate-500 w-16 shrink-0">ปลายทาง:</span> 
                    <span><span class="font-bold text-slate-800">${destName || 'ศูนย์พักพิง'}</span> <br><span class="text-[9px] text-slate-400">ประเภท: ${destType || 'ศูนย์'}</span></span>
                </p>
            `;

                    let shelterMembersHtml = '';
                    if (shelterHouseData && shelterHouseData.members.length > 0) {
                        shelterMembersHtml = `
                            <div class="mt-2 pt-2 border-t border-slate-200">
                                <p class="text-[10px] font-bold text-blue-700 mb-1"><i class="fas fa-campground mr-1"></i>ผู้อพยพเข้าพักพิงในศูนย์ (${shelterHouseData.count} คน):</p>
                                <ul class="text-[11px] text-slate-700 space-y-0.5 bg-blue-50 p-2 rounded-lg border border-blue-100">
                                    ${shelterHouseData.members.map(m => `<li>• <b>${m.name}</b> (${m.shelter || 'ศูนย์พักพิง'}) ${m.health !== 'ปกติ' ? `<span class="text-rose-600 font-bold">(${m.health})</span>` : ''}</li>`).join('')}
                                </ul>
                            </div>
                        `;
                    }

                    const popupHTML = `
                <div class="w-full font-sans bg-white relative min-w-[200px]">
                    <div class="${bgHeaderColor} p-3 flex justify-between items-center text-white relative overflow-hidden">
                        <i class="fas ${iconClass} absolute -right-2 -bottom-2 text-5xl opacity-20 transform -rotate-12"></i>
                        <span class="text-[10px] font-black uppercase tracking-widest bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/20 z-10 shadow-sm">
                            <i class="fas fa-users mr-1"></i> ผู้อพยพ/ผู้รายงาน ${count} คน
                        </span>
                    </div>
                    <div class="p-4">
                        <h4 class="font-black text-slate-800 text-[14px] leading-tight mb-2 flex items-center">
                            ${address} ${statusBadge}
                        </h4>
                        
                        <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100 shadow-inner space-y-1.5">
                            <p class="text-[11px] text-slate-600 flex items-start border-b border-slate-200 pb-1.5 mb-1.5">
                                <span class="font-bold text-slate-500 w-16 shrink-0">ชื่อ-สกุล:</span> 
                                <span class="font-bold ${status === 'ปลอดภัย' ? 'text-emerald-600' : 'text-blue-600'}">${evacName}</span>
                            </p>
                            ${destHtml}
                            ${shelterMembersHtml}
                            <p class="text-[11px] text-slate-600 flex items-start">
                                <span class="font-bold text-slate-500 w-16 shrink-0">ผู้รายงาน:</span> 
                                <span>${reporter}</span>
                            </p>
                            <p class="text-[11px] text-slate-600 flex items-start">
                                <span class="font-bold text-slate-500 w-16 shrink-0">เวลา:</span> 
                                <span>${timestamp}</span>
                            </p>
                            
                            <div class="mt-2 pt-2 border-t border-slate-200">
                                <p class="text-[10px] font-bold text-slate-500 mb-1">รายละเอียด / ความช่วยเหลือ:</p>
                                <p class="text-[11px] text-slate-700 bg-white p-2 rounded-lg border border-slate-200">${note}</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
                    marker.bindPopup(popupHTML);
                    if (evacMap && evacMarkerLayer) evacMarkerLayer.addLayer(marker);
                }
            });

            // 2. เพิ่มหมุดบ้านที่มีผู้อพยพเข้าศูนย์พักพิง (store.evacuees) แต่ยังไม่มีในรายงานสถานะ
            Object.entries(houseShelterMap).forEach(([address, houseData]) => {
                if (!processedAddresses.has(address) && houseData.count > 0) {
                    let pos = coordsMap[address];
                    if (!pos && store.floodData && store.floodData.length > 1) {
                        const matchedFloodRow = store.floodData.slice(1).find(r => (r[2] || '').toString().trim() === address || (r[1] || '').toString().trim() === address);
                        if (matchedFloodRow && matchedFloodRow[7] && matchedFloodRow[8]) {
                            const lat = parseFloat(matchedFloodRow[7]);
                            const lng = parseFloat(matchedFloodRow[8]);
                            if (!isNaN(lat) && !isNaN(lng)) pos = { lat, lng };
                        }
                    }

                    evacHouseholds++;
                    evacPeople += houseData.count;
                    centerPeople += houseData.count;

                    if (pos) {
                        const markerColor = '#3b82f6';
                        const iconClass = 'fa-campground';
                        const bgHeaderColor = 'bg-blue-500';
                        const statusBadge = '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[9px] font-bold ml-2">เข้าศูนย์พักพิง</span>';

                        const evacIcon = L.divIcon({
                            className: 'custom-evac-marker bg-transparent border-0',
                            html: `
                        <div class="relative flex flex-col items-center">
                            <div style="color: ${markerColor}; border-color: ${markerColor}" class="bg-white w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-md text-sm z-10 relative">
                                <i class="fas ${iconClass}"></i>
                                <span class="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[8px] font-black min-w-[16px] h-[16px] flex items-center justify-center rounded-full border border-white shadow-sm leading-none px-1">${houseData.count}</span>
                            </div>
                            <div style="border-top-color: ${markerColor}" class="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent mx-auto -mt-[1px] z-0"></div>
                        </div>
                    `,
                            iconSize: [32, 38],
                            iconAnchor: [16, 38],
                            popupAnchor: [0, -38]
                        });

                        const marker = L.marker([pos.lat, pos.lng], { icon: evacIcon });

                        const shelterNames = Array.from(houseData.shelters).join(', ') || 'ศูนย์พักพิง';

                        const popupHTML = `
                    <div class="w-full font-sans bg-white relative min-w-[200px]">
                        <div class="${bgHeaderColor} p-3 flex justify-between items-center text-white relative overflow-hidden">
                            <i class="fas ${iconClass} absolute -right-2 -bottom-2 text-5xl opacity-20 transform -rotate-12"></i>
                            <span class="text-[10px] font-black uppercase tracking-widest bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/20 z-10 shadow-sm">
                                <i class="fas fa-users mr-1"></i> เข้าพักพิงศูนย์ ${houseData.count} คน
                            </span>
                        </div>
                        <div class="p-4">
                            <h4 class="font-black text-slate-800 text-[14px] leading-tight mb-2 flex items-center">
                                ${address} ${statusBadge}
                            </h4>
                            
                            <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100 shadow-inner space-y-1.5">
                                <p class="text-[11px] text-slate-600 flex items-start border-b border-slate-200 pb-1.5 mb-1.5">
                                    <span class="font-bold text-slate-500 w-16 shrink-0">ศูนย์พักพิง:</span> 
                                    <span class="font-bold text-blue-600">${shelterNames}</span>
                                </p>
                                <div class="mt-2 pt-1">
                                    <p class="text-[10px] font-bold text-blue-700 mb-1"><i class="fas fa-campground mr-1"></i>รายชื่อผู้อพยพเข้าพักพิง:</p>
                                    <ul class="text-[11px] text-slate-700 space-y-0.5 bg-blue-50 p-2 rounded-lg border border-blue-100">
                                        ${houseData.members.map(m => `<li>• <b>${m.name}</b> (${m.shelter || 'ศูนย์พักพิง'}) ${m.health !== 'ปกติ' ? `<span class="text-rose-600 font-bold">(${m.health})</span>` : ''}</li>`).join('')}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                        marker.bindPopup(popupHTML);
                        if (evacMap && evacMarkerLayer) evacMarkerLayer.addLayer(marker);
                    }
                }
            });

            // --- 🌟 อัปเดตตัวเลขเข้าสู่การ์ดสรุปสถานะการอพยพ (ทั้งหน้ารายงานสถานะ และ หน้าหลัก ภาพรวม) ---
            if (document.getElementById('sumEvacTotal')) document.getElementById('sumEvacTotal').innerText = evacPeople.toLocaleString();
            if (document.getElementById('sumEvacHousehold')) document.getElementById('sumEvacHousehold').innerText = evacHouseholds.toLocaleString();
            if (document.getElementById('sumEvacCenter')) document.getElementById('sumEvacCenter').innerText = centerPeople.toLocaleString();
            if (document.getElementById('sumEvacOther')) document.getElementById('sumEvacOther').innerText = otherPeople.toLocaleString();

            if (document.getElementById('sumSafeTotal')) document.getElementById('sumSafeTotal').innerText = safePeople.toLocaleString();
            if (document.getElementById('sumSafeHousehold')) document.getElementById('sumSafeHousehold').innerText = safeHouseholds.toLocaleString();

            // อัปเดตการ์ดหน้าหลัก (ภาพรวม Dashboard) ให้ซิงค์ 100%
            if (document.getElementById('dash_sumEvacTotal')) document.getElementById('dash_sumEvacTotal').innerText = evacPeople.toLocaleString();
            if (document.getElementById('dash_sumEvacHousehold')) document.getElementById('dash_sumEvacHousehold').innerText = evacHouseholds.toLocaleString();
            if (document.getElementById('dash_sumEvacCenter')) document.getElementById('dash_sumEvacCenter').innerText = centerPeople.toLocaleString();
            if (document.getElementById('dash_sumEvacOther')) document.getElementById('dash_sumEvacOther').innerText = otherPeople.toLocaleString();

            if (document.getElementById('dash_sumSafeTotal')) document.getElementById('dash_sumSafeTotal').innerText = safePeople.toLocaleString();
            if (document.getElementById('dash_sumSafeHousehold')) document.getElementById('dash_sumSafeHousehold').innerText = safeHouseholds.toLocaleString();
        };

        // เรียกใช้งาน window.loadEvacuationMarkers จากหน้ารายงาน
        if (typeof window.loadEvacuationMarkers === 'function') {
            // พร้อมใช้งาน
        }

        // ==========================================
        // 🗺️ ระบบ One Map แผนที่รวมสถานการณ์ภัยพิบัติ (Dashboard)
        // ==========================================
        // (ตัวแปร dashOneMap และเลเยอร์ประกาศไว้ด้านบนสุดของไฟล์แล้ว)

        function initDashOneMap() {
            if (dashOneMap) return;

            const container = document.getElementById('dashOneMap');
            if (!container) return;

            // 1. สร้าง Map Instance
            dashOneMap = L.map('dashOneMap', {
                zoomControl: true,
                attributionControl: false
            }).setView([6.29445, 101.72362], 14);
            window.dashOneMap = dashOneMap;

            // 2. Tile Layers (OSM & Satellite)
            dashOsmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19
            }).addTo(dashOneMap);

            dashSatLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
                subdomains: ['0', '1', '2', '3'],
                maxZoom: 20
            });

            // สั่งคำนวณขนาดกรอบแผนที่ทันทีเพื่อป้องกันแหว่ง
            setTimeout(() => { if (dashOneMap) dashOneMap.invalidateSize(); }, 200);
            setTimeout(() => { if (dashOneMap) dashOneMap.invalidateSize(); }, 500);

            // 3. Feature Groups สำหรับ 6 เลเยอร์
            dashLayers.water = L.layerGroup().addTo(dashOneMap);
            dashLayers.shelter = L.layerGroup().addTo(dashOneMap);
            dashLayers.relief = L.layerGroup().addTo(dashOneMap);
            dashLayers.evac = L.layerGroup().addTo(dashOneMap);
            dashLayers.flood = L.layerGroup().addTo(dashOneMap);
            dashLayers.polygon = L.layerGroup().addTo(dashOneMap);

            dashDrawnItems = new L.FeatureGroup().addTo(dashOneMap);

            // 4. เครื่องมือวาดพื้นที่ Leaflet Draw สำหรับวาดขอบเขตน้ำท่วม
            const drawControl = new L.Control.Draw({
                edit: {
                    featureGroup: dashDrawnItems,
                    remove: true
                },
                draw: {
                    polygon: {
                        allowIntersection: false,
                        showArea: true,
                        shapeOptions: { color: '#ef4444', weight: 3, fillColor: '#ef4444', fillOpacity: 0.35 }
                    },
                    polyline: false,
                    rectangle: { shapeOptions: { color: '#f97316', weight: 3, fillColor: '#f97316', fillOpacity: 0.35 } },
                    circle: { shapeOptions: { color: '#dc2626', weight: 3, fillColor: '#dc2626', fillOpacity: 0.35 } },
                    marker: false,
                    circlemarker: false
                }
            });

            dashOneMap.addControl(drawControl);

            // 5. ดักจับ Event วาดเสร็จแล้วเปิด Popup บันทึก
            dashOneMap.on(L.Draw.Event.CREATED, function (e) {
                const layer = e.layer;
                dashDrawnItems.addLayer(layer);

                let geoJsonObj = layer.toGeoJSON();
                if (layer instanceof L.Circle) {
                    geoJsonObj.properties = geoJsonObj.properties || {};
                    geoJsonObj.properties.radius = layer.getRadius();
                    geoJsonObj.properties.shapeType = 'Circle';
                }
                const geoJsonData = JSON.stringify(geoJsonObj);

                Swal.fire({
                    title: '<div class="text-rose-600 font-black text-lg"><i class="fas fa-draw-polygon"></i> บันทึกขอบเขตพื้นที่น้ำท่วม</div>',
                    html: `
                        <div class="text-left space-y-3 mt-2 font-sans">
                            <div>
                                <label class="text-[11px] font-bold text-slate-500 ml-1">ชื่อพื้นที่ / หมู่บ้าน / ชุมชน *</label>
                                <input type="text" id="dash_poly_title" class="w-full p-3 border border-slate-200 rounded-xl outline-none text-sm font-bold focus:border-rose-400" placeholder="เช่น บริเวณลุ่มต่ำ ชุมชนบาลูกา">
                            </div>
                            <div>
                                <label class="text-[11px] font-bold text-slate-500 ml-1">รายละเอียดระดับน้ำท่วม / การสัญจร</label>
                                <textarea id="dash_poly_detail" class="w-full p-3 border border-slate-200 rounded-xl outline-none text-sm h-20 focus:border-rose-400" placeholder="เช่น น้ำท่วมขังสูง 50-80 ซม. รถเล็กไม่สามารถผ่านได้"></textarea>
                            </div>
                            <div>
                                <label class="text-[11px] font-bold text-slate-500 ml-1">ระดับความเสี่ยง</label>
                                <select id="dash_poly_risk" class="w-full p-3 border border-slate-200 rounded-xl outline-none text-sm font-bold">
                                    <option value="วิกฤต">วิกฤต (น้ำท่วมสูง/ล้นตลิ่ง)</option>
                                    <option value="เตือนภัย">เตือนภัย (น้ำเริ่มเข้าท่วมขัง)</option>
                                    <option value="เฝ้าระวัง">เฝ้าระวัง (ระดับน้ำแตะตลิ่ง)</option>
                                </select>
                            </div>
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: 'บันทึกลงชีทฐานข้อมูล',
                    cancelButtonText: 'ยกเลิก',
                    confirmButtonColor: '#ef4444',
                    customClass: { popup: 'rounded-[2rem]' },
                    preConfirm: () => {
                        const title = document.getElementById('dash_poly_title').value.trim();
                        if (!title) {
                            Swal.showValidationMessage('กรุณาระบุชื่อพื้นที่');
                            return false;
                        }
                        return {
                            title: title,
                            detail: document.getElementById('dash_poly_detail').value.trim(),
                            riskLevel: document.getElementById('dash_poly_risk').value
                        };
                    }
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        const data = result.value;
                        await saveFloodPolygonData(geoJsonData, data.title, data.detail, data.riskLevel);
                    } else {
                        dashDrawnItems.removeLayer(layer);
                    }
                });
            });
        }

        // ฟังก์ชันสลับ Basemap (OSM / Satellite)
        function toggleDashBaseMap(type) {
            if (!dashOneMap) return;
            const btnOsm = document.getElementById('btnBasemapOsm');
            const btnSat = document.getElementById('btnBasemapSat');

            if (type === 'sat') {
                dashOneMap.removeLayer(dashOsmLayer);
                dashSatLayer.addTo(dashOneMap);
                if (btnSat) {
                    btnSat.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-blue-600 text-white shadow-sm";
                }
                if (btnOsm) {
                    btnOsm.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-slate-700/60";
                }
            } else {
                dashOneMap.removeLayer(dashSatLayer);
                dashOsmLayer.addTo(dashOneMap);
                if (btnOsm) {
                    btnOsm.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-blue-600 text-white shadow-sm";
                }
                if (btnSat) {
                    btnSat.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-slate-700/60";
                }
            }
            setTimeout(() => { if (dashOneMap) dashOneMap.invalidateSize(); }, 100);
        }

        // ฟังก์ชันสลับโหมดขยายเต็มจอ (Fullscreen Toggle)
        function toggleDashOneMapFullscreen() {
            const card = document.getElementById('dashOneMapCard');
            const btn = document.getElementById('btnOneMapFullscreen');
            if (!card) return;

            const isFullscreen = card.classList.toggle('onemap-fullscreen');

            if (isFullscreen) {
                if (btn) btn.innerHTML = '<i class="fas fa-compress"></i> ย่อขนาด';
                document.body.style.overflow = 'hidden';
            } else {
                if (btn) btn.innerHTML = '<i class="fas fa-expand"></i> ขยายเต็มจอ';
                document.body.style.overflow = '';
            }

            [50, 150, 300, 500].forEach(delay => {
                setTimeout(() => {
                    if (window.dashOneMap && typeof window.dashOneMap.invalidateSize === 'function') {
                        window.dashOneMap.invalidateSize();
                    }
                }, delay);
            });
        }

        // กดปุ่ม ESC เพื่อออกจากโหมดเต็มจอ
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'Esc') {
                const card = document.getElementById('dashOneMapCard');
                if (card && card.classList.contains('onemap-fullscreen')) {
                    toggleDashOneMapFullscreen();
                }
            }
        });

        // ฟังก์ชันเปิด/ปิดเลเยอร์ข้อมูล
        function toggleDashLayer(layerKey) {
            if (!dashOneMap || !dashLayers[layerKey]) return;

            dashLayerStates[layerKey] = !dashLayerStates[layerKey];
            const isVisible = dashLayerStates[layerKey];

            if (isVisible) {
                dashOneMap.addLayer(dashLayers[layerKey]);
            } else {
                dashOneMap.removeLayer(dashLayers[layerKey]);
            }

            const btnIdMap = {
                water: { id: 'btnLayerWater', color: 'bg-sky-500' },
                shelter: { id: 'btnLayerShelter', color: 'bg-pink-500' },
                relief: { id: 'btnLayerRelief', color: 'bg-amber-500' },
                evac: { id: 'btnLayerEvac', color: 'bg-purple-600' },
                flood: { id: 'btnLayerFlood', color: 'bg-rose-600' },
                polygon: { id: 'btnLayerPolygon', color: 'bg-red-700' }
            };

            const target = btnIdMap[layerKey];
            if (target) {
                const btn = document.getElementById(target.id);
                if (btn) {
                    if (isVisible) {
                        btn.className = `dash-layer-btn active-dash-layer ${target.color} text-white px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 whitespace-nowrap shrink-0`;
                    } else {
                        btn.className = `dash-layer-btn bg-slate-200 text-slate-500 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 opacity-60`;
                    }
                }
            }
        }

        // ฟังก์ชันบันทึกพื้นที่น้ำท่วม
        async function saveFloodPolygonData(geoJsonStr, title, detail, riskLevel) {
            Swal.fire({
                title: 'กำลังบันทึกพื้นที่ลง Google Sheets...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            try {
                const payload = {
                    action: 'saveFloodPolygon',
                    title: title,
                    detail: detail,
                    riskLevel: riskLevel,
                    geoJson: geoJsonStr,
                    user: typeof currentUser !== 'undefined' && currentUser ? currentUser : 'Admin',
                    period: typeof currentPeriod !== 'undefined' ? currentPeriod : ''
                };

                if (typeof sbSaveFloodPolygon === 'function') {
                    await sbSaveFloodPolygon(payload);
                } else {
                    throw new Error('Supabase Service ไม่พร้อมทำงาน');
                }
                Swal.fire({
                    title: 'สำเร็จ!',
                    text: 'บันทึกข้อมูลพื้นที่น้ำท่วมเรียบร้อยแล้ว',
                    icon: 'success',
                    timer: 1500
                });
                if (typeof dashDrawnItems !== 'undefined' && dashDrawnItems) {
                    dashDrawnItems.clearLayers();
                }
                await loadData();
            } catch (err) {
                Swal.fire('ผิดพลาด', err.message, 'error');
            }
        }

        // ฟังก์ชันช่วยเปรียบเทียบชื่อศูนย์พักพิง
        function isSameShelter(s1, s2) {
            if (!s1 || !s2) return false;
            const str1 = String(s1).trim();
            const str2 = String(s2).trim();
            if (str1 === str2) return true;
            if ((str1.includes('เทศบาล') || str1.includes('บาลูกา')) && (str2.includes('เทศบาล') || str2.includes('บาลูกา'))) return true;
            if (str1.includes('มัสยิด') && str2.includes('มัสยิด')) return true;
            if (str1.includes('เขาพระ') && str2.includes('เขาพระ')) return true;
            return false;
        }

        // ฟังก์ชันวาดทุกเลเยอร์ลงใน One Map
        function renderDashOneMapLayers() {
            if (!dashOneMap) return;

            Object.values(dashLayers).forEach(layerGroup => {
                if (layerGroup) layerGroup.clearLayers();
            });

            // สร้าง Map สถิติผู้เข้าพักพิงแยกตามบ้าน/ที่อยู่
            const evacuees = store.evacuees || [];
            const houseShelterMap = {};
            evacuees.forEach(r => {
                const sName = (r[1] || '').toString().trim();
                const address = (r[2] || '').toString().trim();
                const name = (r[4] || '').toString().trim();
                const health = (r[8] || 'ปกติ').toString().trim();
                const status = (r[10] || '').toString().trim();

                if (address && status !== 'กลับบ้านแล้ว') {
                    if (!houseShelterMap[address]) {
                        houseShelterMap[address] = { count: 0, members: [], shelters: new Set() };
                    }
                    houseShelterMap[address].count += 1;
                    houseShelterMap[address].members.push({ name, shelter: sName, health });
                    if (sName) houseShelterMap[address].shelters.add(sName);
                }
            });

            // 1. เลเยอร์ระดับน้ำ (สีฟ้า Sky Blue + ป้ายใต้หมุดจัดระเบียบสวยงาม)
            if (store.waterLevels && store.waterLevels.length > 0) {
                const latestWater = {};
                store.waterLevels.forEach(r => {
                    const loc = r[1];
                    const time = new Date(r[0]).getTime();
                    if (!latestWater[loc] || time > latestWater[loc].time) {
                        latestWater[loc] = { data: r, time: time };
                    }
                });

                Object.values(latestWater).forEach(item => {
                    const r = item.data;
                    const name = r[1];
                    const level = parseFloat(r[2] || 0);
                    const trend = r[4] || 'คงตัว';
                    let coordsStr = String(r[5] || '').trim();
                    if (!coordsStr && window.waterPointsMap && window.waterPointsMap[name]) {
                        coordsStr = window.waterPointsMap[name];
                    }

                    let statusText = 'ปกติ', statusBg = 'bg-emerald-500';
                    if (level >= 81) { statusText = 'วิกฤต'; statusBg = 'bg-red-600'; }
                    else if (level >= 31) { statusText = 'เตือนภัย'; statusBg = 'bg-orange-500'; }
                    else if (level >= 1) { statusText = 'เฝ้าระวัง'; statusBg = 'bg-yellow-500'; }

                    if (coordsStr.includes(',')) {
                        const [lat, lng] = coordsStr.split(',').map(v => parseFloat(v.trim()));
                        if (!isNaN(lat) && !isNaN(lng)) {
                            const icon = L.divIcon({
                                className: 'custom-one-water-marker bg-transparent border-0',
                                html: `
                                    <div class="relative flex flex-col items-center">
                                        <div class="bg-sky-500 text-white w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-xs font-black">
                                            <i class="fas fa-droplet"></i>
                                        </div>
                                        <span class="bg-sky-900 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-md mt-0.5 whitespace-nowrap border border-sky-400/30">${level} ซม.</span>
                                    </div>
                                `,
                                iconSize: [36, 48],
                                iconAnchor: [18, 48],
                                popupAnchor: [0, -48]
                            });

                            const popup = `
                                <div class="font-sans p-2">
                                    <div class="flex items-center justify-between border-b pb-1.5 mb-2">
                                        <span class="font-black text-slate-800 text-xs"><i class="fas fa-droplet text-sky-500 mr-1"></i>${name}</span>
                                        <span class="text-[9px] font-bold text-white ${statusBg} px-2 py-0.5 rounded-full">${statusText}</span>
                                    </div>
                                    <p class="text-xs text-slate-600 mb-1">ระดับน้ำ: <b class="text-sky-600 font-bold">${level} ซม.</b> (แนวโน้ม: ${trend})</p>
                                    <p class="text-[10px] text-slate-400"><i class="far fa-clock mr-1"></i>${new Date(r[0]).toLocaleString('th-TH')}</p>
                                </div>
                            `;

                            const m = L.marker([lat, lng], { icon: icon }).bindPopup(popup);
                            dashLayers.water.addLayer(m);
                        }
                    }
                });
            }

            // 2. เลเยอร์ศูนย์พักพิง (สีชมพู Pink Theme + ป้ายใต้หมุด)
            const defaultShelterPoints = [
                { name: 'ศูนย์เทศบาลตำบลตันหยงมัส/บาลูกา', lat: 6.294334921438347, lng: 101.72202946829752, cap: 80 },
                { name: 'ศูนย์มัสยิดตันหยงมัส', lat: 6.29778118011179, lng: 101.72990501280613, cap: 80 },
                { name: 'ศูนย์โรงเรียนบ้านเขาพระ', lat: 6.298263196460374, lng: 101.710772727857, cap: 60 }
            ];

            defaultShelterPoints.forEach(s => {
                const count = evacuees.filter(r => isSameShelter(r[1], s.name) && (r[10] || '').toString().trim() !== 'กลับบ้านแล้ว').length;
                const pct = Math.min(Math.round((count / s.cap) * 100), 100);

                const icon = L.divIcon({
                    className: 'custom-one-shelter-marker bg-transparent border-0',
                    html: `
                        <div class="relative flex flex-col items-center">
                            <div class="bg-pink-500 text-white w-9 h-9 rounded-2xl border-2 border-white shadow-lg flex items-center justify-center text-sm font-black">
                                <i class="fas fa-campground"></i>
                            </div>
                            <span class="bg-slate-900 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-md mt-0.5 whitespace-nowrap border border-pink-400/30">${count}/${s.cap} คน</span>
                        </div>
                    `,
                    iconSize: [40, 50],
                    iconAnchor: [20, 50],
                    popupAnchor: [0, -50]
                });

                const popup = `
                    <div class="font-sans p-2">
                        <div class="flex items-center justify-between border-b pb-1.5 mb-2">
                            <span class="font-black text-slate-800 text-xs"><i class="fas fa-campground text-pink-500 mr-1"></i>${s.name}</span>
                            <span class="text-[9px] font-bold bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">${pct}% ความจุ</span>
                        </div>
                        <p class="text-xs text-slate-600 mb-1">ผู้เข้าพักพิง: <b class="text-pink-600 font-bold">${count} คน</b> / ความจุสูงสุด ${s.cap} คน</p>
                        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1">
                            <div class="bg-pink-500 h-full" style="width:${pct}%"></div>
                        </div>
                    </div>
                `;

                const m = L.marker([s.lat, s.lng], { icon: icon }).bindPopup(popup);
                dashLayers.shelter.addLayer(m);
            });

            // 3. เลเยอร์ผู้รับถุงยังชีพ (จัดระเบียบป้ายใต้หมุด)
            const coordsMap = {};
            if (store.addressEvac) {
                store.addressEvac.forEach(row => {
                    const addr = row[0] ? row[0].toString().trim() : '';
                    const lat = parseFloat(row[1]);
                    const lng = parseFloat(row[2]);
                    if (addr && !isNaN(lat) && !isNaN(lng)) {
                        coordsMap[addr] = { lat, lng };
                    }
                });
            }

            function getReliefCoordinates(address, coordsMap) {
                if (!address) return null;
                const cleanAddress = address.toString().trim();

                // 1. ลองจับคู่แบบตรงตัวกับ coordsMap (Exact Match)
                if (coordsMap[cleanAddress]) {
                    return { ...coordsMap[cleanAddress], matchType: 'exact' };
                }

                // สกัดคอมโพเนนต์ที่อยู่ (เลขที่บ้าน + ชื่อถนน)
                const { houseNo, streetName, normalized } = typeof window.extractAddressComponents === 'function'
                    ? window.extractAddressComponents(cleanAddress)
                    : { houseNo: '', streetName: '', normalized: cleanAddress };

                const compactInput = normalized.replace(/\s+/g, '');

                // 2. ลองเปรียบเทียบ "เลขที่บ้าน + ชื่อถนน" กับชีท addressEvac
                if (houseNo && streetName) {
                    let bestHouseKey = null;
                    for (const key of Object.keys(coordsMap)) {
                        const keyNorm = typeof window.normalizeThaiAddress === 'function' ? window.normalizeThaiAddress(key) : key;
                        const keyCompact = keyNorm.replace(/\s+/g, '');
                        // ตรวจสอบว่าในที่อยู่ของ addressEvac มีทั้งเลขที่บ้านและชื่อถนนตรงกัน
                        if (keyNorm.includes(houseNo) && (keyNorm.includes(streetName) || keyCompact.includes(streetName.replace(/\s+/g, '')))) {
                            bestHouseKey = key;
                            break;
                        }
                    }
                    if (bestHouseKey && coordsMap[bestHouseKey]) {
                        const offsetLat = (Math.random() - 0.5) * 0.0001; // Offset ขนาดเล็กมากสำหรับบ้านเลขที่ตรงกัน
                        const offsetLng = (Math.random() - 0.5) * 0.0001;
                        return {
                            lat: coordsMap[bestHouseKey].lat + offsetLat,
                            lng: coordsMap[bestHouseKey].lng + offsetLng,
                            matchType: 'exact_house'
                        };
                    }
                }

                // 3. ลองจับคู่ชื่อถนน/ชุมชนกับชีท addressEvac
                let bestMatchKey = null;
                let maxMatchLength = 0;

                for (const [key, pos] of Object.entries(coordsMap)) {
                    const normalizedKey = typeof window.normalizeThaiAddress === 'function'
                        ? window.normalizeThaiAddress(key)
                        : key;
                    const compactKey = normalizedKey.replace(/\s+/g, '');

                    if (normalized.includes(normalizedKey) || compactInput.includes(compactKey)) {
                        if (compactKey.length > maxMatchLength) {
                            maxMatchLength = compactKey.length;
                            bestMatchKey = key;
                        }
                    }
                }

                if (bestMatchKey && coordsMap[bestMatchKey]) {
                    const offsetLat = (Math.random() - 0.5) * 0.0004;
                    const offsetLng = (Math.random() - 0.5) * 0.0004;
                    return {
                        lat: coordsMap[bestMatchKey].lat + offsetLat,
                        lng: coordsMap[bestMatchKey].lng + offsetLng,
                        matchType: 'street'
                    };
                }

                // 4. หากสกัดชื่อถนนได้จาก ZONE_RULES ให้ใช้พิกัดของถนนนั้นใน coordsMap
                if (streetName) {
                    for (const [key, pos] of Object.entries(coordsMap)) {
                        const normKey = typeof window.normalizeThaiAddress === 'function' ? window.normalizeThaiAddress(key) : key;
                        if (normKey.includes(streetName) || streetName.includes(normKey)) {
                            const offsetLat = (Math.random() - 0.5) * 0.0004;
                            const offsetLng = (Math.random() - 0.5) * 0.0004;
                            return {
                                lat: pos.lat + offsetLat,
                                lng: pos.lng + offsetLng,
                                matchType: 'zone_street'
                            };
                        }
                    }
                }

                // 5. Fallback: หากไม่พบชื่อถนนเลย ให้ใช้พิกัดศูนย์กลางเทศบาลตำบลตันหยงมัส ป้องกันหมุดหาย
                const defaultLat = 6.29445 + ((Math.random() - 0.5) * 0.0006);
                const defaultLng = 101.72362 + ((Math.random() - 0.5) * 0.0006);
                return { lat: defaultLat, lng: defaultLng, matchType: 'fallback' };
            }

            if (store.reliefData && store.reliefData.length > 0) {
                store.reliefData.forEach(r => {
                    const name = r[1] || 'ผู้รับถุงยังชีพ';
                    const status = r[2] || 'ปกติ';
                    const members = r[3] || 1;
                    const address = r[4] ? r[4].toString().trim() : '';
                    const pos = getReliefCoordinates(address, coordsMap);

                    if (pos) {
                        const icon = L.divIcon({
                            className: 'custom-one-relief-marker bg-transparent border-0',
                            html: `
                                <div class="relative flex flex-col items-center">
                                    <div class="bg-amber-500 text-white w-8 h-8 rounded-xl border-2 border-white shadow-md flex items-center justify-center text-xs">
                                        <i class="fas fa-box-open"></i>
                                    </div>
                                    <span class="bg-amber-900 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm mt-0.5 whitespace-nowrap">ถุงยังชีพ</span>
                                </div>
                            `,
                            iconSize: [36, 46],
                            iconAnchor: [18, 46],
                            popupAnchor: [0, -46]
                        });

                        let matchBadgeHTML = '';
                        if (pos.matchType === 'exact_house') {
                            matchBadgeHTML = `<div class="mt-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full inline-block border border-emerald-200"><i class="fas fa-home mr-1"></i>ตรงกับบ้านเลขที่ในชีท addressEvac</div>`;
                        } else if (pos.matchType === 'street' || pos.matchType === 'zone_street') {
                            matchBadgeHTML = `<div class="mt-1 text-[9px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full inline-block border border-sky-200"><i class="fas fa-road mr-1"></i>ตรงกับพิกัดถนนในเทศบาล</div>`;
                        } else if (pos.matchType === 'fallback') {
                            matchBadgeHTML = `<div class="mt-1 text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full inline-block border border-amber-200"><i class="fas fa-location-crosshairs mr-1"></i>พิกัดโดยประมาณ (ไม่พบถนนในเทศบาล)</div>`;
                        }

                        const popup = `
                            <div class="font-sans p-2">
                                <div class="border-b pb-1 mb-1 font-black text-xs text-amber-700">
                                    <i class="fas fa-box-open mr-1"></i>รับถุงยังชีพแล้ว
                                </div>
                                <p class="text-xs font-bold text-slate-800">${name}</p>
                                <p class="text-[11px] text-slate-600 mt-1">ที่อยู่: ${address}</p>
                                <p class="text-[10px] text-slate-500">จำนวนสมาชิก: ${members} คน | สถานะ: ${status}</p>
                                ${matchBadgeHTML}
                            </div>
                        `;

                        const m = L.marker([pos.lat, pos.lng], { icon: icon }).bindPopup(popup);
                        dashLayers.relief.addLayer(m);
                    }
                });
            }

            // 4. เลเยอร์รายงานสถานะอพยพ / ปลอดภัย
            const processedAddresses = new Set();
            if (store.evacReports && store.evacReports.length > 0) {
                const latestEvac = {};
                store.evacReports.forEach(report => {
                    const addr = report[1] ? report[1].toString().trim() : '';
                    const time = new Date(report[0]).getTime();
                    if (addr && (!latestEvac[addr] || time > latestEvac[addr].time)) {
                        latestEvac[addr] = { data: report, time: time };
                    }
                });

                Object.values(latestEvac).forEach(item => {
                    const r = item.data;
                    const address = r[1].toString().trim();
                    processedAddresses.add(address);
                    let count = parseInt(r[2]) || 0;
                    const destType = r[3];
                    const destName = r[4];
                    const reporter = r[5] || '-';
                    const customCoords = r[6] ? r[6].toString().trim() : '';
                    const evacName = r[7] ? r[7].toString().trim() : 'ไม่ระบุชื่อ';
                    const status = r[8] ? r[8].toString().trim() : 'อพยพ';

                    let pos = null;
                    if (customCoords && customCoords.includes(',')) {
                        const parts = customCoords.split(',');
                        pos = { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };
                    } else {
                        pos = coordsMap[address];
                    }

                    const shelterHouseData = houseShelterMap[address];
                    if (shelterHouseData) {
                        count = Math.max(count, shelterHouseData.count);
                    }

                    if (pos) {
                        let color = '#8b5cf6', iconClass = 'fa-house-user', statusBadge = 'อพยพ', badgeBg = 'bg-purple-950';
                        if (status === 'ปลอดภัย') {
                            color = '#10b981'; iconClass = 'fa-check-circle'; statusBadge = 'ปลอดภัย'; badgeBg = 'bg-emerald-950';
                        } else if (destType === 'ศูนย์' || shelterHouseData) {
                            color = '#3b82f6'; iconClass = 'fa-campground'; statusBadge = 'อพยพเข้าศูนย์'; badgeBg = 'bg-blue-950';
                        }

                        const icon = L.divIcon({
                            className: 'custom-one-evac-marker bg-transparent border-0',
                            html: `
                                <div class="relative flex flex-col items-center">
                                    <div style="background-color: ${color};" class="text-white w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-sm font-black">
                                        <i class="fas ${iconClass}"></i>
                                    </div>
                                    <span class="${badgeBg} text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-md mt-0.5 whitespace-nowrap border border-white/20">${statusBadge} ${count} คน</span>
                                </div>
                            `,
                            iconSize: [42, 54],
                            iconAnchor: [21, 54],
                            popupAnchor: [0, -54]
                        });

                        let shelterMembersHtml = '';
                        if (shelterHouseData && shelterHouseData.members.length > 0) {
                            shelterMembersHtml = `
                                <div class="mt-2 text-[11px] text-slate-600 bg-blue-50 p-2 rounded-xl border border-blue-100">
                                    <p class="font-bold text-blue-800 text-xs mb-1"><i class="fas fa-campground mr-1"></i>ผู้เข้าพักพิงศูนย์ (${shelterHouseData.count} คน):</p>
                                    <ul class="space-y-0.5">
                                        ${shelterHouseData.members.map(m => `<li>• <b>${m.name}</b> (${m.shelter || 'ศูนย์พักพิง'}) ${m.health !== 'ปกติ' ? `<span class="text-red-500 font-bold">(${m.health})</span>` : ''}</li>`).join('')}
                                    </ul>
                                </div>
                            `;
                        }

                        const popup = `
                            <div class="font-sans p-2">
                                <div class="flex items-center justify-between border-b pb-1 mb-1">
                                    <span class="font-black text-xs text-slate-800">${address}</span>
                                    <span class="text-[9px] font-bold px-2 py-0.5 rounded text-white" style="background-color:${color}">${statusBadge}</span>
                                </div>
                                <p class="text-xs text-slate-700">ชื่อ: <b>${evacName}</b> (${count} คน)</p>
                                ${status !== 'ปลอดภัย' ? `<p class="text-[11px] text-slate-500">ปลายทาง: ${destName || (shelterHouseData ? Array.from(shelterHouseData.shelters).join(', ') : '-')} (${destType || 'ศูนย์'})</p>` : ''}
                                ${shelterMembersHtml}
                                <p class="text-[10px] text-slate-400 mt-1">ผู้รายงาน: ${reporter}</p>
                            </div>
                        `;

                        const m = L.marker([pos.lat, pos.lng], { icon: icon }).bindPopup(popup);
                        dashLayers.evac.addLayer(m);
                    }
                });
            }

            // เพิ่มหมุดบ้านที่ลงทะเบียนเข้าศูนย์พักพิงไว้ แต่ยังไม่มีรายงานใน store.evacReports
            Object.entries(houseShelterMap).forEach(([address, houseData]) => {
                if (!processedAddresses.has(address) && houseData.count > 0) {
                    let pos = coordsMap[address];
                    if (!pos && store.floodData && store.floodData.length > 1) {
                        const matchedFloodRow = store.floodData.slice(1).find(r => (r[2] || '').toString().trim() === address || (r[1] || '').toString().trim() === address);
                        if (matchedFloodRow && matchedFloodRow[7] && matchedFloodRow[8]) {
                            const lat = parseFloat(matchedFloodRow[7]);
                            const lng = parseFloat(matchedFloodRow[8]);
                            if (!isNaN(lat) && !isNaN(lng)) pos = { lat, lng };
                        }
                    }

                    if (pos) {
                        const color = '#3b82f6';
                        const statusBadge = 'อพยพเข้าศูนย์';
                        const badgeBg = 'bg-blue-950';

                        const icon = L.divIcon({
                            className: 'custom-one-evac-marker bg-transparent border-0',
                            html: `
                                <div class="relative flex flex-col items-center">
                                    <div style="background-color: ${color};" class="text-white w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-sm font-black">
                                        <i class="fas fa-campground"></i>
                                    </div>
                                    <span class="${badgeBg} text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-md mt-0.5 whitespace-nowrap border border-white/20">${statusBadge} ${houseData.count} คน</span>
                                </div>
                            `,
                            iconSize: [42, 54],
                            iconAnchor: [21, 54],
                            popupAnchor: [0, -54]
                        });

                        const popup = `
                            <div class="font-sans p-2">
                                <div class="flex items-center justify-between border-b pb-1 mb-1">
                                    <span class="font-black text-xs text-slate-800">${address}</span>
                                    <span class="text-[9px] font-bold px-2 py-0.5 rounded text-white bg-blue-600">${statusBadge}</span>
                                </div>
                                <p class="text-xs text-slate-700">เข้าพักศูนย์: <b>${Array.from(houseData.shelters).join(', ')}</b> (${houseData.count} คน)</p>
                                <div class="mt-2 text-[11px] text-slate-600 bg-blue-50 p-2 rounded-xl border border-blue-100">
                                    <p class="font-bold text-blue-800 text-xs mb-1"><i class="fas fa-campground mr-1"></i>รายชื่อผู้อพยพเข้าศูนย์:</p>
                                    <ul class="space-y-0.5">
                                        ${houseData.members.map(m => `<li>• <b>${m.name}</b> (${m.shelter || 'ศูนย์พักพิง'}) ${m.health !== 'ปกติ' ? `<span class="text-red-500 font-bold">(${m.health})</span>` : ''}</li>`).join('')}
                                    </ul>
                                </div>
                            </div>
                        `;

                        const m = L.marker([pos.lat, pos.lng], { icon: icon }).bindPopup(popup);
                        dashLayers.evac.addLayer(m);
                    }
                }
            });

            // 5. เลเยอร์บ้านเรือนน้ำท่วม (Flood Data) - ปรับสีหมุดทั่วไปเป็นสีเขียวอ่อน (bg-emerald-500) และคงสีส้ม (เปราะบาง) สีเหลือง (พิการ/สูงอายุ)
            if (store.floodData && store.floodData.length > 1) {
                store.floodData.slice(1).forEach(row => {
                    const houseId = row[0] || '';
                    const road = row[1] || '';
                    const address = row[2] || '';
                    const name = row[3] || '';
                    const status = (row[4] || '').toString().trim();
                    const residents = row[5] || 0;
                    const lat = parseFloat(row[7]);
                    const lng = parseFloat(row[8]);
                    const risk = (row[9] || '').toString().trim();
                    const detail = (row[10] || '').toString().trim();

                    if (!isNaN(lat) && !isNaN(lng)) {
                        let markerBg = 'bg-red-400', badgeBg = 'bg-red-950', iconClass = 'fa-house-crack', badgeText = 'น้ำท่วม';

                        const fullStr = (status + " " + risk + " " + detail).toLowerCase();

                        if (fullStr.includes('เปราะบาง')) {
                            markerBg = 'bg-orange-500';
                            badgeBg = 'bg-orange-950';
                            iconClass = 'fa-hands-holding-circle';
                            badgeText = 'กลุ่มเปราะบาง';
                        } else if (fullStr.includes('พิการ') || fullStr.includes('สูงอายุ') || fullStr.includes('ผู้ชรา')) {
                            markerBg = 'bg-amber-400';
                            badgeBg = 'bg-amber-950';
                            iconClass = 'fa-wheelchair';
                            badgeText = 'ผู้สูงอายุ/พิการ';
                        }

                        const shelterHouseData = houseShelterMap[address] || houseShelterMap[road];
                        let shelterBadgeHtml = '';
                        if (shelterHouseData && shelterHouseData.count > 0) {
                            shelterBadgeHtml = `
                                <div class="mt-2 text-[10px] font-bold text-blue-700 bg-blue-50 p-1.5 rounded-lg border border-blue-100">
                                    <i class="fas fa-campground text-blue-500 mr-1"></i>อพยพเข้าศูนย์พักพิงแล้ว ${shelterHouseData.count} คน (${Array.from(shelterHouseData.shelters).join(', ')})
                                </div>
                            `;
                        }

                        const icon = L.divIcon({
                            className: 'custom-one-flood-marker bg-transparent border-0',
                            html: `
                                <div class="relative flex flex-col items-center">
                                    <div class="${markerBg} text-white w-8 h-8 rounded-xl border-2 border-white shadow-md flex items-center justify-center text-xs font-black">
                                        <i class="fas ${iconClass}"></i>
                                    </div>
                                    <span class="${badgeBg} text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm mt-0.5 whitespace-nowrap">${badgeText}</span>
                                </div>
                            `,
                            iconSize: [36, 46],
                            iconAnchor: [18, 46],
                            popupAnchor: [0, -46]
                        });

                        const popup = `
                            <div class="font-sans p-2">
                                <div class="border-b pb-1 mb-1 font-black text-xs text-slate-800 flex items-center justify-between">
                                    <span><i class="fas ${iconClass} mr-1"></i>${address} (${road})</span>
                                    <span class="text-[9px] font-bold px-2 py-0.5 rounded text-white ${markerBg}">${badgeText}</span>
                                </div>
                                <p class="text-xs text-slate-700">เจ้าของ/ผู้อาศัย: <b>${name}</b> (${residents} คน)</p>
                                <p class="text-[10px] text-slate-500 mt-1">สถานะ: ${status} | ความเสี่ยง: ${risk}</p>
                                ${shelterBadgeHtml}
                            </div>
                        `;

                        const m = L.marker([lat, lng], { icon: icon }).bindPopup(popup);
                        dashLayers.flood.addLayer(m);
                    }
                });
            }

            // 6. เลเยอร์ขอบเขตพื้นที่น้ำท่วมที่วาดไว้ (Flood Polygons & Circles)
            if (store.floodPolygons && store.floodPolygons.length > 0) {
                store.floodPolygons.forEach(r => {
                    const timestamp = r[0] ? new Date(r[0]).toLocaleString('th-TH') : '-';
                    const title = r[1] || 'พื้นที่น้ำท่วม';
                    const detail = r[2] || '';
                    const riskLevel = r[3] || 'วิกฤต';
                    const geoJsonStr = r[4] || '';
                    const reporter = r[5] || 'Admin';

                    if (geoJsonStr) {
                        try {
                            const geoJsonObj = typeof geoJsonStr === 'string' ? JSON.parse(geoJsonStr) : geoJsonStr;
                            let color = '#ef4444';
                            if (riskLevel === 'เตือนภัย') color = '#f97316';
                            else if (riskLevel === 'เฝ้าระวัง') color = '#eab308';

                            const popup = `
                                <div class="font-sans p-2 min-w-[180px]">
                                    <div class="flex items-center justify-between border-b pb-1 mb-1.5">
                                        <b class="text-xs text-rose-600 font-black"><i class="fas fa-draw-polygon mr-1"></i>${title}</b>
                                        <span class="text-[9px] font-bold text-white px-2 py-0.5 rounded-full" style="background-color:${color}">${riskLevel}</span>
                                    </div>
                                    ${detail ? `<p class="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 my-1">${detail}</p>` : ''}
                                    <p class="text-[10px] text-slate-400 mt-1">ผู้บันทึก: ${reporter} | ${timestamp}</p>
                                </div>
                            `;

                            // ตรวจสอบว่าเป็นวงกลม (Circle) หรือไม่
                            if (geoJsonObj.properties && geoJsonObj.properties.radius && geoJsonObj.geometry && geoJsonObj.geometry.type === 'Point') {
                                const coords = geoJsonObj.geometry.coordinates; // [lng, lat]
                                const circleLayer = L.circle([coords[1], coords[0]], {
                                    radius: parseFloat(geoJsonObj.properties.radius),
                                    color: color,
                                    fillColor: color,
                                    weight: 3,
                                    fillOpacity: 0.35
                                });
                                circleLayer.bindPopup(popup);
                                dashLayers.polygon.addLayer(circleLayer);
                            } else {
                                const polyLayer = L.geoJSON(geoJsonObj, {
                                    style: {
                                        color: color,
                                        fillColor: color,
                                        weight: 3,
                                        fillOpacity: 0.35
                                    },
                                    pointToLayer: function (feature, latlng) {
                                        if (feature.properties && feature.properties.radius) {
                                            return L.circle(latlng, {
                                                radius: feature.properties.radius,
                                                color: color,
                                                fillColor: color,
                                                weight: 3,
                                                fillOpacity: 0.35
                                            });
                                        }
                                        return L.circleMarker(latlng, {
                                            radius: 8,
                                            color: color,
                                            fillColor: color,
                                            fillOpacity: 0.5
                                        });
                                    }
                                });
                                polyLayer.bindPopup(popup);
                                dashLayers.polygon.addLayer(polyLayer);
                            }
                        } catch (e) {
                            console.error("GeoJSON parse error", e);
                        }
                    }
                });
            }
        }

        // ฟังก์ชันเริ่มต้นแผนที่
        function initWaterMap() {
            if (waterMap) return; // ถ้าสร้างแล้วไม่ต้องสร้างซ้ำ

            // พิกัดเริ่มต้น (เทศบาลตำบลตันหยงมัส)
            waterMap = L.map('waterMap').setView([6.29445, 101.72362], 15);
            window.waterMap = waterMap;

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(waterMap);

            markerLayer.addTo(waterMap);

            setTimeout(() => { if (waterMap) waterMap.invalidateSize(); }, 300);
        }

        // ฟังก์ชันอัปเดตหมุดบนแผนที่
        // ตัวแปรสำหรับเก็บ Marker ทั้งหมด โดยใช้ชื่อจุดวัดเป็น Key
        let waterMarkers = {};

        function updateWaterMapMarkers() {
            if (!waterMap || !store.waterLevels) return;

            markerLayer.clearLayers();
            waterMarkers = {};

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

                // กำหนดสีและข้อความสถานะสำหรับ Popup
                let statusText = 'ปกติ', statusColor = 'bg-green-100 text-green-600';
                if (level >= 1 && level <= 30) { statusText = 'เฝ้าระวัง'; statusColor = 'bg-yellow-100 text-yellow-700'; }
                else if (level >= 31 && level <= 80) { statusText = 'เตือนภัย'; statusColor = 'bg-orange-100 text-orange-600'; }
                else if (level >= 81) { statusText = 'วิกฤต'; statusColor = 'bg-red-100 text-red-600'; }

                if (coordinateStr.includes(',')) {
                    const [lat, lng] = coordinateStr.split(',').map(v => parseFloat(v.trim()));

                    if (!isNaN(lat) && !isNaN(lng)) {
                        const marker = L.marker([lat, lng], { icon: getWaterIcon(level) });

                        // --- ส่วนปรับปรุง Layout Popup ---
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
                `;

                        marker.bindPopup(popupContent);
                        waterMarkers[name] = marker;
                        markerLayer.addLayer(marker);
                    }
                }
            });
        }

        /**
         * ฟังก์ชันเลื่อนแผนที่ไปที่จุดวัดที่กำหนด
         * @param {string} locationName - ชื่อจุดวัดระดับน้ำ
         */
        function focusOnLocation(locationName) {
            // ดึง Marker จาก Object ที่เราเก็บไว้ตอนวนลูปสร้าง
            const marker = waterMarkers[locationName];

            if (marker) {
                // เลื่อนแผนที่และซูมไปที่หมุด
                waterMap.setView(marker.getLatLng(), 16, {
                    animate: true,
                    duration: 1.2
                });

                // เปิด Popup อัตโนมัติ
                setTimeout(() => {
                    marker.openPopup();
                }, 600);

                // เลื่อนหน้าจอลงมาที่แผนที่ (Smooth Scroll)
                document.getElementById('waterMap').scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }

        /**
         * ฟังก์ชันกรองข้อมูลศูนย์พักพิง
         * @param {string} centerName - ชื่อศูนย์ที่เลือก หรือ 'all'
         */
        // อัปเดตฟังก์ชัน filterShelter ให้เคลียร์ตัวกรองสุขภาพด้วย
        window.filterShelter = function (centerName) {
            document.querySelectorAll('.shelter-filter-btn').forEach(btn => {
                btn.classList.remove('active-shelter-btn', 'active-menu-mobile', 'bg-blue-600', 'text-white');
                btn.classList.add('bg-white', 'text-slate-600');
                if (btn.getAttribute('data-center') === centerName) {
                    btn.classList.add('active-shelter-btn', 'active-menu-mobile', 'bg-blue-600', 'text-white');
                    btn.classList.remove('bg-white', 'text-slate-600');
                }
            });

            const evacuees = store.evacuees || [];
            let filtered = centerName === 'all' ? [...evacuees] : evacuees.filter(r => {
                const sName = (r[1] || '').toString().trim();
                const target = centerName.trim();
                if (!sName) return false;
                if (sName === target) return true;
                if (sName.includes(target) || target.includes(sName)) return true;

                // ตรวจจับชื่อศูนย์จากคีย์เวิร์ด
                if ((sName.includes('เทศบาล') || sName.includes('บาลูกา')) && (target.includes('เทศบาล') || target.includes('บาลูกา'))) return true;
                if (sName.includes('มัสยิด') && target.includes('มัสยิด')) return true;
                if (sName.includes('เขาพระ') && target.includes('เขาพระ')) return true;

                return false;
            });

            store.evacuees_display = filtered;
            window.currentFilteredData = filtered;

            // เคลียร์ตัวกรองทั้งหมด
            const searchInput = document.getElementById('evacSearchInput');
            const ageFilter = document.getElementById('evacAgeFilter');
            const healthFilter = document.getElementById('evacHealthFilter');

            if (searchInput) searchInput.value = '';
            if (ageFilter) ageFilter.value = 'all';
            if (healthFilter) healthFilter.value = 'all';

            if (typeof renderShelterStats === "function") renderShelterStats(filtered);
            if (typeof applyEvacFilters === "function") applyEvacFilters();
        };

        // ฟังก์ชันกรองข้อมูลตารางผู้ประสบภัยตามตัวกรอง
        function applyEvacFilters() {
            const rawData = window.currentFilteredData || store.evacuees || [];
            const searchVal = (document.getElementById('evacSearchInput')?.value || '').toLowerCase().trim();
            const ageVal = document.getElementById('evacAgeFilter')?.value || 'all';
            const healthVal = document.getElementById('evacHealthFilter')?.value || 'all';

            let filtered = rawData.filter(r => {
                const name = String(r[4] || '').toLowerCase();
                const address = String(r[2] || '').toLowerCase();
                const matchesSearch = !searchVal || name.includes(searchVal) || address.includes(searchVal);

                const age = parseInt(r[5] || 0);
                let matchesAge = true;
                if (ageVal === 'infant') matchesAge = (age >= 0 && age <= 7);
                else if (ageVal === 'child') matchesAge = (age >= 8 && age <= 15);
                else if (ageVal === 'adult') matchesAge = (age >= 16 && age <= 59);
                else if (ageVal === 'elderly') matchesAge = (age >= 60);

                const healthStatus = String(r[8] || '').trim();
                let matchesHealth = true;
                if (healthVal === 'normal') matchesHealth = (healthStatus === 'ปกติ' || !healthStatus);
                else if (healthVal === 'sick') matchesHealth = ['ผู้ป่วย', 'ผู้พิการ'].includes(healthStatus);
                else if (healthVal === 'vulnerable') matchesHealth = (healthStatus === 'กลุ่มเปราะบาง');

                return matchesSearch && matchesAge && matchesHealth;
            });

            renderEvacueeCards(filtered);
        }



        // กำหนดความจุของแต่ละศูนย์
        const SHELTER_CAPACITY = {
            'ศูนย์เทศบาลตำบลตันหยงมัส/บาลูกา': 80,
            'ศูนย์มัสยิดตันหยงมัส': 80,
            'ศูนย์โรงเรียนบ้านเขาพระ': 60
        };

        // ฟังก์ชันหลักในการเรนเดอร์สถิติและกราฟ
        /**
         * ฟังก์ชันแสดงสถิติและกราฟวงกลมของศูนย์พักพิง
         * @param {Array} data - ข้อมูลผู้ลี้ภัยที่ผ่านการกรองแล้ว
         * @param {String} chartType - ประเภทกราฟ ('capacity', 'gender', 'health')
         */
        // ประกาศตัวแปรเก็บ Instance ของกราฟแยกกัน
        let charts = { capacity: null, gender: null, age: null };

        function renderShelterStats(data) {
            const evacuees = data || [];
            const activeEvacuees = evacuees.filter(r => (r[10] || '').toString().trim() !== 'กลับบ้านแล้ว');
            const returnedEvacuees = evacuees.filter(r => (r[10] || '').toString().trim() === 'กลับบ้านแล้ว');

            const totalAll = evacuees.length;
            const totalActive = activeEvacuees.length;
            const totalReturned = returnedEvacuees.length;

            // นับครัวเรือนเฉพาะผู้ที่ยังพักพิงอยู่
            const households = [...new Set(activeEvacuees.map(r => String(r[2]).trim()).filter(a => a !== ''))].length;

            // นับเพศเฉพาะผู้ที่ยังพักพิงอยู่
            const male = activeEvacuees.filter(r => r[6] === 'ชาย').length;
            const female = activeEvacuees.filter(r => r[6] === 'หญิง').length;

            // นับช่วงอายุเฉพาะผู้ที่ยังพักพิงอยู่
            const ageGroups = {
                infant: activeEvacuees.filter(r => r[5] >= 0 && r[5] <= 7).length,
                child: activeEvacuees.filter(r => r[5] >= 8 && r[5] <= 15).length,
                adult: activeEvacuees.filter(r => r[5] >= 16 && r[5] <= 59).length,
                elderly: activeEvacuees.filter(r => r[5] >= 60).length
            };

            // นับกลุ่มสถานะสุขภาพ
            const sickCount = activeEvacuees.filter(r => ['ผู้ป่วย', 'ผู้พิการ'].includes(String(r[8]).trim())).length;
            const vulnerableCount = activeEvacuees.filter(r => String(r[8]).trim() === 'กลุ่มเปราะบาง').length;

            // 1. อัปเดตตัวเลขในการ์ดสถิติส่วนบน
            if (document.getElementById('statTotalPeople')) document.getElementById('statTotalPeople').innerText = totalAll;
            if (document.getElementById('statActivePeople')) document.getElementById('statActivePeople').innerText = totalActive;
            if (document.getElementById('statReturnedPeople')) document.getElementById('statReturnedPeople').innerText = totalReturned;
            if (document.getElementById('statTotalHouseholds')) document.getElementById('statTotalHouseholds').innerText = households;
            if (document.getElementById('statSick')) document.getElementById('statSick').innerText = sickCount;
            if (document.getElementById('statVulnerable')) document.getElementById('statVulnerable').innerText = vulnerableCount;

            // 2. อัปเดตตัวเลขข้างกราฟเพศ
            if (document.getElementById('numMale')) document.getElementById('numMale').innerText = male;
            if (document.getElementById('numFemale')) document.getElementById('numFemale').innerText = female;

            // 3. อัปเดตตัวเลขข้างกราฟช่วงอายุ
            if (document.getElementById('numAgeInfant')) document.getElementById('numAgeInfant').innerText = ageGroups.infant;
            if (document.getElementById('numAgeChild')) document.getElementById('numAgeChild').innerText = ageGroups.child;
            if (document.getElementById('numAgeAdult')) document.getElementById('numAgeAdult').innerText = ageGroups.adult;
            if (document.getElementById('numAgeElderly')) document.getElementById('numAgeElderly').innerText = ageGroups.elderly;

            // 4. คำนวณความจุศูนย์
            const activeBtn = document.querySelector('.shelter-filter-btn.active-shelter-btn');
            const filterValue = activeBtn ? activeBtn.getAttribute('data-center') : 'all';

            let totalCapacity = 0;
            if (filterValue === 'all') {
                totalCapacity = Object.values(SHELTER_CAPACITY).reduce((a, b) => a + b, 0);
            } else {
                const capKey = Object.keys(SHELTER_CAPACITY).find(k => k === filterValue || k.includes(filterValue) || filterValue.includes(k) || (k.includes('เทศบาล') && filterValue.includes('เทศบาล')) || (k.includes('มัสยิด') && filterValue.includes('มัสยิด')) || (k.includes('เขาพระ') && filterValue.includes('เขาพระ')));
                totalCapacity = capKey ? SHELTER_CAPACITY[capKey] : 0;
            }

            const occupancyRate = totalCapacity > 0 ? (totalActive / totalCapacity) * 100 : 0;
            let capacityColorClass = 'bg-green-400';
            if (occupancyRate >= 90) capacityColorClass = 'bg-rose-500';
            else if (occupancyRate >= 60) capacityColorClass = 'bg-amber-400';

            if (document.getElementById('statCapacityText')) {
                document.getElementById('statCapacityText').innerText = `${totalActive} / ${totalCapacity}`;
                const bar = document.getElementById('statCapacityBar');
                bar.style.width = `${Math.min(occupancyRate, 100)}%`;
                bar.className = `h-full rounded-full transition-all duration-1000 ${capacityColorClass}`;
            }

            // 5. อัปเดตกราฟโดนัท
            updateChart('gender', 'chartGender',
                ['ชาย', 'หญิง'], [male, female], ['#3b82f6', '#ec4899'], '65%', false);

            updateChart('age', 'chartAge',
                ['0-7 ปี', '8-15 ปี', '16-59 ปี', '60+ ปี'],
                [ageGroups.infant, ageGroups.child, ageGroups.adult, ageGroups.elderly],
                ['#10b981', '#3b82f6', '#f59e0b', '#f43f5e'], '65%', false);
        }

        // ฟังก์ชันสร้างกราฟที่ปรับปรุงแล้ว
        function updateChart(key, canvasId, labels, data, colors, cutout, legendPos) {
            const ctx = document.getElementById(canvasId).getContext('2d');
            if (charts[key]) charts[key].destroy();

            charts[key] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderWidth: 0,
                        borderRadius: 4
                    }]
                },
                options: {
                    maintainAspectRatio: false,
                    cutout: cutout,
                    plugins: {
                        legend: {
                            display: legendPos !== false,
                            position: legendPos || 'bottom',
                            labels: {
                                boxWidth: 8,
                                usePointStyle: true,
                                font: { size: 9, family: 'Kanit' },
                                padding: 10
                            }
                        },
                        tooltip: { enabled: true }
                    }
                }
            });
        }

        // ฟังก์ชันแสดงการ์ดรายชื่อผู้เข้าพักพิงและผู้กลับบ้านแล้ว
        function renderEvacueeCards(data) {
            const tableBody = document.getElementById('evacueeTableBody');
            const returnedBody = document.getElementById('returnedTableBody');
            const returnedBadge = document.getElementById('returnedCountBadge');

            const allData = data || [];
            const activeData = allData.filter(r => (r[10] || '').toString().trim() !== 'กลับบ้านแล้ว');
            const returnedData = allData.filter(r => (r[10] || '').toString().trim() === 'กลับบ้านแล้ว');

            if (returnedBadge) returnedBadge.innerText = `${returnedData.length} คน`;

            // 1. เรนเดอร์ตารางผู้ประสบภัยปัจจุบัน (ยังพักพิงอยู่)
            if (!activeData || activeData.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-slate-400">ไม่พบข้อมูลผู้เข้าพักพิงในขณะนี้</td></tr>`;
            } else {
                tableBody.innerHTML = activeData.map((r, index) => {
                    const healthStatus = r[8] || 'ปกติ';
                    const isNotNormal = healthStatus !== 'ปกติ';
                    const gender = r[6] || '-';
                    const idCard = String(r[3] || '').replace(/'/g, '');
                    const name = String(r[4] || '');

                    return `
                        <tr class="border-b border-slate-50 hover:bg-blue-50/50 transition-colors">
                            <td class="p-3 text-center text-slate-400 font-bold">${index + 1}</td>
                            <td class="p-3">
                                <div class="font-bold text-slate-700 text-[12px]">${name}</div>
                            </td>
                            <td class="p-3 text-slate-600">
                                ${r[5]} ปี / ${gender}
                            </td>
                            <td class="p-3">
                                ${isNotNormal
                                    ? `<span class="bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full font-bold text-[9px] shadow-sm whitespace-nowrap">
                                        <i class="fas fa-exclamation-circle mr-1"></i>${healthStatus}
                                       </span>`
                                    : `<span class="bg-green-50 text-green-600 border border-green-100 px-2 py-0.5 rounded-full font-bold text-[9px] shadow-sm whitespace-nowrap">
                                        <i class="fas fa-check-circle mr-1"></i>ปกติ
                                       </span>`
                                }
                            </td>
                            <td class="p-3">
                                <span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg font-bold text-[10px]">
                                    ${r[1]}
                                </span>
                            </td>
                            <td class="p-3 text-center">
                                <div class="flex items-center justify-center gap-1.5">
                                    <button type="button" onclick="confirmReturnHome('${idCard}', '${name.replace(/'/g, "\\'")}')" 
                                            title="แจ้งเดินทางกลับบ้านแล้ว"
                                            class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-[10px] font-bold rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1 whitespace-nowrap">
                                        <i class="fas fa-house-chimney-user text-emerald-500"></i> กลับบ้านแล้ว
                                    </button>
                                    <button onclick="checkPasswordBeforeDetailByData('${idCard}', '${name.replace(/'/g, "\\'")}')" 
                                            class="bg-white border border-blue-200 text-blue-600 w-8 h-8 rounded-full shadow-sm hover:bg-blue-600 hover:text-white transition-all active:scale-90 flex items-center justify-center shrink-0"
                                            title="ดูรายละเอียดส่วนตัว">
                                        <i class="fas fa-search-plus text-xs"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            // 2. เรนเดอร์ตารางผู้ที่เดินทางกลับบ้านแล้ว
            if (returnedBody) {
                if (!returnedData || returnedData.length === 0) {
                    returnedBody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">ยังไม่มีรายชื่อผู้ที่เดินทางกลับบ้านในศูนย์นี้</td></tr>`;
                } else {
                    returnedBody.innerHTML = returnedData.map((r, index) => {
                        const gender = r[6] || '-';
                        const idCard = String(r[3] || '').replace(/'/g, '');
                        const name = String(r[4] || '');

                        return `
                            <tr class="border-b border-slate-50 hover:bg-emerald-50/50 transition-colors bg-emerald-50/20">
                                <td class="p-3 text-center text-slate-400 font-bold">${index + 1}</td>
                                <td class="p-3">
                                    <div class="font-bold text-slate-700 text-[12px]">${name}</div>
                                </td>
                                <td class="p-3 text-slate-600">
                                    ${r[5]} ปี / ${gender}
                                </td>
                                <td class="p-3">
                                    <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg font-bold text-[10px]">
                                        ${r[1]}
                                    </span>
                                </td>
                                <td class="p-3 text-center">
                                    <span class="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-bold text-[10px] shadow-sm inline-flex items-center gap-1">
                                        <i class="fas fa-check-circle"></i> กลับบ้านแล้ว
                                    </span>
                                </td>
                                <td class="p-3 text-center">
                                    <button onclick="checkPasswordBeforeDetailByData('${idCard}', '${name.replace(/'/g, "\\'")}')" 
                                            class="bg-white border border-emerald-200 text-emerald-600 w-8 h-8 rounded-full shadow-sm hover:bg-emerald-600 hover:text-white transition-all active:scale-90"
                                            title="ดูรายละเอียดส่วนตัว">
                                        <i class="fas fa-search-plus text-xs"></i>
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            }
        }

        // ฟังก์ชันยืนยันสถานะผู้ประสบภัยกลับบ้านแล้ว
        async function confirmReturnHome(idCard, name) {
            const result = await Swal.fire({
                title: 'ยืนยันการเดินทางกลับบ้าน',
                html: `ต้องการเปลี่ยนสถานะของคุณ <b>${name}</b> เป็น <span class="text-emerald-600 font-bold">"กลับบ้านแล้ว"</span> ใช่หรือไม่?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'ยืนยันกลับบ้านแล้ว',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#10b981',
                customClass: { popup: 'rounded-[2rem]' }
            });

            if (!result.isConfirmed) return;

            Swal.fire({
                title: 'กำลังอัปเดตสถานะ...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            try {
                const payload = {
                    action: 'markEvacueeReturnHome',
                    idCard: idCard,
                    name: name,
                    period: typeof currentPeriod !== 'undefined' ? currentPeriod : ''
                };

                if (typeof sbMarkEvacueeReturnHome === 'function') {
                    await sbMarkEvacueeReturnHome(idCard, name, currentPeriod);
                } else {
                    throw new Error('Supabase Service ไม่พร้อมทำงาน');
                }

                Swal.fire({
                    title: 'สำเร็จ!',
                    text: `อัปเดตสถานะคุณ ${name} กลับบ้านแล้วเรียบร้อย`,
                    icon: 'success',
                    timer: 1500
                });

                    // อัปเดตใน store.evacuees ทันที
                    const target = (store.evacuees || []).find(r => {
                        const rCard = String(r[3] || '').replace(/'/g, '').trim();
                        const rName = String(r[4] || '').trim();
                        return (idCard && rCard === idCard) || (name && rName === name);
                    });
                    if (target) {
                        target[10] = 'กลับบ้านแล้ว';
                    }

                    await loadData();
                    const activeBtn = document.querySelector('.shelter-filter-btn.active-shelter-btn');
                    const centerName = activeBtn ? activeBtn.getAttribute('data-center') : 'all';
                    if (typeof filterShelter === 'function') filterShelter(centerName);
                    if (typeof renderDashOneMapLayers === 'function') renderDashOneMapLayers();
                    if (typeof window.loadEvacuationMarkers === 'function') window.loadEvacuationMarkers();
            } catch (err) {
                Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
            }
        }

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

        function showDetailsByData(idCard, name) {
            const evacuees = store.evacuees || [];
            const person = evacuees.find(r => {
                const rCard = String(r[3] || '').replace(/'/g, '').trim();
                const rName = String(r[4] || '').trim();
                return (idCard && rCard === idCard) || (name && rName === name);
            });
            if (person) {
                showDetails(person);
            }
        }

        // 1. ฟังก์ชันตรวจสอบรหัสผ่าน 1111
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

        // ฟังก์ชันปิด Modal (แก้ไขให้ทำงานได้แน่นอน)
        function closeDataModal() {
            const modal = document.getElementById('dataModal');
            if (modal) {
                modal.classList.add('hidden');
            }
        }

        // ฟังก์ชันแสดงรายละเอียดข้อมูล
        function showDetails(target) {
            let person = null;
            if (Array.isArray(target)) {
                person = target;
            } else if (typeof target === 'number') {
                person = (store.evacuees_display && store.evacuees_display[target]) ? store.evacuees_display[target] : (store.evacuees ? store.evacuees[target] : null);
            } else if (target && typeof target === 'object') {
                person = target;
            }
            if (!person) return;

            // แสดงชื่อและศูนย์ในส่วน Header ให้โดดเด่น
            document.getElementById('modalName').innerText = person[4]; // ชื่อ (Index 4)
            document.getElementById('modalShelter').innerText = person[1]; // ศูนย์ (Index 1)

            const modal = document.getElementById('dataModal');
            const content = document.getElementById('modalContent');

            // จัดการเบอร์โทร (ลบเครื่องหมาย ' ออกถ้ามี)
            const rawPhone = person[7] ? person[7].toString() : "";
            const cleanPhone = rawPhone.replace(/'/g, "");

            const healthStatus = person[8] || 'ปกติ';
            const isNotNormal = healthStatus !== 'ปกติ';

            content.innerHTML = `
        <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <p class="text-[10px] text-slate-400 font-bold uppercase mb-1">อายุ</p>
                <p class="text-sm font-black text-slate-700">${person[5]} ปี</p>
            </div>
            <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <p class="text-[10px] text-slate-400 font-bold uppercase mb-1">เพศ</p>
                <p class="text-sm font-black text-slate-700">${person[6] || '-'}</p>
            </div>
        </div>

        <div class="space-y-4">
            <div class="flex items-center gap-3 px-1 border-b pb-3">
                <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 shadow-sm">
                    <i class="fas fa-id-card text-xs"></i>
                </div>
                <div class="flex-1">
                    <p class="text-[9px] text-slate-400 font-bold uppercase">เลขบัตรประจำตัวประชาชน</p>
                    <p class="text-sm font-bold text-slate-700">${person[3] || '-'}</p>
                </div>
            </div>

            <div class="flex items-center gap-3 px-1 border-b pb-3">
                <div class="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-500 shadow-sm">
                    <i class="fas fa-phone-alt text-xs"></i>
                </div>
                <div class="flex-1">
                    <p class="text-[9px] text-slate-400 font-bold uppercase">เบอร์โทรศัพท์</p>
                    <a href="tel:${cleanPhone}" class="text-sm font-bold text-blue-600 underline">
                        ${cleanPhone || 'ไม่ระบุ'}
                    </a>
                </div>
            </div>

            <div class="flex items-center gap-3 px-1 border-b pb-3">
                <div class="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500 shadow-sm">
                    <i class="fas fa-map-marker-alt text-xs"></i>
                </div>
                <div class="flex-1">
                    <p class="text-[9px] text-slate-400 font-bold uppercase">ที่อยู่</p>
                    <p class="text-xs font-medium text-slate-600 leading-relaxed">${person[2]}</p>
                </div>
            </div>
        </div>

        <div class="mt-4 p-4 rounded-3xl ${isNotNormal ? 'bg-red-50 border-2 border-red-100 shadow-red-50' : 'bg-slate-50 border border-slate-100'} shadow-sm">
            <p class="text-[10px] font-bold ${isNotNormal ? 'text-red-500' : 'text-slate-400'} uppercase mb-1">สถานะสุขภาพ</p>
            <div class="flex items-center gap-2">
                <p class="text-md font-black ${isNotNormal ? 'text-red-700' : 'text-slate-700'}">
                    ${isNotNormal ? `<i class="fas fa-notes-medical mr-1"></i>${healthStatus}` : '<i class="fas fa-check-circle mr-1 text-green-500"></i>สุขภาพปกติ'}
                </p>
            </div>
            ${isNotNormal && person[9] ? `
                <div class="mt-3 text-xs text-red-600 bg-white/80 p-3 rounded-xl italic border-l-4 border-red-400 shadow-inner">
                    ${person[9]}
                </div>
            ` : ''}
        </div>
    `;

            modal.classList.remove('hidden');
        }
        async function saveEvacuee(e) {
            e.preventDefault();
            const btn = document.getElementById('saveRegisBtn');

            // จัดการเรื่องเบอร์โทรศัพท์ (ใส่ ' นำหน้าเพื่อให้ Google Sheets มองเป็นข้อความและคงเลข 0 ไว้)
            let phoneVal = document.getElementById('regis_phone').value.trim();
            if (phoneVal && !phoneVal.startsWith("'")) {
                phoneVal = "'" + phoneVal;
            }

            const healthType = document.getElementById('regis_health_type').value;
            const healthNote = document.getElementById('regis_health_note').value.trim();

            try {
                btn.disabled = true;
                const payload = {
                    action: 'saveEvacuee',
                    shelter: document.getElementById('regis_shelter').value,
                    address: (document.getElementById('regis_address_select').value === 'other') ? document.getElementById('regis_address_custom').value : document.getElementById('regis_address_select').value,
                    idCard: document.getElementById('regis_idcard').value.trim(),
                    name: document.getElementById('regis_name').value.trim(),
                    age: document.getElementById('regis_age').value,
                    gender: document.getElementById('regis_gender').value,
                    phone: phoneVal,
                    healthType: healthType, // ส่งค่าประเภทสุขภาพ (ผู้ป่วย/พิการ/ปกติ)
                    healthNote: healthNote,
                    period: currentPeriod
                };

                if (typeof sbSaveEvacuee === 'function') {
                    await sbSaveEvacuee(payload);
                } else {
                    throw new Error('Supabase Service ไม่พร้อมทำงาน');
                }
                Swal.fire('สำเร็จ', 'ลงทะเบียนเรียบร้อย', 'success').then(() => {
                    document.getElementById('regisForm').reset();
                    loadData();
                    showPage('shelter');
                });
            } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
            finally { btn.disabled = false; }
        }

        // ฟังก์ชันเปิด/ปิดช่องรายละเอียด
        function toggleHealthNote(val) {
            const container = document.getElementById('health_note_container');
            container.classList.toggle('hidden', val === 'ปกติ');
        }
        function filterReliefTable() {
            const searchTerm = document.getElementById('reliefSearchInput').value.toLowerCase();
            const allData = store.reliefData || [];

            // กรองข้อมูลจากชื่อ (Index 1) และ ที่อยู่ (Index 4)
            const filtered = allData.filter(r => {
                const name = (r[1] || "").toLowerCase();
                const address = (r[4] || "").toLowerCase();
                return name.includes(searchTerm) || address.includes(searchTerm);
            });

            // อัปเดตตัวเลขจำนวนที่ค้นเจอ
            const matchCountEl = document.getElementById('reliefMatchCount');
            if (matchCountEl) {
                matchCountEl.innerText = `พบ ${filtered.length} จาก ${allData.length} รายการ`;
            }

            // ส่งข้อมูลที่กรองแล้วไปแสดงผลในตาราง
            renderReliefTable(filtered);
        }
        function openLightbox(url) {
            const modal = document.getElementById('imageLightbox');
            const img = document.getElementById('lightboxImg');

            // แปลง URL ให้เป็นขนาดใหญ่ (กรณีเป็นรูปจาก Google Drive)
            // เปลี่ยนจาก sz=w400 เป็น sz=w1200 เพื่อความคมชัด
            let highResUrl = url.replace('sz=w400', 'sz=w1200').replace('sz=w600', 'sz=w1200');

            img.src = highResUrl;

            // แสดง Modal พร้อม Animation
            modal.classList.remove('hidden');
            // ใช้ setTimeout เล็กน้อยเพื่อให้ CSS Transition ทำงาน
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                img.classList.remove('scale-95');
                img.classList.add('scale-100');
            }, 10);
        }

        function closeLightbox() {
            const modal = document.getElementById('imageLightbox');
            const img = document.getElementById('lightboxImg');

            // ซ่อน Modal พร้อม Animation
            modal.classList.add('opacity-0');
            img.classList.remove('scale-100');
            img.classList.add('scale-95');

            setTimeout(() => {
                modal.classList.add('hidden');
                img.src = ''; // เคลียร์รูปออก
            }, 300); // รอให้ Animation จบก่อนซ่อน
        }


        function toggleMoreMenu() {
            const menu = document.getElementById('moreMenuMobile');
            menu.classList.toggle('hidden');
        }

        // ฟังก์ชันเปิด Modal (ตัวอย่าง)
        function openWaterReportModal() {
            // โค้ดสำหรับแสดง Modal/Swal รายงานระดับน้ำ
            // คุณสามารถนำฟอร์มจากหน้า addWater เดิมมาใส่ใน SweetAlert2 หรือ Modal Custom ได้เลยครับ
            Swal.fire({
                title: 'รายงานระดับน้ำ',
                html: `<div id="modalFormContainer">...</div>`, // ใส่ HTML ฟอร์มที่นี่
                showConfirmButton: false,
                width: '95%',
                padding: '1em',
                customClass: { popup: 'rounded-[2rem]' }
            });
        }


        // ฟังก์ชันสำหรับพิมพ์รายงานศูนย์พักพิง
        window.printShelterReport = function () {
            // 1. ดึงข้อมูลที่กำลัง "แสดงผลอยู่ในตารางปัจจุบัน" (ข้อมูลที่ผ่านการกรองแล้ว)
            // โดยปกติจะเก็บไว้ใน window.currentFilteredData จากฟังก์ชัน filterShelter
            let data = (window.currentFilteredData && window.currentFilteredData.length > 0)
                ? window.currentFilteredData
                : (window.store && window.store.evacuees ? window.store.evacuees : []);

            if (data.length === 0) {
                Swal.fire('ไม่พบข้อมูล', 'ไม่มีข้อมูลในตัวกรองนี้เพื่อจัดทำรายงาน', 'warning');
                return;
            }

            const printArea = document.getElementById('printArea');
            printArea.classList.remove('hidden');

            // 2. แสดงวันที่และเวลาพิมพ์
            document.getElementById('printDate').innerText = new Date().toLocaleString('th-TH');

            // --- 3. คำนวณสถิติใหม่ทั้งหมด (เฉพาะข้อมูลที่กรองมา) ---
            const totalCount = data.length;
            const maleCount = data.filter(r => String(r[6] || '').trim() === 'ชาย').length;
            const femaleCount = data.filter(r => String(r[6] || '').trim() === 'หญิง').length;

            // นับครัวเรือน (อิงที่อยู่ไม่ซ้ำกันจาก Index 2)
            const uniqueHouseholds = new Set(data.map(r => String(r[2] || '').trim()).filter(a => a !== '')).size;

            // นับกลุ่มเปราะบาง (ทุกอย่างใน Index 8 ที่ไม่ใช่ 'ปกติ')
            const vulnerableCount = data.filter(r => {
                const h = String(r[8] || 'ปกติ').trim();
                return h !== 'ปกติ' && h !== '-' && h !== '';
            }).length;

            // --- 4. อัปเดตตัวเลขลงในการ์ดสรุป (หน้า 1) ---
            document.getElementById('printTotalEvacuees').innerText = totalCount.toLocaleString();
            document.getElementById('printMaleTotal').innerText = maleCount.toLocaleString();
            document.getElementById('printFemaleTotal').innerText = femaleCount.toLocaleString();
            document.getElementById('printTotalHouseholds').innerText = uniqueHouseholds.toLocaleString();
            document.getElementById('printTotalHealth').innerText = vulnerableCount.toLocaleString();

            // --- 5. สรุปรายละเอียด (แยกตามศูนย์, อายุ, สุขภาพ) ---
            // แยกตามศูนย์ (จะเหลือแค่ศูนย์ที่เลือก หรือทุกศูนย์ถ้าไม่ได้กรอง)
            const shelterMap = {};
            data.forEach(r => { shelterMap[r[1] || 'ไม่ระบุ'] = (shelterMap[r[1] || 'ไม่ระบุ'] || 0) + 1; });
            document.getElementById('printShelterList').innerHTML = Object.entries(shelterMap).map(([n, c]) => `
        <div style="display:flex; justify-content:space-between; border-bottom:1px dashed #ddd; padding:2px 0;">
            <span>${n}</span><b>${c} ราย</b>
        </div>`).join('');

            // แยกตามสถานะสุขภาพ
            const healthMap = {};
            data.forEach(r => {
                const h = String(r[8] || 'ปกติ').trim();
                healthMap[h] = (healthMap[h] || 0) + 1;
            });
            document.getElementById('printHealthList').innerHTML = Object.entries(healthMap).map(([n, c]) => `
        <div style="display:flex; justify-content:space-between; border-bottom:1px dashed #ddd; padding:2px 0;">
            <span>${n}</span><b>${c} ราย</b>
        </div>`).join('');

            // แยกตามช่วงอายุ
            const ages = { 'เด็ก (0-12)': 0, 'วัยรุ่น (13-20)': 0, 'ผู้ใหญ่ (21-59)': 0, 'ผู้สูงอายุ (60+)': 0 };
            data.forEach(r => {
                const a = parseInt(r[5]) || 0;
                if (a <= 12) ages['เด็ก (0-12)']++;
                else if (a <= 20) ages['วัยรุ่น (13-20)']++;
                else if (a < 60) ages['ผู้ใหญ่ (21-59)']++;
                else ages['ผู้สูงอายุ (60+)']++;
            });
            document.getElementById('printAgeList').innerHTML = Object.entries(ages).map(([l, c]) => `
        <div style="display:flex; justify-content:space-between; border-bottom:1px dashed #ddd; padding:2px 0;">
            <span>${l}</span><b>${c} ราย</b>
        </div>`).join('');

            // --- 6. เติมตารางรายชื่อ (หน้า 2) ---
            const tbody = document.getElementById('printTableBody');
            tbody.innerHTML = data.map((r, i) => `
        <tr>
            <td style="text-align:center">${i + 1}</td>
            <td>${r[1] || '-'}</td>
            <td style="font-weight:bold">${r[4] || '-'}</td>
            <td style="text-align:center">${r[6] || '-'}</td>
            <td style="text-align:center">${r[5] || '-'}</td>
            <td>${r[2] || '-'}</td>
            <td>${r[7] || '-'}</td>
        </tr>`).join('');

            // 7. สั่งพิมพ์
            setTimeout(() => {
                window.print();
                printArea.classList.add('hidden');
            }, 600);
        };

        function handleLogout() {
            Swal.fire({
                title: 'ยืนยันการออกจากระบบ?',
                text: "คุณต้องเข้าสู่ระบบใหม่เพื่อใช้งาน",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#e11d48', // สีแดง rose
                confirmButtonText: 'ใช่, ออกจากระบบ',
                cancelButtonText: 'ยกเลิก',
                reverseButtons: true
            }).then((result) => {
                if (result.isConfirmed) {
                    // ล้างข้อมูล Session ทั้งหมด
                    localStorage.removeItem('user_session');
                    // รีเฟรชหน้าเพื่อกลับไปหน้า Login
                    location.reload();
                }
            });
        }

        // ==========================================
        // ระบบรายงานสถานะการอพยพ
        // ==========================================

        // ฟังก์ชันสลับตัวเลือกสถานที่อพยพใน Popup
        window.toggleEvacDest = function (type) {
            const boxC = document.getElementById('box_dest_center');
            const boxO = document.getElementById('box_dest_other');
            const btnC = document.getElementById('btn_dest_center');
            const btnO = document.getElementById('btn_dest_other');
            document.getElementById('swal_evac_type').value = type;

            if (type === 'ศูนย์') {
                boxC.classList.remove('hidden'); boxO.classList.add('hidden');
                btnC.className = "flex-1 py-3 rounded-xl border-2 border-orange-400 bg-orange-50 text-orange-600 font-bold text-xs transition-all";
                btnO.className = "flex-1 py-3 rounded-xl border-2 border-transparent bg-slate-50 text-slate-500 font-bold text-xs transition-all";
            } else {
                boxO.classList.remove('hidden'); boxC.classList.add('hidden');
                btnO.className = "flex-1 py-3 rounded-xl border-2 border-orange-400 bg-orange-50 text-orange-600 font-bold text-xs transition-all";
                btnC.className = "flex-1 py-3 rounded-xl border-2 border-transparent bg-slate-50 text-slate-500 font-bold text-xs transition-all";
            }
        };

        // ฟังก์ชันดึงประวัติที่อยู่จากชีททั้งหมดในระบบ (Address_Evacuation, Addresses, Flood_DATA, Relief)
        window.getEvacAddressList = function () {
            if (typeof store === 'undefined' || !store) return [];

            const evacAddrs = (store.addressEvac && Array.isArray(store.addressEvac))
                ? store.addressEvac.map(row => row[0] ? row[0].toString().trim() : '').filter(a => a !== '')
                : [];

            const regisAddrs = (store.addresses && Array.isArray(store.addresses))
                ? store.addresses.map(a => a ? a.toString().trim() : '').filter(a => a !== '')
                : [];

            const floodAddrs = (store.floodData && Array.isArray(store.floodData))
                ? store.floodData.map(row => row[2] ? row[2].toString().trim() : (row[1] ? row[1].toString().trim() : '')).filter(a => a !== '')
                : [];

            const reliefAddrs = (store.reliefData && Array.isArray(store.reliefData))
                ? store.reliefData.map(r => r[4] ? r[4].toString().trim() : '').filter(a => a !== '')
                : [];

            return [...new Set([...evacAddrs, ...regisAddrs, ...floodAddrs, ...reliefAddrs])].filter(a => a !== '').sort();
        };

        // ฟังก์ชันค้นหาที่อยู่ (Autocomplete)
        window.handleEvacAddressSearch = function (val) {
            const resultBox = document.getElementById('swal_evac_addr_results');
            if (!resultBox) return;

            if (!val || val.trim().length < 1) {
                resultBox.classList.add('hidden');
                return;
            }

            if (!window.evacAddressList || window.evacAddressList.length === 0) {
                window.evacAddressList = getEvacAddressList();
            }

            const searchVal = val.toLowerCase().trim();
            const filtered = window.evacAddressList.filter(a => a.toLowerCase().includes(searchVal)).slice(0, 15);

            if (filtered.length > 0) {
                let html = '';
                filtered.forEach(addr => {
                    html += `<div onclick='selectEvacAddress(${JSON.stringify(addr)})' class="p-3 hover:bg-orange-100 cursor-pointer border-b border-slate-100 text-sm text-slate-700 transition-colors flex items-center justify-between"><span class="font-medium">${addr}</span><i class="fas fa-chevron-right text-[10px] text-orange-400"></i></div>`;
                });
                resultBox.innerHTML = html;
                resultBox.classList.remove('hidden');
            } else {
                resultBox.innerHTML = '<div class="p-3 text-xs text-orange-600 font-bold bg-orange-50 flex items-center"><i class="fas fa-info-circle mr-2"></i>ไม่พบที่อยู่นี้ในระบบ (สามารถเลือก "ระบุที่อยู่อื่นๆ" ด้านล่างได้)</div>';
                resultBox.classList.remove('hidden');
            }
        };

        // ฟังก์ชันเมื่อคลิกเลือกที่อยู่จากการค้นหา
        window.selectEvacAddress = function (addr) {
            document.getElementById('swal_evac_addr_search').value = addr;
            document.getElementById('swal_evac_addr_results').classList.add('hidden');
        };

        // เปิด/ปิดช่องกรอกที่อยู่อื่น + เรียก GPS
        window.toggleEvacOtherAddress = function (isChecked) {
            const boxOther = document.getElementById('box_evac_other_addr');
            const inputSearch = document.getElementById('swal_evac_addr_search');

            if (isChecked) {
                boxOther.classList.remove('hidden');
                inputSearch.disabled = true;
                inputSearch.classList.add('opacity-50');
                getEvacLocation(); // สั่งดึงพิกัดอัตโนมัติ
            } else {
                boxOther.classList.add('hidden');
                inputSearch.disabled = false;
                inputSearch.classList.remove('opacity-50');
            }
        };

        // ดึง GPS ผู้ใช้งาน
        window.getEvacLocation = function () {
            const coordsInput = document.getElementById('swal_evac_coords');
            coordsInput.value = 'กำลังค้นหาตำแหน่งพิกัด GPS...';

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (p) => {
                        coordsInput.value = `${p.coords.latitude},${p.coords.longitude}`;
                    },
                    (err) => {
                        console.warn(err);
                        coordsInput.value = 'กรุณาเปิด GPS และกดปุ่มดึงพิกัดอีกครั้ง';
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            } else {
                coordsInput.value = 'อุปกรณ์ไม่รองรับระบบพิกัด';
            }
        };


        async function saveEvacuationData(data) {
            Swal.fire({
                title: 'กำลังบันทึกข้อมูล...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            // ดึงข้อมูลชื่อจากช่อง input (ป้องกัน Error ถ้าหาช่องไม่เจอ)
            const nameInput = document.getElementById('evac_name');
            const evacName = data.evacName;

            // 🌟 จัดเตรียมข้อมูลส่งไปหลังบ้าน
            const payload = {
                action: 'saveEvacuation',
                address: data.address,
                count: data.count,
                type: data.type,
                dest: data.dest,
                user: currentUser,
                coords: data.coords,
                evacName: data.evacName,
                status: data.status,
                note: data.note, // 🌟 เพิ่มบรรทัดนี้ เพื่อส่งรายละเอียดเพิ่มเติมไปหลังบ้าน
                period: currentPeriod
            };

            // 🌟 เรดาร์ตรวจจับ: เช็คว่ารอบนี้มีชื่อและสถานะติดไปไหม!
            console.log("🚀 ข้อมูลที่จะส่งไปเซิร์ฟเวอร์:", payload);

            try {
                if (typeof sbSaveEvacuation === 'function') {
                    await sbSaveEvacuation(payload);
                } else {
                    throw new Error('Supabase Service ไม่พร้อมทำงาน');
                }

                Swal.fire({
                    title: 'บันทึกสำเร็จ',
                    // 🌟 เปลี่ยนข้อความให้เข้ากับประชาชน
                    text: isPublicMode ? 'เทศบาลตำบลตันหยงมัสได้รับรายงานของท่านแล้ว ขอบคุณครับ' : 'อัปเดตรายงานสถานะเรียบร้อยแล้ว',
                    icon: 'success',
                    timer: isPublicMode ? 3000 : 1500,
                    showConfirmButton: false
                });

                // เคลียร์ช่องชื่อทิ้งหลังบันทึกเสร็จ
                if (nameInput) nameInput.value = '';

                // 🌟 ถ้าเป็นโหมดประชาชน ไม่ต้องรีเฟรชแผนที่ (เพราะหน้าแผนที่ถูกซ่อนไว้)
                if (!isPublicMode) {
                    await loadData();
                    if (typeof loadEvacuationMarkers === 'function') {
                        loadEvacuationMarkers();
                    }
                }
            } catch (err) {
                Swal.fire('ผิดพลาด', err.message, 'error');
            }
        }
        // ==========================================
        // ข้อมูลตารางหน้าศูนย์พักพิง
        // ==========================================
        // ตัวแปรเก็บข้อมูลที่ผ่านการกรอง เพื่อนำไปใช้พิมพ์
        window.currentTableData = [];

        // ฟังก์ชันทำงานเมื่อพิมพ์ค้นหา หรือเปลี่ยนตัวกรองอายุ/สุขภาพ
        window.applyEvacFilters = function () {
            let data = store.evacuees_display || [];

            const searchText = document.getElementById('evacSearchInput').value.toLowerCase();
            const ageFilter = document.getElementById('evacAgeFilter').value;
            const healthFilter = document.getElementById('evacHealthFilter').value;

            const filtered = data.filter(r => {
                const name = (r[4] || '').toString().toLowerCase();
                const address = (r[2] || '').toString().toLowerCase();
                const age = parseInt(r[5]) || 0;
                const health = String(r[8] || 'ปกติ').trim();

                // 1. เช็คการค้นหา (แมตช์ชื่อ หรือ ที่อยู่)
                const matchText = name.includes(searchText) || address.includes(searchText);

                // 2. เช็คอายุ
                let matchAge = true;
                if (ageFilter === 'infant') matchAge = (age >= 0 && age <= 7);
                else if (ageFilter === 'child') matchAge = (age >= 8 && age <= 15);
                else if (ageFilter === 'adult') matchAge = (age >= 16 && age <= 59);
                else if (ageFilter === 'elderly') matchAge = (age >= 60);

                // 3. เช็คสถานะสุขภาพ
                let matchHealth = true;
                if (healthFilter === 'normal') matchHealth = (health === 'ปกติ');
                else if (healthFilter === 'sick') matchHealth = (health === 'ผู้ป่วย' || health === 'ผู้พิการ');
                else if (healthFilter === 'vulnerable') matchHealth = (health === 'กลุ่มเปราะบาง');

                // ข้อมูลต้องตรงกับทุกเงื่อนไข (ค้นหา + อายุ + สุขภาพ)
                return matchText && matchAge && matchHealth;
            });

            window.currentTableData = filtered;

            if (typeof renderEvacueeCards === 'function') {
                renderEvacueeCards(filtered);
            }
        };

        // ฟังก์ชันพิมพ์ตาราง โดยเพิ่มข้อมูลสุขภาพในหัวกระดาษด้วย
        window.printFilteredEvacuees = function () {
            if (!window.currentTableData || window.currentTableData.length === 0) {
                Swal.fire('ไม่พบข้อมูล', 'ไม่มีข้อมูลที่ตรงกับเงื่อนไขการกรอง', 'warning');
                return;
            }

            const data = window.currentTableData;
            const printArea = document.getElementById('printArea');

            const activeBtn = document.querySelector('.shelter-filter-btn.active-shelter-btn');
            const shelterName = activeBtn ? activeBtn.innerText : 'ทุกศูนย์พักพิง';
            const ageSelect = document.getElementById('evacAgeFilter');
            const ageFilterText = ageSelect.options[ageSelect.selectedIndex].text;
            const healthSelect = document.getElementById('evacHealthFilter');
            const healthFilterText = healthSelect.options[healthSelect.selectedIndex].text;

            const originalChildren = [];
            Array.from(printArea.children).forEach(child => {
                originalChildren.push({ el: child, display: child.style.display });
                child.style.display = 'none';
            });

            const tempDiv = document.createElement('div');
            tempDiv.className = "print-page";
            tempDiv.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #334155; padding-bottom: 10px;">
            <h2 style="font-size: 18px; font-weight: bold; margin: 0;">รายชื่อผู้เข้าพักพิง (อิงตามตัวกรอง)</h2>
            <p style="font-size: 12px; margin: 5px 0;">ศูนย์พักพิง: ${shelterName} | เงื่อนไขอายุ: ${ageFilterText} | สุขภาพ: ${healthFilterText}</p>
            <p style="font-size: 12px; margin: 0; color: #64748b;">ผลการกรอง: จำนวน ${data.length} ราย</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead style="background-color: #f1f5f9;">
                <tr>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 40px;">ลำดับ</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">ชื่อ-นามสกุล</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">อายุ</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">เพศ</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">สถานะสุขภาพ</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">ที่อยู่</th>
                </tr>
            </thead>
            <tbody>
                ${data.map((r, i) => `
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${i + 1}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${r[4] || '-'}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${r[5] || '-'}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${r[6] || '-'}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${r[8] || 'ปกติ'}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${r[2] || '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

            printArea.appendChild(tempDiv);
            printArea.classList.remove('hidden');

            setTimeout(() => {
                window.print();
                printArea.classList.add('hidden');
                printArea.removeChild(tempDiv);
                originalChildren.forEach(item => { item.el.style.display = item.display; });
            }, 500);
        };
        // ==========================================
        // พิมพ์ตารางหน้าถุงยังชีพ
        // ==========================================


        // ฟังก์ชันพิมพ์ตารางรายชื่อผู้รับถุงยังชีพ
        window.printReliefTable = function () {
            const data = window.currentReliefDisplayData || [];

            if (data.length === 0) {
                Swal.fire('ไม่พบข้อมูล', 'ไม่มีข้อมูลสำหรับพิมพ์', 'warning');
                return;
            }

            // 1. ตรวจสอบว่ามี window.ZONE_RULES หรือไม่ (ถ้าไม่มีให้สร้าง Default ไว้ป้องกัน Error)
            window.ZONE_RULES = window.ZONE_RULES || {
                'zone 1': ['เทศบาล 1', 'เทศบาล 2', 'ตลาดตันหยงมัส', 'สถานีรถไฟ'],
                'zone 2': ['เทศบาล 3', 'เทศบาล 4', 'ระแงะมรรคา', 'ฮูลูปาเระ'],
                'zone 3': ['เทศบาล 5', 'เทศบาล 6', 'บ้านบาโงตา'],
                'zone 4': ['บ้านทำเนียบ', 'เขาพระ'],
                'zone 5': ['อื่นๆ']
            };

            const printArea = document.getElementById('printArea');
            const searchInputRaw = document.getElementById('reliefSearchInput').value;
            const searchText = searchInputRaw.toLowerCase().trim();

            // ดึงสถานะปุ่ม Zone ปัจจุบันที่ถูกกดอยู่ (ถ้ามีตัวแปรนี้ในระบบ)
            const activeZoneVar = typeof window.currentZoneFilter !== 'undefined' ? window.currentZoneFilter : '';

            let filterText = "ข้อมูลทั้งหมด";

            // ฟังก์ชันช่วยดึงข้อมูลถนนจาก ZONE_RULES มาเรียงต่อกันในวงเล็บ
            const getZoneDetailsString = (zoneKey) => {
                if (window.ZONE_RULES && window.ZONE_RULES[zoneKey]) {
                    return ` (${window.ZONE_RULES[zoneKey].join(', ')})`;
                }
                return '';
            };

            // 2. กำหนดข้อความ "เงื่อนไขข้อมูล" บนหัวกระดาษ
            if (activeZoneVar && activeZoneVar !== 'all') {
                // กรณีกดปุ่มเลือก Zone ไว้
                const zoneKey = activeZoneVar.toLowerCase();
                filterText = `กรองตามโซน: ${activeZoneVar.toUpperCase()}${getZoneDetailsString(zoneKey)}`;

                // ถ้ามีการพิมพ์ค้นหาชื่อต่อจากที่เลือก Zone ไว้ ให้แสดงบอกด้วย
                if (searchText) {
                    filterText += ` | ค้นหาเพิ่มเติม: "${searchInputRaw}"`;
                }
            } else if (searchText) {
                // กรณีพิมพ์ค้นหาทั่วไป (ตรวจสอบว่าพิมพ์คำว่า zone 1, zone 2 หรือไม่)
                const matchedZone = Object.keys(window.ZONE_RULES).find(z => searchText.includes(z));
                if (matchedZone) {
                    filterText = `กรองตามโซน: ${matchedZone.toUpperCase()}${getZoneDetailsString(matchedZone)}`;
                } else {
                    filterText = `ค้นหาคำว่า: "${searchInputRaw}"`;
                }
            }

            // 3. เตรียมพื้นที่พิมพ์ (ซ่อนของเดิม)
            const originalChildren = [];
            Array.from(printArea.children).forEach(child => {
                originalChildren.push({ el: child, display: child.style.display });
                child.style.display = 'none';
            });

            // 4. สร้างโครงสร้าง HTML สำหรับพิมพ์
            const tempDiv = document.createElement('div');
            tempDiv.className = "print-page";
            tempDiv.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #334155; padding-bottom: 15px;">
            <h2 style="font-size: 18px; font-weight: bold; margin: 0;">รายงานการแจกถุงยังชีพ เทศบาลตำบลตันหยงมัส</h2>
            <p style="font-size: 12px; margin: 5px 0; color: #64748b; font-weight: bold;">เงื่อนไขข้อมูล: ${filterText}</p>
            
            <div style="display: inline-block; background: #fffbeb; border: 1px solid #fcd34d; padding: 6px 20px; border-radius: 20px; margin-top: 8px;">
                <span style="font-size: 14px; font-weight: bold; color: #d97706;">จำนวนถุงยังชีพที่แจกแล้ว: ${data.length} ชุด</span>
            </div>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead style="background-color: #f1f5f9;">
                <tr>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 40px;">ลำดับ</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">วัน-เวลา ที่รับ</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">ชื่อ-นามสกุลผู้รับ</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">ที่อยู่</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">จำนวนผู้อาศัย</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">สถานะผู้รับ</th>
                </tr>
            </thead>
            <tbody>
                ${data.map((r, i) => {
                const timestamp = r[0] ? new Date(r[0]).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
                return `
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${i + 1}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${timestamp}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${r[1] || '-'}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${r[4] || '-'}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${r[3] || 0}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${r[2] || '-'}</td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
    `;

            printArea.appendChild(tempDiv);
            printArea.classList.remove('hidden');

            // 5. สั่งพิมพ์ และเคลียร์หน้ากระดาษกลับเป็นปกติ
            setTimeout(() => {
                window.print();
                printArea.classList.add('hidden');
                printArea.removeChild(tempDiv);
                originalChildren.forEach(item => { item.el.style.display = item.display; });
            }, 500);
        };



        //-------------------------------------------//
        //---------------หน้าหลัก---------------------//

        // ตัวแปรเก็บกราฟหน้า Dashboard (ป้องกันกราฟซ้อน)
        let dashMainWaterChartInstance = null;

        window.renderAdminDashboard = function () {
            // 1. สั่งอัปเดตหมุดแผนที่ระดับน้ำ
            if (typeof updateDashWaterMapMarkers === 'function') updateDashWaterMapMarkers();

            // 🌟 2. คำนวณและอัปเดตข้อมูลการอพยพ/ปลอดภัยขึ้นการ์ดแบบ Auto-Sync
            if (typeof window.loadEvacuationMarkers === 'function') {
                window.loadEvacuationMarkers();
            }

            // 3. คำนวณข้อมูลศูนย์พักพิง
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

            // 4. คำนวณข้อมูลถุงยังชีพและคลังสต๊อก
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
        let dashWaterMap;
        let dashMarkerLayer = L.layerGroup();

        window.initDashWaterMap = function () {
            if (dashWaterMap) return;

            dashWaterMap = L.map('dashWaterMap').setView([6.29445, 101.72362], 14); // ตั้งค่าพิกัดศูนย์กลาง

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(dashWaterMap);

            dashMarkerLayer.addTo(dashWaterMap);
        };

        window.updateDashWaterMapMarkers = function () {
            if (!dashWaterMap || !store.waterLevels) return;

            dashMarkerLayer.clearLayers();

            // ดึงเฉพาะข้อมูลล่าสุดของแต่ละจุด
            const latestData = {};
            store.waterLevels.forEach(r => {
                const loc = r[1];
                const time = new Date(r[0]).getTime();
                if (!latestData[loc] || time > latestData[loc].time) {
                    latestData[loc] = { data: r, time: time };
                }
            });

            // สร้างหมุดทีละจุด
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
                        // ดึงฟังก์ชัน getWaterIcon ตัวเดิมมาใช้งานได้เลย
                        const marker = L.marker([lat, lng], { icon: getWaterIcon(level) });

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

        // ==========================================
        // ระบบจัดการรายงานข้อมูลน้ำท่วม (Flood DATA Dashboard & Leaflet Map)
        // ==========================================

        let floodReportMap = null;
        let floodMarkerLayer = L.layerGroup();
        let showOnlyUnnumbered = false;

        window.initFloodReportMap = function () {
            if (floodReportMap) return;

            // Define base layers
            const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            });

            const esriSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            });

            floodReportMap = L.map('floodReportMap', {
                center: [6.29445, 101.72362],
                zoom: 14,
                layers: [osmLayer] // default layer
            });

            // Base layers object for control
            const baseLayers = {
                "แผนที่ปกติ (OpenStreetMap)": osmLayer,
                "ภาพดาวเทียม (Esri Satellite)": esriSatelliteLayer
            };

            // Overlay layers (like markers)
            const overlays = {
                "ตำแหน่งผู้ประสบภัย": floodMarkerLayer
            };

            // Add Layer Control to Map
            L.control.layers(baseLayers, overlays, { position: 'topright' }).addTo(floodReportMap);

            floodMarkerLayer.addTo(floodReportMap);
        };

        window.toggleUnnumberedFilter = function () {
            showOnlyUnnumbered = !showOnlyUnnumbered;
            const btn = document.getElementById('floodUnnumberedFilterBtn');
            if (showOnlyUnnumbered) {
                btn.className = "px-4 py-3 border border-amber-500 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 shrink-0 bg-amber-50 text-amber-600 hover:bg-amber-100";
            } else {
                btn.className = "px-4 py-3 border border-slate-200 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 shrink-0 bg-slate-50 text-slate-600 hover:bg-slate-100";
            }
            filterFloodMap();
        };

        window.openFullscreenRiskMap = function () {
            const img = document.getElementById('riskMapImg');
            if (!img || img.classList.contains('hidden') || !img.src) return;

            // Create fullscreen overlay with backdrop-blur
            const overlay = document.createElement('div');
            overlay.id = 'riskMapFullscreenOverlay';
            overlay.className = 'fixed inset-0 bg-black/90 backdrop-blur-md z-[9999] flex items-center justify-center cursor-zoom-out opacity-0 transition-opacity duration-300';

            // Image inside overlay
            const fullImg = document.createElement('img');
            fullImg.src = img.src;
            fullImg.className = 'max-w-[95%] max-h-[95%] object-contain rounded-lg shadow-2xl scale-95 transition-transform duration-300';

            // Close button (X)
            const closeBtn = document.createElement('button');
            closeBtn.className = 'absolute top-6 right-6 text-white/70 hover:text-white text-3xl font-bold bg-white/10 hover:bg-white/20 w-12 h-12 rounded-full flex items-center justify-center transition-all';
            closeBtn.innerHTML = '&times;';

            overlay.appendChild(fullImg);
            overlay.appendChild(closeBtn);
            document.body.appendChild(overlay);

            // Animate opening
            setTimeout(() => {
                overlay.classList.remove('opacity-0');
                fullImg.classList.remove('scale-95');
            }, 10);

            const closeOverlay = () => {
                overlay.classList.add('opacity-0');
                fullImg.classList.add('scale-95');
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
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

            // Zoom/center on the leaflet map coordinates
            floodReportMap.setView([lat, lng], 18, { animate: true, duration: 1.5 });

            // Open popup for this marker
            const md = window.floodMarkersMap ? window.floodMarkersMap[name] : null;
            if (md && md.marker) {
                md.marker.openPopup();
            }
        };

        window.filterFloodMap = function () {
            if (!floodReportMap) return;

            floodMarkerLayer.clearLayers();
            window.floodMarkersMap = {}; // Reset markers map references

            const searchVal = document.getElementById('floodSearchInput').value.trim().toLowerCase();
            const riskVal = document.getElementById('floodRiskFilter').value;

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

            const rows = floodData.slice(1);
            let filteredRows = [];

            rows.forEach(r => {
                const name = nameIdx !== -1 ? String(r[nameIdx] || '').trim() : 'ไม่ระบุชื่อ';
                const road = roadIdx !== -1 ? String(r[roadIdx] || '').trim() : '';
                const address = addressIdx !== -1 ? String(r[addressIdx] || '').trim() : 'ไม่ระบุที่อยู่';
                const status = statusIdx !== -1 ? String(r[statusIdx] || '').trim() : '';
                const risk = riskIdx !== -1 ? String(r[riskIdx] || '').trim() : '';
                const houseId = houseIdIdx !== -1 ? String(r[houseIdIdx] || '').trim() : '';
                const residents = residentsIdx !== -1 ? (parseInt(r[residentsIdx]) || 1) : 1;
                const contact = contactIdx !== -1 ? String(r[contactIdx] || '').trim() : '';
                const details = detailsIdx !== -1 ? String(r[detailsIdx] || '').trim() : '';

                let isUnnumbered = false;
                if (status.includes('ไม่มีเลขที่') || status.includes('ไม่มี') || address.includes('ไม่มีเลขที่')) {
                    isUnnumbered = true;
                }

                // Apply filters
                if (showOnlyUnnumbered && !isUnnumbered) return;

                if (riskVal !== 'all') {
                    if (riskVal === 'กลุ่มเปราะบาง' && !(risk.includes('กลุ่มเปราะบาง') || risk.includes('เปราะบาง'))) return;
                    if (riskVal === 'กลุ่มผู้พิการ/ผู้สูงอายุ' && !(risk.includes('ผู้พิการ') || risk.includes('ผู้สูงอายุ') || risk.includes('สูงอายุ') || risk.includes('พิการ'))) return;
                    if (riskVal === 'ปกติ' && !risk.includes('ปกติ')) return;
                }

                if (searchVal) {
                    let cleanSearchVal = searchVal;
                    if (cleanSearchVal.startsWith("ถนน")) {
                        cleanSearchVal = cleanSearchVal.substring(4).trim();
                    } else if (cleanSearchVal.startsWith("ถ.")) {
                        cleanSearchVal = cleanSearchVal.substring(2).trim();
                    }

                    const nameMatch = name.toLowerCase().includes(searchVal);
                    const addressMatch = address.toLowerCase().includes(searchVal);
                    const roadMatch = road.toLowerCase().includes(searchVal) || (cleanSearchVal && road.toLowerCase().includes(cleanSearchVal));
                    const houseIdMatch = houseId.toLowerCase().includes(searchVal);
                    if (!nameMatch && !addressMatch && !roadMatch && !houseIdMatch) return;
                }

                // Collect filtered row
                filteredRows.push({
                    houseId,
                    name,
                    road,
                    address,
                    status,
                    risk,
                    residents,
                    contact,
                    details,
                    isUnnumbered
                });

                // Coordinate matching (separate columns first, fallback to combined)
                let lat = NaN, lng = NaN;
                if (latIdx !== -1 && lngIdx !== -1) {
                    lat = parseFloat(r[latIdx]);
                    lng = parseFloat(r[lngIdx]);
                } else {
                    const possibleCoordCols = [latIdx, lngIdx, addressIdx].filter(idx => idx !== -1);
                    for (let idx of possibleCoordCols) {
                        const val = String(r[idx] || '').trim();
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
                    let markerColor = '#3b82f6'; // default blue (ปกติ)
                    let extraClass = '';
                    let shadowColor = 'rgba(59, 130, 246, 0.4)';
                    let headerBg = 'from-blue-600 to-indigo-500';
                    let headerText = 'text-white';
                    let badgeBg = 'bg-white/20 text-white';

                    if (risk.includes('กลุ่มเปราะบาง') || risk.includes('เปราะบาง')) {
                        markerColor = '#ef4444'; // Red
                        extraClass = 'critical-pulse';
                        shadowColor = 'rgba(239, 68, 68, 0.5)';
                        headerBg = 'from-red-600 to-rose-500';
                        badgeBg = 'bg-red-950/30 text-red-100';
                    } else if (risk.includes('ผู้พิการ') || risk.includes('ผู้สูงอายุ') || risk.includes('สูงอายุ') || risk.includes('พิการ')) {
                        markerColor = '#facc15'; // Yellow
                        shadowColor = 'rgba(250, 204, 21, 0.4)';
                        headerBg = 'from-yellow-400 to-amber-400';
                        headerText = 'text-slate-800';
                        badgeBg = 'bg-yellow-950/10 text-slate-800';
                    }

                    const markerIcon = L.divIcon({
                        className: 'custom-flood-marker',
                        html: `<div class="${extraClass}" style="
                            background-color: ${markerColor}; 
                            width: 16px; 
                            height: 16px; 
                            border-radius: 50%; 
                            border: 2px solid white; 
                            box-shadow: 0 0 0 3px ${shadowColor}, 0 2px 8px rgba(0,0,0,0.15);
                        "></div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    });

                    const marker = L.marker([lat, lng], { icon: markerIcon });

                    const popupContent = `
                        <div class="font-sans text-slate-700 min-w-[240px] rounded-2xl overflow-hidden shadow-lg border border-slate-100 bg-white">
                            <!-- Header with dynamic risk color -->
                            <div class="px-4 py-2.5 flex justify-between items-center bg-gradient-to-r ${headerBg} ${headerText}">
                                <span class="text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-1.5">
                                    <i class="fas fa-home"></i> ข้อมูลครัวเรือน
                                </span>
                                <span class="text-[9px] font-black px-2.5 py-0.5 rounded-full ${badgeBg} shadow-sm border border-white/10">
                                    ${risk || 'ไม่ระบุความเสี่ยง'}
                                </span>
                            </div>
                            
                            <!-- Body Content -->
                            <div class="p-4 space-y-3">
                                <!-- ชื่อ-สกุล -->
                                <div>
                                    <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider block">ชื่อ-สกุลผู้ประสบภัย</span>
                                    <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                                        <i class="far fa-user text-blue-500 shrink-0"></i> ${name}
                                    </span>
                                </div>
                                
                                <!-- ที่อยู่ / ถนน -->
                                <div>
                                    <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider block">ที่อยู่ / ถนน</span>
                                    <span class="text-[11px] font-medium text-slate-600 flex items-start gap-1.5 mt-0.5 leading-normal">
                                        <i class="fas fa-map-marker-alt text-rose-500 shrink-0 mt-0.5"></i> 
                                        <span>${address}${road ? ' ถ.' + road : ''}</span>
                                    </span>
                                </div>

                                <!-- รายละเอียดเพิ่มเติม (ถ้ามี) -->
                                ${details ? `
                                <div class="pt-2 border-t border-slate-50">
                                    <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider block">รายละเอียด</span>
                                    <span class="text-[10px] text-slate-500 flex items-start gap-1.5 mt-0.5 leading-tight">
                                        <i class="fas fa-info-circle text-indigo-400 shrink-0 mt-0.5"></i>
                                        <span>${details}</span>
                                    </span>
                                </div>
                                ` : ''}
                                
                                <!-- สถิติตัวเลขและเบอร์โทรติดต่อด้านล่าง -->
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
                            </div>
                        </div>
                    `;

                    marker.bindPopup(popupContent);
                    floodMarkerLayer.addLayer(marker);

                    // Store marker data for zooming / popup trigger
                    window.floodMarkersMap[name] = { marker, lat, lng, address, road };
                }
            });

            // Populate the filtered victims list table
            let tableHtml = '';
            filteredRows.forEach(row => {
                let riskBadgeColor = 'bg-blue-100 text-blue-600';
                if (row.risk.includes('กลุ่มเปราะบาง') || row.risk.includes('เปราะบาง')) {
                    riskBadgeColor = 'bg-red-100 text-red-600';
                } else if (row.risk.includes('ผู้พิการ') || row.risk.includes('ผู้สูงอายุ') || row.risk.includes('สูงอายุ') || row.risk.includes('พิการ')) {
                    riskBadgeColor = 'bg-yellow-100 text-yellow-700';
                }

                const fullAddress = `${row.address}${row.road ? ' ถ.' + row.road : ''}`;

                // Add zoom click handler if coordinates exist for this resident
                const markerData = window.floodMarkersMap ? window.floodMarkersMap[row.name] : null;
                const clickAttr = markerData ? `onclick="zoomToFloodMarker('${row.name.replace(/'/g, "\\'")}', ${markerData.lat}, ${markerData.lng})"` : '';
                const cursorClass = markerData ? 'cursor-pointer hover:text-blue-600 transition-colors' : '';

                tableHtml += `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="p-4 whitespace-nowrap font-bold text-slate-800 ${cursorClass}" ${clickAttr}>
                            ${markerData ? `<i class="fas fa-search-location text-[10px] mr-1.5 text-blue-500"></i>` : ''}${row.name}
                        </td>
                        <td class="p-4 whitespace-nowrap text-slate-700">${fullAddress}</td>
                        <td class="p-4 whitespace-nowrap text-center">
                            <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${riskBadgeColor}">${row.risk || 'ปกติ'}</span>
                        </td>
                        <td class="p-4 whitespace-nowrap text-center font-sans font-bold text-slate-600">${row.residents} คน</td>
                    </tr>
                `;
            });

            document.getElementById('floodTableBody').innerHTML = tableHtml || `
                <tr>
                    <td colspan="4" class="p-8 text-center text-slate-400 font-bold whitespace-nowrap">
                        <i class="fas fa-inbox text-2xl mb-2 block"></i>ไม่พบข้อมูลผู้ประสบภัยที่ตรงตามเงื่อนไข
                    </td>
                </tr>
            `;

            document.getElementById('floodTableCount').innerText = `${filteredRows.length} ครัวเรือน`;
        };

        window.renderFloodReportDashboard = function () {
            let totalHouseholds = 0;
            let totalPopulation = 0;
            let totalNoHouseNumber = 0;
            let totalVulnerable = 0;
            let totalElderlyDisabled = 0;

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

            const rows = floodData.slice(1);

            // Build Suggestions Autocomplete Corpus
            const suggestionsSet = new Set();

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

                // Calculate statistics cards based strictly on the "ความเสี่ยง" column
                const riskStr = riskIdx !== -1 ? String(r[riskIdx] || '').trim() : '';

                let isVuln = false;
                let isElderlyDisabled = false;
                if (riskStr.includes('กลุ่มเปราะบาง') || riskStr.includes('เปราะบาง')) {
                    isVuln = true;
                } else if (riskStr.includes('ผู้พิการ') || riskStr.includes('ผู้สูงอายุ') || riskStr.includes('สูงอายุ') || riskStr.includes('พิการ')) {
                    isElderlyDisabled = true;
                }

                if (isVuln) totalVulnerable++;
                if (isElderlyDisabled) totalElderlyDisabled++;

                // Add to autocomplete list
                const nameVal = nameIdx !== -1 ? String(r[nameIdx] || '').trim() : '';
                const roadVal = roadIdx !== -1 ? String(r[roadIdx] || '').trim() : '';
                const addressVal = addressIdx !== -1 ? String(r[addressIdx] || '').trim() : '';
                const houseIdVal = houseIdIdx !== -1 ? String(r[houseIdIdx] || '').trim() : '';

                if (nameVal) suggestionsSet.add(nameVal);
                if (addressVal) suggestionsSet.add(addressVal);
                if (roadVal) suggestionsSet.add(roadVal);
                if (houseIdVal) suggestionsSet.add(houseIdVal);
            });

            window.floodSuggestionsList = Array.from(suggestionsSet);

            document.getElementById('flood_statHouseholds').innerText = totalHouseholds.toLocaleString();
            document.getElementById('flood_statPopulation').innerText = totalPopulation.toLocaleString();
            document.getElementById('flood_statNoHouseNumber').innerText = totalNoHouseNumber.toLocaleString();
            document.getElementById('flood_statVulnerable').innerText = totalVulnerable.toLocaleString();
            document.getElementById('flood_statElderlyDisabled').innerText = totalElderlyDisabled.toLocaleString();

            // Risk map image display
            const img = document.getElementById('riskMapImg');
            const placeholder = document.getElementById('riskMapPlaceholder');
            let mapUrl = store.riskMapImageUrl || '';
            if (mapUrl.includes('drive.google.com/uc') || mapUrl.includes('docs.google.com/uc')) {
                const match = mapUrl.match(/[?&]id=([^&]+)/);
                if (match && match[1]) {
                    mapUrl = 'https://lh3.googleusercontent.com/d/' + match[1];
                }
            }

            if (mapUrl) {
                img.src = mapUrl;
                img.classList.remove('hidden');
                placeholder.classList.add('hidden');
            } else {
                img.classList.add('hidden');
                placeholder.classList.remove('hidden');
            }

            // Show uploader only to admin
            const uploadEl = document.getElementById('riskMapAdminUpload');
            if (userRole === 'admin') {
                uploadEl.classList.remove('hidden');
            } else {
                uploadEl.classList.add('hidden');
            }

            filterFloodMap();
        };

        window.handleFloodSearchInput = function (val) {
            filterFloodMap(); // filter map and table contents

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
                handleFloodSearchInput(input.value);
            }
        };

        window.selectFloodSuggestion = function (val) {
            const input = document.getElementById('floodSearchInput');
            if (input) {
                input.value = val;
            }
            const suggestions = document.getElementById('floodSearchSuggestions');
            if (suggestions) {
                suggestions.classList.add('hidden');
            }
            filterFloodMap();

            // Zoom to marker if matching name, address, or road
            if (window.floodMarkersMap) {
                const cleanVal = val.toLowerCase().trim();

                // 1. Direct match by resident name
                if (window.floodMarkersMap[val]) {
                    const md = window.floodMarkersMap[val];
                    zoomToFloodMarker(val, md.lat, md.lng);
                    return;
                }

                // 2. Match by address or road
                for (const name in window.floodMarkersMap) {
                    const md = window.floodMarkersMap[name];
                    if (md.address.toLowerCase().trim() === cleanVal || md.road.toLowerCase().trim() === cleanVal) {
                        zoomToFloodMarker(name, md.lat, md.lng);
                        break;
                    }
                }
            }
        };

        // Close search recommendations when clicking outside
        document.addEventListener('click', function (e) {
            const wrapper = document.getElementById('floodSearchWrapper');
            const suggestions = document.getElementById('floodSearchSuggestions');
            if (wrapper && suggestions && !wrapper.contains(e.target)) {
                suggestions.classList.add('hidden');
            }
        });

        window.uploadRiskMapImage = async function (event) {
            const file = event.target.files[0];
            if (!file) return;

            const btn = document.getElementById('uploadRiskMapBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = `<i class="fas fa-spinner animate-spin"></i> กำลังอัปโหลด...`;
            btn.disabled = true;

            try {
                const reader = new FileReader();
                reader.onload = async function () {
                    const base64Data = reader.result;
                    store.riskMapImageUrl = base64Data;
                    try {
                        localStorage.setItem('risk_map_image_url', base64Data);
                    } catch (e) {
                        console.warn("localStorage quota exceeded for risk map image", e);
                    }
                    document.getElementById('riskMapImg').src = base64Data;
                    document.getElementById('riskMapImg').classList.remove('hidden');
                    document.getElementById('riskMapPlaceholder').classList.add('hidden');

                    Swal.fire({
                        title: 'อัปโหลดสำเร็จ',
                        text: 'อัปโหลดรูปภาพแผนที่พื้นที่เสี่ยงภัยเรียบร้อยแล้ว',
                        icon: 'success',
                        customClass: { popup: 'rounded-[2rem]' }
                    });
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                };
                reader.readAsDataURL(file);
            } catch (err) {
                console.error(err);
                Swal.fire('เกิดข้อผิดพลาด', 'เกิดปัญหาขณะอัปโหลดไฟล์', 'error');
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        };
        //-------------------------------------------//
        //--ฟังก์ชันด่านหน้าสำหรับเลือกสถานะ Safety Check--//
        //-------------------------------------------//

        window.promptSafetyCheck = function () {
            Swal.fire({
                title: '<div class="text-2xl font-black text-slate-800">รายงานสถานะปัจจุบัน</div>',
                html: `
            <p class="text-sm text-slate-500 mb-6">กรุณาเลือกสถานะของคุณ หรือผู้ประสบภัย</p>
            <div class="space-y-3 px-2">
                <!-- 🟢 ปุ่มปลอดภัย (เปลี่ยนไอคอนเป็น fa-check-circle) -->
                <button onclick="Swal.close(); setTimeout(() => openEvacReportModal('ปลอดภัย'), 300)" 
                        class="w-full flex items-center p-4 bg-emerald-50 border-2 border-emerald-200 rounded-2xl hover:bg-emerald-100 hover:border-emerald-400 transition-all active:scale-95 group text-left shadow-sm">
                    <div class="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-sm mr-4 shrink-0">
                        <i class="fas fa-check-circle"></i> 
                    </div>
                    <div>
                        <div class="text-lg font-bold text-emerald-700">ปลอดภัย (Safe)</div>
                        <div class="text-xs text-emerald-600/80 font-medium">น้ำไม่ท่วม / อาศัยอยู่ชั้นบนได้ / ยังรับมือไหว</div>
                    </div>
                </button>
                
                <!-- 🟠 ปุ่มอพยพ -->
                <button onclick="Swal.close(); setTimeout(() => openEvacReportModal('อพยพ'), 300)" 
                        class="w-full flex items-center p-4 bg-orange-50 border-2 border-orange-200 rounded-2xl hover:bg-orange-100 hover:border-orange-400 transition-all active:scale-95 group text-left shadow-sm">
                    <div class="w-14 h-14 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-sm mr-4 shrink-0">
                        <i class="fas fa-person-running"></i>
                    </div>
                    <div>
                        <div class="text-lg font-bold text-orange-700">อพยพ (Evacuate)</div>
                        <div class="text-xs text-orange-600/80 font-medium">ย้ายออก / น้ำท่วมสูง / ต้องการความช่วยเหลือ</div>
                    </div>
                </button>
            </div>
        `,
                showConfirmButton: false,
                showCancelButton: true,
                cancelButtonText: 'ยกเลิก',
                customClass: {
                    popup: 'rounded-[2.5rem] pb-6',
                    cancelButton: 'w-full py-3 mt-4 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 font-bold max-w-[200px] transition-colors',
                }
            });
        };
        // 🌟 2. อัปเดตฟังก์ชันฟอร์ม: ให้รับพารามิเตอร์ status
        window.openEvacReportModal = function (status = 'อพยพ') {
            window.evacAddressList = (typeof getEvacAddressList === 'function') ? getEvacAddressList() : [];

            const shelters = ["ศูนย์เทศบาลตำบลตันหยงมัส/บาลูกา", "ศูนย์มัสยิดตันหยงมัส", "ศูนย์โรงเรียนบ้านเขาพระ"];
            const shelterOptions = shelters.map(s => `<option value="${s}">${s}</option>`).join('');

            const isSafe = (status === 'ปลอดภัย');
            const titleColor = isSafe ? 'text-emerald-600' : 'text-orange-600';
            // 🌟 เปลี่ยนไอคอนที่หัวข้อตรงนี้เป็น fa-check-circle ด้วยครับ
            const titleIcon = isSafe ? 'fa-check-circle' : 'fa-bullhorn';
            const titleText = isSafe ? 'รายงานสถานะ: ปลอดภัย' : 'รายงานสถานะ: อพยพ';
            const btnColor = isSafe ? '#10b981' : '#f97316';

            const destSectionHtml = isSafe ? '' : `
        <div id="evac_dest_wrapper">
            <div>
                <label class="text-[11px] font-bold text-slate-500 ml-1">อพยพไปที่ใด?</label>
                <div class="flex gap-2 mt-1">
                    <button onclick="toggleEvacDest('ศูนย์')" id="btn_dest_center" class="flex-1 py-3 rounded-xl border-2 border-orange-400 bg-orange-50 text-orange-600 font-bold text-xs transition-all">ศูนย์พักพิง</button>
                    <button onclick="toggleEvacDest('ที่อื่น')" id="btn_dest_other" class="flex-1 py-3 rounded-xl border-2 border-transparent bg-slate-50 text-slate-500 font-bold text-xs transition-all">ที่อื่น ๆ</button>
                </div>
            </div>
            
            <div id="box_dest_center" class="animate-fade-in mt-3">
                <label class="text-[11px] font-bold text-slate-500 ml-1">เลือกศูนย์พักพิง</label>
                <select id="swal_evac_shelter" class="w-full p-3 border border-slate-200 bg-white rounded-xl outline-none text-sm focus:border-orange-400">
                    ${shelterOptions}
                </select>
            </div>
            <div id="box_dest_other" class="hidden animate-fade-in mt-3">
                <label class="text-[11px] font-bold text-slate-500 ml-1">ระบุสถานที่อพยพ (คร่าวๆ)</label>
                <input type="text" id="swal_evac_other_text" class="w-full p-3 border border-slate-200 bg-white rounded-xl outline-none text-sm focus:border-orange-400" placeholder="เช่น บ้านญาติ, ตึกแถวชั้น 2">
            </div>
            <input type="hidden" id="swal_evac_type" value="ศูนย์">
        </div>
    `;

            Swal.fire({
                title: `<div class="flex items-center justify-center gap-2 ${titleColor} text-lg font-black"><i class="fas ${titleIcon}"></i> ${titleText}</div>`,
                html: `
            <div class="text-left space-y-4 p-2 mt-2" style="overflow: visible;">
                <input type="hidden" id="swal_evac_status" value="${status}">

                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">ชื่อ-สกุล (หัวหน้าครอบครัว/ผู้อพยพ)</label>
                    <input type="text" id="swal_evac_name" class="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-50 transition-all" placeholder="ระบุชื่อ-สกุล..." required>
                </div>

                <div class="relative">
                    <label class="text-[11px] font-bold text-slate-500 ml-1">ค้นหาที่อยู่ / ชุมชน</label>
                    <input type="text" id="swal_evac_addr_search" onkeyup="handleEvacAddressSearch(this.value)" autocomplete="off" class="w-full p-3 border border-orange-100 bg-orange-50 rounded-xl outline-none text-sm focus:ring-2 focus:ring-orange-300" placeholder="พิมพ์เพื่อค้นหาที่อยู่เดิม...">
                    <div id="swal_evac_addr_results" class="absolute z-[99] w-full bg-white border border-slate-200 rounded-xl shadow-2xl hidden max-h-40 overflow-y-auto mt-1"></div>
                    
                    <div class="mt-3 flex items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <input type="checkbox" id="swal_evac_is_other" onchange="toggleEvacOtherAddress(this.checked)" class="w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-500">
                        <label for="swal_evac_is_other" class="ml-2 text-xs font-bold text-slate-600">ระบุที่อยู่อื่นๆ (ดึงพิกัดปัจจุบันอัตโนมัติ)</label>
                    </div>
                </div>

                <div id="box_evac_other_addr" class="hidden animate-fade-in bg-slate-100 p-3 rounded-xl border border-slate-200 shadow-inner">
                    <label class="text-[11px] font-bold text-slate-500 ml-1">พิมพ์ที่อยู่อื่นๆ ที่ไม่ได้อยู่ในระบบ</label>
                    <input type="text" id="swal_evac_custom_addr" class="w-full p-3 border border-slate-200 bg-white rounded-xl outline-none text-sm focus:border-orange-400 mb-3" placeholder="ระบุบ้านเลขที่/ซอย/จุดสังเกต">
                    
                    <label class="text-[11px] font-bold text-slate-500 ml-1">พิกัด GPS (ดึงอัตโนมัติ)</label>
                    <div class="flex gap-2">
                        <input type="text" id="swal_evac_coords" readonly class="w-full p-3 border border-slate-200 bg-white text-slate-500 rounded-xl outline-none text-[10px]" placeholder="รอการดึงพิกัด...">
                        <button type="button" onclick="getEvacLocation()" class="bg-blue-100 text-blue-600 px-4 rounded-xl hover:bg-blue-200 transition shadow-sm active:scale-95">
                            <i class="fas fa-map-marker-alt"></i>
                        </button>
                    </div>
                </div>

                <div>
                    <label class="text-[11px] font-bold text-slate-500 ml-1">จำนวนคนที่อยู่ด้วยกัน (คน)</label>
                    <input type="number" id="swal_evac_count" min="1" class="w-full p-3 border border-orange-100 bg-orange-50 rounded-xl outline-none text-sm focus:ring-2 focus:ring-orange-300" placeholder="ระบุจำนวนคน">
                </div>

                ${destSectionHtml}

                <div class="mt-4">
                    <label class="text-[11px] font-bold text-slate-500 ml-1">รายละเอียดเพิ่มเติม / ความช่วยเหลือที่ต้องการ</label>
                    <textarea id="swal_evac_note" rows="2" class="w-full p-3 border border-slate-200 bg-white rounded-xl outline-none text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-50 placeholder-slate-300" placeholder="เช่น ต้องการน้ำดื่ม, ยารักษาโรค, ต้องการเรือเข้ามารับ..."></textarea>
                </div>
                
            </div>
        `,
                showCancelButton: true,
                confirmButtonText: 'บันทึกรายงาน',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: btnColor,
                customClass: { popup: 'rounded-[2rem]' },
                didOpen: () => {
                    const content = Swal.getHtmlContainer();
                    if (content) content.style.overflow = 'visible';
                },
                preConfirm: () => {
                    const evacName = document.getElementById('swal_evac_name').value.trim();
                    const isOtherAddr = document.getElementById('swal_evac_is_other').checked;
                    let address = document.getElementById('swal_evac_addr_search').value.trim();
                    let coords = '';
                    const currentStatus = document.getElementById('swal_evac_status').value;
                    const note = document.getElementById('swal_evac_note').value.trim();

                    if (!evacName) { Swal.showValidationMessage('กรุณาระบุชื่อ-สกุล'); return false; }

                    if (isOtherAddr) {
                        address = document.getElementById('swal_evac_custom_addr').value.trim();
                        coords = document.getElementById('swal_evac_coords').value;
                        if (!address || !coords || coords.includes('กำลัง') || coords.includes('กรุณา')) {
                            Swal.showValidationMessage('กรุณาระบุที่อยู่อื่นๆ และตรวจสอบพิกัด GPS'); return false;
                        }
                    } else if (!address) {
                        Swal.showValidationMessage('กรุณาค้นหาและเลือกที่อยู่ หรือติ๊กเพื่อระบุที่อยู่อื่น'); return false;
                    }

                    const count = document.getElementById('swal_evac_count').value;
                    if (!count) { Swal.showValidationMessage('กรุณาระบุจำนวนคน'); return false; }

                    let type = '-';
                    let dest = '-';

                    if (currentStatus === 'อพยพ') {
                        type = document.getElementById('swal_evac_type').value;
                        dest = (type === 'ศูนย์') ? document.getElementById('swal_evac_shelter').value : document.getElementById('swal_evac_other_text').value;
                        if (!dest) { Swal.showValidationMessage('กรุณาระบุปลายทางที่อพยพไป'); return false; }
                    }

                    return { evacName, address, count, type, dest, coords, status: currentStatus, note };
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    saveEvacuationData(result.value);
                }
            });
        };

        // ฟังก์ชันเปิดฟอร์มรายงาน (อัปเดตจากของเดิมของคุณ)
        function openEvacuationForm(status) {
            // 1. เก็บค่าสถานะไว้ใน Hidden Input ที่เราจะสร้างไว้ในฟอร์ม
            document.getElementById('evac_status').value = status;

            // 2. ปรับหน้าตาฟอร์ม: ถ้า "ปลอดภัย" ไม่ต้องแสดงช่องกรอก "ศูนย์พักพิงปลายทาง"
            const destWrapper = document.getElementById('evac_dest_wrapper');
            const statusDisplay = document.getElementById('evac_status_display');

            if (status === 'ปลอดภัย') {
                if (destWrapper) destWrapper.classList.add('hidden'); // ซ่อนจุดหมายปลายทาง
                if (statusDisplay) statusDisplay.innerHTML = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-shield-check mr-1"></i> รายงานสถานะ: ปลอดภัย</span>';
            } else {
                if (destWrapper) destWrapper.classList.remove('hidden'); // แสดงจุดหมายปลายทาง
                if (statusDisplay) statusDisplay.innerHTML = '<span class="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-person-running mr-1"></i> รายงานสถานะ: อพยพ</span>';
            }

            // 3. สั่งเปิด Modal ฟอร์มรายงานอพยพของคุณตามปกติ
            document.getElementById('evacuationModal').classList.remove('hidden');
        }
        window.showQRCode = function () {
            // 🌟 ใช้ URL หลักของ GitHub Pages แทน API_URL
            const publicUrl = "https://tanyongmas.github.io/Dashboard_Flood/?mode=report";

            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(publicUrl)}`;

            Swal.fire({
                title: '<div class="text-indigo-700 font-black"><i class="fas fa-qrcode mr-2"></i> QR Code ประชาชน</div>',
                html: `
            <p class="text-xs text-slate-500 mb-4">สแกนเพื่อรายงานสถานะน้ำท่วม (ไม่ต้องล็อคอิน)</p>
            <div class="flex justify-center mb-4">
                <div class="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <img src="${qrImageUrl}" class="w-48 h-48" alt="QR Code" onerror="this.src='https://placehold.co/300x300?text=QR+Error'">
                </div>
            </div>
            <div class="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">ลิงก์สำหรับส่งในไลน์กลุ่ม / Facebook</label>
                <input type="text" readonly value="${publicUrl}" class="w-full p-2 text-[10px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg text-center outline-none focus:border-indigo-400" onclick="this.select()">
            </div>
        `,
                confirmButtonText: 'ปิดหน้าต่าง',
                confirmButtonColor: '#4f46e5',
                customClass: { popup: 'rounded-[2rem]' }
            });
        };
        //-------------------------------------------//
        //----------ฟังก์ชันโหลดข้อมูลจาก RID------------//
        //-------------------------------------------//

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
                        // คำนวณระดับน้ำสัมพัทธ์ของสถานีต้นน้ำ X.73A สำหรับแสดงผลเรียลไทม์
                        const relX73 = parseFloat(result.data.level);
                        levelX73a = isNaN(relX73) ? 24.50 : parseFloat((relX73 + 11.20).toFixed(2));
                    }

                    if (levelX73aEl) levelX73aEl.innerText = levelX73a.toFixed(2);
                    if (timeX73aEl) timeX73aEl.innerText = timeX73a + (result.isStaleFallback ? ' (แคช)' : '');

                    if (levelX73a >= 26.80) {
                        // 🔴 ระดับวิกฤต / น้ำล้นตลิ่ง (>= 26.80)
                        if (statusX73aEl) { statusX73aEl.innerText = 'วิกฤต / น้ำล้นตลิ่ง'; statusX73aEl.className = 'text-[10px] md:text-xs font-bold text-red-600'; }
                        if (dotX73aEl) dotX73aEl.className = 'w-1.5 h-1.5 rounded-full bg-red-500 animate-ping';
                        if (levelX73aEl) levelX73aEl.className = 'text-2xl md:text-3xl font-black text-red-600 tracking-tight';
                        if (cardX73aEl) cardX73aEl.className = 'h-[120px] w-full flex items-center justify-between bg-red-50/80 rounded-2xl p-4 md:p-5 shadow-sm border border-red-200 relative overflow-hidden transition-all hover:shadow-md';
                        if (sidebarX73a) sidebarX73a.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-red-400 to-red-600';
                        if (iconX73aBg) iconX73aBg.className = 'w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-red-500 to-red-600 text-white rounded-[1rem] flex items-center justify-center text-2xl md:text-3xl shrink-0 shadow-lg shadow-red-500/40 animate-pulse';
                    } else if (levelX73a >= 25.80) {
                        // 🟡 ระดับเตือนภัย / เตรียมพร้อม (25.80 - 26.79)
                        if (statusX73aEl) { statusX73aEl.innerText = 'เตือนภัย / เตรียมพร้อม'; statusX73aEl.className = 'text-[10px] md:text-xs font-bold text-amber-600'; }
                        if (dotX73aEl) dotX73aEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse';
                        if (levelX73aEl) levelX73aEl.className = 'text-2xl md:text-3xl font-black text-amber-600 tracking-tight';
                        if (cardX73aEl) cardX73aEl.className = 'h-[120px] w-full flex items-center justify-between bg-amber-50/50 rounded-2xl p-4 md:p-5 shadow-sm border border-amber-200 relative overflow-hidden transition-all hover:shadow-md';
                        if (sidebarX73a) sidebarX73a.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-400 to-orange-500';
                        if (iconX73aBg) iconX73aBg.className = 'w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-[1rem] flex items-center justify-center text-2xl md:text-3xl shrink-0 shadow-md';
                    } else {
                        // 🟢 ระดับปกติ (< 25.79)
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


        //-------------------------------------------//
        //----------ฟังก์ชันโหลดข้อมูลพยากรณ์อากาศ---------//
        //-------------------------------------------//

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
                        // 🛠️ ระบบแปลงไอคอนอัตโนมัติ (แก้ปัญหากล่องสี่เหลี่ยม)
                        // ========================================================
                        let iconClass = "fa-solid fa-cloud-sun text-sky-400"; // ไอคอนเริ่มต้นกรณีไม่ตรงเงื่อนไขใดๆ
                        const desc = f.desc || "";
                        const apiIcon = f.icon || "";

                        // 1. ตรวจสอบและจับคู่จากคำอธิบายภาษาไทย (แม่นยำที่สุดสำหรับข้อความจากกรมอุตุฯ)
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
                        }
                        // 2. กรณีคำอธิบายไทยไม่ตรง ให้เช็ค fallback จากตัวแปร f.icon ของ API ย้อนหลัง
                        else if (apiIcon.includes("sun") || apiIcon.includes("clear")) {
                            iconClass = "fa-solid fa-sun text-amber-500";
                        } else if (apiIcon.includes("rain")) {
                            iconClass = "fa-solid fa-cloud-rain text-sky-400";
                        } else if (apiIcon.includes("cloud")) {
                            iconClass = "fa-solid fa-cloud text-slate-400";
                        } else if (apiIcon.startsWith("fa-")) {
                            iconClass = `fa-solid ${apiIcon} text-blue-500`; // แก้ไขกรณีมีชื่อไอคอนแต่ขาดคลาสหลัก fa-solid
                        }
                        // ========================================================

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

        //-------------------------------------------//
        //----------Messaging API logic--------------//
        //-------------------------------------------//
        async function sendMessagingAPI(type) {
            const config = {
                normal: {
                    title: 'สถานะ: ปกติ',
                    text: 'ยืนยันแจ้งสถานการณ์ปกติ?',
                    // 💡 ห่อไอคอนด้วย div วงกลม ขนาด w-16 h-16 (เล็กลงและพอดี)
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
                    // 💡 เคลียร์ค่าเริ่มต้นของ SweetAlert เพื่อให้วงกลมของเราแสดงผลได้สมบูรณ์
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