// ============================================================
// ALERT.gs — SUPERVISOR TRACKING (DYNAMIC WEEKLY MAPPING)
// ============================================================
// Purpose: Dynamic supervisor mapping by week + all missing-data
// alerting (Code.gs no longer contains any alert logic — deploy
// both files together in the same Apps Script project). DASH_ID
// is declared once, in Code.gs, and shared here.
// ============================================================

// ── DEPARTMENT LIST ──────────────────────────────────────
var DEPARTMENTS = [
  'Cutting', 'Forge', 'Press', 'Machine', 'HT', 'Final',
  'Electricity', 'Oil', 'Staff Manpower', 'Contract Manpower'
];

// ── RAW TAB MAPPING ──────────────────────────────────────
var DEPT_TO_RAW_TAB = {
  'Cutting': 'RAW_CUTTING',
  'Forge': 'RAW_FORGE',
  'Press': 'RAW_PRESS',
  'Machine': 'RAW_MACHINE',
  'HT': 'RAW_HT',
  'Final': 'RAW_FINAL',
  'Electricity': 'RAW_ELECTRICITY',
  'Oil': 'RAW_OIL',
  'Staff Manpower': 'RAW_MANPOWER_STAFF',
  'Contract Manpower': 'RAW_MANPOWER_CONTRACT'
};

// ── SHIFT CONFIG ──────────────────────────────────────────
var SHIFT_CONFIG_DATA = {
  'Shift 1': { start: '8:30', end: '15:30', grace: 60, deadline: '16:30', reminder: 15 },
  'Shift 2': { start: '15:30', end: '23:30', grace: 60, deadline: '00:30', reminder: 15 },
  'Shift 3': { start: '23:30', end: '08:30', grace: 60, deadline: '09:30', reminder: 15 }
};

// ============================================================
// SECTION 1: SETUP — Run Once to Create/Update Tabs
// ============================================================

function setupDynamicSupervisorTabs() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  
  createDynamicSupervisorMap_(ss);
  createShiftConfigTab_(ss);
  createDataSubmissionLogTab_(ss);
  createWeeklyPerformanceTab_(ss);
  createFormResponsesTab_(ss);
  createEscalationLogTab_(ss);
  
  Logger.log('✅ All dynamic supervisor tabs created/updated!');
}

function createDynamicSupervisorMap_(ss) {
  var sh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!sh) sh = ss.insertSheet('SUPERVISOR_MAP');
  sh.clearContents();
  sh.clearFormats();
  
  var headers = [
    'Department',
    'Supervisor Name',
    'Phone',
    'Telegram Chat ID',
    'Week Start (Monday)',
    'Week End (Sunday)',
    'Active'
  ];
  
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1565C0')
    .setFontColor('#FFFFFF');
  
  // ─── SAMPLE DATA WITH PLACEHOLDERS ───
  var sampleData = [
    ['Cutting', '______', '______', '______', '04-Aug-2026', '10-Aug-2026', 'YES'],
    ['Cutting', '______', '______', '______', '11-Aug-2026', '17-Aug-2026', 'YES'],
    ['Forge', '______', '______', '______', '04-Aug-2026', '10-Aug-2026', 'YES'],
    ['Forge', '______', '______', '______', '11-Aug-2026', '17-Aug-2026', 'YES'],
    ['Press', '______', '______', '______', '04-Aug-2026', '10-Aug-2026', 'YES'],
    ['Press', '______', '______', '______', '11-Aug-2026', '17-Aug-2026', 'YES'],
    ['Machine', '______', '______', '______', '04-Aug-2026', '10-Aug-2026', 'YES'],
    ['Machine', '______', '______', '______', '11-Aug-2026', '17-Aug-2026', 'YES'],
    ['HT', '______', '______', '______', '04-Aug-2026', '10-Aug-2026', 'YES'],
    ['HT', '______', '______', '______', '11-Aug-2026', '17-Aug-2026', 'YES'],
    ['Final', '______', '______', '______', '04-Aug-2026', '10-Aug-2026', 'YES'],
    ['Final', '______', '______', '______', '11-Aug-2026', '17-Aug-2026', 'YES'],
    ['Electricity', '______', '______', '______', '04-Aug-2026', '10-Aug-2026', 'YES'],
    ['Oil', '______', '______', '______', '04-Aug-2026', '10-Aug-2026', 'YES'],
    ['Staff Manpower', '______', '______', '______', '04-Aug-2026', '10-Aug-2026', 'YES'],
    ['Contract Manpower', '______', '______', '______', '04-Aug-2026', '10-Aug-2026', 'YES']
  ];
  
  if (sampleData.length > 0) {
    sh.getRange(2, 1, sampleData.length, headers.length).setValues(sampleData);
  }
  
  // Data validation for Department column
  var deptRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(DEPARTMENTS)
    .build();
  sh.getRange(2, 1, sampleData.length, 1).setDataValidation(deptRule);
  
  // Data validation for Active column
  var activeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['YES', 'NO'])
    .build();
  sh.getRange(2, 7, sampleData.length, 1).setDataValidation(activeRule);
  
  sh.autoResizeColumns(1, headers.length);
  
  sh.getRange(1, 1).setNote(
    '📋 DYNAMIC SUPERVISOR MAP\n' +
    '═══════════════════════════════════════════\n\n' +
    '📌 HOW IT WORKS:\n' +
    '  • Each row = one supervisor for one department\n' +
    '  • Multiple rows per department = multiple supervisors\n' +
    '  • Script picks the supervisor for the current week\n\n' +
    '📌 FIELDS:\n' +
    '  • Department: Dropdown (select from list)\n' +
    '  • Supervisor Name: Full name\n' +
    '  • Phone: 10-digit number\n' +
    '  • Telegram Chat ID: (Optional) For individual alerts\n' +
    '  • Week Start: First day supervisor is assigned (Monday)\n' +
    '  • Week End: Last day supervisor is assigned (Sunday)\n' +
    '  • Active: YES/NO (set to NO to remove without deleting)\n\n' +
    '📌 EXAMPLE:\n' +
    '  Cutting | Amit Singh | 9876543210 | 123456 | 04-Aug-2026 | 10-Aug-2026 | YES\n' +
    '  Cutting | Sanjay Patel | 9876543211 | 654321 | 11-Aug-2026 | 17-Aug-2026 | YES\n\n' +
    '🔗 DASHBOARD: ' + ScriptApp.getService().getUrl()
  );
  
  Logger.log('  ✅ Dynamic SUPERVISOR_MAP created with ' + sampleData.length + ' rows');
}

