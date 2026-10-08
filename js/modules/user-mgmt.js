/**
 * 👥 User Management Module
 * จัดการบัญชีผู้ใช้งาน สิทธิ์การเข้าถึง และบทบาท (Admin Only)
 * เทศบาลตำบลตันหยงมัส
 */

async function loadUsers() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="3" class="text-center py-10"><i class="fas fa-spinner fa-spin text-slate-300 text-2xl"></i></td></tr>`;

    try {
        const users = typeof sbGetUsers === 'function' ? await sbGetUsers() : [];
        if (users && users.length > 0) {
            tbody.innerHTML = users.map((u) => {
                const roleLower = String(u[1] || '').toLowerCase();
                const badgeClass = roleLower === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                                   roleLower === 'admin' ? 'bg-amber-100 text-amber-700' :
                                   roleLower === 'flood_report' ? 'bg-blue-50 text-blue-600' :
                                   'bg-slate-100 text-slate-500';
                const roleText = roleLower === 'admin' ? 'admin (view only)' : u[1];

                return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-4 font-bold text-slate-700">${u[0]}</td>
                    <td class="p-4 text-center">
                        <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${badgeClass}">${roleText}</span>
                    </td>
                    <td class="p-4 text-center">
                        <button onclick="deleteUser('${u[0]}')" class="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm"><i class="fas fa-trash-alt text-xs"></i></button>
                    </td>
                </tr>
            `}).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center py-6 text-slate-400 font-bold">ยังไม่มีรายชื่อผู้ใช้งาน</td></tr>`;
        }
    } catch (err) {
        console.error("loadUsers error:", err);
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-red-400 py-4">ดึงข้อมูลล้มเหลว</td></tr>`;
    }
}

async function saveUser(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (typeof checkAdminReadOnlyAction === 'function' && checkAdminReadOnlyAction()) return;

    const btn = e.target.querySelector('button');
    if (btn) { btn.innerText = "กำลังบันทึก..."; btn.disabled = true; }

    const targetUser = document.getElementById('manage_username').value.trim();
    const targetRole = document.getElementById('manage_role').value;

    try {
        if (typeof sbSaveUser === 'function') {
            await sbSaveUser(targetUser, targetRole);
        } else {
            throw new Error('Supabase Service ไม่พร้อมทำงาน');
        }
        Swal.fire('สำเร็จ', 'บันทึกสิทธิ์ผู้ใช้งานแล้ว', 'success');
        document.getElementById('userForm').reset();
        loadUsers();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message || 'บันทึกไม่สำเร็จ', 'error');
    }
    if (btn) { btn.innerText = "บันทึกข้อมูล"; btn.disabled = false; }
}

async function deleteUser(username) {
    if (typeof checkAdminReadOnlyAction === 'function' && checkAdminReadOnlyAction()) return;

    if (typeof currentUser !== 'undefined' && username === currentUser) {
        return Swal.fire('ปฏิเสธ', 'ไม่สามารถลบบัญชีตัวเองขณะใช้งานได้', 'warning');
    }

    const confirm = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: `ต้องการลบผู้ใช้ ${username} ใช่หรือไม่`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ลบข้อมูล',
        confirmButtonColor: '#ef4444'
    });
    if (!confirm.isConfirmed) return;

    try {
        if (typeof sbDeleteUser === 'function') {
            await sbDeleteUser(username);
        } else {
            throw new Error('Supabase Service ไม่พร้อมทำงาน');
        }
        Swal.fire('ลบแล้ว', 'ลบผู้ใช้งานสำเร็จ', 'success');
        loadUsers();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message || 'ลบไม่สำเร็จ', 'error');
    }
}

/**
 * เปิดหน้าต่าง Modal สำหรับผู้ดูแลระบบในการเปลี่ยนรหัสผ่าน PDPA PIN
 */
