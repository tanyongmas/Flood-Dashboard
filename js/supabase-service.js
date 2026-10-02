/**
 * Supabase Service Layer (100% Supabase Mode)
 * ระบบรายงานสถานการณ์น้ำท่วม เทศบาลตำบลตันหยงมัส
 * ฐานข้อมูลหลัก: PostgreSQL บน Supabase Cloud
 */

let sbClient = null;



// เริ่มต้นสร้าง Supabase Client
function initSupabase() {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        try {
            sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            window.supabaseClient = sbClient;
            console.log("⚡ [Supabase 100%] เชื่อมต่อฐานข้อมูล Supabase PostgreSQL สำเร็จ");
            return sbClient;
        } catch (e) {
            console.error("❌ [Supabase] ไม่สามารถสร้าง Client ได้:", e);
        }
    }
    return null;
}

// ตรวจสอบความพร้อมของ Supabase
function isSupabaseReady() {
    return Boolean(sbClient || initSupabase());
}

// ==========================================
// 1. ระบบ Login & Authentication (100% Supabase)
// ==========================================
async function sbLogin(username) {
    if (!isSupabaseReady()) {
        return { success: false, error: 'ระบบเชื่อมต่อ Supabase ขัดข้อง' };
    }
    try {
        const cleanUser = String(username).trim();
        const { data, error } = await sbClient
            .from('users')
            .select('*')
            .eq('username', cleanUser)
            .maybeSingle();

        if (error) {
            console.error("❌ [Supabase] Login error:", error);
            return { success: false, error: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์: ' + error.message };
        }
        if (data) {
            console.log("✅ [Supabase] Login สำเร็จ:", data);
            return {
                success: true,
                role: (data.role || 'shelter').toLowerCase().trim(),
                name: data.username
            };
        }
        return { success: false, error: 'ไม่พบชื่อผู้ใช้งานนี้ในระบบ' };
    } catch (err) {
        console.error("❌ [Supabase] Login exception:", err);
        return { success: false, error: err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' };
    }
}

// ==========================================
// 2. โหลดข้อมูลเริ่มต้น (Initial Data - 100% Supabase)
// ==========================================
async function sbFetchInitialData(targetPeriod = '2569') {
    if (!isSupabaseReady()) {
        console.error("❌ [Supabase] Client ไม่พร้อมใช้งาน");
        return null;
    }

    try {
        const period = targetPeriod || '2569';
        const startTime = performance.now();

        // ดึงข้อมูลพร้อมกันทุกตารางด้วย Promise.all (รวมถึง Address และ address_evacuation)
        const [
            wpRes, wlRes, evacRes, addrEvacRes, addrTableRes, relRes, stockRes, polyRes, repRes, userRes
        ] = await Promise.all([
            sbClient.from('water_points').select('*'),
            sbClient.from('water_levels').select('*').eq('period', period).order('recorded_at', { ascending: false }),
            sbClient.from('evacuees').select('*').eq('period', period).order('registered_at', { ascending: false }),
            sbClient.from('address_evacuation').select('*'),
            sbClient.from('Address').select('*'),
            sbClient.from('relief_distribution').select('*').eq('period', period).order('distributed_at', { ascending: false }),
            sbClient.from('relief_stock').select('*').eq('period', period).order('logged_at', { ascending: false }),
            sbClient.from('flood_polygons').select('*').eq('period', period).order('created_at', { ascending: false }),
            sbClient.from('evacuation_reports').select('*').eq('period', period).order('reported_at', { ascending: false }),
            sbClient.from('users').select('username, role')
        ]);

        const durationMs = (performance.now() - startTime).toFixed(1);

        // 1. ดึงพิกัดที่อยู่พร้อมแผนที่จากตาราง address_evacuation
        const rawAddrEvac = (addrEvacRes && addrEvacRes.data) ? addrEvacRes.data : [];
        const addressEvac = rawAddrEvac.map(r => {
            const addr = (r.Address || r.address || '').toString().trim();
            const lat = parseFloat(r.Latitude || r.latitude || r.lat || 0);
            const lng = parseFloat(r.Longtitude || r.Longitude || r.longtitude || r.longitude || r.lng || 0);
            return [addr, lat, lng];
        }).filter(r => r[0] !== '');

        // 2. ดึงรายชื่อที่อยู่/ชุมชนจากตาราง Address (และเชื่อมโยงกับ address_evacuation)
        let addresses = [];
        const rawAddrTable = (addrTableRes && addrTableRes.data) ? addrTableRes.data : [];
        if (Array.isArray(rawAddrTable) && rawAddrTable.length > 0) {
            addresses = rawAddrTable.map(r => {
                const val = r.Address || r.address || (typeof r === 'string' ? r : Object.values(r)[0]);
                return (val || '').toString().trim();
            }).filter(Boolean);
        }

        // หากตาราง Address ว่าง ให้นำรายชื่อที่อยู่จาก address_evacuation ที่มีอยู่มาใช้งานโดยตรง (ข้อมูลจริง ไม่ต้อง scratchpad)
        if (addresses.length === 0 && addressEvac.length > 0) {
            addresses = [...new Set(addressEvac.map(r => r[0]))].sort();
        }

        console.log(`⚡ [Supabase 100%] โหลดข้อมูลสำเร็จ (${durationMs} ms): พบที่อยู่พร้อมพิกัด ${addressEvac.length} จุด, รายชื่อที่อยู่ ${addresses.length} รายการ`);

        // 3. รวบรวมรายชื่อจุดวัดน้ำและพิกัดจริงจากตาราง water_points ใน Supabase (ข้อมูลจริง 100% ไม่มี mock data)
        let waterPoints = [];
        let waterPointsMap = {};
        const rawWp = (wpRes && wpRes.data) ? wpRes.data : [];
        rawWp.forEach(r => {
            const name = (r['จุดวัดระดับน้ำ'] || r.location_name || r.name || '').toString().trim();
            const coords = (r['พิกัด'] || r.coords || '').toString().trim();
            if (name) {
                waterPoints.push(name);
                if (coords) waterPointsMap[name] = coords;
            }
        });
        window.waterPointsMap = waterPointsMap;
        console.log(`⚡ [Supabase 100%] โหลดจุดวัดระดับน้ำสำเร็จ: พบ ${waterPoints.length} จุดวัดพร้อมพิกัด`);

        // 4. ดึงข้อมูลรายงานน้ำท่วม (Flood_DATA ประจำปี เช่น Flood_DATA_2568, Flood_DATA_2569)
        let floodDataRows = [];
        try {
            const candidateTables = [
                `Flood_DATA_${period}`,
                `flood_data_${period}`,
                `FLOOD_DATA_${period}`,
                'Flood_DATA',
                'flood_data'
            ];
            for (const tbl of candidateTables) {
                let query = sbClient.from(tbl).select('*');
                if (tbl === 'Flood_DATA' || tbl === 'flood_data') {
                    query = query.eq('period', period);
                }
                const fRes = await query;
                if (!fRes.error && Array.isArray(fRes.data)) {
                    if (fRes.data.length > 0) {
                        const cols = Object.keys(fRes.data[0]);
                        floodDataRows = [cols, ...fRes.data.map(item => cols.map(c => (item[c] !== null && item[c] !== undefined) ? item[c] : ''))];
                        console.log(`⚡ [Supabase] โหลด ${tbl} (ปี ${period}) สำเร็จ: พบข้อมูลจริง ${fRes.data.length} รายการ`);
                        break;
                    } else {
                        console.warn(`⚠️ [Supabase] เข้าถึงตาราง ${tbl} ได้แต่พบ 0 รายการ (หากใน Supabase มีข้อมูล ให้ตรวจสอบการตั้งค่า RLS Policy)`);
                        floodDataRows = [[
                            'ถนน', 'ที่อยู่', 'ชื่อ-สกุล', 'สถานะ', 'จำนวนผู้อาศัย',
                            'ติดต่อ', 'Latitude', 'Longtitude', 'ความเสี่ยง', 'รายละเอียด'
                        ]];
                        break;
                    }
                } else if (fRes.error && fRes.error.code !== 'PGRST205' && fRes.error.code !== '42P01') {
                    console.warn(`⚠️ [Supabase] ข้อผิดพลาดจาก ${tbl}:`, fRes.error.message);
                }
            }
        } catch (fErr) {
            console.warn("⚠️ [Supabase] ดึงข้อมูล Flood_DATA ปี " + period + " ไม่สำเร็จ:", fErr);
        }

        // 5. รวมรายการ Periods ทั้งหมดในระบบให้ครบถ้วน
        let dynamicPeriods = ['2569', '2568'];
        try {
            const savedPeriods = JSON.parse(localStorage.getItem('sb_saved_periods') || '[]');
            if (Array.isArray(savedPeriods)) {
                savedPeriods.forEach(p => { if (!dynamicPeriods.includes(p)) dynamicPeriods.push(p); });
            }
            if (period && !dynamicPeriods.includes(period)) {
                dynamicPeriods.push(period);
            }
        } catch (e) {}
        dynamicPeriods = [...new Set(dynamicPeriods)].sort((a, b) => b.localeCompare(a));

        // แปลงข้อมูลให้อยู่ในโครงสร้าง Array 2 มิติที่ระบบ Dashboard รองรับ 100%
        return {
            success: true,
            isFromSupabase: true,
            periods: dynamicPeriods,
            waterPoints: waterPoints,
            waterPointsMap: waterPointsMap,
            waterLevels: (wlRes.data || []).map(r => [
                r.recorded_at,
                r.location,
                r.level,
                r.reporter,
                r.trend,
                r.coords,
                r.file_url,
                r.note
            ]),
            evacuees: (evacRes.data || []).map(r => [
                r.registered_at,
                r.shelter,
                r.address,
                r.id_card,
                r.name,
                r.age,
                r.gender,
                r.phone,
                r.health_type,
                r.health_note,
                r.status,
                r.return_home_at
            ]),
            addresses: addresses,
            addressEvac: addressEvac,
            reliefData: (relRes.data || []).map(r => [
                r.distributed_at,
                r.name,
                r.status,
                r.members,
                r.address,
                r.regis_address
            ]),
            reliefStock: (stockRes.data || []).map(r => [
                r.logged_at,
                r.item_type,
                r.amount,
                r.note,
                r.user_name
            ]),
        // 6. ดึงภาพแผนที่พื้นที่เสี่ยงภัย (ระบบเก็บไว้ใน Supabase หรือ Google Drive)
        let riskMapImageUrl = "";
        const riskMapConfig = (polyRes.data || []).find(r => r.risk_level === 'system_config' || r.title === '__SYSTEM_RISK_MAP__');
        if (riskMapConfig && riskMapConfig.detail) {
            riskMapImageUrl = riskMapConfig.detail;
        }
        if (!riskMapImageUrl) {
            try {
                riskMapImageUrl = localStorage.getItem('risk_map_image_url') || "";
            } catch (e) {}
        }
        if (!riskMapImageUrl) {
            riskMapImageUrl = "https://lh3.googleusercontent.com/d/1tIGTXKoPI88Y_7-NSISSGPCuFy31Cfeh";
        }

        return {
            success: true,
            isFromSupabase: true,
            periods: dynamicPeriods,
            waterPoints: waterPoints,
            waterPointsMap: waterPointsMap,
            waterLevels: (wlRes.data || []).map(r => [
                r.recorded_at,
                r.location,
                r.level,
                r.reporter,
                r.trend,
                r.coords,
                r.file_url,
                r.note
            ]),
            evacuees: (evacRes.data || []).map(r => [
                r.registered_at,
                r.shelter,
                r.address,
                r.id_card,
                r.name,
                r.age,
                r.gender,
                r.phone,
                r.health_type,
                r.health_note,
                r.status,
                r.return_home_at
            ]),
            addresses: addresses,
            addressEvac: addressEvac,
            reliefData: (relRes.data || []).map(r => [
                r.distributed_at,
                r.name,
                r.status,
                r.members,
                r.address,
                r.regis_address
            ]),
            reliefStock: (stockRes.data || []).map(r => [
                r.logged_at,
                r.item_type,
                r.amount,
                r.note,
                r.user_name
            ]),
            floodPolygons: (polyRes.data || [])
                .filter(r => r.risk_level !== 'system_config' && r.title !== '__SYSTEM_RISK_MAP__')
                .map(r => [
                    r.created_at,
                    r.title,
                    r.detail,
                    r.risk_level,
                    typeof r.geojson === 'object' ? JSON.stringify(r.geojson) : (r.geojson || ''),
                    r.reporter,
                    r.period
                ]),
            evacReports: (repRes.data || []).map(r => [
                r.reported_at,
                r.address,
                r.people_count,
                r.dest_type,
                r.dest_name,
                r.reporter,
                r.coords,
                r.evacuee_name,
                r.status,
                r.note
            ]),
            users: (userRes.data || []).map(u => [u.username, u.role]),
            floodData: floodDataRows,
            riskMapImageUrl: riskMapImageUrl
        };

    } catch (err) {
        console.error("❌ [Supabase] โหลดข้อมูลล้มเหลว:", err);
        let fallbackRiskMap = "https://lh3.googleusercontent.com/d/1tIGTXKoPI88Y_7-NSISSGPCuFy31Cfeh";
        try {
            const cached = localStorage.getItem('risk_map_image_url');
            if (cached) fallbackRiskMap = cached;
        } catch (e) {}

        return {
            success: true,
            isFromSupabase: true,
            periods: ['2569', '2568'],
            waterPoints: [],
            waterPointsMap: {},
            waterLevels: [],
            evacuees: [],
            addresses: [],
            addressEvac: [],
            reliefData: [],
            reliefStock: [],
            floodPolygons: [],
            evacReports: [],
            floodData: [],
            riskMapImageUrl: fallbackRiskMap
        };
    }
}

// ==========================================
// 3. ฟังก์ชันบันทึกข้อมูลเข้า Supabase 100%
// ==========================================

async function sbSaveWater(payload) {
    if (!isSupabaseReady()) throw new Error('Supabase ไม่พร้อมใช้งาน');
    
    let coords = payload.coords || '';
    if (!coords && payload.location) {
        if (window.waterPointsMap && window.waterPointsMap[payload.location]) {
            coords = window.waterPointsMap[payload.location];
        } else {
            try {
                const { data } = await sbClient.from('water_points').select('*').eq('จุดวัดระดับน้ำ', payload.location.trim()).maybeSingle();
                if (data && data['พิกัด']) coords = data['พิกัด'];
            } catch (e) { /* ignore */ }
        }
    }

    const { error } = await sbClient.from('water_levels').insert([{
        recorded_at: new Date().toISOString(),
        location: payload.location,
        level: parseFloat(payload.level) || 0,
        reporter: payload.reporter,
        trend: payload.trend,
        coords: coords,
        file_url: payload.imageData || payload.fileUrl || '',
        note: payload.note || '',
        period: payload.period || '2569'
    }]);

    if (error) {
        console.error("❌ [Supabase] saveWater error:", error);
        throw new Error(error.message);
    }
    console.log("⚡ [Supabase 100%] บันทึกระดับน้ำสำเร็จ");
    return { success: true };
}

async function sbSaveEvacuee(payload) {
    if (!isSupabaseReady()) throw new Error('Supabase ไม่พร้อมใช้งาน');
    
    const { error } = await sbClient.from('evacuees').insert([{
        registered_at: new Date().toISOString(),
        shelter: payload.shelter,
        address: payload.address,
        id_card: String(payload.idCard || '').replace(/'/g, '').trim(),
        name: payload.name,
        age: parseInt(payload.age) || null,
        gender: payload.gender,
        phone: String(payload.phone || '').replace(/'/g, '').trim(),
        health_type: payload.healthType,
        health_note: payload.healthNote,
        status: 'พักพิงอยู่',
        period: payload.period || '2569'
    }]);

    if (error) {
        console.error("❌ [Supabase] saveEvacuee error:", error);
        throw new Error(error.message);
    }
    console.log("⚡ [Supabase 100%] บันทึกผู้ประสบภัยสำเร็จ");
    return { success: true };
}

async function sbMarkEvacueeReturnHome(idCard, name, period) {
    if (!isSupabaseReady()) throw new Error('Supabase ไม่พร้อมใช้งาน');
    
    const cleanId = String(idCard || '').replace(/'/g, '').trim();
    let query = sbClient.from('evacuees').update({
        status: 'กลับบ้านแล้ว',
        return_home_at: new Date().toISOString()
    });

    if (cleanId) {
        query = query.eq('id_card', cleanId);
    } else if (name) {
        query = query.eq('name', String(name).trim());
    }
    if (period) {
        query = query.eq('period', period);
    }

    const { error } = await query;
    if (error) {
        console.error("❌ [Supabase] markReturnHome error:", error);
        throw new Error(error.message);
    }
    console.log("⚡ [Supabase 100%] อัปเดตสถานะกลับบ้านสำเร็จ");
    return { success: true };
}

async function sbSaveRelief(payload) {
    if (!isSupabaseReady()) throw new Error('Supabase ไม่พร้อมใช้งาน');
    
    const { error } = await sbClient.from('relief_distribution').insert([{
        distributed_at: new Date().toISOString(),
        name: payload.name,
        status: payload.status,
        members: parseInt(payload.members) || 1,
        address: payload.address,
        regis_address: payload.regisAddress,
        period: payload.period || '2569'
    }]);

    if (error) {
        console.error("❌ [Supabase] saveRelief error:", error);
        throw new Error(error.message);
    }
    console.log("⚡ [Supabase 100%] บันทึกการแจกถุงยังชีพสำเร็จ");
    return { success: true };
}

async function sbSaveStock(payload) {
    if (!isSupabaseReady()) throw new Error('Supabase ไม่พร้อมใช้งาน');
    
    const { error } = await sbClient.from('relief_stock').insert([{
        logged_at: new Date().toISOString(),
        item_type: payload.type,
        amount: parseFloat(payload.amount) || 0,
        note: payload.note,
        user_name: payload.user,
        period: payload.period || '2569'
    }]);

    if (error) {
        console.error("❌ [Supabase] saveStock error:", error);
        throw new Error(error.message);
    }
    console.log("⚡ [Supabase 100%] บันทึกสต๊อกถุงยังชีพสำเร็จ");
    return { success: true };
}

async function sbSaveEvacuation(payload) {
    if (!isSupabaseReady()) throw new Error('Supabase ไม่พร้อมใช้งาน');
    
    const reportStatus = payload.status || 'อพยพ';
    const destType = (reportStatus === 'ปลอดภัย') ? '-' : payload.type;
    const destName = (reportStatus === 'ปลอดภัย') ? '-' : payload.dest;

    const { error } = await sbClient.from('evacuation_reports').insert([{
        reported_at: new Date().toISOString(),
        address: payload.address,
        people_count: parseInt(payload.count) || 1,
        dest_type: destType,
        dest_name: destName,
        reporter: payload.user,
        coords: payload.coords || '',
        evacuee_name: payload.evacName || '',
        status: reportStatus,
        note: payload.note || '',
        period: payload.period || '2569'
    }]);

    if (error) {
        console.error("❌ [Supabase] saveEvacuation error:", error);
        throw new Error(error.message);
    }

    // บันทึกพิกัดที่อยู่ใหม่เข้า address_evacuation ถ้ามีพิกัด
    if (payload.coords && payload.coords.includes(',')) {
        try {
            const [latStr, lngStr] = payload.coords.split(',');
            const lat = parseFloat(latStr.trim());
            const lng = parseFloat(lngStr.trim());
            if (!isNaN(lat) && !isNaN(lng)) {
                await sbClient.from('address_evacuation').upsert([{
                    Address: payload.address.trim(),
                    Latitude: lat,
                    Longtitude: lng
                }], { onConflict: 'Address' });
            }
        } catch (e) { /* ignore */ }
    }

    console.log("⚡ [Supabase 100%] บันทึกรายงานสถานะการอพยพสำเร็จ");
    return { success: true };
}

async function sbSaveFloodPolygon(payload) {
    if (!isSupabaseReady()) throw new Error('Supabase ไม่พร้อมใช้งาน');
    
    let geoData = payload.geoJson;
    if (typeof geoData === 'string' && geoData.trim().startsWith('{')) {
        try { geoData = JSON.parse(geoData); } catch (e) { /* keep as is */ }
    }

    const { error } = await sbClient.from('flood_polygons').insert([{
        created_at: new Date().toISOString(),
        title: payload.title || 'พื้นที่น้ำท่วม',
        detail: payload.detail || '',
        risk_level: payload.riskLevel || 'วิกฤต',
        geojson: geoData,
        reporter: payload.user || 'Admin',
        period: payload.period || '2569'
    }]);

    if (error) {
        console.error("❌ [Supabase] saveFloodPolygon error:", error);
        throw new Error(error.message);
    }
    console.log("⚡ [Supabase 100%] บันทึกพื้นที่น้ำท่วม One Map สำเร็จ");
    return { success: true };
}

// ระบบจัดการผู้ใช้งาน (User Management)
async function sbGetUsers() {
    if (!isSupabaseReady()) return [];
    try {
        const { data, error } = await sbClient.from('users').select('username, role').order('username');
        if (error || !data) return [];
        return data.map(u => [u.username, u.role]);
    } catch (e) {
        return [];
    }
}

async function sbSaveUser(username, role) {
    if (!isSupabaseReady()) throw new Error('Supabase ไม่พร้อมใช้งาน');
    const { error } = await sbClient.from('users').upsert([{
        username: username.trim(),
        role: role.trim()
    }], { onConflict: 'username' });

    if (error) throw new Error(error.message);
    console.log("⚡ [Supabase 100%] บันทึกผู้ใช้สำเร็จ");
    return { success: true };
}

async function sbDeleteUser(username) {
    if (!isSupabaseReady()) throw new Error('Supabase ไม่พร้อมใช้งาน');
    const { error } = await sbClient.from('users').delete().eq('username', username.trim());
    if (error) throw new Error(error.message);
    console.log("⚡ [Supabase 100%] ลบผู้ใช้สำเร็จ");
    return { success: true };
}

// สร้างช่วงเวลาใหม่ (New Period)
async function sbCreateNewPeriod(newPeriod) {
    if (!newPeriod) return { success: false, error: 'กรุณาระบุช่วงเวลา' };
    try {
        let saved = [];
        try {
            saved = JSON.parse(localStorage.getItem('sb_saved_periods') || '[]');
        } catch (e) { saved = []; }
        if (!saved.includes(newPeriod)) {
            saved.push(newPeriod);
            localStorage.setItem('sb_saved_periods', JSON.stringify(saved));
        }
        console.log(`⚡ [Supabase 100%] กำหนดช่วงเวลาใหม่สำเร็จ: ${newPeriod}`);
        return { success: true, period: newPeriod };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// บันทึก URL รูปภาพแผนที่พื้นที่เสี่ยงภัยเข้า Supabase
async function sbSaveRiskMapUrl(url) {
    if (!isSupabaseReady() || !url) return false;
    try {
        await sbClient.from('flood_polygons').delete().eq('risk_level', 'system_config');
        const { error } = await sbClient.from('flood_polygons').insert([{
            title: '__SYSTEM_RISK_MAP__',
            detail: url,
            risk_level: 'system_config',
            reporter: 'admin',
            period: 'all'
        }]);
        if (error) {
            console.warn("⚠️ [Supabase] sbSaveRiskMapUrl error:", error);
            return false;
        }
        console.log("⚡ [Supabase 100%] บันทึก URL ภาพแผนที่พื้นที่เสี่ยงสำเร็จ:", url);
        return true;
    } catch (e) {
        console.warn("⚠️ [Supabase] sbSaveRiskMapUrl exception:", e);
        return false;
    }
}

// Initialize ทันที
initSupabase();
