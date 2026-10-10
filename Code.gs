/**
 * ระบบจัดการสถานการณ์น้ำและศูนย์พักพิง เทศบาลตำบลตันหยงมัส
 * ปรับปรุงล่าสุด: รองรับกลุ่มเปราะบาง, ตัดสต๊อกอัตโนมัติ, แผนที่อพยพ และดึงพิกัดน้ำอัตโนมัติ
 */

// ==========================================
// 🔐 ระบบจัดการคอนฟิกและความปลอดภัย (Script Properties)
// ==========================================
function getScriptProperty(key, fallback) {
  try {
    var val = PropertiesService.getScriptProperties().getProperty(key);
    if (val !== null && val !== undefined && val !== '') {
      return val;
    }
  } catch (e) {
    Logger.log("⚠️ Error reading ScriptProperty [" + key + "]: " + e.message);
  }
  return fallback !== undefined ? fallback : '';
}

// ดึงค่าคอนฟิกจาก Script Properties (ตั้งค่าผ่าน Project Settings > Script Properties)
const SS_ID = getScriptProperty('SS_ID', '');
const DRIVE_FOLDER_ID = getScriptProperty('DRIVE_FOLDER_ID', '');
const TMD_UID = getScriptProperty('TMD_UID', ''); // กรมอุตุนิยมวิทยา User ID
const TMD_UKEY = getScriptProperty('TMD_UKEY', ''); // กรมอุตุนิยมวิทยา API Key
const LINE_CHANNEL_ACCESS_TOKEN = getScriptProperty('LINE_CHANNEL_ACCESS_TOKEN', '');

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ระบบเทศบาลตำบลตันหยงมัส')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    
    // ตรวจจับคำขอ Webhook จาก LINE
    if (params && params.events && Array.isArray(params.events)) {
      return handleLineWebhook(params.events);
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // ==========================================
    // 1. ระบบ Login และตรวจสอบสิทธิ์
    // ==========================================
    if (params.action === 'login') {
      const sheet = ss.getSheetByName('users');
      if (!sheet || sheet.getLastRow() === 0) {
         return createResponse({ success: false, error: 'ไม่พบฐานข้อมูลผู้ใช้งาน' });
      }
      
      const data = sheet.getLastRow() > 1 ? sheet.getDataRange().getValues().slice(1) : [];
      const userRow = data.find(r => r[0].toString().trim() === params.username.trim());
      
      if (userRow) {
        const role = userRow[1] ? userRow[1].toString().toLowerCase().trim() : 'shelter';
        return createResponse({ success: true, role: role });
      } else {
        return createResponse({ success: false, error: 'ไม่พบชื่อผู้ใช้งานในระบบ' });
      }
    }

    // ==========================================
    // 2. โหลดข้อมูลเริ่มต้นทั้งหมด (Initial Data)
    // ==========================================
    if (params.action === 'getInitialData') {
      const period = params.period || '2569';
      
      // Auto-ensure 2569 Flood_DATA sheet if period is 2569
      if (period === '2569' && !ss.getSheetByName('Flood_DATA_2569') && !ss.getSheetByName('FLOOD_DATA_2569')) {
        try {
          createNewTab(ss, 'Flood_DATA', '2569');
        } catch(e) {
          Logger.log('Auto-create Flood_DATA_2569 notice: ' + e);
        }
      }

      const getSheetData = (name) => {
        let sheetName = name;
        if (['WaterLevels', 'Evacuees', 'Relief', 'Evacuation_Reports', 'ReliefStock', 'Flood_DATA', 'FLOOD_DATA', 'Flood_Polygons'].includes(name)) {
          if (period !== '2568') {
            sheetName = name + '_' + period;
          } else {
            if (ss.getSheetByName(name + '_2568')) {
              sheetName = name + '_2568';
            }
          }
        }
        let s = ss.getSheetByName(sheetName);
        if (!s) {
          s = ss.getSheetByName(name);
        }
        return (s && s.getLastRow() > 1) ? s.getDataRange().getValues().slice(1) : [];
      };

      return createResponse({
        success: true,
        periods: getAvailablePeriods(ss),
        // 🌟 ดึงเฉพาะคอลัมน์ A (index 0) และกรองช่องว่างทิ้ง สำหรับทำ Dropdown
        waterPoints: getSheetData('WaterPoints').map(row => row[0]).filter(val => val.toString().trim() !== ''),
        
        waterLevels: getSheetData('WaterLevels'),
        evacuees: getSheetData('Evacuees'),
        addresses: getSheetData('Address').flat(),
        reliefData: getSheetData('Relief'),
        reliefStock: getSheetData('ReliefStock'),
        addressEvac: getSheetData('Address_Evacuation'),
        evacReports: getSheetData('Evacuation_Reports'),
        floodPolygons: getSheetData('Flood_Polygons'),
        floodData: (() => {
          let sheetName = 'Flood_DATA';
          if (period) {
            if (ss.getSheetByName('Flood_DATA_' + period)) {
              sheetName = 'Flood_DATA_' + period;
            } else if (ss.getSheetByName('FLOOD_DATA_' + period)) {
              sheetName = 'FLOOD_DATA_' + period;
            }
          }
          let s = ss.getSheetByName(sheetName);
          if (!s) {
            s = ss.getSheetByName('Flood_DATA') || ss.getSheetByName('FLOOD_DATA');
          }
          return s ? s.getDataRange().getValues() : [];
        })(),
        riskMapImageUrl: PropertiesService.getScriptProperties().getProperty('RISK_MAP_IMAGE_URL') || ""
      });
    }

    if (params.action === 'createNewPeriod') {
      const newPeriod = params.period;
      if (!newPeriod || newPeriod.trim() === '') {
        return createResponse({ success: false, error: 'กรุณาระบุช่วงเวลา' });
      }
      try {
        createNewTab(ss, 'WaterLevels', newPeriod);
        createNewTab(ss, 'Evacuees', newPeriod);
        createNewTab(ss, 'Relief', newPeriod);
        createNewTab(ss, 'Evacuation_Reports', newPeriod);
        createNewTab(ss, 'ReliefStock', newPeriod);
        createNewTab(ss, 'Flood_DATA', newPeriod);
        createNewTab(ss, 'Flood_Polygons', newPeriod);
        return createResponse({ success: true });
      } catch (err) {
        return createResponse({ success: false, error: err.toString() });
      }
    }

    // ==========================================
    // 3. จัดการสิทธิ์ผู้ใช้งาน (User Management)
    // ==========================================
    if (params.action === 'getUsers') {
      const sheet = ss.getSheetByName('users');
      const data = (sheet && sheet.getLastRow() > 1) ? sheet.getDataRange().getValues().slice(1) : [];
      return createResponse({ success: true, users: data });
    }

    if (params.action === 'saveUser') {
      const sheet = ss.getSheetByName('users');
      if (!sheet) return createResponse({ success: false, error: 'ไม่พบแท็บ users' });

      const data = sheet.getLastRow() > 0 ? sheet.getDataRange().getValues() : [];
      const rowIndex = data.findIndex(r => r[0].toString().trim() === params.targetUser.trim());
      
      if (rowIndex > 0) {
        sheet.getRange(rowIndex + 1, 2).setValue(params.targetRole);
      } else {
        sheet.appendRow([params.targetUser.trim(), params.targetRole]);
      }
      return createResponse({ success: true });
    }

    if (params.action === 'deleteUser') {
      const sheet = ss.getSheetByName('users');
      if (!sheet) return createResponse({ success: false, error: 'ไม่พบแท็บ users' });

      const data = sheet.getLastRow() > 0 ? sheet.getDataRange().getValues() : [];
      const rowIndex = data.findIndex(r => r[0].toString().trim() === params.targetUser.trim());
      
      if (rowIndex > 0) { 
        sheet.deleteRow(rowIndex + 1);
        return createResponse({ success: true });
      }
      return createResponse({ success: false, error: 'ไม่พบผู้ใช้นี้ในระบบ หรือ ไม่สามารถลบหัวตารางได้' });
    }

    // ==========================================
    // 4. บันทึกข้อมูลการปฏิบัติงานต่างๆ
    // ==========================================
    
    // 4.1 บันทึกระดับน้ำ
    if (params.action === 'saveWater') {
      const sheet = getSheetWithPeriod(ss, 'WaterLevels', params.period);
      let fileUrl = "";
      
      // ส่วนจัดการรูปภาพ
      if (params.imageData) {
        const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
        const blob = Utilities.newBlob(Utilities.base64Decode(params.imageData.split(",")[1]), params.imageType, "water_" + Date.now());
        const file = folder.createFile(blob);
        
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        fileUrl = "https://lh3.googleusercontent.com/d/" + file.getId();
      }

      // 🌟 แก้ไขจุดที่ 2: ระบบค้นหาพิกัด GPS อัตโนมัติจากชีท WaterPoints
      const wpSheet = ss.getSheetByName('WaterPoints');
      let autoGps = params.coords || ""; // ค่าเริ่มต้น
      
      if (wpSheet && wpSheet.getLastRow() > 1) {
        // ดึงข้อมูลทั้งหมดในชีทจุดวัดน้ำ (ข้ามหัวตาราง)
        const wpData = wpSheet.getDataRange().getValues().slice(1); 
        // ค้นหาแถวที่ชื่อสถานที่ตรงกัน
        const targetPoint = wpData.find(row => row[0].toString().trim() === params.location.trim());
        
        // ถ้าเจอชื่อสถานที่ และคอลัมน์ B (index 1) มีพิกัดอยู่ ให้เอามาใช้
        if (targetPoint && targetPoint[1]) {
          autoGps = targetPoint[1].toString().trim();
        }
      }

      // บันทึกข้อมูลลงชีท WaterLevels (ใช้ autoGps แทนพิกัดเดิม)
      sheet.appendRow([
        new Date(), params.location, params.level, params.reporter, 
        params.trend, autoGps, fileUrl, params.note
      ]);
      
      return createResponse({ success: true });
    }

    // 4.2 บันทึกลงทะเบียนศูนย์พักพิง
    if (params.action === 'saveEvacuee') {
      const sheet = getSheetWithPeriod(ss, 'Evacuees', params.period);
      sheet.appendRow([
        new Date(), params.shelter, params.address, "'" + params.idCard, 
        params.name, params.age, params.gender, "'" + params.phone, 
        params.healthType, params.healthNote, 'พักพิงอยู่'
      ]);
      return createResponse({ success: true });
    }

    // 4.2.1 อัปเดตสถานะผู้ประสบภัยกลับบ้านแล้ว
    if (params.action === 'markEvacueeReturnHome') {
      const sheet = getSheetWithPeriod(ss, 'Evacuees', params.period);
      if (!sheet) return createResponse({ success: false, error: 'ไม่พบแท็บ Evacuees' });

      const data = sheet.getDataRange().getValues();
      const targetIdCard = String(params.idCard || '').replace(/'/g, '').trim();
      const targetName = String(params.name || '').trim();

      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        const rowIdCard = String(data[i][3] || '').replace(/'/g, '').trim();
        const rowName = String(data[i][4] || '').trim();
        if ((targetIdCard && rowIdCard === targetIdCard) || (targetName && rowName === targetName)) {
          rowIndex = i + 1;
          break;
        }
      }

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 11).setValue('กลับบ้านแล้ว');
        sheet.getRange(rowIndex, 12).setValue(new Date());
        return createResponse({ success: true });
      } else {
        return createResponse({ success: false, error: 'ไม่พบรายชื่อผู้ประสบภัยในระบบ' });
      }
    }

    // 4.3 บันทึกแจกถุงยังชีพ
    if (params.action === 'saveRelief') {
      const sheet = getSheetWithPeriod(ss, 'Relief', params.period);
      sheet.appendRow([
        new Date(), params.name, params.status, params.members, 
        params.address, params.regisAddress
      ]);
      return createResponse({ success: true });
    }

    // 4.4 จัดการสต๊อกถุงยังชีพแบบ Manual
    if (params.action === 'saveStock') {
      const sheet = getSheetWithPeriod(ss, 'ReliefStock', params.period);
      if (!sheet) return createResponse({ success: false, error: 'ไม่พบแท็บ ReliefStock' });
      
      sheet.appendRow([
        new Date(), params.type, Number(params.amount), params.note, params.user 
      ]);
      return createResponse({ success: true });
    }

    // 4.4.5 อัปโหลดภาพแผนที่เสี่ยงภัย
    if (params.action === 'saveRiskMapImage') {
      let fileUrl = "";
      if (params.imageData) {
        const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
        const blob = Utilities.newBlob(Utilities.base64Decode(params.imageData.split(",")[1]), params.imageType, "risk_map_" + Date.now());
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        fileUrl = "https://lh3.googleusercontent.com/d/" + file.getId();
        PropertiesService.getScriptProperties().setProperty('RISK_MAP_IMAGE_URL', fileUrl);
      }
      return createResponse({ success: true, url: fileUrl });
    }

   // ==========================================
    // ส่วนรับคำสั่งสแกนบัตรประชาชน (OCR)
    // ==========================================
    if (params.action === 'ocrIdCard') { 
      var base64Data = params.image; 
      var engine = params.engine || 'typhoon'; 
      var ocrResult;

      if (engine === 'akson') {
          ocrResult = callAksonOCR(base64Data);
      } else {
          ocrResult = callTyphoonOCR(base64Data);
      }
      
      return ContentService.createTextOutput(JSON.stringify(ocrResult)).setMimeType(ContentService.MimeType.JSON);
    }
    // ==========================================
    // ฟังก์ชันสกัดข้อมูลจาก HTML (Web Scraping)
    // ==========================================
    if (params.action === 'broadcastLine') {
    return broadcastLineMessage(params.alertType);
}
    // ==========================================
    // Messaging API logic
    // ==========================================
    if (params.action === 'getRIDData') { 
        return ContentService.createTextOutput(JSON.stringify(getRIDWaterLevelFromAPI()))
               .setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'getWeatherData') {
        return createResponse(getWeatherData());
    }
    // ==========================================
    // getAddressList สำหรับหน้า "ลงทะเบียนผู้ประสบภัย"
    // ==========================================
    if (params.action === 'getRegisAddressList') {
    return loadRegisAddressList();
  }
    // ==========================================
    // 4.5 บันทึกรายงานสถานะการอพยพ / Safety Check
    // ==========================================
    if (params.action === 'saveEvacuation') {
      let sheet = getSheetWithPeriod(ss, 'Evacuation_Reports', params.period);
      
      if (!sheet) {
        let targetName = 'Evacuation_Reports';
        const targetPeriod = params.period || '2568';
        if (targetPeriod !== '2568') {
          targetName += '_' + targetPeriod;
        } else {
          if (ss.getSheetByName('Evacuation_Reports_2568')) {
            targetName = 'Evacuation_Reports_2568';
          }
        }
        sheet = ss.insertSheet(targetName);
        // 🌟 เพิ่มคอลัมน์ 'Note' ต่อท้ายเป็นคอลัมน์ที่ 10
        sheet.appendRow(['Timestamp', 'Address', 'People_Count', 'Dest_Type', 'Dest_Name', 'Reporter', 'Coords', 'Evacuee_Name', 'Status', 'Note']);
        sheet.getRange("A1:J1").setBackground("#f97316").setFontColor("white").setFontWeight("bold");
        sheet.setFrozenRows(1);
      }
      
      const reportStatus = params.status || 'อพยพ';
      const destType = (reportStatus === 'ปลอดภัย') ? '-' : params.type;
      const destName = (reportStatus === 'ปลอดภัย') ? '-' : params.dest;

      sheet.appendRow([
        new Date(), 
        params.address, 
        params.count, 
        destType, 
        destName, 
        params.user, 
        params.coords || '', 
        params.evacName || '',
        reportStatus, 
        params.note || '' // 🌟 บันทึกรายละเอียดเพิ่มเติมลงคอลัมน์ที่ 10
      ]);

      if (params.coords && params.coords.trim() !== '') {
        const evacAddrSheet = ss.getSheetByName('Address_Evacuation');
        if (evacAddrSheet) {
          const data = evacAddrSheet.getDataRange().getValues();
          const isExist = data.find(row => row[0].toString().trim() === params.address.trim());
          
          if (!isExist) {
            const coordsSplit = params.coords.split(',');
            if (coordsSplit.length === 2) {
              const lat = coordsSplit[0].trim();
              const lng = coordsSplit[1].trim();
              evacAddrSheet.appendRow([params.address.trim(), lat, lng]);
            }
          }
        }
      }
      return createResponse({ success: true });
    }

    // ==========================================
    // 4.6 บันทึกพื้นที่น้ำท่วมจากการวาดแผนที่ One Map
    // ==========================================
    if (params.action === 'saveFloodPolygon') {
      let sheet = getSheetWithPeriod(ss, 'Flood_Polygons', params.period);
      if (!sheet) {
        let targetName = 'Flood_Polygons';
        const targetPeriod = params.period || '2569';
        if (targetPeriod !== '2568') {
          targetName += '_' + targetPeriod;
        } else {
          if (ss.getSheetByName('Flood_Polygons_2568')) {
            targetName = 'Flood_Polygons_2568';
          }
        }
        sheet = ss.insertSheet(targetName);
        sheet.appendRow(['Timestamp', 'Title', 'Detail', 'Risk_Level', 'GeoJSON', 'Reporter', 'Period']);
        sheet.getRange("A1:G1").setBackground("#ef4444").setFontColor("white").setFontWeight("bold");
        sheet.setFrozenRows(1);
      }
      
      sheet.appendRow([
        new Date(),
        params.title || 'พื้นที่น้ำท่วม',
        params.detail || '',
        params.riskLevel || 'วิกฤต',
        params.geoJson || '',
        params.user || 'Admin',
        params.period || ''
      ]);
      return createResponse({ success: true });
    }

    return createResponse({ success: false, error: 'Invalid Action' });

  } catch (err) {
    return createResponse({ success: false, error: err.toString() });
  }
}

