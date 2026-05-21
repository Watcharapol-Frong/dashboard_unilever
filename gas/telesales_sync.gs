/**
 * Unilever Dashboard — Telesales Sync
 * =====================================
 * วิธีติดตั้ง:
 *   1. เปิด Google Sheet → Extensions → Apps Script
 *   2. วางโค้ดนี้ลงใน Code.gs
 *   3. ไปที่ Project Settings → Script Properties → Add property:
 *        DASHBOARD_URL  =  https://your-app.vercel.app
 *        INGEST_SECRET  =  <ค่า INGEST_API_SECRET จาก Vercel env>
 *   4. รัน setupTrigger() ครั้งเดียวเพื่อตั้ง schedule อัตโนมัติ
 *
 * Sheet ที่ต้องการ: ชื่อ "Telesales" มี header row ตามลำดับนี้:
 *   mmid | mobile | first_connected_date | call_status |
 *   reason_group | reason_subgroup | contact_note | agent | lead_customers
 */

// ── Config ────────────────────────────────────────────────────────────────────

var SHEET_NAME   = 'Telesales';
var CHUNK_SIZE   = 500;   // records per POST request
var COL = {
  MMID:                 1,
  MOBILE:               2,
  FIRST_CONNECTED_DATE: 3,
  CALL_STATUS:          4,
  REASON_GROUP:         5,
  REASON_SUBGROUP:      6,
  CONTACT_NOTE:         7,
  AGENT:                8,
  LEAD_CUSTOMERS:       9,
};

// ── Menu ──────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Dashboard Sync')
    .addItem('Sync Now (ส่งข้อมูลทันที)', 'syncNow')
    .addItem('Sync เฉพาะแถวใหม่ (ตาม threshold)', 'syncNew')
    .addSeparator()
    .addItem('ตรวจสอบ connection', 'checkConnection')
    .addItem('ตั้ง auto-sync ทุกชั่วโมง', 'setupTrigger')
    .addItem('ยกเลิก auto-sync', 'removeTriggers')
    .addToUi();
}

// ── Main sync functions ────────────────────────────────────────────────────────

/**
 * Sync ทุกแถวใน sheet (ใช้ ON CONFLICT upsert — ปลอดภัยที่จะรันซ้ำ)
 */
function syncNow() {
  var records = readSheet(null);
  if (records.length === 0) {
    SpreadsheetApp.getUi().alert('ไม่พบข้อมูลใน sheet "' + SHEET_NAME + '"');
    return;
  }
  var result = postInChunks(records);
  SpreadsheetApp.getUi().alert(
    '✅ Sync เสร็จแล้ว\n\n' +
    'ส่ง: ' + records.length + ' แถว\n' +
    'บันทึกสำเร็จ: ' + result.inserted + ' แถว\n' +
    'ข้าม (mmid ไม่ถูกต้อง): ' + result.skipped + ' แถว'
  );
}

/**
 * Sync เฉพาะแถวที่ first_connected_date > วันล่าสุดในฐานข้อมูล
 */
function syncNew() {
  var threshold = getThreshold();
  var records   = readSheet(threshold);
  if (records.length === 0) {
    SpreadsheetApp.getUi().alert(
      threshold
        ? 'ไม่มีข้อมูลใหม่หลังจากวันที่ ' + threshold
        : 'ไม่พบข้อมูลใน sheet'
    );
    return;
  }
  var result = postInChunks(records);
  SpreadsheetApp.getUi().alert(
    '✅ Sync (new only) เสร็จแล้ว\n\n' +
    'ส่ง: ' + records.length + ' แถว\n' +
    'บันทึกสำเร็จ: ' + result.inserted + ' แถว\n' +
    'ข้าม: ' + result.skipped + ' แถว'
  );
}

// ── Read sheet ────────────────────────────────────────────────────────────────

/**
 * อ่านข้อมูลจาก sheet แปลงเป็น array of record objects
 * @param {string|null} afterDate - กรอง first_connected_date > afterDate (YYYY-MM-DD), null = ทุกแถว
 */
function readSheet(afterDate) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบ sheet ชื่อ "' + SHEET_NAME + '"');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data    = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var records = [];
  var cutoff  = afterDate ? new Date(afterDate) : null;

  for (var i = 0; i < data.length; i++) {
    var row  = data[i];
    var mmid = String(row[COL.MMID - 1] || '').trim();
    if (!mmid) continue;

    var dateVal = row[COL.FIRST_CONNECTED_DATE - 1];
    var dateStr = formatDate(dateVal);

    if (cutoff && dateStr && new Date(dateStr) <= cutoff) continue;

    records.push({
      mmid:                 mmid,
      mobile:               String(row[COL.MOBILE - 1] || '').trim() || null,
      first_connected_date: dateStr,
      call_status:          String(row[COL.CALL_STATUS - 1] || '').trim() || null,
      reason_group:         String(row[COL.REASON_GROUP - 1] || '').trim() || null,
      reason_subgroup:      String(row[COL.REASON_SUBGROUP - 1] || '').trim() || null,
      contact_note:         String(row[COL.CONTACT_NOTE - 1] || '').trim() || null,
      agent:                String(row[COL.AGENT - 1] || '').trim() || null,
      lead_customers:       String(row[COL.LEAD_CUSTOMERS - 1] || '').trim() || null,
    });
  }

  return records;
}

