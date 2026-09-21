// ============================================================
// ALERT.gs — SUPERVISOR TRACKING (DYNAMIC WEEKLY MAPPING)
// ============================================================
// Purpose: Dynamic supervisor mapping by week
//
// v2 (15 Sep 2026) — Bug fixes:
//   1. getShiftToCheck_ uses IST hours, not server timezone
//   2. sendTelegramToChatId validates chat ID format
//   3. lookupSupervisorForWeek_ skips placeholder / Unknown rows
//   4. getMissingDepartments_ skips departments with no RAW tab
//   5. logEscalation_ refuses to log Unknown supervisors
//   6. processFormSubmissions dedup guard + auto-Status column
//   7. sendDMEDeadlineAlert dedup (once per shift per day)
//   8. sendGentleReminder dedup (once per dept per shift per day)
//   9. recordShiftCompliance caps delay at 120 min
//  10. matchSupervisorByName_ skips placeholders
//  11. runShiftAlerts15min_ writes heartbeat + OK/fail counters
//  12. checkAlertHeartbeat() new diagnostic
// ============================================================

var DASH_ID = '1GHdhrRtOhQFshsAOCK4n3GiJp-6a03k8bn0V_M04wSY';

// ── SUPABASE CREDENTIALS ──────────────────────────────────
var SUPABASE_URL_INLINE = 'https://odfwtdpvpfzdrznvurru.supabase.co';
var SUPABASE_SERVICE_ROLE_KEY_INLINE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kZnd0ZHB2cGZ6ZHJ6bnZ1cnJ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTc1NzMxNSwiZXhwIjoyMTAxMzMzMzE1fQ.i8e_K9peKJgVwiHJM_cwHlAMc9ou4jHR5bFyMZB3MBU';

var TELEGRAM_BOT_TOKEN_INLINE = '8516658886:AAGHGLt94IQd8v5QzJYsyaZqVuM8Ek7CFaM';

var OWNER_TELEGRAM_CHAT_ID_INLINE = '8824096175';

var DME_CHAT_ID_INLINE = '5108696603';

// ── DEPARTMENT LIST ──────────────────────────────────────
var DEPARTMENTS = [
  'Cutting', 'Forge', 'Press', 'Machine', 'HT', 'Final',
  'Electricity', 'Oil', 'Staff Manpower', 'Contract Manpower', 'VMC Shop'
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
  'Contract Manpower': 'RAW_MANPOWER_CONTRACT',
  'VMC Shop': 'RAW_VMC'
};

// ── DEPARTMENT NAME MAPPING (dashboard -> app database) ───
var DEPT_TO_DB_DEPARTMENT = {
  'Cutting': 'Cutting Shop',
  'Forge':   'Forge Shop',
  'Press':   'Press Shop',
  'Machine': 'Machine Shop',
  'HT':      'Heat Treatment',
  'Final':   'Final Shop',
  'Electricity': 'Maintenance',
  'Oil':         'Maintenance'
};

var NON_PRODUCTION_DEPTS = { 'Electricity': true, 'Oil': true };

var DEPT_RESPONSIBILITY_FALLBACK = {
  'Electricity': ['Maintenance'],
  'Oil': ['Maintenance'],
  'Staff Manpower': ['Security', 'HR'],
  'Contract Manpower': ['Security', 'HR']
};

// ── SHIFT CONFIG ──────────────────────────────────────────
// Default 3-shift schedule used by 10 of 11 departments.
var DEFAULT_SHIFT_CONFIG = {
  'Shift 1': { start: '8:30',  end: '15:30', grace: 60, deadline: '16:30', reminder: 15 },
  'Shift 2': { start: '15:30', end: '23:30', grace: 60, deadline: '00:30', reminder: 15 },
  'Shift 3': { start: '23:30', end: '08:30', grace: 60, deadline: '09:30', reminder: 15 }
};

// Per-department overrides. Cutting runs 2 shifts, not 3.
var SHIFT_CONFIG_DATA_BY_DEPT = {
  'Cutting': {
    'Shift 1': { start: '07:00', end: '19:00', grace: 60, deadline: '20:00', reminder: 15 },  // Day
    'Shift 2': { start: '19:00', end: '07:00', grace: 60, deadline: '08:00', reminder: 15 }   // Night (deadline next day)
  }
};

// Backward compatibility — existing code that reads SHIFT_CONFIG_DATA keeps working.
var SHIFT_CONFIG_DATA = DEFAULT_SHIFT_CONFIG;

// ── Per-dept helpers ──────────────────────────────────────
function getShiftConfigForDept_(dept, shift) {
  var perDept = SHIFT_CONFIG_DATA_BY_DEPT[dept];
  if (perDept && perDept[shift]) return perDept[shift];
  return DEFAULT_SHIFT_CONFIG[shift];
}

function getShiftListForDept_(dept) {
  var perDept = SHIFT_CONFIG_DATA_BY_DEPT[dept];
  if (perDept) return Object.keys(perDept);
  return Object.keys(DEFAULT_SHIFT_CONFIG);
}

// ── FORM LINKS ────────────────────────────────────────────
var FORM_LINKS_TAB = 'FORM_LINKS';

var DEPT_FORM_SEED = [
  ['Cutting', 'Cutting PMS', 'Daily', 'Sudeep Singh', 'https://docs.google.com/forms/d/e/1FAIpQLSf0yqwPXjd8kWwqgpgcDRmYq7Z8PeOV0ifY8lmZycC_MDibjw/viewform', 'YES'],
  ['Cutting', 'Cutting Daily check sheet', 'Daily', 'Sudeep Singh', 'https://docs.google.com/forms/d/e/1FAIpQLSf9m5VVFlVpEaoRYMPZ1MEOnZyaWnkdnIyVYG2yDj736jy-Bg/viewform', 'YES'],
  ['Cutting', 'Cutting Planning', 'Daily', 'Sudeep Singh', 'https://docs.google.com/forms/d/e/1FAIpQLSe9vMmKukDFGNKptsJMOu4ICtSgds4adrhw1Czcjb1XSodSHg/viewform', 'YES'],
  ['Cutting', 'Overtime Form', 'Daily', 'Sudeep Singh', 'https://docs.google.com/forms/d/e/1FAIpQLSf9zPvnTSMDE8AT_vrs9W8y2efwXxTbpJ2FlrRJl2TLoGKGXw/viewform', 'NO'],
  ['Forge', 'Forge Daily check sheet', 'Daily', 'Sudeep Singh Laxman Yadav Subhash Sitaram Palve Saroj Avdesh Singh Shaikh Irfan', 'https://docs.google.com/forms/d/e/1FAIpQLSfEzztMshze903rfc6vobPK0AZudZ9MfM-Mahsuzzj3ie1tEw/viewform', 'YES'],
  ['Forge', 'Forge PMS', 'Daily', 'Sudeep Singh Laxman Yadav Subhash Sitaram Palve Saroj Avdesh Singh Shaikh Irfan', 'https://docs.google.com/forms/d/e/1FAIpQLSeXwEc4jMUmwTySfvFrm4bOqbB01gW5cS_yeiRe6VmlWKDntQ/viewform', 'YES'],
  ['Forge', 'Forge Shop Planning', 'Daily', 'Sudeep Singh Laxman Yadav Subhash Sitaram Palve Saroj Avdesh Singh Shaikh Irfan', 'https://docs.google.com/forms/d/e/1FAIpQLSc1cbhgqSJVuLXFJ6xCr5pkfN0UBhok8mpi6sIcA1AY6BsJSQ/viewform', 'YES'],
  ['Press', 'Press Daily check sheet', 'Daily', 'Dinkar Landge Shyambabu Radheshyam Yadav Chandan Milind Sonapasare Manbodh Sambhu Sah Shaikh Zaker Abdul Quayyum Vaibhav Mali', 'https://docs.google.com/forms/d/e/1FAIpQLSc0QOVHipibWe2B4pENewKxJt7O36xe4eRDMxNqr_UYf7Ei2A/viewform', 'YES'],
  ['Press', 'Press PMS', 'Daily', 'Dinkar Landge Shyambabu Radheshyam Yadav Chandan Milind Sonapasare Manbodh Sambhu Sah Shaikh Zaker Abdul Quayyum Vaibhav Mali', 'https://docs.google.com/forms/d/e/1FAIpQLSerCkOEK8Y9olorgA4OtusaaBXxA9G7RgHcq9IXJmCabcfRMg/viewform', 'YES'],
  ['Press', 'Press Shop Planning', 'Daily', 'Dinkar Landge Shyambabu Radheshyam Yadav Chandan Milind Sonapasare Manbodh Sambhu Sah Shaikh Zaker Abdul Quayyum Vaibhav Mali', 'https://docs.google.com/forms/d/e/1FAIpQLSe9fhnfuCG_DjAPij5jk0k5K3ix9OCs7bHTxAX5eQtCK0Tgsw/viewform', 'YES'],
  ['Machine', 'Machine Daily check sheet', 'Daily', 'Haribhau Shamrao Datar. Pravin Pundalik Sonavane Santosh Vishwanath Sawai Bhupendra Kashinath Bharude Shaikh Wajid shaikh Shabbir Ramesh Narayan Gote Anna Pralhad Deshmukh Bhaiyyasaheb Sambhaji Patil Vitthal Uddhav Tekale', 'https://docs.google.com/forms/d/e/1FAIpQLSeBWFirZX18C1Sqz4hiTzLnPSDqXGEbYLH5LWmo3Gy6Rx0kQA/viewform', 'YES'],
  ['Machine', 'Machine PMS', 'Daily', 'Haribhau Shamrao Datar. Pravin Pundalik Sonavane Santosh Vishwanath Sawai Bhupendra Kashinath Bharude Shaikh Wajid shaikh Shabbir Ramesh Narayan Gote Anna Pralhad Deshmukh Bhaiyyasaheb Sambhaji Patil Vitthal Uddhav Tekale', 'https://docs.google.com/forms/d/e/1FAIpQLSdzriZ1FIXAdrt247msSFabUSnLn5ctdBkyl_4NyRL_b_UBSg/viewform', 'YES'],
  ['Machine', 'Machine Shop Planning', 'Daily', 'Haribhau Shamrao Datar. Pravin Pundalik Sonavane Santosh Vishwanath Sawai Bhupendra Kashinath Bharude Shaikh Wajid shaikh Shabbir Ramesh Narayan Gote Anna Pralhad Deshmukh Bhaiyyasaheb Sambhaji Patil Vitthal Uddhav Tekale', 'https://docs.google.com/forms/d/e/1FAIpQLSfkmTouMWhxG-7SbnwcV4wbQJrPJOxD9cdnvHWrdh3fZIIc4Q/viewform', 'YES'],
  ['Machine', 'VFPL Sales Dispatch Actual Form', 'Daily', 'Haribhau Shamrao Datar. Pravin Pundalik Sonavane Santosh Vishwanath Sawai Bhupendra Kashinath Bharude Shaikh Wajid shaikh Shabbir Ramesh Narayan Gote Anna Pralhad Deshmukh Bhaiyyasaheb Sambhaji Patil Vitthal Uddhav Tekale', 'https://docs.google.com/forms/d/e/1FAIpQLSerDrMI7SlhB5HEHyUDuxfPJrCuvpwkyl9pw2lOYqwOaUqteg/viewform', 'NO'],
  ['Machine', 'Dispatch Plan-Machine Shop', 'Daily', 'Haribhau Shamrao Datar. Pravin Pundalik Sonavane Santosh Vishwanath Sawai Bhupendra Kashinath Bharude Shaikh Wajid shaikh Shabbir Ramesh Narayan Gote Anna Pralhad Deshmukh Bhaiyyasaheb Sambhaji Patil Vitthal Uddhav Tekale', 'https://docs.google.com/forms/d/e/1FAIpQLSdcZw9VVStYMhy17zHu5hnB-mC9sn6Pq0V5SkIZCfV1uzTPUA/viewform', 'NO'],
  ['HT', 'HT Daily check sheet', 'Daily', 'Balasaheb Shivaji Todmal Ramnath Babasaheb Gadekar', 'https://docs.google.com/forms/d/e/1FAIpQLSc5M5SVkihS7FIZCLF-8Me5wGseyQIU88x0p1Zs1aB5ZThrRw/viewform', 'YES'],
  ['HT', 'HT PMS', 'Daily', 'Balasaheb Shivaji Todmal Ramnath Babasaheb Gadekar', 'https://docs.google.com/forms/d/e/1FAIpQLSdVaiBzMydIQxI0h77R78_aPyFzuLjIFFpUY2T1qTQrfwl8Jg/viewform', 'YES'],
  ['HT', 'HT Shop Planning', 'Daily', 'Balasaheb Shivaji Todmal Ramnath Babasaheb Gadekar', 'https://docs.google.com/forms/d/e/1FAIpQLSeeuJRiGEtT3wst31Qs5f9BX3NpLXLW5StmwpYTJldAXayaSg/viewform', 'YES'],
  ['Final', 'Final Daily check sheet', 'Daily', 'Jakir Munshi Chaudhari Subhash Shivanand Thorat Ashok Kumar', 'https://docs.google.com/forms/d/e/1FAIpQLScnN9MwSqunjomGCTo73GuIBHBw1xHTj4j8u_49PZsAZzM1hQ/viewform', 'YES'],
  ['Final', 'Final PMS', 'Daily', 'Jakir Munshi Chaudhari Subhash Shivanand Thorat Ashok Kumar', 'https://docs.google.com/forms/d/e/1FAIpQLSdyxVMje-Ke51r6AnNbh81mFgbDzjJGQbjkfcpFHk4S1BbMYA/viewform', 'YES'],
  ['Final', 'VFPL Sales Dispatch Actual Form', 'Daily', 'Jakir Munshi Chaudhari Subhash Shivanand Thorat Ashok Kumar', 'https://docs.google.com/forms/d/e/1FAIpQLSerDrMI7SlhB5HEHyUDuxfPJrCuvpwkyl9pw2lOYqwOaUqteg/viewform', 'NO'],
  ['Final', 'Final Shop Planning', 'Daily', 'Jakir Munshi Chaudhari Subhash Shivanand Thorat Ashok Kumar', 'https://docs.google.com/forms/d/e/1FAIpQLSff5rk2BDx-2ky64_rrVUXlrxdgqI4mvHL-Kcf5eBhHa8nA2w/viewform', 'YES'],
  ['Final', '57F4 Inward Form', 'Daily', 'Jakir Munshi Chaudhari Subhash Shivanand Thorat Ashok Kumar', 'https://docs.google.com/forms/d/e/1FAIpQLSdHaCr9PfjKFv_nRIQGy_0uBo6SmoXfJe06ZNWW5-zBONkA-w/viewform', 'NO'],
  ['Final', '57F4 Outward Form', 'Daily', 'Jakir Munshi Chaudhari Subhash Shivanand Thorat Ashok Kumar', 'https://docs.google.com/forms/d/e/1FAIpQLSdfReEVbGGGNC6CwIPDq53syvvkomXj2gfIWNBQehjozUD1DA/viewform', 'NO'],
  ['Electricity', 'VFPL Electricity Consumable Form', 'Daily',
   'Atul Bhata Patil, Dharmendra Prabhu Mahto, Shaikh Majeed, Devendrakumar Jagdish Singh, Nanasaheb Dinkar Shinde, Shivaji Suresh Jaypure, Sunil Ramakant Saha, Vijay Rangnath Sonawane, Sandip Tryambak Landage, Manoj Anantrao Wagh',
   'https://docs.google.com/forms/d/e/1FAIpQLScB6QrOCHmWeAKzZP76eWPISlt_tnr5z7aBROTHK614gfd31A/viewform', 'YES'],
  ['Electricity', 'VFL 24Hrs Electricity Consumable Form', 'Daily',
   'Atul Bhata Patil, Dharmendra Prabhu Mahto, Shaikh Majeed, Devendrakumar Jagdish Singh, Nanasaheb Dinkar Shinde, Shivaji Suresh Jaypure, Sunil Ramakant Saha, Vijay Rangnath Sonawane, Sandip Tryambak Landage, Manoj Anantrao Wagh',
   'https://docs.google.com/forms/d/e/1FAIpQLScr2JYBV9yFN5WZj99dhc2mTV--1_-Y8pIeMT8Bmf6t9qR7RQ/viewform', 'YES'],
  ['Oil', 'VFL Oil Consumable', 'Daily',
   'Atul Bhata Patil, Dharmendra Prabhu Mahto, Shaikh Majeed, Devendrakumar Jagdish Singh, Nanasaheb Dinkar Shinde, Shivaji Suresh Jaypure, Sunil Ramakant Saha, Vijay Rangnath Sonawane, Sandip Tryambak Landage, Manoj Anantrao Wagh',
   'https://docs.google.com/forms/d/e/1FAIpQLSfyrYgWEhyBjy8GxwvaaDOk5Uc5doDYZ0SeSE2uUoU9ujNUkA/viewform', 'YES'],
  ['Staff Manpower', 'Daily Manpower Form', 'As & When Required',
   'Shrawan Rewant Singh (Security) / Milind Ambadas Barhate, Pallavi Vishnu Khade, Mayuri Sardar Rathod (HR)',
   'https://docs.google.com/forms/d/e/1FAIpQLSflyxcQjVEdv2OXgflXhKVH1VWhBUEMhC7KhUUUtdb4pHQNyw/viewform', 'NO'],
  ['Contract Manpower', 'Daily Contractual Manpower Form', 'As & When Required',
   'Shrawan Rewant Singh (Security) / Milind Ambadas Barhate, Pallavi Vishnu Khade, Mayuri Sardar Rathod (HR)',
   'https://docs.google.com/forms/d/e/1FAIpQLSfecNumIXRV7Xej_n-4N7k0K702I9WHjiT6F_naEqT5JnFS0g/viewform', 'NO'],
  ['VMC Shop', 'VMC Daily check sheet', 'Daily',
   'Abhimanyu Kakde, Amol Rakhmaji Ambhore, Sayed Uzaif Ali Syed Altaf Ali',
   'https://docs.google.com/forms/d/e/1FAIpQLSdCv3PnoYHJy5H-y60hjwQTR4dBvC9mfKNNFiYMnFiZSD4pRw/viewform', 'YES']
];