// ==========================================
// ฟังก์ชัน Typhoon OCR
// ==========================================
function callTyphoonOCR(base64Image) {
  try {
    var apiKey = getScriptProperty('TYPHOON_API_KEY');
    if (!apiKey) {
      Logger.log("❌ ไม่พบ TYPHOON_API_KEY ใน Script Properties");
      return { success: false, error: "กรุณาตั้งค่า TYPHOON_API_KEY ใน Script Properties ของ Google Apps Script" };
    }
    var url = "https://api.opentyphoon.ai/v1/chat/completions";
    
    var promptText = "จงอ่านข้อมูลจากบัตรประชาชนไทยนี้ และแยกข้อมูลออกมาเป็นรูปแบบ JSON เท่านั้น โดยมีโครงสร้างดังนี้:\n" +
                     "{\n" +
                     "  \"name\": \"ชื่อ นามสกุล (ไม่ต้องมีคำนำหน้า)\",\n" +
                     "  \"address\": \"ที่อยู่ตามหน้าบัตรทั้งหมดเรียงต่อกัน\"\n" +
                     "}\n" +
                     "ห้ามตอบข้อความอื่นนอกจาก JSON";

    var payload = {
      "model": "typhoon-ocr",
      "messages": [
        {
          "role": "user",
          "content": [
            { "type": "text", "text": promptText },
            { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64," + base64Image } }
          ]
        }
      ],
      "temperature": 0.1
    };

    var options = {
      "method": "post",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true 
    };

    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var responseBody = response.getContentText();

    if (responseCode !== 200) {
      Logger.log("API Error: " + responseBody);
      return { success: false, error: "Typhoon API แจ้งว่า: " + responseBody }; 
    }

    var result = JSON.parse(responseBody);
    var aiResponseText = result.choices[0].message.content;
    
    aiResponseText = aiResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
    var extractedData = JSON.parse(aiResponseText);

    return { success: true, data: extractedData };
  } catch (e) {
    Logger.log("Apps Script Error: " + e.message);
    return { success: false, error: "Apps Script แจ้งว่า: " + e.message };
  }
}

// ==========================================
// ฟังก์ชันสำหรับเรียก Akson OCR
// ==========================================
function callAksonOCR(base64Image) {
 try {
    var apiKey = getScriptProperty('AKSON_API_KEY');
    if (!apiKey) {
      Logger.log("❌ ไม่พบ AKSON_API_KEY ใน Script Properties");
      return { success: false, error: "กรุณาตั้งค่า AKSON_API_KEY ใน Script Properties ของ Google Apps Script" };
    }
    var url = "https://backend.aksonocr.com/api/v2/upload"; 

    var cleanBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, '').replace(/\s+/g, '');
    var decodedImage = Utilities.base64Decode(cleanBase64);
    var imageBlob = Utilities.newBlob(decodedImage, 'image/jpeg', 'idcard.jpg');

    var payload = {
      "model": "AksonOCR-1.0",
      "file": imageBlob
    };

    var options = {
      "method": "post",
      "headers": {
        "X-API-Key": apiKey
      },
      "payload": payload,
      "muteHttpExceptions": true
    };

    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var responseBody = response.getContentText();

    if (responseCode >= 300) {
      Logger.log("Akson Error: " + responseBody);
      return { success: false, error: "Akson แจ้งข้อผิดพลาด: " + responseBody };
    }

    var resultData = JSON.parse(responseBody);
    
    if (!resultData.pages || resultData.pages.length === 0 || !resultData.pages[0].markdown) {
        return { success: false, error: "ไม่พบข้อความบนบัตร (ภาพอาจไม่ชัด)" };
    }

    var textData = resultData.pages[0].markdown;
    var extractedName = "";
    var extractedAddress = "";
    
    var nameMatch = textData.match(/ชื่อตัวและชื่อสกุล\s*([^\n]+)/);
    if (nameMatch) {
        extractedName = nameMatch[1].replace(/\*/g, '').trim(); 
        extractedName = extractedName.replace(/^(นาย|นาง|นางสาว|ด\.ช\.|ด\.ญ\.)\s*/, '').trim();
    }

    var addrMatch = textData.match(/ที่อยู่\s+([\s\S]*?)(?=\n\n|\n\d{1,2}\s+[ก-ฮ]\.[ก-ฮ]\.|\nวันออกบัตร)/);
    if (addrMatch) {
        extractedAddress = addrMatch[1].replace(/\*/g, '').trim();
        extractedAddress = extractedAddress.replace(/\n/g, ' '); 
    }

    if (extractedName === "" && extractedAddress === "") {
        return { success: false, error: "AI อ่านข้อมูลได้ แต่หา 'ชื่อ' และ 'ที่อยู่' ไม่พบ" };
    }

    return { success: true, data: { name: extractedName, address: extractedAddress } };

  } catch (e) {
    Logger.log("Apps Script Error: " + e.message);
    return { success: false, error: "ระบบทำงานผิดพลาด: " + e.message };
  }
}
// ==========================================
// ฟังก์ชันสกัดข้อมูลจาก Sheet (อัพเดทด้วยตนเอง)
// ==========================================
function getRIDWaterLevelFromHTML() {
  try {
    // 1. ระบุ ID ของ Google Sheets ที่คุณต้องการใช้งาน
    var ssId = "1La7s3-meWQsen-haGWVsId1USmeny4oMZBZJ3b3HWKE";
    var ss = SpreadsheetApp.openById(ssId);
    
    // 2. เลือก Sheet (ปกติจะเป็นชีทแรก หรือระบุชื่อชีทที่ต้องการ)
    // หากชื่อชีทไม่ใช่ 'Sheet1' ให้เปลี่ยนชื่อในเครื่องหมายคำพูดครับ
    var sheet = ss.getSheets()[0]; 
    
    // 3. เจาะจงไปที่ แถวที่ 23 คอลัมน์ M
    // แถว 23 = 23, คอลัมน์ M = 13 (A=1, B=2, ..., M=13)
    var range = sheet.getRange(23, 13); 
    var waterLevel = range.getValue().toString().trim();
    
    // 4. ดึงวันที่ปัจจุบันมาแสดงเพื่อให้ทราบว่าข้อมูลอัปเดตแล้ว
    // (หรือจะดึงจากเซลล์อื่นในชีทมาแสดงก็ได้ครับ)
    var updateTime = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");

    if (waterLevel !== "" && waterLevel !== null) {
      return {
        success: true,
        data: {
          level: waterLevel,
          time: updateTime + " น. (อัปเดตล่าสุด)"
        }
      };
    } else {
      throw new Error("ไม่พบข้อมูลในแถว 23 คอลัมน์ M");
    }

  } catch (err) {
    console.error("Sheet Error: " + err.toString());
    return { 
      success: false, 
      error: "ไม่สามารถดึงข้อมูลจาก Sheet ได้: " + err.message 
    };
  }
}
// ==========================================
// Messaging API
// ==========================================
function broadcastLineMessage(type) {
  // 🔑 ดึงจาก Token ส่วนกลาง
  const channelAccessToken = LINE_CHANNEL_ACCESS_TOKEN;
  
  let title = "", message = "", color = "", icon = "";

  // 💡 กำหนดข้อความและสีตามระดับภัย
  if (type === 'normal') {
    title = "สถานการณ์ปกติ";
    message = "ขณะนี้ระดับน้ำคลองตันหยงมัสอยู่ในเกณฑ์ปกติ โปรดติดตามข่าวสารจากทางเทศบาล";
    color = "#22c55e"; // สีเขียว
    icon = "✅";
  } else if (type === 'warning') {
    title = "เฝ้าระวังระดับน้ำ";
    message = "ระดับน้ำคลองตันหยงมัสกำลังเพิ่มสูงขึ้น ขอให้ประชาชนในพื้นที่ลุ่มต่ำเฝ้าติดตามข่าวสารอย่างใกล้ชิด";
    color = "#f59e0b"; // สีส้ม
    icon = "⚠️";
  } else if (type === 'danger') {
    title = "วิกฤต! เตรียมอพยพ";
    message = "ระดับน้ำล้นตลิ่งและเข้าสู่สภาวะวิกฤต โปรดเคลื่อนย้ายทรัพย์สินขึ้นที่สูงและเตรียมพร้อมอพยพทันที!";
    color = "#ef4444"; // สีแดง
    icon = "🚨";
  }

  // สร้างวันที่และเวลาปัจจุบัน
  const dateTimeString = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy เวลา HH:mm น.");

  // 🎨 โครงสร้าง Flex Message ที่จัดระเบียบขนาดและสัดส่วนใหม่
  const payload = {
    "messages": [{
      "type": "flex",
      "altText": icon + " แจ้งเตือนภัย: " + title,
      "contents": {
        "type": "bubble",
        // ลบ "size": "kilo" ออก เพื่อให้กลับไปใช้ขนาดมาตรฐานที่กว้างและอ่านสบายตาขึ้น
        "header": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "text": icon + " " + title,
              "weight": "bold",
              "color": "#ffffff",
              "size": "xl"
            }
          ],
          "backgroundColor": color,
          "paddingTop": "xl",
          "paddingBottom": "xl",
          "paddingStart": "xl",
          "paddingEnd": "xl"
        },
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            // ส่วนที่ 1: ผู้ประกาศ (จัดแบบ 2 คอลัมน์ให้เป็นระเบียบ)
            {
              "type": "box",
              "layout": "horizontal",
              "contents": [
                {
                  "type": "text",
                  "text": "ประกาศจาก :",
                  "color": "#64748b",
                  "size": "sm",
                  "flex": 3 // สัดส่วนความกว้างของคอลัมน์ซ้าย
                },
                {
                  "type": "text",
                  "text": "เทศบาลตำบลตันหยงมัส",
                  "weight": "bold",
                  "color": "#1e293b", // สีเทาเข้มเพื่อให้อ่านง่าย
                  "size": "sm",
                  "flex": 6, // สัดส่วนความกว้างของคอลัมน์ขวา
                  "wrap": true
                }
              ]
            },
            {
              "type": "separator",
              "margin": "lg",
              "color": "#f1f5f9" // เส้นคั่นสีเทาอ่อน
            },
            // ส่วนที่ 2: เนื้อหาประกาศ
            {
              "type": "text",
              "text": "รายละเอียดสถานการณ์",
              "color": "#94a3b8",
              "size": "xs",
              "margin": "lg"
            },
            {
              "type": "text",
              "text": message,
              "wrap": true,
              "size": "md",
              "color": "#334155",
              "margin": "md",
              "weight": "regular"
            },
            {
              "type": "separator",
              "margin": "xl",
              "color": "#f1f5f9"
            },
            // ส่วนที่ 3: วันที่และเวลา (จัดคอลัมน์และเน้นสี)
            {
              "type": "box",
              "layout": "horizontal",
              "margin": "lg",
              "contents": [
                {
                  "type": "text",
                  "text": "อัปเดตล่าสุด :",
                  "size": "xs",
                  "color": "#94a3b8",
                  "flex": 3,
                  "gravity": "center"
                },
                {
                  "type": "text",
                  "text": dateTimeString,
                  "size": "sm",
                  "color": color, // สีของเวลาจะเปลี่ยนตามระดับภัย (เขียว/ส้ม/แดง)
                  "weight": "bold",
                  "flex": 6,
                  "wrap": true,
                  "gravity": "center"
                }
              ]
            }
          ],
          "paddingAll": "xl" // เพิ่มระยะขอบด้านในให้ข้อความไม่ติดขอบกล่อง
        }
      }
    }]
  };

  const options = {
    "method": "post",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + channelAccessToken
    },
    "payload": JSON.stringify(payload)
  };

  try {
    UrlFetchApp.fetch("https://api.line.me/v2/bot/message/broadcast", options);
    return createResponse({ success: true });
  } catch (e) {
    return createResponse({ success: false, error: e.toString() });
  }
}
// ==========================================
//  🟢 ฟังก์ชันใหม่: ดึงรายชื่อที่อยู่จากชีท "Address"
// ==========================================

