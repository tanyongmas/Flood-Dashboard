# 🌊 ระบบรายงานสถานการณ์น้ำท่วมและปริมาณน้ำฝน เทศบาลตำบลตันหยงมัส

ระบบเว็บแอปพลิเคชันแดชบอร์ดและศูนย์รับแจ้งเหตุฉุกเฉินเรียลไทม์ สำหรับติดตามและรายงานสถานการณ์น้ำท่วม ปริมาณน้ำฝน ระดับน้ำในลำน้ำ การอพยพ และการช่วยเหลือประชาชน สำหรับ **เทศบาลตำบลตันหยงมัส อำเภอระแงะ จังหวัดนราธิวาส** เชื่อมต่อกับ **LINE Official Account (LINE OA)** และคลังข้อมูลน้ำแห่งชาติ สสน. / กรมชลประทาน (ชป.17)

---

## 📌 จุดเด่นของระบบ (Key Features)

### 1. 📊 แดชบอร์ดสถานการณ์น้ำท่วม (`index.html`)
* **Interactive Map (One Map)**: แสดงแผนที่เสี่ยงภัย จุดวัดระดับน้ำ พื้นที่อพยพ และรูปปิดล้อมพื้นที่น้ำท่วมผ่าน Leaflet.js & Leaflet Draw
* **Real-Time Telemetry Monitoring**: ติดตามระดับน้ำเรียลไทม์ 2 สถานีหลักในพื้นที่:
  * 🌊 **สถานี X.73 คลองตันหยงมัส (บ้านตันหยงมัส)** — ตลิ่ง 14.90 ม.รทก.
  * 🌊 **สถานี X.73A คลองตันหยงมัส (บ้านบองอ)** — ตลิ่ง 26.80 ม.รทก.
* **Evacuation & Relief Management**: ระบบลงทะเบียนผู้ประสบภัย สถิติศูนย์พักพิงชั่วคราว การติดตามผู้ป่วยกลุ่มเปราะบาง และตัดสต๊อกถุงยังชีพอัตโนมัติ
* **Public Citizen Emergency Mode (`mode=report`)**: โหมดสแกน QR Code สำหรับประชาชนในการแจ้งสถานะภัยพิบัติ (ปลอดภัย / อพยพ) โดยไม่ต้องเข้าสู่ระบบ
* **Smart Address Autocomplete**: ช่องค้นหาที่อยู่และชุมชนอัจฉริยะ ดึงและประมวลผลรายชื่อที่อยู่ดั้งเดิมในระบบมารวมกันให้อัตโนมัติ (`getEvacAddressList`)
* **Looker Studio Embedded Analytics**: เชื่อมต่อรายงานสรุปเชิงลึกภาพรวมภัยพิบัติผ่าน Google Looker Studio

### 2. 🌧️ แดชบอร์ดติดตามปริมาณน้ำฝน (`Rainfall.html`)
* **Data Visualization**: แสดงสถิติและกราฟปริมาณน้ำฝนย้อนหลังด้วย ApexCharts (รายวัน, รายเดือน, รายปี และสถิติย้อนหลัง 5 ปี)
* **Smart Filtering & Comparison**: คำนวณฝนสะสมย้อนหลัง 3 วัน, 7 วัน และเปรียบเทียบสถิติกับปีก่อนหน้า

### 3. 💬 LINE Official Account (LINE OA) & Flex Messages (`Code.gs`)
* **การ์ดระดับน้ำ Flex Message รายสถานี**:
  * 🟢 **พิมพ์ `"ระดับน้ำ"`**: แสดงการ์ด Flex Message สรุประดับน้ำสถานี X.73 บ้านตันหยงมัส
  * 🟢 **พิมพ์ `"ระดับน้ำบองอ"` / `"บองอ"` / `"X.73A"`**: แสดงการ์ด Flex Message สรุประดับน้ำสถานี X.73A บ้านบองอ
  * 🎨 **Dynamic Theme Color**: ปรับสีหัวการ์ดอัตโนมัติตามเกณฑ์สถานการณ์ (🟢 เขียว = ปกติ, 🟡 ส้ม/เหลือง = เฝ้าระวัง, 🔴 แดง = วิกฤต)
* **การ์ดพยากรณ์อากาศ 7 วัน Flex Message Carousel**:
  * 🌤️ **พิมพ์ `"พยากรณ์อากาศ"`**: แสดงการ์ดสไลด์ Carousel พยากรณ์อากาศ 7 วันล่วงหน้า สไตล์ TMD 7-Day Forecast Widget ของกรมอุตุนิยมวิทยา (พร้อมโอกาสเกิดฝน %, ปริมาณฝน มม., อุณหภูมิ และความเร็วลม)
* **การตอบกลับฉุกเฉิน**:
  * 📞 **พิมพ์ `"เบอร์ติดต่อฉุกเฉิน"` / `"กู้ภัย"` / `"ช่วยเหลือ"`**: แสดงเบอร์โทรศัพท์สายด่วนฉุกเฉินประจำเทศบาลและหน่วยงานกู้ภัย 24 ชั่วโมง

