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
    polygon: null,
    road: null
};

let dashLayerStates = {
    water: true,
    shelter: true,
    relief: true,
    evac: true,
    flood: true,
    polygon: true,
    road: true
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
                // 🟢 โหมดประชาชน (Clean Minimal Citizen Portal) 🟢
                // ==========================================
                currentUser = "ประชาชน (สแกน QR)";
                userRole = "public";

                // ลบหน้า Login และหน้าเจ้าหน้าที่ออกจาก DOM เพื่อความปลอดภัยและประหยัดแรม
                const loginPage = document.getElementById('loginPage');
                if (loginPage) loginPage.remove();

                const mainApp = document.getElementById('mainApp');
                if (mainApp) mainApp.remove();

                // ปรับสไตล์พื้นหลังเป็น Clean Minimal สว่าง สะอาดตา นุ่มนวล
                document.body.className = "bg-slate-50 text-slate-700 min-h-screen font-prompt antialiased selection:bg-blue-100 selection:text-blue-700";

                // โหลดข้อมูลแบบขนาน (Parallel Fetching) เพื่อนำมารายงานระดับน้ำ แผนที่ และสภาพอากาศ
                try {
                    await Promise.allSettled([
                        loadData(),
                        typeof loadRIDWaterLevel === 'function' ? loadRIDWaterLevel() : Promise.resolve(),
                        typeof loadWeatherForecast === 'function' ? loadWeatherForecast() : Promise.resolve()
                    ]);
                } catch (e) {
                    console.warn("Public mode data fetch warning:", e);
                }

                // เรียกฟังก์ชันเรนเดอร์ Clean Minimal Citizen Portal
                if (typeof renderPublicPortal === 'function') {
                    renderPublicPortal();
                }

                return; // 🌟 จบการทำงานโหมดประชาชน
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
                    if (userRole === 'superadmin' || userRole === 'admin') targetPage = 'dashboard';
                    else if (userRole === 'shelter') targetPage = 'shelter';
                    else if (userRole === 'water_staff') targetPage = 'addWater';
                    else if (userRole === 'relief') targetPage = 'relief';
                    else if (userRole === 'community') targetPage = 'water';
                    else if (userRole === 'flood_report') targetPage = 'looker';

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

        // กำหนดว่าแต่ละสิทธิ์เข้าหน้าไหนได้บ้าง
        const PAGE_ACCESS = {
            'superadmin': ['dashboard', 'water', 'addWater', 'shelter', 'evacuation', 'regis', 'relief', 'looker', 'userManagement'],
            'admin': ['dashboard', 'water', 'addWater', 'shelter', 'evacuation', 'regis', 'relief', 'looker'],
            'shelter': ['shelter', 'regis', 'looker'],
            'water_staff': ['water', 'addWater', 'looker'],
            'relief': ['relief', 'looker'],
            'community': ['water', 'addWater', 'evacuation', 'looker'],
            'flood_report': ['looker']
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
                looker: 'รายงานข้อมูลน้ำท่วม',
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
                if (typeof renderAdminRoadClosuresList === 'function') renderAdminRoadClosuresList();
                [100, 300, 500, 800].forEach(delay => {
                    setTimeout(() => {
                        if (window.dashOneMap && typeof window.dashOneMap.invalidateSize === 'function') {
                            window.dashOneMap.invalidateSize();
                        }
                    }, delay);
                });
            }
            if (pageId === 'userManagement' && userRole === 'superadmin') loadUsers();

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

                // ⚡ เข้าสู่ระบบผ่าน Supabase 100% (รอให้สคริปต์โหลดเสร็จสมบูรณ์)
                if (typeof sbLogin !== 'function') {
                    for (let i = 0; i < 20; i++) {
                        await new Promise(r => setTimeout(r, 100));
                        if (typeof sbLogin === 'function') break;
                    }
                }

                if (typeof sbLogin === 'function') {
                    data = await sbLogin(user);
                } else {
                    throw new Error('Supabase Service ไม่พร้อมทำงาน กรุณารีเฟรชหน้าเว็บอีกครั้ง');
                }

                if (data && data.success) {
                    const detectedRole = (data.role || '').toLowerCase().trim();
                    const isSuperAdmin = detectedRole === 'superadmin' || user.toLowerCase() === 'superadmin';

                    // 🛡️ หากเป็นสิทธิ์ superadmin ให้ถามรหัสผ่านยืนยันตัวตนเพิ่มเติม
                    if (isSuperAdmin) {
                        btn.innerText = 'รอการยืนยันรหัสผ่าน...';
                        const { value: adminPassword, isConfirmed } = await Swal.fire({
                            title: '<div class="text-blue-900 font-black text-lg flex items-center justify-center gap-2"><i class="fas fa-user-shield text-blue-600"></i> ยืนยันรหัสผ่าน Superadmin</div>',
                            html: `
                                <p class="text-xs text-slate-500 mb-3">บัญชี <b>${user}</b> ได้รับสิทธิ์ผู้ดูแลระบบสูงสุด (Superadmin)<br>กรุณาระบุรหัสผ่านเพื่อเข้าใช้งาน</p>
                                <div class="relative text-left mb-2">
                                    <input id="swal_admin_password_input" type="password" placeholder="ระบุรหัสผ่าน Superadmin" maxlength="30"
                                        class="w-full p-3.5 pr-11 text-center font-bold text-slate-700 border border-blue-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50 text-base">
                                    <button type="button" onclick="const p=document.getElementById('swal_admin_password_input'); const i=this.querySelector('i'); if(p.type==='password'){p.type='text'; i.className='fas fa-eye-slash text-slate-500';}else{p.type='password'; i.className='fas fa-eye text-slate-400';}" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                </div>
                            `,
                            focusConfirm: false,
                            showCancelButton: true,
                            confirmButtonText: '<i class="fas fa-sign-in-alt mr-1"></i> ยืนยันและเข้าสู่ระบบ',
                            cancelButtonText: 'ยกเลิก',
                            confirmButtonColor: '#2563eb',
                            cancelButtonColor: '#94a3b8',
                            customClass: { popup: 'rounded-[2rem] max-w-sm' },
                            didOpen: () => {
                                const input = document.getElementById('swal_admin_password_input');
                                if (input) {
                                    input.focus();
                                    input.addEventListener('keydown', (e) => {
                                        if (e.key === 'Enter') Swal.clickConfirm();
                                    });
                                }
                            },
                            preConfirm: () => {
                                const pw = document.getElementById('swal_admin_password_input').value.trim();
                                if (!pw) {
                                    Swal.showValidationMessage('กรุณาระบุรหัสผ่าน Superadmin');
                                    return false;
                                }
                                return pw;
                            }
                        });

                        if (!isConfirmed || !adminPassword) {
                            btn.innerText = 'เข้าสู่ระบบ';
                            btn.disabled = false;
                            return;
                        }

                        const isValid = typeof sbVerifyAdminPassword === 'function'
                            ? await sbVerifyAdminPassword(adminPassword)
                            : (adminPassword === '1122');

                        if (!isValid) {
                            Swal.fire({
                                icon: 'error',
                                title: 'รหัสผ่านไม่ถูกต้อง',
                                text: 'รหัสผ่านสำหรับผู้ดูแลระบบสูงสุด (Superadmin) ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
                                confirmButtonColor: '#ef4444',
                                customClass: { popup: 'rounded-2xl' }
                            });
                            btn.innerText = 'เข้าสู่ระบบ';
                            btn.disabled = false;
                            return;
                        }
                    }

                    // ปรับ role ตามที่ตรวจจับได้
                    let finalRole = data.role;
                    if (isSuperAdmin) finalRole = 'superadmin';
                    else if (user.toLowerCase() === 'admin') finalRole = 'admin';

                    const userData = {
                        username: user,
                        name: data.name || user,
                        role: finalRole
                    };

                    localStorage.setItem('user_session', JSON.stringify(userData));

                    currentUser = userData.username;
                    userRole = userData.role;

                    document.getElementById('loginPage').style.display = 'none';
                    document.getElementById('mainApp').classList.remove('hidden');

                    if (typeof setupUserInterface === 'function') setupUserInterface(userData);
                    if (typeof updateMenuByRole === 'function') updateMenuByRole();

                    // กำหนดหน้าแรก
                    let firstPage = 'water';

                    if (userRole === 'superadmin' || userRole === 'admin') firstPage = 'dashboard';
                    else if (userRole === 'shelter') firstPage = 'shelter';
                    else if (userRole === 'water_staff') firstPage = 'addWater';
                    else if (userRole === 'relief') firstPage = 'relief';
                    else if (userRole === 'community') firstPage = 'water';
                    else if (userRole === 'flood_report') firstPage = 'looker';

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
                        riskMapImageUrl: (function () {
                            try { return localStorage.getItem('risk_map_image_url') || "https://lh3.googleusercontent.com/d/1tIGTXKoPI88Y_7-NSISSGPCuFy31Cfeh"; } catch (e) { return "https://lh3.googleusercontent.com/d/1tIGTXKoPI88Y_7-NSISSGPCuFy31Cfeh"; }
                        })()
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
                if (typeof userRole !== 'undefined' && (userRole === 'admin' || userRole === 'superadmin')) {
                    renderAdminDashboard();
                }
                if (typeof initDashOneMap === 'function') initDashOneMap();
                if (typeof renderDashOneMapLayers === 'function') renderDashOneMapLayers();
                if (typeof renderAdminRoadClosuresList === 'function') renderAdminRoadClosuresList();
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
            if (typeof checkAdminReadOnlyAction === 'function' && checkAdminReadOnlyAction()) return;
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
        // [โมดูลย่อย] การจัดการถุงยังชีพ สต๊อกสินค้า และการกรองโซน ย้ายไปที่ js/modules/relief.js และ js/modules/user-mgmt.js เรียบร้อยแล้ว
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
        // [โมดูลย่อย] ระบบจัดการผู้ใช้ (saveUser, deleteUser) ย้ายไปที่ js/modules/user-mgmt.js เรียบร้อยแล้ว
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
            if (e && e.preventDefault) e.preventDefault();
            if (typeof checkAdminReadOnlyAction === 'function' && checkAdminReadOnlyAction()) return;
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

            // 🏛️ ตีกรอบขอบเขตเทศบาลตำบลตันหยงมัส & พื้นที่นอกเขตเป็นสีเทา (Inverted Mask)
            if (typeof window.addMunicipalityMaskToMap === 'function') {
                window.addMunicipalityMaskToMap(dashOneMap, {
                    fillColor: '#0f172a',
                    fillOpacity: 0.45,
                    borderColor: '#334155',
                    outlineColor: '#2563eb'
                });
            }

            // 3. Feature Groups สำหรับ 7 เลเยอร์
            dashLayers.water = L.layerGroup().addTo(dashOneMap);
            dashLayers.shelter = L.layerGroup().addTo(dashOneMap);
            dashLayers.relief = L.layerGroup().addTo(dashOneMap);
            dashLayers.evac = L.layerGroup().addTo(dashOneMap);
            dashLayers.flood = L.layerGroup().addTo(dashOneMap);
            dashLayers.polygon = L.layerGroup().addTo(dashOneMap);
            dashLayers.road = L.layerGroup().addTo(dashOneMap);

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
                polygon: { id: 'btnLayerPolygon', color: 'bg-red-700' },
                road: { id: 'btnLayerRoad', color: 'bg-amber-600' }
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
            if (typeof checkAdminReadOnlyAction === 'function' && checkAdminReadOnlyAction()) return;
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

                // เพิ่มหมุดรายงานระดับน้ำจากประชาชน (Citizen Crowdsourced)
                if (store.citizenWaterReports && store.citizenWaterReports.length > 0) {
                    store.citizenWaterReports.forEach(cw => {
                        const cLat = parseFloat(cw.lat);
                        const cLng = parseFloat(cw.lng);
                        if (isNaN(cLat) || isNaN(cLng) || (cLat === 0 && cLng === 0)) return;

                        const cIcon = L.divIcon({
                            className: 'custom-one-cwater-marker bg-transparent border-0',
                            html: `
                                <div class="relative flex flex-col items-center">
                                    <div class="bg-blue-600 text-white w-7 h-7 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[10px] animate-pulse">
                                        <i class="fas fa-droplet"></i>
                                    </div>
                                    <span class="bg-blue-950 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-md mt-0.5 whitespace-nowrap border border-blue-400/30">${cw.levelCmRange || ''}</span>
                                </div>
                            `,
                            iconSize: [32, 42],
                            iconAnchor: [16, 42],
                            popupAnchor: [0, -42]
                        });

                        const cPopup = `
                            <div class="font-sans p-2 min-w-[190px]">
                                <div class="flex items-center justify-between border-b pb-1 mb-1.5">
                                    <span class="font-black text-slate-800 text-xs"><i class="fas fa-droplet text-blue-500 mr-1"></i>${cw.locationName || 'รายงานระดับน้ำ'}</span>
                                    <span class="text-[9px] font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full">ประชาชน</span>
                                </div>
                                <p class="text-xs text-slate-600 mb-1">ระดับน้ำ: <b class="text-blue-600 font-bold">${cw.levelCategory}</b> (แนวโน้ม: ${cw.trend || 'ทรงตัว'})</p>
                                ${cw.note ? `<p class="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded border border-slate-100 my-1">${cw.note}</p>` : ''}
                                <p class="text-[10px] text-slate-400"><i class="far fa-user mr-1"></i>${cw.reporterName || 'ประชาชน'} ${cw.reporterPhone ? `(${cw.reporterPhone})` : ''} | ${cw.createdAt ? new Date(cw.createdAt).toLocaleDateString('th-TH') : '-'}</p>
                            </div>
                        `;

                        const cm = L.marker([cLat, cLng], { icon: cIcon }).bindPopup(cPopup);
                        dashLayers.water.addLayer(cm);
                    });
                }
            }

            // 2. เลเยอร์ศูนย์พักพิง (สีชมพู Pink Theme + ป้ายใต้หมุด)
            const defaultShelterPoints = [
                { name: 'ศูนย์เทศบาลตำบลตันหยงมัส', lat: 6.2942468005304475, lng: 101.72202727872536, cap: 80 },
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
            // 7. เลเยอร์เส้นทางปิด / ไม่สามารถสัญจรได้ (Road Closures)
            const roadClosures = store.roadClosures || [];
            const roadCountBadge = document.getElementById('dash_roadCountBadge');
            if (roadCountBadge) {
                roadCountBadge.innerText = roadClosures.length;
            }

            if (roadClosures.length > 0 && dashLayers.road) {
                roadClosures.forEach(rc => {
                    const lat = parseFloat(rc.lat);
                    const lng = parseFloat(rc.lng);
                    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return;

                    const isFullyClosed = (rc.status || '').includes('ทุกชนิด') || (rc.status || '').includes('ปิดการจราจร');
                    const markerBg = isFullyClosed ? 'bg-rose-600' : 'bg-amber-600';
                    const badgeText = rc.status || 'ปิดสัญจร';

                    const icon = L.divIcon({
                        className: 'custom-one-road-marker bg-transparent border-0',
                        html: `
                            <div class="relative flex flex-col items-center">
                                <div class="${markerBg} text-white w-9 h-9 rounded-2xl border-2 border-white shadow-lg flex items-center justify-center text-sm font-black animate-pulse">
                                    <i class="fas fa-road-barrier"></i>
                                </div>
                                <span class="bg-slate-900 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-md mt-0.5 whitespace-nowrap border border-white/20">${badgeText}</span>
                            </div>
                        `,
                        iconSize: [42, 54],
                        iconAnchor: [21, 54],
                        popupAnchor: [0, -54]
                    });

                    let imgHtml = '';
                    if (rc.image) {
                        imgHtml = `
                            <div class="mt-2 rounded-xl overflow-hidden border border-slate-200">
                                <img src="${rc.image}" class="w-full h-28 object-cover cursor-pointer hover:opacity-90 transition" onclick="zoomImageModal('${rc.image}', '${rc.title}')" title="คลิกเพื่อดูรูปขนาดใหญ่">
                            </div>
                        `;
                    }

                    const popup = `
                        <div class="font-sans p-2 min-w-[220px] max-w-[280px]">
                            <div class="flex items-center justify-between border-b pb-1.5 mb-2">
                                <span class="font-black text-slate-800 text-xs truncate mr-2"><i class="fas fa-road-barrier text-amber-600 mr-1"></i>${rc.title}</span>
                                <span class="text-[9px] font-bold text-white ${markerBg} px-2 py-0.5 rounded-full shrink-0">${rc.status || 'ปิดสัญจร'}</span>
                            </div>
                            ${rc.detail ? `<p class="text-xs text-slate-600 mb-1.5 leading-relaxed">${rc.detail}</p>` : ''}
                            ${rc.waterDepth ? `<p class="text-[11px] text-rose-600 font-bold mb-1"><i class="fas fa-water mr-1"></i>ระดับน้ำบนผิวทาง: ${rc.waterDepth}</p>` : ''}
                            ${rc.detour ? `<p class="text-[11px] text-emerald-700 bg-emerald-50 p-1.5 rounded-lg border border-emerald-100 font-medium mb-1"><i class="fas fa-route mr-1"></i>ทางเลี่ยง: ${rc.detour}</p>` : ''}
                            ${imgHtml}
                            <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                                <span><i class="far fa-user mr-1"></i>${rc.reporter || 'เจ้าหน้าที่'}</span>
                                <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" class="text-blue-600 font-bold hover:underline flex items-center gap-1">
                                    <i class="fas fa-location-arrow"></i> นำทาง
                                </a>
                            </div>
                        </div>
                    `;

                    const m = L.marker([lat, lng], { icon: icon }).bindPopup(popup);
                    dashLayers.road.addLayer(m);
                });
            }
        }

        // ==========================================
        // 🚧 ระบบจัดการเส้นทางปิด / ไม่สามารถสัญจรได้ (Road Closures Management)
        // ==========================================

        window.zoomImageModal = function (src, title) {
            Swal.fire({
                title: `<span class="text-slate-800 font-bold text-base">${title || 'รูปภาพสภาพเส้นทาง'}</span>`,
                imageUrl: src,
                imageAlt: title,
                imageWidth: '100%',
                imageHeight: 'auto',
                showConfirmButton: true,
                confirmButtonText: 'ปิดหน้าต่าง',
                confirmButtonColor: '#64748b',
                customClass: {
                    popup: 'rounded-[2rem] max-w-lg p-4',
                    image: 'rounded-2xl max-h-[70vh] object-contain shadow-sm'
                }
            });
        };

        window.panOneMapToRoadClosure = function (lat, lng, title) {
            if (!dashOneMap) {
                initDashOneMap();
            }
            const mapCard = document.getElementById('dashOneMapCard');
            if (mapCard) {
                mapCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            setTimeout(() => {
                if (dashOneMap) {
                    dashOneMap.setView([lat, lng], 16, { animate: true });
                }
            }, 300);
        };

        function renderAdminRoadClosuresList() {
            const listEl = document.getElementById('dashRoadClosuresList');
            const badgeEl = document.getElementById('dash_roadSummaryBadge');
            const badgeOneMap = document.getElementById('dash_roadCountBadge');
            if (!listEl) return;

            const items = store.roadClosures || [];

            if (badgeOneMap) {
                badgeOneMap.innerText = items.length;
            }

            if (badgeEl) {
                if (items.length > 0) {
                    badgeEl.className = "text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200";
                    badgeEl.innerText = `ปิดสัญจร ${items.length} จุด`;
                } else {
                    badgeEl.className = "text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200";
                    badgeEl.innerText = "เปิดสัญจรปกติทุกสาย";
                }
            }

            if (items.length === 0) {
                listEl.innerHTML = `
                    <div class="col-span-full py-10 text-center bg-slate-50/80 rounded-2xl border border-dashed border-slate-200">
                        <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl mx-auto mb-3">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <h4 class="text-sm font-bold text-slate-700">ไม่มีรายงานเส้นทางปิดในขณะนี้</h4>
                        <p class="text-xs text-slate-400 mt-1">ถนนและเส้นทางสัญจรในเขตเทศบาลตำบลตันหยงมัสสามารถใช้งานได้ตามปกติ</p>
                        <button onclick="openAddRoadClosureModal()" class="mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold text-xs transition shadow-sm hover:opacity-95 active:scale-95">
                            <i class="fas fa-plus mr-1"></i> รายงานเส้นทางปิดใหม่
                        </button>
                    </div>
                `;
                return;
            }

            listEl.innerHTML = items.map(item => {
                const isFullyClosed = (item.status || '').includes('ทุกชนิด') || (item.status || '').includes('ปิดการจราจร');
                const badgeColor = isFullyClosed ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-amber-100 text-amber-700 border-amber-200';
                const iconColor = isFullyClosed ? 'text-rose-600 bg-rose-50' : 'text-amber-600 bg-amber-50';

                const lat = parseFloat(item.lat) || 0;
                const lng = parseFloat(item.lng) || 0;
                const hasCoords = lat !== 0 && lng !== 0;

                return `
                    <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                        <div>
                            <!-- ส่วนหัวการ์ด -->
                            <div class="flex items-start justify-between gap-2 mb-2">
                                <div class="flex items-center gap-2 min-w-0">
                                    <div class="w-8 h-8 rounded-xl ${iconColor} flex items-center justify-center text-xs shrink-0 font-bold">
                                        <i class="fas fa-road-barrier"></i>
                                    </div>
                                    <h4 class="font-bold text-slate-800 text-sm truncate" title="${item.title}">${item.title}</h4>
                                </div>
                                <span class="text-[9px] font-bold px-2 py-0.5 rounded-full border ${badgeColor} whitespace-nowrap shrink-0">
                                    ${item.status || 'ปิดสัญจร'}
                                </span>
                            </div>

                            <!-- รูปถ่ายขนาดเล็ก (ถ้ามี) -->
                            ${item.image ? `
                                <div class="my-2.5 rounded-xl overflow-hidden border border-slate-200/80 relative group/img cursor-pointer" onclick="zoomImageModal('${item.image}', '${item.title}')">
                                    <img src="${item.image}" class="w-full h-32 object-cover transition duration-300 group-hover/img:scale-105" alt="${item.title}">
                                    <div class="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center text-white text-xs font-bold gap-1">
                                        <i class="fas fa-search-plus"></i> แตะดูรูปใหญ่
                                    </div>
                                </div>
                            ` : ''}

                            <!-- รายละเอียด -->
                            ${item.detail ? `<p class="text-xs text-slate-600 mb-2 leading-relaxed bg-slate-50 p-2.5 rounded-xl">${item.detail}</p>` : ''}

                            <div class="space-y-1.5 text-xs mb-3">
                                ${item.waterDepth ? `
                                    <div class="flex items-center gap-1.5 text-rose-600 font-bold text-[11px]">
                                        <i class="fas fa-water text-xs"></i>
                                        <span>ระดับน้ำบนผิวทาง: ${item.waterDepth}</span>
                                    </div>
                                ` : ''}
                                ${item.detour ? `
                                    <div class="flex items-start gap-1.5 text-emerald-700 bg-emerald-50/60 p-2 rounded-xl border border-emerald-100 text-[11px]">
                                        <i class="fas fa-route text-xs mt-0.5 shrink-0"></i>
                                        <span><b>ทางเลี่ยง:</b> ${item.detour}</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>

                        <!-- Footer ปุ่มจัดการและการนำทาง -->
                        <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs mt-2">
                            <div class="text-[10px] text-slate-400">
                                <span><i class="far fa-user mr-1"></i>${item.reporter || 'เจ้าหน้าที่'}</span>
                                ${item.createdAt ? `<span class="block text-[9px]">${new Date(item.createdAt).toLocaleDateString('th-TH')}</span>` : ''}
                            </div>

                            <div class="flex items-center gap-1.5">
                                ${hasCoords ? `
                                    <button onclick="panOneMapToRoadClosure(${lat}, ${lng}, '${item.title}')" class="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold transition flex items-center gap-1" title="ซูมไปยังจุดนี้บน One Map">
                                        <i class="fas fa-location-crosshairs text-[10px]"></i> แผนที่
                                    </button>
                                ` : ''}
                                <button onclick="deleteRoadClosure('${item.id}')" class="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold transition flex items-center gap-1" title="ลบรายงาน">
                                    <i class="fas fa-trash-alt text-[10px]"></i> ลบ
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        window._tempRoadClosureDraft = null;
        window._tempRoadClosureBase64 = '';

        window.handleRoadFileChange = async function(input) {
            if (!input.files || !input.files[0]) return;
            const file = input.files[0];
            try {
                const compressed = await compressImage(file, 640, 480, 0.7);
                window._tempRoadClosureBase64 = compressed;
                const prev = document.getElementById('swal_road_prev');
                const prevImg = document.getElementById('swal_road_prev_img');
                if (prev && prevImg) {
                    prevImg.src = compressed;
                    prev.classList.remove('hidden');
                }
            } catch (e) {
                console.warn("รูปภาพบีบอัดไม่สำเร็จ", e);
            }
        };

        window.removeRoadFilePreview = function() {
            window._tempRoadClosureBase64 = '';
            const fileInput = document.getElementById('swal_road_file');
            if (fileInput) fileInput.value = '';
            const prev = document.getElementById('swal_road_prev');
            if (prev) prev.classList.add('hidden');
        };

        window.getGpsForRoadClosure = function() {
            const latEl = document.getElementById('swal_road_lat');
            const lngEl = document.getElementById('swal_road_lng');
            if (!navigator.geolocation) {
                Swal.showValidationMessage('อุปกรณ์ไม่รองรับการดึงพิกัด GPS');
                return;
            }
            if (latEl) latEl.value = 'กำลังดึง GPS...';
            if (lngEl) lngEl.value = 'กำลังดึง GPS...';

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    if (typeof window.isInsideMunicipality === 'function' && !window.isInsideMunicipality(lat, lng)) {
                        alert('⚠️ พิกัด GPS ของท่านอยู่นอกเขตเทศบาลตำบลตันหยงมัส กรุณาปักหมุดเลือกตำแหน่งภายในเขตเทศบาล');
                        if (latEl) latEl.value = '6.294450';
                        if (lngEl) lngEl.value = '101.723620';
                        return;
                    }
                    if (latEl) latEl.value = lat.toFixed(6);
                    if (lngEl) lngEl.value = lng.toFixed(6);
                },
                (err) => {
                    if (latEl) latEl.value = '6.294450';
                    if (lngEl) lngEl.value = '101.723620';
                    alert('ไม่สามารถดึงพิกัด GPS ได้ กรุณาเปิด Location บนอุปกรณ์');
                },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        };

        window.pickPointOnOneMap = function() {
            // บันทึกฟอร์มที่กรอกค้างไว้
            const titleEl = document.getElementById('swal_road_title');
            const statusEl = document.getElementById('swal_road_status');
            const depthEl = document.getElementById('swal_road_depth');
            const detourEl = document.getElementById('swal_road_detour');
            const detailEl = document.getElementById('swal_road_detail');

            window._tempRoadClosureDraft = {
                title: titleEl ? titleEl.value : '',
                status: statusEl ? statusEl.value : 'ปิดการจราจรทุกชนิด (รถทุกชนิดผ่านไม่ได้)',
                depth: depthEl ? depthEl.value : '',
                detour: detourEl ? detourEl.value : '',
                detail: detailEl ? detailEl.value : '',
                image: window._tempRoadClosureBase64 || ''
            };

            Swal.close();

            // เลื่อนไปที่ OneMap
            const mapCard = document.getElementById('dashOneMapCard');
            if (mapCard) {
                mapCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            if (!dashOneMap) initDashOneMap();

            // แสดง Toast แนะนำ
            const toast = Swal.mixin({
                toast: true,
                position: 'top',
                showConfirmButton: false,
                timer: 6000,
                timerProgressBar: true
            });
            toast.fire({
                icon: 'info',
                title: '📍 กรุณาคลิกเลือกจุดบนแผนที่ One Map'
            });

            // รอคลิก 1 ครั้งบน OneMap
            dashOneMap.once('click', function(e) {
                const pickedLat = e.latlng.lat.toFixed(6);
                const pickedLng = e.latlng.lng.toFixed(6);

                if (typeof window.isInsideMunicipality === 'function' && !window.isInsideMunicipality(pickedLat, pickedLng)) {
                    Swal.fire({
                        icon: 'warning',
                        title: '⚠️ อยู่นอกเขตเทศบาล',
                        text: 'ตำแหน่งที่ท่านเลือกอยู่นอกเขตเทศบาลตำบลตันหยงมัส กรุณาคลิกเลือกจุดภายในเขตเทศบาลเท่านั้น',
                        confirmButtonText: 'เลือกใหม่',
                        confirmButtonColor: '#d97706',
                        customClass: { popup: 'rounded-[2rem]' }
                    }).then(() => {
                        window.pickPointOnOneMap();
                    });
                    return;
                }

                // ปักหมุดชั่วคราว
                const tempPin = L.circleMarker([e.latlng.lat, e.latlng.lng], {
                    radius: 10,
                    color: '#ea580c',
                    fillColor: '#f97316',
                    fillOpacity: 0.8
                }).addTo(dashOneMap);
                setTimeout(() => { if (dashOneMap) dashOneMap.removeLayer(tempPin); }, 15000);

                // เปิด Modal คืนพร้อมพิกัด
                openAddRoadClosureModal({
                    ...window._tempRoadClosureDraft,
                    lat: pickedLat,
                    lng: pickedLng
                });
            });
        };

        function openAddRoadClosureModal(initialData = null) {
            const data = initialData || {};
            const initialLat = data.lat || '6.294450';
            const initialLng = data.lng || '101.723620';
            window._tempRoadClosureBase64 = data.image || '';

            Swal.fire({
                title: '<div class="text-amber-600 font-black text-lg flex items-center justify-center gap-2"><i class="fas fa-road-barrier"></i> รายงานเส้นทางปิด / ไม่สามารถสัญจรได้</div>',
                html: `
                    <div class="text-left space-y-3 mt-2 font-prompt text-xs">
                        <div>
                            <label class="font-bold text-slate-700 block mb-1">ชื่อเส้นทาง / ถนน / ช่วงบริเวณ *</label>
                            <input type="text" id="swal_road_title" value="${data.title || ''}" class="w-full p-2.5 border border-slate-200 rounded-xl outline-none text-xs font-bold focus:border-amber-500 bg-slate-50" placeholder="เช่น ถนนระแงะมรรคา (ช่วงหน้า รพ.ระแงะ - ตลาดสด)">
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            <div>
                                <label class="font-bold text-slate-700 block mb-1">สถานะการสัญจร</label>
                                <select id="swal_road_status" class="w-full p-2.5 border border-slate-200 rounded-xl outline-none text-xs font-bold bg-slate-50 focus:border-amber-500">
                                    <option value="ปิดการจราจรทุกชนิด (รถทุกชนิดผ่านไม่ได้)" ${(data.status || '').includes('ทุกชนิด') ? 'selected' : ''}>⛔ ปิดการจราจรทุกชนิด</option>
                                    <option value="รถเล็กไม่สามารถผ่านได้ (รถยกสูงผ่านได้)" ${(data.status || '').includes('รถเล็ก') ? 'selected' : ''}>⚠️ รถเล็กไม่สามารถผ่านได้</option>
                                    <option value="เฝ้าระวังน้ำท่วมผิวทาง (สัญจรได้ระมัดระวัง)" ${(data.status || '').includes('เฝ้าระวัง') ? 'selected' : ''}>🟡 เฝ้าระวังน้ำท่วมผิวทาง</option>
                                    <option value="ระดับน้ำลดแล้ว - เปิดสัญจรปกติ" ${(data.status || '').includes('เปิดสัญจร') ? 'selected' : ''}>✅ เปิดสัญจรได้ตามปกติ</option>
                                </select>
                            </div>
                            <div>
                                <label class="font-bold text-slate-700 block mb-1">ระดับน้ำบนผิวทาง (ถ้ามี)</label>
                                <input type="text" id="swal_road_depth" value="${data.depth || ''}" class="w-full p-2.5 border border-slate-200 rounded-xl outline-none text-xs bg-slate-50 focus:border-amber-500" placeholder="เช่น 30-50 ซม. หรือ น้ำท่วมขังเสมอขอบทาง">
                            </div>
                        </div>

                        <div>
                            <label class="font-bold text-slate-700 block mb-1">เส้นทางเลี่ยงที่แนะนำ (ถ้ามี)</label>
                            <input type="text" id="swal_road_detour" value="${data.detour || ''}" class="w-full p-2.5 border border-slate-200 rounded-xl outline-none text-xs bg-slate-50 focus:border-amber-500" placeholder="เช่น ใช้เส้นทางเลี่ยงบายพาส หรือซอยเทศบาล 4">
                        </div>

                        <div>
                            <label class="font-bold text-slate-700 block mb-1">รายละเอียดเพิ่มเติม / สภาพพื้นที่</label>
                            <textarea id="swal_road_detail" class="w-full p-2.5 border border-slate-200 rounded-xl outline-none text-xs h-16 bg-slate-50 focus:border-amber-500" placeholder="เช่น กระแสน้ำไหลเชี่ยว มีเสาไฟฟ้าหรือกิ่งไม้กีดขวาง เจ้าหน้าที่กำลังวางแนวกระสอบทราย">${data.detail || ''}</textarea>
                        </div>

                        <!-- แนบรูปภาพ -->
                        <div>
                            <label class="font-bold text-slate-700 block mb-1"><i class="fas fa-camera mr-1 text-amber-500"></i> แนบรูปภาพสภาพเส้นทาง</label>
                            <input type="file" id="swal_road_file" accept="image/*" onchange="handleRoadFileChange(this)" class="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-amber-500 file:text-white cursor-pointer">
                            <div id="swal_road_prev" class="${data.image ? '' : 'hidden'} mt-2 relative group rounded-xl overflow-hidden border border-slate-200 max-h-36">
                                <img id="swal_road_prev_img" src="${data.image || ''}" class="w-full h-32 object-cover">
                                <button type="button" onclick="removeRoadFilePreview()" class="absolute top-1.5 right-1.5 bg-rose-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md hover:bg-rose-700" title="ลบรูป">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        <!-- พิกัดตำแหน่ง -->
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <label class="font-bold text-slate-700"><i class="fas fa-location-dot mr-1 text-rose-500"></i> พิกัดตำแหน่ง (Latitude, Longitude) *</label>
                                <div class="flex items-center gap-1">
                                    <button type="button" onclick="getGpsForRoadClosure()" class="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 hover:bg-emerald-100 transition">
                                        <i class="fas fa-crosshairs"></i> GPS
                                    </button>
                                    <button type="button" onclick="pickPointOnOneMap()" class="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-bold text-[10px] border border-blue-200 hover:bg-blue-100 transition">
                                        <i class="fas fa-map-pin"></i> จิ้ม OneMap
                                    </button>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <input type="text" id="swal_road_lat" value="${initialLat}" class="p-2 border border-slate-200 rounded-xl outline-none text-xs font-mono font-bold bg-slate-50 focus:border-amber-500" placeholder="Latitude เช่น 6.294450">
                                <input type="text" id="swal_road_lng" value="${initialLng}" class="p-2 border border-slate-200 rounded-xl outline-none text-xs font-mono font-bold bg-slate-50 focus:border-amber-500" placeholder="Longitude เช่น 101.723620">
                            </div>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'บันทึกรายงานเส้นทาง',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#d97706',
                cancelButtonColor: '#64748b',
                customClass: { popup: 'rounded-[2rem] max-w-lg' },
                preConfirm: () => {
                    const title = (document.getElementById('swal_road_title').value || '').trim();
                    const status = document.getElementById('swal_road_status').value;
                    const waterDepth = (document.getElementById('swal_road_depth').value || '').trim();
                    const detour = (document.getElementById('swal_road_detour').value || '').trim();
                    const detail = (document.getElementById('swal_road_detail').value || '').trim();
                    const lat = parseFloat(document.getElementById('swal_road_lat').value);
                    const lng = parseFloat(document.getElementById('swal_road_lng').value);

                    if (!title) {
                        Swal.showValidationMessage('กรุณาระบุชื่อเส้นทางหรือถนน');
                        return false;
                    }
                    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
                        Swal.showValidationMessage('กรุณาระบุพิกัด Latitude และ Longitude ให้ถูกต้อง');
                        return false;
                    }
                    if (typeof window.isInsideMunicipality === 'function' && !window.isInsideMunicipality(lat, lng)) {
                        Swal.showValidationMessage('⚠️ พิกัดที่ระบุอยู่นอกเขตเทศบาลตำบลตันหยงมัส กรุณาปักหมุดภายในเขตเทศบาลเท่านั้น');
                        return false;
                    }

                    return {
                        title,
                        status,
                        waterDepth,
                        detour,
                        detail,
                        lat,
                        lng,
                        image: window._tempRoadClosureBase64 || ''
                    };
                }
            }).then(async (result) => {
                if (result.isConfirmed) {
                    const payload = result.value;
                    Swal.fire({
                        title: 'กำลังบันทึกข้อมูลเส้นทาง...',
                        allowOutsideClick: false,
                        didOpen: () => Swal.showLoading()
                    });

                    try {
                        if (typeof sbSaveRoadClosure === 'function') {
                            await sbSaveRoadClosure(payload);
                        } else {
                            throw new Error('ระบบเชื่อมต่อ Supabase ไม่พร้อมใช้งาน');
                        }

                        // เคลียร์ Draft
                        window._tempRoadClosureDraft = null;
                        window._tempRoadClosureBase64 = '';

                        Swal.fire({
                            title: 'บันทึกสำเร็จ!',
                            text: 'อัปเดตเส้นทางปิดและส่งพิกัดลง One Map เรียบร้อยแล้ว',
                            icon: 'success',
                            timer: 1600,
                            showConfirmButton: false
                        });

                        await loadData();
                    } catch (err) {
                        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
                    }
                }
            });
        }

        async function deleteRoadClosure(id) {
            if (!id) return;
            if (typeof checkAdminReadOnlyAction === 'function' && checkAdminReadOnlyAction()) return;

            const res = await Swal.fire({
                title: 'ยืนยันการลบ?',
                text: 'คุณต้องการลบรายงานเส้นทางปิดนี้ออกจากระบบหรือไม่',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'ลบข้อมูล',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#64748b',
                customClass: { popup: 'rounded-[2rem]' }
            });

            if (res.isConfirmed) {
                Swal.fire({
                    title: 'กำลังลบข้อมูล...',
                    allowOutsideClick: false,
                    didOpen: () => Swal.showLoading()
                });

                try {
                    if (typeof sbDeleteRoadClosure === 'function') {
                        await sbDeleteRoadClosure(id);
                    } else {
                        throw new Error('ฟังก์ชันลบข้อมูลไม่พร้อมใช้งาน');
                    }

                    if (store.roadClosures) {
                        store.roadClosures = store.roadClosures.filter(r => r.id !== id);
                    }

                    renderDashOneMapLayers();
                    renderAdminRoadClosuresList();

                    Swal.fire({
                        title: 'ลบเรียบร้อย',
                        text: 'ลบรายงานเส้นทางเรียบร้อยแล้ว',
                        icon: 'success',
                        timer: 1500,
                        showConfirmButton: false
                    });
                } catch (err) {
                    Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
                }
            }
        }

        window.openAddRoadClosureModal = openAddRoadClosureModal;
        window.deleteRoadClosure = deleteRoadClosure;
        window.renderAdminRoadClosuresList = renderAdminRoadClosuresList;

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

            // 🏛️ ตีกรอบขอบเขตเทศบาลตำบลตันหยงมัส & พื้นที่นอกเขตเป็นสีเทา (Inverted Mask)
            if (typeof window.addMunicipalityMaskToMap === 'function') {
                window.addMunicipalityMaskToMap(waterMap, {
                    fillColor: '#0f172a',
                    fillOpacity: 0.45,
                    borderColor: '#334155',
                    outlineColor: '#2563eb'
                });
            }

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
            'ศูนย์เทศบาลตำบลตันหยงมัส': 80,
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

        // ฟังก์ชันตรวจสอบสิทธิ์และยืนยันการเข้าถึงข้อมูลส่วนบุคคล (PDPA Security PIN)
        async function checkPasswordBeforeDetailByData(idCard, name) {
            const staffName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : 'เจ้าหน้าที่';
            const currentRole = (typeof userRole !== 'undefined' ? userRole : '').toLowerCase();

            if (typeof promptPdpaSecurityPin === 'function') {
                promptPdpaSecurityPin(`คุณ ${name || 'ผู้ประสบภัย'}`, () => {
                    console.log(`🔒 [PDPA Audit] ${new Date().toISOString()} - User: ${staffName} (${currentRole}) accessed details of: ${name}`);
                    showDetailsByData(idCard, name);
                });
            } else {
                showDetailsByData(idCard, name);
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

        // ฟังก์ชันตรวจสอบสิทธิ์และยืนยันการเข้าถึงข้อมูลตามลำดับ (PDPA Security PIN)
        async function checkPasswordBeforeDetail(index) {
            const staffName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : 'เจ้าหน้าที่';
            const currentRole = (typeof userRole !== 'undefined' ? userRole : '').toLowerCase();

            if (typeof promptPdpaSecurityPin === 'function') {
                promptPdpaSecurityPin(`ผู้ประสบภัยลำดับที่ ${index + 1}`, () => {
                    console.log(`🔒 [PDPA Audit] ${new Date().toISOString()} - User: ${staffName} (${currentRole}) accessed details index #${index}`);
                    showDetails(index);
                });
            } else {
                showDetails(index);
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

            // จัดการข้อมูลส่วนบุคคลตามมาตรฐาน PDPA (Data Masking)
            const rawIdCard = (person[3] || '').toString().replace(/['\s]/g, '');
            const maskedIdCard = rawIdCard.length === 13
                ? `${rawIdCard[0]}-${rawIdCard.slice(1, 5)}-•••••-${rawIdCard.slice(10, 12)}-${rawIdCard[12]}`
                : (rawIdCard.length > 4 ? rawIdCard.slice(0, 3) + '••••••' + rawIdCard.slice(-2) : (rawIdCard || '-'));

            const rawPhone = person[7] ? person[7].toString().replace(/'/g, "") : "";
            const cleanPhone = rawPhone.replace(/\s+/g, "");
            const maskedPhone = cleanPhone.length >= 9
                ? `${cleanPhone.slice(0, 3)}-•••-${cleanPhone.slice(-4)}`
                : (cleanPhone || 'ไม่ระบุ');

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
                    <div class="flex items-center justify-between">
                        <p class="text-[9px] text-slate-400 font-bold uppercase">เลขบัตรประจำตัวประชาชน</p>
                        ${rawIdCard ? `
                        <button type="button" onclick="window.toggleModalMask('modalIdCardDisplay', '${rawIdCard}', '${maskedIdCard}', this)"
                                class="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition-colors">
                            <i class="fas fa-eye text-[10px]"></i> แสดงเลขเต็ม
                        </button>` : ''}
                    </div>
                    <p id="modalIdCardDisplay" class="text-sm font-bold text-slate-700 font-mono tracking-wider mt-0.5">${maskedIdCard}</p>
                </div>
            </div>

            <div class="flex items-center gap-3 px-1 border-b pb-3">
                <div class="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-500 shadow-sm">
                    <i class="fas fa-phone-alt text-xs"></i>
                </div>
                <div class="flex-1">
                    <div class="flex items-center justify-between">
                        <p class="text-[9px] text-slate-400 font-bold uppercase">เบอร์โทรศัพท์</p>
                        ${cleanPhone ? `
                        <button type="button" onclick="window.toggleModalMask('modalPhoneDisplay', '${cleanPhone}', '${maskedPhone}', this)"
                                class="text-[10px] text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md transition-colors">
                            <i class="fas fa-eye text-[10px]"></i> แสดงเบอร์เต็ม
                        </button>` : ''}
                    </div>
                    <a id="modalPhoneDisplay" href="${cleanPhone ? 'tel:' + cleanPhone : '#'}" class="text-sm font-bold text-blue-600 underline font-mono tracking-wider mt-0.5 inline-block">
                        ${maskedPhone}
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
            if (e && e.preventDefault) e.preventDefault();
            if (typeof checkAdminReadOnlyAction === 'function' && checkAdminReadOnlyAction()) return;
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

        // [โมดูลย่อย] ระบบค้นหาที่อยู่อพยพ Autocomplete และบันทึกข้อมูลอพยพ ย้ายไปที่ js/modules/public-report.js เรียบร้อยแล้ว
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
        // =========================================================================
        // 🧩 โครงสร้างระบบแยกโมดูลย่อย (Modular Architecture)
        // 1. โทรมาตรระดับน้ำ RID & AI Hydrograph  -> js/modules/telemetry.js
        // 2. พยากรณ์อากาศ 7 วัน & LINE Broadcast   -> js/modules/weather.js
        // 3. แจ้งเหตุฉุกเฉินประชาชน & บันทึกอพยพ    -> js/modules/public-report.js
        // 4. แจกถุงยังชีพ สต๊อกคงคลัง & พิมพ์รายงาน -> js/modules/relief.js
        // 5. ระบบจัดการผู้ใช้งาน & สิทธิ์ Admin     -> js/modules/user-mgmt.js
        // 6. แดชบอร์ดสรุปภาพรวม & แผนที่น้ำท่วม    -> js/modules/admin-dashboard.js
        // =========================================================================