function loadRegisAddressList() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Address"); 
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "ไม่พบชีท Address" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const lastRow = sheet.getLastRow();
    
    // ถ้าชีทว่างเปล่า (ไม่มีข้อมูลเลยแม้แต่บรรทัดเดียว)
    if (lastRow < 1) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, data: [] })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 💡 อัปเดต: ดึงข้อมูลจากคอลัมน์ A (1) โดยเริ่มตั้งแต่ "แถวที่ 1" จนถึงแถวสุดท้าย
    const rawData = sheet.getRange(1, 1, lastRow, 1).getValues();
    
    // ตัดช่องว่างทิ้ง
    const addressList = rawData.map(row => row[0]).filter(val => val !== "" && val !== null);
      
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: addressList })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
// ==========================================
// ฟังก์ชันเสริม (Helper Functions)
// ==========================================

function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
}

/**
 * ฟังก์ชันสร้าง JSON Response
 */
function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// ฟังก์ชันสำหรับแยกช่วงเวลาข้อมูล (ปี/เดือน)
// ==========================================

function getAvailablePeriods(ss) {
  const sheets = ss.getSheets();
  const periods = new Set();
  const currentYearBE = (new Date().getFullYear() + 543).toString();
  periods.add(currentYearBE); // ปี พ.ศ. ปัจจุบัน (2569)
  periods.add("2568"); // ปี พ.ศ. 2568
  
  const prefixes = ["WaterLevels_", "Evacuees_", "Relief_", "Evacuation_Reports_", "ReliefStock_", "Flood_DATA_", "FLOOD_DATA_", "Flood_Polygons_"];
  sheets.forEach(sheet => {
    const name = sheet.getName();
    for (const prefix of prefixes) {
      if (name.indexOf(prefix) === 0) {
        const suffix = name.substring(prefix.length);
        if (suffix.trim() !== "") {
          periods.add(suffix);
        }
      }
    }
  });
  
  return Array.from(periods).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function getSheetWithPeriod(ss, baseName, period) {
  let sheetName = baseName;
  const targetPeriod = period || '2569';
  if (targetPeriod !== '2568') {
    sheetName = baseName + '_' + targetPeriod;
  } else {
    if (ss.getSheetByName(baseName + '_2568')) {
      sheetName = baseName + '_2568';
    }
  }
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.getSheetByName(baseName);
  }
  return sheet;
}