var MISSING_CUTOFF_HOURS = 12;
var COMPLIANCE_LOOKBACK_DAYS = 2;

// ============================================================
// SECTION 1: SETUP — Run Once to Create/Update Tabs
// ============================================================

function setupDynamicSupervisorTabs() {
  Logger.log('⚠️ DISABLED — this function wipes SUPERVISOR_MAP and log tabs. Edit the code to re-enable if you intend a full reset.');
  return;
  // ──────────────────────────────────────────────────────
  // Original code preserved below (unreachable):
  // var ss = SpreadsheetApp.openById(DASH_ID);
  // createDynamicSupervisorMap_(ss);
  // createShiftConfigTab_(ss);
  // createFormLinksTab_(ss);
  // createDataSubmissionLogTab_(ss);
  // createWeeklyPerformanceTab_(ss);
  // createFormResponsesTab_(ss);
  // createEscalationLogTab_(ss);
  // Logger.log('✅ All dynamic supervisor tabs created/updated!');
  // ──────────────────────────────────────────────────────
}
function createDynamicSupervisorMap_(ss) {
  Logger.log('⚠️ DISABLED — running this wipes SUPERVISOR_MAP.');
  return;
  var sh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!sh) sh = ss.insertSheet('SUPERVISOR_MAP');
  sh.clearContents();
  sh.clearFormats();

   var headers = [
    'Department', 'Supervisor Name', 'Phone', 'Telegram Chat ID',
    'Week Start (Saturday)', 'Week End (Thursday)', 'Active'
  ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');

  sh.autoResizeColumns(1, headers.length);
  sh.getRange(1, 1).setNote(
    'DYNAMIC SUPERVISOR MAP\n' +
    'Each row = one supervisor for one department for one week.\n' +
    'Filled by processFormSubmissions() from FORM_RESPONSES.\n' +
    'Do not add duplicate rows manually.'
  );

  Logger.log('  ✅ SUPERVISOR_MAP scaffolded (empty — will be filled from form)');
}

