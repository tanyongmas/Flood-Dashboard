/**
 * Header Notification Bell & Activity Feed Module
 * รวบรวมความเคลื่อนไหวล่าสุดจากทุกส่วนงานโดยไม่เปิดเผยข้อมูลอ่อนไหว (PDPA-safe)
 */

(function () {
    const LAST_SEEN_KEY = 'notif_last_seen_at';

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function parseTimestampMs(raw) {
        if (!raw) return 0;
        const d = new Date(raw);
        const t = d.getTime();
        return isNaN(t) ? 0 : t;
    }

    function formatRelativeThaiTime(tsMs) {
        if (!tsMs) return '-';
        const diffSec = Math.floor((Date.now() - tsMs) / 1000);
        if (diffSec < 60) return 'เมื่อสักครู่';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr} ชม. ที่แล้ว`;
        return new Date(tsMs).toLocaleString('th-TH', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getLastSeenMs() {
        try {
            const val = parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0', 10);
            return isNaN(val) ? 0 : val;
        } catch (e) {
            return 0;
        }
    }

    function setLastSeenNow() {
        try {
            localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
        } catch (e) {}
    }

    function buildNotificationFeed() {
        if (typeof store === 'undefined' || !store) return [];
        const items = [];

        // 1. รายงานสถานะอพยพ / ปลอดภัย / SOS
        if (Array.isArray(store.evacReports)) {
            store.evacReports.forEach((r) => {
                const ts = parseTimestampMs(r[0]);
                if (!ts) return;
                const address = String(r[1] || 'ไม่ระบุที่อยู่').trim();
                const count = parseInt(r[2], 10) || 1;
                const destType = String(r[3] || '').trim();
                const reporter = String(r[5] || 'ประชาชน/เจ้าหน้าที่').trim();
                const status = String(r[8] || 'อพยพ').trim();
                const isSos = status.includes('SOS') || status.includes('ช่วยเหลือ') || destType.includes('ช่วยเหลือ');

                items.push({
                    ts,
                    targetPage: 'evacuation',
                    icon: isSos ? 'fa-triangle-exclamation' : (status === 'ปลอดภัย' ? 'fa-check-circle' : 'fa-person-running'),
                    badgeBg: isSos ? 'bg-rose-100 text-rose-600' : (status === 'ปลอดภัย' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'),
                    title: isSos ? 'แจ้งขอความช่วยเหลือ SOS' : `รายงานสถานะ: ${status}`,
                    detail: `${address} (${count} คน)`,
                    actor: reporter
                });
            });
        }

        // 2. ศูนย์พักพิง (PDPA-safe: ไม่แสดงเลขบัตรประชาชนและเบอร์โทร)
        if (Array.isArray(store.evacuees)) {
            store.evacuees.forEach((r) => {
                const status = String(r[10] || 'พักพิงอยู่').trim();
                const ts = parseTimestampMs(status === 'กลับบ้านแล้ว' && r[11] ? r[11] : r[0]);
                if (!ts) return;
                const shelter = String(r[1] || 'ศูนย์พักพิง').trim();
                const address = String(r[2] || '').trim();
                const name = String(r[4] || 'ผู้เข้าพักพิง').trim();

                items.push({
                    ts,
                    targetPage: 'shelter',
                    icon: status === 'กลับบ้านแล้ว' ? 'fa-house-chimney-user' : 'fa-campground',
                    badgeBg: status === 'กลับบ้านแล้ว' ? 'bg-teal-100 text-teal-600' : 'bg-blue-100 text-blue-600',
                    title: status === 'กลับบ้านแล้ว' ? 'ผู้พักพิงเดินทางกลับบ้านแล้ว' : 'ลงทะเบียนเข้าศูนย์พักพิง',
                    detail: `${name} • ${shelter}${address ? ` (${address})` : ''}`,
                    actor: 'เจ้าหน้าที่ศูนย์พักพิง'
                });
            });
        }

        // 3. รายงานระดับน้ำ
        if (Array.isArray(store.waterLogs)) {
            store.waterLogs.forEach((r) => {
                const ts = parseTimestampMs(r[0]);
                if (!ts) return;
                const location = String(r[1] || 'จุดวัดระดับน้ำ').trim();
                const level = String(r[2] || '-').trim();
                const trend = String(r[3] || '').trim();
                const reporter = String(r[5] || 'เจ้าหน้าที่').trim();

                items.push({
                    ts,
                    targetPage: 'water',
                    icon: 'fa-water',
                    badgeBg: 'bg-sky-100 text-sky-600',
                    title: 'อัปเดตระดับน้ำ',
                    detail: `${location}: ${level}${trend ? ` (${trend})` : ''}`,
                    actor: reporter
                });
            });
        }

        // 4. เส้นทางปิด / ไม่สามารถสัญจรได้
        if (Array.isArray(store.roadClosures)) {
            store.roadClosures.forEach((rc) => {
                const ts = parseTimestampMs(rc.createdAt);
                if (!ts) return;
                items.push({
                    ts,
                    targetPage: 'dashboard',
                    icon: 'fa-road-barrier',
                    badgeBg: 'bg-amber-100 text-amber-700',
                    title: 'รายงานเส้นทางปิดสัญจร',
                    detail: `${rc.title || 'เส้นทางน้ำท่วม'} (${rc.status || 'ปิดสัญจร'})`,
                    actor: rc.reporter || 'เจ้าหน้าที่'
                });
            });
        }

        // 5. การแจกถุงยังชีพ
        if (Array.isArray(store.reliefData)) {
            store.reliefData.forEach((r) => {
                const ts = parseTimestampMs(r[0]);
                if (!ts) return;
                const recipient = String(r[2] || r[1] || 'ผู้รับถุงยังชีพ').trim();
                const addr = String(r[4] || r[3] || '').trim();
                const actor = String(r[6] || r[5] || 'เจ้าหน้าที่ถุงยังชีพ').trim();

                items.push({
                    ts,
                    targetPage: 'relief',
                    icon: 'fa-box-open',
                    badgeBg: 'bg-purple-100 text-purple-600',
                    title: 'บันทึกการมอบถุงยังชีพ',
                    detail: `${recipient}${addr ? ` (${addr})` : ''}`,
                    actor
                });
            });
        }

        items.sort((a, b) => b.ts - a.ts);
        return items.slice(0, 20);
    }

    function renderNotificationBell() {
        const badgeEl = document.getElementById('notifUnreadBadge');
        const listEl = document.getElementById('notifListContainer');
        const updatedEl = document.getElementById('notifUpdatedAt');
        const feed = buildNotificationFeed();
        const lastSeen = getLastSeenMs();

        const unreadCount = feed.filter(item => item.ts > lastSeen).length;

        if (badgeEl) {
            if (unreadCount > 0) {
                badgeEl.innerText = unreadCount > 9 ? '9+' : String(unreadCount);
                badgeEl.classList.remove('hidden');
            } else {
                badgeEl.classList.add('hidden');
            }
        }

        if (updatedEl) {
            updatedEl.innerText = `อัปเดต ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
        }

        if (!listEl) return;

        if (feed.length === 0) {
            listEl.innerHTML = `
                <div class="py-8 text-center text-slate-400 text-xs">
                    <i class="far fa-bell-slash text-2xl mb-2 block text-slate-300"></i>
                    ยังไม่มีความเคลื่อนไหวล่าสุด
                </div>
            `;
            return;
        }

        listEl.innerHTML = feed.map(item => {
            const isUnread = item.ts > lastSeen;
            return `
                <button type="button" onclick="onNotificationItemClick('${item.targetPage}')"
                    class="w-full text-left p-2.5 rounded-2xl hover:bg-slate-50 transition-colors flex items-start gap-2.5 border ${isUnread ? 'bg-blue-50/50 border-blue-100' : 'border-transparent'}">
                    <div class="w-8 h-8 rounded-xl ${item.badgeBg} flex items-center justify-center text-xs shrink-0 mt-0.5">
                        <i class="fas ${item.icon}"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-1">
                            <span class="text-[11px] font-extrabold text-slate-800 truncate">${escapeHtml(item.title)}</span>
                            ${isUnread ? '<span class="w-2 h-2 rounded-full bg-blue-600 shrink-0"></span>' : ''}
                        </div>
                        <p class="text-[11px] text-slate-600 line-clamp-2 leading-snug mt-0.5">${escapeHtml(item.detail)}</p>
                        <div class="flex items-center justify-between text-[9.5px] text-slate-400 mt-1">
                            <span class="truncate"><i class="far fa-user mr-1"></i>${escapeHtml(item.actor)}</span>
                            <span class="shrink-0 ml-2">${formatRelativeThaiTime(item.ts)}</span>
                        </div>
                    </div>
                </button>
            `;
        }).join('');
    }

    function toggleNotificationDropdown(event) {
        if (event) event.stopPropagation();
        const dropdown = document.getElementById('notifDropdown');
        if (!dropdown) return;
        const willOpen = dropdown.classList.contains('hidden');
        if (willOpen) {
            renderNotificationBell();
            dropdown.classList.remove('hidden');
            setLastSeenNow();
            const badgeEl = document.getElementById('notifUnreadBadge');
            if (badgeEl) badgeEl.classList.add('hidden');
        } else {
            dropdown.classList.add('hidden');
        }
    }

    function markAllNotificationsRead() {
        setLastSeenNow();
        renderNotificationBell();
    }

    function onNotificationItemClick(targetPage) {
        const dropdown = document.getElementById('notifDropdown');
        if (dropdown) dropdown.classList.add('hidden');

        const role = (typeof userRole !== 'undefined' ? String(userRole || '') : '').toLowerCase().trim();
        const accessMap = (typeof PAGE_ACCESS !== 'undefined' && PAGE_ACCESS) ? PAGE_ACCESS : (window.PAGE_ACCESS || {});
        const allowed = accessMap[role] || [];

        if (allowed.includes(targetPage) && typeof showPage === 'function') {
            showPage(targetPage);
        } else if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'info',
                title: 'สิทธิ์ของคุณดูได้เฉพาะสรุปแจ้งเตือน',
                showConfirmButton: false,
                timer: 2000
            });
        }
    }

    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('notifBellWrapper');
        const dropdown = document.getElementById('notifDropdown');
        if (wrap && dropdown && !dropdown.classList.contains('hidden') && !wrap.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    window.refreshNotificationBell = renderNotificationBell;
    window.toggleNotificationDropdown = toggleNotificationDropdown;
    window.markAllNotificationsRead = markAllNotificationsRead;
    window.onNotificationItemClick = onNotificationItemClick;
})();
