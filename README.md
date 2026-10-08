# 🌊 ระบบรายงานสถานการณ์น้ำท่วมและปริมาณน้ำฝน เทศบาลตำบลตันหยงมัส

ระบบเว็บแอปพลิเคชันแดชบอร์ดและศูนย์รับแจ้งเหตุฉุกเฉินเรียลไทม์ สำหรับติดตามและรายงานสถานการณ์น้ำท่วม ปริมาณน้ำฝน ระดับน้ำในลำน้ำ การอพยพ และการช่วยเหลือประชาชน สำหรับ **เทศบาลตำบลตันหยงมัส อำเภอระแงะ จังหวัดนราธิวาส** เชื่อมต่อกับ **LINE Official Account (LINE OA)**, คลังข้อมูลน้ำแห่งชาติ สสน., กรมชลประทาน (ชป.17) และฐานข้อมูลคลาวด์ **Supabase PostgreSQL**

---

## 📌 จุดเด่นของระบบ (Key Features)

### 1. 📊 แดชบอร์ดสถานการณ์น้ำท่วมเจ้าหน้าที่ (`index.html`)
* **Interactive Map (One Map)**: แสดงแผนที่รวมสถานการณ์เสี่ยงภัย จุดวัดระดับน้ำ พื้นที่อพยพ ขอบเขตน้ำท่วม และจุดเส้นทางปิดสัญจร ผ่าน Leaflet.js
* **Real-Time Telemetry Monitoring**: ติดตามระดับน้ำเรียลไทม์ 2 สถานีหลัก:
  * 🌊 **สถานี X.73 คลองตันหยงมัส (สะพานตันหยงมัส)** — ระดับตลิ่ง 14.90 ม.รทก. / เฝ้าระวัง 13.50 ม.รทก.
  * 🌊 **สถานี X.73A คลองตันหยงมัส (บ้านบองอ)** — ระดับตลิ่ง 26.80 ม.รทก.
* **AI Hydrograph Analytics**: ระบบวิเคราะห์เวลาเดินทางมวลน้ำ (Lag Time 4–6 ชม.) จากต้นน้ำ X.73A สู่เขตเทศบาล พร้อมระบบแนะนำการส่งแจ้งเตือน LINE Broadcast
* **Evacuation & Relief Management**: ลงทะเบียนผู้ประสบภัย ศูนย์พักพิงชั่วคราว การติดตามกลุ่มเปราะบาง และตัดสต๊อกถุงยังชีพอัตโนมัติ
* **PDPA Data Masking & Security PIN**: ระบบรักษาความปลอดภัยข้อมูลส่วนบุคคล เซ็นเซอร์เลขบัตรประชาชนและเบอร์โทร พร้อมระบบปลดล็อกด้วยรหัส PIN 6 หลัก และจัดการรหัสผ่านผ่าน Admin UI บน Supabase
* **Looker Studio Embedded Analytics**: เชื่อมต่อรายงานสรุปเชิงลึกภาพรวมภัยพิบัติผ่าน Google Looker Studio

### 2. 📱 Clean Minimal Citizen Portal (โหมดประชาชน `mode=report`)
* **แยก 2 กล่องการทำงานหลักด้วยโทนสีอ่อนพาสเทล (Soft Pastel Contrast)**:
  * 🟠 **กล่องที่ 1 (แจ้งสถานะ / ขอความช่วยเหลือ)**: โทนสี Soft Rose & Amber สำหรับแจ้งสถานะ "ปลอดภัย" หรือ "ขอรับถุงยังชีพ / เรือรับส่ง / อพยพด่วน" พร้อมระบุพิกัด GPS อัตโนมัติ
  * 🔵 **กล่องที่ 2 (รายงานระดับน้ำในพื้นที่)**: โทนสี Soft Sky & Azure ระบบแจ้งเตือนชุมชนภาคประชาชน (Crowdsourced)