async function openChangePdpaPinModal() {
    const currentRole = (typeof userRole !== 'undefined' ? userRole : '').toLowerCase();
    if (currentRole !== 'superadmin') {
        Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์เข้าถึง',
            text: 'เฉพาะผู้ดูแลระบบระดับ Superadmin เท่านั้นที่สามารถเปลี่ยนรหัสผ่านความปลอดภัย PDPA PIN ได้',
            confirmButtonColor: '#e11d48'
        });
        return;
    }

    const { value: formValues, isConfirmed } = await Swal.fire({
        title: '<div class="text-slate-800 text-lg font-bold flex items-center justify-center gap-2"><i class="fas fa-key text-amber-500"></i>เปลี่ยนรหัสผ่าน PDPA PIN</div>',
        html: `
            <div class="text-left text-xs text-slate-500 mb-4 bg-amber-50 p-3 rounded-2xl border border-amber-200">
                <i class="fas fa-info-circle text-amber-600 mr-1"></i>
                รหัสผ่านนี้ใช้สำหรับยืนยันสิทธิ์ก่อนเปิดดูเลขบัตรประชาชนและเบอร์โทรศัพท์ของผู้ประสบภัยในระบบ
            </div>
            <div class="space-y-3 text-left">
                <div>
                    <label class="text-[11px] font-bold text-slate-500 block mb-1">รหัสผ่านปัจจุบัน</label>
                    <input id="swal_old_pin" type="password" placeholder="ระบุรหัสเดิม..." maxlength="12"
                        class="w-full p-3 text-sm font-bold border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-slate-50">
                </div>
                <div>
                    <label class="text-[11px] font-bold text-slate-500 block mb-1">รหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร)</label>
                    <input id="swal_new_pin" type="password" placeholder="ระบุรหัสผ่านใหม่..." maxlength="12"
                        class="w-full p-3 text-sm font-bold border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-slate-50">
                </div>
                <div>
                    <label class="text-[11px] font-bold text-slate-500 block mb-1">ยืนยันรหัสผ่านใหม่อีกครั้ง</label>
                    <input id="swal_confirm_pin" type="password" placeholder="ยืนยันรหัสผ่านใหม่อีกครั้ง..." maxlength="12"
                        class="w-full p-3 text-sm font-bold border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-slate-50">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: '#d97706',
        cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="fas fa-save mr-1"></i> บันทึกรหัสผ่านใหม่',
        cancelButtonText: 'ยกเลิก',
        customClass: { popup: 'rounded-[2rem]' },
        preConfirm: () => {
            const oldPin = document.getElementById('swal_old_pin').value.trim();
            const newPin = document.getElementById('swal_new_pin').value.trim();
            const confirmPin = document.getElementById('swal_confirm_pin').value.trim();

            if (!oldPin) {
                Swal.showValidationMessage('กรุณากรอกรหัสผ่านปัจจุบัน');
                return false;
            }
            if (!newPin || newPin.length < 4) {
                Swal.showValidationMessage('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
                return false;
            }
            if (newPin !== confirmPin) {
                Swal.showValidationMessage('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
                return false;
            }

            return { oldPin, newPin };
        }
    });

    if (!isConfirmed || !formValues) return;

    Swal.fire({
        title: 'กำลังบันทึกรหัสผ่านใหม่...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        if (typeof sbUpdatePdpaPin !== 'function') {
            throw new Error('Supabase Service ไม่พร้อมทำงาน');
        }

        await sbUpdatePdpaPin(formValues.oldPin, formValues.newPin, currentRole === 'superadmin');

        // รีเซ็ต session unlock เพื่อให้เริ่มยืนยันด้วยรหัสใหม่
        sessionStorage.removeItem('pdpa_unlocked_at');

        Swal.fire({
            icon: 'success',
            title: 'เปลี่ยนรหัสผ่านสำเร็จ',
            text: 'บันทึกรหัสผ่าน PDPA PIN ใหม่ลงในระบบฐานข้อมูลเรียบร้อยแล้ว',
            confirmButtonColor: '#2563eb',
            customClass: { popup: 'rounded-2xl' }
        });
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'ไม่สามารถเปลี่ยนรหัสผ่านได้',
            text: err.message || 'เกิดข้อผิดพลาดในการบันทึกรหัสผ่าน',
            confirmButtonColor: '#e11d48',
            customClass: { popup: 'rounded-2xl' }
        });
    }
}

/**
 * เปิดหน้าต่าง Modal สำหรับผู้ดูแลระบบในการเปลี่ยนรหัสผ่าน Superadmin สำหรับเข้าสู่ระบบ
 */
async function openChangeAdminPasswordModal() {
    const currentRole = (typeof userRole !== 'undefined' ? userRole : '').toLowerCase();
    if (currentRole !== 'superadmin') {
        Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์เข้าถึง',
            text: 'เฉพาะผู้ดูแลระบบระดับ Superadmin เท่านั้นที่สามารถเปลี่ยนรหัสผ่านผู้ดูแลระบบได้',
            confirmButtonColor: '#e11d48'
        });
        return;
    }

    const { value: formValues, isConfirmed } = await Swal.fire({
        title: '<div class="text-slate-800 text-lg font-bold flex items-center justify-center gap-2"><i class="fas fa-user-shield text-blue-600"></i>เปลี่ยนรหัสผ่าน Superadmin เข้าสู่ระบบ</div>',
        html: `
            <div class="text-left text-xs text-slate-500 mb-4 bg-blue-50 p-3 rounded-2xl border border-blue-200">
                <i class="fas fa-info-circle text-blue-600 mr-1"></i>
                รหัสผ่านนี้ใช้สำหรับยืนยันตัวตนก่อนเข้าสู่ระบบเฉพาะผู้ใช้งานระดับ Superadmin
            </div>
            <div class="space-y-3 text-left">
                <div>
                    <label class="text-[11px] font-bold text-slate-500 block mb-1">รหัสผ่านปัจจุบัน</label>
                    <input id="swal_old_admin_pw" type="password" placeholder="ระบุรหัสผ่านปัจจุบัน..." maxlength="30"
                        class="w-full p-3 text-sm font-bold border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-slate-50">
                </div>
                <div>
                    <label class="text-[11px] font-bold text-slate-500 block mb-1">รหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร)</label>
                    <input id="swal_new_admin_pw" type="password" placeholder="ระบุรหัสผ่านใหม่..." maxlength="30"
                        class="w-full p-3 text-sm font-bold border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-slate-50">
                </div>
                <div>
                    <label class="text-[11px] font-bold text-slate-500 block mb-1">ยืนยันรหัสผ่านใหม่อีกครั้ง</label>
                    <input id="swal_confirm_admin_pw" type="password" placeholder="ยืนยันรหัสผ่านใหม่อีกครั้ง..." maxlength="30"
                        class="w-full p-3 text-sm font-bold border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-slate-50">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="fas fa-save mr-1"></i> บันทึกรหัสผ่านใหม่',
        cancelButtonText: 'ยกเลิก',
        customClass: { popup: 'rounded-[2rem]' },
        preConfirm: () => {
            const oldPw = document.getElementById('swal_old_admin_pw').value.trim();
            const newPw = document.getElementById('swal_new_admin_pw').value.trim();
            const confirmPw = document.getElementById('swal_confirm_admin_pw').value.trim();

            if (!oldPw) {
                Swal.showValidationMessage('กรุณากรอกรหัสผ่านปัจจุบัน');
                return false;
            }
            if (!newPw || newPw.length < 4) {
                Swal.showValidationMessage('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
                return false;
            }
            if (newPw !== confirmPw) {
                Swal.showValidationMessage('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
                return false;
            }

            return { oldPw, newPw };
        }
    });

    if (!isConfirmed || !formValues) return;

    Swal.fire({
        title: 'กำลังบันทึกรหัสผ่านใหม่...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        if (typeof sbUpdateAdminPassword !== 'function') {
            throw new Error('Supabase Service ไม่พร้อมทำงาน');
        }

        await sbUpdateAdminPassword(formValues.oldPw, formValues.newPw, currentRole === 'superadmin');

        Swal.fire({
            icon: 'success',
            title: 'เปลี่ยนรหัสผ่านสำเร็จ',
            text: 'บันทึกรหัสผ่าน Superadmin ใหม่เรียบร้อยแล้ว (จะใช้ในการเข้าสู่ระบบครั้งถัดไป)',
            confirmButtonColor: '#2563eb',
            customClass: { popup: 'rounded-2xl' }
        });
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'ไม่สามารถเปลี่ยนรหัสผ่านได้',
            text: err.message || 'เกิดข้อผิดพลาดในการบันทึกรหัสผ่าน',
            confirmButtonColor: '#e11d48',
            customClass: { popup: 'rounded-2xl' }
        });
    }
}

window.loadUsers = loadUsers;
window.saveUser = saveUser;
window.deleteUser = deleteUser;
window.openChangePdpaPinModal = openChangePdpaPinModal;
window.openChangeAdminPasswordModal = openChangeAdminPasswordModal;