function createShiftConfigTab_(ss) {
  var sh = ss.getSheetByName('SHIFT_CONFIG');
  if (!sh) sh = ss.insertSheet('SHIFT_CONFIG');
  sh.clearContents();
  sh.clearFormats();

  var headers = ['Shift', 'Start', 'End', 'Grace (mins)', 'Deadline', 'Reminder (mins before)'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');

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
  Logger.log('⚠️ DISABLED — running this wipes DATA_SUBMISSION_LOG.');
  return;
  var sh = ss.getSheetByName('DATA_SUBMISSION_LOG');
  if (!sh) sh = ss.insertSheet('DATA_SUBMISSION_LOG');
  sh.clearContents();
  sh.clearFormats();

  var headers = ['Date', 'Department', 'Shift', 'Supervisor', 'Entry Time', 'Status', 'Delay (mins)'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
  sh.autoResizeColumns(1, headers.length);
  Logger.log('  ✅ DATA_SUBMISSION_LOG created');
}
function createWeeklyPerformanceTab_(ss) {
  Logger.log('⚠️ DISABLED — running this wipes WEEKLY_PERFORMANCE.');
  return;
  var sh = ss.getSheetByName('WEEKLY_PERFORMANCE');
  if (!sh) sh = ss.insertSheet('WEEKLY_PERFORMANCE');
  sh.clearContents();
  sh.clearFormats();

  var headers = ['Supervisor', 'Department', 'Week', 'Total', 'On Time', 'Late', 'Missing'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
  sh.autoResizeColumns(1, headers.length);
  Logger.log('  ✅ WEEKLY_PERFORMANCE created');
}

function createFormResponsesTab_(ss) {
  Logger.log('⚠️ DISABLED — running this wipes FORM_RESPONSES.');
  return;
  var sh = ss.getSheetByName('FORM_RESPONSES');
  if (!sh) sh = ss.insertSheet('FORM_RESPONSES');
  sh.clearContents();
  sh.clearFormats();

  var headers = [
    'Timestamp', 'Department', 'Supervisor Name', 'Phone', 'Telegram Chat ID',
    'Week Start (Saturday)', 'Week End (Thursday)', 'Status'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
  sh.autoResizeColumns(1, headers.length);
  Logger.log('  ✅ FORM_RESPONSES created');
}

function createEscalationLogTab_(ss) {
    Logger.log('⚠️ DISABLED — running this wipes ESCALATION_LOG.');
  return;
  var sh = ss.getSheetByName('ESCALATION_LOG');
  if (!sh) sh = ss.insertSheet('ESCALATION_LOG');
  sh.clearContents();
  sh.clearFormats();

  var headers = ['Date', 'Time', 'Department', 'Shift', 'Supervisor', 'Escalation Level', 'Action Taken'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#B71C1C').setFontColor('#FFFFFF');
  sh.autoResizeColumns(1, headers.length);
  Logger.log('  ✅ ESCALATION_LOG created');
}

// ============================================================
// SECTION 2: DYNAMIC SUPERVISOR LOOKUP
// ============================================================

function getSupervisorForCurrentWeek_(dept) {
  var direct = lookupSupervisorForWeek_(dept);
  if (direct) return direct;

  var fallbacks = DEPT_RESPONSIBILITY_FALLBACK[dept];
  if (fallbacks) {
    for (var f = 0; f < fallbacks.length; f++) {
      var viaFallback = lookupSupervisorForWeek_(fallbacks[f]);
      if (viaFallback) return viaFallback;
    }
  }

  return { name: 'Unknown', phone: '', chatId: '' };
}

/**
 * Scans SUPERVISOR_MAP for an active row for the current week.
 * FIX #3: Skips placeholder rows (______), 'Unknown' names, and rows where
 * week-end is before week-start. Prefers rows with a valid numeric chat ID
 * when duplicates exist.
 */
function lookupSupervisorForWeek_(dept) {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!sh) return null;

  var data = sh.getDataRange().getValues();
  var today = new Date();
  var todayStr = Utilities.formatDate(today, 'Asia/Kolkata', 'yyyy-MM-dd');

  var candidates = [];

  for (var i = 1; i < data.length; i++) {
    var rowDept = (data[i][0] || '').toString().trim();
    if (rowDept !== dept) continue;

    var name = (data[i][1] || '').toString().trim();
    var phone = (data[i][2] || '').toString().trim();
    var chatId = (data[i][3] || '').toString().trim();
    var weekStart = data[i][4];
    var weekEnd = data[i][5];
    var active = (data[i][6] || '').toString().trim().toUpperCase();

    if (active !== 'YES') continue;
    if (!weekStart || !weekEnd) continue;

    // FIX: skip placeholders
    if (/^_+$/.test(name)) continue;
    if (/^_+$/.test(phone)) continue;
    if (/^_+$/.test(chatId)) continue;
    if (name.toLowerCase() === 'unknown') continue;

    var startStr = Utilities.formatDate(new Date(weekStart), 'Asia/Kolkata', 'yyyy-MM-dd');
    var endStr = Utilities.formatDate(new Date(weekEnd), 'Asia/Kolkata', 'yyyy-MM-dd');

    // FIX: skip impossible week ranges
    if (endStr < startStr) continue;

    if (todayStr >= startStr && todayStr <= endStr) {
      candidates.push({
        name: name, phone: phone, chatId: chatId,
        weekStart: startStr, weekEnd: endStr
      });
    }
  }

  if (candidates.length === 0) return null;

  // Prefer the row with a valid numeric chat ID
  var withChatId = candidates.filter(function(c) {
    return /^-?\d+$/.test(c.chatId);
  });
  return withChatId.length > 0 ? withChatId[0] : candidates[0];
}

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

    var name = (data[i][1] || '').toString().trim();
    if (/^_+$/.test(name) || name.toLowerCase() === 'unknown') continue;

    supervisors.push({
      name: name,
      phone: data[i][2] || '',
      chatId: data[i][3] || '',
      weekStart: data[i][4] || '',
      weekEnd: data[i][5] || ''
    });
  }
  return supervisors;
}

function getSupervisorInfo_(dept, shift) {
  return getSupervisorForCurrentWeek_(dept);
}

// ============================================================
// SECTION 3: SHIFT DETECTION
// ============================================================

/**
 * FIX #1: Uses IST hours, not server timezone.
 */
function getShiftToCheck_() {
  var istStr = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'HH:mm');
  var parts = istStr.split(':');
  var hours = parseInt(parts[0], 10);
  var minutes = parseInt(parts[1], 10);
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

function normaliseShift_(value) {
  var v = (value || '').toString().toLowerCase();
  if (!v) return null;
  if (/\bfirst\b|\b1st\b|\bshift\s*1\b|^s1$/.test(v))  return 'Shift 1';
  if (/\bsecond\b|\b2nd\b|\bshift\s*2\b|^s2$/.test(v)) return 'Shift 2';
  if (/\bthird\b|\b3rd\b|\bshift\s*3\b|^s3$/.test(v))  return 'Shift 3';
  return null;
}

/**
 * Has this department submitted data for this shift on this date?
 *
 * Returns true if the RAW tab has a row for this date whose shift column
 * either matches `shift` or is null (unshifted data). Reading column 2 as
 * the "shift" column works for most tabs; for tabs where column 2 holds
 * something else (meter name, department, etc.), normaliseShift_ returns
 * null and the row still counts — which is what we want.
 */
function hasDataForShift_(dept, shift, date) {
  var rawTab = DEPT_TO_RAW_TAB[dept];
  if (!rawTab) return false;

  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName(rawTab);
  if (!sh || sh.getLastRow() < 2) return false;

  var data = sh.getDataRange().getValues();
  var dateStr = Utilities.formatDate(date, 'Asia/Kolkata', 'yyyy-MM-dd');

  for (var i = 1; i < data.length; i++) {
    var d = data[i][0];
    if (!d) continue;
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) continue;
    if (Utilities.formatDate(dt, 'Asia/Kolkata', 'yyyy-MM-dd') !== dateStr) continue;

    var rowShift = normaliseShift_(data[i][2]);
    if (rowShift === null || rowShift === shift) return true;
  }
  return false;
}

/**
 * FIX #4: Skips departments whose RAW tab does not exist (e.g. VMC Shop
 * before RAW_VMC is built). Returns the missing list otherwise.
 */
function getMissingDepartments_(shift, date) {
  var missing = [];
  var ss = SpreadsheetApp.openById(DASH_ID);

  DEPARTMENTS.forEach(function(dept) {
    var rawTab = DEPT_TO_RAW_TAB[dept];
    if (!rawTab) return;

    // Skip if the RAW tab doesn't exist yet
    if (!ss.getSheetByName(rawTab)) {
      Logger.log('ℹ️ Skipping ' + dept + ' — RAW tab "' + rawTab + '" not found.');
      return;
    }

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

function buildMissingListText_(missing, includeLinks) {
  if (missing.length === 0) return '✅ All departments have submitted data.';

  var lines = [];
  missing.forEach(function(m) {
    var phoneText = m.phone ? ' | 📞 ' + m.phone : '';
    lines.push('  • ' + m.department + ' — 👤 ' + m.supervisor + phoneText);
    if (includeLinks) {
      getFormsForDept_(m.department).forEach(function(f) {
        lines.push('    🔗 ' + f.name + ': ' + f.url);
      });
    }
  });
  return lines.join('\n');
}
function getTelegramBotToken_() {
  return PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN') || TELEGRAM_BOT_TOKEN_INLINE;
}
function getOwnerTelegramChatId_() {
  return PropertiesService.getScriptProperties().getProperty('OWNER_TELEGRAM_CHAT_ID') || OWNER_TELEGRAM_CHAT_ID_INLINE;
}
function getDmeChatId_() {
  return PropertiesService.getScriptProperties().getProperty('DME_TELEGRAM_CHAT_ID') || DME_CHAT_ID_INLINE;
}
function sendDmeTelegramAlert_(message) {
  var dmeId = getDmeChatId_();
  if (!dmeId) {
    Logger.log('⚠️ No DME chat id set.');
    return false;
  }
  return sendTelegramToChatId(dmeId, message);   // ← has return
}

/**
 * FIX #2: Validates chat ID format before calling Telegram API.
 */
function sendTelegramToChatId(chatId, message) {
  var cleaned = String(chatId || '').trim();
  if (!cleaned) return false;

  if (!/^-?\d+$/.test(cleaned)) {
    Logger.log('❌ Invalid chat id format: "' + cleaned + '" — skipping.');
    return false;
  }

  var token = getTelegramBotToken_();
  if (!token) {
    Logger.log('❌ No Telegram bot token.');
    return false;
  }

  // Defensive: ensure message is a non-empty string
  var msgText = (message === null || message === undefined) ? '' : String(message);
  if (!msgText.trim()) {
    Logger.log('⚠️ sendTelegramToChatId: empty message for chat ' + cleaned + ' — skipping.');
    return false;
  }

  // Truncate if over Telegram's 4096-char limit
  var MAX_LEN = 3900;
  if (msgText.length > MAX_LEN) {
    Logger.log('⚠️ Message truncated from ' + msgText.length + ' to ' + MAX_LEN + ' chars.');
    msgText = msgText.substring(0, MAX_LEN) + '\n\n…(truncated)';
  }

  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  var payload = { chat_id: cleaned, text: msgText, parse_mode: 'HTML' };
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      Logger.log('✅ Telegram sent to ' + cleaned);
      return true;
    }
    Logger.log('⚠️ Telegram HTTP ' + code + ' for ' + cleaned + ': ' + response.getContentText().substring(0, 200));
    return false;
  } catch(e) {
    Logger.log('❌ Telegram send failed to ' + cleaned + ': ' + e);
    return false;
  }
}
function sendTelegramAlert(message) {
  var ownerChatId = getOwnerTelegramChatId_();
  if (!ownerChatId) {
    Logger.log('⚠️ No owner chat id.');
    return false;
  }
  return sendTelegramToChatId(ownerChatId, message);
}

function sendDmeTelegramAlert_(message) {
  var dmeId = getDmeChatId_();
  if (!dmeId) {
    Logger.log('⚠️ No DME chat id set.');
    return false;
  }
  return sendTelegramToChatId(dmeId, message);
}

function getShiftTiming_(shift) {
  var config = SHIFT_CONFIG_DATA[shift];
  return config ? config.start + ' – ' + config.end : 'Unknown';
}

function getShiftDeadline_(shift) {
  var config = SHIFT_CONFIG_DATA[shift];
  return config ? config.deadline : 'Unknown';
}

/**
 * FIX #5: Refuses to log escalation if supervisor is Unknown or a placeholder.
 */
function logEscalation_(dept, shift, supervisor, level) {
  var s = String(supervisor || '').trim();
  if (!s || s.toLowerCase() === 'unknown' || /^_+$/.test(s)) {
    Logger.log('ℹ️ logEscalation_: skipping (no valid supervisor for ' + dept + '/' + shift + ')');
    return;
  }

  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('ESCALATION_LOG');
  if (!sh) return;

  var now = new Date();
  sh.appendRow([
    Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM-dd'),
    Utilities.formatDate(now, 'Asia/Kolkata', 'HH:mm'),
    dept,
    shift,
    s,
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
// SECTION 4: ALERT FUNCTIONS
// ============================================================

/**
 * FIX #8: Dedup — each department is pinged at most once per shift per day.
 */
function sendGentleReminder() {
  var windows = findDeptsInWindow_('reminder');
  if (windows.length === 0) {
    Logger.log('ℹ️ No reminder windows active.');
    return;
  }

  var props = PropertiesService.getScriptProperties();
  var now = new Date();
  var sent = 0, skipped = 0;

  windows.forEach(function(w) {
    if (hasDataForShift_(w.dept, w.shift, w.shiftDate)) return;

    var dateKey = Utilities.formatDate(w.shiftDate, 'Asia/Kolkata', 'yyyy-MM-dd');
    var dedupKey = 'GENTLE_REMINDER_SENT_' + dateKey + '_' + w.dept + '_' + w.shift;
    if (props.getProperty(dedupKey)) { skipped++; return; }

    var supRows = getCurrentWeekRowsForDept_(w.dept).filter(function(r) {
      return r.role === 'Supervisor' || r.role === 'Both';
    });

    var cfg = getShiftConfigForDept_(w.dept, w.shift);
    var dateStr = Utilities.formatDate(w.shiftDate, 'Asia/Kolkata', 'dd-MMM-yyyy');
    var timeStr = Utilities.formatDate(now, 'Asia/Kolkata', 'hh:mm a');

    var msg = '⏰ REMINDER — ' + w.dept + ' Data Due Soon\n';
    msg += '📅 ' + dateStr + ' | ⏰ ' + timeStr + '\n\n';
    msg += '🔄 ' + w.shift + ' (' + cfg.start + ' – ' + cfg.end + ')\n';
    msg += '⏱️ Grace period ends at ' + cfg.deadline + '\n\n';
    msg += buildFormLinkLine_(w.dept);

    var sentToAnyone = false;
    supRows.forEach(function(r) {
      if (!r.chatId || !/^-?\d+$/.test(r.chatId)) return;
      if (sendTelegramToChatId(r.chatId, msg)) sentToAnyone = true;
      Utilities.sleep(300);
    });

    if (!sentToAnyone) {
      sendTelegramAlert('⚠️ No valid Telegram chat ID for ' + w.dept + ' (' + w.shift + ').');
    }

    props.setProperty(dedupKey, String(Date.now()));
    sent++;
  });

  Logger.log('📨 Gentle reminders: ' + sent + ' sent, ' + skipped + ' already sent.');
}
function sendDMEDeadlineAlert() {
  var windows = findDeptsInWindow_('deadline');
  if (windows.length === 0) {
    Logger.log('ℹ️ No deadline windows active.');
    return;
  }

  var now = new Date();
  var props = PropertiesService.getScriptProperties();

  // Group by (shiftDate, shift)
  var groups = {};
  windows.forEach(function(w) {
    var dateKey = Utilities.formatDate(w.shiftDate, 'Asia/Kolkata', 'yyyy-MM-dd');
    var gKey = dateKey + '|' + w.shift;
    if (!groups[gKey]) groups[gKey] = { shift: w.shift, shiftDate: w.shiftDate, depts: [] };
    groups[gKey].depts.push(w.dept);
  });

  Object.keys(groups).forEach(function(gKey) {
    var g = groups[gKey];
    var dateKey = Utilities.formatDate(g.shiftDate, 'Asia/Kolkata', 'yyyy-MM-dd');
    var dedupKey = 'DME_ALERT_SENT_v2_' + dateKey + '_' + g.shift;
    if (props.getProperty(dedupKey)) return;

    var missing = g.depts.filter(function(dept) {
      return !hasDataForShift_(dept, g.shift, g.shiftDate);
    }).map(function(dept) {
      var sup = getSupervisorForCurrentWeek_(dept);
      return {
        department: dept,
        supervisor: sup.name,
        phone: sup.phone,
        chatId: sup.chatId
      };
    });

    if (missing.length === 0) {
      props.setProperty(dedupKey, 'no_alert_needed');
      return;
    }

    var dateStr = Utilities.formatDate(g.shiftDate, 'Asia/Kolkata', 'dd-MMM-yyyy');
    var timeStr = Utilities.formatDate(now, 'Asia/Kolkata', 'hh:mm a');

    var msg = '🚨 DEADLINE ALERT — ' + g.shift + ' Grace Period Ended\n';
    msg += '📅 ' + dateStr + ' | ⏰ ' + timeStr + '\n';
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    msg += '🔴 MISSING DEPARTMENTS (' + missing.length + '):\n';
    msg += buildMissingListText_(missing, false) + '\n\n';
    msg += '📋 ACTION:\n';
    msg += '  ✅ Supervisors — submit ASAP\n';
    msg += '  ✅ Manager — follow up with team\n';
    msg += '  🔗 Dashboard: ' + ScriptApp.getService().getUrl();

    var supRecipients = buildRecipientList_(missing, 'supervisor');
    var mgrRecipients = buildRecipientList_(missing, 'manager');
    var allRecipients = dedupeByChatId_(supRecipients.concat(mgrRecipients));

    var delivered = 0;
    allRecipients.forEach(function(r) {
      if (sendTelegramToChatId(r.chatId, msg)) delivered++;
      Utilities.sleep(300);
    });

    var dmeOk = sendDmeTelegramAlert_(msg);

    if (delivered > 0 || dmeOk) {
      missing.forEach(function(m) {
        logEscalation_(m.department, g.shift, m.supervisor, 'LOW');
      });
      props.setProperty(dedupKey, String(Date.now()));
      Logger.log('📨 Deadline alert: ' + g.shift + ' | ' + missing.length + ' missing | ' + delivered + ' recipients + DME=' + dmeOk);
    } else {
      Logger.log('⚠️ Deadline alert failed — dedup NOT set, will retry.');
    }
  });
}
function sendFollowUpAlert() {
  var windows = findDeptsInWindow_('followup');
  if (windows.length === 0) {
    Logger.log('ℹ️ No follow-up windows active.');
    return;
  }

  var now = new Date();
  var props = PropertiesService.getScriptProperties();

  var groups = {};
  windows.forEach(function(w) {
    var dateKey = Utilities.formatDate(w.shiftDate, 'Asia/Kolkata', 'yyyy-MM-dd');
    var gKey = dateKey + '|' + w.shift;
    if (!groups[gKey]) groups[gKey] = { shift: w.shift, shiftDate: w.shiftDate, depts: [] };
    groups[gKey].depts.push(w.dept);
  });

  Object.keys(groups).forEach(function(gKey) {
    var g = groups[gKey];
    var dateKey = Utilities.formatDate(g.shiftDate, 'Asia/Kolkata', 'yyyy-MM-dd');
     var dedupKey = 'FOLLOWUP_SENT_v2_' + dateKey + '_' + g.shift;
    if (props.getProperty(dedupKey)) return;

    // Space-out gate: follow-up only fires 25+ min after the deadline alert.
    // Prevents DME getting two messages back-to-back at the same trigger.
    var dlKey = 'DME_ALERT_SENT_v2_' + dateKey + '_' + g.shift;
    var dlVal = props.getProperty(dlKey);
    var dlTime = parseInt(dlVal, 10);
    if (!dlTime || isNaN(dlTime)) {
      Logger.log('⏭️ Follow-up skipped for ' + g.shift + ' — no deadline alert sent yet.');
      return;
    }
    var minutesSinceDeadline = (Date.now() - dlTime) / 60000;
    if (minutesSinceDeadline < 25) {
      Logger.log('⏭️ Follow-up skipped for ' + g.shift + ' — only ' +
                 Math.round(minutesSinceDeadline) + ' min since deadline alert.');
      return;
    }

    var missing = g.depts.filter(function(dept) {
      return !hasDataForShift_(dept, g.shift, g.shiftDate);
    }).map(function(dept) {
      var sup = getSupervisorForCurrentWeek_(dept);
      return { department: dept, supervisor: sup.name, phone: sup.phone, chatId: sup.chatId };
    });

    if (missing.length === 0) return;

    var stillMissing = missing.filter(function(m) {
      return wasEscalatedToday_(m.department, g.shift);
    });
    if (stillMissing.length === 0) return;

    var dateStr = Utilities.formatDate(g.shiftDate, 'Asia/Kolkata', 'dd-MMM-yyyy');
    var timeStr = Utilities.formatDate(now, 'Asia/Kolkata', 'hh:mm a');

    var msg = '⚠️ FOLLOW-UP — ' + g.shift + ' STILL Missing\n';
    msg += '📅 ' + dateStr + ' | ⏰ ' + timeStr + '\n\n';
    msg += '🔴 STILL MISSING (' + stillMissing.length + '):\n';
    msg += buildMissingListText_(stillMissing, false) + '\n\n';
    msg += '📋 ACTION: Escalate to Plant Head if not resolved.\n';
    msg += '🔗 ' + ScriptApp.getService().getUrl();

    var supRecipients = buildRecipientList_(stillMissing, 'supervisor');
    var mgrRecipients = buildRecipientList_(stillMissing, 'manager');
    var allRecipients = dedupeByChatId_(supRecipients.concat(mgrRecipients));

    var delivered = 0;
    allRecipients.forEach(function(r) {
      if (sendTelegramToChatId(r.chatId, msg)) delivered++;
      Utilities.sleep(300);
    });

    var dmeOk = sendDmeTelegramAlert_(msg);

    if (delivered > 0 || dmeOk) {
      stillMissing.forEach(function(m) {
        logEscalation_(m.department, g.shift, m.supervisor, 'MEDIUM');
      });
      props.setProperty(dedupKey, String(Date.now()));
      Logger.log('📨 Follow-up: ' + g.shift + ' | ' + stillMissing.length + ' still missing | ' + delivered + ' recipients + DME=' + dmeOk);
    }
  });
}
function sendDailySummary() {
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var dateStr = Utilities.formatDate(yesterday, 'Asia/Kolkata', 'dd-MMM-yyyy');

  var allMissing = [];
  var missingByShift = {};

  DEPARTMENTS.forEach(function(dept) {
    getShiftListForDept_(dept).forEach(function(shift) {
      var shiftDate = new Date(yesterday);
      var hasData = hasDataForShift_(dept, shift, shiftDate);
      if (!hasData) {
        allMissing.push({ department: dept, shift: shift });
        if (!missingByShift[shift]) missingByShift[shift] = [];
        missingByShift[shift].push(dept);
      }
    });
  });

  var msg = '📊 VFPL Factory OS — DAILY SUMMARY\n';
  msg += '📅 ' + dateStr + ' | ⏰ 12:30 AM\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  var shiftKeys = Object.keys(missingByShift);
  if (allMissing.length === 0) {
    msg += '✅ ALL CLEAR! 🎉\n';
  } else {
    shiftKeys.forEach(function(shift) {
      msg += '🔴 ' + shift + ' — ' + missingByShift[shift].length + ' missing:\n';
      missingByShift[shift].forEach(function(d) { msg += '  • ' + d + '\n'; });
      msg += '\n';
    });
  }

  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  msg += '🔗 Dashboard: ' + ScriptApp.getService().getUrl();

  // Recipients: managers + DME + owner (NOT supervisors)
  var mgrRecipients = [];
  DEPARTMENTS.forEach(function(dept) {
    getCurrentWeekRowsForDept_(dept).forEach(function(r) {
      if (r.role !== 'Manager' && r.role !== 'Both') return;
      if (!r.chatId || !/^-?\d+$/.test(r.chatId)) return;
      mgrRecipients.push(r);
    });
  });
  mgrRecipients = dedupeByChatId_(mgrRecipients);

  var delivered = 0;
  mgrRecipients.forEach(function(r) {
    if (sendTelegramToChatId(r.chatId, msg)) delivered++;
    Utilities.sleep(300);
  });

  sendDmeTelegramAlert_(msg);
  sendTelegramAlert(msg);

  Logger.log('📨 Daily summary sent — ' + delivered + ' managers + DME + owner.');
}

function sendWeeklyPerformance() {
  var msg = '📊 VFPL Factory OS — WEEKLY PERFORMANCE\n';
  msg += '📅 Week ending: ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy') + '\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  msg += '📋 Check WEEKLY_PERFORMANCE tab for detailed scores.\n\n';
  msg += '🔗 Dashboard: ' + ScriptApp.getService().getUrl();

  sendTelegramAlert(msg);
  sendDmeTelegramAlert_(msg);
  Logger.log('📨 Weekly performance sent');
}

// ============================================================
// SECTION 5: DEPLOY TRIGGERS + HEARTBEAT
// ============================================================

function deployShiftTrackingTriggers() {
  var ours = [
    'sendGentleReminder', 'sendDMEDeadlineAlert', 'sendFollowUpAlert', 'sendDailySummary',
    'sendWeeklyPerformance', 'recordShiftCompliance', 'rebuildWeeklyPerformance',
    'syncOpsDashboardToSupabase', 'processTelegramOnboarding',
    'runShiftAlerts15min_', 'runDailyMaintenance_'
  ];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (ours.indexOf(t.getHandlerFunction()) > -1) ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('runShiftAlerts15min_').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('runDailyMaintenance_').timeBased().atHour(0).nearMinute(30).everyDays(1).create();

  Logger.log('✅ Shift tracking triggers deployed: 2 total.');
}

/**
 * FIX #11: Writes heartbeat + counters to Script Properties so we can prove
 * the pipeline is alive.
 */
function runShiftAlerts15min_() {
  var fns = [sendGentleReminder, sendDMEDeadlineAlert, sendFollowUpAlert,
             recordShiftCompliance, syncOpsDashboardToSupabase, processTelegramOnboarding];
  var ok = 0, fail = 0;

  fns.forEach(function(fn) {
    try {
      fn();
      ok++;
    } catch (err) {
      Logger.log('❌ runShiftAlerts15min_: ' + fn.name + ' failed: ' + err);
      fail++;
    }
  });

  var props = PropertiesService.getScriptProperties();
  props.setProperty('ALERT_LAST_RUN_TS', String(Date.now()));
  props.setProperty('ALERT_LAST_RUN_OK', String(ok));
  props.setProperty('ALERT_LAST_RUN_FAIL', String(fail));
}

function runDailyMaintenance_() {
  [sendDailySummary, rebuildWeeklyPerformance, cleanupOldAlertState].forEach(function(fn) {
    try { fn(); } catch (err) { Logger.log('❌ runDailyMaintenance_: ' + fn.name + ' failed: ' + err); }
  });
  try {
    if (Utilities.formatDate(new Date(), 'Asia/Kolkata', 'EEEE') === 'Monday') sendWeeklyPerformance();
  } catch (err) {
    Logger.log('❌ runDailyMaintenance_: sendWeeklyPerformance failed: ' + err);
  }
}

/**
 * FIX #12: Run manually to check pipeline health. Reports last run age.
 */
function checkAlertHeartbeat() {
  var props = PropertiesService.getScriptProperties();
  var ts = parseInt(props.getProperty('ALERT_LAST_RUN_TS') || '0', 10);
  if (!ts) {
    Logger.log('⚠️ No heartbeat yet — trigger has never fired.');
    return;
  }
  var ageMin = (Date.now() - ts) / 60000;
  Logger.log('Last alert run: ' + new Date(ts).toString() + ' (' + Math.round(ageMin) + ' min ago)');
  Logger.log('Last run OK count: ' + props.getProperty('ALERT_LAST_RUN_OK'));
  Logger.log('Last run FAIL count: ' + props.getProperty('ALERT_LAST_RUN_FAIL'));
  if (ageMin > 45) {
    Logger.log('🚨 ALERT: pipeline silent for ' + Math.round(ageMin) + ' min.');
  } else {
    Logger.log('✅ Pipeline healthy.');
  }
}

// ============================================================
// SECTION 6: FORM RESPONSE PROCESSOR
// ============================================================

function getFormResponsesTab_() {
  var ss = SpreadsheetApp.openById(DASH_ID);

  var sh = ss.getSheetByName('Form Responses 1');
  if (sh) return sh;

  sh = ss.getSheetByName('FORM_RESPONSES');
  if (sh) return sh;

  sh = ss.insertSheet('FORM_RESPONSES');
  var headers = [
    'Timestamp', 'Department', 'Supervisor Name', 'Phone', 'Telegram Chat ID',
    'Week Start (Saturday)', 'Week End (Thursday)', 'Status'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
  return sh;
}

/**
 * FIX #6: Full rewrite.
 *   - Auto-adds Status column if missing
 *   - Dedups against SUPERVISOR_MAP before writing
 *   - Dedups within the same batch
 *   - Sanitizes chat IDs (rejects non-numeric)
 */
function processFormSubmissions() {
  var ss = SpreadsheetApp.openById(DASH_ID);

  var formSh = getFormResponsesTab_();
  if (!formSh) {
    Logger.log('❌ Form responses tab not found.');
    return;
  }

  var mapSh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!mapSh) {
    Logger.log('❌ SUPERVISOR_MAP tab not found.');
    return;
  }

  var data = formSh.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('ℹ️ No form responses to process.');
    return;
  }

  var headers = data[0];
  var colIndex = {};
  var expectedCols = ['Timestamp', 'Department', 'Supervisor Name', 'Phone', 'Telegram Chat ID', 'Week Start', 'Week End'];
  var PREFIX_MATCHED = { 'Week Start': true, 'Week End': true, 'Phone': true };

  expectedCols.forEach(function(colName) {
    for (var i = 0; i < headers.length; i++) {
      var header = headers[i] ? headers[i].toString().trim() : '';
      if (!header) continue;
      var hit = PREFIX_MATCHED[colName]
        ? header.indexOf(colName) === 0
        : header === colName;
      if (hit) { colIndex[colName] = i; break; }
    }
  });

  var missingCols = expectedCols.filter(function(col) { return colIndex[col] === undefined; });
  if (missingCols.length > 0) {
    Logger.log('⚠️ Missing columns in form responses: ' + missingCols.join(', '));
    return;
  }

  // Auto-add Status column if missing
  var statusCol = -1;
  for (var h = 0; h < headers.length; h++) {
    if ((headers[h] || '').toString().trim() === 'Status') { statusCol = h; break; }
  }
  if (statusCol === -1) {
    statusCol = headers.length;
    formSh.getRange(1, statusCol + 1).setValue('Status')
      .setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
    headers.push('Status');
    Logger.log('ℹ️ Auto-added Status column at index ' + statusCol);
  }

  // Build existing SUPERVISOR_MAP index
  var mapData = mapSh.getDataRange().getValues();
  var existingKeys = {};
  for (var m = 1; m < mapData.length; m++) {
    var mDept = (mapData[m][0] || '').toString().trim();
    var mName = (mapData[m][1] || '').toString().trim();
    var mStart = mapData[m][4];
    var mStartStr = mStart
      ? Utilities.formatDate(new Date(mStart), 'Asia/Kolkata', 'yyyy-MM-dd')
      : '';
    if (mDept && mName && mStartStr) {
      existingKeys[mDept + '|' + mName + '|' + mStartStr] = true;
    }
  }
  Logger.log('ℹ️ SUPERVISOR_MAP has ' + Object.keys(existingKeys).length + ' existing keys.');

  var seenThisRun = {};
  var processed = 0, skipped = 0, duplicates = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    var currentStatus = (row[statusCol] || '').toString().trim().toUpperCase();
    if (currentStatus === 'PROCESSED' || currentStatus === 'SKIPPED_DUPLICATE') {
      skipped++;
      continue;
    }

    var department = (row[colIndex['Department']] || '').toString().trim();
    var supervisor = (row[colIndex['Supervisor Name']] || '').toString().trim();
    var phone = (row[colIndex['Phone']] || '').toString().trim();
    var chatIdRaw = (row[colIndex['Telegram Chat ID']] || '').toString().trim();

    // Sanitize chat ID — reject non-numeric
    var chatId = '';
    if (/^-?\d+$/.test(chatIdRaw)) chatId = chatIdRaw;

    var weekStart = row[colIndex['Week Start']];
    var weekEnd = row[colIndex['Week End']];

    if (!department || !supervisor) {
      formSh.getRange(i + 1, statusCol + 1).setValue('SKIPPED_INVALID');
      formSh.getRange(i + 1, statusCol + 1).setBackground('#FEE2E2');
      skipped++;
      continue;
    }

    var startStr = weekStart
      ? Utilities.formatDate(new Date(weekStart), 'Asia/Kolkata', 'yyyy-MM-dd')
      : '';
    var endStr = weekEnd
      ? Utilities.formatDate(new Date(weekEnd), 'Asia/Kolkata', 'yyyy-MM-dd')
      : '';

    if (!startStr) {
      formSh.getRange(i + 1, statusCol + 1).setValue('SKIPPED_NO_DATE');
      formSh.getRange(i + 1, statusCol + 1).setBackground('#FEE2E2');
      skipped++;
      continue;
    }

    var key = department + '|' + supervisor + '|' + startStr;

    if (existingKeys[key] || seenThisRun[key]) {
      formSh.getRange(i + 1, statusCol + 1).setValue('SKIPPED_DUPLICATE');
      formSh.getRange(i + 1, statusCol + 1).setBackground('#FEF3C7');
      duplicates++;
      continue;
    }

    mapSh.appendRow([department, supervisor, phone, chatId, startStr, endStr, 'YES']);
    existingKeys[key] = true;
    seenThisRun[key] = true;

    formSh.getRange(i + 1, statusCol + 1).setValue('PROCESSED');
    formSh.getRange(i + 1, statusCol + 1).setBackground('#C8E6C9');
    processed++;
  }

  Logger.log('📊 Processing complete: ' + processed + ' added, ' + skipped + ' skipped, ' + duplicates + ' duplicates suppressed.');

  if (processed > 0) {
    sendTelegramAlert('✅ ' + processed + ' supervisor(s) added. ' + duplicates + ' duplicate(s) suppressed.');
  }
}

function setupFormTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'processFormSubmissions') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('processFormSubmissions')
    .forSpreadsheet(DASH_ID)
    .onFormSubmit()
    .create();

  Logger.log('✅ Form submission trigger set up!');
}