// ── API calls ─────────────────────────────────────────────────────────────────

/**
 * ดึงวันล่าสุดที่มีข้อมูลในฐานข้อมูล
 * @returns {string|null} YYYY-MM-DD หรือ null
 */
function getThreshold() {
  var props = getProps();
  var res   = UrlFetchApp.fetch(props.url + '/api/data/ingest/threshold', {
    method:             'get',
    headers:            { Authorization: 'Bearer ' + props.secret },
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() !== 200) return null;

  var body = JSON.parse(res.getContentText());
  return body.date || null;
}

/**
 * ส่ง records เป็น chunk ไปที่ ingest API
 * @param {Object[]} records
 * @returns {{ inserted: number, skipped: number }}
 */
function postInChunks(records) {
  var props    = getProps();
  var inserted = 0;
  var skipped  = 0;

  for (var i = 0; i < records.length; i += CHUNK_SIZE) {
    var chunk = records.slice(i, i + CHUNK_SIZE);
    var res   = UrlFetchApp.fetch(props.url + '/api/data/ingest/telesales-activity', {
      method:             'post',
      contentType:        'application/json',
      headers:            { Authorization: 'Bearer ' + props.secret },
      payload:            JSON.stringify({ records: chunk }),
      muteHttpExceptions: true,
    });

    var code = res.getResponseCode();
    if (code !== 200) {
      throw new Error(
        'API error ' + code + ' (chunk ' + Math.floor(i / CHUNK_SIZE + 1) + ')\n' +
        res.getContentText()
      );
    }

    var body  = JSON.parse(res.getContentText());
    inserted += body.inserted || 0;
    skipped  += body.skipped  || 0;
  }

  return { inserted: inserted, skipped: skipped };
}

/**
 * ทดสอบ connection — ไม่ส่งข้อมูล
 */
function checkConnection() {
  var props = getProps();
  try {
    var res  = UrlFetchApp.fetch(props.url + '/api/data/ingest/threshold', {
      method:             'get',
      headers:            { Authorization: 'Bearer ' + props.secret },
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    if (code === 200) {
      var body = JSON.parse(res.getContentText());
      SpreadsheetApp.getUi().alert(
        '✅ เชื่อมต่อสำเร็จ\n\nวันล่าสุดในฐานข้อมูล: ' + (body.date || 'ยังไม่มีข้อมูล')
      );
    } else if (code === 401) {
      SpreadsheetApp.getUi().alert('❌ Unauthorized — INGEST_SECRET ไม่ถูกต้อง');
    } else {
      SpreadsheetApp.getUi().alert('❌ Error ' + code + '\n' + res.getContentText());
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ ไม่สามารถเชื่อมต่อได้\n\n' + e.message);
  }
}

// ── Trigger management ────────────────────────────────────────────────────────

/**
 * ตั้ง time-based trigger ให้ syncNew() รันทุกชั่วโมง
 */
function setupTrigger() {
  removeTriggers();
  ScriptApp.newTrigger('syncNew')
    .timeBased()
    .everyHours(1)
    .create();
  SpreadsheetApp.getUi().alert('✅ ตั้ง auto-sync ทุกชั่วโมงเรียบร้อย');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'syncNew' || t.getHandlerFunction() === 'syncNow') {
      ScriptApp.deleteTrigger(t);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getProps() {
  var props  = PropertiesService.getScriptProperties();
  var url    = props.getProperty('DASHBOARD_URL');
  var secret = props.getProperty('INGEST_SECRET');

  if (!url || !secret) {
    throw new Error(
      'Script Properties ยังไม่ครบ\n\n' +
      'ไปที่ Extensions → Apps Script → Project Settings → Script Properties\n' +
      'แล้วเพิ่ม:\n  DASHBOARD_URL = https://your-app.vercel.app\n  INGEST_SECRET = <secret>'
    );
  }

  return { url: url.replace(/\/$/, ''), secret: secret };
}

/**
 * แปลง cell value เป็น YYYY-MM-DD string
 */
function formatDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = String(val.getMonth() + 1).padStart(2, '0');
    var d = String(val.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  var s = String(val).trim();
  return s || null;
}