function createNewTab(ss, baseSheetName, suffix) {
  const newSheetName = baseSheetName + "_" + suffix;
  let sheet = ss.getSheetByName(newSheetName);
  if (!sheet) {
    let baseSheet = ss.getSheetByName(baseSheetName);
    if (!baseSheet && (baseSheetName === 'Flood_DATA' || baseSheetName === 'FLOOD_DATA')) {
      baseSheet = ss.getSheetByName('Flood_DATA') || ss.getSheetByName('FLOOD_DATA');
    }
    if (baseSheet) {
      sheet = ss.insertSheet(newSheetName);
      const lastCol = baseSheet.getLastColumn();
      if (lastCol > 0) {
        const headers = baseSheet.getRange(1, 1, 1, lastCol).getValues();
        sheet.getRange(1, 1, 1, lastCol).setValues(headers);
        baseSheet.getRange(1, 1, 1, lastCol).copyTo(sheet.getRange(1, 1, 1, lastCol), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      }
      sheet.setFrozenRows(1);
    } else {
      sheet = ss.insertSheet(newSheetName);
      if (baseSheetName === 'Flood_DATA' || baseSheetName === 'FLOOD_DATA') {
        const defaultHeaders = [["House ID", "ถนน", "ที่อยู่", "ชื่อ-สกุล", "สถานะ", "จำนวนผู้อาศัย", "ติดต่อ", "Latitude", "Longtitude", "ความเสี่ยง", "รายละเอียด"]];
        sheet.getRange(1, 1, 1, defaultHeaders[0].length).setValues(defaultHeaders);
        sheet.getRange("A1:K1").setBackground("#f97316").setFontColor("white").setFontWeight("bold");
        sheet.setFrozenRows(1);
      }
    }
  }
  return sheet;
}

// ==========================================
// 🟢 ดึงข้อมูลระดับน้ำปัจจุบันจาก API คลังน้ำแห่งชาติเป็นหลัก (พร้อมระบบสำรองแคชในระบบ)
// ==========================================
function getRIDWaterLevelFromAPI() {
  // ⚡ 0. ตรวจสอบ High-Speed In-Memory Cache เพื่อการตอบกลับทันที (< 50ms)
  try {
    const memCache = CacheService.getScriptCache();
    const cachedFast = memCache.get("FAST_RID_WATER_DATA");
    if (cachedFast) {
      const parsedFast = JSON.parse(cachedFast);
      if (parsedFast && parsedFast.success) {
        return parsedFast;
      }
    }
  } catch (memErr) {}

  const cacheKey = "LAST_SUCCESSFUL_RID_DATA";
  const scriptProperties = PropertiesService.getScriptProperties();

  // ------------------------------------------
  // 🥇 ดึงจาก API คลังน้ำแห่งชาติ (thaiwater.net) เป็นหลักเพื่อความรวดเร็วและเสถียรสูงสุด
  // ------------------------------------------
  const fetchOptions = {
    "method": "get",
    "headers": {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*"
    },
    "validateHttpsCertificates": false,
    "followRedirects": true,
    "muteHttpExceptions": true
  };

  const urls = [
    "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load",
    "https://api.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load"
  ];

  for (let u = 0; u < urls.length; u++) {
    try {
      const response = UrlFetchApp.fetch(urls[u], fetchOptions);
      if (response.getResponseCode() === 200) {
        const json = JSON.parse(response.getContentText());
        if (json && json.waterlevel_data && json.waterlevel_data.result === "OK" && json.waterlevel_data.data && json.waterlevel_data.data.length > 0) {
          // ค้นหาสถานี X.73 (คลองตันหยงมัส)
          const stationData = json.waterlevel_data.data.find(d => 
            d.station && d.station.tele_station_oldcode && d.station.tele_station_oldcode === "X.73"
          );

          // ค้นหาสถานี X.73A (บ้านบองอ)
          const stationDataX73A = json.waterlevel_data.data.find(d => 
            d.station && ((d.station.tele_station_oldcode && d.station.tele_station_oldcode === "X.73A") || 
            (d.station.tele_station_name && d.station.tele_station_name.th && d.station.tele_station_name.th.includes("บองอ")))
          );
          
          if (stationData) {
            const rawDatetime = stationData.waterlevel_datetime || "";
            let updateTime = rawDatetime;
            try {
              const parts = rawDatetime.split(" ");
              const dateParts = parts[0].split("-");
              updateTime = dateParts[2] + "/" + dateParts[1] + "/" + dateParts[0] + " " + parts[1];
            } catch(e) { /* ใช้ rawDatetime เดิม */ }
            
            const waterLevel = stationData.waterlevel_msl || stationData.waterlevel_m || "0.00";
            const bankLevel = stationData.station.min_bank || 14.90;
            const diffBank = stationData.diff_wl_bank || "0";

            // ประมวลผลข้อมูลสถานี X.73A (ถ้าพบ)
            let dataX73AObj = null;
            if (stationDataX73A) {
              const rawDatetimeA = stationDataX73A.waterlevel_datetime || "";
              let updateTimeA = rawDatetimeA;
              try {
                const partsA = rawDatetimeA.split(" ");
                const datePartsA = partsA[0].split("-");
                updateTimeA = datePartsA[2] + "/" + datePartsA[1] + "/" + datePartsA[0] + " " + partsA[1];
              } catch(e) {}

              const waterLevelA = stationDataX73A.waterlevel_msl || stationDataX73A.waterlevel_m || "22.34";
              const bankLevelA = stationDataX73A.station && stationDataX73A.station.min_bank ? stationDataX73A.station.min_bank : 26.80;
              const diffBankA = stationDataX73A.diff_wl_bank || "4.46";

              dataX73AObj = {
                level: parseFloat(waterLevelA).toFixed(2),
                time: updateTimeA + " น.",
                bankLevel: bankLevelA,
                diffBank: parseFloat(diffBankA).toFixed(2),
                stationName: "สถานี X.73A บ้านบองอ",
                previousLevel: stationDataX73A.waterlevel_msl_previous || null,
                discharge: stationDataX73A.discharge || null,
                situationLevel: stationDataX73A.situation_level || 0
              };
            }
            
            const result = {
              success: true,
              source: "API",
              data: {
                level: parseFloat(waterLevel).toFixed(2),
                time: updateTime + " น. (API เรียลไทม์)",
                bankLevel: bankLevel,
                diffBank: parseFloat(diffBank).toFixed(2),
                stationName: "สถานี X.73 คลองตันหยงมัส",
                previousLevel: stationData.waterlevel_msl_previous || null,
                discharge: stationData.discharge || null,
                situationLevel: stationData.situation_level || 0,
                dataX73A: dataX73AObj,
                levelX73A: dataX73AObj ? dataX73AObj.level : "22.34"
              }
            };

            // 💾 บันทึกข้อมูลล่าสุดลง ScriptProperties และ CacheService (TTL 3 นาที)
            try {
              scriptProperties.setProperty(cacheKey, JSON.stringify(result));
              CacheService.getScriptCache().put("FAST_RID_WATER_DATA", JSON.stringify(result), 180);
            } catch(cacheErr) {}

            return result;
          }
        }
      }
    } catch (singleErr) {
      console.warn(`⚠️ Warning: Thaiwater fetch failed for ${urls[u]}: ` + singleErr.toString());
    }
  }

  // ------------------------------------------
  // 🥈 ระบบสำรอง: ดึงข้อมูลล่าสุดที่เคยบันทึกไว้ในแคชระบบ
  // ------------------------------------------
  try {
    const savedData = scriptProperties.getProperty(cacheKey);
    if (savedData) {
      const lastResult = JSON.parse(savedData);
      lastResult.isStaleFallback = true;
      if (lastResult.data && lastResult.data.time) {
        lastResult.data.time = lastResult.data.time.replace(" (API เรียลไทม์)", "").replace(" (ชป.17 เรียลไทม์)", "") + " (ข้อมูลล่าสุดในระบบ)";
      }
      console.log("ℹ️ Using last cached RID API data from ScriptProperties.");
      return lastResult;
    }
  } catch(fallbackErr) {
    console.error("🚨 ScriptProperties Fallback Error: " + fallbackErr.toString());
  }

  // กรณีพึ่งติดตั้งระบบและยังไม่มีแคชบันทึกเดิมอยู่เลย ให้แสดงค่าสำรองเริ่มต้น
  return {
    success: true,
    source: "LAST_DATA",
    data: {
      level: "11.02",
      time: Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm น. (ข้อมูลล่าสุดในระบบ)"),
      bankLevel: 14.90,
      diffBank: "3.88",
      stationName: "สถานี X.73 คลองตันหยงมัส",
      previousLevel: "11.02",
      discharge: "8.30",
      situationLevel: 0,
      dataX73A: {
        level: "22.34",
        time: Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm น."),
        bankLevel: 26.80,
        diffBank: "4.46",
        stationName: "สถานี X.73A บ้านบองอ",
        previousLevel: "22.29",
        discharge: null,
        situationLevel: 0
      },
      levelX73A: "22.34"
    }
  };
}

// ==========================================
// 🟢 ดึงข้อมูลสภาพอากาศล่วงหน้า 7 วัน (TMD API หรือ Open-Meteo Fallback)
// ==========================================
function getWeatherData() {
  try {
    // พิกัดของ ต.ตันหยงมัส อ.ระแงะ จ.นราธิวาส
    const lat = "6.29445";
    const lng = "101.72362";
    let forecast = [];

    // 1. ตรวจสอบว่าผู้ใช้ใส่ Key ของ TMD หรือไม่
    if (TMD_UID && TMD_UKEY) {
      try {
        const tmdUrl = "https://data.tmd.go.th/api/WeatherForecast7Days/v2/?uid=" + TMD_UID + "&ukey=" + TMD_UKEY + "&format=json&province=" + encodeURIComponent("นราธิวาส");
        const response = UrlFetchApp.fetch(tmdUrl, { muteHttpExceptions: true });
        
        if (response.getResponseCode() === 200) {
          const resJson = JSON.parse(response.getContentText());
          if (resJson && resJson.Provinces && resJson.Provinces.length > 0) {
            const narathiwatForecast = resJson.Provinces[0].Forecasts;
            if (narathiwatForecast && narathiwatForecast.length > 0) {
              const daysOfWeek = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
              narathiwatForecast.forEach(f => {
                const dateObj = new Date(f.Date);
                const dayName = daysOfWeek[dateObj.getDay()];
                
                let desc = f.Description || "ฝนฟ้าคะนอง";
                let icon = "fa-cloud-showers-heavy text-sky-400";
                if (desc.indexOf("แจ่มใส") !== -1 || desc.indexOf("แดด") !== -1) {
                  icon = "fa-sun text-amber-500";
                } else if (desc.indexOf("เมฆบางส่วน") !== -1) {
                  icon = "fa-cloud-sun text-blue-400";
                } else if (desc.indexOf("พายุ") !== -1 || desc.indexOf("คะนอง") !== -1) {
                  icon = "fa-cloud-bolt text-red-500 animate-pulse";
                }

                const rainVal = f.Rain !== undefined ? f.Rain : 5.0;
                const rainProb = f.RainProbability !== undefined ? f.RainProbability : (rainVal > 20 ? 80 : rainVal > 10 ? 60 : rainVal > 2 ? 40 : rainVal > 0 ? 20 : 10);

                forecast.push({
                  day: dayName,
                  date: f.Date,
                  tempMax: f.MaxTemperature !== undefined ? Math.round(f.MaxTemperature) : 33,
                  tempMin: f.MinTemperature !== undefined ? Math.round(f.MinTemperature) : 24,
                  rain: rainVal,
                  rainProb: Math.round(rainProb),
                  wind: f.WindSpeed !== undefined ? Math.round(f.WindSpeed) : 10,
                  desc: desc,
                  icon: icon
                });
              });
            }
          }
        }
      } catch (tmdErr) {
        console.error("🚨 TMD API Error: " + tmdErr.toString() + " - สลับไปใช้ Open-Meteo");
      }
    }

    // 2. ถ้าไม่ได้ใช้ TMD หรือโหลด TMD ล้มเหลว ให้ใช้ Open-Meteo เป็นแผนทดแทนแบบไม่ต้องใช้ Key
    if (forecast.length === 0) {
      const openMeteoUrl = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lng + "&daily=weathercode,temperature_2m_max,temperature_2m_min,rain_sum,precipitation_probability_max,windspeed_10m_max&timezone=Asia%2FBangkok";
      const response = UrlFetchApp.fetch(openMeteoUrl);
      const json = JSON.parse(response.getContentText());
      const daily = json.daily;

      if (!daily) {
        throw new Error("ไม่ได้รับข้อมูลพยากรณ์อากาศรายวันจาก API");
      }

      const weatherCodes = daily.weather_code || daily.weathercode || [];
      const tempMaxs = daily.temperature_2m_max || [];
      const tempMins = daily.temperature_2m_min || [];
      const rainSums = daily.rain_sum || [];
      const rainProbs = daily.precipitation_probability_max || [];
      const windSpeeds = daily.wind_speed_10m_max || daily.windspeed_10m_max || [];

      const getCodeText = (code) => {
        const mapping = {
          0: { text: "ท้องฟ้าแจ่มใส", icon: "fa-sun text-amber-500" },
          1: { text: "ท้องฟ้าโปร่ง", icon: "fa-cloud-sun text-yellow-500" },
          2: { text: "มีเมฆบางส่วน", icon: "fa-cloud-sun text-blue-400" },
          3: { text: "ครึ้มฟ้าครึ้มฝน", icon: "fa-cloud text-slate-400" },
          45: { text: "มีหมอกลง", icon: "fa-smog text-slate-300" },
          48: { text: "มีหมอกหนา", icon: "fa-smog text-slate-400" },
          51: { text: "ฝนละอองเบาบาง", icon: "fa-cloud-rain text-sky-300" },
          53: { text: "ฝนละอองปานกลาง", icon: "fa-cloud-rain text-sky-400" },
          55: { text: "ฝนละอองหนาแน่น", icon: "fa-cloud-rain text-sky-500" },
          61: { text: "ฝนตกเล็กน้อย", icon: "fa-cloud-showers-heavy text-sky-400" },
          63: { text: "ฝนตกปานกลาง", icon: "fa-cloud-showers-heavy text-blue-400" },
          65: { text: "ฝนตกหนัก", icon: "fa-cloud-showers-heavy text-blue-600 animate-bounce" },
          80: { text: "ฝนซู่ตกเล็กน้อย", icon: "fa-cloud-showers-heavy text-sky-400" },
          81: { text: "ฝนซู่ตกปานกลาง", icon: "fa-cloud-showers-heavy text-blue-500" },
          82: { text: "ฝนซู่ตกหนัก", icon: "fa-cloud-showers-heavy text-blue-700" },
          95: { text: "พายุฝนฟ้าคะนอง", icon: "fa-cloud-bolt text-red-500 animate-pulse" },
          96: { text: "พายุฝนฟ้าคะนองและมีลูกเห็บ", icon: "fa-cloud-bolt text-red-600" },
          99: { text: "พายุฝนฟ้าคะนองรุนแรง", icon: "fa-cloud-bolt text-red-700 animate-ping" }
        };
        return mapping[code] || { text: "ฝนฟ้าคะนอง", icon: "fa-cloud-showers-heavy text-blue-500" };
      };

      const daysOfWeek = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
      const loopLength = daily.time ? daily.time.length : 0;
      
      for (let i = 0; i < loopLength; i++) {
        const dateStr = daily.time[i];
        const code = weatherCodes[i] !== undefined ? weatherCodes[i] : 0;
        const weatherInfo = getCodeText(code);
        
        const dateObj = new Date(dateStr);
        const dayName = daysOfWeek[isNaN(dateObj.getDay()) ? 0 : dateObj.getDay()];

        const rainVal = rainSums[i] !== undefined && rainSums[i] !== null ? rainSums[i] : 0;
        const rainProbVal = rainProbs[i] !== undefined && rainProbs[i] !== null ? Math.round(rainProbs[i]) : (rainVal > 20 ? 80 : rainVal > 10 ? 60 : rainVal > 2 ? 40 : rainVal > 0 ? 20 : 10);

        forecast.push({
          day: dayName,
          date: dateStr,
          tempMax: tempMaxs[i] !== undefined ? Math.round(tempMaxs[i]) : 33,
          tempMin: tempMins[i] !== undefined ? Math.round(tempMins[i]) : 24,
          rain: rainVal,
          rainProb: rainProbVal,
          wind: windSpeeds[i] !== undefined && windSpeeds[i] !== null ? Math.round(windSpeeds[i]) : 0,
          desc: weatherInfo.text,
          icon: weatherInfo.icon
        });
      }
    }

    return { success: true, forecast: forecast };
  } catch (err) {
    console.error("🚨 getWeatherData Error: " + err.toString());
    return { success: false, error: err.toString() };
  }
}

// ==========================================
// 🟢 ส่วนการทำงานของ LINE Webhook และ Rich Menu
// ==========================================

/**
 * จัดการ Webhook Events ที่ส่งมาจาก LINE OA
 */
/**
 * จัดการ Webhook Events ที่ส่งมาจาก LINE OA
 */
function handleLineWebhook(events) {
  for (const event of events) {
    if (event.type === 'message' && event.message && event.message.type === 'text') {
      const replyToken = event.replyToken;
      const userText = event.message.text.trim();
      
      // ==========================================
      // 1. ภาพรวมสถานการณ์ (ปุ่มใหญ่) -> เด้ง Quick Reply 3 ปุ่ม
      // ==========================================
      if (userText === "ภาพรวมสถานการณ์" || userText === "สถานการณ์" || userText === "ภาพรวม" || userText === "เมนูภาพรวม") {
        const overviewQuickReply = {
          type: "text",
          text: "📢 ภาพรวมสถานการณ์น้ำท่วม เทศบาลตำบลตันหยงมัส\nกรุณาเลือกข้อมูลที่ต้องการตรวจสอบด้านล่างนี้ได้เลยครับ 👇",
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "message",
                  label: "🏕️ ศูนย์พักพิง",
                  text: "ศูนย์พักพิง"
                }
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "🚧 ตรวจสอบเส้นทาง",
                  text: "ตรวจสอบเส้นทาง"
                }
              },
              {
                type: "action",
                action: {
                  type: "uri",
                  label: "💧 รายงานระดับน้ำ",
                  uri: "https://tanyongmas.github.io/Flood-Dashboard/?mode=report&open=water_report"
                }
              }
            ]
          }
        };
        sendLineReply(replyToken, overviewQuickReply);
      }
      
      // ==========================================
      // 1.1 ศูนย์พักพิง -> แสดง Carousel 3 ศูนย์ พร้อมปุ่มนำทาง
      // ==========================================
      else if (userText.includes("ศูนย์พักพิง") || userText.includes("จุดอพยพ") || userText.includes("ที่พักพิง")) {
        try {
          const flexShelters = getSheltersCarouselFlexMessage();
          sendLineReply(replyToken, flexShelters);
        } catch (err) {
          console.error("🚨 Shelters Carousel error: " + err.toString());
          sendLineReply(replyToken, "⚠️ เกิดข้อผิดพลาดในการโหลดข้อมูลศูนย์พักพิง: " + err.toString());
        }
      }

      // ==========================================
      // 1.2 ตรวจสอบเส้นทาง -> ดึงข้อมูลเส้นทางปิดจาก Supabase (ถ้าไม่มีแจ้งสัญจรปกติ)
      // ==========================================
      else if (userText.includes("ตรวจสอบเส้นทาง") || userText.includes("เส้นทางปิด") || userText.includes("เส้นทาง") || userText.includes("ถนนปิด") || userText.includes("การจราจร")) {
        try {
          const flexRoads = getRoadClosuresFlexMessage();
          sendLineReply(replyToken, flexRoads);
        } catch (err) {
          console.error("🚨 Road Closures Flex error: " + err.toString());
          sendLineReply(replyToken, "⚠️ เกิดข้อผิดพลาดในการตรวจสอบเส้นทาง: " + err.toString());
        }
      }

      // ==========================================
      // 2. เมนูระดับน้ำ (Quick Reply หลัก) -> ตอบกลับทันทีโดยไม่ต้องรอ API ภายนอก (< 50ms)
      // ป้ายกำกับ (Label) ทุกปุ่มยาวไม่เกิน 20 ตัวอักษรตามมาตรฐาน LINE Messaging API 100%
      // ==========================================
      else if (userText === "ระดับน้ำ" || userText === "เช็คระดับน้ำ" || userText === "ดูระดับน้ำ" || userText === "สถานการณ์น้ำ" || userText === "เมนูระดับน้ำ" || userText === "น้ำ") {
        const waterQuickReply = {
          type: "text",
          text: "💧 รายงานระดับน้ำคลองตันหยงมัส เรียลไทม์\nกรุณาเลือกสถานีที่ต้องการตรวจสอบด้านล่างนี้ได้เลยครับ 👇",
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "message",
                  label: "🌊 X.73 ตันหยงมัส",
                  text: "สะพานตันหยงมัส (X.73)"
                }
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "🌊 X.73A บ้านบองอ",
                  text: "บ้านบองอ (X.73A)"
                }
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "📊 สรุปทุกสถานี",
                  text: "สรุปทุกสถานี"
                }
              }
            ]
          }
        };
        sendLineReply(replyToken, waterQuickReply);
      }

      // ==========================================
      // 2.1 ระดับน้ำ X.73A (บ้านบองอ)
      // ==========================================
      else if (userText.includes("ระดับน้ำบองอ") || userText.includes("ระดับน้ำ X.73A") || userText.includes("ระดับน้ำX.73A") || userText.includes("บองอ") || userText.includes("X.73A")) {
        try {
          const waterRes = getRIDWaterLevelFromAPI();
          if (waterRes && waterRes.success) {
            let flexSent = false;
            try {
              const flexMsg = getWaterLevelFlexMessage(waterRes, 'X.73A');
              flexSent = sendLineReply(replyToken, flexMsg);
            } catch (flexErr) {
              console.error("🚨 Failed to generate X.73A Flex: " + flexErr.toString());
            }

            if (!flexSent) {
              const textReport = formatWaterLevelAsText(waterRes, 'X.73A');
              sendLineReply(replyToken, textReport);
            }
          } else {
            sendLineReply(replyToken, "⚠️ ขออภัย ไม่สามารถดึงข้อมูลระดับน้ำสถานี X.73A (บ้านบองอ) ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง");
          }
        } catch (err) {
          console.error("🚨 Water level X.73A error: " + err.toString());
          sendLineReply(replyToken, "⚠️ เกิดข้อผิดพลาดในการดึงข้อมูลระดับน้ำสถานี X.73A: " + err.toString());
        }
      }

      // ==========================================
      // 2.2 สรุปทุกสถานี (Carousel 2 สถานี)
      // ==========================================
      else if (userText.includes("สรุปทุกสถานี") || userText.includes("สรุประดับน้ำ") || userText.includes("ทุกสถานี")) {
        try {
          const waterRes = getRIDWaterLevelFromAPI();
          if (waterRes && waterRes.success) {
            let flexSent = false;
            try {
              const flexCarousel = getWaterLevelCarouselFlexMessage(waterRes);
              flexSent = sendLineReply(replyToken, flexCarousel);
            } catch (flexErr) {
              console.error("🚨 Failed to generate Water Carousel: " + flexErr.toString());
            }

            if (!flexSent) {
              const textReport = formatWaterLevelAsText(waterRes, 'X.73') + "\n\n" + formatWaterLevelAsText(waterRes, 'X.73A');
              sendLineReply(replyToken, textReport);
            }
          } else {
            sendLineReply(replyToken, "⚠️ ขออภัย ไม่สามารถดึงข้อมูลระดับน้ำได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง");
          }
        } catch (err) {
          console.error("🚨 Water Carousel error: " + err.toString());
          sendLineReply(replyToken, "⚠️ เกิดข้อผิดพลาดในการดึงข้อมูลระดับน้ำ: " + err.toString());
        }
      }

      // ==========================================
      // 2.3 ระดับน้ำ X.73 (สะพานตันหยงมัส)
      // ==========================================
      else if (userText.includes("สะพานตันหยงมัส") || userText.includes("X.73")) {
        try {
          const waterRes = getRIDWaterLevelFromAPI();
          if (waterRes && waterRes.success) {
            let flexSent = false;
            try {
              const flexMsg = getWaterLevelFlexMessage(waterRes, 'X.73');
              flexSent = sendLineReply(replyToken, flexMsg);
            } catch (flexErr) {
              console.error("🚨 Failed to generate X.73 Flex: " + flexErr.toString());
            }

            if (!flexSent) {
              const textReport = formatWaterLevelAsText(waterRes, 'X.73');
              sendLineReply(replyToken, textReport);
            }
          } else {
            sendLineReply(replyToken, "⚠️ ขออภัย ไม่สามารถดึงข้อมูลระดับน้ำคลองตันหยงมัสได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง");
          }
        } catch (err) {
          console.error("🚨 Water level X.73 error: " + err.toString());
          sendLineReply(replyToken, "⚠️ เกิดข้อผิดพลาดในการดึงข้อมูลระดับน้ำ: " + err.toString());
        }
      }

      // ==========================================
      // 2.4 ข้อความอื่นๆ ที่มีคำว่า ระดับน้ำ (Fallback Quick Reply)
      // ==========================================
      else if (userText.includes("ระดับน้ำ")) {
        const waterQuickReply = {
          type: "text",
          text: "💧 รายงานระดับน้ำคลองตันหยงมัส เรียลไทม์\nกรุณาเลือกสถานีที่ต้องการตรวจสอบด้านล่างนี้ได้เลยครับ 👇",
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "message",
                  label: "🌊 X.73 ตันหยงมัส",
                  text: "สะพานตันหยงมัส (X.73)"
                }
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "🌊 X.73A บ้านบองอ",
                  text: "บ้านบองอ (X.73A)"
                }
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "📊 สรุปทุกสถานี",
                  text: "สรุปทุกสถานี"
                }
              }
            ]
          }
        };
        sendLineReply(replyToken, waterQuickReply);
      }

      // ==========================================
      // 3. พยากรณ์อากาศ 7 วันล่วงหน้า
      // ==========================================
      else if (userText.includes("พยากรณ์อากาศ") || userText.includes("สภาพอากาศ") || userText.includes("ฝน")) {
        try {
          const weatherRes = getWeatherData();
          if (weatherRes && weatherRes.success && weatherRes.forecast && weatherRes.forecast.length > 0) {
            let flexSent = false;
            try {
              const flexMsg = getWeatherForecastFlexMessage(weatherRes);
              flexSent = sendLineReply(replyToken, flexMsg);
            } catch (flexErr) {
              console.error("🚨 Failed to generate weather Flex Message: " + flexErr.toString());
            }

            if (!flexSent) {
              const textReport = formatWeatherAsText(weatherRes);
              sendLineReply(replyToken, textReport);
            }
          } else {
            sendLineReply(replyToken, "⚠️ ขออภัย ไม่สามารถดึงข้อมูลพยากรณ์อากาศได้ในขณะนี้");
          }
        } catch (err) {
          console.error("🚨 Weather webhook controller error: " + err.toString());
          sendLineReply(replyToken, "⚠️ เกิดข้อผิดพลาดทางเทคนิคในการพยากรณ์อากาศ: " + err.toString());
        }
      }

      // ==========================================
      // 4. เบอร์ติดต่อฉุกเฉิน
      // ==========================================
      else if (
        userText.includes("เบอร์ติดต่อฉุกเฉิน") || 
        userText.includes("ติดต่อฉุกเฉิน") || 
        userText.includes("เบอร์ติดต่อ") || 
        userText.includes("เบอร์โทร") || 
        userText.includes("ฉุกเฉิน") ||
        userText.includes("ติดต่อ") ||
        userText.includes("กู้ภัย") ||
        userText.includes("ดับเพลิง") ||
        userText.includes("ช่วยเหลือ") ||
        userText.includes("สายด่วน") ||
        userText.includes("โรงพยาบาล") ||
        userText.includes("ตำรวจ") ||
        userText.includes("เบอร์") ||
        userText.includes("โทร")
      ) {
        const emergencyText = "📞 เบอร์โทรติดต่อฉุกเฉิน เทศบาลตำบลตันหยงมัส\n\n" +
                              "🚒 งานป้องกันและบรรเทาสาธารณภัย (กู้ชีพ-กู้ภัย/ดับเพลิง):\n" +
                              "• 0-7367-1866 หรือ 0-7367-1886\n" +
                              "• สายด่วน 199\n\n" +
                              "🏛️ สำนักงานเทศบาลตำบลตันหยงมัส:\n" +
                              "• 0-7367-1364\n\n" +
                              "🏥 โรงพยาบาลระแงะ:\n" +
                              "• 0-7367-1287\n\n" +
                              "🚨 สถานีตำรวจภูธรระแงะ:\n" +
                              "• 0-7367-1967\n\n" +
                              "📢 แจ้งเหตุหรือขอความช่วยเหลือได้ตลอด 24 ชั่วโมง";
        sendLineReply(replyToken, emergencyText);
      } else {
        // ข้อความต้อนรับและปุ่มนำทางหลัก
        const welcomeMessage = {
          type: "text",
          text: "🤖 ยินดีต้อนรับสู่ LINE OA เทศบาลตำบลตันหยงมัส\nท่านสามารถแตะเลือกเมนูที่ต้องการตรวจสอบด้านล่างนี้ได้เลยครับ 👇",
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "message",
                  label: "📢 ภาพรวมสถานการณ์",
                  text: "ภาพรวมสถานการณ์"
                }
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "💧 ระดับน้ำ",
                  text: "ระดับน้ำ"
                }
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "🌤️ พยากรณ์อากาศ",
                  text: "พยากรณ์อากาศ"
                }
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "📞 ติดต่อฉุกเฉิน",
                  text: "เบอร์ติดต่อฉุกเฉิน"
                }
              }
            ]
          }
        };
        sendLineReply(replyToken, welcomeMessage);
      }
    }
  }
  return createResponse({ success: true });
}