function processPendingFormSubmissions() {
  Logger.log('🚀 Processing pending form submissions...');
  processFormSubmissions();
  Logger.log('✅ Done!');
}
function oneTimeSetup() {
  Logger.log('⚠️ DISABLED — this function wipes SUPERVISOR_MAP and log tabs. Edit the code to re-enable.');
  return;
  // ──────────────────────────────────────────────────────
  // Original code preserved below (unreachable):
  // Logger.log('🚀 STARTING ONE-TIME SETUP...');
  // var ss = SpreadsheetApp.openById(DASH_ID);
  // createDynamicSupervisorMap_(ss);
  // createShiftConfigTab_(ss);
  // createDataSubmissionLogTab_(ss);
  // createWeeklyPerformanceTab_(ss);
  // createEscalationLogTab_(ss);
  // createFormLinksTab_(ss);
  // getFormResponsesTab_();
  // setupFormTrigger();
  // verifyTabsPopulated();
  // Logger.log('✅ ONE-TIME SETUP COMPLETE!');
  // ──────────────────────────────────────────────────────
}

// ============================================================
// SECTION 7: FORM LINKS HELPERS
// ============================================================

function createFormLinksTab_(ss) {
  var sh = ss.getSheetByName(FORM_LINKS_TAB);
  var headers = ['Department', 'Form Name', 'Frequency', 'Responsible Person', 'Form URL', 'Send in reminder?'];

  if (sh && sh.getLastColumn() < headers.length) {
    ss.deleteSheet(sh);
    sh = null;
  }

  if (!sh) {
    sh = ss.insertSheet(FORM_LINKS_TAB);
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
  }

  var existing = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function(r) {
      existing[(r[0] || '').toString().trim() + '|' + (r[1] || '').toString().trim()] = true;
    });
  }

  var toAdd = [];
  DEPT_FORM_SEED.forEach(function(row) {
    if (existing[row[0] + '|' + row[1]]) return;
    toAdd.push(row);
  });

  if (toAdd.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, toAdd.length, headers.length).setValues(toAdd);
  }

  sh.autoResizeColumns(1, headers.length);
  Logger.log('  ✅ ' + FORM_LINKS_TAB + ' ready (' + toAdd.length + ' row(s) added)');
}

