# FloodResident AutoFill (Chrome Extension)

เครื่องมือช่วยกรอกข้อมูลผู้เข้าพักพิงจากไฟล์ CSV ลงในหน้าเว็บ `https://shelter.disaster.go.th/backoffice/residents` แบบ **Side Panel** เพื่อลดความซ้ำซ้อนในการพิมพ์ข้อมูลกว่า 150 รายของเจ้าหน้าที่เทศบาล

---

## 1. วิธีติดตั้งใน Google Chrome (ใช้เวลา 1 นาที)

1. เปิด Google Chrome แล้วพิมพ์ในช่อง URL ว่า `chrome://extensions` แล้วกด Enter
2. เปิดสวิตช์ **โหมดนักพัฒนาซอฟต์แวร์ (Developer mode)** ที่มุมขวาบน
3. กดปุ่ม **โหลดส่วนขยายที่แตกไฟล์แล้ว (Load unpacked)** ที่มุมซ้ายบน
4. เลือกโฟลเดอร์ `FloodResident_ImportData` นี้
5. กดปุ่มรูปจิ๊กซอว์ (Extensions) มุมขวาบนของ Chrome แล้วปักหมุด (**Pin**) `FloodResident AutoFill` ไว้ใช้งาน

---

## 2. วิธีใช้งานสำหรับเจ้าหน้าที่

1. เข้าสู่ระบบเว็บ `https://shelter.disaster.go.th/backoffice/residents` ตามปกติ
2. คลิกที่ไอคอน **FloodResident AutoFill** เพื่อเปิดแถบด้านข้าง (Side Panel จะเปิดค้างไว้ ไม่หายไปเมื่อคลิกหน้าเว็บ)
3. กดเลือกไฟล์ `.csv` ของเทศบาล (หรือกด **"ดาวน์โหลดไฟล์ตัวอย่าง CSV"** เพื่อดูรูปแบบหัวตารางมาตรฐาน)
   - รองรับทั้งไฟล์ CSV แบบ `UTF-8` และ `TIS-620 / Windows-874` ที่บันทึกจาก Excel ภาษาไทย
4. บนหน้าเว็บ กดปุ่ม **"+ เพิ่มผู้พักพิง"** เพื่อเปิดหน้าต่างกรอกข้อมูล
5. ที่แถบด้านข้าง กดปุ่ม **"กรอกข้อมูลลงฟอร์ม (AutoFill)"**
6. ตรวจสอบความถูกต้องในหน้าเว็บ (หากช่องวันที่ปฏิทินมีแจ้งเตือน ให้คลิกเลือกวันที่เพิ่มเติม) แล้วกด **"บันทึก"** บนหน้าเว็บ
7. กดปุ่ม **"บันทึกแล้ว & ไปคนถัดไป"** ที่แถบด้านข้างเพื่อบันทึกความคืบหน้าและเตรียมกรอกรายถัดไป

---

## 3. โครงสร้างไฟล์ในโปรเจกต์

- `manifest.json` — ตั้งค่า Chrome Extension (Manifest V3 + Side Panel)
- `background.js` — สั่งให้คลิกไอคอนแล้วเปิด Side Panel ทันที
- `sidepanel.html` / `sidepanel.js` — หน้าจอจัดการรายชื่อ CSV, ค้นหา, ติดตามความคืบหน้า (เก็บใน `chrome.storage.local`)
- `content.js` — สคริปต์ฉีดข้อมูลลงใน `#resident-modal-form` (รองรับ Vue 3 / Reka UI ทั้ง Input, Radio, Checkbox, Cascading Dropdown จังหวัด-อำเภอ-ตำบล และ DatePicker)
- `sample_residents.csv` — ไฟล์ตัวอย่างหัวตาราง CSV