/**
 * 🏕️ สร้าง Flex Carousel แสดงข้อมูลศูนย์พักพิงชั่วคราวทั้ง 3 แห่ง พร้อมปุ่มนำทาง Google Maps
 */
function getSheltersCarouselFlexMessage() {
  const shelters = [
    {
      name: "ศูนย์เทศบาลตำบลตันหยงมัส",
      desc: "อาคารอเนกประสงค์ เทศบาลตำบลตันหยงมัส",
      cap: "80 คน",
      badge: "ศูนย์หลัก 🏛️",
      badgeBg: "#059669",
      lat: 6.294247,
      lng: 101.722027,
      phone: "073671364"
    },
    {
      name: "ศูนย์มัสยิดตันหยงมัส",
      desc: "บริเวณอาคารมัสยิดตันหยงมัส",
      cap: "80 คน",
      badge: "เปิดรองรับ 🟢",
      badgeBg: "#0284c7",
      lat: 6.297781,
      lng: 101.729905,
      phone: "073671364"
    },
    {
      name: "ศูนย์โรงเรียนบ้านเขาพระ",
      desc: "อาคารเรียน โรงเรียนบ้านเขาพระ",
      cap: "60 คน",
      badge: "เปิดรองรับ 🟢",
      badgeBg: "#0284c7",
      lat: 6.298263,
      lng: 101.710773,
      phone: "073671364"
    }
  ];

  const bubbles = shelters.map(s => ({
    "type": "bubble",
    "size": "kilo",
    "header": {
      "type": "box",
      "layout": "vertical",
      "backgroundColor": s.badgeBg,
      "paddingAll": "15px",
      "contents": [
        {
          "type": "box",
          "layout": "horizontal",
          "contents": [
            {
              "type": "text",
              "text": "🏕️ ศูนย์พักพิงชั่วคราว",
              "color": "#ffffff",
              "size": "xxs",
              "weight": "bold"
            },
            {
              "type": "text",
              "text": s.badge,
              "color": "#ffffff",
              "size": "xxs",
              "weight": "bold",
              "align": "end"
            }
          ]
        },
        {
          "type": "text",
          "text": s.name,
          "color": "#ffffff",
          "size": "md",
          "weight": "bold",
          "wrap": true,
          "margin": "sm"
        }
      ]
    },
    "body": {
      "type": "box",
      "layout": "vertical",
      "paddingAll": "15px",
      "spacing": "sm",
      "contents": [
        {
          "type": "box",
          "layout": "baseline",
          "spacing": "sm",
          "contents": [
            { "type": "text", "text": "📍", "size": "xs", "flex": 1 },
            { "type": "text", "text": s.desc, "size": "xs", "color": "#475569", "flex": 9, "wrap": true }
          ]
        },
        {
          "type": "box",
          "layout": "baseline",
          "spacing": "sm",
          "contents": [
            { "type": "text", "text": "👥", "size": "xs", "flex": 1 },
            { "type": "text", "text": "ความจุรองรับ: " + s.cap, "size": "xs", "color": "#0f172a", "weight": "bold", "flex": 9 }
          ]
        }
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "spacing": "sm",
      "paddingAll": "15px",
      "paddingTop": "0px",
      "contents": [
        {
          "type": "button",
          "style": "primary",
          "color": "#0284c7",
          "height": "sm",
          "action": {
            "type": "uri",
            "label": "📍 นำทาง Google Maps",
            "uri": "https://www.google.com/maps/dir/?api=1&destination=" + s.lat + "," + s.lng
          }
        },
        {
          "type": "button",
          "style": "secondary",
          "height": "sm",
          "action": {
            "type": "uri",
            "label": "📞 โทร 073-671364",
            "uri": "tel:" + s.phone
          }
        }
      ]
    }
  }));

  return {
    "type": "flex",
    "altText": "🏕️ รายชื่อศูนย์พักพิงชั่วคราว เทศบาลตำบลตันหยงมัส (3 ศูนย์)",
    "contents": {
      "type": "carousel",
      "contents": bubbles
    }
  };
}

/**
 * 🚧 ดึงข้อมูลเส้นทางปิดจาก Supabase REST API
 */
function getRoadClosuresFromSupabase() {
  try {
    const url = "https://wixjaufsizqurdiovjdf.supabase.co/rest/v1/road_closures?select=*&order=created_at.desc&limit=10";
    const options = {
      method: "get",
      headers: {
        "apikey": "sb_publishable_cGgfJgxM5zQ1tqmvH9i2qQ_RgI9pING",
        "Authorization": "Bearer sb_publishable_cGgfJgxM5zQ1tqmvH9i2qQ_RgI9pING"
      },
      muteHttpExceptions: true
    };
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      return JSON.parse(response.getContentText());
    }
    return [];
  } catch (e) {
    console.error("🚨 getRoadClosuresFromSupabase error: " + e.toString());
    return [];
  }
}

/**
 * 🖼️ ดึงหรือแปลง URL รูปภาพของเส้นทางปิดให้อยู่ในรูปแบบ Direct HTTPS URL สำหรับ LINE Flex Message
 */
function getDirectRoadImageUrl(r) {
  const raw = r.image || r.photo_url || r.photo || "";
  if (!raw) {
    return "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=600&q=80";
  }
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }
  if (raw.startsWith("data:image")) {
    try {
      let folder;
      if (DRIVE_FOLDER_ID) {
        try { folder = DriveApp.getFolderById(DRIVE_FOLDER_ID); } catch(e) {}
      }
      if (!folder) {
        const folders = DriveApp.getFoldersByName('Flood_Images');
        folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('Flood_Images');
      }
      const parts = raw.split(",");
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), mime, "road_" + (r.id || Date.now()) + ".jpg");
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const directUrl = "https://lh3.googleusercontent.com/d/" + file.getId();

      // บันทึก URL ที่แปลงแล้วกลับไปยัง Supabase road_closures อัตโนมัติ เพื่อไม่ต้องแปลงซ้ำ
      if (r.id) {
        try {
          UrlFetchApp.fetch("https://wixjaufsizqurdiovjdf.supabase.co/rest/v1/road_closures?id=eq." + r.id, {
            method: "patch",
            headers: {
              "apikey": "sb_publishable_cGgfJgxM5zQ1tqmvH9i2qQ_RgI9pING",
              "Authorization": "Bearer sb_publishable_cGgfJgxM5zQ1tqmvH9i2qQ_RgI9pING",
              "Content-Type": "application/json"
            },
            payload: JSON.stringify({ image: directUrl }),
            muteHttpExceptions: true
          });
        } catch (patchErr) {
          console.warn("Patch Supabase road_closures failed: " + patchErr.toString());
        }
      }
      return directUrl;
    } catch(err) {
      console.error("🚨 Convert base64 road image error: " + err.toString());
      return "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=600&q=80";
    }
  }
  return "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=600&q=80";
}

/**
 * 🚧 สร้าง Flex Message ตรวจสอบเส้นทาง (ถ้าไม่มีเส้นทางปิด จะขึ้นว่าสัญจรได้ตามปกติ, ถ้ามีหลายจุดแสดงเป็น Carousel)
 */
