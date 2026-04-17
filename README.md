# VFPL FACTORY OS — DEPLOYMENT GUIDE
**Built:** 17-Apr-2026 02:45 IST
**Files in this delivery:**
1. `index_17Apr2026_0245.html` — Greenfield dashboard (1,516 lines, 100 KB, single file)
2. `MANPOWER_PATCH_17Apr2026_0245.gs` — Apps Script fix for empty `manpower_summary`

---

## WHAT THIS DELIVERS

A complete greenfield rewrite of the VFPL Factory Operating System dashboard. All data flows from the existing Apps Script Web App (`doGet` → merged `DASHBOARD_CACHE` JSON). Zero calculations in HTML — pure presentation layer.

**16 tabs:** Today / MTD / WIP / Schedule / Outstanding / Steel / 57F4 / Electricity / Manpower / Oil / Transport / Alerts / Die Life / Dept Score / Margins (PIN) / FY Monthly.

---

## DEPLOY — 3 STEPS

### Step 1: Apply the Manpower patch (5 min — one-time)

1. Open the Dashboard Sheet: https://docs.google.com/spreadsheets/d/1GHdhrRtOhQFshsAOCK4n3GiJp-6a03k8bn0V_M04wSY/edit
2. Extensions → Apps Script
3. Scroll to the **end** of `Code.gs`
4. Paste the entire contents of `MANPOWER_PATCH_17Apr2026_0245.gs`
5. Save (Ctrl+S)
6. From the function dropdown, run `buildManpowerSummaryFromDaily()` once
7. Verify a `MANPOWER_SUMMARY` tab appears in the sheet with rows
8. Run `buildDashboardCache()` once to refresh the cache with manpower data

**Why this matters:** the existing script reads a `MANPOWER_SUMMARY` tab that doesn't exist. The patch builds it from `DAILY_MANPOWER` so the Manpower tab on the dashboard shows MTD averages, not blanks.

### Step 2: Deploy the HTML (3 min)

1. Open the GitHub repo: `erpvarsha-star/vfpl-dashboard-26-27`
2. Open `index.html` → Edit (pencil icon)
3. Delete all contents
4. Paste the entire contents of `index_17Apr2026_0245.html`
5. Commit changes
6. Wait 1-2 minutes for GitHub Pages
7. Open https://erpvarsha-star.github.io/vfpl-dashboard-26-27/

### Step 3: Verify (5 min)

The dashboard should load in ~2 seconds. Check each tab:

| Tab | What you should see |
|---|---|
| **Today / Last Day** | 5 KPI cards top, 4 production grids (Cut/Forge/Press/Machine) with TODAY (blue) + YESTERDAY (slate) sections, dept summary table, A+ priority material list, WIP snapshot strip |
| **Month to Date** | 10 KPI cards (turnover, own/JWK forged, dispatch, etc.), manpower table, top 10 producing machines bar chart |
| **WIP** | 4 KPI cards, full VF-wise WIP table |
| **Schedule** | 5 KPI cards, schedule table sorted A+ first, with Stock YES/NO column |
| **Outstanding** | 3 KPI cards (overdue / not due / total), customer table sorted by overdue |
| **Steel Stock** | 4 KPI cards, grade-wise table with status badges (🔴/🟡/🟢) |
| **57F4** | Vendor accordion — click to expand VF-level detail |
| **Electricity** | 3 KPI cards, dept-wise horizontal bars |
| **Manpower** | 4 KPI cards, dept table with Today vs Yesterday vs MTD Avg |
| **Oil** | 3 closing-stock KPI cards, 3-column ledger (Forge / HT / Zyc) |
| **Transport** | 4 KPI cards, monthly ledger with status badges |
| **Alerts** | High priority first, sorted by severity (RED → AMBER → YELLOW → GREEN) |
| **Die Life** | Running dies + completed runs history |
| **Dept Score** | Overall %, dept-wise compliance table |
| **Margins** | PIN-protected (`1234`), then 4 KPI cards + VF margin table sorted A+ first |
| **FY Monthly** | Full 28-column monthly table (April through March) |

---

## KEY ARCHITECTURE FEATURES

### Data flow
```
DASHBOARD_CACHE (4 cells)
    → doGet() merges → JSON
        → fetch(WEB_APP) every 60s
            → render(data) → DOM
```

### Auto-refresh
- 60-second background fetch (silent, no spinner)
- "Refresh" button in header for manual fetch
- Last-updated timestamp shown in header

### Error handling
- If fetch fails: red banner at top with retry message, dashboard keeps showing last data, button changes to "Retry"
- Empty arrays render as "No data" placeholder, not crashes
- All `.toFixed()` wrapped in safe `N()` cast — prevents string crash if cache returns string instead of number

### Responsive
- Desktop: full 5-column KPI grid, horizontal scrolling tables
- Tablet (≤1100px): KPIs collapse to 3-col, WIP strip stacks
- Mobile (≤680px): 2-col KPIs, simpler header

### PIN protection
- Margins tab shows lock screen until PIN `1234` entered
- Change PIN by editing `var OWNER_PIN = '1234';` in the JS section

---

## CONFIG TO CHANGE (if needed)

In the HTML file, near the top of the JS section:

```javascript
var WEB_APP = 'https://script.google.com/macros/s/.../exec';  // line ~744
var OWNER_PIN = '1234';                                        // line ~745
var REFRESH_MS = 60000;                                        // line ~746 (60 sec auto-refresh)
```

---

## KNOWN DATA QUALITY ISSUES (not HTML bugs — surface them to data owners)

1. **`elecByDept` empty for today** — meter names in `RAW_ELECTRICITY` don't match `CONFIG_METERS` mapping. DME to fix meter names or update `CONFIG_METERS`.
2. **Some `dept_score.grade` values come as numbers** like "973.3" instead of "A+". DEPT_SCORE formula issue; HTML shows the raw value with color coding.
3. **`_RAW_SALARY` and `_RAW_CONTRACTOR` are empty** — Deepak hasn't entered. MTD salary cost shows 0 until he does.
4. **CONFIG_METERS has one "Unmapped" meter** consuming 56,275 kWh — needs mapping.

---

## FILES BUILT BY DASHBOARDARCHITECT

```
index_17Apr2026_0245.html        (100 KB — single HTML file)
MANPOWER_PATCH_17Apr2026_0245.gs (4 KB — Apps Script add-on)
DEPLOY_README_17Apr2026_0245.md  (this file)
```