function createShiftConfigTab_(ss) {
  var sh = ss.getSheetByName('SHIFT_CONFIG');
  if (!sh) sh = ss.insertSheet('SHIFT_CONFIG');
  sh.clearContents();
  sh.clearFormats();
  
  var headers = ['Shift', 'Start', 'End', 'Grace (mins)', 'Deadline', 'Reminder (mins before)'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1565C0')
    .setFontColor('#FFFFFF');
  
  var data = [
    ['Shift 1', '8:30', '15:30', 60, '16:30', 15],
    ['Shift 2', '15:30', '23:30', 60, '00:30', 15],
    ['Shift 3', '23:30', '08:30', 60, '09:30', 15]
  ];
  
  if (data.length > 0) {
    sh.getRange(2, 1, data.length, headers.length).setValues(data);
  }
  
  sh.autoResizeColumns(1, headers.length);
  Logger.log('  ✅ SHIFT_CONFIG created');
}

function createDataSubmissionLogTab_(ss) {
  var sh = ss.getSheetByName('DATA_SUBMISSION_LOG');
  if (!sh) sh = ss.insertSheet('DATA_SUBMISSION_LOG');
  sh.clearContents();
  sh.clearFormats();
  
  var headers = ['Date', 'Department', 'Shift', 'Supervisor', 'Entry Time', 'Status', 'Delay (mins)', 'Points'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1565C0')
    .setFontColor('#FFFFFF');
  
  sh.autoResizeColumns(1, headers.length);
  Logger.log('  ✅ DATA_SUBMISSION_LOG created');
}

function createWeeklyPerformanceTab_(ss) {
  var sh = ss.getSheetByName('WEEKLY_PERFORMANCE');
  if (!sh) sh = ss.insertSheet('WEEKLY_PERFORMANCE');
  sh.clearContents();
  sh.clearFormats();
  
  var headers = ['Rank', 'Supervisor', 'Department', 'Week', 'Total', 'On Time', 'Late', 'Missing', 'Score %', 'Points', 'Performance'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1565C0')
    .setFontColor('#FFFFFF');
  
  sh.autoResizeColumns(1, headers.length);
  Logger.log('  ✅ WEEKLY_PERFORMANCE created');
}

function createFormResponsesTab_(ss) {
  var sh = ss.getSheetByName('FORM_RESPONSES');
  if (!sh) sh = ss.insertSheet('FORM_RESPONSES');
  sh.clearContents();
  sh.clearFormats();
  
  var headers = [
    'Timestamp',
    'Department',
    'Supervisor Name',
    'Phone',
    'Telegram Chat ID',
    'Week Start (Monday)',
    'Week End (Sunday)',
    'Status'
  ];
  
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1565C0')
    .setFontColor('#FFFFFF');
  
  sh.autoResizeColumns(1, headers.length);
  
  sh.getRange(1, 1).setNote(
    '📋 FORM_RESPONSES — Supervisor Data\n' +
    'This tab receives data from the Google Form.\n' +
    'Script auto-processes new submissions and updates SUPERVISOR_MAP.'
  );
  
  Logger.log('  ✅ FORM_RESPONSES created');
}

function createEscalationLogTab_(ss) {
  var sh = ss.getSheetByName('ESCALATION_LOG');
  if (!sh) sh = ss.insertSheet('ESCALATION_LOG');
  sh.clearContents();
  sh.clearFormats();
  
  var headers = ['Date', 'Time', 'Department', 'Shift', 'Supervisor', 'Escalation Level', 'Action Taken'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#B71C1C')
    .setFontColor('#FFFFFF');
  
  sh.autoResizeColumns(1, headers.length);
  Logger.log('  ✅ ESCALATION_LOG created');
}

// ============================================================
// SECTION 2: DYNAMIC SUPERVISOR LOOKUP (YOUR NEW FORMAT)
// ============================================================

/**
 * Get supervisor for a department based on current week
 */
function getSupervisorForCurrentWeek_(dept) {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!sh) return { name: 'Unknown', phone: '', chatId: '' };
  
  var data = sh.getDataRange().getValues();
  var today = new Date();
  var todayStr = Utilities.formatDate(today, 'Asia/Kolkata', 'yyyy-MM-dd');
  
  for (var i = 1; i < data.length; i++) {
    var rowDept = (data[i][0] || '').toString().trim();
    if (rowDept !== dept) continue;
    
    var weekStart = data[i][4];
    var weekEnd = data[i][5];
    var active = (data[i][6] || '').toString().trim().toUpperCase();
    
    if (active !== 'YES') continue;
    if (!weekStart || !weekEnd) continue;
    
    var startStr = Utilities.formatDate(new Date(weekStart), 'Asia/Kolkata', 'yyyy-MM-dd');
    var endStr = Utilities.formatDate(new Date(weekEnd), 'Asia/Kolkata', 'yyyy-MM-dd');
    
    if (todayStr >= startStr && todayStr <= endStr) {
      return {
        name: data[i][1] || 'Unknown',
        phone: data[i][2] || '',
        chatId: data[i][3] || '',
        weekStart: startStr,
        weekEnd: endStr
      };
    }
  }
  
  return { name: 'Unknown', phone: '', chatId: '' };
}

/**
 * Get ALL supervisors for a department (for DME reference)
 */
function getAllSupervisorsForDepartment_(dept) {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!sh) return [];
  
  var data = sh.getDataRange().getValues();
  var supervisors = [];
  
  for (var i = 1; i < data.length; i++) {
    var rowDept = (data[i][0] || '').toString().trim();
    if (rowDept !== dept) continue;
    
    var active = (data[i][6] || '').toString().trim().toUpperCase();
    if (active !== 'YES') continue;
    
    supervisors.push({
      name: data[i][1] || 'Unknown',
      phone: data[i][2] || '',
      chatId: data[i][3] || '',
      weekStart: data[i][4] || '',
      weekEnd: data[i][5] || ''
    });
  }
  
  return supervisors;
}

// ── Alias for backward compatibility ──
function getSupervisorInfo_(dept, shift) {
  return getSupervisorForCurrentWeek_(dept);
}


// ============================================================
// SECTION 4: SHIFT DETECTION
// ============================================================

function getShiftToCheck_() {
  var now = new Date();
  var hours = now.getHours();
  var minutes = now.getMinutes();
  var timeMinutes = hours * 60 + minutes;
  
  var shift1Start = 8 * 60 + 30;
  var shift1End = 15 * 60 + 30;
  var shift2Start = 15 * 60 + 30;
  var shift2End = 23 * 60 + 30;
  var shift3Start = 23 * 60 + 30;
  var shift3End = 8 * 60 + 30;
  
  if (timeMinutes >= shift1Start && timeMinutes < shift1End) {
    return { shift: 'Shift 1', deadline: '16:30' };
  } else if (timeMinutes >= shift2Start && timeMinutes < shift2End) {
    return { shift: 'Shift 2', deadline: '00:30' };
  } else if (timeMinutes >= shift3Start || timeMinutes < shift3End) {
    return { shift: 'Shift 3', deadline: '09:30' };
  }
  return null;
}

// Shift column indices per RAW tab type.
// Production tabs (CUTTING/FORGE/PRESS/MACHINE/HT/FINAL): Shift at col 2.
// Manpower tabs (STAFF/CONTRACT): Shift at col 1.
// Date-only tabs (ELECTRICITY/OIL): no shift column — check date only.
var RAW_TAB_SHIFT_COL_ = {
  'RAW_CUTTING':           2,
  'RAW_FORGE':             2,
  'RAW_PRESS':             2,
  'RAW_MACHINE':           2,
  'RAW_HT':                2,
  'RAW_FINAL':             2,
  'RAW_MANPOWER_STAFF':    1,
  'RAW_MANPOWER_CONTRACT': 1
  // RAW_ELECTRICITY and RAW_OIL have no shift column — omitted intentionally
};

// Canonical form-submission shift text → expected values in shift column.
var SHIFT_TEXT_MAP_ = {
  'Shift 1': ['First Shift',  '1', 'Shift 1', 'first shift'],
  'Shift 2': ['Second Shift', '2', 'Shift 2', 'second shift'],
  'Shift 3': ['Third Shift',  '3', 'Shift 3', 'third shift']
};

function hasDataForShift_(dept, shift, date) {
  var rawTab = DEPT_TO_RAW_TAB[dept];
  if (!rawTab) return false;

  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName(rawTab);
  if (!sh || sh.getLastRow() < 3) return false;

  var data = sh.getDataRange().getValues();
  var dateStr = Utilities.formatDate(date, 'Asia/Kolkata', 'yyyy-MM-dd');

  // For tabs with no shift column, any row on the target date counts.
  var shiftColIdx = RAW_TAB_SHIFT_COL_[rawTab];
  var validShiftTexts = SHIFT_TEXT_MAP_[shift] || [];

  for (var i = 2; i < data.length; i++) {
    var d = data[i][0];
    if (!d) continue;
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) continue;
    var rowDateStr = Utilities.formatDate(dt, 'Asia/Kolkata', 'yyyy-MM-dd');
    if (rowDateStr !== dateStr) continue;

    // Date matches — now check shift if applicable
    if (shiftColIdx === undefined) return true; // date-only tab, any row counts
    var rowShift = (data[i][shiftColIdx] || '').toString().trim();
    if (validShiftTexts.indexOf(rowShift) >= 0) return true;
  }
  return false;
}

function getMissingDepartments_(shift, date) {
  var missing = [];
  
  DEPARTMENTS.forEach(function(dept) {
    var hasData = hasDataForShift_(dept, shift, date);
    if (!hasData) {
      var supervisor = getSupervisorForCurrentWeek_(dept);
      missing.push({
        department: dept,
        supervisor: supervisor.name,
        phone: supervisor.phone,
        chatId: supervisor.chatId
      });
    }
  });
  
  return missing;
}

function buildMissingListText_(missing) {
  if (missing.length === 0) return '✅ All departments have submitted data.';
  
  var lines = [];
  missing.forEach(function(m) {
    var phoneText = m.phone ? ' | 📞 ' + m.phone : '';
    lines.push('  • ' + m.department + ' — 👤 ' + m.supervisor + phoneText);
  });
  return lines.join('\n');
}

function sendTelegramToChatId(chatId, message) {
  if (!chatId || chatId === '') return;
  
  var token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) {
    Logger.log('❌ TELEGRAM_BOT_TOKEN not set');
    return;
  }
  
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
    Logger.log('✅ Telegram sent to ' + chatId);
  } catch(e) {
    Logger.log('❌ Telegram send failed to ' + chatId + ': ' + e);
  }
}