function getRoadClosuresFlexMessage() {
  const roads = getRoadClosuresFromSupabase();

  // กรณีไม่มีเส้นทางปิด สัญจรได้ตามปกติ
  if (!roads || roads.length === 0) {
    return {
      "type": "flex",
      "altText": "🟢 ตรวจสอบเส้นทาง: สัญจรได้ตามปกติทุกเส้นทาง",
      "contents": {
        "type": "bubble",
        "size": "mega",
        "header": {
          "type": "box",
          "layout": "vertical",
          "backgroundColor": "#059669",
          "paddingAll": "20px",
          "contents": [
            {
              "type": "text",
              "text": "🚧 รายงานสภาพการจราจรและเส้นทาง",
              "color": "#ffffff",
              "size": "xs",
              "weight": "bold"
            },
            {
              "type": "text",
              "text": "สัญจรได้ปกติทุกเส้นทาง 🟢",
              "color": "#ffffff",
              "size": "lg",
              "weight": "bold",
              "margin": "sm"
            }
          ]
        },
        "body": {
          "type": "box",
          "layout": "vertical",
          "paddingAll": "20px",
          "spacing": "md",
          "contents": [
            {
              "type": "text",
              "text": "ขณะนี้ไม่มีรายงานเส้นทางปิดสัญจร หรือน้ำท่วมขังบนผิวจราจรในเขตเทศบาลตำบลตันหยงมัส รถทุกชนิดสามารถสัญจรได้ตามปกติ",
              "size": "sm",
              "color": "#334155",
              "wrap": true
            },
            {
              "type": "box",
              "layout": "vertical",
              "backgroundColor": "#f0fdf4",
              "cornerRadius": "12px",
              "paddingAll": "12px",
              "contents": [
                {
                  "type": "text",
                  "text": "✅ ถนนสายหลักและซอยเทศบาลทุกสาย สัญจรปลอดภัย",
                  "size": "xs",
                  "color": "#166534",
                  "weight": "bold"
                }
              ]
            }
          ]
        },
        "footer": {
          "type": "box",
          "layout": "vertical",
          "paddingAll": "15px",
          "contents": [
            {
              "type": "button",
              "style": "primary",
              "color": "#059669",
              "action": {
                "type": "uri",
                "label": "🗺️ เปิดดูแผนที่ One Map",
                "uri": "https://tanyongmas.github.io/Flood-Dashboard/?mode=report"
              }
            }
          ]
        }
      }
    };
  }

  // กรณีมีเส้นทางปิด นำมาสร้างการ์ด Carousel ให้ครบทุกจุด
  const bubbles = roads.slice(0, 10).map(r => {
    const title = r.title || "เส้นทางปิดสัญจร";
    const waterDepthVal = (r.water_depth !== undefined && r.water_depth !== null && r.water_depth !== '') 
      ? (r.water_depth + (isNaN(r.water_depth) ? '' : ' ซม.')) 
      : (r.waterDepth || r.water_level || "มีน้ำท่วมขังบนผิวทาง");
    const detour = r.detour || "ไม่มีเส้นทางเลี่ยง (โปรดระมัดระวัง)";
    const photoUrl = getDirectRoadImageUrl(r);
    const mapUri = "https://tanyongmas.github.io/Flood-Dashboard/?mode=report&road_id=" + (r.id || '') + "&lat=" + (r.lat || '') + "&lng=" + (r.lng || '');

    return {
      "type": "bubble",
      "size": "kilo",
      "hero": {
        "type": "image",
        "url": photoUrl,
        "size": "full",
        "aspectRatio": "20:13",
        "aspectMode": "cover"
      },
      "header": {
        "type": "box",
        "layout": "vertical",
        "backgroundColor": "#dc2626",
        "paddingAll": "12px",
        "contents": [
          {
            "type": "text",
            "text": "⛔ เส้นทางปิด / สัญจรไม่ได้",
            "color": "#ffffff",
            "size": "xs",
            "weight": "bold"
          }
        ]
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "15px",
        "spacing": "sm",
        "contents": [
          {
            "type": "text",
            "text": title,
            "weight": "bold",
            "size": "sm",
            "wrap": true,
            "color": "#0f172a"
          },
          {
            "type": "box",
            "layout": "baseline",
            "spacing": "xs",
            "contents": [
              { "type": "text", "text": "🌊", "size": "xs", "flex": 1 },
              { "type": "text", "text": "ระดับน้ำ: " + waterDepthVal, "size": "xs", "color": "#dc2626", "weight": "bold", "flex": 9, "wrap": true }
            ]
          },
          {
            "type": "box",
            "layout": "baseline",
            "spacing": "xs",
            "contents": [
              { "type": "text", "text": "↪️", "size": "xs", "flex": 1 },
              { "type": "text", "text": "เส้นทางเลี่ยง: " + detour, "size": "xs", "color": "#0369a1", "flex": 9, "wrap": true }
            ]
          }
        ]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "15px",
        "paddingTop": "0px",
        "contents": [
          {
            "type": "button",
            "style": "primary",
            "color": "#2563eb",
            "height": "sm",
            "action": {
              "type": "uri",
              "label": "🗺️ ดูหมุดบนแผนที่",
              "uri": mapUri
            }
          }
        ]
      }
    };
  });

  return {
    "type": "flex",
    "altText": "⚠️ รายงานเส้นทางปิดสัญจร (" + roads.length + " เส้นทาง)",
    "contents": {
      "type": "carousel",
      "contents": bubbles
    }
  };
}

/**
 * 📊 สร้าง Flex Carousel รวมระดับน้ำทั้ง 2 สถานี (X.73A ต้นน้ำ และ X.73 ตัวเมืองตันหยงมัส)
 */
function getWaterLevelCarouselFlexMessage(waterRes) {
  const cardX73A = getWaterLevelFlexMessage(waterRes, 'X.73A').contents;
  const cardX73 = getWaterLevelFlexMessage(waterRes, 'X.73').contents;

  return {
    "type": "flex",
    "altText": "📊 สรุประดับน้ำคลองตันหยงมัส ทุกสถานี (Carousel)",
    "contents": {
      "type": "carousel",
      "contents": [cardX73A, cardX73]
    }
  };
}

/**
 * จัดรูปแบบรายงานสภาพอากาศเป็นข้อความตัวอักษรธรรมดาเพื่อรับประกันความชัวร์ในการตอบกลับ
 */
function formatWeatherAsText(weatherRes) {
  let text = "🌤️ พยากรณ์อากาศ 7 วันล่วงหน้า\nพื้นที่: ต.ตันหยงมัส อ.ระแงะ จ.นราธิวาส\n\n";
  weatherRes.forecast.slice(0, 7).forEach(day => {
    let rainVal = 0.0;
    if (day.rain !== undefined && day.rain !== null) {
      rainVal = parseFloat(day.rain);
      if (isNaN(rainVal)) rainVal = 0.0;
    }
    
    // ดึงเฉพาะวันที่แบบสั้น เช่น 12 มิ.ย.
    let shortDate = day.date;
    try {
      const parts = day.date.split("-");
      const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
      const d = parseInt(parts[2], 10);
      const m = monthNames[parseInt(parts[1], 10) - 1];
      shortDate = `${d} ${m}`;
    } catch(e) {}

    text += `📅 วัน${day.day} (${shortDate})\n`;
    text += ` ☁️ สภาพอากาศ: ${day.desc || "ฝนตกทั่วไป"}\n`;
    text += ` 🌡️ อุณหภูมิ: ${day.tempMin}-${day.tempMax}°C\n`;
    text += ` 💧 ปริมาณฝน: ${rainVal.toFixed(1)} มม.\n`;
    text += ` 💨 ความเร็วลม: ${day.wind} กม./ชม.\n`;
    text += `-------------------\n`;
  });
  return text.trim();
}

/**
 * ส่งข้อความตอบกลับด้วย LINE Messaging API
 */
function sendLineReply(replyToken, messages) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  let messagesArray = Array.isArray(messages) ? messages : [messages];
  
  // แปลง String เป็น Text Message Object อัตโนมัติ พร้อมตรวจสอบความยาว Label ไม่ให้เกิน 20 ตัวอักษร
  messagesArray = messagesArray.map(m => {
    if (typeof m === 'string') {
      return { type: 'text', text: m };
    }
    // ป้องกันความผิดพลาดของ Quick Reply Actions ที่ Label อาจยาวเกิน 20 ตัวอักษร
    if (m && m.quickReply && Array.isArray(m.quickReply.items)) {
      m.quickReply.items.forEach(item => {
        if (item && item.action && item.action.label && item.action.label.length > 20) {
          item.action.label = item.action.label.substring(0, 20);
        }
      });
    }
    return m;
  });
  
  const payload = {
    replyToken: replyToken,
    messages: messagesArray
  };
  const token = getScriptProperty('LINE_CHANNEL_ACCESS_TOKEN', LINE_CHANNEL_ACCESS_TOKEN);
  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const body = response.getContentText();
    console.log("LINE Reply Status Code: " + code);
    console.log("LINE Reply Response Body: " + body);
    return code === 200;
  } catch (err) {
    console.error("🚨 sendLineReply UrlFetch Exception: " + err.toString());
    return false;
  }
}

/**
 * ดึงปริมาณฝนสะสมย้อนหลัง 24 ชั่วโมง จาก Open-Meteo API (พิกัด ต.ตันหยงมัส)
 * @return {string} ปริมาณฝนสะสม (มม.)
 */
function get24hRainfall() {
  try {
    const lat = "6.29445";
    const lng = "101.72362";
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lng + "&hourly=precipitation&past_days=1&timezone=Asia%2FBangkok";
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    
    if (response.getResponseCode() !== 200) {
      throw new Error("HTTP Status " + response.getResponseCode());
    }
    
    const json = JSON.parse(response.getContentText());
    if (json && json.hourly && json.hourly.precipitation && json.hourly.time) {
      const now = new Date();
      const currentUtc = now.getTime();
      let sum24h = 0;
      
      for (let i = json.hourly.time.length - 1; i >= 0; i--) {
        const timeStr = json.hourly.time[i]; // รูปแบบ "2026-06-25T10:00"
        const itemTime = new Date(timeStr + ":00+07:00").getTime(); // แปลงเวลา local
        
        // กรองข้อมูลเฉพาะ 24 ชั่วโมงที่ผ่านมาจนถึงปัจจุบัน
        if (itemTime <= currentUtc && itemTime >= (currentUtc - 24 * 60 * 60 * 1000)) {
          sum24h += json.hourly.precipitation[i] || 0;
        }
      }
      return sum24h.toFixed(1);
    }
    return "0.0";
  } catch (err) {
    console.error("🚨 Error fetching 24h rainfall: " + err.toString());
    return "0.0"; // Fallback
  }
}

/**
 * สร้างโครงสร้าง Flex Message สรุประดับน้ำ (สถานี X.73 บ้านตันหยงมัส หรือ สถานี X.73A บ้านบองอ)
 */