### 4. 🛡️ ระบบสำรองข้อมูลระดับน้ำ 3 ชั้น (3-Tier Telemetry Pipeline)
1. **🥇 Primary (ชั้นที่ 1)**: ดึงข้อมูลสดจาก API คลังน้ำแห่งชาติ สสน. (`api-v3.thaiwater.net`) เพื่อความเร็วสูงสุด
2. **🥈 Secondary (ชั้นที่ 2)**: ดึงตรงจาก Web Service กรมชลประทาน ชป.17 (`hyd-app.rid.go.th`)
3. **🥉 Tertiary (ชั้นที่ 3)**: แคชข้อมูลเรียลไทม์ชุดล่าสุดในระบบ (`ScriptProperties`) ป้องกันระบบล่ม 100%

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```
Dashboard_Flood-main/
├── assets/
│   ├── favicon.ico             # ไอคอนเว็บบราวเซอร์
│   └── logo.png                # โลโก้ตราประทับเทศบาลตำบลตันหยงมัส
├── css/
│   ├── main.css                # สไตล์หลักของหน้า index.html และ Leaflet map fix
│   └── rainfall.css            # สไตล์ของหน้า Rainfall.html และ Animations
├── js/
│   ├── config.js               # การตั้งค่าระบบ, API Endpoints, Supabase Credentials
│   ├── supabase-service.js     # เลเยอร์เชื่อมต่อฐานข้อมูล Supabase PostgreSQL (100% Mode)
│   ├── utils.js                # ฟังก์ชั่นยูทิลิตี้ (การแปลงวันที่, SweetAlert, Password check)
│   ├── map.js                  # ระบบจัดการแผนที่ Leaflet, Marker Layers, Drawing tools
│   ├── dashboard.js            # ระบบจัดการข้อมูลน้ำท่วม, Autocomplete ที่อยู่, ดึงข้อมูล API, ตารางสถานการณ์
│   └── rainfall.js             # ระบบจัดการข้อมูลน้ำฝน และ ApexCharts Visualization
├── Code.gs                     # Google Apps Script REST API Backend, LINE Webhook, Flex Messages & OCR
├── index.html                  # หน้าแดชบอร์ดหลัก (Flood Situation Dashboard & Public Report Mode)
├── Rainfall.html               # หน้าแดชบอร์ดติดตามปริมาณน้ำฝน (Rainfall Dashboard)
├── server.js                   # Local Web Server สำหรับทดสอบในเครื่อง (Zero-dependency)
├── start_server.bat            # ตัวรัน Local Server แบบ 1-Click
├── .gitignore                  # ละเว้นไฟล์ขยะระบบปฏิบัติการและ IDE
└── README.md                   # เอกสารอธิบายโปรเจกต์
```

---

## 🚀 การติดตั้งและใช้งาน (Getting Started)

เนื่องจากโปรเจกต์นี้พัฒนาด้วย **Vanilla HTML5, CSS3, JavaScript (ES6)** และเชื่อมต่อ API ผ่าน Google Apps Script ท่านสามารถรันโปรเจกต์ได้ทันทีโดยไม่ต้องติดตั้ง Node.js Build Step:

### 1. ทดสอบบนเครื่องส่วนบุคคล (Local Setup)
1. ดาวน์โหลดหรือ `git clone` โปรเจกต์ลงในเครื่อง
2. เปิดไฟล์ `index.html` หรือ `Rainfall.html` ผ่านเว็บบราวเซอร์ (Chrome, Firefox, Edge, Safari) หรือใช้ Live Server ใน VS Code

### 2. การนำขึ้นโฮสต์ด้วย GitHub Pages (Deployment)
1. อัปโหลดไฟล์ในโฟลเดอร์นี้ขึ้นไปบน GitHub Repository
2. เข้าไปที่ **Settings** -> **Pages**
3. ในส่วน **Build and deployment**:
   - **Source**: เลือก `Deploy from a branch`
   - **Branch**: เลือก `main` โฟลเดอร์ `/ (root)`
4. กด **Save** ระบบจะสร้าง URL ให้ทันที เช่น `https://<username>.github.io/<repository-name>/`

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

* **Frontend Framework**: HTML5, Vanilla JavaScript (ES6+), Tailwind CSS (via CDN)
* **Mapping Engine**: Leaflet.js 1.9.4, Leaflet Draw
* **Charts Library**: Chart.js, ApexCharts
* **Icons & UI Effects**: FontAwesome 6.4, SweetAlert2, Glassmorphism & Micro-animations
* **Backend API**: Google Apps Script (Web App Endpoint REST API) & LINE Webhook
* **Primary Database**: Supabase Cloud (PostgreSQL 15+ ความเร็วสูงแบบ Realtime)
* **Secondary / Historical Database**: Google Sheets Engine
* **Messaging API**: LINE Messaging API (Flex Messages, Webhook Events, Rich Menu)
* **Hydroinformatics API**: Thaiwater API v3 (สสน.) / RID Tele-monitoring (ชป.17) / Open-Meteo API
* **AI OCR Engine**: Typhoon OCR (Opentyphoon) / Akson OCR สำหรับสแกนบัตรประชาชน

---

## 📄 License & Attribution

พัฒนาและดูแลโดย **เทศบาลตำบลตันหยงมัส อำเภอระแงะ จังหวัดนราธิวาส** เพื่อประโยชน์สาธารณะและการป้องกันภัยพิบัติในพื้นที่