var _formCache = null;

function getFormsForDept_(dept) {
  if (_formCache === null) {
    _formCache = {};
    var rows = null;
    var sh = SpreadsheetApp.openById(DASH_ID).getSheetByName(FORM_LINKS_TAB);
    if (sh && sh.getLastRow() > 1 && sh.getLastColumn() >= 6) {
      rows = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
    } else {
      rows = DEPT_FORM_SEED;
    }
    rows.forEach(function(r) {
      var d = (r[0] || '').toString().trim();
      var name = (r[1] || '').toString().trim();
      var url = (r[4] || '').toString().trim();
      var include = (r[5] || '').toString().trim().toUpperCase();
      if (!d || !url || include !== 'YES') return;
      if (!_formCache[d]) _formCache[d] = [];
      _formCache[d].push({ name: name, url: url });
    });
  }
  return _formCache[dept] || [];
}

function buildFormLinkLine_(dept) {
  var forms = getFormsForDept_(dept);
  if (forms.length === 0) {
    return '\u26a0\ufe0f No form link configured for ' + dept + ' \u2014 add it to the ' + FORM_LINKS_TAB + ' tab.';
  }
  if (forms.length === 1) {
    return '\ud83d\udd17 Upload here: ' + forms[0].url;
  }
  var lines = ['\ud83d\udd17 Forms due for ' + dept + ':'];
  forms.forEach(function(f) {
    lines.push('  \u2022 ' + f.name + '\n    ' + f.url);
  });
  return lines.join('\n');
}

// ── SHIFT DEADLINES AS REAL DATES ─────────────────────────

function parseHm_(hm) {
  var parts = (hm || '').split(':');
  return { h: parseInt(parts[0], 10), m: parseInt(parts[1], 10) };
}

function getShiftDeadlineDateTime_(shift, shiftDate, dept) {
  // Backward-compat: dept is optional. If omitted, uses default 3-shift config.
  var cfg = dept ? getShiftConfigForDept_(dept, shift) : SHIFT_CONFIG_DATA[shift];
  if (!cfg) return null;

  var start = parseHm_(cfg.start);
  var dl = parseHm_(cfg.deadline);

  var d = new Date(shiftDate.getFullYear(), shiftDate.getMonth(), shiftDate.getDate(), dl.h, dl.m, 0, 0);
  if (dl.h * 60 + dl.m < start.h * 60 + start.m) d.setDate(d.getDate() + 1);
  return d;
}
// ── COMPLIANCE SWEEP ──────────────────────────────────────

function loadComplianceKeys_(sh) {
  var keys = {};
  if (sh.getLastRow() < 2) return keys;

  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  data.forEach(function(r) {
    var d = r[0];
    if (!d) return;
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return;
    var dateStr = Utilities.formatDate(dt, 'Asia/Kolkata', 'yyyy-MM-dd');
    keys[dateStr + '|' + (r[1] || '') + '|' + (r[2] || '')] = true;
  });
  return keys;
}

/**
 * FIX #9: Caps delay at 120 min. If the sweep runs >120 min after the
 * deadline, we cannot tell if the data was late or the sweep was late — so
 * we record ON TIME rather than blaming the supervisor for our own outage.
 */