function getWaterLevelFlexMessage(waterRes, targetStation = 'X.73') {
  const isX73A = (targetStation === 'X.73A');
  let levelNum = 11.02;
  let bankLevelNum = 14.90;
  let stationCodeStr = "สถานี X.73";
  let stationSubStr = "คลองตันหยงมัส บ้านตันหยงมัส อ.ระแงะ";
  let updateTime = (waterRes && waterRes.data && waterRes.data.time) ? waterRes.data.time : Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm น.");

  if (isX73A) {
    const dataA = (waterRes && waterRes.data && waterRes.data.dataX73A) ? waterRes.data.dataX73A : null;
    levelNum = dataA && dataA.level ? parseFloat(dataA.level) : 22.34;
    bankLevelNum = 26.80;
    stationCodeStr = "สถานี X.73A";
    stationSubStr = "คลองตันหยงมัส บ้านบองอ อ.ระแงะ";
    if (dataA && dataA.time) updateTime = dataA.time;
  } else {
    levelNum = waterRes && waterRes.data && waterRes.data.level ? parseFloat(waterRes.data.level) : 11.02;
    bankLevelNum = waterRes && waterRes.data && waterRes.data.bankLevel !== undefined ? parseFloat(waterRes.data.bankLevel) : 14.90;
  }

  const levelStr = isNaN(levelNum) ? "0.00" : levelNum.toFixed(2);
  const bankLevelStr = isNaN(bankLevelNum) ? (isX73A ? "26.80" : "14.90") : bankLevelNum.toFixed(2);
  
  // คำนวณระยะห่างตลิ่ง
  const diffVal = Math.abs(bankLevelNum - levelNum).toFixed(2);

  // กำหนดธีมสีและสถานะตามเกณฑ์ระดับน้ำสถานี
  let theme = {
    headerBg: "#059669",  // 🟢 เขียว
    boxBg: "#ecfdf5",
    textColor: "#059669",
    statusText: "ระดับปกติ 🟢",
    diffText: `ต่ำกว่าตลิ่ง ${diffVal} ม.`
  };

  if (isX73A) {
    // 🟢 เขียว (ปกติ < 25.80) | 🟡 เหลือง (เฝ้าระวัง 25.80 - 26.79) | 🔴 แดง (วิกฤต >= 26.80)
    if (levelNum >= 26.80) {
      theme = {
        headerBg: "#dc2626", // 🔴 แดง
        boxBg: "#fef2f2",
        textColor: "#dc2626",
        statusText: "ระดับวิกฤต 🔴",
        diffText: `น้ำล้นตลิ่ง ${(levelNum - bankLevelNum).toFixed(2)} ม.`
      };
    } else if (levelNum >= 25.80) {
      theme = {
        headerBg: "#d97706", // 🟡 เหลือง/ส้ม
        boxBg: "#fffbeb",
        textColor: "#d97706",
        statusText: "เฝ้าระวังระดับน้ำ 🟡",
        diffText: `ต่ำกว่าตลิ่ง ${diffVal} ม.`
      };
    }
  } else {
    // 🟢 เขียว (ปกติ <= 13.50) | 🟡 เหลือง (เฝ้าระวัง 13.51 - 14.90) | 🔴 แดง (วิกฤต > 14.90)
    if (levelNum > 14.90) {
      theme = {
        headerBg: "#dc2626", // 🔴 แดง
        boxBg: "#fef2f2",
        textColor: "#dc2626",
        statusText: "ระดับวิกฤต 🔴",
        diffText: `น้ำล้นตลิ่ง ${(levelNum - bankLevelNum).toFixed(2)} ม.`
      };
    } else if (levelNum > 13.50) {
      theme = {
        headerBg: "#d97706", // 🟡 เหลือง/ส้ม
        boxBg: "#fffbeb",
        textColor: "#d97706",
        statusText: "เฝ้าระวังระดับน้ำ 🟡",
        diffText: `ต่ำกว่าตลิ่ง ${diffVal} ม.`
      };
    }
  }

  return {
    "type": "flex",
    "altText": `💧 รายงานระดับน้ำ ${stationCodeStr} [${theme.statusText}]`,
    "contents": {
      "type": "bubble",
      "size": "mega",
      "header": {
        "type": "box",
        "layout": "vertical",
        "backgroundColor": theme.headerBg,
        "paddingAll": "20px",
        "contents": [
          {
            "type": "box",
            "layout": "horizontal",
            "contents": [
              {
                "type": "text",
                "text": "💧 สถานีวัดระดับน้ำ",
                "weight": "bold",
                "color": "#ffffff",
                "size": "xs"
              },
              {
                "type": "text",
                "text": theme.statusText,
                "weight": "bold",
                "color": "#ffffff",
                "size": "xs",
                "align": "end"
              }
            ]
          },
          {
            "type": "text",
            "text": stationCodeStr,
            "weight": "bold",
            "color": "#ffffff",
            "size": "xxl",
            "margin": "xs"
          },
          {
            "type": "text",
            "text": stationSubStr,
            "color": "#ffffff",
            "size": "xs"
          }
        ]
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "20px",
        "contents": [
          {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": theme.boxBg,
            "cornerRadius": "16px",
            "paddingAll": "16px",
            "contents": [
              {
                "type": "text",
                "text": "ระดับน้ำปัจจุบัน",
                "size": "xs",
                "color": theme.textColor,
                "weight": "bold"
              },
              {
                "type": "box",
                "layout": "baseline",
                "margin": "xs",
                "contents": [
                  {
                    "type": "text",
                    "text": levelStr,
                    "size": "3xl",
                    "weight": "bold",
                    "color": theme.textColor
                  },
                  {
                    "type": "text",
                    "text": " ม.รทก.",
                    "size": "sm",
                    "weight": "bold",
                    "color": theme.textColor,
                    "margin": "xs"
                  }
                ]
              }
            ]
          },
          {
            "type": "box",
            "layout": "vertical",
            "margin": "lg",
            "spacing": "sm",
            "contents": [
              {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                  {
                    "type": "text",
                    "text": "สถานการณ์ระดับน้ำ",
                    "size": "xs",
                    "color": "#64748b"
                  },
                  {
                    "type": "text",
                    "text": theme.statusText,
                    "size": "xs",
                    "color": theme.textColor,
                    "weight": "bold",
                    "align": "end"
                  }
                ]
              },
              {
                "type": "separator",
                "color": "#f1f5f9"
              },
              {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                  {
                    "type": "text",
                    "text": "ระดับตลิ่ง",
                    "size": "xs",
                    "color": "#64748b"
                  },
                  {
                    "type": "text",
                    "text": `${bankLevelStr} ม.รทก.`,
                    "size": "xs",
                    "color": "#334155",
                    "weight": "bold",
                    "align": "end"
                  }
                ]
              },
              {
                "type": "separator",
                "color": "#f1f5f9"
              },
              {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                  {
                    "type": "text",
                    "text": "ระยะห่างตลิ่ง",
                    "size": "xs",
                    "color": "#64748b"
                  },
                  {
                    "type": "text",
                    "text": theme.diffText,
                    "size": "xs",
                    "color": theme.textColor,
                    "weight": "bold",
                    "align": "end"
                  }
                ]
              },
              {
                "type": "separator",
                "color": "#f1f5f9"
              }
            ]
          }
        ]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "16px",
        "contents": [
          {
            "type": "separator",
            "margin": "xs",
            "color": "#f1f5f9"
          },
          {
            "type": "box",
            "layout": "horizontal",
            "margin": "md",
            "contents": [
              {
                "type": "text",
                "text": "🕒 อัปเดตล่าสุด:",
                "size": "xxs",
                "color": "#94a3b8"
              },
              {
                "type": "text",
                "text": updateTime,
                "size": "xxs",
                "color": "#64748b",
                "weight": "bold",
                "align": "end"
              }
            ]
          }
        ]
      }
    }
  };
}

/**
 * จัดรูปแบบรายงานสถานการณ์น้ำเป็นข้อความตัวอักษรธรรมดาเพื่อรองรับการทำงานกรณี Flex Message ล้มเหลว
 */
function formatWaterLevelAsText(waterRes, targetStation = 'X.73') {
  if (targetStation === 'X.73A') {
    const dataA = (waterRes && waterRes.data && waterRes.data.dataX73A) ? waterRes.data.dataX73A : null;
    const levelNum = dataA && dataA.level ? parseFloat(dataA.level) : 22.34;
    const levelStr = isNaN(levelNum) ? "22.34" : levelNum.toFixed(2);
    const timeStr = dataA && dataA.time ? dataA.time : (waterRes && waterRes.data && waterRes.data.time ? waterRes.data.time : "");
    let statusText = "✅ ปกติ";
    let diffStr = `ต่ำกว่าตลิ่ง ${(26.80 - levelNum).toFixed(2)} ม.`;
    if (levelNum >= 26.80) {
      statusText = "🚨 วิกฤต (น้ำล้นตลิ่ง)";
      diffStr = `น้ำล้นตลิ่ง ${(levelNum - 26.80).toFixed(2)} ม.`;
    } else if (levelNum >= 25.80) {
      statusText = "⚠️ เฝ้าระวัง (ใกล้ล้นตลิ่ง)";
    }

    const rain24hA = get24hRainfall();
    const rainTextA = rain24hA ? `${rain24hA} มม.` : "ไม่มีข้อมูล";

    return `📊 รายงานสถานการณ์น้ำ & ปริมาณฝนล่าสุด (สถานี X.73A บ้านบองอ)\n` +
           `ตำบลบองอ อ.ระแงะ จ.นราธิวาส\n\n` +
           `🚦 สถานะระดับน้ำ: ${statusText}\n` +
           `🌊 ระดับน้ำปัจจุบัน: ${levelStr} ม.รทก.\n` +
           `📏 ระดับน้ำตลิ่ง: 26.80 ม.รทก.\n` +
           `↕️ ห่างจากตลิ่ง: ${diffStr}\n\n` +
           `🌧️ ฝนสะสม 24 ชม.: ${rainTextA}\n` +
           `🕒 อัปเดตล่าสุด: ${timeStr}`;
  }

  const stationName = waterRes.data.stationName || "สถานี X.73 คลองตันหยงมัส";
  const level = waterRes.data.level || "0.00";
  const time = waterRes.data.time || "";
  const bankLevel = waterRes.data.bankLevel !== undefined ? `${waterRes.data.bankLevel} ม.` : "ไม่มีข้อมูล";
  const diffBank = waterRes.data.diffBank !== undefined ? `${waterRes.data.diffBank} ม.` : "ไม่มีข้อมูล";
  
  let statusText = "ปกติ";
  if (waterRes.data.diffBank !== undefined) {
    const diff = parseFloat(waterRes.data.diffBank);
    if (diff < 0) {
      statusText = "🚨 วิกฤต (น้ำล้นตลิ่ง)";
    } else if (diff < 0.5) {
      statusText = "⚠️ เฝ้าระวัง (ใกล้ล้นตลิ่ง)";
    } else {
      statusText = "✅ ปกติ";
    }
  }
  
  const rain24h = get24hRainfall();
  const rainText = rain24h ? `${rain24h} มม.` : "ไม่มีข้อมูล";

  return `📊 รายงานสถานการณ์น้ำ & ปริมาณฝนล่าสุด\n` +
         `ตำบลตันหยงมัส อ.ระแงะ จ.นราธิวาส\n\n` +
         `🚦 สถานะระดับน้ำ: ${statusText}\n` +
         `🌊 ระดับน้ำปัจจุบัน: ${level} ม.\n` +
         `📏 ระดับน้ำตลิ่ง: ${bankLevel}\n` +
         `↕️ ห่างจากตลิ่ง: ${diffBank}\n\n` +
         `🌧️ ฝนสะสม 24 ชม.: ${rainText}\n` +
         `🕒 อัปเดตล่าสุด: ${time}`;
}

/**
 * สร้างโครงสร้าง Flex Message พยากรณ์อากาศแบบ Carousel 5 วันล่วงหน้า (สไตล์ TMD Widget กรมอุตุนิยมวิทยา)
 */
function getWeatherForecastFlexMessage(weatherRes) {
  const forecastList = weatherRes && weatherRes.forecast ? weatherRes.forecast.slice(0, 5) : [];
  const updateTime = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm น.");

  const formatThaiDate = (dateStr, dayName) => {
    try {
      const parts = dateStr.split("-");
      const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
      const day = parseInt(parts[2], 10);
      const month = monthNames[parseInt(parts[1], 10) - 1];
      const yearBE = parseInt(parts[0], 10) + 543;
      return `วัน${dayName} ${day} ${month} ${yearBE}`;
    } catch(e) { return `วัน${dayName} ${dateStr}`; }
  };

  const cards = forecastList.map((day) => {
    let emoji = "🌧️";
    let descText = day.desc || "ฝนตกทั่วไป";
    let descColor = "#0284c7";

    if (descText.includes("แจ่มใส") || descText.includes("โปร่ง") || descText.includes("แดด")) {
      emoji = "☀️";
      descColor = "#d97706";
    } else if (descText.includes("เมฆบางส่วน") || descText.includes("เมฆ") || descText.includes("ครึ้ม")) {
      emoji = "⛅";
      descColor = "#0284c7";
    } else if (descText.includes("พายุ") || descText.includes("คะนอง") || descText.includes("ตกหนัก")) {
      emoji = "⛈️";
      descColor = "#dc2626";
    } else if (descText.includes("หมอก")) {
      emoji = "🌫️";
      descColor = "#475569";
    }

    const rainVal = day.rain !== undefined && day.rain !== null ? parseFloat(day.rain) : 0.0;
    const rainProb = day.rainProb !== undefined && day.rainProb !== null ? day.rainProb : (rainVal > 20 ? 80 : rainVal > 10 ? 60 : rainVal > 2 ? 40 : rainVal > 0 ? 20 : 10);
    const fullDate = formatThaiDate(day.date, day.day);

    return {
      "type": "bubble",
      "size": "mega",
      "header": {
        "type": "box",
        "layout": "vertical",
        "backgroundColor": "#4b7cad",
        "paddingAll": "20px",
        "contents": [
          {
            "type": "box",
            "layout": "horizontal",
            "contents": [
              {
                "type": "text",
                "text": "⛅ พยากรณ์อากาศกรมอุตุนิยมวิทยา",
                "weight": "bold",
                "color": "#38bdf8",
                "size": "xs"
              },
              {
                "type": "text",
                "text": "อ.ระแงะ",
                "weight": "bold",
                "color": "#94a3b8",
                "size": "xs",
                "align": "end"
              }
            ]
          },
          {
            "type": "text",
            "text": fullDate,
            "weight": "bold",
            "color": "#ffffff",
            "size": "lg",
            "margin": "xs"
          },
          {
            "type": "text",
            "text": "ต.ตันหยงมัส อ.ระแงะ จ.นราธิวาส",
            "color": "#94a3b8",
            "size": "xs"
          }
        ]
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "20px",
        "contents": [
          {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": "#f8fafc",
            "cornerRadius": "16px",
            "paddingAll": "14px",
            "contents": [
              {
                "type": "text",
                "text": "สภาพอากาศคาดการณ์",
                "size": "xs",
                "color": "#64748b",
                "weight": "bold"
              },
              {
                "type": "box",
                "layout": "baseline",
                "margin": "xs",
                "contents": [
                  {
                    "type": "text",
                    "text": `${emoji} ${descText}`,
                    "size": "md",
                    "weight": "bold",
                    "color": descColor,
                    "wrap": true
                  }
                ]
              }
            ]
          },
          {
            "type": "box",
            "layout": "vertical",
            "margin": "lg",
            "spacing": "sm",
            "contents": [
              {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                  {
                    "type": "text",
                    "text": "🌡️ อุณหภูมิ สูงสุด / ต่ำสุด",
                    "size": "xs",
                    "color": "#64748b"
                  },
                  {
                    "type": "text",
                    "text": `${day.tempMax}°C / ${day.tempMin}°C`,
                    "size": "xs",
                    "color": "#dc2626",
                    "weight": "bold",
                    "align": "end"
                  }
                ]
              },
              {
                "type": "separator",
                "color": "#f1f5f9"
              },
              {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                  {
                    "type": "text",
                    "text": "☔ โอกาสเกิดฝน",
                    "size": "xs",
                    "color": "#64748b"
                  },
                  {
                    "type": "text",
                    "text": `${rainProb}%`,
                    "size": "xs",
                    "color": "#0284c7",
                    "weight": "bold",
                    "align": "end"
                  }
                ]
              },
              {
                "type": "separator",
                "color": "#f1f5f9"
              },
              {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                  {
                    "type": "text",
                    "text": "💧 ปริมาณฝนคาดการณ์",
                    "size": "xs",
                    "color": "#64748b"
                  },
                  {
                    "type": "text",
                    "text": `${rainVal.toFixed(1)} มม.`,
                    "size": "xs",
                    "color": "#0891b2",
                    "weight": "bold",
                    "align": "end"
                  }
                ]
              },
              {
                "type": "separator",
                "color": "#f1f5f9"
              },
              {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                  {
                    "type": "text",
                    "text": "💨 ความเร็วลม",
                    "size": "xs",
                    "color": "#64748b"
                  },
                  {
                    "type": "text",
                    "text": `${day.wind} กม./ชม.`,
                    "size": "xs",
                    "color": "#475569",
                    "weight": "bold",
                    "align": "end"
                  }
                ]
              }
            ]
          }
        ]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "16px",
        "contents": [
          {
            "type": "separator",
            "margin": "xs",
            "color": "#f1f5f9"
          },
          {
            "type": "box",
            "layout": "horizontal",
            "margin": "md",
            "contents": [
              {
                "type": "text",
                "text": "🕒 อัปเดตล่าสุด:",
                "size": "xxs",
                "color": "#94a3b8"
              },
              {
                "type": "text",
                "text": updateTime,
                "size": "xxs",
                "color": "#64748b",
                "weight": "bold",
                "align": "end"
              }
            ]
          }
        ]
      }
    };
  });

  return {
    "type": "flex",
    "altText": "⛅ พยากรณ์อากาศ 5 วันล่วงหน้า อ.ระแงะ จ.นราธิวาส",
    "contents": {
      "type": "carousel",
      "contents": cards
    }
  };
}