function getShiftTiming_(shift) {
  var config = SHIFT_CONFIG_DATA[shift];
  return config ? config.start + ' – ' + config.end : 'Unknown';
}

function getShiftDeadline_(shift) {
  var config = SHIFT_CONFIG_DATA[shift];
  return config ? config.deadline : 'Unknown';
}

function logEscalation_(dept, shift, supervisor, level) {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('ESCALATION_LOG');
  if (!sh) return;
  
  var now = new Date();
  sh.appendRow([
    Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM-dd'),
    Utilities.formatDate(now, 'Asia/Kolkata', 'HH:mm'),
    dept,
    shift,
    supervisor,
    level,
    'Alert sent'
  ]);
}

function wasEscalatedToday_(dept, shift) {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('ESCALATION_LOG');
  if (!sh || sh.getLastRow() < 2) return false;
  
  var data = sh.getDataRange().getValues();
  var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  
  for (var i = 1; i < data.length; i++) {
    var date = (data[i][0] instanceof Date) ? 
      Utilities.formatDate(data[i][0], 'Asia/Kolkata', 'yyyy-MM-dd') : 
      (data[i][0] || '');
    if (date === today && (data[i][2] || '') === dept && (data[i][3] || '') === shift) {
      return true;
    }
  }
  return false;
}

