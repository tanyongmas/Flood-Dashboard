/**
 * TMCare Bridge Module
 * เชื่อมโยงข้อมูลผู้พิการ กลุ่มเปราะบาง และสถานะภัยพิบัติ/EMS จากระบบ TMCare (GAS)
 * เข้ากับ Flood-Dashboard (หน้ารายงานข้อมูลน้ำท่วม, กระดิ่งแจ้งเตือน, และ One Map)
 */

(function () {
    const TMCARE_CACHE_KEY = 'tmcare_disaster_data_v1';
    const TMCARE_CACHE_TTL_MIN = 3;

    window.tmcareState = {
        loaded: false,
        loading: false,
        beneficiaries: [],
        statuses: [],
        emergencyCases: [],
        rowMetaMap: {},
        updatedAt: null,
        error: null
    };

    let _inFlightTMCarePromise = null;

    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ย่อที่อยู่ให้กระชับสำหรับแสดงในตาราง (ตัด ต./อ./จ./รหัสไปรษณีย์ ท้ายที่อยู่)
    window.formatCompactThaiAddress = function (addr) {
        let s = String(addr || '').trim();
        if (!s) return '-';
        s = s
            .replace(/\s*(ต\.|ตำบล)\s*ตันหยงมัส/gi, '')
            .replace(/\s*(อ\.|อำเภอ)\s*ระแงะ/gi, '')
            .replace(/\s*(จ\.|จังหวัด)\s*นราธิวาส/gi, '')
            .replace(/\s*96130/g, '')
            .replace(/\s{2,}/g, ' ')
            .replace(/^[,\s-]+|[,\s-]+$/g, '')
            .trim();
        return s || String(addr || '').trim();
    };

    function getTMCareApiUrl() {
        return (typeof TMCARE_GAS_API_URL !== 'undefined' && TMCARE_GAS_API_URL)
            ? String(TMCARE_GAS_API_URL).trim()
            : '';
    }

    window.isTMCareShelterDestination = function (shelterName) {
        const s = String(shelterName || '').trim();
        if (!s || s === '-') return false;
        return s.includes('ศูนย์') || s.includes('เทศบาล') || s.includes('มัสยิด') || s.includes('เขาพระ');
    };

    function getTMCareEvacStatusMeta(evacStatus, shelterName) {
        const st = String(evacStatus || 'safe_at_home').trim();
        if (st === 'need_help') {
            return {
                key: 'need_help',
                destType: '',
                label: '🚨 ขอความช่วยเหลือ',
                shortLabel: 'ขอความช่วยเหลือ',
                badgeClass: 'bg-rose-600 text-white animate-pulse',
                dotClass: 'bg-rose-600 border-rose-200',
                pingClass: 'bg-rose-500',
                pinBg: 'bg-rose-600',
                isEmergency: true
            };
        }
        if (st === 'need_evacuation') {
            return {
                key: 'need_evacuation',
                destType: '',
                label: '🏃 ต้องการอพยพ',
                shortLabel: 'ต้องการอพยพ',
                badgeClass: 'bg-orange-500 text-white animate-pulse',
                dotClass: 'bg-orange-500 border-orange-200',
                pingClass: 'bg-orange-400',
                pinBg: 'bg-orange-500',
                isEmergency: true
            };
        }
        if (st === 'evacuated') {
            const isShelter = window.isTMCareShelterDestination(shelterName);
            const sh = (shelterName && shelterName !== '-') ? ` (${shelterName})` : '';
            if (isShelter) {
                return {
                    key: 'evacuated',
                    destType: 'shelter',
                    label: `🏕️ อพยพเข้าศูนย์${sh}`,
                    shortLabel: 'อพยพเข้าศูนย์',
                    badgeClass: 'bg-blue-600 text-white',
                    dotClass: 'bg-blue-600 border-blue-200',
                    pingClass: '',
                    pinBg: 'bg-blue-600',
                    isEmergency: false
                };
            }
            return {
                key: 'evacuated',
                destType: 'other',
                label: `🏠 อพยพบ้านญาติ/อื่นๆ${sh}`,
                shortLabel: 'อพยพบ้านญาติ/อื่นๆ',
                badgeClass: 'bg-purple-600 text-white',
                dotClass: 'bg-purple-600 border-purple-200',
                pingClass: '',
                pinBg: 'bg-purple-600',
                isEmergency: false
            };
        }
        return {
            key: 'safe_at_home',
            destType: '',
            label: 'ปลอดภัยที่บ้าน',
            shortLabel: 'ปลอดภัยที่บ้าน',
            badgeClass: 'bg-emerald-100 text-emerald-700',
            dotClass: 'bg-emerald-500 border-emerald-200',
            pingClass: '',
            pinBg: 'bg-emerald-600',
            isEmergency: false
        };
    }
    window.getTMCareEvacStatusMeta = getTMCareEvacStatusMeta;

    function normalizeTMCareTriageLevel(rawLevel) {
        const t = String(rawLevel || 'green').toLowerCase().trim();
        if (t === 'red' || t.includes('แดง')) return 'red';
        if (t === 'yellow' || t.includes('เหลือง')) return 'yellow';
        return 'green';
    }

    function classifyTMCareRiskGroup(b) {
        const triage = normalizeTMCareTriageLevel(b && (b.triageLevel || b.triage_level));
        if (triage === 'red') {
            return 'กลุ่มเปราะบาง';
        }
        return 'กลุ่มผู้พิการ/ผู้สูงอายุ';
    }

    window.getTMCareGroupBadgeMeta = function (triageLevel, riskGroup) {
        const t = normalizeTMCareTriageLevel(triageLevel);
        if (t === 'red' || String(riskGroup || '').trim() === 'กลุ่มเปราะบาง') {
            return {
                triage: 'red',
                dotEmoji: '🔴',
                label: '🔴 กลุ่มเปราะบาง',
                badgeClass: 'bg-rose-100 text-rose-700 border border-rose-200'
            };
        }
        if (t === 'yellow') {
            return {
                triage: 'yellow',
                dotEmoji: '🟡',
                label: '🟡 กลุ่มผู้พิการ/ผู้สูงอายุ',
                badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200'
            };
        }
        return {
            triage: 'green',
            dotEmoji: '🟢',
            label: '🟢 กลุ่มผู้พิการ/ผู้สูงอายุ',
            badgeClass: 'bg-emerald-100 text-emerald-700 border border-emerald-200'
        };
    };

    function getTriageLabel(triageLevel) {
        const t = normalizeTMCareTriageLevel(triageLevel);
        if (t === 'red') return '🔴 สีแดง (ติดเตียง/พึ่งพิงสูง)';
        if (t === 'yellow') return '🟡 สีเหลือง (พึ่งพิงปานกลาง)';
        return '🟢 สีเขียว (ช่วยเหลือตนเองได้)';
    }

    function buildTMCareStateFromRaw(beneficiariesRaw, statusesRaw) {
        const activeBeneficiaries = (Array.isArray(beneficiariesRaw) ? beneficiariesRaw : []).filter(b => {
            if (!b) return false;
            const living = String(b.livingStatus || b.living_status || 'active').toLowerCase().trim();
            return living !== 'deceased' && living !== 'moved' && living !== 'inactive';
        });

        const statusMap = {};
        (Array.isArray(statusesRaw) ? statusesRaw : []).forEach(s => {
            if (!s) return;
            const bid = String(s.beneficiaryId || s.beneficiary_id || '').trim();
            if (bid) statusMap[bid] = s;
        });

        const rowMetaMap = {};
        const emergencyCases = [];

        activeBeneficiaries.forEach(b => {
            const bid = String(b.id || '').trim();
            if (!bid) return;
            const statusObj = statusMap[bid] || null;
            const evacStatus = statusObj ? (statusObj.evacStatus || statusObj.evac_status || 'safe_at_home') : 'safe_at_home';
            const shelterName = statusObj ? (statusObj.shelterName || statusObj.shelter_name || '-') : '-';
            const needsDetail = statusObj ? (statusObj.needsDetail || statusObj.needs_detail || '') : '';
            const statusUpdatedAt = statusObj ? (statusObj.updatedAt || statusObj.updated_at || b.updatedAt || b.updated_at || '') : (b.updatedAt || b.updated_at || '');
            const statusMeta = getTMCareEvacStatusMeta(evacStatus, shelterName);
            const fullName = `${b.prefix || ''}${b.firstName || b.first_name || ''} ${b.lastName || b.last_name || ''}`.replace(/\s+/g, ' ').trim() || 'ไม่ระบุชื่อ';
            const riskGroup = classifyTMCareRiskGroup(b);

            const meta = {
                beneficiaryId: bid,
                tmcareKey: `tmcare:${bid}`,
                communityId: b.communityId || b.community_id || '',
                fullName,
                address: String(b.address || '').trim(),
                lat: parseFloat(b.lat || 0),
                lng: parseFloat(b.lng || 0),
                phone: String(b.phone || '').trim(),
                caregiverName: String(b.caregiverName || b.caregiver_name || '').trim(),
                caregiverPhone: String(b.caregiverPhone || b.caregiver_phone || '').trim(),
                vulnerabilityType: String(b.vulnerabilityType || b.vulnerability_type || '').trim(),
                disabilityTypes: Array.isArray(b.disabilityTypes) ? b.disabilityTypes : [],
                triageLevel: String(b.triageLevel || b.triage_level || 'green').toLowerCase().trim(),
                chronicDiseases: String(b.chronicDiseases || b.chronic_diseases || '').trim(),
                drugAllergies: String(b.drugAllergies || b.drug_allergies || '').trim(),
                medicalDevices: String(b.medicalDevices || b.medical_devices || '').trim(),
                hospitalRef: String(b.hospitalRef || b.hospital_ref || 'รพ.ระแงะ').trim(),
                riskGroup,
                evacStatus,
                shelterName,
                needsDetail,
                statusUpdatedAt,
                statusMeta
            };

            rowMetaMap[meta.tmcareKey] = meta;
            rowMetaMap[bid] = meta;

            if (statusMeta.isEmergency) {
                emergencyCases.push(meta);
            }
        });

        window.tmcareState = {
            loaded: true,
            loading: false,
            beneficiaries: activeBeneficiaries,
            statuses: Array.isArray(statusesRaw) ? statusesRaw : [],
            emergencyCases,
            rowMetaMap,
            updatedAt: new Date().toISOString(),
            error: null
        };
    }

    function notifyAllTMCareConsumers() {
        if (typeof window.filterFloodMap === 'function') {
            try { window.filterFloodMap(); } catch (e) { console.warn('TMCare refresh filterFloodMap:', e); }
        }
        if (typeof window.renderDashOneMapLayers === 'function') {
            try { window.renderDashOneMapLayers(); } catch (e) { console.warn('TMCare refresh OneMap:', e); }
        }
        if (typeof window.refreshNotificationBell === 'function') {
            try { window.refreshNotificationBell(); } catch (e) { console.warn('TMCare refresh Bell:', e); }
        }
        if (typeof window.loadEvacuationMarkers === 'function') {
            try { window.loadEvacuationMarkers(); } catch (e) { console.warn('TMCare refresh EvacMap:', e); }
        }
        if (typeof window.renderEvacTMCareTab === 'function') {
            try { window.renderEvacTMCareTab(); } catch (e) { console.warn('TMCare refresh EvacTab:', e); }
        }
        const tabBadge = document.getElementById('evacTMCareTabBadge');
        if (tabBadge && window.tmcareState.loaded) {
            const emerg = window.tmcareState.emergencyCases.length;
            if (emerg > 0) {
                tabBadge.innerText = String(emerg);
                tabBadge.classList.remove('hidden');
            } else {
                tabBadge.classList.add('hidden');
            }
        }
        const badgeEl = document.getElementById('tmcareSyncStatusBadge');
        if (badgeEl && window.tmcareState.loaded) {
            const total = window.tmcareState.beneficiaries.length;
            const emerg = window.tmcareState.emergencyCases.length;
            badgeEl.innerHTML = emerg > 0
                ? `<i class="fas fa-link mr-1"></i>TMCare: ${total} คน (<span class="text-rose-600 font-black">ฉุกเฉิน ${emerg}</span>)`
                : `<i class="fas fa-link mr-1"></i>TMCare: ${total} คน`;
            badgeEl.classList.remove('hidden');
        }
    }

    window.fetchTMCareDisasterData = async function (forceRefresh = false) {
        if (typeof ENABLE_TMCARE_SYNC !== 'undefined' && !ENABLE_TMCARE_SYNC) return null;
        const apiUrl = getTMCareApiUrl();
        if (!apiUrl) return null;

        if (!forceRefresh && typeof window.getAppCache === 'function') {
            const cached = window.getAppCache(TMCARE_CACHE_KEY);
            if (cached && Array.isArray(cached.beneficiaries)) {
                buildTMCareStateFromRaw(cached.beneficiaries, cached.disasterStatuses || []);
                notifyAllTMCareConsumers();
                return window.tmcareState;
            }
        }

        if (_inFlightTMCarePromise && !forceRefresh) {
            return _inFlightTMCarePromise;
        }

        window.tmcareState.loading = true;
        const run = (async () => {
            try {
                const res = await fetch(`${apiUrl}?action=getAllData`, {
                    method: 'GET',
                    redirect: 'follow',
                    headers: { 'Accept': 'application/json' }
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!data || data.status === 'error' || !Array.isArray(data.beneficiaries)) {
                    throw new Error((data && data.message) || 'รูปแบบข้อมูล TMCare ไม่ถูกต้อง');
                }

                if (typeof window.setAppCache === 'function') {
                    window.setAppCache(TMCARE_CACHE_KEY, {
                        beneficiaries: data.beneficiaries,
                        disasterStatuses: data.disasterStatuses || []
                    }, TMCARE_CACHE_TTL_MIN);
                }

                buildTMCareStateFromRaw(data.beneficiaries, data.disasterStatuses || []);
                console.log(`🏥 [TMCare Bridge] ซิงก์สำเร็จ: ${window.tmcareState.beneficiaries.length} รายชื่อ (ฉุกเฉิน ${window.tmcareState.emergencyCases.length} ราย)`);
                notifyAllTMCareConsumers();
                return window.tmcareState;
            } catch (err) {
                console.warn('⚠️ [TMCare Bridge] ซิงก์ไม่สำเร็จ (ใช้ข้อมูล Flood_DATA เดิมแทน):', err);
                window.tmcareState.loading = false;
                window.tmcareState.error = err.message || String(err);
                return null;
            } finally {
                _inFlightTMCarePromise = null;
            }
        })();

        _inFlightTMCarePromise = run;
        return run;
    };

    window.syncTMCareDataManual = async function () {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'info',
                title: 'กำลังซิงก์ข้อมูลจาก TMCare...',
                showConfirmButton: false,
                timer: 1500
            });
        }
        const st = await window.fetchTMCareDisasterData(true);
        if (typeof Swal !== 'undefined') {
            if (st && st.loaded) {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: `ซิงก์ TMCare สำเร็จ (${st.beneficiaries.length} รายชื่อ / ฉุกเฉิน ${st.emergencyCases.length})`,
                    showConfirmButton: false,
                    timer: 2200
                });
            } else {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'warning',
                    title: 'ไม่สามารถเชื่อมต่อ TMCare ได้ชั่วคราว',
                    showConfirmButton: false,
                    timer: 2200
                });
            }
        }
    };

    window.buildMergedFloodDataWithTMCare = function (rawFloodData) {
        const hasRaw = Array.isArray(rawFloodData) && rawFloodData.length > 0;
        const headers = hasRaw
            ? [...rawFloodData[0]]
            : ['id', 'ถนน', 'ที่อยู่', 'ชื่อ-สกุล', 'สถานะ', 'จำนวนผู้อาศัย', 'ติดต่อ', 'Latitude', 'Longtitude', 'ความเสี่ยง', 'รายละเอียด'];

        if (!window.tmcareState || !window.tmcareState.loaded || window.tmcareState.beneficiaries.length === 0) {
            return hasRaw ? rawFloodData : [headers];
        }

        const cleanHeaders = headers.map(h => String(h || '').trim().toLowerCase());
        const findIdx = (kws, exactOnly = false) => {
            const exact = cleanHeaders.findIndex(c => kws.some(kw => c === kw.toLowerCase()));
            if (exact !== -1 || exactOnly) return exact;
            return cleanHeaders.findIndex(c => kws.some(kw => c.includes(kw.toLowerCase()) || kw.toLowerCase().includes(c)));
        };

        let idIdx = findIdx(['id', 'rowid', 'row_id'], true);
        if (idIdx === -1) {
            headers.push('id');
            idIdx = headers.length - 1;
        }
        const roadIdx = findIdx(['ถนน', 'road']);
        const addressIdx = findIdx(['ที่อยู่', 'address']);
        const nameIdx = findIdx(['ชื่อ-สกุล', 'ชื่อสกุล', 'ชื่อ', 'name']);
        const statusIdx = findIdx(['สถานะ', 'status']);
        const residentsIdx = findIdx(['จำนวนผู้อาศัย', 'ประชากร', 'จำนวนสมาชิก', 'สมาชิก', 'people', 'members', 'population', 'residents']);
        const contactIdx = findIdx(['ติดต่อ', 'เบอร์', 'phone', 'contact']);
        const latIdx = findIdx(['latitude', 'ละติจูด', 'lat']);
        const lngIdx = findIdx(['longtitude', 'longitude', 'ลองจิจูด', 'lng']);
        const riskIdx = findIdx(['ความเสี่ยง', 'risk']);
        const detailsIdx = findIdx(['รายละเอียด', 'note', 'detail', 'details']);

        // กรองแถวเดิมใน Flood_DATA ที่เป็นกลุ่มผู้พิการ/ผู้สูงอายุ หรือ กลุ่มเปราะบาง ออก (ใช้ข้อมูลสดจาก TMCare แทน)
        const baseRows = hasRaw ? rawFloodData.slice(1).filter(r => {
            const risk = riskIdx !== -1 ? String(r[riskIdx] || '') : '';
            const detail = detailsIdx !== -1 ? String(r[detailsIdx] || '') : '';
            if (typeof window.getFloodRiskCategory === 'function') {
                const cat = window.getFloodRiskCategory(risk, detail);
                if (cat.key === 'vulnerable' || cat.key === 'elderly_disabled') return false;
            } else if (risk.includes('เปราะบาง') || risk.includes('พิการ') || risk.includes('ผู้สูงอายุ')) {
                return false;
            }
            return true;
        }) : [];

        // แปลงรายชื่อ TMCare เป็นแถวมาตรฐานของ Flood_DATA
        const tmcareRows = window.tmcareState.beneficiaries.map(b => {
            const bid = String(b.id || '').trim();
            const meta = window.tmcareState.rowMetaMap[`tmcare:${bid}`];
            if (!meta) return null;

            const row = new Array(headers.length).fill('');
            row[idIdx] = meta.tmcareKey;
            if (nameIdx !== -1) row[nameIdx] = meta.fullName;
            if (addressIdx !== -1) row[addressIdx] = meta.address || 'ไม่ระบุที่อยู่';
            if (roadIdx !== -1) row[roadIdx] = '';
            if (statusIdx !== -1) row[statusIdx] = meta.statusMeta.label;
            if (residentsIdx !== -1) row[residentsIdx] = 1;
            if (contactIdx !== -1) row[contactIdx] = meta.caregiverPhone || meta.phone || '-';
            if (latIdx !== -1) row[latIdx] = !isNaN(meta.lat) && meta.lat !== 0 ? meta.lat : '';
            if (lngIdx !== -1) row[lngIdx] = !isNaN(meta.lng) && meta.lng !== 0 ? meta.lng : '';
            if (riskIdx !== -1) row[riskIdx] = meta.riskGroup;

            const detailParts = [
                getTriageLabel(meta.triageLevel),
                meta.vulnerabilityType ? `ประเภท: ${meta.vulnerabilityType}` : '',
                meta.medicalDevices ? `อุปกรณ์: ${meta.medicalDevices}` : '',
                meta.needsDetail ? `ความต้องการ: ${meta.needsDetail}` : '',
                meta.caregiverName ? `ผู้ดูแล: ${meta.caregiverName}` : ''
            ].filter(Boolean);
            if (detailsIdx !== -1) row[detailsIdx] = detailParts.join(' • ');

            return row;
        }).filter(Boolean);

        // นำเคสฉุกเฉินจาก TMCare ขึ้นต้นตาราง
        tmcareRows.sort((a, b) => {
            const ma = window.tmcareState.rowMetaMap[a[idIdx]];
            const mb = window.tmcareState.rowMetaMap[b[idIdx]];
            const score = (m) => !m ? 0 : (m.evacStatus === 'need_help' ? 3 : (m.evacStatus === 'need_evacuation' ? 2 : (m.triageLevel === 'red' ? 1 : 0)));
            return score(mb) - score(ma);
        });

        return [headers, ...tmcareRows, ...baseRows];
    };

    function showTMCareEmsCardContent(meta, allowStatusUpdate) {
        const triageHtml = getTriageLabel(meta.triageLevel);
        const disList = (meta.disabilityTypes && meta.disabilityTypes.length > 0) ? meta.disabilityTypes.join(', ') : '-';

        Swal.fire({
            title: `<div class="text-sm font-black text-rose-700 flex items-center justify-center gap-2"><i class="fas fa-kit-medical"></i> การ์ดฉุกเฉิน EMS (TMCare)</div>`,
            html: `
                <div class="text-left space-y-2.5 text-xs">
                    <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                        <div>
                            <div class="text-sm font-black text-slate-800">${esc(meta.fullName)}</div>
                            <div class="text-[11px] text-slate-500 mt-0.5"><i class="fas fa-map-marker-alt text-rose-500 mr-1"></i>${esc(meta.address || '-')}</div>
                        </div>
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 ${meta.statusMeta.badgeClass}">${esc(meta.statusMeta.label)}</span>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <div class="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/70">
                            <div class="text-[10px] font-bold text-rose-700">ระดับคัดกรอง (Triage)</div>
                            <div class="font-black text-slate-800 mt-0.5">${esc(triageHtml)}</div>
                        </div>
                        <div class="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/70">
                            <div class="text-[10px] font-bold text-blue-700">ประเภท / กลุ่ม</div>
                            <div class="font-bold text-slate-800 mt-0.5">${esc(meta.vulnerabilityType || meta.riskGroup)}</div>
                        </div>
                    </div>

                    <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5">
                        <div><span class="text-slate-400 font-bold">ความพิการ:</span> <span class="font-bold text-slate-700">${esc(disList)}</span></div>
                        <div><span class="text-slate-400 font-bold">โรคประจำตัว:</span> <span class="font-bold text-slate-700">${esc(meta.chronicDiseases || '-')}</span></div>
                        <div><span class="text-slate-400 font-bold">ประวัติแพ้ยา:</span> <span class="font-bold text-rose-600">${esc(meta.drugAllergies || 'ไม่มีข้อมูล')}</span></div>
                        <div><span class="text-slate-400 font-bold">อุปกรณ์การแพทย์:</span> <span class="font-bold text-indigo-700">${esc(meta.medicalDevices || '-')}</span></div>
                        <div><span class="text-slate-400 font-bold">รพ.ส่งต่อ:</span> <span class="font-bold text-slate-700">${esc(meta.hospitalRef || 'รพ.ระแงะ')}</span></div>
                        <div><span class="text-slate-400 font-bold">พิกัด GPS:</span> <span class="font-mono text-[11px] font-bold text-slate-700">${(!isNaN(meta.lat) && meta.lat) ? `${meta.lat.toFixed(6)}, ${meta.lng.toFixed(6)}` : '-'}</span></div>
                        ${meta.needsDetail ? `<div><span class="text-slate-400 font-bold">ความต้องการเร่งด่วน:</span> <span class="font-bold text-rose-700">${esc(meta.needsDetail)}</span></div>` : ''}
                    </div>

                    <div class="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                        <div>
                            <div class="text-[10px] font-bold text-emerald-700">ผู้ดูแล / เบอร์ติดต่อ</div>
                            <div class="font-bold text-slate-800">${esc(meta.caregiverName || '-')} (${esc(meta.caregiverPhone || meta.phone || '-')})</div>
                        </div>
                        ${(meta.caregiverPhone || meta.phone) ? `<a href="tel:${esc(meta.caregiverPhone || meta.phone)}" class="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-[11px] shrink-0"><i class="fas fa-phone mr-1"></i>โทร</a>` : ''}
                    </div>
                </div>
            `,
            showCancelButton: !!allowStatusUpdate,
            confirmButtonText: allowStatusUpdate ? '<i class="fas fa-arrows-rotate mr-1"></i> อัปเดตสถานะในหน้ารายงานสถานะ' : 'ปิดหน้าต่าง',
            cancelButtonText: 'ปิด',
            confirmButtonColor: allowStatusUpdate ? '#2563eb' : '#475569',
            width: '460px',
            customClass: { popup: 'rounded-3xl' }
        }).then(res => {
            if (allowStatusUpdate && res.isConfirmed) {
                window.openEvacTMCareForBeneficiary(meta.beneficiaryId);
            }
        });
    }

    window.openTMCareEmsCardModal = function (beneficiaryId, allowStatusUpdate = false) {
        const key = String(beneficiaryId || '').replace(/^tmcare:/, '');
        const meta = window.tmcareState.rowMetaMap[key] || window.tmcareState.rowMetaMap[`tmcare:${key}`];
        if (!meta || typeof Swal === 'undefined') return;

        // บังคับยืนยันรหัสผ่าน PDPA ก่อนเปิดดูข้อมูลสุขภาพ/EMS
        if (typeof promptPdpaSecurityPin === 'function') {
            promptPdpaSecurityPin(`การ์ด EMS: ${meta.fullName}`, () => {
                const staffName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : 'เจ้าหน้าที่';
                console.log(`🔒 [PDPA Audit] ${new Date().toISOString()} - User: ${staffName} accessed TMCare EMS card of: ${meta.fullName} (ID: ${meta.beneficiaryId})`);
                showTMCareEmsCardContent(meta, allowStatusUpdate);
            });
        } else {
            showTMCareEmsCardContent(meta, allowStatusUpdate);
        }
    };

    window.openTMCareStatusUpdateModal = async function (beneficiaryId) {
        const key = String(beneficiaryId || '').replace(/^tmcare:/, '');
        const meta = window.tmcareState.rowMetaMap[key] || window.tmcareState.rowMetaMap[`tmcare:${key}`];
        if (!meta || typeof Swal === 'undefined') return;

        const { value: formVal } = await Swal.fire({
            title: '<div class="text-sm font-black text-blue-800"><i class="fas fa-arrows-rotate mr-1.5"></i>อัปเดตสถานะภัยพิบัติ (ซิงก์กลับ TMCare)</div>',
            html: `
                <div class="text-left space-y-3 text-xs mt-2">
                    <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <div class="font-black text-slate-800">${esc(meta.fullName)}</div>
                        <div class="text-[11px] text-slate-500">${esc(meta.address || '-')}</div>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-600 mb-1">สถานะการช่วยเหลือ / อพยพ:</label>
                        <select id="tmcare_upd_status" class="w-full p-2.5 rounded-xl border border-slate-200 font-bold text-slate-800">
                            <option value="safe_at_home" ${meta.evacStatus === 'safe_at_home' ? 'selected' : ''}>✅ ปลอดภัยที่บ้าน</option>
                            <option value="need_help" ${meta.evacStatus === 'need_help' ? 'selected' : ''}>🚨 ขอความช่วยเหลือ</option>
                            <option value="need_evacuation" ${meta.evacStatus === 'need_evacuation' ? 'selected' : ''}>🏃 ต้องการอพยพ</option>
                            <option value="evacuated" ${meta.evacStatus === 'evacuated' ? 'selected' : ''}>🏕️ อพยพแล้ว</option>
                        </select>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-600 mb-1">ศูนย์พักพิง / สถานที่อพยพ (ถ้ามี):</label>
                        <input id="tmcare_upd_shelter" type="text" value="${esc(meta.shelterName && meta.shelterName !== '-' ? meta.shelterName : '')}"
                            class="w-full p-2.5 rounded-xl border border-slate-200 text-slate-800"
                            placeholder="เช่น ศูนย์เทศบาลตำบลตันหยงมัส">
                    </div>
                    <div>
                        <label class="block font-bold text-slate-600 mb-1">หมายเหตุ / ความต้องการเพิ่มเติม:</label>
                        <textarea id="tmcare_upd_needs" rows="2" class="w-full p-2.5 rounded-xl border border-slate-200 text-slate-800"
                            placeholder="เช่น ส่งรถรับแล้ว / ต้องการถังออกซิเจน">${esc(meta.needsDetail || '')}</textarea>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'บันทึกและซิงก์ไป TMCare',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#2563eb',
            width: '420px',
            customClass: { popup: 'rounded-3xl' },
            preConfirm: () => ({
                evacStatus: document.getElementById('tmcare_upd_status').value,
                shelterName: document.getElementById('tmcare_upd_shelter').value.trim() || '-',
                needsDetail: document.getElementById('tmcare_upd_needs').value.trim()
            })
        });

        if (!formVal) return;

        const apiUrl = getTMCareApiUrl();
        if (!apiUrl) return;

        Swal.fire({
            title: 'กำลังอัปเดตสถานะไปยัง TMCare...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const payload = {
                beneficiaryId: meta.beneficiaryId,
                communityId: meta.communityId,
                evacStatus: formVal.evacStatus,
                shelterName: formVal.shelterName,
                needsDetail: formVal.needsDetail,
                updatedAt: new Date().toISOString()
            };

            const res = await fetch(`${apiUrl}?action=updateDisasterStatus`, {
                method: 'POST',
                redirect: 'follow',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data && data.status === 'error') throw new Error(data.message || 'อัปเดตไม่สำเร็จ');

            // อัปเดตสถานะในหน่วยความจำทันทีแล้วรีเฟรช UI ทั้ง 3 จุด
            const nextStatuses = [...(window.tmcareState.statuses || [])];
            const idx = nextStatuses.findIndex(s => String(s.beneficiaryId || s.beneficiary_id) === meta.beneficiaryId);
            if (idx >= 0) nextStatuses[idx] = Object.assign({}, nextStatuses[idx], payload);
            else nextStatuses.push(payload);

            buildTMCareStateFromRaw(window.tmcareState.beneficiaries, nextStatuses);
            if (typeof window.setAppCache === 'function') {
                window.setAppCache(TMCARE_CACHE_KEY, {
                    beneficiaries: window.tmcareState.beneficiaries,
                    disasterStatuses: nextStatuses
                }, TMCARE_CACHE_TTL_MIN);
            }
            notifyAllTMCareConsumers();

            Swal.fire({
                icon: 'success',
                title: 'อัปเดตสถานะ TMCare สำเร็จ',
                text: 'ซิงก์สถานะไปยังระบบ TMCare และอัปเดตหน้าแผนที่เรียบร้อยแล้ว',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'อัปเดตสถานะไม่สำเร็จ',
                text: err.message || String(err)
            });
        }
    };

    // ==========================================
    // 🏥 แท็บ TMCare ในหน้ารายงานสถานะ (#evacuationPage)
    // ==========================================
    window.switchEvacuationTab = function (tabName) {
        const isTMCare = tabName === 'tmcare';
        const generalPanel = document.getElementById('evacTabGeneralPanel');
        const tmcarePanel = document.getElementById('evacTabTMCarePanel');
        const btnGeneral = document.getElementById('btnEvacTabGeneral');
        const btnTMCare = document.getElementById('btnEvacTabTMCare');

        if (generalPanel) generalPanel.classList.toggle('hidden', isTMCare);
        if (tmcarePanel) tmcarePanel.classList.toggle('hidden', !isTMCare);

        if (btnGeneral) {
            btnGeneral.className = isTMCare
                ? 'px-3 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-slate-600 hover:bg-slate-100'
                : 'px-3 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1.5 bg-blue-600 text-white shadow-sm';
        }
        if (btnTMCare) {
            btnTMCare.className = isTMCare
                ? 'px-3 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1.5 bg-rose-600 text-white shadow-sm'
                : 'px-3 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200';
        }

        if (isTMCare) {
            if (!window.tmcareState.loaded && typeof window.fetchTMCareDisasterData === 'function') {
                window.fetchTMCareDisasterData(false);
            }
            window.renderEvacTMCareTab();
        } else if (typeof evacMap !== 'undefined' && evacMap && typeof evacMap.invalidateSize === 'function') {
            setTimeout(() => evacMap.invalidateSize(), 150);
        }
    };

    window.focusTMCareOnEvacMap = function (lat, lng) {
        window.switchEvacuationTab('general');
        if (typeof evacMap !== 'undefined' && evacMap && !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
            setTimeout(() => {
                evacMap.invalidateSize();
                evacMap.setView([lat, lng], 17, { animate: true });
            }, 220);
        }
    };

    window.openEvacTMCareForBeneficiary = function (beneficiaryId) {
        const key = String(beneficiaryId || '').replace(/^tmcare:/, '');
        if (typeof showPage === 'function') showPage('evacuation');
        window.switchEvacuationTab('tmcare');
        setTimeout(() => {
            const sel = document.getElementById('evacTMCareSelect');
            if (sel) {
                sel.value = key;
                window.onSelectEvacTMCareBeneficiary(key);
                sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 180);
    };

    let _tmcareMiniMap = null;
    let _tmcareMiniMarker = null;
    let _selectedTMCareDestKey = '';

    const TMCARE_SHELTERS = [
        'ศูนย์เทศบาลตำบลตันหยงมัส',
        'ศูนย์มัสยิดตันหยงมัส',
        'ศูนย์โรงเรียนบ้านเขาพระ'
    ];

    window.initEvacTMCareMiniMap = function (lat, lng) {
        const mapEl = document.getElementById('evacTMCareMiniMap');
        if (!mapEl || typeof L === 'undefined') return;

        const defaultLat = (!isNaN(lat) && lat) ? parseFloat(lat) : 6.29445;
        const defaultLng = (!isNaN(lng) && lng) ? parseFloat(lng) : 101.72362;

        const updateCoordsField = (newLat, newLng) => {
            const coordsInput = document.getElementById('evacTMCareOtherCoords');
            if (coordsInput) coordsInput.value = `${Number(newLat).toFixed(6)}, ${Number(newLng).toFixed(6)}`;
        };

        if (!_tmcareMiniMap) {
            _tmcareMiniMap = L.map('evacTMCareMiniMap', {
                center: [defaultLat, defaultLng],
                zoom: 15
            });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(_tmcareMiniMap);

            _tmcareMiniMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(_tmcareMiniMap);
            _tmcareMiniMarker.on('dragend', () => {
                const pos = _tmcareMiniMarker.getLatLng();
                updateCoordsField(pos.lat, pos.lng);
            });

            _tmcareMiniMap.on('click', (e) => {
                _tmcareMiniMarker.setLatLng(e.latlng);
                updateCoordsField(e.latlng.lat, e.latlng.lng);
            });
        } else {
            _tmcareMiniMap.setView([defaultLat, defaultLng], 15);
            if (_tmcareMiniMarker) _tmcareMiniMarker.setLatLng([defaultLat, defaultLng]);
        }

        updateCoordsField(defaultLat, defaultLng);
        setTimeout(() => { if (_tmcareMiniMap) _tmcareMiniMap.invalidateSize(); }, 180);
    };

    window.useCurrentGpsForTMCareMiniMap = function () {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                window.initEvacTMCareMiniMap(pos.coords.latitude, pos.coords.longitude);
            },
            () => {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'ไม่สามารถดึงพิกัด GPS ได้', showConfirmButton: false, timer: 2000 });
                }
            }
        );
    };

    window.selectEvacTMCareDestination = function (destKey) {
        _selectedTMCareDestKey = destKey || '';
        const shelterInput = document.getElementById('evacTMCareShelterInput');
        const otherMapBox = document.getElementById('evacTMCareOtherMapBox');

        document.querySelectorAll('#evacTMCareDestBtnGrid .tmcare-dest-btn').forEach(btn => {
            const isActive = btn.getAttribute('data-tmcare-dest') === destKey;
            btn.className = isActive
                ? 'tmcare-dest-btn p-2.5 rounded-xl border-2 border-blue-600 bg-blue-100/80 text-blue-900 text-xs font-black text-left flex items-center gap-2 transition shadow-xs active:scale-98'
                : 'tmcare-dest-btn p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-700 text-xs font-bold text-left flex items-center gap-2 transition active:scale-98';
        });

        if (destKey === 'other') {
            if (shelterInput) shelterInput.value = 'other';
            if (otherMapBox) otherMapBox.classList.remove('hidden');
            const sel = document.getElementById('evacTMCareSelect');
            const meta = sel ? window.tmcareState.rowMetaMap[sel.value] : null;
            window.initEvacTMCareMiniMap(meta ? meta.lat : 6.29445, meta ? meta.lng : 101.72362);
        } else {
            if (shelterInput) shelterInput.value = destKey || '';
            if (otherMapBox) otherMapBox.classList.add('hidden');
        }
    };

    window.selectEvacTMCareStatus = function (statusKey) {
        const safeKey = statusKey || 'safe_at_home';
        const statusInput = document.getElementById('evacTMCareStatusSelect');
        const destBox = document.getElementById('evacTMCareDestinationBox');
        if (statusInput) statusInput.value = safeKey;

        const styleMap = {
            safe_at_home: 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-xs font-black',
            need_help: 'border-rose-600 bg-rose-50 text-rose-800 shadow-xs font-black',
            need_evacuation: 'border-orange-500 bg-orange-50 text-orange-800 shadow-xs font-black',
            evacuated: 'border-blue-600 bg-blue-50 text-blue-800 shadow-xs font-black'
        };

        document.querySelectorAll('#evacTMCareStatusBtnGrid .tmcare-status-btn').forEach(btn => {
            const key = btn.getAttribute('data-tmcare-status');
            const isActive = key === safeKey;
            btn.className = `tmcare-status-btn p-3 rounded-2xl border-2 text-xs transition-all flex flex-col items-center justify-center gap-1 active:scale-95 ${isActive ? (styleMap[key] || styleMap.safe_at_home) : 'border-slate-200 bg-white text-slate-600 font-bold hover:border-slate-300'}`;
        });

        if (destBox) {
            const isEvac = safeKey === 'evacuated';
            destBox.classList.toggle('hidden', !isEvac);
            if (isEvac && !_selectedTMCareDestKey) {
                window.selectEvacTMCareDestination(TMCARE_SHELTERS[0]);
            } else if (isEvac && _selectedTMCareDestKey === 'other') {
                setTimeout(() => { if (_tmcareMiniMap) _tmcareMiniMap.invalidateSize(); }, 150);
            }
        }
    };

    window.onSelectEvacTMCareBeneficiary = function (beneficiaryId) {
        const key = String(beneficiaryId || '').replace(/^tmcare:/, '');
        const meta = window.tmcareState.rowMetaMap[key] || window.tmcareState.rowMetaMap[`tmcare:${key}`];
        const infoBox = document.getElementById('evacTMCareSelectedInfo');
        const otherPlaceInput = document.getElementById('evacTMCareOtherPlaceInput');
        const needsInput = document.getElementById('evacTMCareNeedsInput');
        const submitBtn = document.getElementById('btnEvacTMCareSubmit');

        if (!meta) {
            if (infoBox) infoBox.classList.add('hidden');
            if (submitBtn) submitBtn.disabled = true;
            return;
        }

        const hasCoords = !isNaN(meta.lat) && !isNaN(meta.lng) && (meta.lat !== 0 || meta.lng !== 0);
        if (infoBox) {
            infoBox.innerHTML = `
                <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="text-sm font-black text-slate-800">${esc(meta.fullName)}</div>
                        <div class="text-xs text-slate-600 mt-0.5"><i class="fas fa-map-marker-alt text-rose-500 mr-1"></i>${esc(window.formatCompactThaiAddress(meta.address))}</div>
                        <div class="text-[11px] font-mono text-slate-500 mt-0.5"><i class="fas fa-location-crosshairs text-blue-500 mr-1"></i>พิกัด: ${hasCoords ? `${meta.lat.toFixed(6)}, ${meta.lng.toFixed(6)}` : 'ยังไม่มีพิกัด'}</div>
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5 shrink-0">
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-black ${meta.statusMeta.badgeClass}">${esc(meta.statusMeta.label)}</span>
                        ${hasCoords ? `<button type="button" onclick="focusTMCareOnEvacMap(${meta.lat}, ${meta.lng})" class="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-bold"><i class="fas fa-map-pin mr-1"></i>ดูหมุด</button>` : ''}
                        <button type="button" onclick="openTMCareEmsCardModal('${esc(meta.beneficiaryId)}', false)" class="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold"><i class="fas fa-kit-medical mr-1"></i>EMS (PDPA)</button>
                    </div>
                </div>
            `;
            infoBox.classList.remove('hidden');
        }

        const currentEvacStatus = meta.evacStatus || 'safe_at_home';
        const savedShelter = (meta.shelterName && meta.shelterName !== '-') ? String(meta.shelterName).trim() : '';
        if (currentEvacStatus === 'evacuated') {
            if (TMCARE_SHELTERS.includes(savedShelter)) {
                _selectedTMCareDestKey = savedShelter;
                window.selectEvacTMCareDestination(savedShelter);
            } else {
                _selectedTMCareDestKey = 'other';
                if (otherPlaceInput) otherPlaceInput.value = savedShelter;
                window.selectEvacTMCareDestination('other');
            }
        } else {
            _selectedTMCareDestKey = '';
        }

        window.selectEvacTMCareStatus(currentEvacStatus);
        if (needsInput) needsInput.value = meta.needsDetail || '';
        if (submitBtn) submitBtn.disabled = false;
    };

    window.renderEvacTMCareTab = function () {
        const sel = document.getElementById('evacTMCareSelect');
        const listEl = document.getElementById('evacTMCareListBody');
        const searchEl = document.getElementById('evacTMCareSearch');
        const filterEl = document.getElementById('evacTMCareStatusFilter');
        const countEl = document.getElementById('evacTMCareListCount');

        const metas = (window.tmcareState.beneficiaries || [])
            .map(b => window.tmcareState.rowMetaMap[String(b.id || '').trim()])
            .filter(Boolean);

        // เรียงเคสฉุกเฉินขึ้นบนสุด
        metas.sort((a, b) => {
            const score = (m) => m.evacStatus === 'need_help' ? 4 : (m.evacStatus === 'need_evacuation' ? 3 : (m.evacStatus === 'evacuated' ? 2 : 1));
            return score(b) - score(a);
        });

        const searchQ = searchEl ? searchEl.value.trim().toLowerCase() : '';
        const filterSt = filterEl ? filterEl.value : 'all';

        const filtered = metas.filter(m => {
            if (filterSt !== 'all' && m.evacStatus !== filterSt) return false;
            if (searchQ) {
                const hay = `${m.fullName} ${m.address} ${m.riskGroup} ${m.needsDetail}`.toLowerCase();
                if (!hay.includes(searchQ)) return false;
            }
            return true;
        });

        if (sel) {
            const prevVal = sel.value;
            sel.innerHTML = `<option value="">-- เลือกรายชื่อผู้พิการ / กลุ่มเปราะบาง (${filtered.length} รายการ) --</option>` +
                filtered.map(m => {
                    const gb = window.getTMCareGroupBadgeMeta(m.triageLevel, m.riskGroup);
                    return `<option value="${esc(m.beneficiaryId)}">${gb.dotEmoji} ${esc(m.fullName)} (${esc(m.riskGroup)}) • ${esc(window.formatCompactThaiAddress(m.address))} [${esc(m.statusMeta.shortLabel)}]</option>`;
                }).join('');
            if (prevVal && filtered.some(m => m.beneficiaryId === prevVal)) {
                sel.value = prevVal;
                window.onSelectEvacTMCareBeneficiary(prevVal);
            }
        }

        if (countEl) countEl.innerText = `${filtered.length} รายชื่อ`;

        if (!listEl) return;
        if (!window.tmcareState.loaded) {
            listEl.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 font-bold"><i class="fas fa-spinner fa-spin mr-1.5"></i>กำลังซิงก์รายชื่อจากระบบ TMCare...</div>`;
            return;
        }
        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 font-bold">ไม่พบรายชื่อที่ตรงตามเงื่อนไข</div>`;
            return;
        }

        listEl.innerHTML = filtered.map(m => {
            const compactAddr = window.formatCompactThaiAddress(m.address);
            const hasCoords = !isNaN(m.lat) && !isNaN(m.lng) && (m.lat !== 0 || m.lng !== 0);
            const gb = window.getTMCareGroupBadgeMeta(m.triageLevel, m.riskGroup);
            return `
                <div class="p-3 rounded-2xl bg-slate-50/80 hover:bg-white border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition">
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-xs font-black text-slate-800">${esc(m.fullName)}</span>
                            <span class="px-2 py-0.5 rounded-full text-[9px] font-black ${gb.badgeClass}">${esc(gb.label)}</span>
                            <span class="px-2 py-0.5 rounded-full text-[9px] font-black ${m.statusMeta.badgeClass}">${esc(m.statusMeta.label)}</span>
                        </div>
                        <div class="text-[11px] text-slate-600 truncate mt-0.5" title="${esc(m.address)}">
                            <i class="fas fa-map-marker-alt text-rose-500 mr-1"></i>${esc(compactAddr)}
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        ${hasCoords ? `<button type="button" onclick="focusTMCareOnEvacMap(${m.lat}, ${m.lng})" class="px-2.5 py-1.5 rounded-xl bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 text-[10px] font-bold" title="ดูหมุดบนแผนที่"><i class="fas fa-map-pin"></i></button>` : ''}
                        <button type="button" onclick="openTMCareEmsCardModal('${esc(m.beneficiaryId)}', false)" class="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold" title="ดูการ์ด EMS (ต้องใส่รหัส PDPA)"><i class="fas fa-kit-medical mr-1"></i>EMS</button>
                        <button type="button" onclick="openEvacTMCareForBeneficiary('${esc(m.beneficiaryId)}')" class="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold"><i class="fas fa-pen mr-1"></i>เลือกอัปเดต</button>
                    </div>
                </div>
            `;
        }).join('');
    };

    window.submitEvacTMCareStatusUpdate = async function (event) {
        if (event) event.preventDefault();
        const sel = document.getElementById('evacTMCareSelect');
        const statusSel = document.getElementById('evacTMCareStatusSelect');
        const shelterInput = document.getElementById('evacTMCareShelterInput');
        const otherPlaceInput = document.getElementById('evacTMCareOtherPlaceInput');
        const otherCoordsInput = document.getElementById('evacTMCareOtherCoords');
        const needsInput = document.getElementById('evacTMCareNeedsInput');
        const bid = sel ? sel.value : '';
        const meta = window.tmcareState.rowMetaMap[bid];
        if (!meta) return;

        const apiUrl = getTMCareApiUrl();
        if (!apiUrl) return;

        const evacStatusVal = statusSel ? statusSel.value : 'safe_at_home';
        let finalShelterName = '-';
        let finalNeedsDetail = needsInput ? needsInput.value.trim() : '';

        if (evacStatusVal === 'evacuated') {
            if (_selectedTMCareDestKey === 'other' || (shelterInput && shelterInput.value === 'other')) {
                const placeText = otherPlaceInput ? otherPlaceInput.value.trim() : '';
                const coordsText = otherCoordsInput ? otherCoordsInput.value.trim() : '';
                finalShelterName = placeText || 'ที่อื่น / บ้านญาติ';
                if (coordsText && !finalNeedsDetail.includes(coordsText)) {
                    finalNeedsDetail = finalNeedsDetail ? `${finalNeedsDetail} [พิกัดปลายทาง: ${coordsText}]` : `[พิกัดปลายทาง: ${coordsText}]`;
                }
            } else {
                finalShelterName = (shelterInput && shelterInput.value.trim()) ? shelterInput.value.trim() : TMCARE_SHELTERS[0];
            }
        }

        const payload = {
            beneficiaryId: meta.beneficiaryId,
            communityId: meta.communityId,
            evacStatus: evacStatusVal,
            shelterName: finalShelterName,
            needsDetail: finalNeedsDetail,
            updatedAt: new Date().toISOString()
        };

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'กำลังอัปเดตสถานะไปยัง TMCare...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });
        }

        try {
            const res = await fetch(`${apiUrl}?action=updateDisasterStatus`, {
                method: 'POST',
                redirect: 'follow',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data && data.status === 'error') throw new Error(data.message || 'อัปเดตไม่สำเร็จ');

            const nextStatuses = [...(window.tmcareState.statuses || [])];
            const idx = nextStatuses.findIndex(s => String(s.beneficiaryId || s.beneficiary_id) === meta.beneficiaryId);
            if (idx >= 0) nextStatuses[idx] = Object.assign({}, nextStatuses[idx], payload);
            else nextStatuses.push(payload);

            buildTMCareStateFromRaw(window.tmcareState.beneficiaries, nextStatuses);
            if (typeof window.setAppCache === 'function') {
                window.setAppCache(TMCARE_CACHE_KEY, {
                    beneficiaries: window.tmcareState.beneficiaries,
                    disasterStatuses: nextStatuses
                }, TMCARE_CACHE_TTL_MIN);
            }
            notifyAllTMCareConsumers();

            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: 'อัปเดตสถานะสำเร็จ',
                    text: `ซิงก์สถานะของ ${meta.fullName} กลับไปยังระบบ TMCare และอัปเดตหมุดบนแผนที่เรียบร้อยแล้ว`,
                    timer: 2200,
                    showConfirmButton: false
                });
            }
        } catch (err) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'อัปเดตสถานะไม่สำเร็จ',
                    text: err.message || String(err)
                });
            }
        }
    };
})();