function recordShiftCompliance() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('DATA_SUBMISSION_LOG');
  if (!sh) {
    Logger.log('❌ DATA_SUBMISSION_LOG not found.');
    return;
  }

  var now = new Date();
  var logged = loadComplianceKeys_(sh);
  var rows = [];

  for (var offset = COMPLIANCE_LOOKBACK_DAYS; offset >= 0; offset--) {
    var shiftDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    var dateStr = Utilities.formatDate(shiftDate, 'Asia/Kolkata', 'yyyy-MM-dd');

    ['Shift 1', 'Shift 2', 'Shift 3'].forEach(function(shift) {
      var deadline = getShiftDeadlineDateTime_(shift, shiftDate);
      if (!deadline) return;

      DEPARTMENTS.forEach(function(dept) {
        var rawTab = DEPT_TO_RAW_TAB[dept];
        if (!rawTab || !ss.getSheetByName(rawTab)) return;

        var key = dateStr + '|' + dept + '|' + shift;
        if (logged[key]) return;

        var supervisor = getSupervisorForCurrentWeek_(dept);
        var minutesPastDeadline = Math.round((now.getTime() - deadline.getTime()) / 60000);

        if (hasDataForShift_(dept, shift, shiftDate)) {
          var status, delay;
          if (minutesPastDeadline < 0) {
            status = 'ON TIME';
            delay = 0;
          } else if (minutesPastDeadline <= 120) {
            status = minutesPastDeadline === 0 ? 'ON TIME' : 'LATE';
            delay = minutesPastDeadline;
          } else {
            // Sweep missed the window — assume on time
            status = 'ON TIME';
            delay = 0;
          }

          rows.push([
            dateStr,
            dept,
            shift,
            supervisor.name || 'Unknown',
            Utilities.formatDate(now, 'Asia/Kolkata', 'HH:mm'),
            status,
            delay
          ]);
          logged[key] = true;
        } else if (minutesPastDeadline > MISSING_CUTOFF_HOURS * 60) {
          rows.push([
            dateStr,
            dept,
            shift,
            supervisor.name || 'Unknown',
            '',
            'MISSING',
            ''
          ]);
          logged[key] = true;
        }
      });
    });
  }

  if (rows.length === 0) {
    Logger.log('ℹ️ Compliance sweep: nothing new to record.');
    return;
  }

  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  Logger.log('✅ Compliance sweep: ' + rows.length + ' row(s) written.');
}

// ── WEEKLY ROLL-UP ────────────────────────────────────────

function weekStartFor_(date) {
  var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  var dow = d.getDay();
  var back = (dow + 1) % 7;
  d.setDate(d.getDate() - back);
  return Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM-dd');
}

function rebuildWeeklyPerformance() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var log = ss.getSheetByName('DATA_SUBMISSION_LOG');
  var out = ss.getSheetByName('WEEKLY_PERFORMANCE');
  if (!log || !out) {
    Logger.log('❌ DATA_SUBMISSION_LOG or WEEKLY_PERFORMANCE missing.');
    return;
  }
  if (log.getLastRow() < 2) {
    Logger.log('ℹ️ No submission rows to roll up yet.');
    return;
  }

  var data = log.getRange(2, 1, log.getLastRow() - 1, 7).getValues();
  var groups = {};

  data.forEach(function(r) {
    var d = r[0];
    if (!d) return;
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return;

    var dept = (r[1] || '').toString().trim();
    var supervisor = (r[3] || 'Unknown').toString().trim();
    var status = (r[5] || '').toString().trim().toUpperCase();
    var week = weekStartFor_(dt);

    var key = supervisor + '|' + dept + '|' + week;
    if (!groups[key]) {
      groups[key] = { supervisor: supervisor, dept: dept, week: week,
                      total: 0, onTime: 0, late: 0, missing: 0 };
    }
    var g = groups[key];
    g.total++;
    if (status === 'ON TIME') g.onTime++;
    else if (status === 'LATE') g.late++;
    else g.missing++;
  });

  var list = [];
  Object.keys(groups).forEach(function(k) { list.push(groups[k]); });

  list.sort(function(a, b) {
    if (a.week !== b.week) return a.week < b.week ? 1 : -1;
    if (a.dept !== b.dept) return a.dept < b.dept ? -1 : 1;
    return a.supervisor < b.supervisor ? -1 : 1;
  });

  var rows = list.map(function(g) {
    return [g.supervisor, g.dept, g.week, g.total, g.onTime, g.late, g.missing];
  });

  if (out.getLastRow() > 1) {
    out.getRange(2, 1, out.getLastRow() - 1, out.getLastColumn()).clearContent();
  }
  if (rows.length > 0) {
    out.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  Logger.log('✅ WEEKLY_PERFORMANCE rebuilt: ' + rows.length + ' row(s).');
}

// ============================================================
// SECTION 8: SUPABASE SYNC
// ============================================================

var SUPABASE_PUSH_BATCH = 500;

function getSupabaseCredentials_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL') || SUPABASE_URL_INLINE;
  var key = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || SUPABASE_SERVICE_ROLE_KEY_INLINE;

  if (!url || !key) {
    throw new Error('No Supabase credentials.');
  }
  return { url: url, key: key };
}

function supabasePush_(table, rows) {
  if (!rows || rows.length === 0) return 0;

  var creds = getSupabaseCredentials_();
  var baseUrl = creds.url;
  var serviceKey = creds.key;

  var sent = 0;
  for (var i = 0; i < rows.length; i += SUPABASE_PUSH_BATCH) {
    var batch = rows.slice(i, i + SUPABASE_PUSH_BATCH);
    var res = UrlFetchApp.fetch(baseUrl.replace(/\/$/, '') + '/rest/v1/' + table + '?on_conflict=row_key', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      payload: JSON.stringify(batch),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('Supabase push to ' + table + ' failed (' + code + '): ' + res.getContentText());
    }
    sent += batch.length;
  }
  return sent;
}

function toDateKey_(value) {
  if (!value) return null;
  var d = (value instanceof Date) ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM-dd');
}

function syncFormSubmissionsToSupabase() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('DATA_SUBMISSION_LOG');
  if (!sh || sh.getLastRow() < 2) {
    Logger.log('ℹ️ form_submissions: nothing logged yet.');
    return 0;
  }

  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  var rows = [];

  data.forEach(function(r) {
    var dateKey = toDateKey_(r[0]);
    var dept = DEPT_TO_DB_DEPARTMENT[(r[1] || '').toString().trim()];
    if (!dateKey || !dept) return;

    var shift = (r[2] || '').toString().trim() || null;
    var status = (r[5] || '').toString().trim().toUpperCase();
    if (['ON TIME', 'LATE', 'MISSING'].indexOf(status) === -1) return;

    rows.push({
      row_key: dateKey + '|' + dept + '|' + (shift || ''),
      date: dateKey,
      department: dept,
      shift: shift,
      status: status,
      delay_minutes: (r[6] === '' || r[6] === null) ? null : Number(r[6]),
      entry_time: (r[4] || '').toString() || null,
      supervisor_name: (r[3] || '').toString() || null
    });
  });

  var deduped = {};
  rows.forEach(function(row) { deduped[row.row_key] = row; });
  var unique = Object.keys(deduped).map(function(k) { return deduped[k]; });

  var sent = supabasePush_('form_submissions', unique);
  Logger.log('✅ form_submissions: ' + sent + ' row(s) pushed.');
  return sent;
}

function syncProductionToSupabase() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var rows = [];

  Object.keys(DEPT_TO_DB_DEPARTMENT).forEach(function(dept) {
    if (NON_PRODUCTION_DEPTS[dept]) return;

    var tabName = DEPT_TO_RAW_TAB[dept];
    var sh = tabName ? ss.getSheetByName(tabName) : null;
    if (!sh || sh.getLastRow() < 2) return;

    var values = sh.getDataRange().getValues();
    var width = values[0].length;

    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      var dateKey = toDateKey_(r[0]);
      if (!dateKey) continue;

      var unit = (r[1] || '').toString().trim() || null;
      var shift = normaliseShift_(r[2]);
      var vfNo = width >= 5 ? ((r[3] || '').toString().trim() || null) : null;
      var qtyRaw = width >= 5 ? r[4] : r[3];
      var qty = (qtyRaw === '' || qtyRaw === null || qtyRaw === undefined) ? null : Number(qtyRaw);
      if (qty !== null && isNaN(qty)) qty = null;

      rows.push({
        row_key: [dateKey, DEPT_TO_DB_DEPARTMENT[dept], shift || '', unit || '', vfNo || ''].join('|'),
        date: dateKey,
        department: DEPT_TO_DB_DEPARTMENT[dept],
        shift: shift,
        unit: unit,
        vf_no: vfNo,
        qty: qty
      });
    }
  });

  var deduped = {};
  rows.forEach(function(row) { deduped[row.row_key] = row; });
  var unique = Object.keys(deduped).map(function(k) { return deduped[k]; });

  var sent = supabasePush_('production_records', unique);
  Logger.log('✅ production_records: ' + sent + ' row(s) pushed.');
  return sent;
}

function syncOpsDashboardToSupabase() {
  var forms = syncFormSubmissionsToSupabase();
  var production = syncProductionToSupabase();
  Logger.log('✅ Sync complete: ' + forms + ' submission row(s), ' + production + ' production row(s).');
}

function testSupabaseSync() {
  getSupabaseCredentials_();
  syncOpsDashboardToSupabase();
  Logger.log('✅ Supabase sync test passed.');
}

// ============================================================
// SECTION 9: TELEGRAM ONBOARDING
// ============================================================

var OWNER_NAME_TRIGGERS = ['yash', 'yash munot', 'yash jinendra munot', 'owner', 'vfl1001'];
var DME_NAME_TRIGGERS = ['amit', 'amit shirsath', 'amit bhagvan shirsath', 'vfl5434'];

function getLastTelegramUpdateId_() {
  var v = PropertiesService.getScriptProperties().getProperty('TELEGRAM_LAST_UPDATE_ID');
  return v ? parseInt(v, 10) : 0;
}
function setLastTelegramUpdateId_(id) {
  PropertiesService.getScriptProperties().setProperty('TELEGRAM_LAST_UPDATE_ID', String(id));
}

function processTelegramOnboarding() {
  var token = getTelegramBotToken_();
  if (!token) {
    Logger.log('❌ No Telegram bot token.');
    return;
  }

  var lastId = getLastTelegramUpdateId_();
  var res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + token + '/getUpdates?offset=' + (lastId + 1) + '&timeout=0',
    { muteHttpExceptions: true }
  );
  var body = JSON.parse(res.getContentText());
  if (!body.ok) {
    Logger.log('❌ getUpdates failed: ' + res.getContentText());
    return;
  }

  var updates = body.result || [];
  if (updates.length === 0) {
    Logger.log('ℹ️ Telegram onboarding: no new messages.');
    return;
  }

  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('SUPERVISOR_MAP');
  var registered = 0;
  var unmatched = [];

  updates.forEach(function(update) {
    setLastTelegramUpdateId_(update.update_id);

    var msg = update.message;
    if (!msg || !msg.text || !msg.chat) return;

    var text = msg.text.replace(/^\/start\s*/i, '').trim();
    if (!text || text.length < 3) return;

    var chatId = String(msg.chat.id);

    if (OWNER_NAME_TRIGGERS.indexOf(text.toLowerCase()) > -1) {
      PropertiesService.getScriptProperties().setProperty('OWNER_TELEGRAM_CHAT_ID', chatId);
      registered++;
      sendTelegramToChatId(chatId, '✅ Registered as plant owner.');
      return;
    }

    if (DME_NAME_TRIGGERS.indexOf(text.toLowerCase()) > -1) {
      PropertiesService.getScriptProperties().setProperty('DME_TELEGRAM_CHAT_ID', chatId);
      registered++;
      sendTelegramToChatId(chatId, '✅ Registered as DME.');
      return;
    }

    var match = matchSupervisorByName_(sh, text);

    if (match === 'none') {
      unmatched.push(text);
      sendTelegramToChatId(chatId, 'Could not find "' + text + '" in this week\'s supervisor list.');
    } else if (match === 'ambiguous') {
      unmatched.push(text + ' (ambiguous)');
      sendTelegramToChatId(chatId, 'More than one supervisor matches "' + text + '".');
        } else {
      match.ranges.forEach(function(r) { r.setValue(chatId); });
      registered++;
      sendTelegramToChatId(chatId, '✅ Registered. You will receive shift alerts here.');
      try {
        sendTelegramAlert('🆕 New supervisor registered: ' + match.supervisorName + ' — department ' + match.department);
      } catch (e) { Logger.log('Owner notify failed: ' + e); }
    }
  });

  Logger.log('✅ Telegram onboarding: ' + registered + ' registered, ' + unmatched.length + ' unmatched.');
}
function matchSupervisorByName_(sh, text) {
  if (!sh) return 'none';

  var data = sh.getDataRange().getValues();
  if (data.length < 2) return 'none';

  var typedNorm = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!typedNorm) return 'none';

  var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');

  var exactMatches = [];
  var looseMatches = [];

  for (var i = 1; i < data.length; i++) {
    var active = (data[i][6] || '').toString().trim().toUpperCase();
    if (active !== 'YES') continue;

    var weekStart = data[i][4], weekEnd = data[i][5];
    if (!weekStart || !weekEnd) continue;

    var startStr = Utilities.formatDate(new Date(weekStart), 'Asia/Kolkata', 'yyyy-MM-dd');
    var endStr = Utilities.formatDate(new Date(weekEnd), 'Asia/Kolkata', 'yyyy-MM-dd');
    if (today < startStr || today > endStr) continue;

    var rawName = (data[i][1] || '').toString().trim();
    if (!rawName) continue;
    if (/^_+$/.test(rawName)) continue;

    var normName = rawName.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normName || normName === 'unknown') continue;

    var m = {
      rowNumber: i + 1,
      name: rawName,
      department: (data[i][0] || '').toString().trim()
    };

    if (normName === typedNorm) {
      exactMatches.push(m);
    } else if (normName.indexOf(typedNorm) >= 0 || typedNorm.indexOf(normName) >= 0) {
      looseMatches.push(m);
    }
  }

  var pool = exactMatches.length > 0 ? exactMatches : looseMatches;
  if (pool.length === 0) return 'none';

  var byPerson = {};
  pool.forEach(function(m) {
    var key = m.name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!byPerson[key]) {
      byPerson[key] = { name: m.name, department: m.department, rows: [] };
    }
    byPerson[key].rows.push(m.rowNumber);
  });

  var personKeys = Object.keys(byPerson);
  if (personKeys.length === 0) return 'none';
  if (personKeys.length > 1) return 'ambiguous';

  var p = byPerson[personKeys[0]];
  return {
    ranges: p.rows.map(function(rowNum) { return sh.getRange(rowNum, 4); }),
    supervisorName: p.name,
    department: p.department
  };
}
// ============================================================
// SECTION 10: VERIFICATION + SELF-CHECK
// ============================================================