// ============================================================
// SECTION 5: ALERT FUNCTIONS
// ============================================================

function sendGentleReminder() {
  var shiftInfo = getShiftToCheck_();
  if (!shiftInfo) {
    Logger.log('⚠️ No active shift to check.');
    return;
  }
  
  var today = new Date();
  var dateStr = Utilities.formatDate(today, 'Asia/Kolkata', 'dd-MMM-yyyy');
  var timeStr = Utilities.formatDate(today, 'Asia/Kolkata', 'hh:mm a');
  
  var missing = getMissingDepartments_(shiftInfo.shift, today);
  
  if (missing.length === 0) {
    Logger.log('✅ ' + shiftInfo.shift + ' — All departments have data.');
    return;
  }
  
  missing.forEach(function(m) {
    var msg = '⏰ REMINDER — ' + m.department + ' Data Due in 15 Minutes\n';
    msg += '📅 ' + dateStr + ' | ⏰ ' + timeStr + '\n\n';
    msg += '🔄 ' + shiftInfo.shift + ' (' + getShiftTiming_(shiftInfo.shift) + ')\n';
    msg += '⏱️ Grace period ends at ' + getShiftDeadline_(shiftInfo.shift) + '\n\n';
    msg += '⚠️ YOUR DEPARTMENT PENDING:\n';
    msg += '  • ' + m.department + ' — 📋 Please upload NOW\n\n';
    msg += '🔗 Upload: [Google Form Link]';
    
    if (m.chatId && m.chatId !== '') {
      sendTelegramToChatId(m.chatId, msg);
    } else {
      sendTelegramAlert(msg);
    }
    
    Utilities.sleep(500);
  });
  
  Logger.log('📨 Gentle reminders sent to ' + missing.length + ' supervisors for ' + shiftInfo.shift);
}