* **Real-Time Station Card**: การ์ดระดับน้ำสดสะพานตันหยงมัส (X.73) พร้อมเกณฑ์เตือนภัยและระดับตลิ่งถูกต้องตามกรมชลประทาน
* **Shelter Directory**: พิกัดศูนย์พักพิงหลัก 3 แห่ง (ศูนย์เทศบาลตำบลตันหยงมัส, ศูนย์มัสยิดตันหยงมัส, ศูนย์โรงเรียนบ้านเขาพระ) พร้อมปุ่มนำทาง Google Maps

### 3. 🌊 ระบบรายงานระดับน้ำภาคประชาชน (Citizen Crowdsource Reporting)
* **ตารางเฉพาะบน Supabase (`citizen_water_reports`)**:
* **ฟอร์มรายงาน 4 ส่วนใช้งานง่ายบนมือถือ**:
  1. **ตำแหน่ง**: ดึง GPS อัตโนมัติ หรือแตะเลือกจุดบนแผนที่ Leaflet Mini Picker
  2. **ระดับน้ำ 6 ระดับ**: ปุ่มเลือกพร้อมไอคอน (แห้ง <10 ซม., ข้อเท้า-เข่า 10-50 ซม., เข่า-เอว 50-100 ซม., เอว-อก 100-130 ซม., อกขึ้นไป 130-180 ซม., มิดหัว >180 ซม.)
  3. **แนวโน้มระดับน้ำ**: กำลังขึ้น, ทรงตัว, กำลังลด
  4. **หมายเหตุและข้อมูลผู้รายงาน**: บันทึกสภาพน้ำท่วมในซอย/หน้าบ้าน และปักหมุดขึ้นแผนที่รวมทันที

### 4. 🚧 ระบบรายงานเส้นทางปิด / ไม่สามารถสัญจรได้ (Road Closures Alert)
* **ตารางเฉพาะบน Supabase (`road_closures`)**: แยกสัดส่วนออกจาก `flood_polygons` พร้อม RLS Policies
* **เจ้าหน้าที่อัปเดตผ่านหน้าจอภาพรวม**: ระบุชื่อถนน, สถานะการจราจร, ระดับน้ำบนผิวทาง, ทางเลี่ยงที่แนะนำ, แนบรูปถ่ายสภาพเส้นทาง และปักหมุดลง One Map
* **แสดงผล 2 ช่องทาง**: ทั้งในหน้า One Map ของเจ้าหน้าที่ และกล่องแจ้งเตือนเส้นทางในหน้าโหมดประชาชน

### 5. 🏛️ ระบบตีกรอบขอบเขตเทศบาล & Inverted GIS Masking
* **พิกัดขอบเขตเทศบาลตำบลตันหยงมัส 11 จุด**:
* **Inverted Mask (Donut Polygon)**: ย้อมพื้นที่นอกเขตเทศบาลเป็นสีเทาเข้มโปร่งแสง (`#0f172a` Opacity 45–55%) ทำให้พื้นที่ในเขตเทศบาลสว่าง คมชัด โดดเด่น พร้อมเส้นประสีน้ำเงินแสดงแนวเขต
* **Point-in-Polygon (Ray-Casting Algorithm)**: ตรวจจับและล็อกพิกัดไม่ให้อนุญาตให้ปักหมุดนอกเขตเทศบาล ทั้งการคลิกเลือกจุด, การลากหมุด (เด้งกลับอัตโนมัติ), และการดึง GPS

### 6. 🌧️ แดชบอร์ดติดตามปริมาณน้ำฝน (`Rainfall.html`)
* **Data Visualization**: แสดงสถิติและกราฟปริมาณน้ำฝนย้อนหลังด้วย ApexCharts (รายวัน, รายเดือน, รายปี และสถิติย้อนหลัง 5 ปี)
* **Smart Filtering & Comparison**: คำนวณฝนสะสมย้อนหลัง 3 วัน, 7 วัน และเปรียบเทียบสถิติกับปีก่อนหน้า