function verifyTabsPopulated() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var tabs = ['SUPERVISOR_MAP', 'SHIFT_CONFIG', 'FORM_LINKS', 'DATA_SUBMISSION_LOG', 'WEEKLY_PERFORMANCE', 'FORM_RESPONSES', 'ESCALATION_LOG'];

  Logger.log('=== VERIFYING TABS ===');
  tabs.forEach(function(tabName) {
    var sh = ss.getSheetByName(tabName);
    if (!sh) { Logger.log('  ❌ ' + tabName + ' — NOT FOUND'); return; }
    Logger.log('  ✅ ' + tabName + ' — Rows: ' + sh.getLastRow() + ', Columns: ' + sh.getLastColumn());
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
function seedCurrentWeek() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('SUPERVISOR_MAP');
  var data = sh.getDataRange().getValues();
  var existing = {};
  for (var i = 1; i < data.length; i++) {
    var d = (data[i][0] || '').toString().trim();
    var n = (data[i][1] || '').toString().trim();
    var s = data[i][4];
    var sKey = s ? Utilities.formatDate(new Date(s), 'Asia/Kolkata', 'yyyy-MM-dd') : '';
    if (d && n && sKey) existing[d + '|' + n + '|' + sKey] = true;
  }

  var NEW_START = '2026-09-12';
  var NEW_END = '2026-09-17';
  var added = 0;

  for (var i = 1; i < data.length; i++) {
    var dept = (data[i][0] || '').toString().trim();
    var name = (data[i][1] || '').toString().trim();
    var phone = (data[i][2] || '').toString().trim();
    var oldStart = data[i][4];
    var oldStartStr = oldStart ? Utilities.formatDate(new Date(oldStart), 'Asia/Kolkata', 'yyyy-MM-dd') : '';

    if (oldStartStr !== '2026-09-05') continue;
    if (!dept || !name) continue;

    var key = dept + '|' + name + '|' + NEW_START;
    if (existing[key]) continue;

    sh.appendRow([dept, name, phone, '', NEW_START, NEW_END, 'YES']);
    existing[key] = true;
    added++;
  }
  Logger.log('✅ seedCurrentWeek_: added ' + added + ' rows for ' + NEW_START + ' to ' + NEW_END + '.');
}
function testComplianceScoring() {
  var failures = [];
  function check(label, actual, expected) {
    if (String(actual) !== String(expected)) {
      failures.push(label + ': got ' + actual + ', expected ' + expected);
    }
  }

  var base = new Date(2026, 7, 12);
  function dl(shift) {
    return Utilities.formatDate(getShiftDeadlineDateTime_(shift, base), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm');
  }
  check('Shift 1 deadline', dl('Shift 1'), '2026-08-12 16:30');
  check('Shift 2 deadline', dl('Shift 2'), '2026-08-13 00:30');
  check('Shift 3 deadline', dl('Shift 3'), '2026-08-13 09:30');

  check('week start (Sat itself)', weekStartFor_(new Date(2026, 7, 8)),  '2026-08-08');
  check('week start (Sun)',        weekStartFor_(new Date(2026, 7, 9)),  '2026-08-08');
  check('week start (Wed)',        weekStartFor_(new Date(2026, 7, 12)), '2026-08-08');
  check('week start (Fri)',        weekStartFor_(new Date(2026, 7, 14)), '2026-08-08');

  check('First Shift',   normaliseShift_('First Shift'),   'Shift 1');
  check('2nd Staff',     normaliseShift_('2nd Staff'),     'Shift 2');
  check('Third Shift',   normaliseShift_('Third Shift'),   'Shift 3');
  check('General Shift', normaliseShift_('General Shift'), 'null');
  check('person name',   normaliseShift_('B.S. Todmal'),   'null');
  check('blank',         normaliseShift_(''),              'null');

  Logger.log('=== FORM LINKS ===');
  DEPARTMENTS.forEach(function(dept) {
    var forms = getFormsForDept_(dept);
    if (forms.length === 0) {
      Logger.log('  ❌ ' + dept + ': NOT CONFIGURED');
      return;
    }
    Logger.log('  ✅ ' + dept + ': ' + forms.length + ' form(s)');
  });

  Logger.log('=== SELF-CHECK ===');
  if (failures.length === 0) {
    Logger.log('✅ All 13 logic checks passed.');
  } else {
    failures.forEach(function(f) { Logger.log('❌ ' + f); });
    throw new Error(failures.length + ' self-check failure(s).');
  }
}

 function diagnoseSupabase() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');

  Logger.log('=== SCRIPT PROPERTIES ===');
  Logger.log('SUPABASE_URL set? ' + (url ? 'yes' : 'no'));
  if (url) Logger.log('  value: ' + url);

  Logger.log('SUPABASE_SERVICE_ROLE_KEY set? ' + (key ? 'yes' : 'no'));
  if (key) {
    Logger.log('  length: ' + key.length);
    Logger.log('  first 40: ' + key.substring(0, 40));
    Logger.log('  last 20: ' + key.substring(key.length - 20));
  }

  Logger.log('');
  Logger.log('=== INLINE CONSTANTS ===');
  Logger.log('SUPABASE_URL_INLINE: ' + SUPABASE_URL_INLINE);
  Logger.log('SUPABASE_SERVICE_ROLE_KEY_INLINE length: ' + SUPABASE_SERVICE_ROLE_KEY_INLINE.length);
  Logger.log('  first 40: ' + SUPABASE_SERVICE_ROLE_KEY_INLINE.substring(0, 40));
}
function diagnoseOwnerChatId() {
  var props = PropertiesService.getScriptProperties();
  Logger.log('OWNER_TELEGRAM_CHAT_ID (Script Property): ' + (props.getProperty('OWNER_TELEGRAM_CHAT_ID') || '(not set)'));
  Logger.log('DME_TELEGRAM_CHAT_ID (Script Property): ' + (props.getProperty('DME_TELEGRAM_CHAT_ID') || '(not set)'));
  Logger.log('OWNER_TELEGRAM_CHAT_ID_INLINE: "' + OWNER_TELEGRAM_CHAT_ID_INLINE + '"');
  Logger.log('DME_CHAT_ID_INLINE: "' + DME_CHAT_ID_INLINE + '"');
}
function cleanupOldAlertState() {
  var props = PropertiesService.getScriptProperties();
  var todayKey = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  var yesterdayKey = Utilities.formatDate(new Date(Date.now() - 86400000), 'Asia/Kolkata', 'yyyy-MM-dd');

  var all = props.getKeys();
  var deleted = 0;
  all.forEach(function(k) {
    // Keep today's and yesterday's dedup keys; delete older
    if (k.indexOf('GENTLE_REMINDER_SENT_') === 0 ||
        k.indexOf('DME_ALERT_SENT_') === 0) {
      if (k.indexOf(todayKey) === -1 && k.indexOf(yesterdayKey) === -1) {
        props.deleteProperty(k);
        deleted++;
      }
    }
  });
  Logger.log('cleanupOldAlertState: deleted ' + deleted + ' old keys.');
}
function resetTelegramOffset() {
  var props = PropertiesService.getScriptProperties();
  var old = props.getProperty('TELEGRAM_LAST_UPDATE_ID');
  props.deleteProperty('TELEGRAM_LAST_UPDATE_ID');
  Logger.log('🗑️ Deleted TELEGRAM_LAST_UPDATE_ID (was: ' + old + ')');
  Logger.log('Next processTelegramOnboarding() will start from offset 0');
}
function checkTelegramReadiness() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_BOT_TOKEN')
           || '8516658886:AAGHGLt94IQd8v5QzJYsyaZqVuM8Ek7CFaM';

  // Who am I?
  var me = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getMe', { muteHttpExceptions: true });
  Logger.log('getMe: ' + me.getContentText());

  // Any pending webhook?
  var wh = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getWebhookInfo', { muteHttpExceptions: true });
  Logger.log('getWebhookInfo: ' + wh.getContentText());

  // Offset status
  var offset = props.getProperty('TELEGRAM_LAST_UPDATE_ID') || '(not set — good)';
  Logger.log('TELEGRAM_LAST_UPDATE_ID: ' + offset);
}
function restoreTelegramChatIdProperties() {
  var props = PropertiesService.getScriptProperties();

  props.setProperty('OWNER_TELEGRAM_CHAT_ID', '8824096175');
  props.setProperty('DME_TELEGRAM_CHAT_ID',   '5108696603');

  Logger.log('✅ OWNER_TELEGRAM_CHAT_ID = ' + props.getProperty('OWNER_TELEGRAM_CHAT_ID'));
  Logger.log('✅ DME_TELEGRAM_CHAT_ID   = ' + props.getProperty('DME_TELEGRAM_CHAT_ID'));

  var tok = props.getProperty('TELEGRAM_BOT_TOKEN');
  Logger.log('✅ TELEGRAM_BOT_TOKEN set, starts with: ' + (tok ? tok.substring(0, 25) + '…' : '(not set)'));
  Logger.log('Total properties: ' + props.getKeys().length);
}
function testSendTelegramToOwnerAndDme() {
  var msg = '✅ Verification test — ' + new Date().toISOString();
  var ownerOk = sendTelegramAlert(msg);
  var dmeOk = sendDmeTelegramAlert_(msg);
  Logger.log('Owner send: ' + (ownerOk ? '✅' : '❌'));
  Logger.log('DME send:   ' + (dmeOk ? '✅' : '❌'));
}
function countRegisteredSupervisors() {
  var ss = SpreadsheetApp.openById('1GHdhrRtOhQFshsAOCK4n3GiJp-6a03k8bn0V_M04wSY');
  var sh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!sh) { Logger.log('SUPERVISOR_MAP not found'); return; }

  var data = sh.getDataRange().getValues();
  var registered = [];
  var pending = [];

  for (var i = 1; i < data.length; i++) {
    var dept = (data[i][0] || '').toString().trim();
    var name = (data[i][1] || '').toString().trim();
    var chatId = (data[i][3] || '').toString().trim();

    if (!dept || !name) continue;
    if (/^_+$/.test(name)) continue;

    if (/^-?\d+$/.test(chatId)) {
      registered.push(dept + ' — ' + name + ' (' + chatId + ')');
    } else {
      pending.push(dept + ' — ' + name);
    }
  }

  Logger.log('═══════════════════════════════════');
  Logger.log('REGISTERED: ' + registered.length);
  Logger.log('═══════════════════════════════════');
  registered.forEach(function(r) { Logger.log('  ✅ ' + r); });

  Logger.log('');
  Logger.log('═══════════════════════════════════');
  Logger.log('PENDING: ' + pending.length);
  Logger.log('═══════════════════════════════════');
  pending.forEach(function(p) { Logger.log('  ⏳ ' + p); });
}
function currentWeekRegistrationStatus() {
  var ss = SpreadsheetApp.openById('1GHdhrRtOhQFshsAOCK4n3GiJp-6a03k8bn0V_M04wSY');
  var sh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!sh) { Logger.log('SUPERVISOR_MAP not found'); return; }

  // Find current week
  var today = new Date();
  var dow = today.getDay();                       // Sat=6, Sun=0
  var back = (dow + 1) % 7;                       // days to subtract for Saturday
  var sat = new Date(today);
  sat.setDate(sat.getDate() - back);
  var thu = new Date(sat);
  thu.setDate(thu.getDate() + 5);                 // Sat + 5 = Thursday

  var satStr = Utilities.formatDate(sat, 'Asia/Kolkata', 'yyyy-MM-dd');
  var thuStr = Utilities.formatDate(thu, 'Asia/Kolkata', 'yyyy-MM-dd');

  Logger.log('Current week: ' + satStr + ' → ' + thuStr);

  var data = sh.getDataRange().getValues();
  var registered = [], pending = [];

  for (var i = 1; i < data.length; i++) {
    var dept = (data[i][0] || '').toString().trim();
    var name = (data[i][1] || '').toString().trim();
    var chatId = (data[i][3] || '').toString().trim();
    var weekStart = data[i][4];
    var weekEnd = data[i][5];

    if (!dept || !name) continue;
    if (/^_+$/.test(name)) continue;

    var startStr = weekStart
      ? Utilities.formatDate(new Date(weekStart), 'Asia/Kolkata', 'yyyy-MM-dd')
      : '';
    var endStr = weekEnd
      ? Utilities.formatDate(new Date(weekEnd), 'Asia/Kolkata', 'yyyy-MM-dd')
      : '';

    if (startStr !== satStr) continue;             // only current week

    if (/^-?\d+$/.test(chatId)) {
      registered.push(dept + ' — ' + name + ' (' + chatId + ')');
    } else {
      pending.push(dept + ' — ' + name);
    }
  }

  Logger.log('');
  Logger.log('═══════════════════════════════════');
  Logger.log('CURRENT WEEK REGISTERED: ' + registered.length);
  Logger.log('═══════════════════════════════════');
  registered.forEach(function(r) { Logger.log('  ✅ ' + r); });

  Logger.log('');
  Logger.log('═══════════════════════════════════');
  Logger.log('CURRENT WEEK PENDING: ' + pending.length);
  Logger.log('═══════════════════════════════════');
  pending.forEach(function(p) { Logger.log('  ⏳ ' + p); });
}
function testFullDMEAlertFormat() {
  var now = new Date();
  var dateStr = Utilities.formatDate(now, 'Asia/Kolkata', 'dd-MMM-yyyy');
  var timeStr = Utilities.formatDate(now, 'Asia/Kolkata', 'hh:mm a');

  // Sample missing list — three real departments, mimicking an actual alert
  var testMissing = [
    { department: 'Cutting',  supervisor: 'Darshan Alhat', phone: '7972356441', chatId: '' },
    { department: 'Forge',    supervisor: 'Subhash Palve', phone: '9689919783', chatId: '' },
    { department: 'Press',    supervisor: 'Vaibhav Mali',  phone: '9607238428', chatId: '' }
  ];

  var msg = '🚨 TEST — DME ALERT Format Check\n';
  msg += '📅 ' + dateStr + ' | ⏰ ' + timeStr + '\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  msg += '🔴 MISSING DEPARTMENTS (' + testMissing.length + '):\n';
  msg += buildMissingListText_(testMissing, false) + '\n\n';
  msg += '📋 DME ACTION:\n';
  msg += '  ✅ Call supervisors listed above\n';
  msg += '  🔗 Dashboard: ' + ScriptApp.getService().getUrl();

  Logger.log('Message length: ' + msg.length + ' chars');
  Logger.log('--- MESSAGE PREVIEW ---');
  Logger.log(msg);

  var ownerOk = sendTelegramAlert(msg);
  var dmeOk = sendDmeTelegramAlert_(msg);

  Logger.log('---');
  Logger.log('Owner send: ' + (ownerOk ? '✅' : '❌'));
  Logger.log('DME send:   ' + (dmeOk ? '✅' : '❌'));
  Logger.log('Both phones should receive this test.');
}
function migrateSupervisorMapAddRoleColumn() {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!sh) { Logger.log('SUPERVISOR_MAP not found'); return; }

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();

  // Check if Role header already exists
  var header = sh.getRange(1, 1, 1, Math.max(lastCol, 8)).getValues()[0];
  var roleIdx = header.indexOf('Role');
  if (roleIdx >= 0) {
    Logger.log('ℹ️ Role column already present at position ' + (roleIdx + 1));
  } else {
    roleIdx = lastCol;   // append after last column
    sh.getRange(1, roleIdx + 1).setValue('Role')
      .setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
    Logger.log('✅ Added Role header at column ' + (roleIdx + 1));
  }

  // Default every existing data row to 'Supervisor'
  if (lastRow >= 2) {
    var roles = [];
    for (var i = 2; i <= lastRow; i++) {
      var cur = sh.getRange(i, roleIdx + 1).getValue();
      roles.push([cur || 'Supervisor']);
    }
    sh.getRange(2, roleIdx + 1, roles.length, 1).setValues(roles);
    Logger.log('✅ Set ' + roles.length + ' rows to default role.');
  }

  // Special case: Ashok Kumar is both
  var data = sh.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    var name = (data[r][1] || '').toString().trim().toLowerCase();
    if (name === 'ashok kumar' || name === 'ashok kumar sharma') {
      sh.getRange(r + 1, roleIdx + 1).setValue('Both');
      Logger.log('✅ Set Ashok Kumar (row ' + (r+1) + ') to role: Both');
    }
  }

  Logger.log('=== Migration complete ===');
}
function testShiftConfigPhase1() {
  // Test 1: default 3-shift for non-Cutting
  var d1 = getShiftDeadlineDateTime_('Shift 1', new Date(2026, 8, 17), 'Forge');
  Logger.log('Forge Shift 1 deadline: ' + Utilities.formatDate(d1, 'Asia/Kolkata', 'dd-MMM HH:mm'));
  // Expect: 17-Sep 16:30

  // Test 2: Cutting Shift 1 (day, deadline same day 20:00)
  var d2 = getShiftDeadlineDateTime_('Shift 1', new Date(2026, 8, 17), 'Cutting');
  Logger.log('Cutting Shift 1 deadline: ' + Utilities.formatDate(d2, 'Asia/Kolkata', 'dd-MMM HH:mm'));
  // Expect: 17-Sep 20:00

  // Test 3: Cutting Shift 2 (night, deadline next day 08:00)
  var d3 = getShiftDeadlineDateTime_('Shift 2', new Date(2026, 8, 17), 'Cutting');
  Logger.log('Cutting Shift 2 deadline: ' + Utilities.formatDate(d3, 'Asia/Kolkata', 'dd-MMM HH:mm'));
  // Expect: 18-Sep 08:00

  // Test 4: Cutting shift list
  Logger.log('Cutting shifts: ' + getShiftListForDept_('Cutting').join(', '));
  // Expect: Shift 1, Shift 2

  // Test 5: Forge shift list
  Logger.log('Forge shifts: ' + getShiftListForDept_('Forge').join(', '));
  // Expect: Shift 1, Shift 2, Shift 3
}
// ============================================================
// PHASE 2: Recipient helpers
// ============================================================