function sendDMEDeadlineAlert() {
  var shiftInfo = getShiftToCheck_();
  if (!shiftInfo) {
    Logger.log('⚠️ No active shift to check.');
    return;
  }
  
  var today = new Date();
  var dateStr = Utilities.formatDate(today, 'Asia/Kolkata', 'dd-MMM-yyyy');
  var timeStr = Utilities.formatDate(today, 'Asia/Kolkata', 'hh:mm a');
  
  var missing = getMissingDepartments_(shiftInfo.shift, today);
  
  if (missing.length === 0) {
    Logger.log('✅ ' + shiftInfo.shift + ' — All departments submitted on time.');
    return;
  }
  
  var msg = '🚨 DME ALERT — ' + shiftInfo.shift + ' Grace Period Ended\n';
  msg += '📅 ' + dateStr + ' | ⏰ ' + timeStr + '\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  msg += '⏰ Grace period for ' + shiftInfo.shift + ' has ENDED\n\n';
  msg += '🔴 MISSING DEPARTMENTS:\n';
  msg += buildMissingListText_(missing) + '\n\n';
  msg += '📋 DME ACTION REQUIRED:\n';
  msg += '  ✅ Call supervisors above immediately\n';
  msg += '  ✅ Follow-up at ' + getShiftDeadline_(shiftInfo.shift) + ' + 30 min\n\n';
  msg += '🔗 Dashboard: ' + ScriptApp.getService().getUrl();
  
  sendTelegramAlert(msg);
  
  missing.forEach(function(m) {
    logEscalation_(m.department, shiftInfo.shift, m.supervisor, 'LOW');
  });
  
  Logger.log('📨 DME deadline alert sent for ' + shiftInfo.shift);
}

function sendFollowUpAlert() {
  var shiftInfo = getShiftToCheck_();
  if (!shiftInfo) {
    Logger.log('⚠️ No active shift to check.');
    return;
  }
  
  var today = new Date();
  var dateStr = Utilities.formatDate(today, 'Asia/Kolkata', 'dd-MMM-yyyy');
  var timeStr = Utilities.formatDate(today, 'Asia/Kolkata', 'hh:mm a');
  
  var missing = getMissingDepartments_(shiftInfo.shift, today);
  
  if (missing.length === 0) {
    Logger.log('✅ ' + shiftInfo.shift + ' — All departments now have data.');
    return;
  }
  
  var stillMissing = [];
  missing.forEach(function(m) {
    if (wasEscalatedToday_(m.department, shiftInfo.shift)) {
      stillMissing.push(m);
    }
  });
  
  if (stillMissing.length === 0) {
    Logger.log('✅ ' + shiftInfo.shift + ' — New submissions completed.');
    return;
  }
  
  var msg = '⚠️ DME FOLLOW-UP — ' + shiftInfo.shift + ' STILL Missing\n';
  msg += '📅 ' + dateStr + ' | ⏰ ' + timeStr + '\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  msg += '⏰ 30 minutes overdue\n\n';
  msg += '🔴 STILL MISSING:\n';
  msg += buildMissingListText_(stillMissing) + '\n\n';
  msg += '📋 DME ACTION REQUIRED:\n';
  msg += '  ✅ Escalate to Plant Head if not resolved\n';
  msg += '  ✅ This will appear in today\'s 12:30 AM summary\n\n';
  msg += '🔗 Dashboard: ' + ScriptApp.getService().getUrl();
  
  sendTelegramAlert(msg);
  
  stillMissing.forEach(function(m) {
    logEscalation_(m.department, shiftInfo.shift, m.supervisor, 'MEDIUM');
  });
  
  Logger.log('📨 Follow-up alert sent for ' + shiftInfo.shift);
}

function sendDailySummary() {
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var dateStr = Utilities.formatDate(yesterday, 'Asia/Kolkata', 'dd-MMM-yyyy');
  
  var allMissing = { 'Shift 1': [], 'Shift 2': [], 'Shift 3': [] };
  
  ['Shift 1', 'Shift 2', 'Shift 3'].forEach(function(shift) {
    allMissing[shift] = getMissingDepartments_(shift, yesterday);
  });
  
  var msg = '📊 VFPL Factory OS — DAILY SUMMARY\n';
  msg += '📅 ' + dateStr + ' | ⏰ 12:30 AM\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  
  var totalMissing = 0;
  ['Shift 1', 'Shift 2', 'Shift 3'].forEach(function(shift) {
    var missing = allMissing[shift];
    if (missing.length > 0) {
      msg += '🔴 ' + shift + ' (' + getShiftTiming_(shift) + ')\n';
      msg += buildMissingListText_(missing) + '\n\n';
      totalMissing += missing.length;
    } else {
      msg += '✅ ' + shift + ' — All complete ✅\n\n';
    }
  });
  
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  msg += totalMissing === 0 ? '✅ ALL CLEAR! 🎉' : '⚠️ ' + totalMissing + ' missing entries.';
  msg += '\n\n🔗 Dashboard: ' + ScriptApp.getService().getUrl();
  
  sendTelegramAlert(msg);
  Logger.log('📨 Daily summary sent for ' + dateStr + ' (' + totalMissing + ' missing)');
}

function sendWeeklyPerformance() {
  var msg = '📊 VFPL Factory OS — WEEKLY PERFORMANCE\n';
  msg += '📅 Week ending: ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy') + '\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  msg += '📋 Check WEEKLY_PERFORMANCE tab for detailed scores.\n\n';
  msg += '🔗 Dashboard: ' + ScriptApp.getService().getUrl();
  
  sendTelegramAlert(msg);
  Logger.log('📨 Weekly performance sent');
}

// ============================================================
// SECTION 6: DEPLOY TRIGGERS
// ============================================================

function deployShiftTrackingTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var func = t.getHandlerFunction();
    if (['sendGentleReminder', 'sendDMEDeadlineAlert', 'sendFollowUpAlert', 'sendDailySummary', 'sendWeeklyPerformance'].indexOf(func) > -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  ScriptApp.newTrigger('sendGentleReminder').timeBased().atHour(9).nearMinute(15).everyDays(1).create();
  ScriptApp.newTrigger('sendGentleReminder').timeBased().atHour(16).nearMinute(15).everyDays(1).create();
  ScriptApp.newTrigger('sendGentleReminder').timeBased().atHour(0).nearMinute(15).everyDays(1).create();
  
  ScriptApp.newTrigger('sendDMEDeadlineAlert').timeBased().atHour(9).nearMinute(30).everyDays(1).create();
  ScriptApp.newTrigger('sendDMEDeadlineAlert').timeBased().atHour(16).nearMinute(30).everyDays(1).create();
  ScriptApp.newTrigger('sendDMEDeadlineAlert').timeBased().atHour(0).nearMinute(30).everyDays(1).create();
  
  ScriptApp.newTrigger('sendFollowUpAlert').timeBased().atHour(10).nearMinute(0).everyDays(1).create();
  ScriptApp.newTrigger('sendFollowUpAlert').timeBased().atHour(17).nearMinute(0).everyDays(1).create();
  ScriptApp.newTrigger('sendFollowUpAlert').timeBased().atHour(1).nearMinute(0).everyDays(1).create();
  
  ScriptApp.newTrigger('sendDailySummary').timeBased().atHour(0).nearMinute(30).everyDays(1).create();
  
  ScriptApp.newTrigger('sendWeeklyPerformance').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).nearMinute(0).create();
  
  Logger.log('✅ All shift tracking triggers deployed successfully!');
}

// ============================================================
// SECTION 7: VERIFICATION
// ============================================================

function verifyTabsPopulated() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  
  var tabs = ['SUPERVISOR_MAP', 'SHIFT_CONFIG', 'DATA_SUBMISSION_LOG', 'WEEKLY_PERFORMANCE', 'FORM_RESPONSES', 'ESCALATION_LOG'];
  
  Logger.log('=== VERIFYING TABS ===');
  
  tabs.forEach(function(tabName) {
    var sh = ss.getSheetByName(tabName);
    if (!sh) {
      Logger.log('  ❌ ' + tabName + ' — NOT FOUND');
      return;
    }
    
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    Logger.log('  ✅ ' + tabName + ' — Rows: ' + lastRow + ', Columns: ' + lastCol);
  });
  
  Logger.log('=== VERIFICATION COMPLETE ===');
}

function testAllFunctions() {
  Logger.log('=== TESTING SUPERVISOR TRACKING ===');
  
  var shiftInfo = getShiftToCheck_();
  Logger.log('Current shift: ' + (shiftInfo ? shiftInfo.shift : 'None'));
  
  var sup = getSupervisorForCurrentWeek_('Cutting');
  Logger.log('Cutting supervisor this week: ' + sup.name + ' | ' + sup.phone + ' | ' + sup.chatId);
  
  var today = new Date();
  var hasData = hasDataForShift_('Cutting', 'Shift 1', today);
  Logger.log('Cutting Shift 1 has data today: ' + hasData);
  
  var missing = getMissingDepartments_('Shift 1', today);
  Logger.log('Missing departments for Shift 1: ' + missing.length);
  missing.forEach(function(m) {
    Logger.log('  - ' + m.department + ' (' + m.supervisor + ')');
  });
  
  Logger.log('=== TEST COMPLETE ===');
}

// ============================================================
// FORM RESPONSES 1 — PROCESSOR
// ============================================================

/**
 * Get the form responses tab (handles both naming conventions)
 */
function getFormResponsesTab_() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  
  // Try "Form Responses 1" first (Google Forms default)
  var sh = ss.getSheetByName('Form Responses 1');
  if (sh) return sh;
  
  // Try "FORM_RESPONSES" (our naming convention)
  sh = ss.getSheetByName('FORM_RESPONSES');
  if (sh) return sh;
  
  // If neither exists, create FORM_RESPONSES
  sh = ss.insertSheet('FORM_RESPONSES');
  var headers = [
    'Timestamp',
    'Department',
    'Supervisor Name',
    'Phone',
    'Telegram Chat ID',
    'Week Start (Monday)',
    'Week End (Sunday)',
    'Status'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1565C0')
    .setFontColor('#FFFFFF');
  
  return sh;
}

/**
 * PROCESS FORM SUBMISSIONS — Run this manually or via trigger
 */