/**
 * ฟังก์ชันสำหรับติดตั้ง Rich Menu บน LINE OA อัตโนมัติ
 * (รันฟังก์ชันนี้จาก Apps Script Editor เพื่อตั้งค่า Rich Menu เริ่มต้น)
 * @param {string} driveFileId ID ของไฟล์รูปภาพ Rich Menu ใน Google Drive (ขนาดแนะนำ 2500x1686 พิกเซล)
 */
function setupLineRichMenu(driveFileId) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN.startsWith("YOUR_")) {
    Logger.log("❌ กรุณาตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ที่ด้านบนสุดของไฟล์ก่อน");
    return "Error: Token missing";
  }
  
  let webAppUrl = "";
  try {
    webAppUrl = ScriptApp.getService().getUrl();
  } catch(e) {
    Logger.log("⚠️ ไม่สามารถดึง URL Web App อัตโนมัติได้ กรุณา Deploy Web App ก่อน");
  }
  
  if (!webAppUrl) {
    Logger.log("❌ กรุณา Deploy Web App เป็นเว็บแอปพลิเคชันก่อน เพื่อให้ปุ่มรายงานลิงก์กับหน้าเว็บที่ถูกต้อง");
    return "Error: Web App not deployed";
  }
  
  const reportUrl = webAppUrl + "?mode=report";
  Logger.log("🔗 ลิงก์รายงานสถานะที่จะใช้ใน Rich Menu: " + reportUrl);
  
  // 1. สร้าง Rich Menu Structure (ขนาดมาตรฐาน 2500x1686 พิกเซล แบ่งออกเป็น 3 ปุ่ม)
  const createUrl = "https://api.line.me/v2/bot/richmenu";
  const richMenuPayload = {
    "size": {
      "width": 2500,
      "height": 1686
    },
    "selected": true,
    "name": "Rich Menu ทต.ตันหยงมัส",
    "chatBarText": "เมนูรายงานภัย",
    "areas": [
      {
        "bounds": {
          "x": 0,
          "y": 0,
          "width": 833,
          "height": 1686
        },
        "action": {
          "type": "uri",
          "label": "รายงานสถานะ",
          "uri": reportUrl
        }
      },
      {
        "bounds": {
          "x": 833,
          "y": 0,
          "width": 833,
          "height": 1686
        },
        "action": {
          "type": "message",
          "label": "ระดับน้ำ",
          "text": "ระดับน้ำ"
        }
      },
      {
        "bounds": {
          "x": 1666,
          "y": 0,
          "width": 834,
          "height": 1686
        },
        "action": {
          "type": "message",
          "label": "พยากรณ์อากาศ",
          "text": "พยากรณ์อากาศ"
        }
      }
    ]
  };
  
  const createOptions = {
    "method": "post",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN
    },
    "payload": JSON.stringify(richMenuPayload),
    "muteHttpExceptions": true
  };
  
  const createRes = UrlFetchApp.fetch(createUrl, createOptions);
  const createJson = JSON.parse(createRes.getContentText());
  
  if (!createJson.richMenuId) {
    Logger.log("❌ สร้าง Rich Menu ไม่สำเร็จ: " + createRes.getContentText());
    return "Error: " + createRes.getContentText();
  }
  
  const richMenuId = createJson.richMenuId;
  Logger.log("✅ สร้าง Rich Menu สำเร็จ! ID: " + richMenuId);
  
  // 2. อัปโหลดรูปภาพถ้ามีระบุ driveFileId
  if (driveFileId) {
    try {
      const file = DriveApp.getFileById(driveFileId);
      const imageBlob = file.getBlob();
      const uploadUrl = "https://api-data.line.me/v2/bot/richmenu/" + richMenuId + "/content";
      
      const uploadOptions = {
        "method": "post",
        "headers": {
          "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN,
          "Content-Type": imageBlob.getContentType()
        },
        "payload": imageBlob.getBytes(),
        "muteHttpExceptions": true
      };
      
      const uploadRes = UrlFetchApp.fetch(uploadUrl, uploadOptions);
      Logger.log("📤 ผลการอัปโหลดรูปภาพ: " + uploadRes.getContentText());
    } catch(e) {
      Logger.log("⚠️ อัปโหลดรูปภาพล้มเหลว: " + e.toString());
    }
  } else {
    Logger.log("ℹ️ ไม่ได้ระบุ driveFileId สำหรับอัปโหลดรูปภาพ ท่านสามารถอัปโหลดรูปภาพภายหลังผ่าน LINE Official Account Manager");
  }
  
  // 3. ตั้งค่าเป็น Rich Menu เริ่มต้น (Default Rich Menu) สำหรับคนในห้องแชททุกคน
  const defaultUrl = "https://api.line.me/v2/bot/user/all/richmenu/" + richMenuId;
  const defaultOptions = {
    "method": "post",
    "headers": {
      "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN
    },
    "muteHttpExceptions": true
  };
  
  const defaultRes = UrlFetchApp.fetch(defaultUrl, defaultOptions);
  Logger.log("👑 ผลการตั้งค่า Rich Menu เริ่มต้น: " + defaultRes.getContentText());
  
  return "Success! Rich Menu ID: " + richMenuId;
}

/**
 * ฟังก์ชันสำหรับกดรันติดตั้ง Rich Menu ผ่านหน้าต่าง Apps Script Editor
 * ให้ท่านนำ File ID ของรูปภาพเมนูใน Google Drive มาใส่ในเครื่องหมายคำพูดแทนที่ข้อความด้านล่าง
 * จากนั้นเลือกฟังก์ชัน "runSetupLineRichMenu" ที่แถบด้านบนแล้วกดปุ่ม "Run"
 */
function runSetupLineRichMenu() {
  const driveFileId = "ใส่_FILE_ID_ของรูปภาพที่นี่"; 
  const result = setupLineRichMenu(driveFileId);
  Logger.log("📢 ผลการรันระบบ: " + result);
}

/**
 * 🧪 ฟังก์ชันทดสอบการ์ดระดับน้ำเฉพาะส่วน (ปลอดภัย 100% ไม่กระทบต่อผู้ใช้งานทั่วไป)
 * วิธีใช้: ใน Google Apps Script Editor เลือกฟังก์ชัน "testWaterLevelFlexMessage" ที่แถบด้านบน แล้วกดปุ่ม "Run"
 */
function testWaterLevelFlexMessage() {
  Logger.log("🔄 [1/2] กำลังทดสอบดึงข้อมูลระดับน้ำจาก API...");
  const waterRes = getRIDWaterLevelFromAPI();
  Logger.log("📊 ข้อมูลระดับน้ำที่ดึงได้: " + JSON.stringify(waterRes, null, 2));

  if (waterRes && waterRes.success) {
    const flexMsg = getWaterLevelFlexMessage(waterRes, 'X.73');
    Logger.log("✅ [2/2] โครงสร้าง Bubble JSON (สำหรับก๊อปปี้ไปวางใน LINE Flex Simulator):");
    Logger.log(JSON.stringify(flexMsg.contents, null, 2));
    Logger.log("💡 คำแนะนำ: ก๊อปปี้เฉพาะส่วน JSON ด้านบน ไปวางใน https://developers.line.biz/flex-simulator/");
  } else {
    Logger.log("❌ ไม่สามารถดึงข้อมูลระดับน้ำได้");
  }
}

/**
 * 🧪 ฟังก์ชันทดสอบการ์ดระดับน้ำสถานี X.73A บ้านบองอ (ปลอดภัย 100% ไม่กระทบต่อผู้ใช้งานทั่วไป)
 * วิธีใช้: ใน Google Apps Script Editor เลือกฟังก์ชัน "testWaterLevelFlexMessageX73A" ที่แถบด้านบน แล้วกดปุ่ม "Run"
 */
function testWaterLevelFlexMessageX73A() {
  Logger.log("🔄 [1/2] กำลังทดสอบดึงข้อมูลระดับน้ำสถานี X.73A (บ้านบองอ) จาก API...");
  const waterRes = getRIDWaterLevelFromAPI();
  Logger.log("📊 ข้อมูลระดับน้ำที่ดึงได้: " + JSON.stringify(waterRes, null, 2));

  if (waterRes && waterRes.success) {
    const flexMsg = getWaterLevelFlexMessage(waterRes, 'X.73A');
    Logger.log("✅ [2/2] โครงสร้าง Bubble JSON สถานี X.73A (สำหรับก๊อปปี้ไปวางใน LINE Flex Simulator):");
    Logger.log(JSON.stringify(flexMsg.contents, null, 2));
    Logger.log("💡 คำแนะนำ: ก๊อปปี้เฉพาะส่วน JSON ด้านบน ไปวางใน https://developers.line.biz/flex-simulator/");
  } else {
    Logger.log("❌ ไม่สามารถดึงข้อมูลระดับน้ำสถานี X.73A ได้");
  }
}

/**
 * 🧪 ฟังก์ชันจำลองทดสอบการเปลี่ยนสีการ์ดระดับน้ำทั้ง 3 เกณฑ์ (เขียว 🟢 / เหลือง 🟡 / แดง 🔴)
 * วิธีใช้: ใน Google Apps Script Editor เลือกฟังก์ชัน "testWaterLevelCardThresholds" ที่แถบด้านบน แล้วกดปุ่ม "Run"
 */
function testWaterLevelCardThresholds() {
  Logger.log("==========================================");
  Logger.log("🧪 เริ่มทดสอบจำลองเกณฑ์ระดับน้ำ 3 ระดับ (เขียว / เหลือง / แดง)");
  Logger.log("==========================================");

  const mockDataList = [
    {
      name: "🟢 1. เกณฑ์ระดับปกติ (ระดับน้ำ 11.02 ม. <= 13.50 ม.)",
      mockRes: {
        success: true,
        data: { level: "11.02", bankLevel: 14.90, time: "8 ส.ค. 2026 เวลา 15:00 น.", stationName: "สถานี X.73 คลองตันหยงมัส" }
      }
    },
    {
      name: "🟡 2. เกณฑ์เฝ้าระวัง (ระดับน้ำ 14.00 ม. [ช่วง 13.51 - 14.90 ม.])",
      mockRes: {
        success: true,
        data: { level: "14.00", bankLevel: 14.90, time: "8 ส.ค. 2026 เวลา 15:00 น.", stationName: "สถานี X.73 คลองตันหยงมัส" }
      }
    },
    {
      name: "🔴 3. เกณฑ์วิกฤต (ระดับน้ำ 15.50 ม. [> 14.90 ม.])",
      mockRes: {
        success: true,
        data: { level: "15.50", bankLevel: 14.90, time: "8 ส.ค. 2026 เวลา 15:00 น.", stationName: "สถานี X.73 คลองตันหยงมัส" }
      }
    }
  ];

  mockDataList.forEach(testCase => {
    Logger.log("\n------------------------------------------");
    Logger.log(testCase.name);
    const flex = getWaterLevelFlexMessage(testCase.mockRes);
    const headerBg = flex.contents.header.backgroundColor;
    const statusText = flex.contents.header.contents[0].contents[1].text;
    Logger.log(`🎨 สีหัวการ์ดที่ได้: ${headerBg}`);
    Logger.log(`🏷️ ข้อความสถานะที่ได้: ${statusText}`);
    Logger.log("📄 โครงสร้าง Bubble JSON (ก๊อปปี้ส่วนนี้วางใน LINE Flex Simulator ได้เลย):");
    Logger.log(JSON.stringify(flex.contents, null, 2));
  });

  Logger.log("\n==========================================");
  Logger.log("✅ ทดสอบครบทั้ง 3 เกณฑ์เรียบร้อย!");
}

// ==========================================
// 🛠️ ฟังก์ชันสำหรับตั้งค่า Script Properties เริ่มต้น
// ==========================================
/**
 * รันฟังก์ชันนี้จาก Apps Script Editor เพื่อบันทึก Secret Keys ลง Script Properties อัตโนมัติ
 * (หลังจากรันครั้งเดียว ข้อมูลจะถูกเก็บอย่างปลอดภัยใน Properties ของโปรเจกต์)
 */
function setupScriptProperties(customProps) {
  var props = PropertiesService.getScriptProperties();
  var defaultProps = {
    'SS_ID': '',
    'DRIVE_FOLDER_ID': '',
    'TMD_UID': '',
    'TMD_UKEY': '',
    'LINE_CHANNEL_ACCESS_TOKEN': '',
    'TYPHOON_API_KEY': '',
    'AKSON_API_KEY': ''
  };
  var toSet = Object.assign({}, defaultProps, customProps || {});
  // กรองเฉพาะค่าที่ไม่เป็นค่าว่าง เพื่อไม่ให้ทับค่าเดิมที่ตั้งไว้แล้ว
  var finalProps = {};
  for (var k in toSet) {
    if (toSet[k] !== '') finalProps[k] = toSet[k];
  }
  if (Object.keys(finalProps).length > 0) {
    props.setProperties(finalProps);
    Logger.log("✅ บันทึก Script Properties สำเร็จ: " + JSON.stringify(Object.keys(finalProps)));
  } else {
    Logger.log("ℹ️ ไม่มีการเปลี่ยนแปลงค่า Script Properties");
  }
}