function getCurrentWeekRowsForDept_(dept) {
  var ss = SpreadsheetApp.openById(DASH_ID);
  var sh = ss.getSheetByName('SUPERVISOR_MAP');
  if (!sh) return [];

  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var roleIdx = headers.indexOf('Role');
  if (roleIdx < 0) roleIdx = 7;   // fallback: column H

  var today = new Date();
  var dow = today.getDay();
  var back = (dow + 1) % 7;
  var sat = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
  var satStr = Utilities.formatDate(sat, 'Asia/Kolkata', 'yyyy-MM-dd');

  var out = [];
  for (var i = 1; i < data.length; i++) {
    var rowDept = (data[i][0] || '').toString().trim();
    if (rowDept !== dept) continue;

    var active = (data[i][6] || '').toString().trim().toUpperCase();
    if (active !== 'YES') continue;

    var weekStart = data[i][4];
    if (!weekStart) continue;
    var wsStr = Utilities.formatDate(new Date(weekStart), 'Asia/Kolkata', 'yyyy-MM-dd');
    if (wsStr !== satStr) continue;

    var name = (data[i][1] || '').toString().trim();
    if (!name || /^_+$/.test(name) || name.toLowerCase() === 'unknown') continue;

    out.push({
      name: name,
      phone: (data[i][2] || '').toString().trim(),
      chatId: (data[i][3] || '').toString().trim(),
      department: rowDept,
      role: (data[i][roleIdx] || 'Supervisor').toString().trim()
    });
  }
  return out;
}

function buildRecipientList_(missing, roleFilter) {
  var seen = {};
  var list = [];
  missing.forEach(function(m) {
    getCurrentWeekRowsForDept_(m.department).forEach(function(r) {
      if (roleFilter === 'supervisor' && r.role !== 'Supervisor' && r.role !== 'Both') return;
      if (roleFilter === 'manager' && r.role !== 'Manager' && r.role !== 'Both') return;
      if (!r.chatId || !/^-?\d+$/.test(r.chatId)) return;
      if (seen[r.chatId]) return;
      seen[r.chatId] = true;
      list.push(r);
    });
  });
  return list;
}

function dedupeByChatId_(arr) {
  var seen = {};
  var out = [];
  arr.forEach(function(r) {
    if (!r.chatId || seen[r.chatId]) return;
    seen[r.chatId] = true;
    out.push(r);
  });
  return out;
}

function findDeptsInWindow_(windowType) {
  // windowType: 'reminder' | 'deadline' | 'followup'
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var yesterday = new Date(today.getTime() - 86400000);

  var results = [];

  DEPARTMENTS.forEach(function(dept) {
    getShiftListForDept_(dept).forEach(function(shift) {
      [today, yesterday].forEach(function(shiftDate) {
        var dl = getShiftDeadlineDateTime_(shift, shiftDate, dept);
        if (!dl) return;
        var deltaMin = Math.round((dl.getTime() - now.getTime()) / 60000);

        var inWindow = false;
        if (windowType === 'reminder') inWindow = (deltaMin >= 0  && deltaMin <= 30);
        if (windowType === 'deadline') inWindow = (deltaMin <= 0  && deltaMin >= -90);
        if (windowType === 'followup') inWindow = (deltaMin <= -30 && deltaMin >= -180);

        if (inWindow) {
          results.push({
            dept: dept,
            shift: shift,
            shiftDate: shiftDate,
            deadline: dl,
            deltaMin: deltaMin
          });
        }
      });
    });
  });

  return results;
}
function testPhase2() {
  Logger.log('=== PHASE 2 TEST ===');
  Logger.log('');

  Logger.log('Current time (IST): ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM HH:mm'));
  Logger.log('');

  Logger.log('--- Recipient lists for Cutting ---');
  var cutRows = getCurrentWeekRowsForDept_('Cutting');
  cutRows.forEach(function(r) {
    Logger.log('  ' + r.name + ' | role=' + r.role + ' | chatId=' + (r.chatId || '(none)'));
  });

  Logger.log('');
  Logger.log('--- Recipient lists for Forge ---');
  var fgRows = getCurrentWeekRowsForDept_('Forge');
  fgRows.forEach(function(r) {
    Logger.log('  ' + r.name + ' | role=' + r.role + ' | chatId=' + (r.chatId || '(none)'));
  });

  Logger.log('');
  Logger.log('--- Shift lists ---');
  Logger.log('Cutting: ' + getShiftListForDept_('Cutting').join(', '));
  Logger.log('Forge:   ' + getShiftListForDept_('Forge').join(', '));

  Logger.log('');
  Logger.log('--- Deadline windows (what the trigger sees right now) ---');
  ['reminder', 'deadline', 'followup'].forEach(function(w) {
    var found = findDeptsInWindow_(w);
    if (found.length === 0) {
      Logger.log('  ' + w + ': none');
    } else {
      found.forEach(function(f) {
        Logger.log('  ' + w + ': ' + f.dept + ' ' + f.shift + ' | deltaMin=' + f.deltaMin);
      });
    }
  });

  Logger.log('');
  Logger.log('=== END ===');
}
