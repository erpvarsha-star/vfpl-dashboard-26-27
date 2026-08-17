// @ts-nocheck
// ============================================================
// VFPL FACTORY OS — COMPLETE Code.gs (CORS ENABLED)
// ============================================================
// ALERTS: This file no longer contains any missing-data alert logic.
// All alerting (gentle reminder / DME deadline / follow-up / daily
// summary / weekly performance, supervisor-aware, Telegram) lives in
// Alert.gs — deploy both files together in the same Apps Script
// project. Trigger both pull data (this file) and alerts (Alert.gs)
// via deployAllTriggers() below, which calls into both.
// ============================================================

// ── FY CONSTANTS ─────────────────────────────────────────────
var FY_START = new Date(2026, 2, 31, 23, 30, 0);
var FY_END   = new Date(2027, 3, 1, 5, 29, 59);
var FY_LABEL = 'FY2026-27';
var DASH_ID  = '1GHdhrRtOhQFshsAOCK4n3GiJp-6a03k8bn0V_M04wSY';

// ── SOURCE IDs ───────────────────────────────────────────────
var SRC_DISPATCH          = '1t7UjWTP_cpIJ2BjoaMlV6uUKA7ztH9UnKc_korYKCiw';
var SRC_RM_INWARD         = '1OCDff85Tqop2yrtc4tn2kXAKj7TdRwvNmdq21K-5GPE';
var SRC_57F4_OUT          = '1yRsAs7zV0HvH63Ah64D0fcttNAhmrRI6AX1MHKvRyxg';
var SRC_57F4_IN           = '1uX7LqWXwhzA1sLu3TUS-WJ_JLeW1JdOmLeDgNhf2Zfg';
var SRC_VENDOR_REJ        = '1QVX6chu4mR6gkWvYBQS1WsUvVBvTknfCzlPuj-TB59w';
var SRC_PRODUCTION        = '1yC-b36rgAxablmdXhngHCEOsmnlgWourep6ctKifXCA';
var SRC_MACHINE           = '1txZM9a9_OSG-ZWYaAEBLKj-9M7LYLrFyl0kJkPsTMGI';
var SRC_ELEC_OIL          = '1nUvf-UWjBSbSWnZTNph-gRUbjzuguGlidpYBKshKUNQ';
var SRC_DIESEL_VEHICLE    = '14mc6eWXUjBm49lmBLVzu5oniSkJFONyphpuEaT1yG3w';
var SRC_DIESEL_PLANT      = '1EpzQVdQEImKryvUPF3SvrtlXpNiingRkHRrhdyd1zxU';
var SRC_MANPOWER_DAILY    = '1QOu9LM7MVvC73YE_uqeCXoyVmjdBnx0a64xZdP30bec';
var SRC_MANPOWER_CONTRACT = '1sgSLz9BMrS97L4B6JQmazFFH3gd0Vx59UDZx4AX3DzI';
var SRC_SCHEDULE          = '1NR8EPGRJN0AQDXZjYw5k93clsO8AD4u2l2Xke1lBC2I';
var SRC_PARTS             = '14zydCr6_cD9W_6aifEIF6WK_qkO667jnkGXO0jQkY38';
var SRC_OIL_INWARD        = '1iP4Ikp-K3k3m7iwY-YJ51X0Sw6KCI5EWiYFEr22-wv0';
var SRC_JWK_OS            = '1yC-b36rgAxablmdXhngHCEOsmnlgWourep6ctKifXCA';
// Set this to the response-sheet ID logged by createDowntimeForm_().
// Leave blank until the form has been created; pullDashDowntime() skips gracefully.
var SRC_DOWNTIME          = '';

// ════════════════════════════════════════════════════════════
// NOTE: this list is NOT enforced anywhere in this file (nothing below
// reads ALLOWED_ORIGINS) and Apps Script Web Apps do not support origin
// allow-listing via custom code — the platform sets its own CORS headers
// regardless of what a script does. This array documents which origins
// this endpoint is *intended* to be embedded from; it provides no actual
// access control. Anyone with the /exec URL can call doGet from anywhere.
// If real origin restriction is ever needed, it has to happen in front of
// this endpoint (e.g. a Cloud Function proxy checking Referer/Origin), not
// inside Code.gs.
// ════════════════════════════════════════════════════════════
var ALLOWED_ORIGINS = [
  'https://erpvarsha-star.github.io',  // GitHub Pages URL this dashboard is embedded from
  'http://localhost:5500'              // local dev
];
// ── PULL HELPERS ─────────────────────────────────────────────
var MONTH_NAMES_ = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

function inFY_(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return false;
  return dateObj >= FY_START && dateObj <= FY_END;
}

function getFY_(date) {
  var m = date.getMonth() + 1, y = date.getFullYear();
  return m >= 4 ? 'FY' + y + '-' + (y+1).toString().slice(-2)
                : 'FY' + (y-1) + '-' + y.toString().slice(-2);
}

function cleanNum_(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  var s = val.toString().trim();
  if (s === '' || s.indexOf('#') === 0) return 0;
  var n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function writeToTab_(ss, tabName, header, output) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName);
  sheet.clearContents();
  sheet.clearFormats();
  sheet.getRange(2, 1, 1, header.length).setValues([header])
       .setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
  if (output.length > 0) sheet.getRange(3, 1, output.length, header.length).setValues(output);
  sheet.autoResizeColumns(1, header.length);
}

function fmtN(val) {
  if (val === null || val === undefined || val === 0 || val === '0' || val === '') return '—';
  var cleanVal = (typeof val === 'string') ? val.replace(/,/g, '') : val;
  var n = Number(cleanVal);
  if (isNaN(n)) return val;
  return Math.round(n).toLocaleString('en-IN');
}
function pullOutstanding_() {
  var OUTSTANDING_ID='1B7eI55FXwdPaSRX9MoZVLB9bx2sWdCBUBZlsLQiF7q0';  // ← Collections Engine
  var ss=SpreadsheetApp.openById(DASH_ID);
  var src;
  try{src=SpreadsheetApp.openById(OUTSTANDING_ID).getSheetByName('CURRENT_OVERDUE');}catch(e){Logger.log('pullOutstanding_: '+e);return;}
  if(!src){Logger.log('pullOutstanding_: CURRENT_OVERDUE not found');return;}
  var raw=src.getDataRange().getValues();
  var asOn=(raw[0]&&raw[0][0])?raw[0][0].toString().trim():'Date unknown';
  var outRows=[];
  for(var i=5;i<raw.length;i++){
    var cust=(raw[i][0]||'').toString().trim();
    if(!cust)continue; if(cust.toUpperCase().indexOf('GRAND TOTAL')>=0)break;
    outRows.push([cust,Number(raw[i][1])||0,Number(raw[i][2])||0,Number(raw[i][3])||0,asOn]);
  }
  var dest=ss.getSheetByName('RAW_OUTSTANDING');
  if(!dest)dest=ss.insertSheet('RAW_OUTSTANDING');
  dest.clearContents();dest.getRange(1,1).setValue('');
  dest.getRange(2,1,1,5).setValues([['Customer','Not_Due_Rs','Overdue_Rs','Grand_Total_Rs','As_On']]);
  if(outRows.length>0)dest.getRange(3,1,outRows.length,5).setValues(outRows);
  Logger.log('pullOutstanding_: '+outRows.length+' customers | '+asOn);
}
// ── SET TRIGGERS ─────────────────────────────────────────────
function setDashboardTriggers() {
  // Remove old triggers for managed functions
  ScriptApp.getProjectTriggers().forEach(function(t){
    var fn = t.getHandlerFunction();
    if (fn === 'runDashboardPull' || fn === 'dailyHealthCheck_') ScriptApp.deleteTrigger(t);
  });

  // ⏰ Pull schedule: 08:15, 12:00, 16:00, 18:00, 19:00, 23:00
  var pullTimes = [
    { hour: 8,  minute: 15 },  // Shift 3 complete
    { hour: 12, minute: 0  },  // Shift 1 mid-day
    { hour: 16, minute: 0  },  // Shift 1 complete
    { hour: 18, minute: 0  },  // Shift 2 mid-day/evening
    { hour: 19, minute: 0  },  // Shift 2 evening
    { hour: 23, minute: 0  }   // Shift 2 night
  ];
  pullTimes.forEach(function(pt) {
    ScriptApp.newTrigger('runDashboardPull')
      .timeBased()
      .atHour(pt.hour)
      .nearMinute(pt.minute)
      .everyDays(1)
      .create();
  });

  // ⏰ Health check: 07:00 daily — fires before first pull, alerts if any pull was missed overnight
  ScriptApp.newTrigger('dailyHealthCheck_')
    .timeBased()
    .atHour(7)
    .nearMinute(0)
    .everyDays(1)
    .create();

  Logger.log('✅ Triggers set: 8:15AM, 12PM, 4PM, 6PM, 7PM, 11PM (pulls) + 7AM health check for ' + FY_LABEL);
}

// ════════════════════════════════════════════════════════════════
// dailyHealthCheck_() — fires at 07:00 daily.
// Reads all PULL_TS_ Script Properties. Any key not updated in the
// last 28 hours sends a Telegram warning so stale-data mornings are
// caught before Yash opens the dashboard.
// ════════════════════════════════════════════════════════════════
function dailyHealthCheck_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var now = Date.now();
  var STALE_MS = 28 * 60 * 60 * 1000; // 28h — covers overnight gap between 23:00 and 07:00

  var stale = [];
  Object.keys(props).forEach(function(k) {
    if (k.indexOf('PULL_TS_') !== 0) return;
    var ts = Number(props[k]);
    if (!ts || (now - ts) > STALE_MS) {
      var key = k.replace('PULL_TS_', '');
      var ageH = ts ? Math.round((now - ts) / 3600000) : 999;
      stale.push(key + ' (' + ageH + 'h ago)');
    }
  });

  if (stale.length === 0) {
    Logger.log('dailyHealthCheck_: all pull timestamps fresh.');
    return;
  }

  var msg = '⚠️ <b>VFPL Dashboard — Stale Data Warning</b>\n';
  msg += 'The following data sources have not refreshed in >28 hours:\n';
  stale.forEach(function(s) { msg += '  • ' + s + '\n'; });
  msg += '\nCheck Apps Script execution log and re-run <code>runDashboardPull()</code> if needed.';
  try {
    sendTelegramAlert(msg);
    Logger.log('dailyHealthCheck_: stale alert sent for ' + stale.join(', '));
  } catch(e) {
    Logger.log('dailyHealthCheck_: could not send Telegram — ' + e);
  }
}
function doGet(e) {
  // If json=1 parameter, return JSON data
  if (e && e.parameter && e.parameter.json === '1') {
    try {
      var section = e.parameter.section;
      if (section) {
        // PIN-gated financial sections (margins, cost_summary) are served
        // through getPinGatedSection_ and never cached in CacheService.
        if (section === 'margins' || section === 'cost_summary') {
          return ContentService.createTextOutput(JSON.stringify(getPinGatedSection_(section, e.parameter.pin)))
            .setMimeType(ContentService.MimeType.JSON);
        }
        // Non-PIN sections: try named CacheService key first (written by
        // buildDashboardCache after each full pull), fall through to full parse.
        var secHit = CacheService.getScriptCache().get('DASH_SEC_v2_' + section);
        if (secHit) {
          return ContentService.createTextOutput(secHit).setMimeType(ContentService.MimeType.JSON);
        }
        var fullForSec = getMergedCache_();
        if (fullForSec[section] !== undefined) {
          return ContentService.createTextOutput(JSON.stringify(fullForSec[section]))
            .setMimeType(ContentService.MimeType.JSON);
        }
        return ContentService.createTextOutput(JSON.stringify({error:'Unknown section: '+section}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      // Owner-only admin actions
      var action = e.parameter.action;
      if (action === 'restore_cache') {
        var storedPin = PropertiesService.getScriptProperties().getProperty('OWNER_PIN');
        var suppliedPin = e.parameter.pin;
        if (!storedPin || !suppliedPin || String(suppliedPin) !== storedPin) {
          return ContentService.createTextOutput(JSON.stringify({ok:false, error:'Invalid PIN'}))
            .setMimeType(ContentService.MimeType.JSON);
        }
        try {
          restoreLastGoodCache_();
          invalidateDashJsonCache_();
          return ContentService.createTextOutput(JSON.stringify({ok:true, msg:'Cache restored from last known-good snapshot. Refresh the dashboard.'}))
            .setMimeType(ContentService.MimeType.JSON);
        } catch(re) {
          return ContentService.createTextOutput(JSON.stringify({ok:false, error:'Restore failed: '+re.toString()}))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      var json = getMergedCacheJsonCached_();
      return ContentService.createTextOutput(json)
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({error: err.toString()}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Otherwise return the HTML dashboard
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('VFPL Factory OS — FY 2026-27')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── PIN-GATED OWNER-ONLY SECTIONS ─────────────────────────────
// Margins and Cost Summary are financial data (per-VF net realization,
// contractor cost breakdowns). The old design PIN-gated only the HTML
// display — the full data was already sitting in the page's JS state on
// load, readable from DevTools with zero effort regardless of the PIN.
// These sections are now excluded entirely from the general payload
// (see getMergedCacheJsonCached_ below) and served only here, after a
// real server-side check against a Script Property — never against a
// value baked into the HTML/JS the browser downloads.
//
// ONE-TIME SETUP: run setOwnerPinOneTime_('yourpin') once from the Apps
// Script editor (select it in the function dropdown, click Run). It is
// not wired to any trigger or web request on purpose — only run it by hand.
function setOwnerPinOneTime_(pin) {
  if (!pin) { Logger.log('Pass a PIN string, e.g. setOwnerPinOneTime_("1234")'); return; }
  PropertiesService.getScriptProperties().setProperty('OWNER_PIN', String(pin));
  Logger.log('OWNER_PIN set in Script Properties.');
}

function getPinGatedSection_(section, suppliedPin) {
  var storedPin = PropertiesService.getScriptProperties().getProperty('OWNER_PIN');
  if (!storedPin) return { error: 'OWNER_PIN not configured — run setOwnerPinOneTime_() once from the Apps Script editor.' };
  if (!suppliedPin || String(suppliedPin) !== storedPin) return { error: 'Invalid PIN' };

  var full = getMergedCache_();
  if (full.error) return full;
  if (section === 'margins') return { margins: full.margins || {} };
  if (section === 'cost_summary') return { cost_summary_snap: full.cost_summary_snap || {} };
  return { error: 'Unknown section: ' + section };
}

// ════════════════════════════════════════════════════════════════
// TELEGRAM /register BOT — auto-captures Chat IDs
// ════════════════════════════════════════════════════════════════
// Removes the #1 reason MISSING_TELEGRAM ever has rows: supervisors don't
// know their own numeric Telegram Chat ID and have no way to look it up,
// so the Google Form field for it either gets left blank, filled with
// '0', or filled with their PHONE NUMBER instead (a real, confirmed
// pattern in this project's data — phone numbers and Chat IDs are
// unrelated numbers that happen to look similar). This handler lets a
// supervisor message the bot directly and have Telegram tell it their
// real Chat ID itself — no self-reporting, no typos, no guessing.
//
// ONE-TIME SETUP (can't be done from this session — needs your live bot
// token, which isn't available here): run oneTimeSetTelegramWebhook_()
// once from the Apps Script editor, AFTER first running
// setOwnerPinOneTime_() and confirming Script Properties has
// TELEGRAM_BOT_TOKEN set (sendTelegramAlert() already expects this
// property to exist — if alerts are working today, it's already set).
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var msg = body.message;
    if (!msg || !msg.text || !msg.chat || !msg.chat.id) {
      return ContentService.createTextOutput('ok'); // not a text message we handle — Telegram still expects 200 OK
    }
    var chatId = msg.chat.id;
    var text = msg.text.trim();

    if (/^\/start\b/i.test(text)) {
      sendTelegramToChatId(chatId,
        '👋 <b>VFPL Factory OS Bot</b>\n\n' +
        'To receive shift-end alerts directly, register your Chat ID:\n' +
        '<code>/register Your Full Name</code>\n\n' +
        '(use the exact name your department head registered you under in SUPERVISOR_MAP)');
      return ContentService.createTextOutput('ok');
    }

    var regMatch = text.match(/^\/register\s+(.+)$/i);
    if (regMatch) {
      var typedName = regMatch[1].trim();
      var result = registerSupervisorChatId_(typedName, chatId);
      sendTelegramToChatId(chatId, result.message);
      return ContentService.createTextOutput('ok');
    }

    sendTelegramToChatId(chatId, 'Unrecognized command. Send /start for instructions.');
  } catch (err) {
    Logger.log('doPost (Telegram webhook) error: ' + err);
  }
  return ContentService.createTextOutput('ok');
}

// Matches a typed name against SUPERVISOR_MAP's Supervisor Name column
// and updates Telegram Chat ID for every row belonging to that person
// (their Chat ID doesn't change week to week, so all their rows get it).
function registerSupervisorChatId_(typedName, chatId) {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var mapSh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!mapSh || mapSh.getLastRow() < 2) {
    return { ok: false, message: '❌ SUPERVISOR_MAP is not set up yet — contact your DME.' };
  }

  var norm = function(s) { return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' '); };
  var typedNorm = norm(typedName);

  var data = mapSh.getRange(2, 1, mapSh.getLastRow() - 1, 7).getValues();
  var matchedRows = [];
  // Pass 1: exact match (case/whitespace-insensitive)
  for (var i = 0; i < data.length; i++) {
    if (norm(data[i][1]) === typedNorm) matchedRows.push(i);
  }
  // Pass 2: fallback — sheet name contains every word the person typed
  // (handles "Subhash T" matching "Subhash Thorat", minor typos in order)
  if (matchedRows.length === 0) {
    var typedWords = typedNorm.split(' ').filter(function(w){ return w.length > 0; });
    for (var j = 0; j < data.length; j++) {
      var sheetNorm = norm(data[j][1]);
      if (typedWords.length > 0 && typedWords.every(function(w){ return sheetNorm.indexOf(w) >= 0; })) {
        matchedRows.push(j);
      }
    }
  }

  if (matchedRows.length === 0) {
    return { ok: false, message: '❌ Couldn\'t find "' + typedName + '" in SUPERVISOR_MAP. Check the spelling matches what your DME registered, or contact them to add you first.' };
  }

  matchedRows.forEach(function(rowIdx) {
    mapSh.getRange(rowIdx + 2, 4).setValue(chatId); // col D = Telegram Chat ID
  });

  var dept = data[matchedRows[0]][0] || '';
  return { ok: true, message: '✅ Registered! You\'ll now receive shift-end alerts directly for ' + dept + ' (' + matchedRows.length + ' week-row(s) updated).' };
}

// Run this ONCE, by hand, from the Apps Script editor — after deploying
// this project as a Web App and confirming TELEGRAM_BOT_TOKEN is set in
// Script Properties. It registers this Web App's URL as the bot's
// webhook so Telegram starts forwarding messages to doPost() above.
// Re-running it is safe (idempotent) if the Web App URL ever changes
// after a redeploy.
function oneTimeSetTelegramWebhook_() {
  var token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) { Logger.log('❌ TELEGRAM_BOT_TOKEN not set in Script Properties — set it first (same property sendTelegramAlert() uses).'); return; }
  var webAppUrl = ScriptApp.getService().getUrl();
  if (!webAppUrl) { Logger.log('❌ Could not resolve this project\'s Web App URL — deploy as a Web App first (Deploy > New deployment).'); return; }

  var url = 'https://api.telegram.org/bot' + token + '/setWebhook?url=' + encodeURIComponent(webAppUrl);
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log('setWebhook response: ' + response.getContentText());
}

// ── SCRIPT-CACHE LAYER IN FRONT OF getMergedCache_() ──────────
// The dashboard frontend polls doGet?json=1 every 60s, and every open
// dashboard tab / device polls independently — nothing on the client
// enforces a shared rate limit. Without this layer, every poll from
// every viewer does a fresh SpreadsheetApp.openById().getRange().getValues()
// read of DASHBOARD_CACHE. This wrapper serves repeat requests within
// DASH_CACHE_TTL_ seconds straight from CacheService instead, so cost
// is ~1 real sheet read per TTL window regardless of viewer count.
//
// CacheService caps individual values at 100KB — DASHBOARD_CACHE's own
// payload is chunked across sheet cells specifically because the full
// JSON exceeds that, so a full-size payload intentionally falls through
// uncached below rather than being silently truncated by cache.put().
//
// This cached value is the PUBLIC payload only — margins/cost_summary_snap
// are stripped before it is ever written to cache.put() or returned, so
// they cannot leak through this path regardless of TTL or cache state.
var DASH_CACHE_KEY_ = 'DASH_JSON_PUBLIC_V1';
var DASH_CACHE_TTL_ = 55; // seconds — just under the frontend's 60s poll interval

function getMergedCacheJsonCached_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(DASH_CACHE_KEY_);
  if (hit) return hit;

  var full = getMergedCache_();
  if (!full.error) {
    delete full.margins;
    delete full.cost_summary_snap;
  }

  var json = JSON.stringify(full);
  if (json.length < 100000) {
    try { cache.put(DASH_CACHE_KEY_, json, DASH_CACHE_TTL_); }
    catch (e) { Logger.log('CacheService put failed (non-fatal): ' + e); }
  } else {
    Logger.log('DASH_JSON_PUBLIC_V1: payload ' + json.length + ' bytes exceeds CacheService 100KB cap — serving uncached.');
  }
  return json;
}

// Called at the end of buildDashboardCache() so the poll immediately
// after a fresh pull gets the new data rather than up to 55s of a
// stale-but-about-to-be-overwritten cached response.
var DASH_SEC_NAMES_ = [
  'steel','elec','wip','schedule','prod_monthly','die_life','outstanding',
  'f4','debit_notes','manpower_summary','oil_summary','transport_summary',
  'planner','vendor_rej_summary','data_gaps_summary','fy_monthly',
  'shift_status','dept_score','today','dropout_trend','machine_registry',
  'downtime_summary'
];

// ── INCREMENTAL PULL GUARD ────────────────────────────────────────
// Pull functions read the entire source sheet on every call.  When a
// source changes at most once per shift (or once per day), there is no
// value in re-reading it on every trigger fire.  _pullFresh_() skips
// the call if the same key was recorded within ttlMinutes; otherwise it
// stamps the current time and returns true (caller should proceed).
//
// TTL guidance:
//   production (shift-level)  → 55  min
//   electricity / oil / diesel → 240 min (entered once per shift/day)
//   schedule / parts / vendor  → 360 min (entered weekly at most)
function _pullFresh_(key, ttlMinutes) {
  var props = PropertiesService.getScriptProperties();
  var propKey = 'PULL_TS_' + key;
  var lastMs = parseInt(props.getProperty(propKey) || '0');
  var nowMs = Date.now();
  if (nowMs - lastMs < ttlMinutes * 60000) {
    Logger.log('SKIP pull ' + key + ' — fresh (' + Math.round((nowMs - lastMs) / 60000) + ' min ago, TTL ' + ttlMinutes + ' min)');
    return false;
  }
  props.setProperty(propKey, String(nowMs));
  return true;
}

function clearPullFreshTimestamps_() {
  var props = PropertiesService.getScriptProperties();
  props.getKeys().filter(function(k) { return k.indexOf('PULL_TS_') === 0; })
    .forEach(function(k) { props.deleteProperty(k); });
  Logger.log('All PULL_TS_ timestamps cleared — next runDashboardPull will do a full re-pull.');
}

// ── ITEM 3: DOWNTIME FORM CREATION ───────────────────────────────────────────
// Run createDowntimeForm_() ONCE from the Apps Script editor to create the
// Google Form for downtime/stoppage tracking and link its response sheet.
// The form URL is logged — share it with floor supervisors.
//
// After running, set SRC_DOWNTIME to the response spreadsheet ID
// (logged after creation) and add pullDashDowntime() to runDashboardPull().
//
// Fields created:
//   Department (dropdown), Date, Shift (dropdown), Machine (text),
//   Downtime Start Time (time), Downtime End Time (time),
//   Category (dropdown: Breakdown/Planned Maint/Power Failure/No Material/
//             Die Change/Setup+Setting/Quality Hold/Other),
//   Description (paragraph, optional)
function createDowntimeForm_() {
  var form = FormApp.create('VFPL — Downtime & Stoppage Report FY 2026-27');
  form.setDescription('Record every machine stoppage. Filled by shift supervisor immediately after downtime ends.');
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  form.setAllowResponseEdits(true);

  var DEPTS = ['Cutting','Forge','Press','Machine','HT','Final','VMC Shop','Maintenance','Other'];
  var SHIFTS = ['Shift 1 (6am–2pm)','Shift 2 (2pm–10pm)','Shift 3 (10pm–6am)'];
  var CATEGORIES = [
    'Breakdown — Mechanical',
    'Breakdown — Electrical',
    'Planned Maintenance',
    'Power Failure / Trip',
    'No Material / RM Shortage',
    'Die Change',
    'Setup / Setting Change',
    'Quality Hold',
    'Other'
  ];

  form.addListItem().setTitle('Department').setChoiceValues(DEPTS).setRequired(true);
  form.addDateItem().setTitle('Date').setRequired(true);
  form.addListItem().setTitle('Shift').setChoiceValues(SHIFTS).setRequired(true);
  form.addTextItem().setTitle('Machine').setHelpText('E.g. Hammer 3T, 2500 Ton Press, H1N').setRequired(true);
  form.addTimeItem().setTitle('Downtime Start Time').setRequired(true);
  form.addTimeItem().setTitle('Downtime End Time').setRequired(true);
  form.addListItem().setTitle('Downtime Category').setChoiceValues(CATEGORIES).setRequired(true);
  form.addParagraphTextItem().setTitle('Description / Root Cause').setRequired(false)
    .setHelpText('Brief note on what happened and what was done to restore.');

  // Link a response spreadsheet
  var ss = form.getDestination();
  if (!ss) {
    var respSs = SpreadsheetApp.create('VFPL Downtime Form Responses');
    form.setDestination(FormApp.DestinationType.SPREADSHEET, respSs.getId());
    Logger.log('Response sheet created: ' + respSs.getUrl());
    Logger.log('Response sheet ID (set as SRC_DOWNTIME): ' + respSs.getId());
  }

  Logger.log('✅ Downtime form created: ' + form.getPublishedUrl());
  Logger.log('Form edit URL: ' + form.getEditUrl());
}

// ── ITEM 12: REMOVE CHAT ID FIELD FROM GOOGLE FORM ──────────────────────────
// The Telegram bot now reads chat IDs via /register instead of a form field.
// Run removeChatIdFromForm_(formUrl) from the Apps Script editor, passing the
// edit URL of the form that still has a "Chat ID" / "Telegram Chat ID" field.
//
// Example: removeChatIdFromForm_('https://docs.google.com/forms/d/FORM_ID/edit')
//
// The function lists all fields first so you can verify, then removes matches.
// Safe to re-run — if the field is already gone it logs "0 fields removed".
function removeChatIdFromForm_(formUrl) {
  if (!formUrl) {
    Logger.log('Usage: removeChatIdFromForm_("https://docs.google.com/forms/d/FORM_ID/edit")');
    return;
  }
  var form = FormApp.openByUrl(formUrl);
  Logger.log('Form: "' + form.getTitle() + '"');
  var items = form.getItems();
  Logger.log('All fields (' + items.length + '):');
  items.forEach(function(it) { Logger.log('  [' + it.getIndex() + '] ' + it.getTitle()); });

  var removed = 0;
  // Iterate in reverse so index shifts don't affect deletion
  for (var i = items.length - 1; i >= 0; i--) {
    var title = items[i].getTitle().toLowerCase().replace(/\s+/g, ' ').trim();
    if (title.indexOf('chat id') >= 0 || title.indexOf('telegram') >= 0 || title === 'chat_id') {
      Logger.log('Removing: "' + items[i].getTitle() + '"');
      form.deleteItem(items[i]);
      removed++;
    }
  }
  Logger.log('✅ removeChatIdFromForm_: removed ' + removed + ' field(s). Re-publish the form if needed.');
}

function invalidateDashJsonCache_() {
  var c = CacheService.getScriptCache();
  try { c.remove(DASH_CACHE_KEY_); } catch(e) {}
  DASH_SEC_NAMES_.forEach(function(k) {
    try { c.remove('DASH_SEC_v2_' + k); } catch(e) {}
  });
}

// ── CACHE BACKUP / RESTORE ─────────────────────────────────────
// buildDashboardCache() clears and overwrites DASHBOARD_CACHE completely
// on every run. If a pull produces bad data (a source sheet was mid-edit,
// a calculation threw partway leaving stale intermediates, etc.) but
// still completes without an exception, the dashboard silently serves
// that bad snapshot until the next successful pull — there was no way to
// go back. This keeps the last CACHE_BACKUP_COUNT_ snapshots in dated
// tabs (rotated, cheapest via rename rather than copy) and gives the
// owner a one-function way to roll back by hand from the Apps Script
// editor: run restoreLastGoodCache_().
var CACHE_BACKUP_COUNT_ = 3;

function backupDashboardCache_(ss) {
  var cacheSh = ss.getSheetByName('DASHBOARD_CACHE');
  if (!cacheSh || cacheSh.getLastRow() < 1) return; // nothing written yet — first run

  var lastRow = cacheSh.getLastRow();
  var vals = cacheSh.getRange(1, 1, lastRow, 2).getValues(); // chunks (col A) + length marker (col B)
  if (!vals.some(function(r){ return r[0]; })) return; // empty/corrupt — don't preserve garbage as "last good"

  // Drop the oldest backup, then shift the rest up by renaming in place
  // (cheaper than copying sheet contents around).
  var oldest = ss.getSheetByName('CACHE_BACKUP_' + CACHE_BACKUP_COUNT_);
  if (oldest) ss.deleteSheet(oldest);
  for (var j = CACHE_BACKUP_COUNT_ - 1; j >= 1; j--) {
    var fromSh = ss.getSheetByName('CACHE_BACKUP_' + j);
    if (!fromSh) continue;
    fromSh.setName('CACHE_BACKUP_' + (j + 1));
  }

  // Current live cache becomes the new backup_1.
  var b1 = ss.insertSheet('CACHE_BACKUP_1');
  b1.getRange(1, 1, vals.length, 2).setValues(vals);
  b1.getRange(1, 3).setValue('Snapshotted: ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy HH:mm'));
}

// Run this by hand from the Apps Script editor (select from the function
// dropdown, click Run) if the live dashboard is showing obviously wrong
// data after a pull — it puts the previous snapshot back and clears the
// CacheService layer so the very next poll serves the restored version.
function restoreLastGoodCache_() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var backupSh = ss.getSheetByName('CACHE_BACKUP_1');
  if (!backupSh || backupSh.getLastRow() < 1) {
    Logger.log('❌ No backup available — CACHE_BACKUP_1 is empty or missing. Nothing to restore.');
    return;
  }
  var vals = backupSh.getRange(1, 1, backupSh.getLastRow(), 2).getValues();
  var cacheSh = ss.getSheetByName('DASHBOARD_CACHE') || ss.insertSheet('DASHBOARD_CACHE');
  cacheSh.clearContents();
  cacheSh.getRange(1, 1, vals.length, 2).setValues(vals);
  invalidateDashJsonCache_();
  Logger.log('✅ DASHBOARD_CACHE restored from CACHE_BACKUP_1. Next poll will serve the restored snapshot.');
}

function runDashboardPull() {
  var start = new Date();
  Logger.log('=== runDashboardPull started: ' + FY_LABEL + ' ===');

  // New Pull added to top
  try { pullDashJWK(); Logger.log('OK JWK'); } catch(e) { Logger.log('FAIL JWK: ' + e); }

  // ── Production (shift-level data) — pull every 55 min ──────────────────
  if (_pullFresh_('DISPATCH',    55)) try { pullDashDispatch();        Logger.log('OK Dispatch');          } catch(e) { Logger.log('FAIL Dispatch: '+e); }
  if (_pullFresh_('RM_INWARD',   55)) try { pullDashRMInward();        Logger.log('OK RM Inward');         } catch(e) { Logger.log('FAIL RM Inward: '+e); }
  if (_pullFresh_('CUTTING',     55)) try { pullDashCutting();         Logger.log('OK Cutting');           } catch(e) { Logger.log('FAIL Cutting: '+e); }
  if (_pullFresh_('PRESS',       55)) try { pullDashPress();           Logger.log('OK Press');             } catch(e) { Logger.log('FAIL Press: '+e); }
  if (_pullFresh_('FORGE',       55)) try { pullDashForge();           Logger.log('OK Forge');             } catch(e) { Logger.log('FAIL Forge: '+e); }
  if (_pullFresh_('HT',          55)) try { pullDashHT();              Logger.log('OK HT');               } catch(e) { Logger.log('FAIL HT: '+e); }
  if (_pullFresh_('FINAL',       55)) try { pullDashFinal();           Logger.log('OK Final');             } catch(e) { Logger.log('FAIL Final: '+e); }
  if (_pullFresh_('MACHINE',     55)) try { pullDashMachine();         Logger.log('OK Machine');           } catch(e) { Logger.log('FAIL Machine: '+e); }
  if (_pullFresh_('MP_STAFF',    55)) try { pullDashManpowerStaff();   Logger.log('OK Manpower Staff');    } catch(e) { Logger.log('FAIL Manpower Staff: '+e); }
  if (_pullFresh_('MP_CONTRACT', 55)) try { pullDashManpowerContract();Logger.log('OK Manpower Contract'); } catch(e) { Logger.log('FAIL Manpower Contract: '+e); }

  // ── Downtime form — pull every 55 min (shift-level, same cadence as production) ──
  if (_pullFresh_('DOWNTIME', 55)) try { pullDashDowntime(); Logger.log('OK Downtime'); } catch(e) { Logger.log('FAIL Downtime: '+e); }

  // ── Utilities / daily entries — pull every 4 hours ──────────────────────
  if (_pullFresh_('ELECTRICITY', 240)) try { pullDashElectricity();   Logger.log('OK Electricity');       } catch(e) { Logger.log('FAIL Electricity: '+e); }
  if (_pullFresh_('OIL',         240)) try { pullDashOil();            Logger.log('OK Oil');               } catch(e) { Logger.log('FAIL Oil: '+e); }
  if (_pullFresh_('DIESEL_VEH',  240)) try { pullDashDieselVehicle();  Logger.log('OK Diesel Veh');        } catch(e) { Logger.log('FAIL Diesel Veh: '+e); }
  if (_pullFresh_('DIESEL_PLT',  240)) try { pullDashDieselPlant();    Logger.log('OK Diesel Plant');      } catch(e) { Logger.log('FAIL Diesel Plant: '+e); }
  if (_pullFresh_('OIL_INWARD',  240)) try { pullDashOilInward();      Logger.log('OK Oil Inward');        } catch(e) { Logger.log('FAIL Oil Inward: '+e); }

  // ── Low-frequency sources — pull every 6 hours ──────────────────────────
  if (_pullFresh_('57F4_OUT',    360)) try { pullDash57F4Out();        Logger.log('OK 57F4 Out');          } catch(e) { Logger.log('FAIL 57F4 Out: '+e); }
  if (_pullFresh_('57F4_IN',     360)) try { pullDash57F4In();         Logger.log('OK 57F4 In');           } catch(e) { Logger.log('FAIL 57F4 In: '+e); }
  if (_pullFresh_('VEN_REJ',     360)) try { pullDashVendorRejection();Logger.log('OK Vendor Rej');        } catch(e) { Logger.log('FAIL Vendor Rej: '+e); }
  if (_pullFresh_('SCHEDULE',    360)) try { pullDashSchedule();       Logger.log('OK Schedule');          } catch(e) { Logger.log('FAIL Schedule: '+e); }
  if (_pullFresh_('PARTS',       360)) try { pullDashParts();          Logger.log('OK Parts');             } catch(e) { Logger.log('FAIL Parts: '+e); }
  if (_pullFresh_('OUTSTANDING', 360)) try { pullOutstanding_();       Logger.log('OK Outstanding');       } catch(e) { Logger.log('FAIL Outstanding: '+e); }

  // ── RM / Steel (recomputed after inward + consumption are fresh) ─────────
  if (_pullFresh_('RM_CONS',  55)) try { calcRMConsumption();  Logger.log('OK RM Consumption'); } catch(e) { Logger.log('FAIL RM Consumption: '+e); }
  if (_pullFresh_('STEEL',   120)) try { buildSteelStock();    Logger.log('OK Steel Stock');    } catch(e) { Logger.log('FAIL Steel Stock: '+e); }

  // Analytics Chain — buildMasterMachine_ MUST run first; it rebuilds MCODE_/SECTIONS_/DEPT_DEFS_
  // that every subsequent analytics function reads.
  try { buildMasterMachine_(); Logger.log('OK MASTER_MACHINE'); } catch(e) { Logger.log('FAIL MASTER_MACHINE: '+e); }
  try { refreshDailyOverview(); Logger.log('OK Daily Overview'); } catch(e) { Logger.log('FAIL Daily Overview: '+e); }
  try { buildShiftOutputKG();   Logger.log('OK Shift Output KG'); } catch(e) { Logger.log('FAIL Shift Output KG: '+e); }
  try { colorForgeDailyCells_(); Logger.log('OK Color Forge Daily'); } catch(e) { Logger.log('FAIL Color Forge Daily: '+e); }
  try { buildProductionMonthly(); Logger.log('OK Production Monthly'); } catch(e) { Logger.log('FAIL Production Monthly: '+e); }
  try { buildWIPSummary(); Logger.log('OK WIP Summary'); } catch(e) { Logger.log('FAIL WIP Summary: '+e); }
  try { buildTxnWip_(); Logger.log('OK TXN_WIP (native ledger, replaces loadOpeningWIP patch)'); } catch(e) { Logger.log('FAIL TXN_WIP: '+e); }
  try { buildScheduleIntelligence(); Logger.log('OK Schedule Intelligence'); } catch(e) { Logger.log('FAIL Schedule Intelligence: '+e); }
  try { buildFYMonthly(); Logger.log('OK FY Monthly'); } catch(e) { Logger.log('FAIL FY Monthly: '+e); }
  try { patchElectricityIntoFYMonthly(); Logger.log('OK Electricity Patch'); } catch(e) { Logger.log('FAIL Electricity Patch: '+e); }
  try { buildDieLife(); Logger.log('OK Die Life'); } catch(e) { Logger.log('FAIL Die Life: '+e); }
  try { buildDebitNoteTracker(); Logger.log('OK Debit Notes'); } catch(e) { Logger.log('FAIL Debit Notes: '+e); }
  try { buildDailyManpower(); Logger.log('OK Daily Manpower'); } catch(e) { Logger.log('FAIL Daily Manpower: '+e); }
  try { buildManpowerTrend(); Logger.log('OK Manpower Trend'); } catch(e) { Logger.log('FAIL Manpower Trend: '+e); }
  try { buildProductionPlanner(); Logger.log('OK Production Planner'); } catch(e) { Logger.log('FAIL Production Planner: '+e); }
  try { highlightMissingPartData(); Logger.log('OK Part Highlighter'); } catch(e) { Logger.log('FAIL Part Highlighter: '+e); }
  try { buildMasterDataGaps(); Logger.log('OK Data Gap 8'); } catch(e) { Logger.log('FAIL Data Gap 8: '+e); }
  try { buildCollectionEngine(); Logger.log('OK Collection Engine'); } catch(e) { Logger.log('FAIL Collection Engine: '+e); }
  try { buildAlertsActive(); Logger.log('OK Alerts Active'); } catch(e) { Logger.log('FAIL Alerts Active: '+e); }
  try { buildDashboardCache(); Logger.log('OK Dashboard Cache'); } catch(e) { Logger.log('FAIL Dashboard Cache: '+e); }
  try { auditRawTabsForBadData_(); Logger.log('OK Submission audit'); } catch(e) { Logger.log('FAIL Submission audit: '+e); }
  try { flagLateSubmissions_(); Logger.log('OK Late submission audit'); } catch(e) { Logger.log('FAIL Late submission audit: '+e); }

  try { hideRAWTabs(); Logger.log('OK RAW hidden'); } catch(e) { Logger.log('FAIL hideRAWTabs: '+e); }

  var dur = Math.round((new Date()-start)/1000);
  Logger.log('=== Pull complete in '+dur+'s ===');
}

// ============================================================
// PULL FUNCTIONS 1-23
// ============================================================

// ════════════════════════════════════════════════════════════
// REPLACEMENT: pullDashDispatch (Gap 1 Invoice Inheritance)
// ════════════════════════════════════════════════════════════
function pullDashDispatch() {
  var srcSS = SpreadsheetApp.openById(SRC_DISPATCH);
  var ss    = SpreadsheetApp.openById(DASH_ID);
  var SLOTS = [[7,9,38,39],[10,12,40,41],[13,15,42,43],[16,18,44,45],
               [19,21,46,47],[22,24,48,49],[25,27,50,51],[28,30,52,53]];
  var julSheet = srcSS.getSheetByName('Actual Dispatch');
 
  if (!julSheet) { Logger.log('TAB NOT FOUND: Actual Dispatch'); return; }
 
  // 1. Load Parts Map for Weights + Prices
  var partsMap = {};
  var pSh = ss.getSheetByName('RAW_PARTS');
  if (pSh && pSh.getLastRow() >= 3) {
    var pData = pSh.getDataRange().getValues();
    for (var i = 2; i < pData.length; i++) {
      var vf = (pData[i][1] || '').toString().trim();
      if (vf) {
        partsMap[vf] = {
          unitPrice: cleanNum_(pData[i][25]) || cleanNum_(pData[i][26]) || 0,
          finishWt:  cleanNum_(pData[i][8])  || 0
        };
      }
    }
  }
 
  var data = julSheet.getDataRange().getValues();
  var output = [];
 
  for (var r = 1; r < data.length; r++) {
    var row = data[r], rawDate = row[0];
    if (!rawDate || rawDate === '') continue;
    var dateObj = (rawDate instanceof Date) ? rawDate : new Date(rawDate);
    if (isNaN(dateObj.getTime()) || !inFY_(dateObj)) continue;
 
    var customer  = (row[5]  || '').toString().trim().toUpperCase();
    var transport = (row[31] || '').toString().trim().toUpperCase();
    var fy = getFY_(dateObj), month = MONTH_NAMES_[dateObj.getMonth()];
    var primaryInvoice = (row[37] || '').toString().trim();
 
    SLOTS.forEach(function(slot){
      var vfNo  = (row[slot[0]-1] || '').toString().trim();
      var qty   = cleanNum_(row[slot[1]-1]);
      var invNo = (row[slot[2]-1] || '').toString().trim() || primaryInvoice;
 
      if (!vfNo || vfNo.toUpperCase() === 'VF0' || qty <= 0) return;

      var part = partsMap[vfNo] || { unitPrice: 0, finishWt: 0 };
      var itemWeight = qty * part.finishWt;
      var allocatedFreight = 0;
 
      // ═════════════════════════════════════════════════════════════════
      // FREIGHT ROUTING ENGINE — Playbook Section D.4 (6 tiers)
      // Evaluated top-to-bottom; first match wins.
      // ═════════════════════════════════════════════════════════════════
 
      // Tier 1 — Internal / zero-freight
      //   VARSHA   : matched on transport field (internal inter-unit transfer)
      //   Others   : matched on customer field
      if (transport.indexOf('VARSHA') >= 0 ||
          customer.indexOf('NAHAR') >= 0 ||
          customer.indexOf('SANJEEV') >= 0 ||
          customer.indexOf('AURANGABAD AUTO') >= 0) {
        allocatedFreight = 0;
      }
      // Tier 2 — Mosdorfer → ₹1.90/kg
      else if (customer.indexOf('MOSDORFER') >= 0) {
        allocatedFreight = itemWeight * 1.90;
      }
      // Tier 3 — Force Motors (Pithampur)
      //   STRICT: only VF431 and VF432 get ₹2.50/kg; all other Force
      //   Motors parts get the default ₹1.30/kg
      else if (customer.indexOf('FORCE MOTORS') >= 0) {
        if (vfNo === 'VF431' || vfNo === 'VF432') {
          allocatedFreight = itemWeight * 2.50;
        } else {
          allocatedFreight = itemWeight * 1.30;
        }
      }
      // Tier 4 — Nashik / Innova → ₹1.25/kg
      else if (customer.indexOf('NASHIK') >= 0 || customer.indexOf('INNOVA') >= 0) {
        allocatedFreight = itemWeight * 1.25;
      }
      // Tier 5 — Gummi Metall / Guhu → ₹1.30/kg
      else if (customer.indexOf('GUMMI') >= 0 || customer.indexOf('GUHU') >= 0) {
        allocatedFreight = itemWeight * 1.30;
      }
      // Tier 6 — Default: Pune + all other destinations → ₹1.30/kg
      else {
        allocatedFreight = itemWeight * 1.30;
      }
 
      output.push([
        dateObj,                           // A  Date
        (row[3] || ''),                    // B  Dispatch_Type
        customer,                          // C  Customer
        vfNo,                              // D  VF_No
        qty,                               // E  Qty
        invNo,                             // F  Invoice_No
        qty * part.unitPrice,              // G  Calc_Basic_Value_Rs
        Math.round(itemWeight),            // H  Weight_kg
        (row[30] || ''),                   // I  Vehicle_No
        transport,                         // J  Transport_Name
        Math.round(allocatedFreight),      // K  Allocated_Freight_Rs
        fy,                                // L  FY
        month                              // M  Month
      ]);
    });
  }
 
  // Headers — 13 columns, Weight_kg at position H
  var headers = ['Date','Dispatch_Type','Customer','VF_No','Qty','Invoice_No',
                 'Calc_Basic_Value_Rs','Weight_kg','Vehicle_No','Transport_Name',
                 'Allocated_Freight_Rs','FY','Month'];
  writeToTab_(ss, 'RAW_DISPATCH', headers, output);
  Logger.log('✅ RAW_DISPATCH written with ' + output.length + ' rows. Freight routing: Playbook D.4.');
}
function pullDashRMInward() {
  var srcSS=SpreadsheetApp.openById(SRC_RM_INWARD),ss=SpreadsheetApp.openById(DASH_ID);
  var SLOTS=[{billNoCol:4,gradeCol:7,sectionCol:8,qtyCol:9,rateCol:10},{billNoCol:15,gradeCol:16,sectionCol:17,qtyCol:18,rateCol:19},{billNoCol:57,gradeCol:58,sectionCol:59,qtyCol:60,rateCol:61}];
  var output=[],srcSheet=srcSS.getSheetByName('Form responses 1');
  if(!srcSheet){Logger.log('TAB NOT FOUND: RM Inward');return;}
  var data=srcSheet.getDataRange().getValues();
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[2];if(!rawDate||rawDate==='')continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    var supplier=(row[3]||'').toString().trim();if(!supplier)continue;
    SLOTS.forEach(function(slot){
      var grade=(row[slot.gradeCol]||'').toString().trim(),qty=row[slot.qtyCol],rate=row[slot.rateCol];
      var billNo=(row[slot.billNoCol]||'').toString().trim();
      if(!grade)return;if(qty===''||qty===null||qty===undefined||qty===0||qty<0)return;
      if(rate===''||rate===null||rate===undefined)rate='';
      output.push([dateObj,supplier,billNo,grade,(row[slot.sectionCol]||'').toString().trim(),qty,rate]);
    });
  }
  writeToTab_(ss,'RAW_RM_INWARD',['Inward_Date','Supplier','Bill_No','Grade','Section','Qty_kg','Rate_Per_kg'],output);
  Logger.log('RAW_RM_INWARD rows: '+output.length);
}
function pullDashJWK() {
  var jwkSrcSS = SpreadsheetApp.openById('1yC-b36rgAxablmdXhngHCEOsmnlgWourep6ctKifXCA');
  var jwkSrcSheet = jwkSrcSS.getSheetByName('JOBWORK VF');
  if (jwkSrcSheet) {
    var jwkData = jwkSrcSheet.getDataRange().getValues();
    var jwkOutput = [];
    for (var i = 1; i < jwkData.length; i++) {
      var vf = (jwkData[i][1] || '').toString().trim();
      if (vf && vf.toUpperCase() !== 'VF0') {
        jwkOutput.push([i, vf]);
      }
    }
    var ss = SpreadsheetApp.openById(DASH_ID);
    writeToTab_(ss, 'RAW_JWK', ['Sr_No', 'VF_No'], jwkOutput);
  }
}
function pullDash57F4Out() {
  var srcSS=SpreadsheetApp.openById(SRC_57F4_OUT),ss=SpreadsheetApp.openById(DASH_ID);
  var SEC1=[[5,6],[7,8],[9,10],[11,12],[13,14],[15,16],[17,18],[19,20],[21,22],[23,24]];
  var SEC2=[[33,34],[35,36],[37,38],[39,40],[41,42]];
  var output=[],srcSheet=srcSS.getSheetByName('Form responses 1');
  if(!srcSheet){Logger.log('TAB NOT FOUND: 57F4 Out');return;}
  var data=srcSheet.getDataRange().getValues();
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[2];if(!rawDate)continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    var vendor=(row[3]||'').toString().trim(),challanNo=(row[32]||'').toString().trim();
    if(!vendor)continue;
    var s2=false;for(var s=0;s<SEC2.length;s++){var v2=(row[SEC2[s][0]]||'').toString().trim();if(v2&&v2.toUpperCase()!=='VF0'){s2=true;break;}}
    (s2?SEC2:SEC1).forEach(function(slot){
      var vfNo=(row[slot[0]]||'').toString().trim(),qty=row[slot[1]];
      if(!vfNo||vfNo.toUpperCase()==='VF0')return;if(qty===''||qty===null||qty===undefined||qty===0||qty<0)return;
      output.push([dateObj,vendor,vfNo,qty,challanNo]);
    });
  }
  writeToTab_(ss,'RAW_57F4_OUT',['Date','Vendor','VF_No','Qty','57F4_No'],output);
  Logger.log('RAW_57F4_OUT rows: '+output.length);
}

function pullDash57F4In() {
  var srcSS=SpreadsheetApp.openById(SRC_57F4_IN),ss=SpreadsheetApp.openById(DASH_ID);
  var SEC1=[[9,11],[12,14],[15,17],[18,20],[21,23]];
  var SEC2=[[36,38],[39,41],[42,44],[45,47],[48,50]];
  var output=[],srcSheet=srcSS.getSheetByName('Form responses 1');
  if(!srcSheet){Logger.log('TAB NOT FOUND: 57F4 In');return;}
  var data=srcSheet.getDataRange().getValues();
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[2];if(!rawDate)continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    var vendor=(row[3]||'').toString().trim();if(!vendor)continue;
    var vfNo=(row[28]||'').toString().trim();if(!vfNo)vfNo=(row[5]||'').toString().trim();
    if(!vfNo||vfNo.toUpperCase()==='VF0')continue;
    var s2=false;for(var s=0;s<SEC2.length;s++){if((row[SEC2[s][0]]||'').toString().trim()){s2=true;break;}}
    (s2?SEC2:SEC1).forEach(function(slot){
      var f4No=(row[slot[0]]||'').toString().trim(),qty=row[slot[1]];
      if(!f4No)return;if(qty===''||qty===null||qty===undefined||qty===0||qty<0)return;
      output.push([dateObj,vendor,vfNo,f4No,qty]);
    });
  }
  writeToTab_(ss,'RAW_57F4_IN',['Date','Vendor','VF_No','57F4_No','Qty'],output);
  Logger.log('RAW_57F4_IN rows: '+output.length);
}

function pullDashVendorRejection() {
  var srcSS=SpreadsheetApp.openById(SRC_VENDOR_REJ),ss=SpreadsheetApp.openById(DASH_ID);
  var SEC1=[{vfCol:3,rejQtyCol:5,invNoCol:7,rejReasonCol:39,rejMonthCol:8},{vfCol:10,rejQtyCol:15,invNoCol:12,rejReasonCol:40,rejMonthCol:13},{vfCol:17,rejQtyCol:22,invNoCol:19,rejReasonCol:41,rejMonthCol:20},{vfCol:24,rejQtyCol:29,invNoCol:26,rejReasonCol:42,rejMonthCol:27},{vfCol:31,rejQtyCol:36,invNoCol:33,rejReasonCol:43,rejMonthCol:34}];
  var SEC2=[{vfCol:50,rejQtyCol:54,invNoCol:52,rejReasonCol:55,rejMonthCol:53},{vfCol:57,rejQtyCol:61,invNoCol:59,rejReasonCol:62,rejMonthCol:60},{vfCol:64,rejQtyCol:68,invNoCol:66,rejReasonCol:69,rejMonthCol:67},{vfCol:71,rejQtyCol:75,invNoCol:73,rejReasonCol:76,rejMonthCol:74},{vfCol:78,rejQtyCol:82,invNoCol:80,rejReasonCol:83,rejMonthCol:81}];
  var output=[],srcSheet=srcSS.getSheetByName('Form responses 1');
  if(!srcSheet){Logger.log('TAB NOT FOUND: Vendor Rejection');return;}
  var data=srcSheet.getDataRange().getValues();
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[0];if(!rawDate)continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    var vendor=(row[2]||'').toString().trim(),rejType=(row[133]||'').toString().trim();if(!vendor)continue;
    var s2=false;for(var s=0;s<SEC2.length;s++){var v2=(row[SEC2[s].vfCol]||'').toString().trim();if(v2&&v2.toUpperCase()!=='VF0'){s2=true;break;}}
    (s2?SEC2:SEC1).forEach(function(slot){
      var vfNo=(row[slot.vfCol]||'').toString().trim(),rejQty=row[slot.rejQtyCol];
      if(!vfNo||vfNo.toUpperCase()==='VF0')return;if(rejQty===''||rejQty===null||rejQty===undefined||rejQty===0)return;
      output.push([dateObj,vendor,vfNo,rejQty,(row[slot.invNoCol]||'').toString().trim(),(row[slot.rejMonthCol]||'').toString().trim(),(row[slot.rejReasonCol]||'').toString().trim(),rejType]);
    });
  }
  writeToTab_(ss,'RAW_VENDOR_REJECTION',['Submission_Date','Vendor','VF_No','Rejection_Qty','Invoice_DC_No','Rejection_Month','Rejection_Reason','Rejection_Type'],output);
  Logger.log('RAW_VENDOR_REJECTION rows: '+output.length);
}

function pullDashCutting() {
  var srcSS=SpreadsheetApp.openById(SRC_PRODUCTION),ss=SpreadsheetApp.openById(DASH_ID);
  var MACHINES=[{name:'Shearing Machine',vfCol:4,qtyCol:5},{name:'Band Saw No 1',vfCol:7,qtyCol:8},{name:'Band Saw No 2',vfCol:10,qtyCol:11},{name:'Band Saw No 3',vfCol:13,qtyCol:14},{name:'Circular Saw 80',vfCol:16,qtyCol:17},{name:'Circular Saw 100',vfCol:19,qtyCol:20},{name:'HGCKSGW 1',vfCol:22,qtyCol:23},{name:'HGCKSGW 2',vfCol:25,qtyCol:26},{name:'Circular Saw ITL',vfCol:28,qtyCol:29}];
  var output=[],srcSheet=srcSS.getSheetByName('Cutting Response');
  if(!srcSheet){Logger.log('TAB NOT FOUND: Cutting Response');return;}
  var data=srcSheet.getDataRange().getValues();
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[1];if(!rawDate)continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    var shift=(row[3]||'').toString().trim();
    MACHINES.forEach(function(m){
      var vfNo=(row[m.vfCol]||'').toString().trim(),qty=row[m.qtyCol];
      if(!vfNo||vfNo.toUpperCase()==='VF0')return;if(qty===''||qty===null||qty===undefined||qty===0||qty<0)return;
      output.push([dateObj,m.name,shift,vfNo,qty]);
    });
  }
  writeToTab_(ss,'RAW_CUTTING',['Date','Machine','Shift','VF_No','Qty'],output);
  Logger.log('RAW_CUTTING rows: '+output.length);
}

function pullDashPress() {
  var srcSS=SpreadsheetApp.openById(SRC_PRODUCTION),ss=SpreadsheetApp.openById(DASH_ID);
  var SLOTS=[{machine:'2500 Ton Press',prodTypeCol:4,vfCol:5,qtyCol:6,dropQtyCol:54,dropPctCol:55},{machine:'2500 Ton Press',prodTypeCol:8,vfCol:9,qtyCol:10,dropQtyCol:57,dropPctCol:58},{machine:'2500 Ton Press',prodTypeCol:12,vfCol:13,qtyCol:14,dropQtyCol:60,dropPctCol:61},{machine:'1300 Ton Press',prodTypeCol:16,vfCol:17,qtyCol:18,dropQtyCol:63,dropPctCol:64},{machine:'1300 Ton Press',prodTypeCol:20,vfCol:21,qtyCol:22,dropQtyCol:66,dropPctCol:67},{machine:'1300 Ton Press',prodTypeCol:24,vfCol:25,qtyCol:26,dropQtyCol:69,dropPctCol:70},{machine:'800 Ton Screw Press',prodTypeCol:28,vfCol:29,qtyCol:30,dropQtyCol:72,dropPctCol:73},{machine:'800 Ton Screw Press',prodTypeCol:32,vfCol:33,qtyCol:34,dropQtyCol:75,dropPctCol:76},{machine:'800 Ton Screw Press',prodTypeCol:36,vfCol:37,qtyCol:38,dropQtyCol:78,dropPctCol:79},{machine:'1000 Ton Press',prodTypeCol:40,vfCol:41,qtyCol:42,dropQtyCol:81,dropPctCol:82},{machine:'1000 Ton Press',prodTypeCol:44,vfCol:45,qtyCol:46,dropQtyCol:84,dropPctCol:85},{machine:'1000 Ton Press',prodTypeCol:48,vfCol:49,qtyCol:50,dropQtyCol:87,dropPctCol:88}];
  var output=[],srcSheet=srcSS.getSheetByName('Press Shop');
  if(!srcSheet){Logger.log('TAB NOT FOUND: Press Shop');return;}
  var data=srcSheet.getDataRange().getValues();
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[1];if(!rawDate)continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    var shift=(row[2]||'').toString().trim();
    SLOTS.forEach(function(slot){
      var vfNo=(row[slot.vfCol]||'').toString().trim(),qty=row[slot.qtyCol],prodType=(row[slot.prodTypeCol]||'').toString().trim();
      if(!vfNo||vfNo.toUpperCase()==='VF0')return;if(qty===''||qty===null||qty===undefined||qty===0||qty<0)return;
      output.push([dateObj,slot.machine,shift,prodType,vfNo,qty,row[slot.dropQtyCol]||0,row[slot.dropPctCol]||0]);
    });
  }
  writeToTab_(ss,'RAW_PRESS',['Date','Machine','Shift','Prod_Type','VF_No','Qty','Dropout_Qty','Dropout_Pct'],output);
  Logger.log('RAW_PRESS rows: '+output.length);
}

function pullDashForge() {
  var srcSS=SpreadsheetApp.openById(SRC_PRODUCTION),ss=SpreadsheetApp.openById(DASH_ID);
  var SLOTS=[{machine:'Hammer 3 Ton',prodTypeCol:4,vfCol:5,qtyCol:6,dropQtyCol:66,dropPctCol:67},{machine:'Hammer 3 Ton',prodTypeCol:8,vfCol:9,qtyCol:10,dropQtyCol:69,dropPctCol:70},{machine:'Hammer 3 Ton',prodTypeCol:12,vfCol:13,qtyCol:14,dropQtyCol:72,dropPctCol:73},{machine:'Hammer 2 Ton',prodTypeCol:16,vfCol:17,qtyCol:18,dropQtyCol:75,dropPctCol:76},{machine:'Hammer 2 Ton',prodTypeCol:20,vfCol:21,qtyCol:22,dropQtyCol:78,dropPctCol:79},{machine:'Hammer 2 Ton',prodTypeCol:24,vfCol:25,qtyCol:26,dropQtyCol:81,dropPctCol:82},{machine:'Hammer 1.5 Ton',prodTypeCol:28,vfCol:29,qtyCol:30,dropQtyCol:84,dropPctCol:85},{machine:'Hammer 1.5 Ton',prodTypeCol:32,vfCol:33,qtyCol:34,dropQtyCol:87,dropPctCol:88},{machine:'Hammer 1.5 Ton',prodTypeCol:36,vfCol:37,qtyCol:38,dropQtyCol:90,dropPctCol:91},{machine:'Hammer 1 Ton Old',prodTypeCol:40,vfCol:41,qtyCol:42,dropQtyCol:93,dropPctCol:94},{machine:'Hammer 1 Ton Old',prodTypeCol:44,vfCol:45,qtyCol:46,dropQtyCol:96,dropPctCol:97},{machine:'Hammer 1 Ton Old',prodTypeCol:48,vfCol:49,qtyCol:50,dropQtyCol:99,dropPctCol:100},{machine:'Hammer 1 Ton New',prodTypeCol:52,vfCol:53,qtyCol:54,dropQtyCol:102,dropPctCol:103},{machine:'Hammer 1 Ton New',prodTypeCol:56,vfCol:57,qtyCol:58,dropQtyCol:105,dropPctCol:106},{machine:'Hammer 1 Ton New',prodTypeCol:60,vfCol:61,qtyCol:62,dropQtyCol:108,dropPctCol:109}];
  var output=[],srcSheet=srcSS.getSheetByName('Forge Shop');
  if(!srcSheet){Logger.log('TAB NOT FOUND: Forge Shop');return;}
  var data=srcSheet.getDataRange().getValues();
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[1];if(!rawDate)continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    var shift=(row[2]||'').toString().trim();
    SLOTS.forEach(function(slot){
      var vfNo=(row[slot.vfCol]||'').toString().trim(),qty=row[slot.qtyCol],prodType=(row[slot.prodTypeCol]||'').toString().trim();
      if(!vfNo||vfNo.toUpperCase()==='VF0')return;if(qty===''||qty===null||qty===undefined||qty===0||qty<0)return;
      output.push([dateObj,slot.machine,shift,prodType,vfNo,qty,row[slot.dropQtyCol]||0,row[slot.dropPctCol]||0]);
    });
  }
  writeToTab_(ss,'RAW_FORGE',['Date','Machine','Shift','Prod_Type','VF_No','Qty','Dropout_Qty','Dropout_Pct'],output);
  Logger.log('RAW_FORGE rows: '+output.length);
}

function pullDashHT() {
  var srcSS=SpreadsheetApp.openById(SRC_PRODUCTION),ss=SpreadsheetApp.openById(DASH_ID);
  var FURNACES=[{name:'Oil Fired Furnace 01',qtyCol:4},{name:'Oil Fired Furnace 02',qtyCol:6},{name:'Continuous HT Furnace',qtyCol:8},{name:'Continuous ISO Thermal Annealing Furnace',qtyCol:10}];
  var output=[],srcSheet=srcSS.getSheetByName('HT Shop');
  if(!srcSheet){Logger.log('TAB NOT FOUND: HT Shop');return;}
  var data=srcSheet.getDataRange().getValues();
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[1];if(!rawDate)continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    var shift=(row[2]||'').toString().trim();
    FURNACES.forEach(function(f){var qty=row[f.qtyCol];if(qty===''||qty===null||qty===undefined||qty===0||qty<0)return;output.push([dateObj,f.name,shift,qty]);});
  }
  writeToTab_(ss,'RAW_HT',['Date','Furnace','Shift','Qty'],output);
  Logger.log('RAW_HT rows: '+output.length);
}

function pullDashFinal() {
  var srcSS=SpreadsheetApp.openById(SRC_PRODUCTION),ss=SpreadsheetApp.openById(DASH_ID);
  var SLOTS=[{process:'Shot Blasting',vfCol:4,qtyCol:5},{process:'Shot Blasting',vfCol:6,qtyCol:7},{process:'Shot Blasting',vfCol:8,qtyCol:9},{process:'Shot Blasting',vfCol:10,qtyCol:11},{process:'Shot Blasting',vfCol:12,qtyCol:13},{process:'Shot Blasting',vfCol:14,qtyCol:15},{process:'Shot Blasting',vfCol:16,qtyCol:17},{process:'Shot Blasting',vfCol:18,qtyCol:19},{process:'Shot Blasting',vfCol:20,qtyCol:21},{process:'Shot Blasting',vfCol:22,qtyCol:23},{process:'Shot Blasting',vfCol:24,qtyCol:25},{process:'Shot Blasting',vfCol:26,qtyCol:27},{process:'Shot Blasting',vfCol:28,qtyCol:29},{process:'Shot Blasting',vfCol:30,qtyCol:31},{process:'Shot Blasting',vfCol:32,qtyCol:33},{process:'Grinding',vfCol:36,qtyCol:37},{process:'Grinding',vfCol:38,qtyCol:39},{process:'Grinding',vfCol:40,qtyCol:41},{process:'Grinding',vfCol:42,qtyCol:43},{process:'Grinding',vfCol:44,qtyCol:45},{process:'Grinding',vfCol:46,qtyCol:47},{process:'Grinding',vfCol:48,qtyCol:49},{process:'Grinding',vfCol:50,qtyCol:51},{process:'Grinding',vfCol:52,qtyCol:53},{process:'Grinding',vfCol:54,qtyCol:55},{process:'MPI',vfCol:58,qtyCol:59},{process:'MPI',vfCol:60,qtyCol:61},{process:'MPI',vfCol:62,qtyCol:63},{process:'MPI',vfCol:64,qtyCol:65},{process:'MPI',vfCol:66,qtyCol:67},{process:'MPI',vfCol:68,qtyCol:69},{process:'MPI',vfCol:70,qtyCol:71},{process:'MPI',vfCol:72,qtyCol:73},{process:'MPI',vfCol:74,qtyCol:75},{process:'MPI',vfCol:76,qtyCol:77}];
  var output=[],srcSheet=srcSS.getSheetByName('Final Shop');
  if(!srcSheet){Logger.log('TAB NOT FOUND: Final Shop');return;}
  var data=srcSheet.getDataRange().getValues();
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[1];if(!rawDate)continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    var shift=(row[2]||'').toString().trim();
    SLOTS.forEach(function(slot){var vfNo=(row[slot.vfCol]||'').toString().trim(),qty=row[slot.qtyCol];if(!vfNo||vfNo.toUpperCase()==='VF0')return;if(qty===''||qty===null||qty===undefined||qty===0||qty<0)return;output.push([dateObj,slot.process,shift,vfNo,qty]);});
  }
  writeToTab_(ss,'RAW_FINAL',['Date','Process','Shift','VF_No','Qty'],output);
  Logger.log('RAW_FINAL rows: '+output.length);
}

function pullDashMachine() {
  var srcSS=SpreadsheetApp.openById(SRC_MACHINE),ss=SpreadsheetApp.openById(DASH_ID);
  // CORRECTED column mapping (0-indexed) — verified against actual xlsx structure
  // Each machine has 2 VF slots per 2-hour entry period
  // Shift col[2] format: "1) 07:00AM-09:00AM 1ST" → normaliseShift_ handles 1ST/2ND/3RD suffix
  var MACHINES=[
    {machine:'Facing & Centering 1', slots:[{vf:5, qty:6},{vf:7, qty:8}],   process:null},
    {machine:'Facing & Centering 2', slots:[{vf:12,qty:13},{vf:14,qty:15}],  process:null},
    {machine:'Lathe P/T',            slots:[{vf:19,qty:20},{vf:21,qty:22}],  process:null},
    {machine:'SPM',                  slots:[{vf:26,qty:27},{vf:28,qty:29}],  process:null},
    {machine:'CNC 01', slots:[{vf:33,qty:35,pr:34},{vf:36,qty:38,pr:37}]},
    {machine:'CNC 02', slots:[{vf:42,qty:44,pr:43},{vf:45,qty:47,pr:46}]},
    {machine:'CNC 03', slots:[{vf:51,qty:53,pr:52},{vf:54,qty:56,pr:55}]},
    {machine:'CNC 04', slots:[{vf:60,qty:62,pr:61},{vf:63,qty:65,pr:64}]},
    {machine:'CNC 05', slots:[{vf:69,qty:71,pr:70},{vf:72,qty:74,pr:73}]},
    {machine:'Hobbing 1', slots:[{vf:78,qty:79},{vf:80,qty:81}],  process:null},
    {machine:'Hobbing 2', slots:[{vf:85,qty:86},{vf:87,qty:88}],  process:null},
    {machine:'Hobbing 3', slots:[{vf:92,qty:93},{vf:94,qty:95}],  process:null},
    {machine:'Hobbing 4', slots:[{vf:99,qty:100},{vf:101,qty:102}], process:null},
    {machine:'Hobbing 5', slots:[{vf:106,qty:107},{vf:108,qty:109}], process:null},
    {machine:'Hobbing 6', slots:[{vf:113,qty:114},{vf:115,qty:116}], process:null},
    {machine:'Hobbing 7', slots:[{vf:120,qty:121},{vf:122,qty:123}], process:null},
    {machine:'Hobbing 8', slots:[{vf:127,qty:128},{vf:129,qty:130}], process:null}
  ];
  var output=[],srcSheet=srcSS.getSheetByName('Machine Shop Responses');
  if(!srcSheet){Logger.log('TAB NOT FOUND: Machine Shop Responses');return;}
  var data=srcSheet.getDataRange().getValues();
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[1];if(!rawDate)continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    // Normalise shift here so RAW_MACHINE stores clean shift names
    var shiftRaw=(row[2]||'').toString().trim();
    var shift=normaliseShift_(shiftRaw);
    MACHINES.forEach(function(m){
      m.slots.forEach(function(sl){
        var vfRaw=(row[sl.vf]||'').toString().trim();
        if(!vfRaw||vfRaw==='0'||vfRaw.toLowerCase()==='nan')return;
        // VF stored as number in sheet — prefix VF if numeric
        var vfNo=(!isNaN(vfRaw)&&vfRaw!=='')?'VF'+parseInt(vfRaw):vfRaw;
        // Skip non-VF entries like "OK", "First Side", "Second Side", "NO LOAD", "NO OPERATER"
        var vfUp=vfNo.toUpperCase();
        if(!vfUp.match(/^VF\d+/))return;
        var qty=Number(row[sl.qty])||0;
        if(qty<=0)return;
        var process=sl.pr!==undefined?(row[sl.pr]||'').toString().trim():'';
        output.push([dateObj,m.machine,shift,process,vfNo,qty]);
      });
    });
  }
  writeToTab_(ss,'RAW_MACHINE',['Date','Machine','Shift','Process','VF_No','Qty'],output);
  Logger.log('RAW_MACHINE rows: '+output.length);
}
function pullDashElectricity() {
  var srcSS = SpreadsheetApp.openById(SRC_ELEC_OIL), ss = SpreadsheetApp.openById(DASH_ID);
  var output = [];
  
  var sh1 = srcSS.getSheetByName('Electricity 24Hrs / Day') || srcSS.getSheetByName('Electricity Consumption');
  if (!sh1) { Logger.log('TAB NOT FOUND: Electricity 24Hrs / Day'); return; }
  
  var data = sh1.getDataRange().getValues();
  var headers = data[0]; 

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var rawDate = row[1];
    if (!rawDate) continue;
    var dateObj = (rawDate instanceof Date) ? rawDate : new Date(rawDate);
    if (isNaN(dateObj.getTime()) || !inFY_(dateObj)) continue;
    
    var shift = (row[2] && row[2].toString().indexOf('Shift') > -1) ? row[2].toString().trim() : '24Hrs';
    
    for (var c = 3; c < headers.length; c++) {
      var meterName = (headers[c] || '').toString().trim();
      var reading = row[c];
      
      meterName = meterName.replace(/^\d+\s+/, '').trim();
      
      // --- NEW FILTERS (skip blanks, zeros, totals) ---
      if (!meterName || meterName === 'Column 2' || meterName.indexOf('Total') > -1) continue;
      var numReading = parseFloat(reading);
      if (isNaN(numReading) || numReading <= 0) continue;
      // ------------------------------------------------
      
      output.push([dateObj, shift, meterName, numReading, 'Daily Actual']);
    }
  }
  
  writeToTab_(ss, 'RAW_ELECTRICITY', ['Date','Shift','Meter','Reading','Source'], output);
  Logger.log('RAW_ELECTRICITY rows: ' + output.length);
}
function pullDashOil() {
  var srcSS = SpreadsheetApp.openById(SRC_ELEC_OIL), ss = SpreadsheetApp.openById(DASH_ID);
  var output = [];
  var srcSheet = srcSS.getSheetByName('Oil Consumption');
  if (!srcSheet) return;
  
  var data = srcSheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    var row = data[r], rawDate = row[1]; // Col B is Date
    if (!rawDate) continue;
    var dateObj = (rawDate instanceof Date) ? rawDate : new Date(rawDate);
    if (isNaN(dateObj.getTime()) || !inFY_(dateObj)) continue;
    
    var shift = (row[2]||'').toString().trim();
    var forgeVal = cleanNum_(row[4]); // Col E
    var htVal = cleanNum_(row[5]);    // Col F
    var zycVal = cleanNum_(row[6]);   // Col G
    
    if (forgeVal === 0 && htVal === 0 && zycVal === 0) continue;
    
    output.push([dateObj, shift, forgeVal, htVal, zycVal]);
  }
  
  writeToTab_(ss, 'RAW_OIL', ['Date','Shift','Forge_Litres','HT_Litres','Zycril_Mixing'], output);
}
  
function pullDashDieselVehicle() {
  var srcSS=SpreadsheetApp.openById(SRC_DIESEL_VEHICLE),ss=SpreadsheetApp.openById(DASH_ID);
  var output=[],srcSheet=srcSS.getSheetByName('Approved Refill Entries');
  if(!srcSheet){Logger.log('TAB NOT FOUND: Approved Refill Entries');return;}
  var data=srcSheet.getDataRange().getValues();
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[2];if(!rawDate)continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    var litres=row[16];if(!litres||litres===0)continue;
    var km=(row[20]!==''&&row[20]!==null&&row[20]!==undefined)?row[20]:row[7];
    var payment=(row[28]!==''&&row[28]!==null&&row[28]!==undefined)?(row[28]||'').toString().trim():(row[17]||'').toString().trim();
    output.push([dateObj,(row[5]||'').toString().trim(),(row[6]||'').toString().trim(),(row[4]||'').toString().trim(),(row[13]||'').toString().trim(),litres,row[15]||0,km,payment]);
  }
  writeToTab_(ss,'RAW_DIESEL_VEHICLE',['Date','Vehicle_Name','Vehicle_No','Driver','Pump','Litres','Amount_Rs','KM_Reading','Mode_Of_Payment'],output);
  Logger.log('RAW_DIESEL_VEHICLE rows: '+output.length);
}

function pullDashDieselPlant() {
  var srcSS=SpreadsheetApp.openById(SRC_DIESEL_PLANT),ss=SpreadsheetApp.openById(DASH_ID);
  var output=[],srcSheet=srcSS.getSheetByName('Form responses 1');
  if(!srcSheet){Logger.log('TAB NOT FOUND: Diesel Plant');return;}
  var data=srcSheet.getDataRange().getValues();
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[2];if(!rawDate)continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    var litres=row[13];if(!litres||litres===0)continue;
    var payment=(row[21]!==''&&row[21]!==null&&row[21]!==undefined)?(row[21]||'').toString().trim():(row[14]||'').toString().trim();
    output.push([dateObj,(row[5]||'').toString().trim(),(row[3]||'').toString().trim(),(row[10]||'').toString().trim(),litres,row[12]||0,payment]);
  }
  writeToTab_(ss,'RAW_DIESEL_PLANT',['Date','Vehicle_Name','Driver','Pump','Litres','Amount_Rs','Mode_Of_Payment'],output);
  Logger.log('RAW_DIESEL_PLANT rows: '+output.length);
}

// ── ITEM 3: DOWNTIME FORM PULL ────────────────────────────────────────────────
// Reads the VFPL Downtime form response sheet (SRC_DOWNTIME) into RAW_DOWNTIME.
// Skip gracefully when SRC_DOWNTIME is empty (form not yet created / ID not set).
// Column map matches createDowntimeForm_() field order:
//   [0] Timestamp  [1] Department  [2] Date  [3] Shift  [4] Machine
//   [5] Start Time [6] End Time    [7] Category  [8] Description
function pullDashDowntime() {
  if (!SRC_DOWNTIME) {
    Logger.log('pullDashDowntime: SRC_DOWNTIME not set — run createDowntimeForm_() first');
    return;
  }
  var srcSS = SpreadsheetApp.openById(SRC_DOWNTIME);
  var ss    = SpreadsheetApp.openById(DASH_ID);
  // Form responses go to a sheet named "Form Responses 1" (Google default)
  var srcSheet = srcSS.getSheets()[0];
  if (!srcSheet) { Logger.log('pullDashDowntime: no sheets in SRC_DOWNTIME'); return; }
  var data = srcSheet.getDataRange().getValues();
  var output = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var rawDate = row[2]; // Date field
    if (!rawDate) continue;
    var dateObj = (rawDate instanceof Date) ? rawDate : new Date(rawDate);
    if (isNaN(dateObj.getTime()) || !inFY_(dateObj)) continue;
    var dept     = (row[1] || '').toString().trim();
    var shift    = (row[3] || '').toString().trim();
    var machine  = (row[4] || '').toString().trim();
    var startRaw = row[5]; // time object or string
    var endRaw   = row[6];
    // Compute duration in minutes
    var startMin = NaN, endMin = NaN;
    if (startRaw instanceof Date) startMin = startRaw.getHours()*60 + startRaw.getMinutes();
    if (endRaw   instanceof Date) endMin   = endRaw.getHours()*60   + endRaw.getMinutes();
    var durationMin = (!isNaN(startMin) && !isNaN(endMin))
      ? (endMin >= startMin ? endMin - startMin : (1440 - startMin + endMin))
      : 0;
    var category = (row[7] || '').toString().trim();
    var desc     = (row[8] || '').toString().trim();
    output.push([dateObj, dept, shift, machine, startRaw, endRaw, durationMin, category, desc]);
  }
  writeToTab_(ss, 'RAW_DOWNTIME',
    ['Date','Department','Shift','Machine','Start_Time','End_Time','Duration_Min','Category','Description'],
    output);
  Logger.log('RAW_DOWNTIME rows: ' + output.length);
}

// Aggregates RAW_DOWNTIME into a summary object for the dashboard payload.
// Returns { byDept: [...], byCategory: [...], mtdHours: X, ytdHours: Y }
function buildDowntimeSummary_() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('RAW_DOWNTIME');
  if (!sh || sh.getLastRow() < 2) return { byDept: [], byCategory: [], mtdHours: 0, ytdHours: 0 };

  var data = sh.getDataRange().getValues();
  var headers = data[0]; // Date,Department,Shift,Machine,Start,End,Duration_Min,Category,Description
  var now = new Date();
  var curMonth = now.getMonth();
  var curYear  = now.getFullYear();

  var deptMap = {}, catMap = {}, mtdMin = 0, ytdMin = 0;

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var dateObj = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (isNaN(dateObj.getTime())) continue;
    var dept = (row[1] || 'Other').toString().trim() || 'Other';
    var cat  = (row[7] || 'Other').toString().trim() || 'Other';
    var mins = Number(row[6]) || 0;
    var isMTD = (dateObj.getMonth() === curMonth && dateObj.getFullYear() === curYear);

    deptMap[dept] = (deptMap[dept] || 0) + mins;
    catMap[cat]   = (catMap[cat]   || 0) + mins;
    ytdMin += mins;
    if (isMTD) mtdMin += mins;
  }

  var byDept = Object.keys(deptMap).sort(function(a,b){ return deptMap[b]-deptMap[a]; })
    .map(function(d){ return { dept: d, ytdHours: Math.round(deptMap[d]/6)/10 }; });
  var byCat = Object.keys(catMap).sort(function(a,b){ return catMap[b]-catMap[a]; })
    .map(function(c){ return { category: c, ytdHours: Math.round(catMap[c]/6)/10 }; });

  return {
    byDept:   byDept,
    byCategory: byCat,
    mtdHours: Math.round(mtdMin/6)/10,
    ytdHours: Math.round(ytdMin/6)/10
  };
}

function pullDashManpowerStaff() {
  var srcSS = SpreadsheetApp.openById(SRC_MANPOWER_DAILY);
  var ss    = SpreadsheetApp.openById(DASH_ID);
  var DEPTS = [
    {name:'Forge Shop',   staffCol:4,  workerCol:5,  operatorCol:6},
    {name:'Press Shop',   staffCol:8,  workerCol:9,  operatorCol:10},
    {name:'HT Shop',      staffCol:12, workerCol:13, operatorCol:14},
    {name:'Die Shop',     staffCol:16, workerCol:17, operatorCol:18},
    {name:'Cutting Shop', staffCol:20, workerCol:21, operatorCol:22},
    {name:'Final Shop',   staffCol:24, workerCol:25, operatorCol:26},
    {name:'Machine Shop', staffCol:28, workerCol:29, operatorCol:30},
    {name:'Maint Dept',   staffCol:32, workerCol:33, operatorCol:34},
    {name:'Store',        staffCol:36, workerCol:37, operatorCol:38},
    {name:'Office',       staffCol:40, workerCol:41, operatorCol:42}
  ];
  var srcSheet = srcSS.getSheetByName('Form responses 1');
  if (!srcSheet) { Logger.log('TAB NOT FOUND: Manpower Daily'); return; }
  var data = srcSheet.getDataRange().getValues();
  // Dedup: key = "dateStr|shift|deptName" — last row wins (most recent resubmission)
  var seen = {}, order = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r], rawDate = row[0];
    if (!rawDate) continue;
    var dateObj = (rawDate instanceof Date) ? rawDate : new Date(rawDate);
    if (isNaN(dateObj.getTime()) || !inFY_(dateObj)) continue;
    var shift   = (row[2] || '').toString().trim();
    var dateStr = Utilities.formatDate(dateObj, 'Asia/Kolkata', 'yyyy-MM-dd');
    DEPTS.forEach(function(dept) {
      var staff = row[dept.staffCol] || 0, worker = row[dept.workerCol] || 0, operator = row[dept.operatorCol] || 0;
      if (!staff && !worker && !operator) return;
      var key = dateStr + '|' + shift + '|' + dept.name;
      if (!seen[key]) order.push(key);
      seen[key] = [dateObj, shift, dept.name, staff || 0, worker || 0, operator || 0];
    });
  }
  var output = order.map(function(k) { return seen[k]; });
  writeToTab_(ss, 'RAW_MANPOWER_STAFF', ['Date','Shift','Department','Staff','Worker','Operator'], output);
  Logger.log('RAW_MANPOWER_STAFF rows: ' + output.length + ' (deduped from ' + (data.length - 1) + ' source rows)');
}

function pullDashManpowerContract() {
  var srcSS = SpreadsheetApp.openById(SRC_MANPOWER_CONTRACT);
  var ss    = SpreadsheetApp.openById(DASH_ID);
  var RATES = {
    'Cutting Shop|Casual/Helper':570,'Cutting Shop|Bandsaw Operator':800,
    'Cutting Shop|Circularsaw Operator':800,'Die Shop|Casual/Helper':570,
    'Die Shop|Welder':0,'Final Shop|Casual/Helper':570,'Final Shop|Driver':690,
    'Final Shop|Grinder':640,'Final Shop|Quality':0,
    'Final Shop|Shot Blasting Operator':800,'Forge Shop|Forger':900,
    'Forge Shop|Furnaceman':800,'Forge Shop|Helper Forge Shop':570,
    'Forge Shop|Oilman':800,'Forge Shop|Quality':0,'Forge Shop|Ropeman':800,
    'Forge Shop|Trimmer':850,'Heat Treatment|HT Helper':570,
    'Heat Treatment|Supervisor':864,'Heat Treatment|Hardness Tester':0,
    'Housekeeping|Casual/Helper':570,'HR|Security':576,'HR|STP Operator':550,
    'Machine Shop|CNC Operator':740,'Machine Shop|Casual/Helper':570,
    'Machine Shop|Facing Centring Operator':0,'Machine Shop|Hobbing Operator':800,
    'Machine Shop|Quality':0,'Maintenance|Casual/Helper':570,
    'Maintenance|Electrician':0,'Maintenance|Fitter':740,'Maintenance|Welder':900,
    'Press Shop|Forger':1000,'Press Shop|Helper Press Shop':570,
    'Press Shop|Oilman':900,'Press Shop|Quality Inspector':740,
    'Press Shop|Trimmer':850,'Stores|Casual/Helper':570,
    'VMC Shop|Casual/Helper':570,'VMC Shop|VMC Operator':740
  };
  var ENTRIES = [
    {dept:'Cutting Shop',   category:'Bandsaw Operator',         col:4},
    {dept:'Cutting Shop',   category:'Circularsaw Operator',     col:5},
    {dept:'Cutting Shop',   category:'Casual/Helper',            col:6},
    {dept:'Die Shop',       category:'Casual/Helper',            col:8},
    {dept:'Die Shop',       category:'Welder',                   col:9},
    {dept:'Final Shop',     category:'Casual/Helper',            col:11},
    {dept:'Final Shop',     category:'Driver',                   col:12},
    {dept:'Final Shop',     category:'Grinder',                  col:13},
    {dept:'Final Shop',     category:'Quality',                  col:14},
    {dept:'Final Shop',     category:'Shot Blasting Operator',   col:15},
    {dept:'Forge Shop',     category:'Forger',                   col:17},
    {dept:'Forge Shop',     category:'Furnaceman',               col:18},
    {dept:'Forge Shop',     category:'Helper Forge Shop',        col:19},
    {dept:'Forge Shop',     category:'Oilman',                   col:20},
    {dept:'Forge Shop',     category:'Quality',                  col:21},
    {dept:'Forge Shop',     category:'Ropeman',                  col:22},
    {dept:'Forge Shop',     category:'Trimmer',                  col:23},
    {dept:'Heat Treatment', category:'HT Helper',                col:25},
    {dept:'Heat Treatment', category:'Supervisor',               col:26},
    {dept:'Heat Treatment', category:'Hardness Tester',          col:27},
    {dept:'Housekeeping',   category:'Casual/Helper',            col:29},
    {dept:'HR',             category:'Security',                 col:31},
    {dept:'HR',             category:'STP Operator',             col:32},
    {dept:'Machine Shop',   category:'CNC Operator',             col:34},
    {dept:'Machine Shop',   category:'Casual/Helper',            col:35},
    {dept:'Machine Shop',   category:'Facing Centring Operator', col:36},
    {dept:'Machine Shop',   category:'Hobbing Operator',         col:37},
    {dept:'Machine Shop',   category:'Quality',                  col:38},
    {dept:'Maintenance',    category:'Casual/Helper',            col:40},
    {dept:'Maintenance',    category:'Electrician',              col:41},
    {dept:'Maintenance',    category:'Fitter',                   col:42},
    {dept:'Maintenance',    category:'Welder',                   col:43},
    {dept:'Press Shop',     category:'Forger',                   col:45},
    {dept:'Press Shop',     category:'Helper Press Shop',        col:46},
    {dept:'Press Shop',     category:'Oilman',                   col:47},
    {dept:'Press Shop',     category:'Quality Inspector',        col:48},
    {dept:'Press Shop',     category:'Trimmer',                  col:49},
    {dept:'Stores',         category:'Casual/Helper',            col:51},
    {dept:'VMC Shop',       category:'Casual/Helper',            col:53},
    {dept:'VMC Shop',       category:'VMC Operator',             col:54}
  ];
  var srcSheet = srcSS.getSheetByName('Form responses 1');
  if (!srcSheet) { Logger.log('TAB NOT FOUND: Contract Manpower'); return; }
  var data = srcSheet.getDataRange().getValues();
  // Dedup: key = "dateStr|shift|dept|category" — last row wins
  var seen = {}, order = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r], rawDate = row[1]; // col B = date for contract form
    if (!rawDate) continue;
    var dateObj = (rawDate instanceof Date) ? rawDate : new Date(rawDate);
    if (isNaN(dateObj.getTime()) || !inFY_(dateObj)) continue;
    var shift   = (row[2] || '').toString().trim();
    var dateStr = Utilities.formatDate(dateObj, 'Asia/Kolkata', 'yyyy-MM-dd');
    ENTRIES.forEach(function(entry) {
      var headCount = row[entry.col];
      if (!headCount || headCount === 0) return;
      var rate = RATES[entry.dept + '|' + entry.category] || 0;
      var key  = dateStr + '|' + shift + '|' + entry.dept + '|' + entry.category;
      if (!seen[key]) order.push(key);
      seen[key] = [dateObj, shift, entry.dept, entry.category,
                   headCount, rate, Number(headCount) * rate];
    });
  }
  var output = order.map(function(k) { return seen[k]; });
  writeToTab_(ss, 'RAW_MANPOWER_CONTRACT',
    ['Date','Shift','Department','Category','Head_Count','Rate_Per_Day','Cost_Rs'], output);
  Logger.log('RAW_MANPOWER_CONTRACT rows: ' + output.length + ' (deduped from ' + (data.length - 1) + ' source rows)');
}
function pullDashSchedule() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var srcSS = SpreadsheetApp.openById(SRC_SCHEDULE);
  var sheet = srcSS.getSheetByName('VF Schedule'); 
  
  if (!sheet) {
    Logger.log('FAIL: "VF Schedule" tab not found in source.');
    return;
  }
  
  // 1. Load the Master Parts Brain right away
  var partsMap = loadPartsMap_(ss);
  
  var data = sheet.getDataRange().getValues();
  var output = [];
  
  for (var r = 1; r < data.length; r++) {
    // 2. Read the Form (Skipping Col A Timestamp)
    var vf = (data[r][1] || '').toString().trim();    // Col B: VF
    var qty = cleanNum_(data[r][2]);                  // Col C: Qty
    var month = (data[r][3] || '').toString().trim(); // Col D: Month
    
    if (!vf || vf.toUpperCase() === 'VF0' || vf === 'VF_No' || qty === 0) continue;
    
    // 3. Lookup Facts from Master Data
    var part = partsMap[vf] || { finWt: 0, inputWt: 0, unitPrice: 0 };
    var schedTons = (qty * part.finWt) / 1000;
    var turnover  = qty * part.unitPrice;
    
    // 4. Push ALL 7 columns
    output.push([
      vf, 
      qty, 
      month, 
      part.finWt, 
      schedTons, 
      part.unitPrice, 
      turnover
    ]); 
  }
  
  // 5. Write everything to RAW_SCHEDULE
  var headers = ['VF_No', 'Quantity', 'Month', 'Finish_Wt', 'Schedule_Tons', 'Unit_Price', 'Schedule_Turnover'];
  writeToTab_(ss, 'RAW_SCHEDULE', headers, output);
  Logger.log('✅ RAW_SCHEDULE pulled: ' + output.length + ' rows with FULL Master Data.');
}
function pullDashParts() {
  var srcSS=SpreadsheetApp.openById(SRC_PARTS),ss=SpreadsheetApp.openById(DASH_ID);
  var srcSheet=srcSS.getSheetByName('Master');
  if(!srcSheet){Logger.log('TAB NOT FOUND: Master');return;}
  var data=srcSheet.getDataRange().getValues(),headers=data[0],output=[];
  for(var r=1;r<data.length;r++){if(!(data[r][0]||'').toString().trim())continue;output.push(data[r]);}
  var tgt=ss.getSheetByName('RAW_PARTS');if(!tgt)tgt=ss.insertSheet('RAW_PARTS');
  tgt.clearContents();tgt.clearFormats();
  tgt.getRange(2,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
  if(output.length>0)tgt.getRange(3,1,output.length,headers.length).setValues(output);
  tgt.autoResizeColumns(1,headers.length);
  Logger.log('RAW_PARTS rows: '+output.length);
}
function calcRMConsumption() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var cutSh = ss.getSheetByName('RAW_CUTTING');
  var partsSh = ss.getSheetByName('RAW_PARTS');
  
  if(!cutSh || !partsSh) {
    Logger.log('calcRMConsumption: missing tabs');
    return;
  }
  
  var cutData = cutSh.getDataRange().getValues();
  var partsData = partsSh.getDataRange().getValues();
  var partsMap = {};
  
  // 1. Build Parts Map (Extracting Input Weight and Grade)
  for(var p = 2; p < partsData.length; p++){
    var pr = partsData[p];
    var pvf = (pr[1] || '').toString().trim();
    if(!pvf) continue;
    
    partsMap[pvf] = {
      inputWt: cleanNum_(pr[5]), 
      grade: (pr[11] || '').toString().trim()
    };
  }
  
  var rows = [];
  
  // 2. Process Cutting Data & Normalize Grades
  for(var c = 2; c < cutData.length; c++){
    var cr = cutData[c];
    var vf = (cr[3] || '').toString().trim();
    var qty = cleanNum_(cr[4]);
    
    if(!vf || qty === 0) continue;
    
    var dt = (cr[0] instanceof Date) ? cr[0] : new Date(cr[0]);
    var part = partsMap[vf] || {inputWt: 0, grade: 'UNKNOWN'};
    var mon = (!isNaN(dt.getTime())) ? MONTH_NAMES_[dt.getMonth()] : '';
    
    // --- 🚨 ALIAS INJECTION: Normalizing the Grade ---
    var normalizedGrade = normalizeGrade_(part.grade);
    
    var totalConsumption = part.inputWt * qty;
    
    rows.push([
      dt,                 // Cutting_Date
      cr[2],              // Shift
      vf,                 // VF_No
      qty,                // Quantity
      normalizedGrade,    // Grade (Normalized!)
      mon,                // Month
      part.inputWt,       // Input_Weight_Per_Pc
      totalConsumption    // Total_Consumption_kg
    ]);
  }
  
  writeToTab_(ss, 'RM_CONSUMPTION', ['Cutting_Date','Shift','VF_No','Quantity','Grade','Month','Input_Weight_Per_Pc','Total_Consumption_kg'], rows);
  Logger.log('✅ RM_CONSUMPTION complete: ' + rows.length + ' rows processed with normalized grades.');
}

function pullDashOilInward() {
  var srcSS=SpreadsheetApp.openById(SRC_OIL_INWARD),ss=SpreadsheetApp.openById(DASH_ID);
  var srcSheet=srcSS.getSheetByName('Form responses 1');
  if(!srcSheet){Logger.log('TAB NOT FOUND: Oil Inward');return;}
  var data=srcSheet.getDataRange().getValues(),output=[];
  for(var r=1;r<data.length;r++){
    var row=data[r],rawDate=row[2];if(!rawDate)continue;
    var dateObj=(rawDate instanceof Date)?rawDate:new Date(rawDate);
    if(isNaN(dateObj.getTime())||!inFY_(dateObj))continue;
    var supplier=(row[3]||'').toString().trim(),oilDesc=(row[6]||'').toString().trim();
    if(!supplier&&!oilDesc)continue;
    output.push([dateObj,supplier,(row[4]||'').toString().trim(),oilDesc,(row[25]||'').toString().trim(),cleanNum_(row[27]),cleanNum_(row[29]),cleanNum_(row[31]),getFY_(dateObj),MONTH_NAMES_[dateObj.getMonth()]]);
  }
  writeToTab_(ss,'RAW_OIL_INWARD',['Date','Supplier','DC_No','Oil_Description','Invoice_No','Bill_Qty_kg','Rate_Per_kg','Qty_Received_Litres','FY','Month'],output);
  Logger.log('RAW_OIL_INWARD rows: '+output.length);
}


// ════════════════════════════════════════════════════════════
// ANALYTICS — VFPL_Final_v3 (Daily Overview, Monthly, WIP, Schedule, FY Monthly)
// ════════════════════════════════════════════════════════════

// ============================================================
// VFPL — DAILY OVERVIEW v3 + PRODUCTION_MONTHLY + WIP_SUMMARY
// Version: 3.0  |  Date: Apr-2026
// Dashboard Sheet ID: 1GHdhrRtOhQFshsAOCK4n3GiJp-6a03k8bn0V_M04wSY
//
// HOW TO DEPLOY:
//   1. Open FY 2026-27 Dashboard Sheet → Extensions → Apps Script
//   2. Open your "DailyOverview_Monthly" file → Select All → Replace with this
//   3. Save.
//   4. Verify by running runDashboardPull() from the Apps Script dropdown.
//
// TABS WRITTEN:
//   Daily Overview      — Today (shift-wise) + Yesterday (shift-wise), all depts
//   PRODUCTION_MONTHLY  — All depts consolidated, machine × day, Inhouse/JWK, daily tons
//   WIP_SUMMARY         — VF level: Cut MTD | Forge MTD | Press MTD | Cut WIP | FG WIP | Dispatched | Closing WIP
//
// TABS DELETED ON EACH RUN:
//   CUT_MONTHLY | FORGE_MONTHLY | PRESS_MONTHLY | MACHINE_MONTHLY | PARTWISE_MONTHLY
//
// NOTE: DASH_ID is declared in your main script. Do not redeclare here.

// ================================================================
// If historical data in an already-closed month is ever corrected (a
// supervisor fixes a past entry, a source sheet gets a backdated
// correction), buildFYMonthly() would otherwise keep serving the stale
// cached total for that month forever, since closed months are no longer
// rescanned by default. Run this by hand from the Apps Script editor
// after any correction to past-month data, then run buildFYMonthly()
// again to rebuild everything fresh.
function clearFYMonthlyCache_() {
  PropertiesService.getScriptProperties().deleteProperty('FY_MONTHLY_CLOSED_MONTHS_CACHE');
  Logger.log('✅ FY_MONTHLY closed-month cache cleared. Next buildFYMonthly() run will rescan all months in full.');
}

function buildFYMonthly() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var FY_MONTHS = ['April','May','June','July','August','September',
                   'October','November','December','January','February','March'];
  var MONTH_CAL = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];

  function getMonthName_(d) {
    var dt = (d instanceof Date) ? d : parseDate_(d);
    if (!dt) return null;
    return MONTH_CAL[dt.getMonth()];
  }

  // ── INCREMENTAL: skip rescanning months that are already closed and
  // cached. NOTE on scope: this cuts the CPU/compute cost of buildFYMonthly
  // (fewer months' worth of rows get accumulated into), which is the part
  // that was genuinely growing unbounded as the FY progresses. It does NOT
  // reduce the sheet-READ cost (readRawRows_ still calls getDataRange() on
  // the full RAW tab every run) — that would need RAW tabs sorted by date
  // with a tracked row cursor, which is a bigger, riskier change to make
  // blind without live data to test against. This is a real, if partial,
  // improvement: read cost is flat, compute cost now scales with ~1-2
  // months of data instead of up to 12.
  var FY_MONTHLY_CACHE_PROP_ = 'FY_MONTHLY_CLOSED_MONTHS_CACHE';
  var closedMonthCache = {};
  try {
    var cachedRaw = PropertiesService.getScriptProperties().getProperty(FY_MONTHLY_CACHE_PROP_);
    if (cachedRaw) closedMonthCache = JSON.parse(cachedRaw);
  } catch (e) { closedMonthCache = {}; Logger.log('FY_MONTHLY_CLOSED_MONTHS_CACHE parse failed, rebuilding: ' + e); }

  var todayForFY = new Date();
  var currentMonthNameFY = MONTH_CAL[todayForFY.getMonth()];
  var currentMonthIdxFY = FY_MONTHS.indexOf(currentMonthNameFY);

  function zeroMonth_() {
    return {
      cutQty:0, cutKg:0,
      forgeQtyIn:0, forgeKgIn:0, forgeQtyJWK:0, forgeKgJWK:0,
      pressQtyIn:0, pressKgIn:0, pressQtyJWK:0, pressKgJWK:0,
      htQty:0, finalQty:0, machQty:0,
      dispQty:0, dispTurnover:0, schedTons:0,
      rmKg:0, rmValue:0, oilForge:0, oilHT:0, elecKwh:0,
      contractCost:0, contractHead:0, staffHead:0, vendorRej:0
    };
  }

  var result = {};
  FY_MONTHS.forEach(function(m, idx) {
    var isClosed = idx < currentMonthIdxFY;
    // Scan live if: month is open/future, OR it's closed but not cached
    // yet (first run after this feature was added, or cache was cleared).
    if (!isClosed || !closedMonthCache[m]) {
      result[m] = zeroMonth_();
    }
    // else: leave absent from `result` for now — every scan loop below
    // already guards with `if (!result[mn]) return;`, so rows belonging
    // to already-cached closed months are automatically skipped with no
    // changes needed to any of those loops. Merged back in from cache
    // after scanning, below.
  });

  var jwkSet   = loadJWKSet_(ss);
  var partsMap = loadPartsMap_(ss);

  function readRawRows_(tabName) {
    var sh = ss.getSheetByName(tabName);
    return sh ? sh.getDataRange().getValues().slice(2) : [];
  }

  // Cutting
  var sc1 = schema_('RAW_CUTTING');
  readRawRows_('RAW_CUTTING').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    var vf = (row[sc1.vf]||'').toString().trim();
    var qty = Number(row[sc1.qty])||0;
    if (!vf || qty === 0) return;
    result[mn].cutQty += qty;
    result[mn].cutKg  += qty * ((partsMap[vf]||{}).inputWt||0);
  });

  // Forge
  var sc2 = schema_('RAW_FORGE');
  readRawRows_('RAW_FORGE').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    var vf = (row[sc2.vf]||'').toString().trim();
    var qty = Number(row[sc2.qty])||0;
    if (!vf || qty === 0) return;
    var kg   = qty * ((partsMap[vf]||{}).finWt||0);
    var type = getType_(row, sc2, jwkSet);
    if (type === 'JWK') { result[mn].forgeQtyJWK += qty; result[mn].forgeKgJWK += kg; }
    else                { result[mn].forgeQtyIn  += qty; result[mn].forgeKgIn  += kg; }
  });

  // Press
  var sc3 = schema_('RAW_PRESS');
  readRawRows_('RAW_PRESS').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    var vf = (row[sc3.vf]||'').toString().trim();
    var qty = Number(row[sc3.qty])||0;
    if (!vf || qty === 0) return;
    var kg   = qty * ((partsMap[vf]||{}).finWt||0);
    var type = getType_(row, sc3, jwkSet);
    if (type === 'JWK') { result[mn].pressQtyJWK += qty; result[mn].pressKgJWK += kg; }
    else                { result[mn].pressQtyIn  += qty; result[mn].pressKgIn  += kg; }
  });

  // HT
  readRawRows_('RAW_HT').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    result[mn].htQty += Number(row[3])||0;
  });

  // Final
  readRawRows_('RAW_FINAL').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    result[mn].finalQty += Number(row[4])||0;
  });

  // Machine
  var sc4 = schema_('RAW_MACHINE');
  readRawRows_('RAW_MACHINE').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    result[mn].machQty += Number(row[sc4.qty])||0;
  });

  // Dispatch
  readRawRows_('RAW_DISPATCH').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    result[mn].dispQty      += Number(row[4])||0;
    result[mn].dispTurnover += Number(row[6])||0;
  });

  // Schedule - sum scheduled tons per month name
  readRawRows_('RAW_SCHEDULE').forEach(function(row) {
    var mn = (row[2]||'').toString().trim();
    if (!result[mn]) return;
    result[mn].schedTons += Number(row[4])||0;
  });

  // RM Inward
  readRawRows_('RAW_RM_INWARD').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    var kg = Number(row[5])||0; var rate = Number(row[6])||0;
    result[mn].rmKg    += kg;
    result[mn].rmValue += kg * rate;
  });

  // Oil
  readRawRows_('RAW_OIL').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    result[mn].oilForge += Number(row[2])||0;
    result[mn].oilHT    += Number(row[3])||0;
  });

  // Electricity - main meter (match any meter containing "MSEB")
  readRawRows_('RAW_ELECTRICITY').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    var meter = (row[2] || '').toString().trim();
    var kwh = Number(row[3]) || 0;
    if (kwh > 0 && meter.indexOf('MSEB') >= 0) {
      result[mn].elecKwh += kwh;
    }
  });

  // Contractor
  readRawRows_('RAW_MANPOWER_CONTRACT').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    result[mn].contractCost += Number(row[6])||0;
    result[mn].contractHead += Number(row[4])||0;
  });

  // Staff headcount
  readRawRows_('RAW_MANPOWER_STAFF').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    result[mn].staffHead += (Number(row[3])||0) + (Number(row[4])||0) + (Number(row[5])||0);
  });

  // Vendor Rejection
  readRawRows_('RAW_VENDOR_REJECTION').forEach(function(row) {
    var d = parseDate_(row[0]); if (!d) return;
    var mn = getMonthName_(d); if (!result[mn]) return;
    result[mn].vendorRej += Number(row[3])||0;
  });

  // ── Merge cached closed months back in, and cache any month that just
  // became closed for the first time (so the NEXT run can skip it).
  var cacheChanged = false;
  FY_MONTHS.forEach(function(m, idx) {
    var isClosed = idx < currentMonthIdxFY;
    if (!result[m] && closedMonthCache[m]) {
      result[m] = closedMonthCache[m]; // restore from cache
    } else if (isClosed && !closedMonthCache[m] && result[m]) {
      closedMonthCache[m] = result[m]; // newly closed — cache it now
      cacheChanged = true;
    }
  });
  if (cacheChanged) {
    try {
      PropertiesService.getScriptProperties().setProperty(FY_MONTHLY_CACHE_PROP_, JSON.stringify(closedMonthCache));
    } catch (e) { Logger.log('FY_MONTHLY_CLOSED_MONTHS_CACHE save failed (non-fatal): ' + e); }
  }

  // Build output
  var headers = [
    'Month',
    'Cut Qty','Cut Tons',
    'Forge Qty (Inhouse)','Forge Tons (Inhouse)',
    'Forge Qty (JWK)','Forge Tons (JWK)',
    'Press Qty (Inhouse)','Press Tons (Inhouse)',
    'Press Qty (JWK)','Press Tons (JWK)',
    'Total Forged Tons',
    'HT Qty','Final Qty','Machine Qty',
    'Dispatch Qty','Dispatch Turnover (Rs L)',
    'Schedule Tons','Schedule Achievement %',
    'RM Inward (kg)','RM Cost (Rs L)',
    'Oil Forge (L)','Oil HT (L)','Electricity (kWh)',
    'Contract Cost (Rs L)','Contract Head','Staff Head',
    'Vendor Rejection (pcs)'
  ];

  var dataRows = [];

  function r2(n) { return n ? Math.round(n * 1000) / 1000 : ''; }
  function lk(n) { return n ? Math.round(n / 100000 * 100) / 100 : ''; }

  FY_MONTHS.forEach(function(mn) {
    var v = result[mn];
    var totalForgeTons = (v.forgeKgIn + v.forgeKgJWK + v.pressKgIn + v.pressKgJWK) / 1000;
    var schedAch = v.schedTons > 0 ? (Math.round(totalForgeTons / v.schedTons * 1000) / 10) + '%' : '';
    dataRows.push([
      mn,
      v.cutQty||'',       r2(v.cutKg/1000),
      v.forgeQtyIn||'',   r2(v.forgeKgIn/1000),
      v.forgeQtyJWK||'',  r2(v.forgeKgJWK/1000),
      v.pressQtyIn||'',   r2(v.pressKgIn/1000),
      v.pressQtyJWK||'',  r2(v.pressKgJWK/1000),
      r2(totalForgeTons),
      v.htQty||'', v.finalQty||'', v.machQty||'',
      v.dispQty||'',  lk(v.dispTurnover),
      r2(v.schedTons), schedAch,
      v.rmKg||'',     lk(v.rmValue),
      v.oilForge||'', v.oilHT||'', (v.elecKwh || 0),
      lk(v.contractCost), v.contractHead||'', v.staffHead||'',
      v.vendorRej||''
    ]);
  });

  // YTD row
  var ytdRow = ['YTD TOTAL'];
  for (var ci = 1; ci < headers.length; ci++) {
    var s = 0;
    dataRows.forEach(function(r){ s += Number(r[ci]) || 0; });
    ytdRow.push(s > 0 ? Math.round(s * 1000) / 1000 : '');
  }
  dataRows.push(ytdRow);

  var title = 'FY_MONTHLY -- FY 2026-27   |   Updated: ' +
              Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy HH:mm');
  var sh = writeTab_(ss, 'FY_MONTHLY', headers, dataRows, title);
  
  // --- FORCE WRITE ELECTRICITY COLUMN (index 23 in dataRows) ---
  // Electricity is the 24th column (1‑based) in the sheet.
  var elecColumn = 24; // because headers[23] = 'Electricity (kWh)'
  var elecVals = [];
  for (var i = 0; i < dataRows.length; i++) {
    var val = dataRows[i][23] || 0;
    elecVals.push([val]);
  }
  if (elecVals.length > 0) {
    sh.getRange(3, elecColumn, elecVals.length, 1).setValues(elecVals);
    sh.getRange(3, elecColumn, elecVals.length, 1).setNumberFormat('#,##0');
    // Log the first value to confirm
    Logger.log('Electricity value written for April: ' + elecVals[0][0]);
  }

  // Read back to confirm it was written
  var checkVal = sh.getRange(3, elecColumn).getValue();
  Logger.log('Read back from sheet (row3,col24): ' + checkVal);

  sh.setFrozenRows(2);
  // setFrozenColumns skipped — row 1 title is merged across all cols and conflicts with column freeze
  sh.getRange(2 + dataRows.length, 1, 1, headers.length)
    .setFontWeight('bold').setBackground('#FFF9C4');

  // Highlight current month
  var curMn = MONTH_CAL[getMonthStart_().getMonth()];
  var curIdx = FY_MONTHS.indexOf(curMn);
  if (curIdx >= 0) {
    sh.getRange(3 + curIdx, 1, 1, headers.length)
      .setBackground('#E3F2FD').setFontWeight('bold');
  }

  Logger.log('buildFYMonthly complete');
}
// ================================================================
function hideRAWTabs() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var HIDE = [
    'RAW_CUTTING','RAW_FORGE','RAW_PRESS','RAW_MACHINE',
    'RAW_HT','RAW_FINAL','RAW_DISPATCH','RAW_SCHEDULE',
    'RAW_PARTS','RAW_JWK','RAW_RM_INWARD','RM_CONSUMPTION',
    'RAW_OIL','RAW_OIL_INWARD','RAW_ELECTRICITY',
    'RAW_MANPOWER_STAFF','RAW_MANPOWER_CONTRACT',
    'RAW_DIESEL_VEHICLE','RAW_DIESEL_PLANT',
    'RAW_VENDOR_REJECTION','RAW_57F4_IN','RAW_57F4_OUT',
    'COSTING_BANDS','OPENING_WIP_2627','OPENING_RM_2627',
    'ALERT_SUPPRESS','SCRIPT_LOG'
  ];
  var hidden = 0;
  HIDE.forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (sh && !sh.isSheetHidden()) {
      try { sh.hideSheet(); hidden++; } catch(e) {}
    }
  });
  Logger.log('hideRAWTabs: ' + hidden + ' tabs hidden');
}


// ================================================================
// 12 - showRAWTabs()
// Run manually to inspect RAW tabs
// ================================================================
function showRAWTabs() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var HIDE = [
    'RAW_CUTTING','RAW_FORGE','RAW_PRESS','RAW_MACHINE',
    'RAW_HT','RAW_FINAL','RAW_DISPATCH','RAW_SCHEDULE',
    'RAW_PARTS','RAW_JWK','RAW_RM_INWARD','RM_CONSUMPTION',
    'RAW_OIL','RAW_OIL_INWARD','RAW_ELECTRICITY',
    'RAW_MANPOWER_STAFF','RAW_MANPOWER_CONTRACT',
    'RAW_DIESEL_VEHICLE','RAW_DIESEL_PLANT',
    'RAW_VENDOR_REJECTION','RAW_57F4_IN','RAW_57F4_OUT',
    'COSTING_BANDS','OPENING_WIP_2627','OPENING_RM_2627',
    'ALERT_SUPPRESS','SCRIPT_LOG'
  ];
  var shown = 0;
  HIDE.forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (sh && sh.isSheetHidden()) {
      try { sh.showSheet(); shown++; } catch(e) {}
    }
  });
  Logger.log('showRAWTabs: ' + shown + ' tabs shown');
}

// ============================================================


// ════════════════════════════════════════════════════════════════
// 1 — MACHINE CODE MAP
// ════════════════════════════════════════════════════════════════
var MCODE_ = {
  // CUTTING — matches HTML CUT_MACHINES exactly
  'Shearing Machine':        'SM',
  'Band Saw No 1':           'BS1',
  'Band Saw No. 1':          'BS1',
  'Band Saw No 2':           'BS2',
  'Band Saw No. 2':          'BS2',
  'Band Saw No 3':           'BS3',
  'Band Saw No. 3':          'BS3',
  'Circular Saw 80':         'CS80',
  'Circular Saw 100':        'CS100',
  'Circular Saw ITL':        'CSITL',
  'HGCKSGW 1':               'HS1',
  'HGCKSGW 2':               'HS2',

  // FORGE — matches HTML FRG_SRC exactly
  'Hammer 1 Ton Old':        'H1O',
  'Hammer 1 Ton New':        'H1N',
  'hammer 1 ton old':        'H1O',
  'hammer 1 ton new':        'H1N',
  'Hammer 1.5 Ton':          'H15',
  'Hammer 1.5 ton':          'H15',
  'hammer 1.5 ton':          'H15',
  'Hammer 2 Ton':            'H2',
  'Hammer 2 ton':            'H2',
  'hammer 2 ton':            'H2',
  'Hammer 3 Ton':            'H3',
  'Hammer 3 ton':            'H3',
  'hammer 3 ton':            'H3',
  '1 ton Hammer (old)':      'H1O',
  '1 ton Hammer (new)':      'H1N',
  '1.5 ton Hammer':          'H15',
  '2 ton Hammer':            'H2',
  '3 ton Hammer':            'H3',

  // PRESS — matches HTML PRESS_SRC exactly
  '800 Ton Press':           '800',
  '800 ton press':           '800',
  '800 Ton Screw Press':     '800',
  '800 ton screw press':     '800',
  '1300 Ton Press':          '1300',
  '1300 ton press':          '1300',
  '2500 Ton Press':          '2500',
  '2500 ton press':          '2500',
  '1000 Ton Press':          '1000',
  '1000 ton press':          '1000',

  // MACHINE — matches HTML MACH_SRC exactly
  'Facing & Centering 1':    'FC1',
  'Facing & Centering 2':    'FC2',
  'Lathe P/T':               'LATHE',
  'Lathe-P/T Machine':       'LATHE',
  'SPM':                     'SPM',
  'SPM Machine':             'SPM',
  'CNC 01':                  'CNC1',
  'CNC 02':                  'CNC2',
  'CNC 03':                  'CNC3',
  'CNC 04':                  'CNC4',
  'CNC 05':                  'CNC5',
  'Hobbing 1':               'HOB1',
  'Hobbing 2':               'HOB2',
  'Hobbing 3':               'HOB3',
  'Hobbing 4':               'HOB4',
  'Hobbing 5':               'HOB5',
  'Hobbing 6':               'HOB6',
  'Hobbing 7':               'HOB7',
  'Hobbing 8':               'HOB8',
  'Hobbing M/C FD-250':      'HOB1',
  'Hobbing M/C FD-250UMC':   'HOB2',
  'Hobbing M/C FD-800':      'HOB3',
  'Hobbing M/C-400':         'HOB4',
  'Hobbing M/C FD-400':      'HOB5'
};

// ════════════════════════════════════════════════════════════════
// 2 — SECTION DEFINITIONS
// Used by Daily Overview — defines dept groupings and machine order
// ════════════════════════════════════════════════════════════════
var SECTIONS_ = [
  { label:'CUTTING',     rawTab:'RAW_CUTTING', machines:['SM','BS1','BS2','BS3','CS80','CS100','CSITL','HS1','HS2'] },
  { label:'FORGE',       rawTab:'RAW_FORGE',   machines:['H1O','H15','H2','H3'] },
  { label:'PRESS',       rawTab:'RAW_PRESS',   machines:['800','1300','2500','1000'] },
  { label:'MACHINE-CNC', rawTab:'RAW_MACHINE', machines:['CNC1','CNC2','CNC3','CNC4','CNC5'] },
  { label:'MACHINE-FC',  rawTab:'RAW_MACHINE', machines:['FC1','FC2','LATHE','SPM'] },
  { label:'MACHINE-HOB', rawTab:'RAW_MACHINE', machines:['HOB1','HOB2','HOB3','HOB4','HOB5','HOB6','HOB7','HOB8'] }
];

// ════════════════════════════════════════════════════════════════
// 3 — DEPT DEFINITIONS
// Used by Production Monthly — same groupings with JWK flag
// ════════════════════════════════════════════════════════════════
var DEPT_DEFS_ = [
  { dept:'CUTTING', rawTab:'RAW_CUTTING', hasJWK:false,
    machines:['SM','BS1','BS2','BS3','CS80','CS100','CSITL','HS1','HS2'] },
  { dept:'FORGE',   rawTab:'RAW_FORGE',   hasJWK:true,
    machines:['H1O','H15','H2','H3'] },
  { dept:'PRESS',   rawTab:'RAW_PRESS',   hasJWK:true,
    machines:['800','1300','2500','1000'] },
  { dept:'MACHINE', rawTab:'RAW_MACHINE', hasJWK:false,
    machines:['FC1','FC2','CNC1','CNC2','CNC3','CNC4','CNC5',
              'HOB1','HOB2','HOB3','HOB4','HOB5','HOB6','HOB7','HOB8','LATHE','SPM'] }
];

// ════════════════════════════════════════════════════════════════
// MASTER_MACHINE — single source of truth for all machine codes
// ════════════════════════════════════════════════════════════════
// WHY THIS EXISTS: Machine codes were previously defined in 4 separate
// places (MCODE_, SECTIONS_, DEPT_DEFS_, and index.html CUT_SRC etc),
// kept in sync manually. The H1N/H1O bug was the direct result. This
// is the single definition — all four consumers derive from it.
//
// Edit MASTER_MACHINE_DATA_ here when a machine is added, renamed,
// or recoded. Nowhere else. That's the whole point.
// ── Column key: [code, displayName, dept, formNames[], htmlPrefix, section, hasJWK, sortOrder]
var MASTER_MACHINE_DATA_ = [
  // ── CUTTING ──────────────────────────────────────────────────
  ['SM',    'Shearing',      'Cutting', ['Shearing Machine','SHEARING MACHINE','Shearing'],                                      'self',   'CUTTING',     'NO',  1],
  ['BS1',   'Band Saw 1',    'Cutting', ['Band Saw No 1','Band Saw No. 1','Band Saw No.1','BAND SAW NO. 1','Band Saw 1'],         'self',   'CUTTING',     'NO',  2],
  ['BS2',   'Band Saw 2',    'Cutting', ['Band Saw No 2','Band Saw No. 2','Band Saw No.2','BAND SAW NO. 2','Band Saw 2'],         'self',   'CUTTING',     'NO',  3],
  ['BS3',   'Band Saw 3',    'Cutting', ['Band Saw No 3','Band Saw No. 3','Band Saw No.3','BAND SAW NO. 3','Band Saw 3'],         'self',   'CUTTING',     'NO',  4],
  ['CS80',  'Circ Saw 80',   'Cutting', ['Circular Saw 80','CIRCULAR SAW 80'],                                                   'self',   'CUTTING',     'NO',  5],
  ['CS100', 'Circ Saw 100',  'Cutting', ['Circular Saw 100','CIRCULAR SAW 100'],                                                 'self',   'CUTTING',     'NO',  6],
  ['CSITL', 'Circ Saw ITL',  'Cutting', ['Circular Saw ITL','CIRCULAR SAW ITL'],                                                 'self',   'CUTTING',     'NO',  7],
  ['HS1',   'HGCK-1',        'Cutting', ['HGCKSGW 1','HGCKW 1','HGCKGW 1','HGCSGW 1','HGCK 1'],                                'self',   'CUTTING',     'NO',  8],
  ['HS2',   'HGCK-2',        'Cutting', ['HGCKSGW 2','HGCKW 2','HGCKGW 2','HGCSGW 2','HGCK 2'],                                'self',   'CUTTING',     'NO',  9],
  // ── FORGE — H1O and H1N are SEPARATE machines, never alias one to the other ─────────────
  ['H1O',  '1T Old',      'Forge', ['Hammer 1 Ton Old','Hammer 1 Ton old','hammer 1 ton old','1 ton Hammer (old)','1T Hammer (Old)','1 Ton Old'],    'self', 'FORGE', 'YES', 10],
  ['H1N',  '1T New',      'Forge', ['Hammer 1 Ton New','Hammer 1 Ton new','hammer 1 ton new','1 ton Hammer (new)','1T Hammer (New)','1 Ton New'],    'self', 'FORGE', 'YES', 11],
  ['H15',  '1.5T Hammer', 'Forge', ['Hammer 1.5 Ton','Hammer 1.5 ton','hammer 1.5 ton','1.5 ton Hammer','1.5T Hammer','1.5 Ton'],                    'self', 'FORGE', 'YES', 12],
  ['H2',   '2T Hammer',   'Forge', ['Hammer 2 Ton','Hammer 2 ton','hammer 2 ton','2 ton Hammer','2T Hammer','2 Ton'],                                'self', 'FORGE', 'YES', 13],
  ['H3',   '3T Hammer',   'Forge', ['Hammer 3 Ton','Hammer 3 ton','hammer 3 ton','3 ton Hammer','3T Hammer','3 Ton'],                                'self', 'FORGE', 'YES', 14],
  // ── PRESS — HTML uses P800/P1000/P1300/P2500; MCODE_ uses bare numeric (no P prefix) ───
  ['P800',  '800T Press',  'Press', ['800 Ton Press','800 ton press','800 Ton Screw Press','800 ton screw press','800T Press'],    'strip-P', 'PRESS', 'YES', 20],
  ['P1000', '1000T Press', 'Press', ['1000 Ton Press','1000 ton press','1000T Press'],                                             'strip-P', 'PRESS', 'YES', 21],
  ['P1300', '1300T Press', 'Press', ['1300 Ton Press','1300 ton press','1300T Press'],                                             'strip-P', 'PRESS', 'YES', 22],
  ['P2500', '2500T Press', 'Press', ['2500 Ton Press','2500 ton press','2500T Press'],                                             'strip-P', 'PRESS', 'YES', 23],
  // ── MACHINE ───────────────────────────────────────────────────
  ['FC1',   'FC-1',   'Machine', ['Facing & Centering 1','Facing and Centering 1'],              'self', 'MACHINE-FC',  'NO', 30],
  ['FC2',   'FC-2',   'Machine', ['Facing & Centering 2','Facing and Centering 2'],              'self', 'MACHINE-FC',  'NO', 31],
  ['LATHE', 'Lathe',  'Machine', ['Lathe P/T','Lathe-P/T Machine','Lathe'],                      'self', 'MACHINE-FC',  'NO', 32],
  ['SPM',   'SPM',    'Machine', ['SPM','SPM Machine'],                                          'self', 'MACHINE-FC',  'NO', 33],
  ['CNC1',  'CNC-1',  'Machine', ['CNC 01','CNC-01'],                                            'self', 'MACHINE-CNC', 'NO', 40],
  ['CNC2',  'CNC-2',  'Machine', ['CNC 02','CNC-02'],                                            'self', 'MACHINE-CNC', 'NO', 41],
  ['CNC3',  'CNC-3',  'Machine', ['CNC 03','CNC-03'],                                            'self', 'MACHINE-CNC', 'NO', 42],
  ['CNC4',  'CNC-4',  'Machine', ['CNC 04','CNC-04'],                                            'self', 'MACHINE-CNC', 'NO', 43],
  ['CNC5',  'CNC-5',  'Machine', ['CNC 05','CNC-05'],                                            'self', 'MACHINE-CNC', 'NO', 44],
  ['HOB1',  'Hob-1',  'Machine', ['Hobbing 1','Hobbing M/C FD-250'],                             'self', 'MACHINE-HOB', 'NO', 50],
  ['HOB2',  'Hob-2',  'Machine', ['Hobbing 2','Hobbing M/C FD-250UMC'],                          'self', 'MACHINE-HOB', 'NO', 51],
  ['HOB3',  'Hob-3',  'Machine', ['Hobbing 3','Hobbing M/C FD-800'],                             'self', 'MACHINE-HOB', 'NO', 52],
  ['HOB4',  'Hob-4',  'Machine', ['Hobbing 4','Hobbing M/C-400'],                                'self', 'MACHINE-HOB', 'NO', 53],
  ['HOB5',  'Hob-5',  'Machine', ['Hobbing 5','Hobbing M/C FD-400'],                             'self', 'MACHINE-HOB', 'NO', 54],
  ['HOB6',  'Hob-6',  'Machine', ['Hobbing 6'],                                                  'self', 'MACHINE-HOB', 'NO', 55],
  ['HOB7',  'Hob-7',  'Machine', ['Hobbing 7'],                                                  'self', 'MACHINE-HOB', 'NO', 56],
  ['HOB8',  'Hob-8',  'Machine', ['Hobbing 8'],                                                  'self', 'MACHINE-HOB', 'NO', 57]
];

function buildMasterMachine_() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var headers = ['Machine_Code','Display_Name','Dept','Form_Names','HTML_Prefix','Section','Has_JWK','Sort_Order'];
  var rows = MASTER_MACHINE_DATA_.map(function(d) {
    return [d[0], d[1], d[2], d[3].join('|'), d[4], d[5], d[6], d[7]];
  });
  writeToTab_(ss, 'MASTER_MACHINE', headers, rows,
    'MASTER MACHINE REGISTRY — Edit MASTER_MACHINE_DATA_ in Code.gs, not this tab directly.');
  var sh = ss.getSheetByName('MASTER_MACHINE');
  var deptColors = {Cutting:'#E3F2FD', Forge:'#FFF3E0', Press:'#F3E5F5', Machine:'#E8F5E9'};
  for (var r = 0; r < rows.length; r++) {
    var bg = deptColors[rows[r][2]] || '#FFFFFF';
    sh.getRange(r + 3, 1, 1, headers.length).setBackground(bg);
  }
  sh.setFrozenRows(2);
  Logger.log('buildMasterMachine_: ' + rows.length + ' machines written to MASTER_MACHINE tab.');
  _rebuildRuntimeMaps_();
}

function _rebuildRuntimeMaps_() {
  // serverCode(d) — derives the canonical server-side code stored in MCODE_, SECTIONS_, DEPT_DEFS_.
  // strip-P machines (Press) use bare numeric code ('800') since that's what MCODE_ stores
  // and what readByDateShiftwise_ uses as map keys. The P-prefixed code is for the frontend only.
  function serverCode(d) { return (d[4] === 'strip-P') ? d[0].replace(/^P/, '') : d[0]; }

  // 1. MCODE_ — form name string → server-side canonical code
  var newMcode = {};
  MASTER_MACHINE_DATA_.forEach(function(d) {
    var sc = serverCode(d), formNames = d[3];
    formNames.forEach(function(name) {
      newMcode[name] = sc;
      newMcode[name.toUpperCase()] = sc;
    });
  });
  for (var k in MCODE_) { delete MCODE_[k]; }
  for (var k in newMcode) { MCODE_[k] = newMcode[k]; }

  // 2. SECTIONS_ — Daily Overview groupings (uses server-side codes to match MCODE_ output)
  var sectionMap = {};
  MASTER_MACHINE_DATA_.forEach(function(d) {
    var section = d[5];
    var rawTab = {CUTTING:'RAW_CUTTING',FORGE:'RAW_FORGE',PRESS:'RAW_PRESS',
                  'MACHINE-CNC':'RAW_MACHINE','MACHINE-FC':'RAW_MACHINE','MACHINE-HOB':'RAW_MACHINE'}[section] || 'RAW_' + d[2].toUpperCase();
    if (!sectionMap[section]) sectionMap[section] = {label:section, rawTab:rawTab, machines:[]};
    sectionMap[section].machines.push({code:serverCode(d), sort:d[7]});
  });
  var newSections = Object.keys(sectionMap).sort().map(function(sec) {
    var s = sectionMap[sec];
    s.machines.sort(function(a,b){return a.sort-b.sort;});
    return {label:s.label, rawTab:s.rawTab, machines:s.machines.map(function(m){return m.code;})};
  });
  SECTIONS_.length = 0;
  newSections.forEach(function(s){SECTIONS_.push(s);});

  // 3. DEPT_DEFS_ — Production Monthly groupings (uses server-side codes)
  var deptMap = {};
  MASTER_MACHINE_DATA_.forEach(function(d) {
    var dept = d[2].toUpperCase(), hasJWK = (d[6] === 'YES');
    if (!deptMap[dept]) deptMap[dept] = {dept:dept, rawTab:'RAW_'+dept, hasJWK:false, machines:[]};
    if (hasJWK) deptMap[dept].hasJWK = true;
    deptMap[dept].machines.push({code:serverCode(d), sort:d[7]});
  });
  var newDeptDefs = Object.keys(deptMap).sort().map(function(dept) {
    var dd = deptMap[dept];
    dd.machines.sort(function(a,b){return a.sort-b.sort;});
    return {dept:dd.dept, rawTab:dd.rawTab, hasJWK:dd.hasJWK, machines:dd.machines.map(function(m){return m.code;})};
  });
  DEPT_DEFS_.length = 0;
  newDeptDefs.forEach(function(dd){DEPT_DEFS_.push(dd);});

  Logger.log('_rebuildRuntimeMaps_: MCODE_ (' + Object.keys(MCODE_).length + ' entries), ' +
             'SECTIONS_ (' + SECTIONS_.length + '), DEPT_DEFS_ (' + DEPT_DEFS_.length + ') rebuilt.');
}

function getMachineRegistryForCache_() {
  var out = {cutting:[], forge:[], press:[], machine:[]};
  MASTER_MACHINE_DATA_.forEach(function(d) {
    var dept = d[2].toLowerCase();
    if (!out[dept]) return;
    out[dept].push({code:d[0], name:d[1], formNames:d[3], htmlPrefix:d[4], section:d[5], sortOrder:d[7]});
  });
  return out;
}

// Shift label normaliser — maps raw form text to short label
var SHIFT_LABELS_ = ['First Shift', 'Second Shift', 'Third Shift'];

// normaliseShift_ — now in doGet v4


// ════════════════════════════════════════════════════════════════
// 4 — HELPERS
// ════════════════════════════════════════════════════════════════

function getToday_() {
  var now = new Date();
  var ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  return new Date(ist.getFullYear(), ist.getMonth(), ist.getDate(), 0, 0, 0, 0);
}

function getYesterday_() {
  var t = getToday_();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 0, 0, 0, 0);
}

// Parse any date value — handles Date objects, MM/DD/YYYY text, and serial numbers
function parseDate_(val) {
  if (!val) return null;
  // Already a Date object
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  // Google Sheets serial number (number)
  if (typeof val === 'number') {
    // Sheets serial: days since Dec 30 1899
    var d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  // Text date — MM/DD/YYYY format (confirmed from your sheet)
  var s = val.toString().trim();
  var parts = s.split('/');
  if (parts.length === 3) {
    var mm = parseInt(parts[0], 10) - 1; // month is 0-indexed
    var dd = parseInt(parts[1], 10);
    var yy = parseInt(parts[2], 10);
    if (!isNaN(mm) && !isNaN(dd) && !isNaN(yy)) {
      return new Date(yy, mm, dd, 0, 0, 0, 0);
    }
  }
  // Fallback — try native parse
  var d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function isSameDay_(a, b) {
  var da = parseDate_(a);
  var db = parseDate_(b);
  if (!da || !db) return false;
  return da.getFullYear() === db.getFullYear() &&
         da.getMonth()    === db.getMonth()    &&
         da.getDate()     === db.getDate();
}

function getMonthStart_() {
  var t = getToday_();
  return new Date(t.getFullYear(), t.getMonth(), 1, 0, 0, 0, 0);
}

function getMonthEnd_() {
  var t = getToday_();
  return new Date(t.getFullYear(), t.getMonth() + 1, 0, 23, 59, 59, 999);
}

// Column schema per RAW tab
// RAW_CUTTING:  Date | Machine | Shift | VF_No | Qty
// RAW_FORGE:    Date | Machine | Shift | Prod_Type | VF_No | Qty
// RAW_PRESS:    Date | Machine | Shift | Prod_Type | VF_No | Qty
// RAW_MACHINE:  Date | Machine | Shift | Process   | VF_No | Qty
function schema_(tabName) {
  if (tabName === 'RAW_CUTTING') return { shift:2, vf:3, qty:4, prodType:null };
  if (tabName === 'RAW_FORGE')   return { shift:2, vf:4, qty:5, prodType:3 };
  if (tabName === 'RAW_PRESS')   return { shift:2, vf:4, qty:5, prodType:3 };
  if (tabName === 'RAW_MACHINE') return { shift:2, vf:4, qty:5, prodType:null };
  return { shift:2, vf:3, qty:4, prodType:null };
}

// Load JWK VF set → { 'VF1234': true }
function loadJWKSet_(ss) {
  var out = {};
  var sh  = ss.getSheetByName('RAW_JWK');
  if (!sh) { Logger.log('WARN: RAW_JWK not found'); return out; }
  var vals = sh.getDataRange().getValues();
  // RAW_JWK: col[0]=Sr_No, col[1]=VF_No (confirmed from xlsx)
  // Skip rows where VF_No looks like a header ('VF NO', 'VF_No')
  for (var r = 2; r < vals.length; r++) {
    var vf = (vals[r][1] || '').toString().trim();
    if (!vf) continue;
    if (vf.toUpperCase() === 'VF0' || vf.toUpperCase() === 'VF NO' || vf.toUpperCase() === 'VF_NO') continue;
    out[vf] = true;
  }
  Logger.log('JWK set: ' + Object.keys(out).length + ' VFs');
  return out;
}

// Load Parts map → { 'VF1234': { finWt: kg_after_forging, inputWt: kg_before_forging } }
// RAW_PARTS confirmed column layout:
//   col[1] = VF No
//   col[5] = Input Weight (before forging — used for RM planning)
//   col[8] = Finish Weight (after forging — used for tonnage calculation)
function loadPartsMap_(ss) {
  var out = {};
  var sh  = ss.getSheetByName('RAW_PARTS');
  if (!sh) { Logger.log('WARN: RAW_PARTS not found'); return out; }
  var vals = sh.getDataRange().getValues();
  
  for (var r = 2; r < vals.length; r++) {
    var vf = (vals[r][1] || '').toString().trim();
    if (!vf) continue;
    out[vf] = {
      finWt:     parseFloat(vals[r][8]) || 0,   // Finish Weight 
      inputWt:   parseFloat(vals[r][5]) || 0,   // Input Weight 
      unitPrice: parseFloat(vals[r][25]) || parseFloat(vals[r][26]) || 0 // Basic Price
    };
  }
  return out;
}

// Determine Inhouse vs JWK for a row
function getType_(row, sc, jwkSet) {
  var vf = (row[sc.vf] || '').toString().trim();
  if (sc.prodType !== null) {
    var pt = (row[sc.prodType] || '').toString().trim().toLowerCase();
    if (pt.indexOf('jwk') > -1 || pt.indexOf('job work') > -1 ||
        pt.indexOf('jobwork') > -1 || jwkSet[vf]) return 'JWK';
  } else {
    if (jwkSet[vf]) return 'JWK';
  }
  return 'Inhouse';
}

// fmtTons_ — now in doGet v4

// Format a shift cell for Daily Overview
// lines = [ 'VF1078 → 1,220', 'VF869 → 830' ]  total shown at end
function fmtShiftCell_(vfQtyMap) {
  var keys = Object.keys(vfQtyMap);
  if (keys.length === 0) return '—';
  var lines = [];
  var total = 0;
  keys.sort(function(a,b){
    return (parseInt(a.replace(/\D/g,''))||0)-(parseInt(b.replace(/\D/g,''))||0);
  }).forEach(function(vf){
    var q = vfQtyMap[vf];
    total += q;
    lines.push(vf + ' \u2192 ' + q.toLocaleString('en-IN'));
  });
  if (keys.length > 1) {
    lines.push('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    lines.push('Total \u2192 ' + total.toLocaleString('en-IN'));
  }
  return lines.join('\n');
}

// Delete a tab if it exists
function delTab_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (sh) { ss.deleteSheet(sh); Logger.log('Deleted: ' + name); }
}

// Write a tab cleanly: Row1=title, Row2=headers, Row3+=data
function writeTab_(ss, name, headers, rows, title) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var last = sh.getLastRow();
  if (last >= 2) {
    sh.getRange(2,1,Math.max(last-1,1),Math.max(sh.getLastColumn(),headers.length))
      .clearContent().clearFormat();
  }
  sh.getRange(1,1).setValue(title||'').setFontWeight('bold').setFontSize(10);
  if (headers.length > 0) {
    sh.getRange(2,1,1,headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1565C0')
      .setFontColor('#FFFFFF').setHorizontalAlignment('center');
  }
  if (rows.length > 0) {
    sh.getRange(3,1,rows.length,headers.length).setValues(rows);
  }
  try { sh.autoResizeColumns(1, Math.min(headers.length,26)); } catch(e){}
  return sh;
}

// ════════════════════════════════════════════════════════════════
// 5 — READ HELPERS FOR DAILY OVERVIEW
// Returns { shortCode: { 'Shift 1': { vf: qty }, 'Shift 2': {...}, 'Shift 3': {...} } }
// ════════════════════════════════════════════════════════════════
function readByDateShiftwise_(ss, tabName, filterDate) {
  var out = {};
  if (!tabName) return out;
  var sh  = ss.getSheetByName(tabName);
  if (!sh) { Logger.log('WARN readByDateShiftwise_: ' + tabName + ' not found'); return out; }
  var sc   = schema_(tabName);
  var vals = sh.getDataRange().getValues();
  for (var r = 2; r < vals.length; r++) {
    var row = vals[r];
    if (!row[0]) continue;
    var d = parseDate_(row[0]);
    if (!d || !isSameDay_(d, filterDate)) continue;
    var machine = (row[1] || '').toString().trim();
    var code    = MCODE_[machine];
    if (!code) continue;
    var shift = normaliseShift_(row[sc.shift]);
    var vf    = (row[sc.vf]  || '').toString().trim();
    var qty   = Number(row[sc.qty]) || 0;
    if (!vf || vf.toUpperCase() === 'VF0' || qty === 0) continue;
    if (!out[code])               out[code] = {};
    if (!out[code][shift])        out[code][shift] = {};
    if (!out[code][shift][vf])    out[code][shift][vf] = 0;
    out[code][shift][vf] += qty;
  }
  return out;
}


// ════════════════════════════════════════════════════════════════
// 6 — refreshDailyOverview()
// Writes "Daily Overview" tab with TWO date blocks stacked:
//   Block 1 — TODAY (live, updates each trigger run)
//   Block 2 — YESTERDAY (previous full day)
// Each block: per department, per machine, shift 1 / shift 2 / shift 3 / total
// Layout:
//   Col A = date/section label
//   Col B = row label (Shift 1 / Shift 2 / Shift 3 / Total)
//   Col C+ = machine short codes
// ════════════════════════════════════════════════════════════════
// Find last two distinct dates that have data in RAW_CUTTING
// Returns [mostRecentDate, secondMostRecentDate] as Date objects
function getLastTwoDatesWithData_(ss) {
  var sh = ss.getSheetByName('RAW_CUTTING');
  if (!sh) return [null, null];
  var vals = sh.getDataRange().getValues();
  var dateSet = {};
  for (var r = 2; r < vals.length; r++) {
    var d = parseDate_(vals[r][0]);
    if (!d) continue;
    var key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    dateSet[key] = d;
  }
  var dates = Object.values(dateSet).sort(function(a,b){ return b - a; }); // newest first
  return [dates[0] || null, dates[1] || null];
}

function refreshDailyOverview() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('Daily Overview');
  if (!sh) {
    Logger.log('ERROR: "Daily Overview" tab not found. Rename your tab to "Daily Overview".');
    return;
  }

  var today     = getToday_();
  var yesterday = getYesterday_();
  var tLabel    = Utilities.formatDate(today,     'Asia/Kolkata', 'dd-MMM-yyyy');
  var yLabel    = Utilities.formatDate(yesterday, 'Asia/Kolkata', 'dd-MMM-yyyy');
  var nowLabel  = Utilities.formatDate(new Date(),'Asia/Kolkata', 'dd-MMM-yyyy HH:mm');

  Logger.log('refreshDailyOverview → Today:' + tLabel + ' | Yesterday:' + yLabel);

  // Clear entire sheet from row 1 downward and rewrite fully
  sh.clearContents();
  sh.clearFormats();

  // Pre-read all RAW tabs for both dates
  var todayData = {};
  var yestData  = {};
  SECTIONS_.forEach(function(sec) {
    if (!sec.rawTab) return;
    todayData[sec.rawTab] = todayData[sec.rawTab] ||
      readByDateShiftwise_(ss, sec.rawTab, today);
    yestData[sec.rawTab]  = yestData[sec.rawTab]  ||
      readByDateShiftwise_(ss, sec.rawTab, yesterday);
  });

  // Fallback: if no today data in any tab, find last available date
  var todayHasData = SECTIONS_.some(function(sec) {
    if (!sec.rawTab || !todayData[sec.rawTab]) return false;
    return Object.keys(todayData[sec.rawTab]).length > 0;
  });
  var yestHasData = SECTIONS_.some(function(sec) {
    if (!sec.rawTab || !yestData[sec.rawTab]) return false;
    return Object.keys(yestData[sec.rawTab]).length > 0;
  });

  // If today has no data — find last date that has data in RAW_CUTTING
  if (!todayHasData || !yestHasData) {
    var lastDates = getLastTwoDatesWithData_(ss);
    if (!todayHasData && lastDates[0]) {
      today  = lastDates[0];
      tLabel = Utilities.formatDate(today, 'Asia/Kolkata', 'dd-MMM-yyyy') + ' (last available)';
      SECTIONS_.forEach(function(sec) {
        if (!sec.rawTab) return;
        todayData[sec.rawTab] = readByDateShiftwise_(ss, sec.rawTab, today);
      });
    }
    if (!yestHasData && lastDates[1]) {
      yesterday = lastDates[1];
      yLabel    = Utilities.formatDate(yesterday, 'Asia/Kolkata', 'dd-MMM-yyyy') + ' (last available)';
      SECTIONS_.forEach(function(sec) {
        if (!sec.rawTab) return;
        yestData[sec.rawTab] = readByDateShiftwise_(ss, sec.rawTab, yesterday);
      });
    }
  }

  // ── Write both blocks ──
  var currentRow = 1;

  function writeBlock_(dateLabel, dataCache, isToday) {
    // Block title row
    var titleText = isToday
      ? ('\u25B6 TODAY — ' + dateLabel + '   (as of ' + nowLabel + ')')
      : ('\u25B6 YESTERDAY — ' + dateLabel);
    sh.getRange(currentRow, 1, 1, 2).merge()
      .setValue(titleText)
      .setFontWeight('bold').setFontSize(12)
      .setBackground(isToday ? '#1565C0' : '#37474F')
      .setFontColor('#FFFFFF');
    currentRow++;

    SECTIONS_.forEach(function(sec) {
      var dataMap  = sec.rawTab ? (dataCache[sec.rawTab] || {}) : {};
      var machines = sec.machines;
      var nCols    = machines.length;

      // Section header: Col A = dept label, Col B = blank, Col C+ = machine codes
      sh.getRange(currentRow, 1).setValue(sec.label)
        .setFontWeight('bold')
        .setBackground('#E3F2FD').setFontColor('#0D47A1');
      sh.getRange(currentRow, 2).setValue('').setBackground('#E3F2FD');
      sh.getRange(currentRow, 3, 1, nCols)
        .setValues([machines])
        .setFontWeight('bold').setBackground('#E3F2FD')
        .setFontColor('#0D47A1').setHorizontalAlignment('center');
      currentRow++;

      // Shift rows + Total row
      var shiftTotals = {}; // { code: totalQty }
      machines.forEach(function(c){ shiftTotals[c] = 0; });

      SHIFT_LABELS_.forEach(function(shiftLabel) {
        var rowLabel = shiftLabel;
        var cells    = machines.map(function(code) {
          var shiftMap = (dataMap[code] || {})[shiftLabel] || {};
          // Accumulate into shiftTotals
          Object.keys(shiftMap).forEach(function(vf){
            shiftTotals[code] += shiftMap[vf];
          });
          return fmtShiftCell_(shiftMap);
        });

        sh.getRange(currentRow, 1).setValue('').setBackground('#FAFAFA');
        sh.getRange(currentRow, 2).setValue(rowLabel)
          .setFontWeight('bold').setBackground('#F5F5F5');
        var dataRange = sh.getRange(currentRow, 3, 1, nCols);
        dataRange.setValues([cells])
                 .setWrap(true).setVerticalAlignment('top')
                 .setFontFamily('Courier New').setFontSize(9)
                 .setBackground('#FAFAFA');
        sh.setRowHeight(currentRow, 70);
        currentRow++;
      });

      // Total row
      var totalCells = machines.map(function(code){
        var t = shiftTotals[code];
        return t > 0 ? ('Total \u2192 ' + t.toLocaleString('en-IN')) : '—';
      });
      sh.getRange(currentRow, 1).setValue('').setBackground('#E8F5E9');
      sh.getRange(currentRow, 2).setValue('TOTAL')
        .setFontWeight('bold').setBackground('#E8F5E9').setFontColor('#1B5E20');
      sh.getRange(currentRow, 3, 1, nCols)
        .setValues([totalCells])
        .setFontWeight('bold').setBackground('#E8F5E9')
        .setFontColor('#1B5E20').setHorizontalAlignment('center')
        .setFontFamily('Courier New').setFontSize(9);
      sh.setRowHeight(currentRow, 24);
      currentRow++;

      // Spacer
      currentRow++;
    });

    // Spacer between blocks
    currentRow += 2;
  }

  // Freeze BEFORE writing — must be done before any merged cells are created
  // Only freeze row 1 (no column freeze to avoid merge conflicts)
  // Cols A+B labels are already leftmost — no column freeze needed
  try { sh.setFrozenRows(0); sh.setFrozenColumns(0); } catch(e) {}

  writeBlock_(tLabel, todayData, true);
  writeBlock_(yLabel, yestData,  false);

  // Freeze first 2 cols AFTER writing — but only if no merged cells span the boundary
  // Skip column freeze to avoid merge conflicts with block title rows

  Logger.log('refreshDailyOverview complete. Rows used: ' + (currentRow - 1));
}

function buildShiftOutputKG() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('SHIFT_OUTPUT_KG');
  if (!sh) { Logger.log('SHIFT_OUTPUT_KG tab missing — skip. Import xlsx first.'); return; }
 
  // 1. Build VF -> finish_weight_kg map from RAW_PARTS (col B = VF, col I = Finish_Wt)
  var partsMap = {};
  var pSh = ss.getSheetByName('RAW_PARTS');
  if (pSh && pSh.getLastRow() >= 3) {
    var pData = pSh.getDataRange().getValues();
    for (var i = 2; i < pData.length; i++) {
      var vf = (pData[i][1] || '').toString().trim();
      if (vf) partsMap[vf] = Number(pData[i][8]) || 0;
    }
  }
 
  // 2. Cutoff = today - 30 days
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  cutoff.setHours(0, 0, 0, 0);
 
  // 3. Aggregator: key = "yyyy-MM-dd|machine|shift", val = total_kg
  var agg = {};
 
  function processTab(tabName) {
    var rSh = ss.getSheetByName(tabName);
    if (!rSh || rSh.getLastRow() < 3) return;
    var rows = rSh.getDataRange().getValues();
    for (var i = 2; i < rows.length; i++) {
      var date = rows[i][0];
      if (!(date instanceof Date) || date < cutoff) continue;
      var rawMachine = (rows[i][1] || '').toString().trim();
      var rawShift   = (rows[i][2] || '').toString().trim();
      var vf         = (rows[i][4] || '').toString().trim();
      var qty        = Number(rows[i][5]) || 0;
      if (!rawMachine || !rawShift || !vf || qty === 0) continue;
 
      var mcode = (typeof MCODE_ !== 'undefined' && MCODE_[rawMachine]) ? MCODE_[rawMachine] : rawMachine;
      var shift = normaliseShift_(rawShift);
      var wt = partsMap[vf] || 0;
      var kg = qty * wt;
      if (kg <= 0) continue;
      var dateKey = Utilities.formatDate(date, 'Asia/Kolkata', 'yyyy-MM-dd');
      var key = dateKey + '|' + mcode + '|' + shift;
      agg[key] = (agg[key] || 0) + kg;
    }
  }
 
  processTab('RAW_FORGE');
  processTab('RAW_PRESS');
 
  // 4. Build sorted output (date asc, then machine, then shift)
  var SHIFT_ORD = {'First Shift': 1, 'Second Shift': 2, 'Third Shift': 3};
  var keys = Object.keys(agg).sort(function(a, b){
    var ap = a.split('|'), bp = b.split('|');
    if (ap[0] !== bp[0]) return ap[0] < bp[0] ? -1 : 1;
    if (ap[1] !== bp[1]) return ap[1] < bp[1] ? -1 : 1;
    return (SHIFT_ORD[ap[2]] || 9) - (SHIFT_ORD[bp[2]] || 9);
  });
 
  var out = keys.map(function(k){
    var p = k.split('|');
    return [new Date(p[0]), p[1], p[2], Math.round(agg[k])];
  });
 
  // 5. Clear old data + write new (only cols A-D; col E is ARRAYFORMULA)
  var lastRow = sh.getLastRow();
  if (lastRow > 2) {
    sh.getRange(3, 1, lastRow - 2, 4).clearContent();
  }
  if (out.length > 0) {
    sh.getRange(3, 1, out.length, 4).setValues(out);
  }
  Logger.log('SHIFT_OUTPUT_KG: ' + out.length + ' rows written (last 30 days)');
}
 
 
// ═══════════════════════════════════════════════════════════════════════════
// BLOCK 2 — NEW function: colorForgeDailyCells_()
//             Paste right after BLOCK 1
//             Adds red/green/grey background to FORGE and PRESS cells in
//             the Daily Overview tab. Reads thresholds from CONFIG_TARGETS,
//             reads kg from SHIFT_OUTPUT_KG (just-written by BLOCK 1).
// ═══════════════════════════════════════════════════════════════════════════
function colorForgeDailyCells_() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var doSh = ss.getSheetByName('Daily Overview');
  if (!doSh) { Logger.log('Daily Overview missing — skip color sweep'); return; }
 
  // 1. Load thresholds from CONFIG_TARGETS
  var targets = {};
  var ctSh = ss.getSheetByName('CONFIG_TARGETS');
  if (!ctSh || ctSh.getLastRow() < 3) { Logger.log('CONFIG_TARGETS missing — skip'); return; }
  var ctData = ctSh.getRange(3, 1, ctSh.getLastRow() - 2, 2).getValues();
  ctData.forEach(function(r){
    var m = (r[0] || '').toString().trim();
    var t = Number(r[1]) || 0;
    if (m && t > 0) targets[m] = t;
  });
 
  // 2. Load kg map from SHIFT_OUTPUT_KG
  var soSh = ss.getSheetByName('SHIFT_OUTPUT_KG');
  if (!soSh || soSh.getLastRow() < 3) { Logger.log('SHIFT_OUTPUT_KG empty — skip'); return; }
  var soData = soSh.getRange(3, 1, soSh.getLastRow() - 2, 4).getValues();
  var kgMap = {};
  soData.forEach(function(r){
    if (!(r[0] instanceof Date)) return;
    var key = Utilities.formatDate(r[0], 'Asia/Kolkata', 'yyyy-MM-dd') + '|' +
              (r[1] || '').toString() + '|' + (r[2] || '').toString();
    kgMap[key] = Number(r[3]) || 0;
  });
 
  // 3. Scan Daily Overview for FORGE / PRESS shop blocks
  var doData = doSh.getDataRange().getValues();
  var todayStr = null, yestStr = null;
 
  for (var r = 0; r < doData.length; r++) {
    var s = (doData[r][0] || '').toString();
    var m = s.match(/TODAY[^0-9]*(\d{1,2}-[A-Za-z]{3}-\d{4})/);
    if (m) todayStr = m[1];
    m = s.match(/YESTERDAY[^0-9]*(\d{1,2}-[A-Za-z]{3}-\d{4})/);
    if (m) yestStr = m[1];
  }
  if (!todayStr) { Logger.log('Daily Overview: no TODAY date label found — skip'); return; }
 
function _parseDDMMM(s) {
    if (!s) return null;
    var m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (!m) return null;
    var months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    var mo = months[m[2].charAt(0).toUpperCase()+m[2].slice(1).toLowerCase()];
    if (mo === undefined) return null;
    return new Date(parseInt(m[3],10), mo, parseInt(m[1],10));
  }
  var todayKey = (function(){ var d=_parseDDMMM(todayStr); return d?Utilities.formatDate(d,'Asia/Kolkata','yyyy-MM-dd'):null; })();
  var yestKey  = (function(){ var d=_parseDDMMM(yestStr);  return d?Utilities.formatDate(d,'Asia/Kolkata','yyyy-MM-dd'):null; })();
 
  // 4. Find each shop block. After block label row, next row has machine codes (col C onwards).
  //    Then 3 shift rows (First/Second/Third) with cells in col C onwards.
  var SHOPS = ['FORGE', 'PRESS'];
  var SHIFT_LABELS = ['First Shift', 'Second Shift', 'Third Shift'];
  var COLOR_RED   = '#FFCDD2';
  var COLOR_GREEN = '#C8E6C9';
  var COLOR_GREY  = '#EEF0F3';
  var currDateKey = todayKey;
  var coloredCount = 0;
 
  for (var r = 0; r < doData.length; r++) {
    var label = (doData[r][0] || '').toString().toUpperCase();
    if (label.indexOf('YESTERDAY') >= 0) currDateKey = yestKey;
    else if (label.indexOf('TODAY') >= 0) currDateKey = todayKey;
 
    if (SHOPS.indexOf(label) === -1) continue;
    if (!currDateKey) continue;
 
    // Found a shop label row. Machine codes are in this row, cols C onwards.
    // Shift rows are r+1 (First), r+2 (Second), r+3 (Third). 1-indexed: row r+2/r+3/r+4.
    var headerVals = doData[r];   // 0-indexed
    var machineCols = [];
    for (var c = 2; c < headerVals.length; c++) {
      var raw = headerVals[c];
      if (raw === null || raw === '' || raw === undefined) continue;
      // Press codes may arrive as numbers (800, 1300...). Convert to string.
      var code = String(raw).trim();
      if (code) machineCols.push({ col: c + 1, code: code });
    }
 
    for (var s = 0; s < 3; s++) {
      var shiftRow = (r + 1) + 1 + s;   // sheet row (1-indexed): r+1 is shop row, +1 jumps to First, +s for shift
      machineCols.forEach(function(mc){
        var key = currDateKey + '|' + mc.code + '|' + SHIFT_LABELS[s];
        var kg = kgMap[key] || 0;
        var thr = targets[mc.code] || 0;
        var color = null;
        if (kg === 0) color = COLOR_GREY;
        else if (thr > 0 && kg < thr) color = COLOR_RED;
        else if (thr > 0 && kg >= thr) color = COLOR_GREEN;
        if (color) {
          try { doSh.getRange(shiftRow, mc.col).setBackground(color); coloredCount++; } catch(e){}
        }
      });
    }
  }
  Logger.log('Daily Overview color sweep: ' + coloredCount + ' cells painted');
}
 
 
// ═══════════════════════════════════════════════════════════════════════════
// BLOCK 3 — NEW function: readShiftStatusForCache_()
//             Paste right after BLOCK 2
//             Returns object: { "yyyy-MM-dd": { mcode: { "First Shift": "RED", ...}, ... }, ... }
//             Used by buildDashboardCache to emit shift_status into c1
// ═══════════════════════════════════════════════════════════════════════════
function readShiftStatusForCache_(ss) {
  var out = {};
  var soSh = ss.getSheetByName('SHIFT_OUTPUT_KG');
  if (!soSh || soSh.getLastRow() < 3) return out;
  var data = soSh.getRange(3, 1, soSh.getLastRow() - 2, 5).getValues();
  data.forEach(function(r){
    if (!(r[0] instanceof Date)) return;
    var dateKey = Utilities.formatDate(r[0], 'Asia/Kolkata', 'yyyy-MM-dd');
    var mcode = (r[1] || '').toString().trim();
    var shift = (r[2] || '').toString().trim();
    var status = (r[4] || '').toString().trim();   // col E = formula-derived status
    if (!mcode || !shift || !status) return;
    if (!out[dateKey]) out[dateKey] = {};
    if (!out[dateKey][mcode]) out[dateKey][mcode] = {};
    out[dateKey][mcode][shift] = status;
  });
  return out;
}
 
// ════════════════════════════════════════════════════════════════
// 7 — buildProductionMonthly()
// PRODUCTION_MONTHLY — all depts stacked, machine × day grid
// Inhouse and JWK as separate rows per machine
// Daily tonnage rows per dept (Inhouse tons | JWK tons)
// Deletes old separate monthly tabs
// ════════════════════════════════════════════════════════════════
function buildProductionMonthly() {
  var ss     = SpreadsheetApp.openById(DASH_ID);
  var mStart = getMonthStart_();
  var mEnd   = getMonthEnd_();
  var mLabel = Utilities.formatDate(mStart, 'Asia/Kolkata', 'MMM-yyyy');

  Logger.log('buildProductionMonthly → ' + mLabel);

  // Delete old separate tabs
  ['CUT_MONTHLY','FORGE_MONTHLY','PRESS_MONTHLY','MACHINE_MONTHLY','PARTWISE_MONTHLY']
    .forEach(function(t){ delTab_(ss, t); });

  var jwkSet   = loadJWKSet_(ss);
  var partsMap = loadPartsMap_(ss);

  // Day labels for this month
  var dayLabels = [];
  var cur = new Date(mStart);
  while (cur <= mEnd) {
    dayLabels.push(Utilities.formatDate(cur, 'Asia/Kolkata', 'dd-MMM'));
    cur.setDate(cur.getDate() + 1);
  }
  var nDays = dayLabels.length;

  // headers: Dept | Machine | Type | 01-Apr | ... | MONTH TOTAL | MONTH TONS
  var headers = ['Dept','Machine','Type'].concat(dayLabels).concat(['MONTH TOTAL','MONTH TONS']);
  var dataRows  = [];   // flat array of arrays for writing
  var metaRows  = [];   // parallel array of { isTonsRow, isJWK, isSpacer, missingPart }

  DEPT_DEFS_.forEach(function(def) {
    // Read this dept's RAW tab for the month
    // machData = { code: { type: { dayLabel: qty } } }
    var machData = readByMonthTyped_(ss, def.rawTab, mStart, mEnd, jwkSet);

    // Also build per-VF data for tonnage calc
    // vfDayData = { code: { type: { dayLabel: { vf: qty } } } }
    var vfDayData = readByMonthVFLevel_(ss, def.rawTab, mStart, mEnd, jwkSet);

    // deptDayKg = { 'Inhouse': { dayLabel: kg }, 'JWK': { dayLabel: kg } }
    var deptDayKg = { 'Inhouse': {}, 'JWK': {} };

    def.machines.forEach(function(code) {
      var types = def.hasJWK ? ['Inhouse','JWK'] : ['Inhouse'];
      types.forEach(function(type) {
        var dayMap  = (machData[code] || {})[type] || {};
        var hasData = dayLabels.some(function(d){ return (dayMap[d]||0) > 0; });
        if (!hasData) return; // skip rows with no data

        var row        = [def.dept, code, type];
        var monthTotal = 0;
        var monthKg    = 0;
        var missingPt  = false;

        dayLabels.forEach(function(day) {
          var qty = dayMap[day] || 0;
          monthTotal += qty;

          // Daily tonnage — from VF level data
          var vfMap = ((vfDayData[code] || {})[type] || {})[day] || {};
          var dayKg = 0;
          Object.keys(vfMap).forEach(function(vf) {
            var q    = vfMap[vf];
            var part = partsMap[vf];
            if (!part || part.finWt === 0) { missingPt = true; return; }
            var kg = q * part.finWt;
            dayKg    += kg;
            monthKg  += kg;
            if (!deptDayKg[type][day]) deptDayKg[type][day] = 0;
            deptDayKg[type][day] += kg;
          });

          // Cell: stacked VF -> qty (same format as Daily Overview)
          var cellText = '';
          if (qty > 0) {
            var vfKeys = Object.keys(vfMap).sort(function(a,b){
              return (parseInt(a.replace(/\D/g,''))||0)-(parseInt(b.replace(/\D/g,''))||0);
            });
            if (vfKeys.length === 0) {
              cellText = qty.toLocaleString('en-IN');
            } else if (vfKeys.length === 1) {
              cellText = vfKeys[0] + ' -> ' + (vfMap[vfKeys[0]]||qty).toLocaleString('en-IN');
            } else {
              var lines = [];
              vfKeys.forEach(function(vf){ lines.push(vf + ' -> ' + vfMap[vf].toLocaleString('en-IN')); });
              lines.push('------------');
              lines.push('Total -> ' + qty.toLocaleString('en-IN'));
              cellText = lines.join('\n');
            }
          }
          row.push(cellText);
        });

        row.push(monthTotal > 0 ? monthTotal : '');
        row.push(monthKg   > 0 ? fmtTons_(monthKg) : (missingPt ? '⚠ check parts' : ''));

        dataRows.push(row);
        metaRows.push({ isTonsRow:false, isJWK:type==='JWK', isSpacer:false, missingPart:missingPt });
      });
    });

    // Daily tons rows per dept
    var tTypes = def.hasJWK ? ['Inhouse','JWK'] : ['Inhouse'];
    tTypes.forEach(function(type) {
      var tMap       = deptDayKg[type] || {};
      var hasAnyTons = Object.keys(tMap).some(function(d){ return tMap[d] > 0; });
      if (!hasAnyTons && type === 'JWK') return;

      var label    = def.dept + ' DAILY TONS' + (def.hasJWK ? ' \u2014 ' + type : '');
      var tonsRow  = [label, '', ''];
      var totalKg  = 0;
      dayLabels.forEach(function(day) {
        var kg = tMap[day] || 0;
        totalKg += kg;
        tonsRow.push(kg > 0 ? fmtTons_(kg) : '');
      });
      tonsRow.push(''); // no qty total for tons row
      tonsRow.push(totalKg > 0 ? fmtTons_(totalKg) : '');
      dataRows.push(tonsRow);
      metaRows.push({ isTonsRow:true, isJWK:type==='JWK', isSpacer:false, missingPart:false });
    });

    // Spacer between depts
    dataRows.push(new Array(headers.length).fill(''));
    metaRows.push({ isTonsRow:false, isJWK:false, isSpacer:true, missingPart:false });
  });

  var title = 'PRODUCTION_MONTHLY \u2014 ' + mLabel + '   |   Updated: ' +
              Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy HH:mm');
  var sh = writeTab_(ss, 'PRODUCTION_MONTHLY', headers, dataRows, title);

  // ── Post-formatting ──
  sh.setFrozenRows(2);
  sh.setFrozenColumns(3);
  sh.getRange(3,1,dataRows.length,1).setFontWeight('bold'); // Dept col bold

  metaRows.forEach(function(meta, i) {
    var shRow = 3 + i;
    if (meta.isSpacer) {
      sh.getRange(shRow,1,1,headers.length).setBackground('#EEEEEE');
    } else if (meta.isTonsRow) {
      var bg = meta.isJWK ? '#FFF3E0' : '#E8F5E9';
      sh.getRange(shRow,1,1,headers.length)
        .setFontWeight('bold').setBackground(bg).setFontStyle('italic');
    } else if (meta.isJWK) {
      sh.getRange(shRow,1,1,headers.length).setBackground('#FFF8E1');
    }
    if (meta.missingPart) {
      sh.getRange(shRow, headers.length, 1, 1)
        .setBackground('#FFCDD2').setFontColor('#B71C1C').setFontWeight('bold');
      sh.getRange(shRow, 2, 1, 1)
        .setNote('\u26A0 Finish weight missing in Parts Master for one or more VF numbers. Update RAW_PARTS.');
    }
  });

  // Text wrap for VF-stacked day cells (cols 4 to nDays+3)
  if (dataRows.length > 0) {
    sh.getRange(3, 4, dataRows.length, nDays)
      .setWrap(true).setVerticalAlignment('top')
      .setFontFamily('Courier New').setFontSize(8);
  }

  // MONTH TOTAL + MONTH TONS columns highlight
  sh.getRange(3, headers.length-1, dataRows.length, 2).setFontWeight('bold');

  Logger.log('buildProductionMonthly complete \u2192 ' + mLabel + ' | ' + dataRows.length + ' rows');
}

// Read RAW tab for month → { code: { type: { dayLabel: qty } } }
function readByMonthTyped_(ss, tabName, mStart, mEnd, jwkSet) {
  var out = {};
  if (!tabName) return out;
  var sh = ss.getSheetByName(tabName);
  if (!sh) return out;
  var sc   = schema_(tabName);
  var vals = sh.getDataRange().getValues();
  for (var r = 2; r < vals.length; r++) {
    var row = vals[r];
    if (!row[0]) continue;
    var d = parseDate_(row[0]);
    if (!d || d < mStart || d > mEnd) continue;
    var code = MCODE_[(row[1]||'').toString().trim()];
    if (!code) continue;
    var vf  = (row[sc.vf]  || '').toString().trim();
    var qty = Number(row[sc.qty]) || 0;
    if (!vf || vf.toUpperCase() === 'VF0' || qty === 0) continue;
    var type = getType_(row, sc, jwkSet);
    var day  = Utilities.formatDate(d, 'Asia/Kolkata', 'dd-MMM');
    if (!out[code])             out[code] = {};
    if (!out[code][type])       out[code][type] = {};
    if (!out[code][type][day])  out[code][type][day] = 0;
    out[code][type][day] += qty;
  }
  return out;
}

// Read RAW tab for month → { code: { type: { dayLabel: { vf: qty } } } }
function readByMonthVFLevel_(ss, tabName, mStart, mEnd, jwkSet) {
  var out = {};
  if (!tabName) return out;
  var sh = ss.getSheetByName(tabName);
  if (!sh) return out;
  var sc   = schema_(tabName);
  var vals = sh.getDataRange().getValues();
  for (var r = 2; r < vals.length; r++) {
    var row = vals[r];
    if (!row[0]) continue;
    var d = parseDate_(row[0]);
    if (!d || d < mStart || d > mEnd) continue;
    var code = MCODE_[(row[1]||'').toString().trim()];
    if (!code) continue;
    var vf  = (row[sc.vf]  || '').toString().trim();
    var qty = Number(row[sc.qty]) || 0;
    if (!vf || vf.toUpperCase() === 'VF0' || qty === 0) continue;
    var type = getType_(row, sc, jwkSet);
    var day  = Utilities.formatDate(d, 'Asia/Kolkata', 'dd-MMM');
    if (!out[code])                  out[code] = {};
    if (!out[code][type])            out[code][type] = {};
    if (!out[code][type][day])       out[code][type][day] = {};
    if (!out[code][type][day][vf])   out[code][type][day][vf] = 0;
    out[code][type][day][vf] += qty;
  }
  return out;
}


// ════════════════════════════════════════════════════════════════
// 8 — buildWIPSummary()
// WIP_SUMMARY tab — VF level month-to-date intelligence
//
// Columns:
//   VF_No | Cut MTD | Forge MTD | Press MTD |
//   Cut WIP | FG WIP | Dispatched MTD | Closing WIP |
//   Opening WIP (blank — to be added later once physically verified)
//
// Logic:
//   Cut WIP    = Cut MTD − (Forge MTD + Press MTD)
//                Parts cut but not yet forged or pressed
//   FG WIP     = (Forge MTD + Press MTD) − Dispatched MTD
//                Finished goods sitting in store, not yet shipped
//   Closing WIP = Cut WIP + FG WIP
//                 Total inventory of this VF as of today
//
// Highlighted rows:
//   Red    = Cut WIP negative (more forged than cut — data gap or opening stock used)
//   Orange = FG WIP high (>500 pcs sitting — review dispatch)
//   Green  = Closing WIP = 0 (fully dispatched, clean)
// ════════════════════════════════════════════════════════════════
function buildWIPSummary() {
  var ss     = SpreadsheetApp.openById(DASH_ID);
  var mStart = getMonthStart_();
  var mEnd   = getMonthEnd_();
  var mLabel = Utilities.formatDate(mStart, 'Asia/Kolkata', 'MMM-yyyy');

  Logger.log('buildWIPSummary → ' + mLabel);

  // Read MTD totals per VF from each RAW tab
  var cutTotals   = readVFTotals_(ss, 'RAW_CUTTING',  mStart, mEnd);
  var forgeTotals = readVFTotals_(ss, 'RAW_FORGE',    mStart, mEnd);
  var pressTotals = readVFTotals_(ss, 'RAW_PRESS',    mStart, mEnd);
  var dispTotals  = readDispatchTotals_(ss, mStart, mEnd);

  // All unique VFs across all four sources
  var allVFs = {};
  [cutTotals, forgeTotals, pressTotals, dispTotals].forEach(function(m){
    Object.keys(m).forEach(function(vf){ allVFs[vf] = true; });
  });

  // Sort by VF number
  var vfList = Object.keys(allVFs).sort(function(a,b){
    return (parseInt(a.replace(/\D/g,''),10)||0)-(parseInt(b.replace(/\D/g,''),10)||0);
  });

  var headers = [
    'VF_No',
    'Opening WIP',    // Blank — to be imported once physically verified
    'Cut MTD',
    'Forge MTD',
    'Press MTD',
    'Cut WIP',        // Opening WIP + Cut MTD - (Forge + Press)
    'FG WIP',         // (Forge + Press) - Dispatched
    'Dispatched MTD',
    'Closing WIP'     // Cut WIP + FG WIP
  ];

  var dataRows  = [];
  var flagRows  = []; // { rowIdx, color }
  var colSums   = [0,0,0,0,0,0,0]; // cut, forge, press, cutWIP, fgWIP, disp, closing

  vfList.forEach(function(vf) {
    var cut   = cutTotals[vf]   || 0;
    var forge = forgeTotals[vf] || 0;
    var press = pressTotals[vf] || 0;
    var disp  = dispTotals[vf]  || 0;

    var produced  = forge + press;          // total forged/pressed
    var cutWIP    = cut - produced;         // in-process between cutting and forging/pressing
    var fgWIP     = produced - disp;        // finished but not dispatched
    var closing   = cutWIP + fgWIP;         // = cut - disp (total net inventory)

    colSums[0] += cut;   colSums[1] += forge; colSums[2] += press;
    colSums[3] += cutWIP; colSums[4] += fgWIP;
    colSums[5] += disp;  colSums[6] += closing;

    var rowIdx = dataRows.length;
    dataRows.push([
      vf,
      '',             // Opening WIP — blank until physical verification done
      cut   || '',
      forge || '',
      press || '',
      cutWIP  !== 0 ? cutWIP  : '',
      fgWIP   !== 0 ? fgWIP   : '',
      disp    || '',
      closing !== 0 ? closing : ''
    ]);

    // Flag logic
    if (cutWIP < 0) {
      flagRows.push({ rowIdx:rowIdx, color:'#FFCDD2', note:'Cut WIP negative — more forged/pressed than cut this month. Check if opening stock was used.' });
    } else if (fgWIP > 500) {
      flagRows.push({ rowIdx:rowIdx, color:'#FFF3E0', note:'FG WIP > 500 pcs — high finished goods. Review dispatch plan.' });
    } else if (closing === 0 && (cut > 0 || forge > 0 || press > 0)) {
      flagRows.push({ rowIdx:rowIdx, color:'#E8F5E9', note:'Fully dispatched this month.' });
    }
  });

  // Grand total row
  dataRows.push([
    'GRAND TOTAL',
    '',             // Opening WIP — blank
    colSums[0]||'', colSums[1]||'', colSums[2]||'',
    colSums[3]||'', colSums[4]||'',
    colSums[5]||'', colSums[6]||''
  ]);

  var title = 'WIP_SUMMARY \u2014 ' + mLabel +
              '   |   VF Count: ' + vfList.length +
              '   |   Updated: ' + Utilities.formatDate(new Date(),'Asia/Kolkata','dd-MMM-yyyy HH:mm') +
              '   |   Opening WIP: to be added after physical verification';

  var sh = writeTab_(ss, 'WIP_SUMMARY', headers, dataRows, title);
  sh.setFrozenRows(2);
  // setFrozenColumns skipped — title row 1 is merged, conflicts with column freeze

  // Header colour overrides for WIP cols
  sh.getRange(2,1,1,headers.length).setBackground('#1565C0').setFontColor('#FFFFFF').setFontWeight('bold');
  sh.getRange(2,2,1,1).setBackground('#4A148C').setFontColor('#FFFFFF'); // Opening WIP = purple
  sh.getRange(2,6,1,2).setBackground('#E65100').setFontColor('#FFFFFF'); // Cut WIP + FG WIP = orange
  sh.getRange(2,9,1,1).setBackground('#1B5E20').setFontColor('#FFFFFF'); // Closing WIP = dark green

  // VF_No and key cols bold
  sh.getRange(3, 1, dataRows.length, 1).setFontWeight('bold');
  sh.getRange(3, 6, dataRows.length, 4).setFontWeight('bold'); // WIP cols

  // Grand total row
  var lastRow = 2 + dataRows.length;
  sh.getRange(lastRow,1,1,headers.length)
    .setFontWeight('bold').setBackground('#FFF9C4');

  // Row highlights
  flagRows.forEach(function(f){
    sh.getRange(3 + f.rowIdx, 1, 1, headers.length).setBackground(f.color);
    if (f.note) sh.getRange(3 + f.rowIdx, 1).setNote(f.note);
  });

  Logger.log('buildWIPSummary complete \u2192 ' + vfList.length + ' VFs | ' + mLabel);
}

// Read VF totals from any RAW tab for the month → { vfNo: qty }
function readVFTotals_(ss, tabName, mStart, mEnd) {
  var out = {};
  var sh  = ss.getSheetByName(tabName);
  if (!sh) { Logger.log('WARN readVFTotals_: ' + tabName + ' not found'); return out; }
  var sc   = schema_(tabName);
  var vals = sh.getDataRange().getValues();
  for (var r = 2; r < vals.length; r++) {
    var row = vals[r];
    if (!row[0]) continue;
    var d = parseDate_(row[0]);
    if (!d || d < mStart || d > mEnd) continue;
    var vf  = (row[sc.vf]  || '').toString().trim();
    var qty = Number(row[sc.qty]) || 0;
    if (!vf || vf.toUpperCase() === 'VF0' || qty === 0) continue;
    if (!out[vf]) out[vf] = 0;
    out[vf] += qty;
  }
  return out;
}

// Read dispatch totals for the month → { vfNo: qty }
// RAW_DISPATCH schema: Date | Dispatch_Type | Customer | VF_No | Qty | ...
function readDispatchTotals_(ss, mStart, mEnd) {
  var out = {};
  var sh  = ss.getSheetByName('RAW_DISPATCH');
  if (!sh) { Logger.log('WARN: RAW_DISPATCH not found'); return out; }
  var vals = sh.getDataRange().getValues();
  for (var r = 2; r < vals.length; r++) {
    var row = vals[r];
    if (!row[0]) continue;
    var d = parseDate_(row[0]);
    if (!d || d < mStart || d > mEnd) continue;
    var vf  = (row[3] || '').toString().trim(); // col[3] = VF_No in RAW_DISPATCH
    var qty = Number(row[4]) || 0;              // col[4] = Qty
    if (!vf || vf.toUpperCase() === 'VF0' || qty === 0) continue;
    if (!out[vf]) out[vf] = 0;
    out[vf] += qty;
  }
  return out;
}



// ════════════════════════════════════════════════════════════════
// 10 — buildScheduleIntelligence()
// SCHEDULE_INTELLIGENCE tab — per VF, per month:
//   Schedule Qty | Produced MTD | Dispatched MTD |
//   Balance to Produce | Balance to Dispatch |
//   RM Required (kg) | Schedule Tons | Schedule Turnover
//
// Production = Forge MTD + Press MTD (exit from production shop)
// Month matched by full month name e.g. "April" from RAW_SCHEDULE
// ════════════════════════════════════════════════════════════════
function buildScheduleIntelligence() {
  var ss     = SpreadsheetApp.openById(DASH_ID);
  var mStart = getMonthStart_();
  var mEnd   = getMonthEnd_();
  var mLabel = Utilities.formatDate(mStart, 'Asia/Kolkata', 'MMM-yyyy');

  var monthNames = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
  var currentMonthName = monthNames[mStart.getMonth()];

  var partsMap = loadPartsMap_(ss);

  var schedSh = ss.getSheetByName('RAW_SCHEDULE');
  if (!schedSh) { Logger.log('ERROR: RAW_SCHEDULE not found'); return; }
  var schedVals = schedSh.getDataRange().getValues();

  var schedMap = {}; 
  for (var r = 2; r < schedVals.length; r++) {
    var row = schedVals[r];
    var vf  = (row[0] || '').toString().trim();
    var qty = Number(row[1]) || 0;
    var month = (row[2] || '').toString().trim();
    if (!vf || month !== currentMonthName || qty === 0) continue;
    if (schedMap[vf]) { schedMap[vf].qty += qty; } else { schedMap[vf] = { qty: qty }; }
  }

  var forgeTotals = readVFTotals_(ss, 'RAW_FORGE', mStart, mEnd);
  var pressTotals = readVFTotals_(ss, 'RAW_PRESS',  mStart, mEnd);
  var cutTotals   = readVFTotals_(ss, 'RAW_CUTTING', mStart, mEnd);
  var dispTotals  = readDispatchTotals_(ss, mStart, mEnd);

  var allVFs = {};
  [schedMap, forgeTotals, pressTotals, cutTotals, dispTotals].forEach(function(m){
    Object.keys(m).forEach(function(vf){ allVFs[vf] = true; });
  });

  var vfList = Object.keys(allVFs).sort(function(a,b){
    return (parseInt(a.replace(/\D/g,''),10)||0)-(parseInt(b.replace(/\D/g,''),10)||0);
  });

  // NEW HEADERS: Separating Unplanned Prod from Unplanned Disp
  var headers = [
    'VF_No', 'Schedule Qty', 'Unplanned Prod Qty', 'Unplanned Disp Qty', 'Target Qty', 
    'Cut MTD', 'Produced MTD', 'Dispatched MTD', 'Balance to Produce', 'Balance to Dispatch', 
    'RM Required (kg)', 'Production %', 'Dispatch %', 'Unit Price', 
    'Expected Turnover', 'Actual Turnover'
  ];

  var dataRows  = [];
  var flagRows  = [];
  var colTotals = new Array(headers.length).fill(0);
  var colTons   = new Array(headers.length).fill(0); 

  vfList.forEach(function(vf) {
    var sched        = schedMap[vf] || {};
    var schedFormQty = sched.qty       || 0;
    var cutQty       = cutTotals[vf]   || 0;
    var forge        = forgeTotals[vf] || 0;
    var press        = pressTotals[vf] || 0;
    var produced     = forge + press;
    var disp         = dispTotals[vf]  || 0;

    var part        = partsMap[vf] || {};
    var inputWt     = part.inputWt || 0;
    var finWt       = part.finWt   || 0;
    var unitPrice   = part.unitPrice || 0; 

    // --- NEW SPLIT LOGIC ---
    // 1. Unplanned Production (Forged more than scheduled)
    var unplannedProd = produced > schedFormQty ? produced - schedFormQty : 0;
    
    // 2. Unplanned Dispatch (Shipped more than was produced + scheduled this month -> Inventory)
    var currentPotential = Math.max(schedFormQty, produced);
    var unplannedDisp = disp > currentPotential ? disp - currentPotential : 0;

    // 3. Final Target (Total activity)
    var targetQty    = schedFormQty + unplannedProd + unplannedDisp;

    // Balances
    var balProduce  = schedFormQty > produced ? schedFormQty - produced : 0;
    var balDispatch = targetQty > disp ? targetQty - disp : 0; 

    var rmRequired  = balProduce > 0 ? Math.round(balProduce * inputWt) : 0;
    
    // Production %: How much of the forged target did we hit?
    var prodPct = targetQty > 0 ? Math.round((produced / (schedFormQty + unplannedProd)) * 100) : '';
    if (schedFormQty === 0 && produced === 0 && unplannedDisp > 0) prodPct = 0; // It's just an inventory move

    // Dispatch %: How much of the total activity target did we ship?
    var dispPct = targetQty > 0 ? Math.round((disp / targetQty) * 100) : '';

    var expTov      = targetQty * unitPrice;
    var actualTov   = Math.round(disp * unitPrice);

    // Totals Mapping
    colTotals[1]+=schedFormQty; colTotals[2]+=unplannedProd; colTotals[3]+=unplannedDisp; colTotals[4]+=targetQty;
    colTotals[5]+=cutQty; colTotals[6]+=produced; colTotals[7]+=disp;
    colTotals[8]+=balProduce; colTotals[9]+=balDispatch; colTotals[10]+=rmRequired;
    colTotals[14]+=expTov; colTotals[15]+=actualTov;

    var tonConv = finWt / 1000;
    colTons[1]+=schedFormQty*tonConv; colTons[2]+=unplannedProd*tonConv; colTons[3]+=unplannedDisp*tonConv;
    colTons[4]+=targetQty*tonConv; colTons[5]+=cutQty*tonConv; colTons[6]+=produced*tonConv;
    colTons[7]+=disp*tonConv; colTons[8]+=balProduce*tonConv; colTons[9]+=balDispatch*tonConv;

    var rowIdx = dataRows.length;
    dataRows.push([
      vf, schedFormQty || 0, unplannedProd || 0, unplannedDisp || 0, targetQty || 0,
      cutQty || 0, produced || 0, disp || 0, balProduce, balDispatch, rmRequired || 0,
      prodPct !== '' ? prodPct + '%' : '', dispPct !== '' ? dispPct + '%' : '',
      unitPrice || 0, expTov || 0, actualTov || 0
    ]);

    // Flag Logic
    if (unplannedDisp > 0 && produced === 0) {
      flagRows.push({ rowIdx:rowIdx, color:'#F5F5F5', note:'⬜ Pure Inventory Dispatch' });
    } else if (schedFormQty > 0 && produced === 0) {
      flagRows.push({ rowIdx:rowIdx, color:'#FFCDD2', note:'🟥 Schedule Missed' });
    } else if (unplannedProd > 0 && disp < produced) {
      flagRows.push({ rowIdx:rowIdx, color:'#FFE0B2', note:'🟧 Unplanned Prod: Pending Dispatch' });
    } else if (unplannedProd > 0 && disp >= produced) {
      flagRows.push({ rowIdx:rowIdx, color:'#E3F2FD', note:'🟦 Unplanned Prod: Fully Dispatched' });
    } else if (prodPct !== '' && prodPct >= 100) {
      flagRows.push({ rowIdx:rowIdx, color:'#E8F5E9', note:'🟩 Target Achieved' });
    }
  });

  dataRows.push(['GRAND TOTAL (PIECES)', colTotals[1], colTotals[2], colTotals[3], colTotals[4], colTotals[5], colTotals[6], colTotals[7], colTotals[8], colTotals[9], colTotals[10], '', '', '', colTotals[14], colTotals[15]]);
  dataRows.push(['GRAND TOTAL (TONS)', Number(colTons[1].toFixed(2)), Number(colTons[2].toFixed(2)), Number(colTons[3].toFixed(2)), Number(colTons[4].toFixed(2)), Number(colTons[5].toFixed(2)), Number(colTons[6].toFixed(2)), Number(colTons[7].toFixed(2)), Number(colTons[8].toFixed(2)), Number(colTons[9].toFixed(2)), Number((colTotals[10]/1000).toFixed(2)), '', '', '', '', '']);

  var title = 'SCHEDULE_INTELLIGENCE — ' + currentMonthName + ' ' + mStart.getFullYear() +
              '   |   LEGEND: 🟥 Missed   🟩 Done   🟧 Unplanned(Pending Disp)   🟦 Unplanned(Done)   ⬜ Inventory Only' +
              '   |   Updated: ' + Utilities.formatDate(new Date(),'Asia/Kolkata','dd-MMM-yyyy HH:mm');

  var sh = writeTab_(ss, 'SCHEDULE_INTELLIGENCE', headers, dataRows, title);
  sh.getRange(1, 1, 1, headers.length).mergeAcross().setHorizontalAlignment('center');
  sh.setFrozenRows(2);
  sh.setColumnWidth(1, 90);
  sh.getRange(3, 2, dataRows.length, 10).setNumberFormat('#,##0'); 
  sh.getRange(3, 14, dataRows.length, 3).setNumberFormat('#,##0.00');
  sh.getRange(2,1,1,headers.length).setBackground('#1565C0').setFontColor('#FFFFFF').setFontWeight('bold');
  sh.getRange(2,9,1,2).setBackground('#E65100').setFontColor('#FFFFFF'); // Balances
  sh.getRange(2,12,1,2).setBackground('#1B5E20').setFontColor('#FFFFFF'); // %
  sh.getRange(lastRow = 2 + dataRows.length - 1, 1, 2, headers.length).setFontWeight('bold').setBackground('#FFF9C4');
  flagRows.forEach(function(f){ sh.getRange(3+f.rowIdx,1,1,headers.length).setBackground(f.color); });
}

// ════════════════════════════════════════════════════════════════
// 9 — MANUAL TEST RUNNER
// ════════════════════════════════════════════════════════════════


function testAllThree_() {
  Logger.log('=== MANUAL TEST RUN ===');
  try { refreshDailyOverview();        Logger.log('\u2705 Daily Overview done');         } catch(e) { Logger.log('\u274C Daily Overview FAILED: '         + e); }
  try { buildProductionMonthly();      Logger.log('\u2705 Production Monthly done');     } catch(e) { Logger.log('\u274C Production Monthly FAILED: '     + e); }
  try { buildWIPSummary();             Logger.log('\u2705 WIP Summary done');            } catch(e) { Logger.log('\u274C WIP Summary FAILED: '            + e); }
  try { buildScheduleIntelligence();   Logger.log('\u2705 Schedule Intelligence done'); } catch(e) { Logger.log('\u274C Schedule Intelligence FAILED: '  + e); }
  try { buildFYMonthly();              Logger.log('\u2705 FY Monthly done');             } catch(e) { Logger.log('\u274C FY Monthly FAILED: '             + e); }
  try { buildSteelStock();             Logger.log('\\u2705 Steel Stock done');            } catch(e) { Logger.log('\\u274C Steel Stock FAILED: '            + e); }
  try { buildF4Reconciliation();        Logger.log('\u2705 F4 Recon done');          } catch(e) { Logger.log('\u274C F4 Recon FAILED: '         + e); }
  try { buildMarginsSummary();          Logger.log('\u2705 Margins done');             } catch(e) { Logger.log('\u274C Margins FAILED: '            + e); }
  try { buildElecSummary();             Logger.log('\u2705 Elec Summary done');       } catch(e) { Logger.log('\u274C Elec Summary FAILED: '       + e); }
  try { buildOilSummary();              Logger.log('\u2705 Oil Summary done');        } catch(e) { Logger.log('\u274C Oil Summary FAILED: '        + e); }
  try { buildTransportSummary();        Logger.log('\u2705 Transport Summary done');  } catch(e) { Logger.log('\u274C Transport Summary FAILED: '  + e); }
  try { buildAlertsActive();            Logger.log('\u2705 Alerts Active done');      } catch(e) { Logger.log('\u274C Alerts Active FAILED: '      + e); }
  try { buildDeptScore();               Logger.log('\u2705 Dept Score done');         } catch(e) { Logger.log('\u274C Dept Score FAILED: '         + e); }
  try { buildDashboardCache();         Logger.log('\\u2705 Dashboard Cache done');       } catch(e) { Logger.log('\\u274C Dashboard Cache FAILED: '       + e); }
  try { hideRAWTabs();                 Logger.log('\u2705 RAW tabs hidden');             } catch(e) { Logger.log('\u274C hideRAWTabs FAILED: '            + e); }
  Logger.log('=== TEST RUN COMPLETE ===');
}

// ════════════════════════════════════════════════════════════
// SESSION 12 ADDITIONS (Die Life, Alerts, Opening WIP, Debit Notes)
// ════════════════════════════════════════════════════════════

function buildDieLife() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var partsMap = loadPartsMap_(ss);

  function processTab(tabName) {
    var sh = ss.getSheetByName(tabName);
    if (!sh || sh.getLastRow() < 3) return [];
    var rows = sh.getDataRange().getValues().slice(2);
    var sorted = rows.filter(function(r) {
      return r[0] && r[1] && r[4];
    }).sort(function(a, b) {
      var da = (a[0] instanceof Date) ? a[0] : new Date(a[0]);
      var db = (b[0] instanceof Date) ? b[0] : new Date(b[0]);
      return da - db;
    });
    return sorted.map(function(r) {
      var dt = (r[0] instanceof Date) ? r[0] : new Date(r[0]);
      return {
        date: dt, machine: (r[1] || '').toString().trim(),
        shift: (r[2] || '').toString().trim(),
        vf: (r[4] || '').toString().trim(), qty: Number(r[5]) || 0
      };
    });
  }

  var entries = processTab('RAW_FORGE').concat(processTab('RAW_PRESS'));
  entries.sort(function(a, b) { return a.date - b.date; });

  // Detect runs: same VF on same machine = one run. When VF changes, run ends.
  var machState = {}; // machine → {vf, startDate, endDate, days:{}, shifts:{}, totalPcs}
  var allRuns = [];

  entries.forEach(function(e) {
    var key = e.machine;
    var prev = machState[key];
    if (prev && prev.vf === e.vf) {
      // Continue run
      prev.endDate = e.date;
      var ds = Utilities.formatDate(e.date, 'Asia/Kolkata', 'yyyy-MM-dd');
      prev.days[ds] = true;
      prev.shifts[ds + '||' + e.shift] = true;
      prev.totalPcs += e.qty;
    } else {
      // End previous run if exists
      if (prev) {
        prev.status = 'COMPLETE';
        allRuns.push(prev);
      }
      // Start new run
      var ds = Utilities.formatDate(e.date, 'Asia/Kolkata', 'yyyy-MM-dd');
      machState[key] = {
        machine: e.machine, vf: e.vf,
        customer: (partsMap[e.vf] || {}).customer || '',
        startDate: e.date, endDate: e.date,
        days: {}, shifts: {}, totalPcs: e.qty, status: 'RUNNING'
      };
      machState[key].days[ds] = true;
      machState[key].shifts[ds + '||' + e.shift] = true;
    }
  });

  // Remaining running entries
  Object.values(machState).forEach(function(r) {
    allRuns.push(r);
  });

  // Write to DIE_LIFE tab
  var headers = ['Machine', 'VF_No', 'Customer', 'Run_Start', 'Run_End',
                 'Days', 'Shifts', 'Total_Pcs', 'Status'];
  var output = allRuns.map(function(r) {
    return [
      r.machine, r.vf, r.customer,
      r.startDate, r.status === 'RUNNING' ? '—' : r.endDate,
      Object.keys(r.days).length,
      Object.keys(r.shifts).length,
      r.totalPcs, r.status
    ];
  });

  var title = 'DIE LIFE — All Runs | Updated: ' + new Date();
  writeTab_(ss, 'DIE_LIFE', headers, output, title);
  Logger.log('DIE_LIFE: ' + output.length + ' runs (' +
    output.filter(function(r) { return r[8] === 'RUNNING'; }).length + ' running)');
}

// ── DEPT_SCORE FORMULA FIX (Item 9) ───────────────────────────────────────
// Run this ONCE from the Apps Script editor (select it in the function
// dropdown, click Run). It rewrites the "Rows with Data" column in
// DEPT_SCORE from COUNTA(all form submissions) to COUNTUNIQUE(unique dates),
// which is what "compliance" actually means. Also fixes the Grade column
// formula so it uses the corrected compliance %.
//
// HOW: SUMPRODUCT((range<>"")*1/COUNTIF(range,range&"")) counts unique
// non-blank values without requiring an array-formula entry — compatible
// with all Google Sheets formula modes.
//
// After running, do one buildDashboardCache() so the corrected scores
// propagate to the dashboard payload.
function fixDeptScoreFormulas_() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var dsSh = ss.getSheetByName('DEPT_SCORE');
  if (!dsSh) { Logger.log('❌ DEPT_SCORE sheet not found'); return; }

  // Department → RAW tab mapping. Date is always column A (A2:A) in every
  // RAW production tab. Non-production depts (Electricity, Oil) are excluded —
  // their RAW tabs hold meter/litre readings, not submission events.
  var DEPT_RAW = {
    'Cutting':          'RAW_CUTTING',
    'Forge':            'RAW_FORGE',
    'Forging':          'RAW_FORGE',
    'Press':            'RAW_PRESS',
    'Machine':          'RAW_MACHINE',
    'Machining':        'RAW_MACHINE',
    'HT':               'RAW_HT',
    'Heat Treatment':   'RAW_HT',
    'Final':            'RAW_FINAL',
    'Final Assembly':   'RAW_FINAL',
    'Manpower':         'RAW_MANPOWER_STAFF',
    'Staff Manpower':   'RAW_MANPOWER_STAFF',
    'Contract Manpower':'RAW_MANPOWER_CONTRACT'
  };

  var data = dsSh.getDataRange().getValues();
  var changed = 0;
  for (var r = 2; r < data.length; r++) {  // rows 0-1 are headers
    var dept = (data[r][0] || '').toString().trim();
    if (!dept) continue;
    var rawTab = DEPT_RAW[dept];
    if (!rawTab) {
      Logger.log('SKIP ' + dept + ' — no RAW tab mapped (electricity/oil excluded intentionally)');
      continue;
    }
    var shRow = r + 1; // 1-based sheet row

    // Col B: unique-date count using SUMPRODUCT division trick
    // (avoids ARRAYFORMULA; works in normal cell formula mode)
    var dateRange = "'" + rawTab + "'!A2:A";
    var countF = '=IFERROR(SUMPRODUCT((' + dateRange + '<>"")*1/COUNTIF(' + dateRange + ',' + dateRange + '&"")),0)';
    dsSh.getRange(shRow, 2).setFormula(countF);

    // Col D: compliance % = B / C — recalculate in case old formula was wrong
    dsSh.getRange(shRow, 4).setFormula('=IFERROR(ROUND(B' + shRow + '/C' + shRow + '*100,1),0)');

    // Col E: grade from compliance %
    dsSh.getRange(shRow, 5).setFormula(
      '=IF(D' + shRow + '>=95,"A+",' +
        'IF(D' + shRow + '>=85,"A",' +
          'IF(D' + shRow + '>=70,"B",' +
            'IF(D' + shRow + '>=50,"C","D"))))'
    );

    Logger.log('✅ Row ' + shRow + ': ' + dept + ' → ' + rawTab);
    changed++;
  }
  Logger.log('fixDeptScoreFormulas_() complete — fixed ' + changed + ' dept rows. Run buildDashboardCache() next.');
}


// ════════════════════════════════════════════════════════════════
// auditRawTabsForBadData_() — catches negative quantities that reach
// RAW tabs anyway (pull functions now reject them at the source — see
// the qty<0 guards added throughout the pull functions above — this is
// the belt-and-suspenders check for anything pasted directly into a RAW
// tab, or any pull function not yet covered by that fix).
// ════════════════════════════════════════════════════════════════
var SUBMISSION_AUDIT_TABS_ = [
  { tab: 'RAW_CUTTING',   qtyCol: 4, vfCol: 3 },
  { tab: 'RAW_FORGE',     qtyCol: 5, vfCol: 4 },
  { tab: 'RAW_PRESS',     qtyCol: 5, vfCol: 4 },
  { tab: 'RAW_MACHINE',   qtyCol: 5, vfCol: 4 },
  { tab: 'RAW_HT',        qtyCol: 3, vfCol: null },
  { tab: 'RAW_FINAL',     qtyCol: 4, vfCol: 3 },
  { tab: 'RAW_DISPATCH',  qtyCol: 4, vfCol: 3 },
  { tab: 'RAW_RM_INWARD', qtyCol: 5, vfCol: null }
];

function logSubmissionError_(ss, source, vf, qty, dateVal, reason) {
  var sh = ss.getSheetByName('SUBMISSION_ERRORS');
  if (!sh) {
    sh = ss.insertSheet('SUBMISSION_ERRORS');
    sh.getRange(1, 1, 1, 6).setValues([['Detected_At', 'Source_Tab', 'VF_No', 'Qty', 'Row_Date', 'Reason']])
      .setFontWeight('bold').setBackground('#B71C1C').setFontColor('#FFFFFF');
  }
  sh.appendRow([new Date(), source, vf || '', qty, dateVal || '', reason]);
}

// RAW tab → SUPERVISOR_MAP dept name (for Telegram bad-data alerts)
var RAW_TAB_TO_DEPT_ = {
  'RAW_CUTTING': 'Cutting',
  'RAW_FORGE':   'Forge',
  'RAW_PRESS':   'Press',
  'RAW_MACHINE': 'Machine',
  'RAW_HT':      'HT',
  'RAW_FINAL':   'Final'
  // RAW_DISPATCH and RAW_RM_INWARD have no department supervisor — alerts go to admin only
};

// Send a Telegram alert to the department supervisor when bad data is found.
// Deduped: one alert per (tab, vf, reason-type) per calendar day via Script Properties.
function notifyBadDataViaTelegram_(tab, vf, qty, dateVal, reason) {
  var dept = RAW_TAB_TO_DEPT_[tab];
  if (!dept) return; // no supervisor mapping for this tab

  // Dedup: store seen alert keys for today in Script Properties
  var todayKey = 'BAD_DATA_ALERTS_' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMdd');
  var props = PropertiesService.getScriptProperties();
  var sentToday = {};
  try { sentToday = JSON.parse(props.getProperty(todayKey) || '{}'); } catch(e) { sentToday = {}; }

  var alertKey = tab + '|' + (vf || 'NO_VF') + '|' + reason.substring(0, 20);
  if (sentToday[alertKey]) return; // already sent today

  // Fetch supervisor chat ID
  var sup;
  try { sup = getSupervisorForCurrentWeek_(dept); } catch(e) { return; }
  if (!sup || !sup.chatId) return;

  var dateStr = '';
  try {
    var d = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
    if (!isNaN(d.getTime())) dateStr = Utilities.formatDate(d, 'Asia/Kolkata', 'dd-MMM-yyyy');
  } catch(e) {}

  var msg = '⚠️ <b>Data Quality Alert — ' + dept + '</b>\n' +
    'Tab: ' + tab + '\n' +
    (vf ? 'VF No: ' + vf + '\n' : '') +
    'Qty: ' + qty + '\n' +
    (dateStr ? 'Date: ' + dateStr + '\n' : '') +
    'Issue: ' + reason + '\n\n' +
    'Please check and correct the submission. Contact DME if the data cannot be changed.';

  try { sendTelegramToChatId(sup.chatId, msg); } catch(e) { Logger.log('notifyBadDataViaTelegram_: send failed: ' + e); return; }

  sentToday[alertKey] = true;
  try { props.setProperty(todayKey, JSON.stringify(sentToday)); } catch(e) {}
  Logger.log('notifyBadDataViaTelegram_: alert sent to ' + sup.name + ' (' + dept + ') for ' + tab + '/' + vf);
}

function auditRawTabsForBadData_() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var flagged = 0;

  // Known VFs, for the "does this VF exist in master data" check below.
  var knownVFs = {};
  var partsSh = ss.getSheetByName('RAW_PARTS');
  if (partsSh && partsSh.getLastRow() >= 3) {
    partsSh.getDataRange().getValues().slice(2).forEach(function(r) {
      var vf = (r[1] || '').toString().trim();
      if (vf) knownVFs[vf] = true;
    });
  }
  var unknownVFsSeen = {}; // dedupe — don't log the same unknown VF 500 times across rows

  SUBMISSION_AUDIT_TABS_.forEach(function(cfg) {
    var sh = ss.getSheetByName(cfg.tab);
    if (!sh || sh.getLastRow() < 3) return;
    var data = sh.getDataRange().getValues();
    for (var r = 2; r < data.length; r++) {
      var qty = Number(data[r][cfg.qtyCol]);
      var vf = cfg.vfCol !== null ? (data[r][cfg.vfCol] || '').toString().trim() : '';

      if (!isNaN(qty) && qty < 0) {
        var reason = 'Negative quantity found in RAW tab';
        logSubmissionError_(ss, cfg.tab, vf, qty, data[r][0], reason);
        notifyBadDataViaTelegram_(cfg.tab, vf, qty, data[r][0], reason);
        flagged++;
      }
      if (vf && Object.keys(knownVFs).length > 0 && !knownVFs[vf] && vf.toUpperCase() !== 'VF0') {
        var dedupeKey = cfg.tab + '|' + vf;
        if (!unknownVFsSeen[dedupeKey]) {
          unknownVFsSeen[dedupeKey] = true;
          var unknownReason = 'VF_No not found in RAW_PARTS master data';
          logSubmissionError_(ss, cfg.tab, vf, data[r][cfg.qtyCol], data[r][0], unknownReason);
          notifyBadDataViaTelegram_(cfg.tab, vf, data[r][cfg.qtyCol], data[r][0], unknownReason);
          flagged++;
        }
      }
    }
  });
  if (flagged > 0) Logger.log('⚠ auditRawTabsForBadData_: ' + flagged + ' issue(s) flagged in SUBMISSION_ERRORS.');
}

// ════════════════════════════════════════════════════════════════
// flagLateSubmissions_() — week-level locking, FLAG not DIVERT
// ════════════════════════════════════════════════════════════════
// The audit's suggestion was to redirect backdated rows to a separate
// LATE_SUBMISSIONS tab instead of the main RAW tab. Deliberately NOT
// doing that: diverting live production data out of the calculation
// pipeline is a much bigger behavioral change than it sounds — if the
// cutoff is ever wrong for a legitimate case (a supervisor genuinely
// catching up after being on leave, e.g.), it would silently hide real
// production numbers from the dashboard rather than just flagging them.
// A review tab someone has to glance at is a much safer failure mode.
//
// IMPORTANT — this checks SUBMISSION lag, not row age: "late" means the
// FORM WAS FILLED IN more than LATE_SUBMISSION_DAYS_ after the work date
// it describes, not "this row is more than N days old" (RAW tabs hold a
// full FY of history — nearly every row would trip a plain age check,
// which isn't what "week-level locking" means). Google Forms always
// auto-stamps column A with the real submission Timestamp regardless of
// what the visible questions are, so this reads straight from each
// SOURCE form response sheet (not the already-pulled RAW_* tabs, which
// don't carry the original Timestamp column forward) and compares that
// Timestamp against the work-date column each pullDashXxx() function
// already uses.
var LATE_SUBMISSION_DAYS_ = 7;

var LATE_SUBMISSION_SOURCES_ = [
  { srcId: SRC_RM_INWARD,         tab: 'Form responses 1',      workDateCol: 2 },
  { srcId: SRC_57F4_OUT,          tab: 'Form responses 1',      workDateCol: 2 },
  { srcId: SRC_57F4_IN,           tab: 'Form responses 1',      workDateCol: 2 },
  { srcId: SRC_VENDOR_REJ,        tab: 'Form responses 1',      workDateCol: 0 },
  { srcId: SRC_PRODUCTION,        tab: 'Cutting Response',      workDateCol: 1 },
  { srcId: SRC_PRODUCTION,        tab: 'Press Shop',            workDateCol: 1 },
  { srcId: SRC_PRODUCTION,        tab: 'Forge Shop',            workDateCol: 1 },
  { srcId: SRC_PRODUCTION,        tab: 'HT Shop',                workDateCol: 1 },
  { srcId: SRC_PRODUCTION,        tab: 'Final Shop',            workDateCol: 1 },
  { srcId: SRC_MACHINE,           tab: 'Machine Shop Responses', workDateCol: 1 },
  { srcId: SRC_DISPATCH,          tab: 'Actual Dispatch',       workDateCol: 0 },
  { srcId: SRC_MANPOWER_DAILY,    tab: 'Form responses 1',      workDateCol: 0 },
  { srcId: SRC_MANPOWER_CONTRACT, tab: 'Form responses 1',      workDateCol: 1 }
];

function flagLateSubmissions_() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('LATE_SUBMISSIONS');
  if (!sh) sh = ss.insertSheet('LATE_SUBMISSIONS');
  sh.clearContents();
  sh.clearFormats();
  var headers = ['Source_Tab', 'Work_Date', 'Submitted_At', 'Days_Late'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#B45309').setFontColor('#FFFFFF');

  var flaggedRows = [];
  LATE_SUBMISSION_SOURCES_.forEach(function(cfg) {
    var srcSS, srcSh;
    try {
      srcSS = SpreadsheetApp.openById(cfg.srcId);
      srcSh = srcSS.getSheetByName(cfg.tab);
    } catch (e) { return; } // source sheet unreachable this run — skip, don't fail the whole audit
    if (!srcSh || srcSh.getLastRow() < 2) return;

    var data = srcSh.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var ts = row[0];
      var workDateRaw = row[cfg.workDateCol];
      if (!ts || !workDateRaw) continue;
      var tsDate = (ts instanceof Date) ? ts : new Date(ts);
      var workDate = (workDateRaw instanceof Date) ? workDateRaw : new Date(workDateRaw);
      if (isNaN(tsDate.getTime()) || isNaN(workDate.getTime())) continue;
      var daysLate = Math.round((tsDate.getTime() - workDate.getTime()) / 86400000);
      if (daysLate > LATE_SUBMISSION_DAYS_) {
        flaggedRows.push([cfg.tab, Utilities.formatDate(workDate, 'Asia/Kolkata', 'dd-MMM-yyyy'),
          Utilities.formatDate(tsDate, 'Asia/Kolkata', 'dd-MMM-yyyy HH:mm'), daysLate]);
      }
    }
  });

  if (flaggedRows.length > 0) {
    sh.getRange(2, 1, flaggedRows.length, headers.length).setValues(flaggedRows);
  } else {
    sh.getRange(2, 1).setValue('✅ No submissions filed more than ' + LATE_SUBMISSION_DAYS_ + ' days after their work date.');
  }
  sh.autoResizeColumns(1, headers.length);
  Logger.log('flagLateSubmissions_: ' + flaggedRows.length + ' submission(s) filed >' + LATE_SUBMISSION_DAYS_ + ' days late.');
}

// ════════════════════════════════════════════════════════════════
// TXN_WIP — NATIVE WIP LEDGER (first slice of the 8-table architecture)
// ════════════════════════════════════════════════════════════════
// WHY THIS EXISTS: buildWIPSummary() computes Closing WIP as
// (this month's Cut) - (this month's Dispatch) ONLY — it never reads
// Opening WIP at all, even though loadOpeningWIP() patches a number into
// the "Opening WIP" *display* column afterward. That patched number is
// cosmetic; it never enters the Closing WIP formula. Concretely, on this
// project's real WIP_SUMMARY data: VF287 shows Closing WIP = -1820 and
// VF112 M shows -392 — both are "this month's dispatch exceeded this
// month's cutting", which is completely normal if a large Opening WIP
// covered the gap, but WIP_SUMMARY has no way to say so because Opening
// WIP was never actually part of the sum.
//
// This function computes Closing WIP the only way that's actually
// correct for a stock balance: as a running ledger —
//   Closing WIP (as of today) = Opening WIP (physical count, 31-Mar-2026)
//                              + Cumulative Cut (Apr 1 -> today)
//                              - Cumulative Dispatch (Apr 1 -> today)
// — using the FULL FY-to-date window, not just the current month, because
// a stock balance cannot reset to zero every month while dispatches keep
// drawing down WIP that was built up in earlier months.
//
// Cut WIP / FG WIP stay as CURRENT-MONTH FLOW diagnostics (same meaning
// as buildWIPSummary() already gives them — "how much moved through each
// stage this month") since Opening WIP has no stage breakdown to split
// them by; only the cumulative Closing WIP figure is corrected.
//
// This does not replace buildWIPSummary() — it runs after it and
// overwrites the Opening WIP / Closing WIP columns with the corrected
// numbers, and additionally writes a TXN_WIP tab as an explicit ledger
// (one row per VF: opening, cumulative movements, closing) so the
// calculation is auditable rather than buried in overwritten cells.
function buildTxnWip_() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var openSh = ss.getSheetByName('OPENING_WIP_2627');
  var wipSh  = ss.getSheetByName('WIP_SUMMARY');
  if (!openSh) { Logger.log('buildTxnWip_: OPENING_WIP_2627 missing'); return; }
  if (!wipSh)  { Logger.log('buildTxnWip_: WIP_SUMMARY missing — run buildWIPSummary() first'); return; }

  // 1. Opening WIP per VF — physical count as of 31-Mar-2026, fixed for the FY.
  var openData = openSh.getDataRange().getValues();
  var openingMap = {};
  for (var i = 3; i < openData.length; i++) {
    var vf = (openData[i][0] || '').toString().trim();
    if (!vf) continue;
    var inhouse = Number(openData[i][3]) || 0;
    var vendor  = Number(openData[i][4]) || 0;
    openingMap[vf] = inhouse + vendor;
  }

  // 2. FY-to-date cumulative movement per VF (reusing the same readers
  // buildWIPSummary() uses, just with the full FY window instead of MTD).
  var today = new Date();
  var cumCut  = readVFTotals_(ss, 'RAW_CUTTING', FY_START, today);
  var cumDisp = readDispatchTotals_(ss, FY_START, today);

  // 3. Union of every VF that appears anywhere in the picture.
  var allVFs = {};
  Object.keys(openingMap).forEach(function(vf){ allVFs[vf] = true; });
  Object.keys(cumCut).forEach(function(vf){ allVFs[vf] = true; });
  Object.keys(cumDisp).forEach(function(vf){ allVFs[vf] = true; });
  var vfList = Object.keys(allVFs).sort();

  var ledgerRows = [];
  var closingByVF = {};
  vfList.forEach(function(vf) {
    var opening = openingMap[vf] || 0;
    var cut     = cumCut[vf]  || 0;
    var disp    = cumDisp[vf] || 0;
    var closing = opening + cut - disp;
    closingByVF[vf] = closing;
    ledgerRows.push([vf, opening, cut, disp, closing, FY_LABEL,
      Utilities.formatDate(today, 'Asia/Kolkata', 'dd-MMM-yyyy HH:mm')]);
  });

  // 4. Write TXN_WIP — the explicit, auditable ledger.
  var headers = ['VF_No', 'Opening_WIP_31Mar26', 'Cumulative_Cut_FYTD', 'Cumulative_Dispatch_FYTD', 'Closing_WIP', 'FY', 'As_Of'];
  writeToTab_(ss, 'TXN_WIP', headers, ledgerRows);

  // 5. Correct WIP_SUMMARY in place — Opening WIP (col B) and Closing WIP
  // (col I) now come from this ledger. Cut WIP / FG WIP (cols F/G) are
  // left untouched — they remain current-month flow diagnostics, not
  // stock balances, and this ledger doesn't have a stage-level opening
  // split to correct them with.
  var wipData = wipSh.getDataRange().getValues();
  var corrected = 0;
  for (var r = 2; r < wipData.length; r++) {
    var vfRow = (wipData[r][0] || '').toString().trim();
    if (!vfRow || vfRow === 'GRAND TOTAL') continue;
    if (closingByVF[vfRow] === undefined) continue;
    wipSh.getRange(r + 1, 2).setValue(openingMap[vfRow] || 0);   // Opening WIP
    wipSh.getRange(r + 1, 9).setValue(closingByVF[vfRow]);       // Closing WIP — now a real running balance
    corrected++;
  }

  Logger.log('buildTxnWip_: ' + vfList.length + ' VFs in ledger, ' + corrected + ' WIP_SUMMARY rows corrected with real running Closing WIP.');
}

function buildDebitNoteTracker() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var rejRows = rawRows_(ss, 'RAW_VENDOR_REJECTION');
  if (rejRows.length === 0) {
    Logger.log('buildDebitNoteTracker: No vendor rejections');
    return;
  }

  var sh = ss.getSheetByName('DEBIT_NOTE_TRACKER');
  if (!sh) sh = ss.insertSheet('DEBIT_NOTE_TRACKER');

  // Read existing tracker to preserve status edits
  var existingMap = {};
  if (sh.getLastRow() >= 3) {
    sh.getDataRange().getValues().slice(2).forEach(function(r) {
      var key = (r[0] || '') + '||' + (r[1] || '') + '||' + (r[2] || '') + '||' + r[3];
      existingMap[key] = (r[6] || '').toString().trim(); // Status column
    });
  }

  // Build from RAW_VENDOR_REJECTION
  // Cols: [0]Date [1]Vendor [2]VF_No [3]Rejection_Qty [4]Invoice_DC_No [5]Rejection_Month [6]Rejection_Reason [7]Rejection_Type
  var output = [];
  rejRows.forEach(function(r) {
    var date = r[0], vendor = (r[1] || '').toString().trim();
    var vf = (r[2] || '').toString().trim(), qty = Number(r[3]) || 0;
    var reason = (r[6] || '').toString().trim(), month = (r[5] || '').toString().trim();
    if (!vendor || !vf || qty === 0) return;
    var key = (date || '') + '||' + vendor + '||' + vf + '||' + qty;
    var status = existingMap[key] || 'PENDING';
    output.push([date, vendor, vf, qty, reason, month, status]);
  });

  var headers = ['Date', 'Vendor', 'VF_No', 'Rejection_Qty', 'Reason', 'Month', 'Status'];
  sh.clearContents();
  sh.getRange(1, 1).setValue('DEBIT NOTE TRACKER — Edit Status column: PENDING → RAISED → CLOSED | Updated: ' + new Date());
  sh.getRange(2, 1, 1, 7).setValues([headers]).setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
  if (output.length > 0) {
    sh.getRange(3, 1, output.length, 7).setValues(output);
  }
  // Highlight PENDING rows
  for (var i = 0; i < output.length; i++) {
    if (output[i][6] === 'PENDING') {
      sh.getRange(i + 3, 7).setBackground('#FEE2E2').setFontColor('#B91C1C').setFontWeight('bold');
    } else if (output[i][6] === 'RAISED') {
      sh.getRange(i + 3, 7).setBackground('#FEF3C7').setFontColor('#92400E').setFontWeight('bold');
    } else {
      sh.getRange(i + 3, 7).setBackground('#DCFCE7').setFontColor('#0E6E3A');
    }
  }
  sh.autoResizeColumns(1, 7);
  Logger.log('DEBIT_NOTE_TRACKER: ' + output.length + ' entries, ' +
    output.filter(function(r) { return r[6] === 'PENDING'; }).length + ' pending');
}


// ════════════════════════════════════════════════════════════
// BUILD STEEL STOCK
// Reads RM_CONSUMPTION (consumed per grade) + RAW_RM_INWARD (inward per grade)
// Writes cols C (Inward), D (Consumed), E (Balance), F (Value), G (Carry), H (Days), I (Status)
// Col B (Opening) is NEVER touched — set from physical count 31-Mar-2026
// STEEL_STOCK: Row1=title, Row2=headers, Row3+=grade data
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// SHARED HELPER FUNCTIONS
// Previously inside old doGet block — now standalone so all functions can use them
// ════════════════════════════════════════════════════════════

function normaliseShift_(raw) {
  var s = (raw||'').toString().trim();
  if (/1st\s*$/i.test(s)) return 'First Shift';
  if (/2nd\s*$/i.test(s)) return 'Second Shift';
  if (/3rd\s*$/i.test(s)) return 'Third Shift';
  var sl = s.toLowerCase();
  if (sl==='first shift'||sl==='1st shift'||sl==='shift 1'||sl==='shift1'||sl==='1'||sl==='s1') return 'First Shift';
  if (sl==='second shift'||sl==='2nd shift'||sl==='shift 2'||sl==='shift2'||sl==='2'||sl==='s2') return 'Second Shift';
  if (sl==='third shift'||sl==='3rd shift'||sl==='shift 3'||sl==='shift3'||sl==='3'||sl==='s3') return 'Third Shift';
  if (sl.indexOf('general')>=0) return 'First Shift';
  return 'First Shift';
}
function fmtTons_(kg) {
  return kg ? (kg/1000).toFixed(2) + ' T' : '0.00 T';
}

function rawRows_(ss, tabName) {
  var sh = ss.getSheetByName(tabName);
  if (!sh || sh.getLastRow() < 3) return [];
  return sh.getDataRange().getValues().slice(2);
}

function istDateStr_(d) {
  if (!d) return '';
  var dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return Utilities.formatDate(dt, 'Asia/Kolkata', 'yyyy-MM-dd');
}

function fmtCurr_(rs) {
  if (!rs || rs === 0) return '—';
  var abs = Math.abs(rs), sign = rs < 0 ? '-' : '';
  if (abs >= 10000000) return sign + '₹' + (abs/10000000).toFixed(2) + ' Cr';
  if (abs >= 100000)   return sign + '₹' + (abs/100000).toFixed(1)  + ' L';
  return sign + '₹' + Math.round(abs).toLocaleString('en-IN');
}

function normaliseDept_(dept) {
  var d = (dept||'').toString().trim();
  var map = {
    'Heat Treatment': 'HT Shop', 'Maintenance': 'Maint Dept',
    'Housekeeping': 'Office', 'HR': 'Office',
    'Stores': 'Store', 'VMC Shop': 'Machine Shop'
  };
  return map[d] || d;
}


// ════════════════════════════════════════════════════════════
// BUILD STEEL STOCK (Alias-Aware, Headers Blocked)
// ════════════════════════════════════════════════════════════
function buildSteelStock() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var stockMap = {};

  // 1. Load Physical Opening Stock
  var opSh = ss.getSheetByName('OPENING_RM_2627');
  if (opSh) {
    var opData = opSh.getDataRange().getValues();
    for (var i = 3; i < opData.length; i++) { 
      var rawGrade = (opData[i][0] || '').toString().trim();
      // FIX: Block empty rows, "TOTAL", and "GRADE" headers
      if (!rawGrade || rawGrade.toUpperCase().indexOf('TOTAL') > -1 || rawGrade.toUpperCase() === 'GRADE') continue; 
      
      var normGrade = normalizeGrade_(rawGrade); 
      var opKg = cleanNum_(opData[i][1]);
      var rate = cleanNum_(opData[i][2]);

      if (!stockMap[normGrade]) stockMap[normGrade] = { opKg: 0, inKg: 0, consKg: 0, rate: rate };
      stockMap[normGrade].opKg += opKg;
      if (rate > stockMap[normGrade].rate) stockMap[normGrade].rate = rate; 
    }
  }

  // 2. Load RM Inward
  var inSh = ss.getSheetByName('RAW_RM_INWARD');
  if (inSh) {
    var inData = inSh.getDataRange().getValues();
    for (var i = 1; i < inData.length; i++) {
      var rawGrade = (inData[i][3] || '').toString().trim();
      if (!rawGrade || rawGrade.toUpperCase().indexOf('TOTAL') > -1 || rawGrade.toUpperCase() === 'GRADE') continue;
      
      var normGrade = normalizeGrade_(rawGrade);
      var inKg = cleanNum_(inData[i][5]);
      var rate = cleanNum_(inData[i][6]);

      if (!stockMap[normGrade]) stockMap[normGrade] = { opKg: 0, inKg: 0, consKg: 0, rate: rate };
      stockMap[normGrade].inKg += inKg;
      if (rate > stockMap[normGrade].rate) stockMap[normGrade].rate = rate;
    }
  }

  // 3. Load RM Consumption — build two maps:
  //   consKg (FY total)  — for balance calculation
  //   cons30d (last 30 days) — for days-stock run-rate denominator
  // Using 30-day run rate avoids two problems with FY-average:
  //   (a) early in FY the average is tiny → wildly high days-stock
  //   (b) seasonal surges/dips dilute the true current consumption rate
  var cons30dMap = {}; // grade → kg consumed in last 30 days
  var cutoff30d = new Date();
  cutoff30d.setDate(cutoff30d.getDate() - 30);

  var consSh = ss.getSheetByName('RM_CONSUMPTION');
  if (consSh) {
    var consData = consSh.getDataRange().getValues();
    for (var i = 1; i < consData.length; i++) {
      var rawGrade = (consData[i][4] || '').toString().trim();
      if (!rawGrade || rawGrade.toUpperCase().indexOf('TOTAL') > -1 || rawGrade.toUpperCase() === 'GRADE') continue;

      var normGrade = normalizeGrade_(rawGrade);
      var consKg = cleanNum_(consData[i][7]);

      if (!stockMap[normGrade]) stockMap[normGrade] = { opKg: 0, inKg: 0, consKg: 0, rate: 0 };
      stockMap[normGrade].consKg += consKg;

      // 30-day filter: col 0 = date (RM_CONSUMPTION tab)
      var rawDate = consData[i][0];
      if (rawDate) {
        var dateObj = (rawDate instanceof Date) ? rawDate : new Date(rawDate);
        if (!isNaN(dateObj.getTime()) && dateObj >= cutoff30d) {
          cons30dMap[normGrade] = (cons30dMap[normGrade] || 0) + consKg;
        }
      }
    }
  }

  // 4. Calculate Final Metrics & Grand Totals
  var output = [];
  var keys = Object.keys(stockMap).sort();

  var sumOp = 0, sumIn = 0, sumCons = 0, sumBal = 0, sumVal = 0, sumCarry = 0;

  for (var k = 0; k < keys.length; k++) {
    var g = keys[k];
    var item = stockMap[g];

    var balKg = item.opKg + item.inKg - item.consKg;
    var valLacs = (balKg * item.rate) / 100000;
    var carryCost = valLacs * 0.18;

    // Days stock: use 30-day run rate as denominator.
    // If no consumption in last 30 days, fall back to FY-average to avoid
    // showing '—' for a grade that genuinely has stock but just had a quiet month.
    var cons30d = cons30dMap[g] || 0;
    var avgDailyCons30d = cons30d > 0 ? (cons30d / 30) : 0;
    var fyDaysElapsed = Math.max(1, Math.floor((new Date() - new Date(2026, 3, 1)) / (1000 * 60 * 60 * 24)));
    var avgDailyConsFY  = item.consKg / fyDaysElapsed;
    var avgDailyCons = avgDailyCons30d > 0 ? avgDailyCons30d : avgDailyConsFY;
    var daysStock = avgDailyCons > 0 ? Math.round(balKg / avgDailyCons) : '—';

    var status = '⚪ No data';
    if (balKg < 0 || (typeof daysStock === 'number' && daysStock < 7)) status = '🔴 CRITICAL';
    else if (typeof daysStock === 'number' && daysStock >= 7 && daysStock <= 21) status = '🟡 ORDER SOON';
    else if (balKg >= 0) status = '🟢 OK';

    sumOp += item.opKg;
    sumIn += item.inKg;
    sumCons += item.consKg;
    sumBal += balKg;
    if (valLacs > 0) { sumVal += valLacs; sumCarry += carryCost; }

    output.push([
      g, 
      Math.round(item.opKg), 
      Math.round(item.inKg), 
      Math.round(item.consKg), 
      Math.round(balKg), 
      valLacs > 0 ? valLacs.toFixed(2) : 0, 
      carryCost > 0 ? carryCost.toFixed(2) : 0, 
      daysStock, 
      status
    ]);
  }

  // Push the bold TOTAL row
  output.push([
    'TOTAL', Math.round(sumOp), Math.round(sumIn), Math.round(sumCons), 
    Math.round(sumBal), sumVal.toFixed(2), sumCarry.toFixed(2), '—', '—'
  ]);

  // 5. Write to STEEL_STOCK Tab
  var destSh = ss.getSheetByName('STEEL_STOCK') || ss.insertSheet('STEEL_STOCK');
  destSh.clearContents(); 

  destSh.getRange(1, 1).setValue("VARSHA FORGINGS — STEEL STOCK POSITION   |   FY 2026-27   |   (Auto-Calculated by Script)").setFontWeight('bold');
  var headers = ['Grade', 'Opening (kg)', 'Inward (kg)', 'Consumed (kg)', 'Balance (kg)', 'Value (₹L)', 'Carry Cost/yr (₹L)', 'Days Stock', 'Status'];
  destSh.getRange(2, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');

  if (output.length > 0) {
    destSh.getRange(3, 1, output.length, headers.length).setValues(output);
    destSh.getRange(output.length + 2, 1, 1, headers.length).setFontWeight('bold').setBackground('#E0E0E0').setFontColor('#000000');
  }
}

// ════════════════════════════════════════════════════════════════
// readCostSummarySnap_() — parses COST_SUMMARY as it actually exists
// ════════════════════════════════════════════════════════════════
// COST_SUMMARY is a hand-curated MIS worksheet, not a live formula tab:
// one section per month ("APRIL 2026 — MTD ACTUALS"), sub-divided into
// labeled cost categories ("PRODUCTION", "COSTS — CONTRACTOR LABOUR", ...),
// each with rows of {Cost Item, Source, Amount (₹), Amount (₹ L), Notes,
// Status}. It currently only has one month (April) and includes real
// in-progress caveats ("⚠ Deepak to enter", a live #ERROR! cell) — this
// reader passes all of that through as-is rather than hiding it, since
// pretending the data is more complete than it is would be worse than
// not showing it. Output shape: { months: [ { month, sections: [ { name,
// rows: [ {label,source,amountRs,amountL,notes,status} ] } ] } ] }.
function readCostSummarySnap_(ss) {
  var sh = ss.getSheetByName('COST_SUMMARY');
  if (!sh || sh.getLastRow() < 4) return { months: [] };

  var data = sh.getDataRange().getValues();
  var HEADER_LABELS = { 'cost item': true, 'item': true };

  var months = [];
  var curMonth = null, curSection = null;

  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    var a = (row[0] || '').toString().trim();
    if (!a) continue; // blank spacer row

    var bRest = row.slice(1, 6).some(function(v){ return v !== null && v !== ''; });

    if (!bRest && /MTD ACTUALS/i.test(a)) {
      curMonth = { month: a, sections: [] };
      months.push(curMonth);
      curSection = null;
      continue;
    }
    if (HEADER_LABELS[a.toLowerCase()]) continue; // the "Cost Item | Source | ..." header row itself

    if (!bRest) {
      // Section label (e.g. "PRODUCTION", "COSTS — CONTRACTOR LABOUR") or a
      // stray note row (e.g. "⚠ NOTE: ..."). Either way, start a new
      // section bucket — a note-only "section" just ends up with 0 rows
      // and gets filtered out by the frontend, which is harmless.
      if (!curMonth) { curMonth = { month: 'MTD ACTUALS', sections: [] }; months.push(curMonth); }
      curSection = { name: a, rows: [] };
      curMonth.sections.push(curSection);
      continue;
    }

    // Data row
    if (!curMonth) { curMonth = { month: 'MTD ACTUALS', sections: [] }; months.push(curMonth); }
    if (!curSection) { curSection = { name: '(ungrouped)', rows: [] }; curMonth.sections.push(curSection); }
    curSection.rows.push({
      label: a,
      source: (row[1] || '').toString().trim(),
      amountRs: (typeof row[2] === 'number') ? row[2] : null,
      amountL: (typeof row[3] === 'number') ? row[3] : null,
      notes: (row[4] || '').toString().trim(),
      status: (row[5] || '').toString().trim()
    });
  }

  // Drop empty sections (note-only rows, stray headers)
  months.forEach(function(m) {
    m.sections = m.sections.filter(function(s) { return s.rows.length > 0; });
  });

  return { months: months, updated_at: Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy HH:mm') };
}

// ── DROPOUT / REJECTION RATE TRENDING (Item 4) ───────────────────────────
// Reads Dropout_Qty and Qty columns from RAW_PRESS and RAW_FORGE and
// aggregates them by FY month.  Output: { Press: [...], Forge: [...] }
// where each element is { month, qty, dropoutQty, dropoutPct }.
function buildDropoutTrend_() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var FY_MONTHS = ['April','May','June','July','August','September',
                   'October','November','December','January','February','March'];
  var MONTH_CAL = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];
  var TABS = [
    {tab:'RAW_PRESS',  dept:'Press'},
    {tab:'RAW_FORGE',  dept:'Forge'}
  ];
  // RAW_PRESS/RAW_FORGE columns: [0]Date [1]Machine [2]Shift [3]Prod_Type [4]VF_No [5]Qty [6]Dropout_Qty [7]Dropout_Pct

  var acc = {}; // dept → { month → { qty, dropoutQty } }
  TABS.forEach(function(def) {
    var sh = ss.getSheetByName(def.tab);
    if (!sh) return;
    acc[def.dept] = {};
    FY_MONTHS.forEach(function(m) { acc[def.dept][m] = {qty:0, dropoutQty:0}; });
    var data = sh.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var rawDate = row[0];
      if (!rawDate) continue;
      var dt = (rawDate instanceof Date) ? rawDate : new Date(rawDate);
      if (isNaN(dt.getTime())) continue;
      var m = MONTH_CAL[dt.getMonth()];
      if (!acc[def.dept][m]) continue; // not a tracked FY month
      var qty     = parseFloat(row[5]) || 0;
      var dropQty = parseFloat(row[6]) || 0;
      acc[def.dept][m].qty        += qty;
      acc[def.dept][m].dropoutQty += dropQty;
    }
  });

  // Convert to sorted array
  var result = {};
  Object.keys(acc).forEach(function(dept) {
    result[dept] = FY_MONTHS.map(function(m) {
      var d   = acc[dept][m];
      var pct = d.qty > 0 ? Math.round(d.dropoutQty / d.qty * 1000) / 10 : 0;
      return {month: m, qty: d.qty, dropoutQty: d.dropoutQty, dropoutPct: pct};
    });
  });
  return result;
}

// ============================================================
function buildDashboardCache() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  
  function sN(v){var n=Number(v);return isNaN(n)?0:n;}
  function sS(v){return (v||'').toString().trim();}
  function dS(v){if(!v)return '';try{return Utilities.formatDate(new Date(v),'Asia/Kolkata','yyyy-MM-dd');}catch(e){return sS(v);}}
  function isSameDay_(d1,d2){
    return d1.getFullYear()===d2.getFullYear()&&d1.getMonth()===d2.getMonth()&&d1.getDate()===d2.getDate();
  }
  
  var curMonth = MONTH_NAMES_[new Date().getMonth()];
  var todayD   = new Date();
  var yesterD  = new Date(todayD); yesterD.setDate(yesterD.getDate()-1);
  
  // ── Build VF → Customer + Selling_Price map from COSTING_BANDS ───
  var cbMapP3 = {};   
  var cbShP3 = ss.getSheetByName('COSTING_BANDS');
  if (cbShP3 && cbShP3.getLastRow() >= 3) {
    var cbValsP3 = cbShP3.getRange(3, 1, cbShP3.getLastRow() - 2, 7).getValues();
    cbValsP3.forEach(function(r) {
      var vf = sS(r[0]);
      if (!vf) return;
      cbMapP3[vf] = { customer: sS(r[1]), sellPrice: sN(r[6]) };
    });
  }

  // ── PLANNER reader ───────────────────────────────────────────────
  var plannerRows = [];
  var ppShP3 = ss.getSheetByName('PRODUCTION_PLANNER');
  if (ppShP3 && ppShP3.getLastRow() >= 3) {
    var ppValsP3 = ppShP3.getDataRange().getValues();
    for (var iP3 = 2; iP3 < ppValsP3.length; iP3++) {
      var rP3 = ppValsP3[iP3];
      var unitP3 = sS(rP3[0]);
      var vfP3   = sS(rP3[2]);
      if (!unitP3 && !vfP3) continue;
      if (vfP3.toUpperCase().indexOf('GRAND TOTAL') >= 0) continue;
      var custP3 = (cbMapP3[vfP3] && cbMapP3[vfP3].customer) || '';
      plannerRows.push([
        unitP3, vfP3, custP3, sN(rP3[4]), sS(rP3[3]), sS(rP3[5]), sS(rP3[6]), sS(rP3[8])
      ]);
    }
  }

  // ── VENDOR REJ reader ────────────────────────────────────────────
  var vrejRows = [];
  var vrejTotalPcs = 0, vrejTotalRs = 0;
  var vrejShP3 = ss.getSheetByName('VENDOR_REJECTION');
  if (vrejShP3 && vrejShP3.getLastRow() >= 10) {
    var vrejValsP3 = vrejShP3.getDataRange().getValues();
    var inDetailP3 = false;
    for (var jP3 = 0; jP3 < vrejValsP3.length; jP3++) {
      var vrP3 = vrejValsP3[jP3];
      var c0P3 = sS(vrP3[0]);
      if (c0P3.indexOf('VF-WISE') >= 0 || c0P3.indexOf('▼') >= 0) {
        inDetailP3 = true;
        continue;
      }
      if (!inDetailP3) continue;
      if (c0P3.toUpperCase() === 'VF NO') continue;
      if (!c0P3) continue;
      if (c0P3.toUpperCase().indexOf('TOTAL') >= 0) continue;

      var vfnP3   = c0P3;
      var pcsP3   = sN(vrP3[1]);
      var vendP3  = sS(vrP3[2]);
      var mnthP3  = sS(vrP3[3]);
      var rsnP3   = sS(vrP3[4]);
      var priceP3 = (cbMapP3[vfnP3] && cbMapP3[vfnP3].sellPrice) || 0;
      var rsP3    = pcsP3 * priceP3;

      vrejRows.push({ vfNo: vfnP3, vendor: vendP3, pcs: pcsP3, rs: Math.round(rsP3), reason: rsnP3, month: mnthP3 });
      vrejTotalPcs += pcsP3;
      vrejTotalRs  += rsP3;
    }
  }

  // ── DATA GAPS reader ─────────────────────────────────────────────
  var GAP_MAP_P3 = {
    'GAP 1': { vfCol: 0, issueCol: 1, impactCol: 2, actionCol: 5 },
    'GAP 2': { vfCol: 0, issueCol: 1, impactCol: 3, actionCol: 6 },
    'GAP 3': { vfCol: 0, issueCol: 1, impactCol: 4, actionCol: 6 },
    'GAP 4': { vfCol: 0, issueCol: 2, impactCol: 3, actionCol: 6 },
    'GAP 5': { vfCol: 0, issueCol: 4, impactCol: 3, actionCol: 5 },
    'GAP 6': { vfCol: 0, issueCol: 1, impactCol: 4, actionCol: 6 },
    'GAP 7': { vfCol: 0, issueCol: 6, impactCol: 1, actionCol: 6 },
    'GAP 8': { vfCol: 0, issueCol: 2, impactCol: 3, actionCol: 4 }
  };

  var gapsRowsP3 = [];
  var gapsByTypeP3 = {};
  var dgShP3 = ss.getSheetByName('DATA_GAPS');
  if (dgShP3 && dgShP3.getLastRow() >= 3) {
    var dgValsP3 = dgShP3.getDataRange().getValues();
    var currentGapP3 = null;
    var currentMapP3 = null;
    for (var kP3 = 0; kP3 < dgValsP3.length; kP3++) {
      var drP3 = dgValsP3[kP3];
      var d0P3 = sS(drP3[0]);

      var gapMatchP3 = d0P3.match(/GAP\s+(\d+)/);
      if (gapMatchP3) {
        currentGapP3 = 'GAP ' + gapMatchP3[1];
        currentMapP3 = GAP_MAP_P3[currentGapP3] || null;
        continue;
      }
      if (!currentMapP3) continue;
      if (!d0P3) continue;

      var d0uP3 = d0P3.toUpperCase();
      if (d0uP3 === 'VF NO' || d0uP3 === 'VENDOR') continue;
      if (d0P3 === '#REF!') continue;
      if (d0uP3.indexOf('GRAND TOTAL') >= 0) continue;
      var actionValP3 = sS(drP3[currentMapP3.actionCol]);
      if (actionValP3.indexOf('✅ Cleared') >= 0) continue;
      if (sS(drP3[1]).indexOf('✅ Cleared') >= 0) continue;

      gapsRowsP3.push({ gapType: currentGapP3, vfNo: sS(drP3[currentMapP3.vfCol]), issue: sS(drP3[currentMapP3.issueCol]), impact: sS(drP3[currentMapP3.impactCol]), action: actionValP3 || '—' });
      gapsByTypeP3[currentGapP3] = (gapsByTypeP3[currentGapP3] || 0) + 1;
    }
  }

  var dataGapsSummary = { totalGaps: gapsRowsP3.length, byType: gapsByTypeP3, rows: gapsRowsP3 };

  // ── FY_MONTHLY ───────────────────────────────────────────
  var fyRows=[], fySh=ss.getSheetByName('FY_MONTHLY');
  if(fySh&&fySh.getLastRow()>=3){
    var fyA=fySh.getDataRange().getValues(), fyH=fyA[1];
    for(var i=2;i<fyA.length;i++){
      if(!fyA[i][0])continue;
      var o={};fyH.forEach(function(k,j){if(k)o[k]=fyA[i][j];});fyRows.push(o);
    }
  }
  var mtdRow={};
  fyRows.forEach(function(r){if(sS(r['Month'])===curMonth)mtdRow=r;});
  if(!mtdRow['Month']&&fyRows.length)mtdRow=fyRows[0];
  
  // ── STEEL_STOCK ─────────────────────────────────────────
  var steelRows=[], totalInwardKg=0, totalConsumedKg=0, totalBalanceKg=0, totalValueL=0;
  var stSh=ss.getSheetByName('STEEL_STOCK');
  if(stSh&&stSh.getLastRow()>=3){
    var stA=stSh.getDataRange().getValues(), stH=stA[1];
    for(var i=2;i<stA.length;i++){
      var g=sS(stA[i][0]);
      if(!g||g==='TOTAL'||g==='Grade'||g.indexOf('🔴')>=0)continue;
      var o={};stH.forEach(function(k,j){if(k)o[k]=stA[i][j];});
      steelRows.push(o);
      totalInwardKg   += sN(stA[i][2]);
      totalConsumedKg += sN(stA[i][3]);
      totalBalanceKg  += sN(stA[i][4]);
      totalValueL     += sN(stA[i][5]);
    }
  }
  var steelMap={};
  steelRows.forEach(function(r){
    var g=sS(r['Grade']||r[0]);
    if(g) steelMap[g]=sN(r['Balance (kg)']||r[4]);
  });
  
  // ── OUTSTANDING ─────────────────────────────────────────
  var outRows=[], roSh=ss.getSheetByName('RAW_OUTSTANDING');
  if(roSh&&roSh.getLastRow()>=3){
    roSh.getDataRange().getValues().slice(2).forEach(function(r){
      var c=sS(r[0]);if(!c)return;
      outRows.push({customer:c,notDue:sN(r[1]),overdue:sN(r[2]),grandTotal:sN(r[3]),asOn:sS(r[4])});
    });
  }
  outRows.sort(function(a,b){return b.overdue-a.overdue;});
  var outOD    = outRows.reduce(function(s,r){return s+r.overdue;},0);
  var outND    = outRows.reduce(function(s,r){return s+r.notDue;},0);
  var outTotal = outRows.reduce(function(s,r){return s+r.grandTotal;},0);
  var outAsOn  = outRows.length?outRows[0].asOn:'';
  
  // ── ELEC_SUMMARY ────────────────────────────────────────
  var elecBars=[],elecTotal=0,deptElecMap={};
  var elSh=ss.getSheetByName('ELEC_SUMMARY');
  if(elSh&&elSh.getLastRow()>=3){
    elSh.getDataRange().getValues().slice(2).forEach(function(r){
      var d=sS(r[0]),k=sN(r[1]),p=sN(r[2]);if(!d)return;
      if(d.indexOf('MSEB')>=0||d.indexOf('Main')>=0){}
      else if(d.indexOf('Sub-total')>=0||d.indexOf('TOTAL')>=0){elecTotal=k;}
      else{elecBars.push({dept:d,kwh:k,pct:p});deptElecMap[d]=k;}
    });
  }
  
  // ── ALERTS ──────────────────────────────────────────────
  var alerts=[],alSh=ss.getSheetByName('ALERTS_ACTIVE');
  if(alSh&&alSh.getLastRow()>=3){
    alSh.getDataRange().getValues().slice(2).forEach(function(r){
      var t=sS(r[0]),m=sS(r[4]);
      if(t&&m)alerts.push({type:t,severity:sS(r[1]),title:sS(r[3]),message:m,priority:sS(r[1]).toUpperCase()==='HIGH'?'HIGH':'NORMAL'});
    });
  }
  
  // ── DEPT_SCORE ──────────────────────────────────────────
  // DEPT_SCORE formulas are now managed by fixDeptScoreFormulas_() below —
  // run it once to replace COUNTA(all rows) with COUNTUNIQUE(dates) so
  // departments logging multiple rows/day no longer show 1000% compliance.
  var deptScores=[],overallPct=0,dsSh=ss.getSheetByName('DEPT_SCORE');
  if(dsSh&&dsSh.getLastRow()>=3){
    dsSh.getDataRange().getValues().slice(2).forEach(function(r){
      var d=sS(r[0]);if(!d)return;
      var rawPct=sN(r[3]);
      deptScores.push({dept:d,count:sN(r[1]),expected:sN(r[2]),pct:rawPct,pctInvalid:rawPct>100,grade:sS(r[4]),datesWithData:[]});
    });
    if(deptScores.length){
      var validScores=deptScores.filter(function(r){return !r.pctInvalid;});
      overallPct=validScores.length
        ? Math.round(validScores.reduce(function(s,r){return s+r.pct;},0)/validScores.length)
        : 0; // all rows invalid — nothing trustworthy to average
    }
  }
  
  // ── JWK ─────────────────────────────────────────────────
  var jwkVFs=[],jwkSh=ss.getSheetByName('RAW_JWK');
  if(jwkSh&&jwkSh.getLastRow()>=3){
    jwkSh.getDataRange().getValues().slice(2).forEach(function(r){
      var v=sS(r[1]);if(v&&v!=='VF0'&&v!=='VF NO')jwkVFs.push(v);
    });
  }
  var jwkSet={};jwkVFs.forEach(function(v){jwkSet[v]=true;});
  
  // ── TODAY PULL (RAW TABS) ───────────────────────────────
  var prodDateSet={};
  ['RAW_CUTTING','RAW_FORGE','RAW_PRESS','RAW_MACHINE'].forEach(function(tab){
    var sh=ss.getSheetByName(tab);
    if(!sh||sh.getLastRow()<3)return;
    sh.getDataRange().getValues().slice(2).forEach(function(r){
      var d=r[0];if(!d)return;
      var dt=(d instanceof Date)?d:new Date(d);
      if(!isNaN(dt.getTime()))prodDateSet[Utilities.formatDate(dt,'Asia/Kolkata','yyyy-MM-dd')]=true;
    });
  });
  var sortedProdDates=Object.keys(prodDateSet).sort().reverse();
  var todayDateStr=sortedProdDates[0]||null;
  var yestDateStr=sortedProdDates[1]||null;
  var realTodayStr=Utilities.formatDate(todayD,'Asia/Kolkata','yyyy-MM-dd');

  function pullProdForCache_(tabName,dateStr){
    if(!dateStr)return [];
    var sh=ss.getSheetByName(tabName);
    if(!sh||sh.getLastRow()<3)return [];
    var isCut=(tabName==='RAW_CUTTING');
    var vfCol=isCut?3:4, qtyCol=isCut?4:5;
    var machMap={};
    sh.getDataRange().getValues().slice(2).forEach(function(r){
      var d=r[0];if(!d)return;
      var dt=(d instanceof Date)?d:new Date(d);
      if(isNaN(dt.getTime())||Utilities.formatDate(dt,'Asia/Kolkata','yyyy-MM-dd')!==dateStr)return;
      var mach=sS(r[1]),shift=sS(r[2]),vf=sS(r[vfCol]),qty=sN(r[qtyCol]);
      if(!mach||!vf||qty===0)return;
      var key=mach+'||'+shift;
      if(!machMap[key])machMap[key]={machine:mach,shift:shift,entries:{}};
      machMap[key].entries[vf]=(machMap[key].entries[vf]||0)+qty;
    });
    return Object.values(machMap);
  }
  function fmtProdDate_(ds){if(!ds)return '';try{return Utilities.formatDate(new Date(ds+'T00:00:00+05:30'),'Asia/Kolkata','dd-MMM-yyyy');}catch(e){return ds;}}

  var todaySection={
    date:fmtProdDate_(todayDateStr),prevDate:fmtProdDate_(yestDateStr),
    isLastAvail:(todayDateStr!==realTodayStr),
    cutting:pullProdForCache_('RAW_CUTTING',todayDateStr),
    forging:pullProdForCache_('RAW_FORGE',todayDateStr),
    pressing:pullProdForCache_('RAW_PRESS',todayDateStr),
    machine:pullProdForCache_('RAW_MACHINE',todayDateStr),
    yesterday:{
      cutting:pullProdForCache_('RAW_CUTTING',yestDateStr),
      forging:pullProdForCache_('RAW_FORGE',yestDateStr),
      pressing:pullProdForCache_('RAW_PRESS',yestDateStr),
      machine:pullProdForCache_('RAW_MACHINE',yestDateStr),
      manpower:{},elecByDept:{}
    },
    manpower:{},elecByDept:{}
  };

  // ── RESTORE LIVE TODAY/YESTERDAY MANPOWER & ELEC ─────────
  var mpProdToday=todayDateStr?new Date(todayDateStr+'T12:00:00+05:30'):todayD;
  var mpProdYest=yestDateStr?new Date(yestDateStr+'T12:00:00+05:30'):yesterD;
  var mpTodayMap={}, mpYestMap={};
  
  var mpStSh=ss.getSheetByName('RAW_MANPOWER_STAFF');
  if(mpStSh&&mpStSh.getLastRow()>=3){
    mpStSh.getDataRange().getValues().slice(2).forEach(function(r){
      var dt=r[0];if(!dt)return;
      var d=dt instanceof Date?dt:new Date(dt);
      var dept=sS(r[2]),total=sN(r[3])+sN(r[4])+sN(r[5]);
      if(isSameDay_(d,mpProdToday)){
        if(!mpTodayMap[dept])mpTodayMap[dept]={staff:0,contract:0};
        mpTodayMap[dept].staff=Math.max(mpTodayMap[dept].staff,total);
      } else if(isSameDay_(d,mpProdYest)){
        if(!mpYestMap[dept])mpYestMap[dept]={staff:0,contract:0};
        mpYestMap[dept].staff=Math.max(mpYestMap[dept].staff,total);
      }
    });
  }

  function normContractDept(dept) {
    var map = {'Heat Treatment':'HT Shop', 'VMC Shop':'Machine Shop', 'Stores':'Store', 'Housekeeping':'Office', 'HR':'Office', 'Maintenance':'Maint Dept'};
    return map[dept] || dept;
  }

  var mpCtSh=ss.getSheetByName('RAW_MANPOWER_CONTRACT');
  if(mpCtSh&&mpCtSh.getLastRow()>=3){
    mpCtSh.getDataRange().getValues().slice(2).forEach(function(r){
      var dt=r[0];if(!dt)return;
      var d=dt instanceof Date?dt:new Date(dt);
      var dept=normContractDept(sS(r[2])), hc=sN(r[4]);
      if(isSameDay_(d,mpProdToday)){
        if(!mpTodayMap[dept])mpTodayMap[dept]={staff:0,contract:0};
        mpTodayMap[dept].contract+=hc;
      } else if(isSameDay_(d,mpProdYest)){
        if(!mpYestMap[dept])mpYestMap[dept]={staff:0,contract:0};
        mpYestMap[dept].contract+=hc;
      }
    });
  }
  
  todaySection.manpower=mpTodayMap;
  todaySection.yesterday.manpower=mpYestMap;
  
  var elTodayMap={},elYestMap={};
  var elRawSh=ss.getSheetByName('RAW_ELECTRICITY');
  if(elRawSh&&elRawSh.getLastRow()>=3){
    elRawSh.getDataRange().getValues().slice(2).forEach(function(r){
      var dt=r[0];if(!dt)return;
      var d=dt instanceof Date?dt:new Date(dt);
      var meter=sS(r[2]),kwh=sN(r[3]);
      if(!meter||meter.indexOf('MSEB')>=0||meter.indexOf('Main')>=0)return;
      if(isSameDay_(d,mpProdToday)){elTodayMap[meter]=(elTodayMap[meter]||0)+kwh;}
      else if(isSameDay_(d,mpProdYest)){elYestMap[meter]=(elYestMap[meter]||0)+kwh;}
    });
  }
  todaySection.elecByDept=elTodayMap;
  todaySection.yesterday.elecByDept=elYestMap;

  // ── MTD ─────────────────────────────────────────────────
  var mtd={
    month:curMonth,
    cutQty:          sN(mtdRow['Cut Qty']||0),
    cutTons:         sN(mtdRow['Cut Tons']||0),
    ownForgedPcs:    sN(mtdRow['Forge Qty (Inhouse)']||0)+sN(mtdRow['Press Qty (Inhouse)']||0),
    ownForgedTons:   sN(mtdRow['Forge Tons (Inhouse)']||0)+sN(mtdRow['Press Tons (Inhouse)']||0),
    jwkForgedPcs:    sN(mtdRow['Forge Qty (JWK)']||0)+sN(mtdRow['Press Qty (JWK)']||0),
    jwkForgedTons:   sN(mtdRow['Forge Tons (JWK)']||0)+sN(mtdRow['Press Tons (JWK)']||0),
    pressTons:       sN(mtdRow['Press Tons (Inhouse)']||0),
    dispQty:         sN(mtdRow['Dispatch Qty']||0),
    turnoverL:       Math.round(sN(mtdRow['Dispatch Turnover (Rs L)']||0)),
    schedPct:        0,
    rmKg:            0, 
    oilForgeL:       sN(mtdRow['Oil Forge (L)']||0),
    oilHTL:          sN(mtdRow['Oil HT (L)']||0),
    elecKwh:         sN(mtdRow['Electricity (kWh)']||0),
    contractCostL:   sN(mtdRow['Contract Cost (Rs L)']||0),
    contractHead:    sN(mtdRow['Contract Head']||0),
    staffHead:       sN(mtdRow['Staff Head']||0),
    vendorRejPcs:    sN(mtdRow['Vendor Rejection (pcs)']||0),
    salaryActualL:0, contractorActualL:0,
    transportActualL:0, transportInboundL:3.95, transportOutboundL:4.07,
    deptElec:deptElecMap, deptManpower:{}, machineBars:[]
  };

  // ── MANPOWER_SUMMARY (READS FROM SHEET FORMULAS) ──────────
  var mpSummaryRows=[];
  var mpSmSh=ss.getSheetByName('MANPOWER_SUMMARY');
  var totalContractCost = 0;
  var totalContractHead = 0;
  var totalStaffHead = 0;

  if(mpSmSh){
    var mpData = mpSmSh.getRange("A2:F12").getValues(); 
    for (var i = 0; i < mpData.length; i++) {
      var dept = sS(mpData[i][0]);
      if (!dept || dept === 'TOTAL') continue;
      
      var compHC = sN(mpData[i][1]);
      var contHC = sN(mpData[i][2]);
      var compCost = sN(mpData[i][3]);
      var contCost = sN(mpData[i][4]);
      var totalCost = sN(mpData[i][5]);
      
      mpSummaryRows.push({
        dept: dept, companyHC: compHC, contractHC: contHC,
        estCompanyCost: compCost, actualContractCost: contCost, totalDeptCost: totalCost
      });

      mtd.deptManpower[dept] = { staffAvg: compHC, contractAvg: contHC, contractCost: contCost };
      totalStaffHead += compHC;
      totalContractHead += contHC;
      totalContractCost += contCost;
    }
  }

  mtd.contractCostL = (totalContractCost / 100000).toFixed(2);
  mtd.contractHead = Math.round(totalContractHead);
  mtd.staffHead = Math.round(totalStaffHead);
  
  // Salary
  var salSh=ss.getSheetByName('_RAW_SALARY');
  if(salSh&&salSh.getLastRow()>=3){
    salSh.getDataRange().getValues().slice(2).forEach(function(r){
      if(sS(r[0])===curMonth&&sN(r[1])>0)mtd.salaryActualL=Math.round(sN(r[1])/1000)/100;
    });
  }
  // Transport
  var trSh=ss.getSheetByName('TRANSPORT_SUMMARY');
  if(trSh&&trSh.getLastRow()>=3){
    trSh.getDataRange().getValues().slice(2).forEach(function(r){
      if(sS(r[0])===curMonth&&sN(r[1])>0){
        mtd.transportActualL=Math.round(sN(r[1])/1000)/100;
        mtd.transportInboundL=sN(r[5])||3.95;
        mtd.transportOutboundL=sN(r[6])||4.07;
      }
    });
  }
  // Machine bars
  var pm2Sh=ss.getSheetByName('PRODUCTION_MONTHLY');
  if(pm2Sh&&pm2Sh.getLastRow()>=3){
    var pm2A=pm2Sh.getDataRange().getValues();
    var lC=pm2A.length>1?pm2A[1].length:0;
    var mBars=[];
    pm2A.slice(2).forEach(function(r){
      var mach=sS(r[1]),tot=sN(r[lC-2]);
      if(mach&&tot>0)mBars.push([mach,tot]);
    });
    mBars.sort(function(a,b){return b[1]-a[1];});
    mtd.machineBars=mBars.slice(0,10);
  }
  
  // ── COSTING_BANDS ───────────────────────────────────────
  var cbMap={},cbSh=ss.getSheetByName('COSTING_BANDS');
  if(cbSh&&cbSh.getLastRow()>=3){
    cbSh.getDataRange().getValues().slice(2).forEach(function(r){
      var vf=sS(r[0]);if(!vf)return;
      cbMap[vf]={customer:sS(r[1]),grade:sS(r[2]),iw:sN(r[4]),fw:sN(r[5]),band:sS(r[12])||'—'};
    });
  }
  
  // ── WIP ─────────────────────────────────────────────────
  var wipRows=[],wipSh=ss.getSheetByName('WIP_SUMMARY');
  var cutWIPPcs=0,cutWIPVFs=0,fgWIPPcs=0,fgWIPVFs=0,jwkWIPPcs=0,jwkWIPVFs=0;
  if(wipSh&&wipSh.getLastRow()>=3){
    wipSh.getDataRange().getValues().slice(2).forEach(function(r){
       var vf=sS(r[0]);if(!vf||vf.indexOf('GRAND')>=0||vf==='TOTAL')return;
      var cutWIP=sN(r[5]),fgWIP=sN(r[6]),closing=sN(r[8]);
      if(cutWIP>0){cutWIPPcs+=cutWIP;cutWIPVFs++;}
      if(fgWIP>0){fgWIPPcs+=fgWIP;fgWIPVFs++;}
      if(jwkSet[vf]&&Math.abs(closing)>0){jwkWIPPcs+=Math.abs(closing);jwkWIPVFs++;}
      if(cutWIP!==0||fgWIP!==0||closing!==0){
        var cb=cbMap[vf]||{};
        wipRows.push({vfNo:vf,customer:cb.customer||'',cutWIP:cutWIP,fgWIP:fgWIP,closingWIP:closing});
      }
    });
  }
  var wipSummary={cutWIPPcs:cutWIPPcs,cutWIPVFs:cutWIPVFs,fgWIPPcs:fgWIPPcs,fgWIPVFs:fgWIPVFs,jwkWIPPcs:jwkWIPPcs,jwkWIPVFs:jwkWIPVFs,vendorWIPPcs:0};
  
  // ── SCHEDULE ────────────────────────────────────────────
  var schedRows=[],schedSum={totalSchedQty:0,totalProduced:0,totalBalProduce:0,totalRMRequired:0};
  var schedSh=ss.getSheetByName('SCHEDULE_INTELLIGENCE');
  if(schedSh&&schedSh.getLastRow()>=3){
    schedSh.getDataRange().getValues().slice(2).forEach(function(r){
      var vf=sS(r[0]);
      if(!vf||vf.indexOf('GRAND TOTAL')>=0)return;
      var sq=sN(r[4]),prod=sN(r[6]),disp=sN(r[7]),bp=sN(r[8]),rmRq=sN(r[10]);
      var cb=cbMap[vf]||{};
      var grade=cb.grade||'';
      var stockKg=steelMap[grade]||0;
      var hasStock=rmRq>0?(stockKg>=rmRq):true;
      schedRows.push({
        vfNo:vf, schedQty:sq, producedMTD:prod, dispatchedMTD:disp, balProduce:bp, rmRequired:rmRq,
        hasStock:hasStock, band:cb.band||'—', customer:cb.customer||'', grade:grade, schedPct:sq>0?Math.round(prod/sq*100):0
      });
      schedSum.totalSchedQty+=sq;schedSum.totalProduced+=prod;schedSum.totalBalProduce+=bp;schedSum.totalRMRequired+=rmRq;
    });
  }
  mtd.schedPct=schedSum.totalSchedQty>0?Math.round(schedSum.totalProduced/schedSum.totalSchedQty*100):0;
  
  // ── PRODUCTION_MONTHLY ───────────────────────────────────
  var pmRows=[],pmSh=ss.getSheetByName('PRODUCTION_MONTHLY');
  if(pmSh&&pmSh.getLastRow()>=3){
    var pmA=pmSh.getDataRange().getValues();
    var lastC=pmA.length>1?pmA[1].length:0;
    pmA.slice(2).forEach(function(r){
      var dept=sS(r[0]),mach=sS(r[1]);
      if(!dept&&!mach)return;
      pmRows.push({dept:dept,machine:mach,type:sS(r[2]),monthTotal:sN(r[lastC-2]),monthTons:sN(r[lastC-1])});
    });
  }
  
  // ── F4_RECONCILIATION ────────────────────────────────────
  var f4VendorMap = {};
  var f4Sh = ss.getSheetByName('F4_RECONCILIATION');
  if (f4Sh && f4Sh.getLastRow() >= 3) {
    var f4Data = f4Sh.getDataRange().getValues();
    for (var i = 2; i < f4Data.length; i++) {
      var rowType = sS(f4Data[i][0]);
      if (rowType === 'VENDOR_TOTAL') {
        var vendor = sS(f4Data[i][1]);
        if (!vendor) continue;
        f4VendorMap[vendor] = {
          vendor: vendor, sentPcs: sN(f4Data[i][4]), receivedPcs: sN(f4Data[i][5]), pendingPcs: sN(f4Data[i][6]), alert: sS(f4Data[i][7]), parts: []
        };
      } else if (rowType === 'VF_DETAIL') {
        var dVendor = sS(f4Data[i][1]);
        var dVf = sS(f4Data[i][2]);
        if (!dVendor || !dVf) continue;
        if (!f4VendorMap[dVendor]) f4VendorMap[dVendor] = {vendor:dVendor,sentPcs:0,receivedPcs:0,pendingPcs:0,alert:'',parts:[]};
        f4VendorMap[dVendor].parts.push({
          vfNo: dVf, customer: sS(f4Data[i][3]), sentPcs: sN(f4Data[i][4]), receivedPcs: sN(f4Data[i][5]), pendingPcs: sN(f4Data[i][6])
        });
      }
    }
  }
  var f4Vendors = Object.values(f4VendorMap)
    .filter(function(v){ return v.sentPcs > 0 || v.pendingPcs !== 0; })
    .sort(function(a,b){ return Math.abs(b.pendingPcs) - Math.abs(a.pendingPcs); });

  // ── DIE_LIFE ────────────────────────────────────────────
  var dieRunning=[],dieComplete=[],dieSh=ss.getSheetByName('DIE_LIFE');
  if(dieSh&&dieSh.getLastRow()>=3){
    dieSh.getDataRange().getValues().slice(2).forEach(function(r){
      if(!r[0])return;
      var entry={machine:sS(r[0]),vf:sS(r[1]),customer:sS(r[2]),runStart:dS(r[3]),runEnd:dS(r[4]),days:sN(r[5]),shifts:sN(r[6]),totalPcs:sN(r[7]),status:sS(r[8])};
      if(entry.status==='RUNNING')dieRunning.push(entry);
      else dieComplete.push(entry);
    });
  }
  dieRunning.sort(function(a,b){return b.totalPcs-a.totalPcs;});
  dieComplete.sort(function(a,b){return (b.runEnd||'').localeCompare(a.runEnd||'');});
  
  // ── DEBIT NOTES ─────────────────────────────────────────
  var debitRows=[],dbSh=ss.getSheetByName('DEBIT_NOTE_TRACKER');
  if(dbSh&&dbSh.getLastRow()>=3){
    dbSh.getDataRange().getValues().slice(2).forEach(function(r){
      if(r[0])debitRows.push({vendor:sS(r[1]),vfNo:sS(r[2]),status:sS(r[6])});
    });
  }
  
  // ── MARGINS ─────────────────────────────────────────────
  var margRows=[],mgSh=ss.getSheetByName('MARGINS_SUMMARY');
  if(mgSh&&mgSh.getLastRow()>=3){
    mgSh.getDataRange().getValues().slice(3).forEach(function(r){
      var vf=sS(r[1]);
      if(!vf||sN(r[8])<=0)return; 
      margRows.push({
        vfNo:vf, band:sS(r[0]), customer:sS(r[2]), grade:sS(r[3]),
        convPerKg:sN(r[6]), netPerKg:sN(r[7]), dispTons:sN(r[8]), turnoverL:sN(r[10]), netRealL:sN(r[12])
      });
    });
  }

  // ── OIL_SUMMARY ─────────────────────────────────────────
  var oilSummary={};
  var oilSmSh=ss.getSheetByName('OIL_SUMMARY');
  if(oilSmSh&&oilSmSh.getLastRow()>=6){
    var oilA=oilSmSh.getDataRange().getValues();
    oilSummary={
      openingForge:sN(oilA[2][1]),openingHT:sN(oilA[2][2]),openingZyc:sN(oilA[2][3]),
      inwardForge:sN(oilA[3][1]),inwardHT:sN(oilA[3][2]),inwardZyc:sN(oilA[3][3]),
      consumedForge:sN(oilA[4][1]),consumedHT:sN(oilA[4][2]),consumedZyc:sN(oilA[4][3]),
      closingForge:sN(oilA[5][1]),closingHT:sN(oilA[5][2]),closingZyc:sN(oilA[5][3])
    };
  }

  // ── TRANSPORT_SUMMARY ───────────────────────────────────
  var transportRows = [];
  var trSmSh = ss.getSheetByName('TRANSPORT_SUMMARY');
  if (trSmSh && trSmSh.getLastRow() >= 3) {
    trSmSh.getDataRange().getValues().slice(2).forEach(function(r){
      var mn = sS(r[0]);
      if (!mn) return;
      transportRows.push({
        month: mn, basicRs: sN(r[1]), totalInclGST: sN(r[2]), status: sS(r[3]), baselineRs: sN(r[4]),
        inboundL: sN(r[5]), outboundL: sN(r[6]), runningTotal: sN(r[7]), weightKg: sN(r[8]),
        weightTons: sN(r[9]), freightPerKg: sN(r[10]), freightPerTon: sN(r[11])
      });
    });
  }
  var transporterLedger = [];
  var tlSh = ss.getSheetByName('TRANSPORTER_LEDGER');
  if (tlSh && tlSh.getLastRow() >= 3) {
    tlSh.getDataRange().getValues().slice(2).forEach(function(r){
      var name = sS(r[0]);
      if (!name) return;
      transporterLedger.push({
        transporter: name, dispatches: sN(r[1]), vehicles: sN(r[2]), totalWeightKg: sN(r[3]),
        totalTons: sN(r[4]), totalFreightRs: sN(r[5]), avgPerKg: sN(r[6]), avgPerTon: sN(r[7]),
        lastDispatch: r[8] instanceof Date ? r[8].toISOString() : sS(r[8])
      });
    });
  }

  var shiftStatus = readShiftStatusForCache_(ss);

  // ---- MACHINE UTILIZATION KPI ----
  var todayTotalPcs = 0;
  ['cutting','forging','pressing','machine'].forEach(function(k) {
    (todaySection[k] || []).forEach(function(row) {
      Object.keys(row.entries || {}).forEach(function(vf) {
        todayTotalPcs += sN(row.entries[vf]);
      });
    })
  });
  var baselineDailyPcs = 15000;
  var utilSh = ss.getSheetByName('UTIL_BASELINE');
  if (utilSh && utilSh.getRange(1,1).getValue()) {
    var val = sN(utilSh.getRange(1,1).getValue());
    if (val > 0) baselineDailyPcs = val;
  }
  var utilPct = Math.round((todayTotalPcs / baselineDailyPcs) * 100);
  var utilization = { util_pct: utilPct, today_pcs: todayTotalPcs, baseline_month: 'Config', baseline_pcs: baselineDailyPcs };

  // ── COST_SUMMARY (real shape, not the wide pivot table originally assumed) ──
  var costSummarySnap = readCostSummarySnap_(ss);

  // ─── CONSOLIDATE STRINGS FLAT ───
  var mergedFlatPayload = {
    schema_v: 2,
    updated_at: Utilities.formatDate(new Date(),'Asia/Kolkata','dd-MMM-yyyy HH:mm')+' IST',
    rm_rate: 61.27,
    mtd: mtd,
    alerts: alerts,
    alerts_ts: Utilities.formatDate(new Date(),'Asia/Kolkata','dd-MMM HH:mm')+' IST',
    utilization: utilization,   // <-- ADD THIS LINE
    dept_score: {scores:deptScores,overallPct:overallPct,workingDays:new Date().getDate()},
    jwk_vfs: jwkVFs,
    shift_status: shiftStatus,
    today: todaySection,
    fy_monthly: fyRows,
    wip: {rows:wipRows,summary:wipSummary},
    schedule: {rows:schedRows,month:curMonth,summary:schedSum},
    prod_monthly: pmRows,
    steel: {grades:steelRows,totalInwardKg:Math.round(totalInwardKg),totalConsumedKg:Math.round(totalConsumedKg),totalBalanceKg:Math.round(totalBalanceKg),totalValueL:Math.round(totalValueL*10)/10},
    elec: {deptBars:elecBars,totalKwh:Math.round(elecTotal)},
    outstanding: {totalOverdue:outOD,totalNotDue:outND,totalOutstanding:outTotal,asOn:outAsOn,customers:outRows},
    f4: {vendors:f4Vendors},
    die_life: {running:dieRunning,complete:dieComplete},
    debit_notes: {notes:debitRows},
    margins: {rows:margRows,rmAvgRate:61.27},
    manpower_summary: mpSummaryRows,
    oil_summary: oilSummary,
    transport_summary: transportRows,
    transporter_ledger: transporterLedger,
    planner: plannerRows,
    vendor_rej_summary: { totalPcs: vrejTotalPcs, totalRs: Math.round(vrejTotalRs), rows: vrejRows },
    data_gaps_summary: dataGapsSummary,
    cost_summary_snap: costSummarySnap,
    machine_registry: getMachineRegistryForCache_(),
    dropout_trend: buildDropoutTrend_(),
    downtime_summary: buildDowntimeSummary_()
  };

  // ─── DATA SPLICING ENGINE ───
  // The JSON is split across cells to bypass Sheets' ~50k char/cell limit,
  // then reassembled by string concatenation in getMergedCache_(). That
  // reassembly has no way to tell "all chunks present, in order" apart
  // from "one chunk lost/truncated" — both just produce a JSON.parse
  // failure with no useful diagnostic. B1 stores the expected total
  // length so getMergedCache_() can catch a truncated/corrupt cache
  // immediately, with a message that says so, instead of a generic parse
  // error the frontend can't act on.
  backupDashboardCache_(ss); // snapshot whatever's there now, before it's overwritten below

  // Write per-section CacheService keys so doGet(?section=X) can serve
  // individual sections without parsing the full JSON. TTL = 10 min,
  // always invalidated by invalidateDashJsonCache_() on the next pull.
  var secCache = CacheService.getScriptCache();
  DASH_SEC_NAMES_.forEach(function(k) {
    try {
      var val = mergedFlatPayload[k];
      if (val === undefined) return;
      var secJson = JSON.stringify(val);
      if (secJson.length < 95000) secCache.put('DASH_SEC_v2_' + k, secJson, 600);
    } catch(e) {}
  });

  var cacheSh = ss.getSheetByName('DASHBOARD_CACHE') || ss.insertSheet('DASHBOARD_CACHE');
  cacheSh.clearContents();

  var cleanJsonString = JSON.stringify(mergedFlatPayload);
  var maxSafeChunkSize = 35000;
  var optimizedChunks = [];

  for (var i = 0; i < cleanJsonString.length; i += maxSafeChunkSize) {
    optimizedChunks.push(cleanJsonString.substring(i, i + maxSafeChunkSize));
  }

  var cacheOutputValues = optimizedChunks.map(function(chunkText) {
    return [chunkText];
  });

  cacheSh.getRange(1, 1, cacheOutputValues.length, 1).setValues(cacheOutputValues);
  cacheSh.getRange(1, 2).setValue(cleanJsonString.length); // B1 = expected total char length
  Logger.log('✅ DASHBOARD_CACHE SUCCESS: Flat stream split across ' + cacheOutputValues.length + ' partitions, ' + cleanJsonString.length + ' chars.');

  invalidateDashJsonCache_();
}
// ─────────────────────────────────────────────────────────────
// THE BRIDGE: DOGET + CACHE MERGER
// ─────────────────────────────────────────────────────────────



// ════════════════════════════════════════════════════════════
// REPLACEMENT: buildAlertsActive()
// Clear-and-rebuild on every call. No appending. No duplicates.
// Sources:
//   STEEL_STOCK   → CRITICAL / ORDER SOON grades
//   RAW_OUTSTANDING → overdue customers (positive values only)
//   DEBIT_NOTE_TRACKER → PENDING debit notes count
//   SCHEDULE_INTELLIGENCE → if produced < 50% of schedule
//   PRODUCTION_PLANNER → missing master data blockers
// ════════════════════════════════════════════════════════════
function buildAlertsActive() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var alerts = [];

  // 1. Steel alerts — from STEEL_STOCK (also builds steelMap for rule 6 below)
  var steelMap = {};
  var stSh = ss.getSheetByName('STEEL_STOCK');
  if (stSh && stSh.getLastRow() >= 3) {
    stSh.getDataRange().getValues().slice(2).forEach(function(r) {
      var grade  = (r[0] || '').toString().trim();
      var status = (r[8] || '').toString().trim();
      var bal    = Number(r[4]) || 0;
      var days   = r[7];
      // Skip: blank, TOTAL row, or rows that are already just emoji labels
      if (!grade || grade === 'TOTAL' || grade.toUpperCase() === 'GRADE') return;
      steelMap[grade] = bal;
      if (status.indexOf('CRITICAL') >= 0) {
        alerts.push(['STEEL', 'RED', 'HIGH', grade,
          grade + ' \u2014 ' + Math.round(bal) + ' kg (' + days + ' days stock remaining)',
          new Date()]);
      } else if (status.indexOf('ORDER SOON') >= 0 || status.indexOf('WATCH') >= 0) {
        alerts.push(['STEEL', 'AMBER', 'MEDIUM', grade,
          grade + ' \u2014 ' + Math.round(bal) + ' kg (' + days + ' days stock remaining)',
          new Date()]);
      }
    });
  }

  // 2. Overdue alerts — from RAW_OUTSTANDING (positive values only, no credits)
  // Col[0]=Customer, Col[1]=Not_Due_Rs, Col[2]=Overdue_Rs, Col[3]=Grand_Total_Rs
  var outSh = ss.getSheetByName('RAW_OUTSTANDING');
  if (outSh && outSh.getLastRow() >= 3) {
    outSh.getDataRange().getValues().slice(2).forEach(function(r) {
      var cust = (r[0] || '').toString().trim();
      var od   = Number(r[2]) || 0;
      if (!cust || cust.toUpperCase().indexOf('GRAND TOTAL') >= 0) return;
      if (od <= 0) return; // skip credits (negative values) — not a collection problem
      if (od > 2000000) {
        alerts.push(['OVERDUE', 'RED', 'HIGH', cust,
          cust + ' \u2014 \u20b9' + (Math.round(od / 100000) / 10) + 'L overdue',
          new Date()]);
      } else if (od > 500000) {
        alerts.push(['OVERDUE', 'AMBER', 'MEDIUM', cust,
          cust + ' \u2014 \u20b9' + (Math.round(od / 100000) / 10) + 'L overdue',
          new Date()]);
      }
    });
  }

  // 3. Debit note pending count — from DEBIT_NOTE_TRACKER
  var dbSh = ss.getSheetByName('DEBIT_NOTE_TRACKER');
  var pendingCount = 0;
  if (dbSh && dbSh.getLastRow() >= 3) {
    dbSh.getDataRange().getValues().slice(2).forEach(function(r) {
      if ((r[6] || '').toString().trim().toUpperCase() === 'PENDING') pendingCount++;
    });
  }
  if (pendingCount > 0) {
    alerts.push(['DEBIT_NOTE', 'RED', 'HIGH', 'Debit Notes',
      pendingCount + ' vendor rejections with debit note PENDING \u2014 action needed',
      new Date()]);
  }

  // 4. Schedule gap — from SCHEDULE_INTELLIGENCE
  // Col[0]=VF, Col[1]=SchedQty, Col[6]=ProducedMTD
  var scSh = ss.getSheetByName('SCHEDULE_INTELLIGENCE');
  if (scSh && scSh.getLastRow() >= 3) {
    var totalSched = 0, totalProd = 0;
    scSh.getDataRange().getValues().slice(2).forEach(function(r) {
      var vf = (r[0] || '').toString().trim();
      if (!vf || vf.indexOf('GRAND TOTAL') >= 0) return;
      totalSched += Number(r[1]) || 0;
      totalProd  += Number(r[6]) || 0;
    });
    if (totalSched > 0) {
      var pct = Math.round(totalProd / totalSched * 100);
      if (pct < 50) {
        alerts.push(['SCHEDULE', 'AMBER', 'MEDIUM', 'Schedule',
          'Only ' + pct + '% of monthly schedule produced \u2014 risk of miss',
          new Date()]);
      }
    }
  }

  // 5. Missing master data — from PRODUCTION_PLANNER
  // Look for rows where Action column contains 'GAP' or 'Data Missing'
  var ppSh = ss.getSheetByName('PRODUCTION_PLANNER');
  var missingMasterCount = 0;
  if (ppSh && ppSh.getLastRow() >= 3) {
    ppSh.getDataRange().getValues().slice(2).forEach(function(r) {
      if (!r[0]) return; // skip spacer rows
      var action = (r[8] || '').toString();
      if (action.indexOf('GAP') >= 0 || action.indexOf('Data Missing') >= 0) {
        missingMasterCount++;
      }
    });
  }
  if (missingMasterCount > 0) {
    alerts.push(['MASTER_DATA', 'RED', 'HIGH', 'Missing Part Data',
      missingMasterCount + ' scheduled parts are missing Finish Wt or Machine info. Check RAW_PARTS red cells.',
      new Date()]);
  }

  // 6. VF-level RM shortage on priority parts — from SCHEDULE_INTELLIGENCE
  // + COSTING_BANDS + steelMap (built in section 1 above). A/A+ band VFs
  // are the customer's top-priority parts; if one still has balance to
  // produce this month and the required grade doesn't have enough stock,
  // that's a concrete, actionable shortage — not just a grade-level "order
  // soon" note. This did not previously exist as its own alert type.
  var cbMapAl = {};
  var cbShAl = ss.getSheetByName('COSTING_BANDS');
  if (cbShAl && cbShAl.getLastRow() >= 3) {
    cbShAl.getDataRange().getValues().slice(2).forEach(function(r) {
      var vf = (r[0] || '').toString().trim();
      if (!vf) return;
      cbMapAl[vf] = { grade: (r[2] || '').toString().trim(), band: (r[12] || '').toString().trim() || '—' };
    });
  }
  var scShAl = ss.getSheetByName('SCHEDULE_INTELLIGENCE');
  if (scShAl && scShAl.getLastRow() >= 3) {
    scShAl.getDataRange().getValues().slice(2).forEach(function(r) {
      var vf = (r[0] || '').toString().trim();
      if (!vf || vf.indexOf('GRAND TOTAL') >= 0) return;
      var balProduce = Number(r[8]) || 0;
      var rmRequired = Number(r[10]) || 0;
      if (balProduce <= 0 || rmRequired <= 0) return;
      var cb = cbMapAl[vf];
      if (!cb || (cb.band !== 'A+' && cb.band !== 'A')) return;
      var stockKg = steelMap[cb.grade] || 0;
      if (stockKg < rmRequired) {
        alerts.push(['RM_SHORTAGE', 'RED', 'HIGH', vf,
          vf + ' (' + cb.band + ') — ' + Math.round(balProduce) + ' pcs to produce needs ' +
          Math.round(rmRequired) + ' kg ' + cb.grade + ', only ' + Math.round(stockKg) + ' kg in stock',
          new Date()]);
      }
    });
  }

  // ── Write — always CLEAR first, then write fresh ──
  var headers = ['Alert_Type', 'Severity', 'Priority', 'Subject', 'Message', 'Generated_At'];
  var sh = ss.getSheetByName('ALERTS_ACTIVE');
  if (!sh) sh = ss.insertSheet('ALERTS_ACTIVE');

  sh.clearContents();
  sh.clearFormats();

  sh.getRange(1, 1).setValue(
    'ACTIVE ALERTS   |   Generated: ' +
    Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy HH:mm'));

  sh.getRange(2, 1, 1, 6).setValues([headers])
    .setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');

  if (alerts.length > 0) {
    sh.getRange(3, 1, alerts.length, 6).setValues(alerts);
    for (var i = 0; i < alerts.length; i++) {
      if (alerts[i][1] === 'RED')   sh.getRange(i + 3, 1, 1, 6).setBackground('#FEE2E2');
      if (alerts[i][1] === 'AMBER') sh.getRange(i + 3, 1, 1, 6).setBackground('#FEF3C7');
    }
  } else {
    sh.getRange(3, 1).setValue('OK: No active alerts');
  }

  sh.autoResizeColumns(1, 6);

  Logger.log('ALERTS_ACTIVE rebuilt: ' + alerts.length + ' alerts (' +
    alerts.filter(function(a) { return a[1] === 'RED'; }).length + ' RED, ' +
    alerts.filter(function(a) { return a[1] === 'AMBER'; }).length + ' AMBER)');
}


// ════════════════════════════════════════════════════════════
// REPLACEMENT: buildMasterDataGaps()
// Removed: appendAlertsToActive_ call (caused stacking)
// Added: GRAND TOTAL guard on VF loop
// The MASTER_DATA alert is now raised by buildAlertsActive()
// from the PRODUCTION_PLANNER tab — no duplicate path needed.
// ════════════════════════════════════════════════════════════
function buildMasterDataGaps() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('DATA_GAPS');
  if (!sh) return;

  // 1. Clear old GAP 8 section (prevents stacking within DATA_GAPS)
  var data = sh.getDataRange().getValues();
  for (var r = 0; r < data.length; r++) {
    if (data[r][0] && data[r][0].toString().indexOf('GAP 8') > -1) {
      sh.deleteRows(r + 1, sh.getLastRow() - r);
      break;
    }
  }

  // 2. Load master parts map
  var partsMap = {};
  var partsSh = ss.getSheetByName('RAW_PARTS');
  if (!partsSh || partsSh.getLastRow() < 3) {
    Logger.log('buildMasterDataGaps: RAW_PARTS missing or empty');
    return;
  }
  var pData = partsSh.getDataRange().getValues();
  for (var i = 2; i < pData.length; i++) {
    var vf = (pData[i][1] || '').toString().trim();
    if (!vf) continue;
    partsMap[vf] = {
      grade: pData[i][11],
      iw:    pData[i][5],
      fw:    pData[i][8]
    };
  }

  // 3. Audit scheduled parts from SCHEDULE_INTELLIGENCE
  var gaps = [];
  var scSh = ss.getSheetByName('SCHEDULE_INTELLIGENCE');
  if (!scSh || scSh.getLastRow() < 3) {
    Logger.log('buildMasterDataGaps: SCHEDULE_INTELLIGENCE missing or empty');
    return;
  }
  var scData = scSh.getDataRange().getValues();

  for (var i = 2; i < scData.length; i++) {
    var vf = (scData[i][0] || '').toString().trim();
    // Skip blank rows and both GRAND TOTAL summary rows
    if (!vf || vf.indexOf('GRAND TOTAL') >= 0) continue;

    var part   = partsMap[vf];
    var issues = [];

    if (!part) {
      issues.push('RED: Missing from RAW_PARTS entirely');
    } else {
      var grade = (part.grade || '').toString().trim();
      if (!grade || grade === '' || grade.toUpperCase() === 'NA') issues.push('Grade missing');
      if (cleanNum_(part.iw) <= 0) issues.push('Input Wt missing');
      if (cleanNum_(part.fw) <= 0) issues.push('Finish Wt missing');
    }

    if (issues.length > 0) {
      gaps.push([
        vf,
        scData[i][1] || 0,
        issues.join(' | '),
        'High \u2014 Blocks Production Planning',
        'RAW_PARTS Master'
      ]);
    }
  }

  // 4. Write to DATA_GAPS tab (no alert appending — buildAlertsActive handles that)
  var startRow = sh.getLastRow() + 2;
  sh.getRange(startRow, 1).setValue(
    'GAP 8 -- MISSING MASTER DATA FOR SCHEDULED PARTS (Planner Blockers)')
    .setFontWeight('bold').setFontColor('#B91C1C');

  var headers = [['VF No', 'Scheduled Qty', 'Specific Issue', 'Impact', 'DME Action Area']];
  sh.getRange(startRow + 1, 1, 1, 5).setValues(headers)
    .setFontWeight('bold').setBackground('#FEE2E2');

  if (gaps.length > 0) {
    sh.getRange(startRow + 2, 1, gaps.length, 5).setValues(gaps);
    Logger.log('buildMasterDataGaps: ' + gaps.length + ' parts with missing master data');
  } else {
    sh.getRange(startRow + 2, 1).setValue(
      'OK: All scheduled parts have clean master data.');
    Logger.log('buildMasterDataGaps: all parts clean');
  }
}
// ============================================================
// DASHBOARD INTEGRATION ENGINE (CACHE BRIDGES)
// ============================================================

/**
 * 1. DYNAMIC CACHE WRITER
 * Slices large JSON objects dynamically into chunks to bypass
 * Google Sheets' strict 50,000 character cell ceiling.
 * Call this at the very end of your runDashboardPull loop.
 * * @param {Object} dashboardDataPayload Master calculation bundle
 */
function saveDashboardCache_(dashboardDataPayload) {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var cacheSh = ss.getSheetByName('DASHBOARD_CACHE');
  if (!cacheSh) {
    cacheSh = ss.insertSheet('DASHBOARD_CACHE');
  }
  
  // Clear any existing contents to remove legacy strings
  cacheSh.getRange('A1:A').clearContents();
  
  var jsonStr = JSON.stringify(dashboardDataPayload); 
  var maxSafeChunkSize = 35000; // Force safe buffer below 50k character cell block
  var payloadChunks = [];

  for (var i = 0; i < jsonStr.length; i += maxSafeChunkSize) {
    payloadChunks.push(jsonStr.substring(i, i + maxSafeChunkSize));
  }

  // Map into vertical matrix row structure
  var cacheOutputValues = payloadChunks.map(function(chunkText) { 
    return [chunkText]; 
  });

  // Save split strings dynamically based on real-time size tracking
  cacheSh.getRange(1, 1, cacheOutputValues.length, 1).setValues(cacheOutputValues);
  Logger.log('✅ DASHBOARD_CACHE WRITE SUCCESS: Created ' + cacheOutputValues.length + ' cell partitions.');
}

/**
 * 2. CACHE BRIDGE READER
 * Re-assembles fragmented cell blocks from the workbook tab
 * into a single unified JSON stream for web clients.
 * * @return {Object} Reconstituted application data matrix
 */
function getMergedCache_() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var cacheSh = ss.getSheetByName('DASHBOARD_CACHE');
  if (!cacheSh) return { error: 'No Cache Found' };

  // Pull all active cell strings dynamically from Column A
  var lastRow = Math.max(1, cacheSh.getLastRow());
  var cells = cacheSh.getRange(1, 1, lastRow, 1).getValues();
  var expectedLen = Number(cacheSh.getRange(1, 2).getValue()) || 0; // B1, written by buildDashboardCache

  var fullJsonString = '';
  cells.forEach(function(row) {
    if (row[0]) {
      fullJsonString += row[0].toString().trim();
    }
  });

  if (!fullJsonString) {
    return { error: 'Cache row elements are empty.' };
  }

  // Catch a truncated/corrupt reassembly explicitly, before JSON.parse
  // turns it into an opaque syntax error the frontend can't explain to
  // anyone. expectedLen is 0 on caches built before this check existed —
  // skip the comparison rather than false-flagging old-format caches.
  if (expectedLen > 0 && fullJsonString.length !== expectedLen) {
    return { error: 'DASHBOARD_CACHE truncated or corrupted: expected ' + expectedLen +
      ' chars, reassembled ' + fullJsonString.length + '. Run buildDashboardCache() again.' };
  }

  try {
    return JSON.parse(fullJsonString);
  } catch(e) {
    Logger.log('🛑 Malformed string assembly failed to parse: ' + e);
    return { error: 'Malformed cache payload compilation string.' };
  }
}
function normalizeGrade_(rawGrade) {
  if (!rawGrade) return 'UNKNOWN';
  var g = rawGrade.toString().trim().toUpperCase();
  if (g.indexOf('16MNCR5') === 0 || g === '16MN' || g === '16 MN') return '16MNCR5';
  if (g.indexOf('20MNCR5') === 0 || g === '20 MN' || g === '20MN' || g === '20C8') return '20MNCR5';
  if (g === 'EN8' || g === 'CK45' || g === 'C45' || g === '45C8' || g === 'S45C' || g === 'SAE1049' || g === 'C20') return 'EN8D';
  if (g.indexOf('18CRNIMO') === 0 || g === '17CRNIMO6') return '18CRNIMO6-7';
  if (g.indexOf('41CR4') === 0) return '41CR4';
  if (g.indexOf('S355') === 0) return 'S355 J2';
  return g;
}

function buildDailyManpower() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var curMonth = MONTH_NAMES_[new Date().getMonth()];
  var stSh = ss.getSheetByName('RAW_MANPOWER_STAFF');
  var ctSh = ss.getSheetByName('RAW_MANPOWER_CONTRACT');
  if (!stSh || !ctSh) return;

  var sData = stSh.getDataRange().getValues();
  var cData = ctSh.getDataRange().getValues();
  var dateMap = {};

  function normDept(d) {
    var dept = (d || '').toString().trim();
    var map = { 'Heat Treatment': 'HT Shop', 'Maintenance': 'Maint Dept', 'Housekeeping': 'Office', 'HR': 'Office', 'Stores': 'Store', 'VMC Shop': 'Machine Shop' };
    return map[dept] || dept;
  }

  for (var i = 2; i < sData.length; i++) {
    var d = sData[i][0]; if (!d) continue;
    var dt = (d instanceof Date) ? d : new Date(d);
    if (MONTH_NAMES_[dt.getMonth()] !== curMonth) continue;
    var dateStr = Utilities.formatDate(dt, 'Asia/Kolkata', 'yyyy-MM-dd');
    var dept = (sData[i][2] || '').toString().trim();
    if (!dept) continue;
    if (!dateMap[dateStr]) dateMap[dateStr] = {};
    if (!dateMap[dateStr][dept]) dateMap[dateStr][dept] = { coStaff: 0, coWorker: 0, coOp: 0, contDetails: {}, contOp: 0, contHelper: 0, rawDate: dt };
    dateMap[dateStr][dept].coStaff += (Number(sData[i][3]) || 0);
    dateMap[dateStr][dept].coWorker += (Number(sData[i][4]) || 0);
    dateMap[dateStr][dept].coOp += (Number(sData[i][5]) || 0);
  }

  for (var i = 2; i < cData.length; i++) {
    var d = cData[i][0]; if (!d) continue;
    var dt = (d instanceof Date) ? d : new Date(d);
    if (MONTH_NAMES_[dt.getMonth()] !== curMonth) continue;
    var dateStr = Utilities.formatDate(dt, 'Asia/Kolkata', 'yyyy-MM-dd');
    var dept = normDept(cData[i][2]); 
    var cat = (cData[i][3] || '').toString().trim();
    var heads = Number(cData[i][4]) || 0;
    if (!dept || heads === 0) continue;
    if (!dateMap[dateStr]) dateMap[dateStr] = {};
    if (!dateMap[dateStr][dept]) dateMap[dateStr][dept] = { coStaff: 0, coWorker: 0, coOp: 0, contDetails: {}, contOp: 0, contHelper: 0, rawDate: dt };
    if (!dateMap[dateStr][dept].contDetails[cat]) dateMap[dateStr][dept].contDetails[cat] = 0;
    dateMap[dateStr][dept].contDetails[cat] += heads;
    if (cat.toLowerCase().indexOf('helper') >= 0 || cat.toLowerCase().indexOf('casual') >= 0) dateMap[dateStr][dept].contHelper += heads;
    else dateMap[dateStr][dept].contOp += heads;
  }

  var output = [];
  var DEPT_ORDER = ['Forge Shop','Press Shop','Machine Shop','Cutting Shop','Die Shop','HT Shop','Final Shop','Maint Dept','Store','Office'];
  Object.keys(dateMap).sort(function(a, b) { return a > b ? -1 : 1; }).forEach(function(ds) {
    var dMap = dateMap[ds];
    var displayDate = Utilities.formatDate(dMap[Object.keys(dMap)[0]].rawDate, 'Asia/Kolkata', 'dd-MMM-yyyy');
    DEPT_ORDER.forEach(function(dept) {
      if (!dMap[dept]) return;
      var m = dMap[dept];
      var contStr = '';
      Object.keys(m.contDetails).sort().forEach(function(cat) { contStr += cat + ': ' + m.contDetails[cat] + '\n'; });
      output.push([ displayDate, dept, m.coStaff || '—', m.coWorker || '—', m.coOp || '—', contStr.trim() || '—', m.contOp || '—', m.contHelper || '—', (m.coOp + m.contOp) || '—', (m.coStaff + m.coWorker + m.coOp + m.contOp + m.contHelper) ]);
    });
    output.push(['','','','','','','','','','']);
  });
  if (output.length > 0 && output[output.length-1][0] === '') output.pop();

  var headers = ['Date', 'Department', 'Company Staff', 'Company Worker', 'Company Operator', 'Contractor Roles', 'Contractor Operators', 'Contractor Helpers', 'Total Operators', 'Total Headcount'];
  var sh = ss.getSheetByName('DAILY_MANPOWER') || ss.insertSheet('DAILY_MANPOWER');
  sh.clearContents(); sh.clearFormats();
  sh.getRange(1, 1).setValue('DAILY MANPOWER TRACKER — ' + curMonth + '  |  Newest dates at the top');
  sh.getRange(2, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
  if (output.length > 0) {
    sh.getRange(3, 1, output.length, headers.length).setValues(output).setVerticalAlignment('middle');
    sh.getRange(3, 6, output.length, 1).setWrap(true).setFontSize(9);
    for(var i=0; i<output.length; i++) {
       if(output[i][0] === '') sh.getRange(i+3, 1, 1, headers.length).setBackground('#F5F5F5');
       else { sh.getRange(i+3, 1, 1, 1).setFontWeight('bold'); sh.getRange(i+3, 9, 1, 2).setBackground('#E8F5E9').setFontWeight('bold'); }
    }
  }
  sh.setFrozenRows(2);
}

function buildManpowerTrend() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var curMonth = MONTH_NAMES_[new Date().getMonth()];
  var stSh = ss.getSheetByName('RAW_MANPOWER_STAFF');
  var ctSh = ss.getSheetByName('RAW_MANPOWER_CONTRACT');
  if (!stSh || !ctSh) return;

  var sData = stSh.getDataRange().getValues();
  var cData = ctSh.getDataRange().getValues();
  var allDates = {}, matrix = {};

  function normDept(d) {
    var dept = (d || '').toString().trim();
    var map = { 'Heat Treatment': 'HT Shop', 'Maintenance': 'Maint Dept', 'Housekeeping': 'Office', 'HR': 'Office', 'Stores': 'Store', 'VMC Shop': 'Machine Shop' };
    return map[dept] || dept;
  }

  for (var i = 2; i < sData.length; i++) {
    var d = sData[i][0]; if (!d) continue;
    var dt = (d instanceof Date) ? d : new Date(d);
    if (MONTH_NAMES_[dt.getMonth()] !== curMonth) continue;
    var dateStr = Utilities.formatDate(dt, 'Asia/Kolkata', 'dd-MMM');
    allDates[dateStr] = dt;
    var dept = normDept(sData[i][2]);
    if (!dept) continue;
    if (!matrix[dept]) matrix[dept] = { 'COMPANY': {}, 'CONTRACTOR': {} };
    var staff = Number(sData[i][3]) || 0, worker = Number(sData[i][4]) || 0, operator = Number(sData[i][5]) || 0;
    if (staff > 0) { if (!matrix[dept]['COMPANY']['Staff']) matrix[dept]['COMPANY']['Staff'] = {}; matrix[dept]['COMPANY']['Staff'][dateStr] = (matrix[dept]['COMPANY']['Staff'][dateStr] || 0) + staff; }
    if (worker > 0) { if (!matrix[dept]['COMPANY']['Worker']) matrix[dept]['COMPANY']['Worker'] = {}; matrix[dept]['COMPANY']['Worker'][dateStr] = (matrix[dept]['COMPANY']['Worker'][dateStr] || 0) + worker; }
    if (operator > 0) { if (!matrix[dept]['COMPANY']['Operator']) matrix[dept]['COMPANY']['Operator'] = {}; matrix[dept]['COMPANY']['Operator'][dateStr] = (matrix[dept]['COMPANY']['Operator'][dateStr] || 0) + operator; }
  }

  for (var i = 2; i < cData.length; i++) {
    var d = cData[i][0]; if (!d) continue;
    var dt = (d instanceof Date) ? d : new Date(d);
    if (MONTH_NAMES_[dt.getMonth()] !== curMonth) continue;
    var dateStr = Utilities.formatDate(dt, 'Asia/Kolkata', 'dd-MMM');
    allDates[dateStr] = dt;
    var dept = normDept(cData[i][2]), cat = (cData[i][3] || '').toString().trim(), heads = Number(cData[i][4]) || 0;
    if (!dept || !cat || heads === 0) continue;
    if (!matrix[dept]) matrix[dept] = { 'COMPANY': {}, 'CONTRACTOR': {} };
    if (!matrix[dept]['CONTRACTOR'][cat]) matrix[dept]['CONTRACTOR'][cat] = {};
    matrix[dept]['CONTRACTOR'][cat][dateStr] = (matrix[dept]['CONTRACTOR'][cat][dateStr] || 0) + heads;
  }

  var sortedDateStrs = Object.keys(allDates).sort(function(a, b) { return allDates[a] - allDates[b]; });
  var DEPT_ORDER = ['Forge Shop','Press Shop','Machine Shop','Cutting Shop','Die Shop','HT Shop','Final Shop','Maint Dept','Store','Office'];
  var headers = ['Department', 'Source', 'Role / Category'].concat(sortedDateStrs).concat(['MONTH MAX', 'MONTH AVG']);
  var output = [], formattingMeta = []; 

  DEPT_ORDER.forEach(function(dept) {
    if (!matrix[dept]) return;
    var deptRows = [], deptFmt = [], deptTotalRow = [dept, 'DEPT TOTAL', 'ALL ROLES'], deptTotalsByDate = {}, hasData = false;

    ['COMPANY', 'CONTRACTOR'].forEach(function(source) {
      Object.keys(matrix[dept][source]).sort().forEach(function(cat) {
        hasData = true;
        var row = [dept, source, cat], roleMax = 0, roleSum = 0, roleCount = 0;
        sortedDateStrs.forEach(function(ds) {
          var val = matrix[dept][source][cat][ds] || 0;
          row.push(val > 0 ? val : '—');
          if (val > 0) { if (val > roleMax) roleMax = val; roleSum += val; roleCount++; }
          deptTotalsByDate[ds] = (deptTotalsByDate[ds] || 0) + val;
        });
        row.push(roleMax > 0 ? roleMax : '—'); row.push(roleCount > 0 ? Math.round(roleSum / roleCount) : '—');
        deptRows.push(row); deptFmt.push(source === 'COMPANY' ? '#E3F2FD' : '#FFF3E0'); 
      });
    });

    if (hasData) {
      var deptMax = 0, deptSum = 0, deptCount = 0;
      sortedDateStrs.forEach(function(ds) {
        var dTotal = deptTotalsByDate[ds] || 0;
        deptTotalRow.push(dTotal > 0 ? dTotal : '—');
        if (dTotal > 0) { if (dTotal > deptMax) deptMax = dTotal; deptSum += dTotal; deptCount++; }
      });
      deptTotalRow.push(deptMax > 0 ? deptMax : '—'); deptTotalRow.push(deptCount > 0 ? Math.round(deptSum / deptCount) : '—');
      output.push(deptTotalRow); formattingMeta.push('#1565C0');
      output = output.concat(deptRows); formattingMeta = formattingMeta.concat(deptFmt);
      output.push(new Array(headers.length).fill('')); formattingMeta.push('#FFFFFF');
    }
  });

  var sh = ss.getSheetByName('MANPOWER_DAY_WISE') || ss.insertSheet('MANPOWER_DAY_WISE');
  sh.clearContents(); sh.clearFormats();
  sh.getRange(1, 1).setValue('MANPOWER TREND MATRIX — ' + curMonth);
  sh.getRange(2, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#37474F').setFontColor('#FFFFFF');
  if (output.length > 0) {
    sh.getRange(3, 1, output.length, headers.length).setValues(output);
    for (var r = 0; r < output.length; r++) {
      var bg = formattingMeta[r];
      if (bg === '#1565C0') sh.getRange(r + 3, 1, 1, headers.length).setBackground(bg).setFontColor('#FFFFFF').setFontWeight('bold');
      else if (bg !== '#FFFFFF') { sh.getRange(r + 3, 1, 1, headers.length).setBackground(bg); sh.getRange(r + 3, 2, 1, 2).setFontWeight('bold'); }
    }
  }
  sh.setFrozenRows(2); sh.setFrozenColumns(3);
}

function buildProductionPlanner() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var PRESS_CAP_MULT = 2.5, HMR_CAP_MULT = 1000.0; 
  var cbMap = {};
  var cbSh = ss.getSheetByName('COSTING_BANDS');
  if (cbSh && cbSh.getLastRow() >= 2) {
    cbSh.getDataRange().getValues().slice(2).forEach(function(r) {
      var vf = (r[0]||'').toString().trim();
      if (vf) cbMap[vf] = { grade: r[2], iw: Number(r[4])||1, fw: Number(r[5])||0, band: r[12]||'—' };
    });
  }

  var partsMap = {};
  var pSh = ss.getSheetByName('RAW_PARTS');
  if (pSh && pSh.getLastRow() >= 2) {
    pSh.getDataRange().getValues().slice(2).forEach(function(r) {
      var vf = (r[1]||'').toString().trim();
      if (vf) partsMap[vf] = (r[14]||'').toString().trim();
    });
  }

  var cutWipMap = {};
  var wipSh = ss.getSheetByName('WIP_SUMMARY');
  if (wipSh && wipSh.getLastRow() >= 2) {
    wipSh.getDataRange().getValues().slice(2).forEach(function(r) {
      var vf = (r[0]||'').toString().trim();
      if (vf) cutWipMap[vf] = Number(r[5]) || 0; 
    });
  }

  var virtualSteel = {};
  var stSh = ss.getSheetByName('STEEL_STOCK');
  if (stSh && stSh.getLastRow() >= 3) {
    stSh.getDataRange().getValues().slice(2).forEach(function(r) {
      var gRaw = (r[0]||'').toString().trim();
      if (gRaw && gRaw.toUpperCase() !== 'TOTAL') virtualSteel[normalizeGrade_(gRaw)] = (virtualSteel[normalizeGrade_(gRaw)] || 0) + (Number(r[4]) || 0);
    });
  }

  var machineQueues = {};
  var scSh = ss.getSheetByName('SCHEDULE_INTELLIGENCE');
  if (!scSh) return;
  scSh.getDataRange().getValues().slice(2).forEach(function(r) {
    var vf = (r[0]||'').toString().trim(), bal = Number(r[5]) || 0;
    if (!vf || vf === 'GRAND TOTAL' || bal <= 0) return;
    
    var cb = cbMap[vf] || {band:'—', iw:1, fw:0, grade:'UNKNOWN'}, unitRaw = (partsMap[vf] || '').toString().trim(), cutWip = cutWipMap[vf] || 0;
    var target = 0, tMatch = unitRaw.match(/(\d+(\.\d+)?)/), tonnage = tMatch ? parseFloat(tMatch[1]) : 0;
    if (tonnage > 0 && cb.fw > 0) target = Math.round((tonnage * (unitRaw.toLowerCase().indexOf('press') > -1 ? PRESS_CAP_MULT : HMR_CAP_MULT)) / cb.fw);

    var rmReqKg = Math.max(0, bal - cutWip) * cb.iw, normGrade = normalizeGrade_(cb.grade), stock = virtualSteel[normGrade] || 0, allocKg = Math.min(stock, rmReqKg);
    virtualSteel[normGrade] -= allocKg; 
    
    var rmStatus = '', rmStatusVal = 9; 
    if (cutWip >= target || cutWip >= bal) { rmStatus = '🔵 CUT WIP'; rmStatusVal = 0; }
    else if (allocKg >= rmReqKg) { rmStatus = '🟢 FULL RM'; rmStatusVal = 1; }
    else if (allocKg > 0 || cutWip > 0) { rmStatus = '🟡 PARTIAL'; rmStatusVal = 2; }
    else { rmStatus = '🔴 NO RM/WIP'; rmStatusVal = 3; }
    
    var item = { vf:vf, band:cb.band, bal:bal, target:target, allocKg:allocKg, cutWip:cutWip, unit:unitRaw || 'OPEN', rmStatus:rmStatus, rmStatusVal:rmStatusVal };
    if (!machineQueues[item.unit]) machineQueues[item.unit] = [];
    machineQueues[item.unit].push(item);
  });

  var finalPlan = [];
  var unitOrder = ['1300 Ton Press', '1.0 Ton Hammer', '1.5 Ton Hammer', '2.0 Ton Hammer', '3.0 Ton Hammer', '1000 Ton Press', '2500 Ton Press', '800 Ton Press'];
  
  Object.keys(machineQueues).sort(function(a,b) {
     var idxA = unitOrder.indexOf(a), idxB = unitOrder.indexOf(b);
     return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  }).forEach(function(unit) {
    var q = machineQueues[unit], BAND_ORD = {'A+':1, 'A':2, 'A-':3, 'B+':4, 'B':5, 'B-':6, 'C':7, '—':8};
    q.sort(function(a,b) { if (a.rmStatusVal !== b.rmStatusVal) return a.rmStatusVal - b.rmStatusVal; return (BAND_ORD[a.band]||9) - (BAND_ORD[b.band]||9); });
    q.forEach(function(j, idx) {
      var action = (j.target <= 0) ? '🔴 GAP: Fix Tonnage' : (j.rmStatusVal === 3) ? '❌ WAIT RM' : (idx === 0) ? '✅ LOAD DIE' : '⏳ QUEUED';
      var matStr = []; if (j.cutWip > 0) matStr.push(Math.round(j.cutWip) + ' pcs(WIP)'); if (j.allocKg > 0) matStr.push(Math.round(j.allocKg) + ' kg(RM)');
      finalPlan.push([unit, j.band, j.vf, j.rmStatus, Math.round(j.bal), j.target > 0 ? (j.bal/j.target).toFixed(1) : '—', Math.round(j.target), matStr.join(' + ') || '0', action]);
    });
    finalPlan.push(new Array(9).fill('')); 
  });

  var outSh = ss.getSheetByName('PRODUCTION_PLANNER') || ss.insertSheet('PRODUCTION_PLANNER');
  outSh.clearContents(); 
  outSh.getRange(1, 1).setValue("UNIT-WISE LOADING SEQUENCE | Sequential Die Plan | Updated: " + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm')).setFontWeight('bold');
  var headers = ["Unit / Machine", "Band", "VF No", "RM Status", "Bal to Produce", "Shifts Req", "Target/Shift", "Allocated Material", "Supervisor Action"];
  outSh.getRange(2, 1, 1, 9).setValues([headers]).setFontWeight('bold').setBackground('#1E1E1E').setFontColor('#FFFFFF');
  if (finalPlan.length > 0) outSh.getRange(3, 1, finalPlan.length, 9).setValues(finalPlan);
}

function highlightMissingPartData() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var pSh = ss.getSheetByName('RAW_PARTS');
  if (!pSh || pSh.getLastRow() < 3) return;
  var data = pSh.getDataRange().getValues();
  var redBgsI = [], redBgsO = [];
  for (var r = 2; r < data.length; r++) {
    var vf = (data[r][1] || '').toString().trim();
    if (!vf) { redBgsI.push(['#FFFFFF']); redBgsO.push(['#FFFFFF']); continue; }
    var fw = Number(data[r][8]) || 0;
    var unit = (data[r][14] || '').toString().trim();
    redBgsI.push([fw <= 0 ? '#FFCDD2' : '#FFFFFF']);
    redBgsO.push([!unit ? '#FFCDD2' : '#FFFFFF']);
  }
  pSh.getRange(3, 9, redBgsI.length, 1).setBackgrounds(redBgsI);
  pSh.getRange(3, 15, redBgsO.length, 1).setBackgrounds(redBgsO);
}

function buildCollectionEngine() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var rawSh = ss.getSheetByName('RAW_OUTSTANDING');
  if (!rawSh || rawSh.getLastRow() < 3) return;
  var actions = [];
  rawSh.getDataRange().getValues().slice(2).forEach(function(r) {
    var customer = r[0], overdue = Number(r[2])||0, total = Number(r[3])||0;
    if (overdue < 10000 || !customer || customer === 'GRAND TOTAL') return; 
    var status = overdue > 500000 ? "🔴 CRITICAL" : (overdue > 100000 ? "🟠 WARNING" : "🟡 FOLLOW-UP");
    var priority = overdue > 500000 ? 1 : 2;
    actions.push([priority, customer, overdue, total, status, "Email Template", "⏳ PENDING", ""]);
  });
  var destSh = ss.getSheetByName('COLLECTION_ACTION') || ss.insertSheet('COLLECTION_ACTION');
  destSh.clearContents();
  var headers = [['Priority', 'Customer', 'Overdue (₹)', 'Total O/S (₹)', 'Risk Status', 'Auto-Drafted Email (Copy/Paste)', 'Action Status', 'Finance Remarks']];
  destSh.getRange(2, 1, 1, headers[0].length).setValues(headers).setFontWeight('bold').setBackground('#B91C1C').setFontColor('#FFFFFF');
  if (actions.length > 0) {
    destSh.getRange(3, 1, actions.length, headers[0].length).setValues(actions);
    destSh.setRowHeights(3, actions.length, 80); 
    destSh.getRange(3, 6, actions.length, 1).setWrap(true); 
  } 
}

// @ts-nocheck
// ============================================================
// VFPL — setupManpowerFormulas v2 (CORRECTED)
// Date: 20-Apr-2026 21:00 IST
//
// Fix: Col B (Company HC avg) was #ERROR! due to complex
// SUMPRODUCT/COUNTIFS formula. Replaced with simple AVERAGEIF
// across DAILY_MANPOWER cols C+D+E (Staff+Worker+Operator).
// AVERAGEIF automatically ignores '—' strings.
//
// DEPLOY:
//   1. Find setupManpowerFormulas in Code.gs
//   2. Delete it entirely
//   3. Paste this new version in its place
//   4. Save
//   5. Run setupManpowerFormulas from dropdown
//   6. MANPOWER_SUMMARY should show real numbers in ALL columns
// ============================================================

function setupManpowerFormulas() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('MANPOWER_SUMMARY') || ss.insertSheet('MANPOWER_SUMMARY');
  sh.clearContents();
  sh.clearFormats();

  // Row 1 = headers
  var headers = ['Department', 'Company HC (avg)', 'Contract HC (avg)',
                 'Est Company Cost', 'Actual Contract Cost', 'Total Dept Cost'];
  sh.getRange(1, 1, 1, 6)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1565C0')
    .setFontColor('#FFFFFF');

  // 10 departments with their contract tab name mappings
  var depts = [
    {n: 'Forge Shop',   c: '{"Forge Shop"}'},
    {n: 'Press Shop',   c: '{"Press Shop"}'},
    {n: 'Machine Shop', c: '{"Machine Shop","VMC Shop"}'},
    {n: 'Cutting Shop', c: '{"Cutting Shop"}'},
    {n: 'Die Shop',     c: '{"Die Shop"}'},
    {n: 'HT Shop',      c: '{"Heat Treatment"}'},
    {n: 'Final Shop',   c: '{"Final Shop"}'},
    {n: 'Maint Dept',   c: '{"Maintenance"}'},
    {n: 'Store',        c: '{"Stores"}'},
    {n: 'Office',       c: '{"Housekeeping","HR"}'}
  ];

  var rows = depts.map(function(d, i) {
    var r = i + 2; // row number in sheet

    // Col B — Company HC avg
    // DAILY_MANPOWER: Col B=Dept, C=Staff, D=Worker, E=Operator
    // AVERAGEIF skips '—' strings automatically → no #ERROR!
    var companyHC =
      '=IFERROR(ROUND(' +
        'IFERROR(AVERAGEIF(DAILY_MANPOWER!$B:$B,A' + r + ',DAILY_MANPOWER!$C:$C),0)+' +
        'IFERROR(AVERAGEIF(DAILY_MANPOWER!$B:$B,A' + r + ',DAILY_MANPOWER!$D:$D),0)+' +
        'IFERROR(AVERAGEIF(DAILY_MANPOWER!$B:$B,A' + r + ',DAILY_MANPOWER!$E:$E),0)' +
      ',0),0)';

    // Col C — Contract HC avg (was already working — unchanged)
    var contractHC =
      '=IFERROR(ROUND(' +
        'SUM(ARRAYFORMULA(SUMIFS(RAW_MANPOWER_CONTRACT!$E:$E,' +
          'RAW_MANPOWER_CONTRACT!$C:$C,' + d.c + ')))/' +
        'MAX(1,COUNTA(UNIQUE(FILTER(RAW_MANPOWER_CONTRACT!$A:$A,' +
          'RAW_MANPOWER_CONTRACT!$A:$A<>""))))' +
      ',0),0)';

    // Col D — Est Company Cost (26 working days × ₹700/day baseline)
    var estCost = '=ROUND(B' + r + '*26*700)';

    // Col E — Actual Contract Cost from RAW_MANPOWER_CONTRACT
    var actContCost =
      '=SUM(ARRAYFORMULA(SUMIFS(RAW_MANPOWER_CONTRACT!$G:$G,' +
        'RAW_MANPOWER_CONTRACT!$C:$C,' + d.c + ')))';

    // Col F — Total Dept Cost
    var totalCost = '=D' + r + '+E' + r;

    return [d.n, companyHC, contractHC, estCost, actContCost, totalCost];
  });

  // Row 12 = TOTAL
  rows.push([
    'TOTAL',
    '=SUM(B2:B11)',
    '=SUM(C2:C11)',
    '=SUM(D2:D11)',
    '=SUM(E2:E11)',
    '=SUM(F2:F11)'
  ]);

  sh.getRange(2, 1, rows.length, 6).setValues(rows);

  // Format TOTAL row
  sh.getRange(rows.length + 1, 1, 1, 6)
    .setFontWeight('bold')
    .setBackground('#E8F5E9');

  sh.autoResizeColumns(1, 6);

  Logger.log('setupManpowerFormulas v2: done. Check MANPOWER_SUMMARY — all columns should show numbers.');
}
function refreshCache15min() {
  try {
    buildDashboardCache();
    Logger.log('Cache refreshed at ' + new Date());
  } catch(e) {
    Logger.log('Cache refresh failed: ' + e);
  }
}

function setCacheTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'refreshCache15min') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshCache15min').timeBased().everyMinutes(15).create();
  Logger.log('Cache refresh trigger set (every 15 min).');
}
function patchElectricityIntoFYMonthly() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('FY_MONTHLY');
  if (!sh) { Logger.log('FY_MONTHLY tab missing'); return; }
  
  // Find the column index for "Electricity (kWh)"
  var headers = sh.getRange(2, 1, 1, sh.getLastColumn()).getValues()[0];
  var elecCol = -1;
  for (var c = 0; c < headers.length; c++) {
    if (headers[c].toString().trim() === 'Electricity (kWh)') {
      elecCol = c + 1;
      break;
    }
  }
  if (elecCol === -1) { Logger.log('Electricity column not found'); return; }
  
  // Month arrays
  var FY_MONTHS = ['April','May','June','July','August','September',
                   'October','November','December','January','February','March'];
  var MONTH_CAL = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];
  function getMonthName_(d) {
    var dt = (d instanceof Date) ? d : parseDate_(d);
    if (!dt) return null;
    return MONTH_CAL[dt.getMonth()];
  }
  
  // Accumulate electricity per month
  var result = {};
  FY_MONTHS.forEach(function(m) { result[m] = 0; });
  
  // Use rawRows_ which is defined in Code.gs
  var data = rawRows_(ss, 'RAW_ELECTRICITY');
  data.forEach(function(row) {
    var d = parseDate_(row[0]); 
    if (!d) return;
    var mn = getMonthName_(d); 
    if (!result.hasOwnProperty(mn)) return;
    var meter = (row[2] || '').toString().trim();
    var kwh = Number(row[3]) || 0;
    if (kwh > 0 && meter.indexOf('MSEB') >= 0) {
      result[mn] += kwh;
    }
  });
  
  // Write values to the sheet
  var startRow = 3;
  var totalUpdated = 0;
  FY_MONTHS.forEach(function(mn, idx) {
    var val = result[mn] || 0;
    sh.getRange(startRow + idx, elecCol).setValue(val);
    if (val > 0) totalUpdated++;
    Logger.log('Set ' + mn + ' electricity to ' + val);
  });
  
  // Format as number
  var lastRow = sh.getLastRow();
  if (lastRow >= 3) {
    sh.getRange(3, elecCol, lastRow - 2, 1).setNumberFormat('#,##0');
  }
  
  Logger.log('patchElectricityIntoFYMonthly complete. ' + totalUpdated + ' months with positive electricity.');
}
function runAnalyticsDaily() {
  Logger.log('=== Daily Analytics started ===');
  try { refreshDailyOverview();        Logger.log('OK Daily Overview'); } catch(e) { Logger.log('FAIL Daily Overview: '+e); }
  try { buildProductionMonthly();      Logger.log('OK Production Monthly'); } catch(e) { Logger.log('FAIL Production Monthly: '+e); }
  try { buildWIPSummary();             Logger.log('OK WIP Summary'); } catch(e) { Logger.log('FAIL WIP Summary: '+e); }
  try { buildScheduleIntelligence();   Logger.log('OK Schedule Intelligence'); } catch(e) { Logger.log('FAIL Schedule Intelligence: '+e); }
  try { buildFYMonthly();              Logger.log('OK FY Monthly'); } catch(e) { Logger.log('FAIL FY Monthly: '+e); }
  try { patchElectricityIntoFYMonthly(); Logger.log('OK Electricity Patch'); } catch(e) { Logger.log('FAIL Electricity Patch: '+e); }
  try { buildDieLife();                Logger.log('OK Die Life'); } catch(e) { Logger.log('FAIL Die Life: '+e); }
  try { buildDebitNoteTracker();       Logger.log('OK Debit Notes'); } catch(e) { Logger.log('FAIL Debit Notes: '+e); }
  try { buildAlertsActive();           Logger.log('OK Alerts Active'); } catch(e) { Logger.log('FAIL Alerts Active: '+e); }
  try { buildDashboardCache();         Logger.log('OK Dashboard Cache'); } catch(e) { Logger.log('FAIL Dashboard Cache: '+e); }
  Logger.log('=== Daily Analytics complete ===');
}
// ============================================================
// TELEGRAM ALERT ENGINE (Consolidated Messages)
// ============================================================
// ============================================================
// SEND TELEGRAM ALERT
// ============================================================

function sendTelegramAlert(message) {
  var token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  var chatId = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID');
  
  if (!token) { Logger.log('❌ TELEGRAM_BOT_TOKEN not set'); return; }
  if (!chatId) { Logger.log('❌ TELEGRAM_CHAT_ID not set'); return; }
  
  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  var payload = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML'
  };
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    Logger.log('✅ Telegram alert sent. Response: ' + response.getResponseCode());
  } catch(e) {
    Logger.log('❌ Telegram send failed: ' + e);
  }
}

// ============================================================
// DEPLOY ALL TRIGGERS
// ============================================================

function deployAllTriggers() {
  // Clear all existing triggers
  ScriptApp.getProjectTriggers().forEach(function(t) {
    ScriptApp.deleteTrigger(t);
  });
  
  // Deploy all
  setDashboardTriggers();          // 08:15, 12:00, 16:00, 18:00, 19:00, 23:00
  deployShiftTrackingTriggers();   // Alert.gs — gentle reminder, DME alert, follow-up, daily/weekly summary
  setCacheTriggers();              // 15-min cache refresh

  Logger.log('✅ All triggers deployed successfully!');
  Logger.log('📊 Pulls: 8:15AM, 12PM, 4PM, 6PM, 7PM, 11PM');
  Logger.log('⏰ Alerts: see Alert.gs deployShiftTrackingTriggers() for the full schedule');
}
// ============================================================
// LIST ALL ACTIVE TRIGGERS (For Verification)
// ============================================================

// ============================================================
// LIST ALL ACTIVE TRIGGERS WITH DETAILS
// ============================================================

function listAllTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  Logger.log('=== ACTIVE TRIGGERS ===');
  Logger.log('Total: ' + triggers.length + ' triggers');
  Logger.log('');
  
  triggers.forEach(function(t) {
    var func = t.getHandlerFunction();
    try {
      var time = t.getTimeBased();
      var hour = time.getAtHour();
      var minute = time.getNearMinute();
      var label = '';
      
      // Map functions to their purpose
      var ALERT_FUNCS_ = ['sendGentleReminder', 'sendDMEDeadlineAlert', 'sendFollowUpAlert',
                           'sendDailySummary', 'sendWeeklyPerformance'];
      if (func === 'runDashboardPull') {
        label = '📊 DATA PULL';
      } else if (ALERT_FUNCS_.indexOf(func) > -1) {
        label = '⏰ ALERT';
      } else if (func === 'refreshCache15min') {
        label = '🔄 CACHE';
      }
      
      Logger.log('  • ' + func + ' → ' + hour + ':' + String(minute).padStart(2, '0') + ' ' + label);
    } catch(e) {
      // For interval triggers (like every 15 min)
      if (func === 'refreshCache15min') {
        Logger.log('  • ' + func + ' → EVERY 15 MINUTES 🔄');
      } else {
        Logger.log('  • ' + func + ' → ' + t.getTriggerSource());
      }
    }
  });
  
  // Summary
  Logger.log('');
  Logger.log('=== SUMMARY ===');
  var pullCount = 0, alertCount = 0;
  var ALERT_FUNCS_SUMMARY_ = ['sendGentleReminder', 'sendDMEDeadlineAlert', 'sendFollowUpAlert',
                               'sendDailySummary', 'sendWeeklyPerformance'];
  triggers.forEach(function(t) {
    var func = t.getHandlerFunction();
    if (func === 'runDashboardPull') pullCount++;
    if (ALERT_FUNCS_SUMMARY_.indexOf(func) > -1) alertCount++;
  });
  Logger.log('📊 Data Pulls: ' + pullCount);
  Logger.log('⏰ Alerts: ' + alertCount);
  Logger.log('🔄 Cache: 1 (every 15 min)');
}