function processFormSubmissions() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  
  // Get the form responses tab
  var formSh = getFormResponsesTab_();
  if (!formSh) {
    Logger.log('❌ Form responses tab not found.');
    return;
  }
  
  // Get the supervisor map tab
  var mapSh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!mapSh) {
    Logger.log('❌ SUPERVISOR_MAP tab not found.');
    return;
  }
  
  // Get all data from form responses
  var data = formSh.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('ℹ️ No form responses to process.');
    return;
  }
  
  // Find column indexes (form responses can have different column order)
  var headers = data[0];
  var colIndex = {};
  var expectedCols = ['Timestamp', 'Department', 'Supervisor Name', 'Phone', 'Telegram Chat ID', 'Week Start (Monday)', 'Week End (Sunday)'];
  
  expectedCols.forEach(function(colName) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i] && headers[i].toString().trim() === colName) {
        colIndex[colName] = i;
        break;
      }
    }
  });
  
  // Check if we found all columns
  var missingCols = expectedCols.filter(function(col) { return colIndex[col] === undefined; });
  if (missingCols.length > 0) {
    Logger.log('⚠️ Missing columns in form responses: ' + missingCols.join(', '));
    return;
  }
  
  var processed = 0;
  var updated = 0;
  var skipped = 0;

  // Dedup guard: a supervisor resubmitting the same week (correcting a typo,
  // double-tapping submit, etc.) used to append a new SUPERVISOR_MAP row
  // every time — real example seen in this project's form data: the same
  // person submitting the same week 3 times within minutes. Index existing
  // rows by (department, weekStart) so a resubmission UPDATES that row
  // in place instead of stacking duplicates that make manual review of
  // SUPERVISOR_MAP unreliable (which entry is authoritative?).
  var mapLastRow = mapSh.getLastRow();
  var mapRowIndex = {}; // key: "dept|weekStartStr" -> sheet row number (1-based)
  if (mapLastRow >= 2) {
    var mapData = mapSh.getRange(2, 1, mapLastRow - 1, 7).getValues();
    for (var m = 0; m < mapData.length; m++) {
      var mDept = (mapData[m][0] || '').toString().trim();
      var mStart = mapData[m][4];
      if (!mDept || !mStart) continue;
      var mStartStr = (mStart instanceof Date) ? Utilities.formatDate(mStart, 'Asia/Kolkata', 'dd-MMM-yyyy') : mStart.toString().trim();
      mapRowIndex[mDept + '|' + mStartStr] = m + 2; // +2: header row + 0-based offset
    }
  }

  // Process each row (skip header row)
  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Check if already processed (look for Status column if exists)
    var statusCol = headers.indexOf('Status');
    if (statusCol > -1 && row[statusCol] === 'PROCESSED') {
      skipped++;
      continue;
    }

    var department = (row[colIndex['Department']] || '').toString().trim();
    var supervisor = (row[colIndex['Supervisor Name']] || '').toString().trim();
    var phone = (row[colIndex['Phone']] || '').toString().trim();
    var chatId = (row[colIndex['Telegram Chat ID']] || '').toString().trim();
    var weekStart = row[colIndex['Week Start (Monday)']];
    var weekEnd = row[colIndex['Week End (Sunday)']];

    if (!department || !supervisor) {
      Logger.log('⚠️ Row ' + (i+1) + ' missing department or supervisor name. Skipping.');
      skipped++;
      continue;
    }

    // Format dates
    var startStr = weekStart ? Utilities.formatDate(new Date(weekStart), 'Asia/Kolkata', 'dd-MMM-yyyy') : '';
    var endStr = weekEnd ? Utilities.formatDate(new Date(weekEnd), 'Asia/Kolkata', 'dd-MMM-yyyy') : '';
    var dedupKey = department + '|' + startStr;
    var existingRow = startStr ? mapRowIndex[dedupKey] : undefined;

    if (existingRow) {
      // Resubmission for the same department + week — overwrite in place.
      // Latest submission wins (it's the most likely to be the correction).
      mapSh.getRange(existingRow, 1, 1, 7).setValues([[department, supervisor, phone, chatId, startStr, endStr, 'YES']]);
      updated++;
      Logger.log('🔁 Updated (resubmission): ' + supervisor + ' (' + department + ') for week ' + startStr + ' to ' + endStr);
    } else {
      mapSh.appendRow([department, supervisor, phone, chatId, startStr, endStr, 'YES']);
      if (startStr) mapRowIndex[dedupKey] = mapSh.getLastRow(); // so a 2nd resubmission in this same batch also updates, not appends
      processed++;
      Logger.log('✅ Added: ' + supervisor + ' (' + department + ') for week ' + startStr + ' to ' + endStr);
    }

    // Mark as processed
    if (statusCol > -1) {
      formSh.getRange(i + 1, statusCol + 1).setValue('PROCESSED');
      formSh.getRange(i + 1, statusCol + 1).setBackground('#C8E6C9');
    }
  }

  Logger.log('📊 Processing complete: ' + processed + ' added, ' + updated + ' updated (resubmission), ' + skipped + ' skipped.');

  if (processed > 0 || updated > 0) {
    sendTelegramAlert('✅ ' + processed + ' supervisor(s) added, ' + updated + ' updated from resubmission.');
  }

  flagMissingTelegramIds_();
}