### 7. 💬 LINE Official Account (LINE OA) & Flex Messages (`Code.gs`)
* **การ์ดระดับน้ำ Flex Message รายสถานี**: สรุประดับน้ำสถานี X.73 และ X.73A พร้อม Dynamic Theme Color
* **การ์ดพยากรณ์อากาศ 7 วัน Carousel**: สไตล์ TMD 7-Day Forecast Widget ของกรมอุตุนิยมวิทยา
* **การตอบกลับฉุกเฉิน**: สายด่วนฉุกเฉินและเบอร์กู้ภัย 24 ชั่วโมง

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```
Flood-Dashboard/
├── assets/
│   ├── favicon.ico             # ไอคอนเว็บบราวเซอร์
│   └── logo.png                # ตราสัญลักษณ์เทศบาลตำบลตันหยงมัส
├── css/
│   ├── main.css                # สไตล์หลักของระบบ, Leaflet styles & Mask styling
│   └── rainfall.css            # สไตล์ของหน้า Rainfall.html
├── js/
│   ├── config.js               # ตั้งค่าระบบ, ขอบเขตเทศบาล (MUNICIPALITY_BOUNDARY), Ray-casting
│   ├── supabase-service.js     # เชื่อมต่อ Supabase PostgreSQL (CRUD, road_closures, citizen_water_reports)
│   ├── utils.js                # ฟังก์ชันยูทิลิตี้ แปลงวันที่, SweetAlert, การจัดการข้อมูล
│   ├── map.js                  # จัดการแผนที่ Leaflet, Marker Layers, Drawing tools
│   ├── dashboard.js            # แดชบอร์ดหลัก One Map, เลเยอร์ข้อมูล, จัดการเส้นทางปิด
│   ├── rainfall.js             # จัดการข้อมูลน้ำฝน และ ApexCharts
│   └── modules/
│       ├── admin-dashboard.js  # แดชบอร์ดสำหรับผู้บริหารและระบบค้นหาที่อยู่
│       ├── public-report.js    # Clean Minimal Portal (mode=report), Crowdsource Modal & Mask
│       ├── relief.js           # ระบบแจกจ่ายถุงยังชีพและสต็อก
│       ├── telemetry.js        # เชื่อมต่อ Telemetry X.73 / X.73A และ AI Hydrograph
│       ├── user-mgmt.js        # จัดการผู้ใช้งานและสิทธิ์
│       └── weather.js          # พยากรณ์อากาศและ LINE Broadcast
├── Code.gs                     # Google Apps Script Backend, LINE Webhook & Flex Messages
├── index.html                  # หน้าแดชบอร์ดหลัก และ Citizen Public Portal
├── Rainfall.html               # หน้าแดชบอร์ดติดตามปริมาณน้ำฝน
├── server.js                   # Local Web Server สำหรับทดสอบในเครื่อง
├── start_server.bat            # สคริปต์รัน Local Server แบบ 1-Click
├── .gitignore                  # ละเว้นไฟล์ระบบปฏิบัติการและไฟล์ชั่วคราว
└── README.md                   # เอกสารอธิบายระบบฉบับสมบูรณ์
```

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

* **Frontend**: HTML5, Vanilla JavaScript (ES6+ Modules), Tailwind CSS
* **Mapping Engine**: Leaflet.js 1.9.4, Leaflet Draw, Inverted Donut Mask Polygon
* **Charts & Analytics**: Chart.js, ApexCharts, Google Looker Studio
* **Icons & UI**: FontAwesome 6.4, SweetAlert2
* **Cloud Database**: Supabase (PostgreSQL 15+ Realtime Database)
* **Secondary / Backup Database**: Google Sheets Engine
* **Backend & Webhook**: Google Apps Script REST API & LINE Messaging API
* **Hydrology Data Sources**: Thaiwater API v3 (สสน.), RID Tele-monitoring (ชป.17 กรมชลประทาน), Open-Meteo

---

## 📄 License & Attribution

พัฒนาและดูแลโดย **เทศบาลตำบลตันหยงมัส อำเภอระแงะ จังหวัดนราธิวาส** เพื่อประโยชน์สาธารณะและการบริหารจัดการอุทกภัยในพื้นที่

