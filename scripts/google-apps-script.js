/************ CONFIG ************
 * อย่า hardcode secret ที่นี่
 * ไปที่ Extensions → Apps Script → Project Settings → Script Properties แล้วเพิ่ม:
 *   DASHBOARD_URL  =  https://your-app.vercel.app
 *   INGEST_SECRET  =  <ค่า INGEST_API_SECRET จาก Vercel env>
 ********************************/
function getConfig_() {
  const props  = PropertiesService.getScriptProperties();
  const url    = props.getProperty("DASHBOARD_URL");
  const secret = props.getProperty("INGEST_SECRET");
  if (!url || !secret) {
    throw new Error(
      "Script Properties ยังไม่ครบ\n" +
      "ไปที่ Project Settings → Script Properties แล้วเพิ่ม:\n" +
      "  DASHBOARD_URL = https://your-app.vercel.app\n" +
      "  INGEST_SECRET = <secret>"
    );
  }
  return { url: url.replace(/\/$/, ""), secret };
}

function exportIncrementalToStorage() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. โหลด Dictionary (schema_map)
  const mapSheet = ss.getSheetByName("schema_map");
  if (!mapSheet) throw new Error("ไม่พบแท็บ schema_map");
  const columnDictionary = buildColumnDictionary_(mapSheet);

  // 2. ดึงวันที่ล่าสุดจาก API
  const thresholdDateStr = getThresholdDate_();
  Logger.log(`กรองข้อมูลที่ first_connected_date > ${thresholdDateStr}`);

  let allExtractedData = [];

  // 3. ลูปผ่านทุก Tab ที่ชื่อขึ้นต้นด้วย "Lead"
  const allSheets = ss.getSheets();
  allSheets.forEach(sheet => {
    const sheetName = sheet.getName();
    if (!sheetName.startsWith("Lead")) return;

    const leadCustomersValue = sheetName.replace(/^Lead\s*/i, "").trim();
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;

    const headerRowIndex = findHeaderRow_(data);
    if (headerRowIndex === -1) return;

    const rawHeaders = data[headerRowIndex];
    const headerMapping = mapHeadersToTarget_(rawHeaders, columnDictionary);

    for (let r = headerRowIndex + 1; r < data.length; r++) {
      const row = data[r];
      if (isRowEmpty_(row)) continue;

      let record = {
        lead_customers: leadCustomersValue,
        source_tab: sheetName,
      };
      let hasCoreData = false;

      Object.keys(headerMapping).forEach(targetField => {
        const colIndex = headerMapping[targetField];
        let val = row[colIndex];

        // จัดการวันที่
        if (targetField === "first_connected_date" && val !== "") {
          const parsedDate = parseDateFlexible_(val);
          val = parsedDate ? formatDateForExport_(parsedDate) : "";
        } else if (val instanceof Date) {
          val = formatDateForExport_(val);
        } else {
          val = String(val || "").trim();
        }

        // ทำความสะอาด mmid และ mobile
        if (targetField === "mmid")   val = cleanMMID_(val);
        if (targetField === "mobile") val = cleanMobile_(val);

        record[targetField] = val;
        if (targetField === "mmid" && val !== "") hasCoreData = true;
      });

      if (!hasCoreData) continue;

      // กรองเฉพาะ Incremental
      const contactDate = record["first_connected_date"];
      if (!contactDate || contactDate <= thresholdDateStr) continue;

      allExtractedData.push(record);
    }
  });

  // 4. POST ไปยัง API
  if (allExtractedData.length > 0) {
    Logger.log(`เตรียมส่ง ${allExtractedData.length} records`);
    const isSuccess = postToAPI_(allExtractedData);
    Logger.log(isSuccess ? "✅ ส่งข้อมูลสำเร็จ" : "❌ ส่งข้อมูลล้มเหลว");
  } else {
    Logger.log("ไม่พบข้อมูล Incremental ใหม่ในรอบนี้");
  }
}

/* ================= POST ไปยัง Next.js API ================= */
function postToAPI_(records) {
  const { url, secret } = getConfig_();
  const options = {
    method:             "post",
    headers:            { "Authorization": `Bearer ${secret}`, "Content-Type": "application/json" },
    payload:            JSON.stringify({ records }),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(`${url}/api/data/upload/ingest/telesales-activity`, options);
    const code     = response.getResponseCode();
    if (code === 200) {
      const body = JSON.parse(response.getContentText());
      Logger.log(`✅ inserted=${body.inserted} skipped=${body.skipped}`);
      return true;
    } else {
      Logger.log(`[API Error] ${code}: ${response.getContentText()}`);
      return false;
    }
  } catch (error) {
    Logger.log(`[Exception] ${error.message}`);
    return false;
  }
}

/* ================= ดึง Threshold Date จาก API ================= */
function getThresholdDate_() {
  const { url, secret } = getConfig_();
  const options = {
    method:             "get",
    headers:            { "Authorization": `Bearer ${secret}` },
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(`${url}/api/data/upload/ingest/threshold`, options);
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      if (data.date) {
        const d = new Date(data.date);
        d.setDate(d.getDate() - 3); // overlap 3 วันเพื่อป้องกัน miss
        return formatDateForExport_(d);
      }
    }
  } catch (e) {
    Logger.log("ไม่สามารถดึงวันที่จาก API ได้: " + e.message);
  }

  // Fallback: 3 วันที่แล้ว
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - 3);
  return formatDateForExport_(fallback);
}

/* ================= HELPER FUNCTIONS ================= */

function buildColumnDictionary_(mapSheet) {
  const data = mapSheet.getDataRange().getValues();
  let dict = {};
  for (let i = 1; i < data.length; i++) {
    const thaiHeader  = normalizeThaiString_(data[i][0]);
    const targetField = data[i][1];
    if (thaiHeader && targetField) dict[thaiHeader] = targetField;
  }
  return dict;
}

function normalizeThaiString_(str) {
  return String(str || "").trim().toLowerCase().replace(/\s+/g, "").replace(/[\n\r]/g, "");
}

function mapHeadersToTarget_(rawHeaders, dict) {
  let mapping = {};
  rawHeaders.forEach((header, index) => {
    const cleanHeader = normalizeThaiString_(header);
    if (dict[cleanHeader]) mapping[dict[cleanHeader]] = index;
  });
  return mapping;
}

function formatDateForExport_(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateFlexible_(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  const s = String(val).trim();
  if (!s) return null;

  const parts = s.split(/[\/\-]/);
  if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) {
    let p0 = parseInt(parts[0], 10);
    let p1 = parseInt(parts[1], 10);
    let p2 = parseInt(parts[2], 10);
    let y, m, d;
    if (p0 > 1000) { y = p0; m = p1; d = p2; }
    else           { d = p0; m = p1; y = p2; }
    if (y < 100)  y += 2000;
    if (y > 2500) y -= 543; // แปลง พ.ศ. → ค.ศ.
    return new Date(y, m - 1, d);
  }

  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

function cleanMMID_(val) {
  const digits = String(val).replace(/\D/g, "");
  if (!digits || digits.length > 14) return "";
  return digits.padStart(14, "0");
}

function cleanMobile_(val) {
  const digits = String(val).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 9)  return digits.padStart(10, "0");
  if (digits.length === 10) return digits;
  return "";
}

function findHeaderRow_(values) {
  for (let i = 0; i < values.length; i++) {
    if (values[i].some(cell => cell !== "" && cell !== null)) return i;
  }
  return -1;
}

function isRowEmpty_(row) {
  return row.every(c => c === "" || c === null);
}