// ── FLAG MISSING/PLACEHOLDER TELEGRAM CHAT IDS ────────────────
// The whole alert system is only as good as its recipient list. A
// supervisor with chatId '', '0', or a leftover '______' placeholder
// silently falls back to the group broadcast instead of getting a direct
// DM — this has been observed live in this project's SUPERVISOR_MAP
// (a real row shipped with chatId='______'). Run after every form-driven
// update so the gap is visible in a dedicated tab rather than discovered
// only when an alert doesn't reach someone.
function flagMissingTelegramIds_() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var mapSh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!mapSh || mapSh.getLastRow() < 2) return;

  var sh = ss.getSheetByName('MISSING_TELEGRAM');
  if (!sh) sh = ss.insertSheet('MISSING_TELEGRAM');
  sh.clearContents();
  sh.clearFormats();

  var headers = ['Department', 'Supervisor Name', 'Phone', 'Week Start', 'Week End', 'Issue'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#B71C1C').setFontColor('#FFFFFF');

  var data = mapSh.getRange(2, 1, mapSh.getLastRow() - 1, 7).getValues();
  var rows = [];
  data.forEach(function(r) {
    var dept = (r[0] || '').toString().trim();
    var active = (r[6] || '').toString().trim().toUpperCase();
    if (!dept || active !== 'YES') return;
    var chatId = (r[3] || '').toString().trim();
    var issue = '';
    if (!chatId) issue = 'Blank';
    else if (chatId === '0') issue = 'Zero (invalid)';
    else if (chatId === '______') issue = 'Placeholder never filled in';
    else if (!/^-?\d+$/.test(chatId)) issue = 'Not numeric — Telegram Chat IDs are integers, not phone numbers';
    if (issue) {
      rows.push([dept, r[1] || '', r[2] || '', r[4] || '', r[5] || '', issue]);
    }
  });

  if (rows.length > 0) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  } else {
    sh.getRange(2, 1).setValue('✅ All active supervisors have a valid Telegram Chat ID.');
  }
  sh.autoResizeColumns(1, headers.length);
  Logger.log('MISSING_TELEGRAM: ' + rows.length + ' supervisor(s) with an unusable Chat ID.');
}

/**
 * SET UP FORM TRIGGER (Monitors "Form Responses 1" tab)
 */
function setupFormTrigger() {
  // Remove existing triggers
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'processFormSubmissions') {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // Create new trigger
  ScriptApp.newTrigger('processFormSubmissions')
    .forSpreadsheet(DASH_ID)
    .onFormSubmit()
    .create();
  
  Logger.log('✅ Form submission trigger set up!');
  Logger.log('📋 Watching: Form Responses 1 tab');
}

/**
 * MANUAL PROCESS — Run this to process all pending form submissions
 */
function processPendingFormSubmissions() {
  Logger.log('🚀 Processing pending form submissions...');
  processFormSubmissions();
  Logger.log('✅ Done!');
}

/**
 * ONE-TIME SETUP — Creates all tabs with sample data
 */
function oneTimeSetup() {
  Logger.log('🚀 STARTING ONE-TIME SETUP...');
  
  var ss = SpreadsheetApp.openById(DASH_ID);
  
  // 1. Create/Update SUPERVISOR_MAP
  createDynamicSupervisorMap_(ss);
  
  // 2. Create/Update SHIFT_CONFIG
  createShiftConfigTab_(ss);
  
  // 3. Create/Update DATA_SUBMISSION_LOG
  createDataSubmissionLogTab_(ss);
  
  // 4. Create/Update WEEKLY_PERFORMANCE
  createWeeklyPerformanceTab_(ss);
  
  // 5. Create/Update ESCALATION_LOG
  createEscalationLogTab_(ss);
  
  // 6. Ensure FORM_RESPONSES exists (for manual entries)
  getFormResponsesTab_();
  
  // 7. Set up form trigger
  setupFormTrigger();
  
  // 8. Verify
  verifyTabsPopulated();
  
  Logger.log('');
  Logger.log('✅ ONE-TIME SETUP COMPLETE!');
  Logger.log('');
  Logger.log('📋 NEXT STEPS:');
  Logger.log('  1. Share Google Form link with DME');
  Logger.log('  2. DME fills supervisor data');
  Logger.log('  3. Run: processPendingFormSubmissions() to process existing responses');
  Logger.log('  4. Or wait: trigger auto-processes new submissions');
  Logger.log('  5. Run: deployShiftTrackingTriggers() to start alerts');
}

// ============================================================
// QUICK FIX — If Form Responses 1 already has data
// ============================================================

function quickProcessForm() {
  Logger.log('🚀 Quick processing form responses...');
  processFormSubmissions();
  verifyTabsPopulated();
}

function updateTo3Supervisors() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!sh) {
    Logger.log('❌ SUPERVISOR_MAP not found.');
    return;
  }
  
  // Clear existing data (keep headers)
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.getRange(2, 1, lastRow - 1, 7).clearContent();
  }
  
  // ─── 3 SUPERVISORS PER DEPARTMENT ───
  // Each department gets 3 supervisors (for 3 weeks / 3 shifts)
  var departments = [
    'Cutting', 'Forge', 'Press', 'Machine', 'HT', 'Final',
    'Electricity', 'Oil', 'Staff Manpower', 'Contract Manpower'
  ];
  
  // Week dates (3 weeks)
  var weeks = [
    { start: '04-Aug-2026', end: '10-Aug-2026' },
    { start: '11-Aug-2026', end: '17-Aug-2026' },
    { start: '18-Aug-2026', end: '24-Aug-2026' }
  ];
  
  var sampleData = [];
  
  departments.forEach(function(dept) {
    weeks.forEach(function(week, idx) {
      sampleData.push([
        dept,
        '______',  // Supervisor Name
        '______',  // Phone
        '______',  // Telegram Chat ID
        week.start,
        week.end,
        'YES'
      ]);
    });
  });
  
  if (sampleData.length > 0) {
    sh.getRange(2, 1, sampleData.length, 7).setValues(sampleData);
  }
  
  sh.autoResizeColumns(1, 7);
  
  Logger.log('✅ SUPERVISOR_MAP updated with 3 supervisors per department.');
  Logger.log('📊 Total rows: ' + sampleData.length + ' (10 departments × 3 supervisors)');
}

// ============================================================
// END OF Alert.gs
// ============================================================