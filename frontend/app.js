
// ========= GLOBAL APP STATE =========
let appState = {
  originalData: [],
  cleanedData: [],
  filteredData: [],
  // Whether a filter is currently applied, tracked separately from
  // filteredData.length - a filter that correctly matches zero rows
  // must not be indistinguishable from "no filter applied" (which is
  // what checking filteredData.length > 0 alone would do).
  filtersActive: false,
  columnTypes: {},
  columnStats: {},
  fileName: "",
  fileSize: 0,
  isDataLoaded: false,
  chartInstances: {},
  activeFilters: {},
  numericFilterRanges: {},
  pendingWorkbook: null,
  previewSort: { sortCol: "", sortDir: "asc" },
  cleaningActions: {
    removedDuplicates: 0,
    filledMissing: 0,
    removedOutliers: 0,
    history: [],
    undoStack: []
  },
  currentInsights: null,
  quickInsights: []
};

document.addEventListener("DOMContentLoaded", () => {
  initializeFileUpload();
  initializePreviewTableEvents();
  initializeTheme();
  if (loadSession()) {
    document.getElementById("welcomeScreen").style.display = "none";
    document.getElementById("uploadArea").style.display = "none";
    document.getElementById("dataOverview").style.display = "block";
    renderAllSections();
    showToast("Restored your previous session.", "info");
  }
});

// ========= THEME =========
function initializeTheme() {
  const icon = document.getElementById("themeToggleIcon");
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (icon) icon.textContent = isDark ? "☀️" : "🌙";
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
  }
  try {
    localStorage.setItem("dv_theme", isDark ? "light" : "dark");
  } catch (e) {
    // localStorage unavailable - theme just won't persist
  }
  initializeTheme();
}

// ========= SESSION PERSISTENCE =========
const SESSION_KEY = "dv_session";
const SESSION_MAX_ROWS = 5000;

function saveSession() {
  if (!appState.isDataLoaded) return;
  if (appState.originalData.length > SESSION_MAX_ROWS) return;
  try {
    const snapshot = {
      fileName: appState.fileName,
      fileSize: appState.fileSize,
      originalData: appState.originalData,
      cleanedData: appState.cleanedData,
      columnTypes: appState.columnTypes,
      columnStats: appState.columnStats,
      cleaningActions: {
        removedDuplicates: appState.cleaningActions.removedDuplicates,
        filledMissing: appState.cleaningActions.filledMissing,
        removedOutliers: appState.cleaningActions.removedOutliers,
        history: appState.cleaningActions.history
      },
      currentInsights: appState.currentInsights,
      quickInsights: appState.quickInsights
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.warn("Could not save session", e);
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const snapshot = JSON.parse(raw);
    if (!snapshot || !snapshot.originalData || snapshot.originalData.length === 0) return false;

    appState.fileName = snapshot.fileName || "";
    appState.fileSize = snapshot.fileSize || 0;
    appState.originalData = snapshot.originalData;
    appState.cleanedData = snapshot.cleanedData;
    appState.columnTypes = snapshot.columnTypes || {};
    appState.columnStats = snapshot.columnStats || {};
    appState.cleaningActions = {
      removedDuplicates: snapshot.cleaningActions?.removedDuplicates || 0,
      filledMissing: snapshot.cleaningActions?.filledMissing || 0,
      removedOutliers: snapshot.cleaningActions?.removedOutliers || 0,
      history: snapshot.cleaningActions?.history || [],
      undoStack: []
    };
    appState.currentInsights = snapshot.currentInsights || null;
    appState.quickInsights = snapshot.quickInsights || [];
    appState.filteredData = [];
    appState.filtersActive = false;
    appState.activeFilters = {};
    appState.numericFilterRanges = {};
    appState.isDataLoaded = true;
    return true;
  } catch (e) {
    console.warn("Could not restore session", e);
    return false;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    // ignore
  }
}

// ========= NAVIGATION =========
function switchSection(e, sectionName) {
  if (e) e.preventDefault();

  document.querySelectorAll(".content-section").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(`section-${sectionName}`);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  const link = document.querySelector(`.nav-link[data-section="${sectionName}"]`);
  if (link) link.classList.add("active");

  closeMenu();
  window.scrollTo(0, 0);

  if (!appState.isDataLoaded) {
    if (sectionName !== "dashboard") {
      showToast("Please upload a dataset first.", "warning");
    }
    return;
  }

  if (sectionName === "visualizations") {
    setTimeout(initializeVisualizations, 20);
  } else if (sectionName === "insights") {
    setTimeout(renderQuickInsights, 20);
  } else if (sectionName === "quality") {
    setTimeout(generateDataQuality, 20);
  }
}

function toggleMenu() {
  const menu = document.getElementById("navMenu");
  const hamburger = document.getElementById("hamburger");
  menu.classList.toggle("active");
  hamburger.classList.toggle("active");
  hamburger.setAttribute("aria-expanded", menu.classList.contains("active") ? "true" : "false");
}

function closeMenu() {
  document.getElementById("navMenu").classList.remove("active");
  const hamburger = document.getElementById("hamburger");
  hamburger.classList.remove("active");
  hamburger.setAttribute("aria-expanded", "false");
}

// ========= FILE UPLOAD =========
function initializeFileUpload() {
  const input = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  if (!input || !dropzone) return;

  dropzone.addEventListener("click", (e) => {
    if (e.target.tagName !== "INPUT") input.click();
  });

  input.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  });

  ["dragenter", "dragover"].forEach(ev => {
    dropzone.addEventListener(ev, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(ev => {
    dropzone.addEventListener(ev, e => {
      e.preventDefault();
      e.stopPropagation();
      if (ev === "drop") {
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
      }
      dropzone.classList.remove("dragover");
    });
  });
}

function showUploadArea() {
  document.getElementById("welcomeScreen").style.display = "none";
  document.getElementById("uploadArea").style.display = "block";
}

function resetUpload() {
  appState.originalData = [];
  appState.cleanedData = [];
  appState.filteredData = [];
  appState.filtersActive = false;
  appState.isDataLoaded = false;
  appState.fileName = "";
  appState.fileSize = 0;
  appState.activeFilters = {};
  appState.numericFilterRanges = {};
  appState.pendingWorkbook = null;
  appState.previewSort = { sortCol: "", sortDir: "asc" };
  appState.cleaningActions = { removedDuplicates: 0, filledMissing: 0, removedOutliers: 0, history: [], undoStack: [] };
  appState.currentInsights = null;
  appState.quickInsights = [];

  Object.keys(appState.chartInstances).forEach(id => {
    const inst = appState.chartInstances[id];
    if (inst && typeof inst.destroy === "function") inst.destroy();
  });
  appState.chartInstances = {};

  document.getElementById("welcomeScreen").style.display = "block";
  document.getElementById("uploadArea").style.display = "none";
  document.getElementById("dataOverview").style.display = "none";
  document.getElementById("fileInput").value = "";

  const sheetPicker = document.getElementById("sheetPicker");
  if (sheetPicker) sheetPicker.style.display = "none";
  const searchInput = document.getElementById("previewSearch");
  if (searchInput) searchInput.value = "";

  const generated = document.getElementById("generatedInsights");
  if (generated) generated.style.display = "none";

  clearSession();
  showToast("Ready for a new upload.", "info");
}

function processFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!CONFIG.FILE_UPLOAD.ALLOWED_FORMATS.includes(ext)) {
    showToast("Unsupported file type. Use CSV / Excel.", "error");
    return;
  }
  if (file.size > CONFIG.FILE_UPLOAD.MAX_FILE_SIZE_BYTES) {
    showToast(`File too large (${CONFIG.FILE_UPLOAD.MAX_FILE_SIZE_MB}MB max).`, "error");
    return;
  }

  appState.fileName = file.name;
  appState.fileSize = file.size;
  // Starting a new upload invalidates any in-progress multi-sheet
  // picker flow from a previous, abandoned upload - otherwise a stale
  // confirmSheetSelection() call could overwrite this new dataset
  // with sheet data from the earlier, unrelated workbook.
  appState.pendingWorkbook = null;

  const progressDiv = document.getElementById("uploadProgress");
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");
  const sheetPicker = document.getElementById("sheetPicker");
  if (sheetPicker) sheetPicker.style.display = "none";

  if (progressDiv) progressDiv.style.display = "block";
  if (progressText) progressText.textContent = "Reading file...";
  if (progressFill) progressFill.style.width = "20%";

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      if (progressText) progressText.textContent = "Parsing data...";
      if (progressFill) progressFill.style.width = "60%";

      if (ext === "csv") {
        finalizeUpload(parseCSV(e.target.result));
        return;
      }

      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });

      if (wb.SheetNames.length > 1) {
        appState.pendingWorkbook = wb;
        if (progressDiv) progressDiv.style.display = "none";
        const sheetSelect = document.getElementById("sheetSelect");
        sheetSelect.innerHTML = wb.SheetNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
        if (sheetPicker) sheetPicker.style.display = "block";
        showToast("Multiple sheets found - pick one to load.", "info");
        return;
      }

      const sheet = wb.Sheets[wb.SheetNames[0]];
      finalizeUpload(recordsFromSheet(sheet));
    } catch (err) {
      console.error(err);
      showToast("Error parsing file: " + err.message, "error");
      if (progressDiv) progressDiv.style.display = "none";
    }
  };

  reader.onerror = () => {
    showToast("Error reading file.", "error");
    if (progressDiv) progressDiv.style.display = "none";
  };

  if (ext === "csv") {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
}

function confirmSheetSelection() {
  const wb = appState.pendingWorkbook;
  const sheetSelect = document.getElementById("sheetSelect");
  if (!wb || !sheetSelect || !sheetSelect.value) return;

  const sheet = wb.Sheets[sheetSelect.value];
  const jsonData = recordsFromSheet(sheet);
  appState.pendingWorkbook = null;

  const sheetPicker = document.getElementById("sheetPicker");
  if (sheetPicker) sheetPicker.style.display = "none";
  const progressDiv = document.getElementById("uploadProgress");
  if (progressDiv) progressDiv.style.display = "block";

  finalizeUpload(jsonData);
}

function finalizeUpload(jsonData) {
  const progressDiv = document.getElementById("uploadProgress");
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");

  if (!jsonData || jsonData.length === 0) {
    showToast("File is empty or has no valid rows.", "error");
    if (progressDiv) progressDiv.style.display = "none";
    return;
  }

  if (progressText) progressText.textContent = "Processing data...";
  if (progressFill) progressFill.style.width = "85%";

  appState.originalData = jsonData;
  appState.cleanedData = JSON.parse(JSON.stringify(jsonData));
  appState.filteredData = [];
  appState.filtersActive = false;
  appState.isDataLoaded = true;
  appState.activeFilters = {};
  appState.numericFilterRanges = {};
  appState.previewSort = { sortCol: "", sortDir: "asc" };
  appState.cleaningActions = { removedDuplicates: 0, filledMissing: 0, removedOutliers: 0, history: [], undoStack: [] };
  appState.currentInsights = null;

  detectColumnTypes(jsonData);
  computeColumnStats(jsonData);

  if (progressText) progressText.textContent = "Complete!";
  if (progressFill) progressFill.style.width = "100%";

  setTimeout(transitionToDataOverview, 400);
}

// ========= CSV PARSER (handles quoted fields, commas & newlines inside quotes) =========
function parseCSVLine(line) {
  const fields = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function parseCSVRows(text) {
  const rows = [];
  let row = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (row.trim().length > 0) rows.push(row);
      row = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      row += ch;
    }
  }
  if (row.trim().length > 0) rows.push(row);
  return rows;
}

function parseCSV(text) {
  const lines = parseCSVRows(text);
  if (lines.length === 0) return [];
  const headerRow = parseCSVLine(lines[0]).map(h => h.trim());
  const dataRows = lines.slice(1).map(line => parseCSVLine(line).map(v => v.trim()));
  return buildRecordsFromRows(headerRow, dataRows);
}

// Duplicate column names (e.g. a CSV/Excel export with two columns
// both literally named "name") would otherwise collide as the same
// object key, silently discarding every column but the last with
// that name. Auto-suffix duplicates the way Excel/pandas do instead.
function dedupeHeaders(headers) {
  const seen = new Map();
  return headers.map(h => {
    const name = String(h ?? "").trim() || "Column";
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name} (${count + 1})`;
  });
}

// Shared by both the CSV parser and the Excel sheet loader (which
// reads via {header:1} for the same dedup treatment) so duplicate
// headers and ragged rows are handled identically regardless of
// source format.
function buildRecordsFromRows(headerRow, dataRows) {
  const headers = dedupeHeaders(headerRow);
  return dataRows
    .map(cols => {
      const row = {};
      headers.forEach((h, idx) => {
        const v = cols[idx];
        row[h] = v === undefined || v === null ? "" : (typeof v === "string" ? v.trim() : v);
      });
      return row;
    })
    .filter(row => Object.values(row).some(v => v !== "" && v !== null && v !== undefined));
}

function recordsFromSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (rows.length === 0) return [];
  return buildRecordsFromRows(rows[0], rows.slice(1));
}

// ========= COLUMN TYPING & STATS =========

// plain parseFloat() misses extremely common real-world formatting -
// "$1,200.50", "1,234", "(500)" for a negative, "12%" - all of which
// a person would read as numbers on sight. Used for column type
// detection and every numeric aggregation/chart/filter; NOT used for
// display values, which keep their original formatting untouched.
function parseNumeric(v) {
  if (typeof v === "number") return v;
  if (v === null || v === undefined) return NaN;
  let s = String(v).trim();
  if (s === "") return NaN;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  s = s.replace(/[$€£¥₹,\s%]/g, "");
  if (s === "" || s === "-" || s === "+") return NaN;

  const n = Number(s);
  if (isNaN(n)) return NaN;
  return negative ? -n : n;
}

function detectColumnTypes(data) {
  if (!data || data.length === 0) return;
  const columns = Object.keys(data[0]);
  appState.columnTypes = {};

  columns.forEach(col => {
    const sample = data.slice(0, 100).map(row => row[col]).filter(v => v !== null && v !== undefined && v !== "");

    if (sample.length === 0) {
      appState.columnTypes[col] = "text";
      return;
    }

    const numericCount = sample.filter(v => isFinite(parseNumeric(v))).length;
    if (numericCount / sample.length > 0.8) {
      appState.columnTypes[col] = "numeric";
      return;
    }

    // Date.parse() is notoriously permissive (e.g. Date.parse("Item 0")
    // returns a valid timestamp in V8) - require an actual date-like
    // shape before trusting its verdict, or plain text columns get
    // misclassified as dates.
    const dateLikePattern = /^\d{1,4}[-/]\d{1,2}([-/]\d{1,4})?/;
    const dateCount = sample.filter(v => {
      const s = String(v).trim();
      return dateLikePattern.test(s) && !isNaN(Date.parse(s));
    }).length;
    if (dateCount / sample.length > 0.8) {
      appState.columnTypes[col] = "date";
      return;
    }

    const uniqueValues = new Set(sample);
    if (uniqueValues.size < 20 || uniqueValues.size / sample.length < 0.5) {
      appState.columnTypes[col] = "categorical";
      return;
    }

    appState.columnTypes[col] = "text";
  });
}

function getMedian(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getStdDev(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

function computeColumnStats(data) {
  if (!data || data.length === 0) return;
  appState.columnStats = {};

  Object.keys(data[0]).forEach(col => {
    const stats = {};
    const values = data.map(row => row[col]).filter(v => v !== "" && v !== null && v !== undefined);

    stats.nonNullCount = values.length;
    stats.nullCount = data.length - values.length;
    stats.uniqueCount = new Set(values).size;

    if (appState.columnTypes[col] === "numeric") {
      const numValues = values.map(v => parseNumeric(v)).filter(v => isFinite(v));
      if (numValues.length > 0) {
        stats.min = Math.min(...numValues);
        stats.max = Math.max(...numValues);
        stats.mean = numValues.reduce((a, b) => a + b, 0) / numValues.length;
        stats.median = getMedian(numValues);
        stats.stdDev = getStdDev(numValues);
      }
    }

    appState.columnStats[col] = stats;
  });
}

// ========= DATA OVERVIEW =========
function transitionToDataOverview() {
  document.getElementById("welcomeScreen").style.display = "none";
  document.getElementById("uploadArea").style.display = "none";
  document.getElementById("dataOverview").style.display = "block";

  const progressDiv = document.getElementById("uploadProgress");
  if (progressDiv) progressDiv.style.display = "none";

  renderAllSections();
  showToast("File uploaded successfully!", "success");
  saveSession();
}

function renderAllSections() {
  updateDashboardOverview();
  generateDataQuality();
  generateFilters();
  initializeVisualizations();
  renderQuickInsights();
}

function updateDashboardOverview() {
  const { fileName, fileSize, originalData } = appState;
  const rows = originalData.length;
  const cols = rows > 0 ? Object.keys(originalData[0]).length : 0;

  document.getElementById("statFileName").textContent = fileName || "-";
  animateCount(document.getElementById("statRows"), rows);
  animateCount(document.getElementById("statColumns"), cols);
  document.getElementById("statSize").textContent = formatFileSize(fileSize);

  const searchInput = document.getElementById("previewSearch");
  if (searchInput) searchInput.value = "";
  renderPreviewTable();
}

function animateCount(el, target, duration = 800) {
  if (!el) return;
  // Set the real value up front so it's always correct even if
  // requestAnimationFrame never fires (backgrounded/inactive tab) -
  // the loop below then animates over it when rAF does run.
  el.textContent = target.toLocaleString();
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(target * eased);
    el.textContent = value.toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = target.toLocaleString();
  }
  requestAnimationFrame(tick);
}

function formatFileSize(bytes) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

// ========= PREVIEW TABLE (search + sort + type badges) =========
function initializePreviewTableEvents() {
  const table = document.getElementById("dataPreviewTable");
  if (!table) return;

  table.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable");
    if (th && th.dataset.col) sortPreviewBy(th.dataset.col);
  });

  table.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const th = e.target.closest("th.sortable");
    if (th && th.dataset.col) {
      e.preventDefault();
      sortPreviewBy(th.dataset.col);
    }
  });
}

function sortPreviewBy(col) {
  if (appState.previewSort.sortCol === col) {
    appState.previewSort.sortDir = appState.previewSort.sortDir === "asc" ? "desc" : "asc";
  } else {
    appState.previewSort.sortCol = col;
    appState.previewSort.sortDir = "asc";
  }
  renderPreviewTable();
}

function renderPreviewTable() {
  const table = document.getElementById("dataPreviewTable");
  const countEl = document.getElementById("previewRowCount");
  if (!table) return;

  const rows = appState.originalData;
  if (!rows || rows.length === 0) {
    table.innerHTML = "<tr><td>No data to display</td></tr>";
    if (countEl) countEl.textContent = "";
    return;
  }

  const columns = Object.keys(rows[0]);
  const searchInput = document.getElementById("previewSearch");
  const search = (searchInput ? searchInput.value : "").trim().toLowerCase();

  let filtered = rows;
  if (search) {
    filtered = rows.filter(row => columns.some(col => String(row[col] ?? "").toLowerCase().includes(search)));
  }

  const { sortCol, sortDir } = appState.previewSort;
  if (sortCol) {
    filtered = [...filtered].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      const an = parseNumeric(av);
      const bn = parseNumeric(bv);
      let cmp;
      if (isFinite(an) && isFinite(bn) && String(av ?? "").trim() !== "" && String(bv ?? "").trim() !== "") {
        cmp = an - bn;
      } else {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  const shown = filtered.slice(0, 50);

  let html = "<thead><tr>";
  columns.forEach(col => {
    const isSorted = sortCol === col;
    const indicator = isSorted ? (sortDir === "asc" ? "▲" : "▼") : "";
    const type = appState.columnTypes[col] || "text";
    html += `<th class="sortable" tabindex="0" role="button" data-col="${escapeHtml(col)}" aria-sort="${isSorted ? (sortDir === "asc" ? "ascending" : "descending") : "none"}">${escapeHtml(col)}<span class="type-badge ${type}">${type}</span><span class="sort-indicator" aria-hidden="true">${indicator}</span></th>`;
  });
  html += "</tr></thead><tbody>";

  shown.forEach(row => {
    html += "<tr>";
    columns.forEach(col => { html += `<td>${escapeHtml(row[col])}</td>`; });
    html += "</tr>";
  });
  html += "</tbody>";
  table.innerHTML = html;

  if (countEl) {
    let text = `Showing ${shown.length.toLocaleString()} of ${filtered.length.toLocaleString()} rows`;
    if (search) text += ` (filtered from ${rows.length.toLocaleString()})`;
    countEl.textContent = text;
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value === null || value === undefined ? "" : String(value);
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ========= DATA HELPERS =========
function activeData() {
  return appState.filtersActive ? appState.filteredData : appState.cleanedData;
}

function findDuplicates(data) {
  const seen = new Set();
  let duplicates = 0;
  data.forEach(row => {
    const key = JSON.stringify(row);
    if (seen.has(key)) duplicates++;
    seen.add(key);
  });
  return duplicates;
}

function detectOutliersWithDetails(data, onlyColumn) {
  const outliers = {};
  const numericCols = onlyColumn
    ? [onlyColumn]
    : Object.keys(appState.columnTypes).filter(c => appState.columnTypes[c] === "numeric");

  numericCols.forEach(col => {
    const values = data.map(row => parseNumeric(row[col])).filter(v => isFinite(v));
    if (values.length < 4) return;

    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    const outlierValues = values.filter(v => v < lower || v > upper);
    if (outlierValues.length > 0) outliers[col] = outlierValues;
  });

  return outliers;
}

// ========= DATA QUALITY & CLEANING =========
function generateDataQuality() {
  const container = document.getElementById("qualityContainer");
  if (!container || !appState.isDataLoaded) return;

  const data = appState.cleanedData;
  if (!data || data.length === 0) {
    container.innerHTML = "<div class=\"card quality-block\"><p>No data loaded.</p></div>";
    return;
  }

  const columns = Object.keys(data[0]);
  const numericCols = columns.filter(c => appState.columnTypes[c] === "numeric");
  let missingCells = 0;
  const missingByColumn = [];
  columns.forEach(col => {
    const missing = data.filter(row => row[col] === "" || row[col] === null || row[col] === undefined).length;
    missingCells += missing;
    if (missing > 0) missingByColumn.push({ column: col, count: missing, pct: ((missing / data.length) * 100).toFixed(1) });
  });

  const duplicates = findDuplicates(data);
  const outliers = detectOutliersWithDetails(data);
  const totalCells = data.length * columns.length;
  const completeness = totalCells > 0 ? (((totalCells - missingCells) / totalCells) * 100).toFixed(1) : "100.0";

  let html = `
    <div class="card quality-block">
      <h3>Overview</h3>
      <div class="quality-summary-row">
        <div class="quality-summary-item"><div class="qty">${data.length.toLocaleString()}</div><div class="lbl">Rows</div></div>
        <div class="quality-summary-item"><div class="qty">${completeness}%</div><div class="lbl">Completeness</div></div>
        <div class="quality-summary-item"><div class="qty">${duplicates}</div><div class="lbl">Duplicate rows</div></div>
        <div class="quality-summary-item"><div class="qty">${Object.values(outliers).reduce((a, v) => a + v.length, 0)}</div><div class="lbl">Outlier values</div></div>
      </div>
    </div>

    <div class="card quality-block">
      <h3>Cleaning Actions</h3>
      <div class="cleaning-buttons">
        <button class="btn btn-primary" onclick="removeDuplicates()">Remove Duplicates (${appState.cleaningActions.removedDuplicates})</button>
        <button class="btn btn-primary" onclick="fillMissing()">Fill Missing Values (${appState.cleaningActions.filledMissing})</button>
        <button class="btn btn-secondary" onclick="undoLastCleaning()" ${appState.cleaningActions.undoStack.length === 0 ? "disabled" : ""}>↺ Undo Last Action</button>
      </div>
      <div class="cleaning-action-row" style="margin-bottom: 20px;">
        <select id="outlierColumnSelect" class="chart-select" aria-label="Column to remove outliers from" ${numericCols.length === 0 ? "disabled" : ""}>
          <option value="">All numeric columns</option>
          ${numericCols.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
        </select>
        <button class="btn btn-primary" onclick="removeOutliers(document.getElementById('outlierColumnSelect').value)" ${numericCols.length === 0 ? "disabled" : ""}>Remove Outliers (${appState.cleaningActions.removedOutliers})</button>
      </div>
  `;

  if (appState.cleaningActions.history.length > 0) {
    html += `<ul class="cleaning-history-list">${appState.cleaningActions.history.slice().reverse().map(h => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`;
  } else {
    html += `<p>No cleaning actions yet.</p>`;
  }
  html += `</div>`;

  if (missingByColumn.length > 0) {
    html += `
      <div class="card quality-block">
        <h3>Missing Values</h3>
        <div class="table-container" style="max-height: 300px;">
          <table class="data-table">
            <thead><tr><th>Column</th><th>Count</th><th>Percentage</th></tr></thead>
            <tbody>${missingByColumn.map(m => `<tr><td>${escapeHtml(m.column)}</td><td>${m.count}</td><td>${m.pct}%</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (Object.keys(outliers).length > 0) {
    html += `
      <div class="card quality-block">
        <h3>Outliers (IQR method)</h3>
        <div class="table-container" style="max-height: 300px;">
          <table class="data-table">
            <thead><tr><th>Column</th><th>Outlier Count</th></tr></thead>
            <tbody>${Object.keys(outliers).map(col => `<tr><td>${escapeHtml(col)}</td><td>${outliers[col].length}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function pushUndoSnapshot() {
  appState.cleaningActions.undoStack.push({
    cleanedData: JSON.parse(JSON.stringify(appState.cleanedData)),
    removedDuplicates: appState.cleaningActions.removedDuplicates,
    filledMissing: appState.cleaningActions.filledMissing,
    removedOutliers: appState.cleaningActions.removedOutliers
  });
}

function removeDuplicates() {
  pushUndoSnapshot();
  const before = appState.cleanedData.length;
  const seen = new Set();
  appState.cleanedData = appState.cleanedData.filter(row => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const removed = before - appState.cleanedData.length;
  appState.cleaningActions.removedDuplicates += removed;
  appState.cleaningActions.history.push(`Removed ${removed} duplicate rows.`);
  showToast(`Removed ${removed} duplicate rows.`, "success");
  computeColumnStats(appState.cleanedData);
  reapplyActiveFilters();
  generateDataQuality();
  saveSession();
}

function fillMissing() {
  const data = appState.cleanedData;
  if (!data || data.length === 0) return;
  pushUndoSnapshot();
  let filled = 0;

  Object.keys(data[0]).forEach(col => {
    if (appState.columnTypes[col] === "numeric") {
      const vals = data.map(r => parseNumeric(r[col])).filter(v => isFinite(v));
      if (vals.length === 0) return;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      data.forEach(row => {
        if (row[col] === "" || row[col] === null || row[col] === undefined) {
          row[col] = mean.toFixed(2);
          filled++;
        }
      });
    } else {
      const vals = data.map(r => r[col]).filter(v => v !== "" && v !== null && v !== undefined);
      const mode = vals.length > 0 ? vals[0] : "N/A";
      data.forEach(row => {
        if (row[col] === "" || row[col] === null || row[col] === undefined) {
          row[col] = mode;
          filled++;
        }
      });
    }
  });

  appState.cleaningActions.filledMissing += filled;
  appState.cleaningActions.history.push(`Filled ${filled} missing values.`);
  showToast(`Filled ${filled} missing values.`, "success");
  computeColumnStats(appState.cleanedData);
  reapplyActiveFilters();
  generateDataQuality();
  saveSession();
}

function removeOutliers(column) {
  const data = appState.cleanedData;
  if (!data || data.length === 0) return;
  pushUndoSnapshot();

  const targetColumn = column || null;
  const outliers = detectOutliersWithDetails(data, targetColumn);
  const outlierRowIndexes = new Set();

  Object.keys(outliers).forEach(col => {
    const values = data.map(row => parseNumeric(row[col])).filter(v => isFinite(v));
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    data.forEach((row, idx) => {
      const val = parseNumeric(row[col]);
      if (isFinite(val) && (val < lower || val > upper)) outlierRowIndexes.add(idx);
    });
  });

  const before = data.length;
  appState.cleanedData = data.filter((row, idx) => !outlierRowIndexes.has(idx));
  const removed = before - appState.cleanedData.length;

  appState.cleaningActions.removedOutliers += removed;
  appState.cleaningActions.history.push(
    targetColumn ? `Removed ${removed} outlier rows (column: ${targetColumn}).` : `Removed ${removed} outlier rows.`
  );
  showToast(`Removed ${removed} outlier rows.`, "success");
  computeColumnStats(appState.cleanedData);
  reapplyActiveFilters();
  generateDataQuality();
  saveSession();
}

function undoLastCleaning() {
  const snapshot = appState.cleaningActions.undoStack.pop();
  if (!snapshot) {
    showToast("Nothing to undo.", "warning");
    return;
  }
  appState.cleaningActions.history.pop();
  appState.cleanedData = snapshot.cleanedData;
  appState.cleaningActions.removedDuplicates = snapshot.removedDuplicates;
  appState.cleaningActions.filledMissing = snapshot.filledMissing;
  appState.cleaningActions.removedOutliers = snapshot.removedOutliers;
  showToast("Last cleaning action undone.", "info");
  computeColumnStats(appState.cleanedData);
  reapplyActiveFilters();
  generateDataQuality();
  saveSession();
}

// ========= FILTERS (categorical + numeric range) =========
const FILTER_SEARCH_THRESHOLD = 6;

function generateFilters() {
  const panel = document.getElementById("filtersPanel");
  const container = document.getElementById("filtersContainer2");
  const searchInput = document.getElementById("filterSearchInput");
  if (!panel || !container) return;

  const data = appState.cleanedData;
  const categoricalColumns = Object.keys(appState.columnTypes).filter(c => appState.columnTypes[c] === "categorical");
  const numericColumns = Object.keys(appState.columnTypes).filter(c => appState.columnTypes[c] === "numeric");
  const totalFilters = categoricalColumns.length + numericColumns.length;

  if (totalFilters === 0) {
    panel.style.display = "none";
    container.innerHTML = "";
    return;
  }

  panel.style.display = "block";

  if (searchInput) {
    searchInput.style.display = totalFilters > FILTER_SEARCH_THRESHOLD ? "block" : "none";
    searchInput.value = "";
  }

  let html = categoricalColumns.map(col => {
    const uniqueValues = [...new Set(data.map(row => row[col]).filter(v => v !== "" && v !== null && v !== undefined))].sort();
    return `
      <div class="control-group" data-filter-label="${escapeHtml(col.toLowerCase())}">
        <label title="${escapeHtml(col)}">${escapeHtml(col)}</label>
        <select data-role="filter-select" data-column="${escapeHtml(col)}" class="chart-select" aria-label="Filter by ${escapeHtml(col)}">
          <option value="">All</option>
          ${uniqueValues.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}
        </select>
      </div>
    `;
  }).join("");

  html += numericColumns.map(col => {
    const stats = appState.columnStats[col];
    const hasRange = stats && stats.min !== undefined && stats.max !== undefined;
    const rangeHint = hasRange ? `Range: ${formatNumberHint(stats.min)} – ${formatNumberHint(stats.max)}` : "";
    return `
      <div class="control-group" data-filter-label="${escapeHtml(col.toLowerCase())}">
        <label title="${escapeHtml(col)}">${escapeHtml(col)}</label>
        <div style="display:flex; gap:6px;">
          <input type="number" data-role="filter-min" data-column="${escapeHtml(col)}" class="chart-select" placeholder="Min" step="any" aria-label="Minimum ${escapeHtml(col)}">
          <input type="number" data-role="filter-max" data-column="${escapeHtml(col)}" class="chart-select" placeholder="Max" step="any" aria-label="Maximum ${escapeHtml(col)}">
        </div>
        ${rangeHint ? `<span class="filter-range-hint">${escapeHtml(rangeHint)}</span>` : ""}
      </div>
    `;
  }).join("");

  container.innerHTML = html;
}

// Column names are used as DOM lookup keys, but aren't safe as literal
// ids (duplicates, special characters) or CSS selector values without
// escaping - matching on a data-column attribute via exact string
// comparison sidesteps both problems entirely, including the case
// where two differently-named columns would otherwise collide once
// non-alphanumeric characters are stripped for an id.
function findByColumn(root, role, col) {
  return Array.from(root.querySelectorAll(`[data-role="${role}"]`)).find(el => el.dataset.column === col) || null;
}

function formatNumberHint(n) {
  return Math.abs(n - Math.round(n)) < 0.001 ? Math.round(n).toLocaleString() : n.toFixed(2);
}

function filterSidebarSearch() {
  const searchInput = document.getElementById("filterSearchInput");
  const container = document.getElementById("filtersContainer2");
  if (!searchInput || !container) return;
  const query = searchInput.value.trim().toLowerCase();
  const groups = container.querySelectorAll(".control-group");
  let visibleCount = 0;

  groups.forEach(group => {
    const matches = !query || (group.dataset.filterLabel || "").includes(query);
    group.style.display = matches ? "" : "none";
    if (matches) visibleCount++;
  });

  let emptyState = container.querySelector(".filters-empty-state");
  if (visibleCount === 0) {
    if (!emptyState) {
      emptyState = document.createElement("p");
      emptyState.className = "filters-empty-state";
      emptyState.textContent = "No columns match your search.";
      container.appendChild(emptyState);
    }
  } else if (emptyState) {
    emptyState.remove();
  }
}

function applyFiltersClick() {
  const categoricalColumns = Object.keys(appState.columnTypes).filter(c => appState.columnTypes[c] === "categorical");
  const numericColumns = Object.keys(appState.columnTypes).filter(c => appState.columnTypes[c] === "numeric");

  appState.activeFilters = {};
  appState.numericFilterRanges = {};

  const filterContainer = document.getElementById("filtersContainer2");

  categoricalColumns.forEach(col => {
    const select = findByColumn(filterContainer, "filter-select", col);
    if (select && select.value) appState.activeFilters[col] = select.value;
  });

  numericColumns.forEach(col => {
    const minInput = findByColumn(filterContainer, "filter-min", col);
    const maxInput = findByColumn(filterContainer, "filter-max", col);
    const min = minInput && minInput.value !== "" ? parseFloat(minInput.value) : null;
    const max = maxInput && maxInput.value !== "" ? parseFloat(maxInput.value) : null;
    if (min !== null || max !== null) appState.numericFilterRanges[col] = { min, max };
  });

  const hasFilters = reapplyActiveFilters();
  if (hasFilters) {
    showToast(`Filters applied — ${appState.filteredData.length.toLocaleString()} rows match.`, "success");
  } else {
    showToast("No filters selected — showing cleaned data.", "info");
  }

  initializeVisualizations();
  saveSession();
}

// Re-derives filteredData from the CURRENT cleanedData using whatever
// filters are already active in appState. Cleaning actions mutate
// cleanedData directly, so without this, a filter applied before a
// cleaning action would keep showing stale pre-cleaning rows in every
// chart and export that reads activeData(). Returns whether any
// filter is actually active.
function reapplyActiveFilters() {
  const hasFilters = Object.keys(appState.activeFilters).length > 0 || Object.keys(appState.numericFilterRanges).length > 0;
  appState.filtersActive = hasFilters;

  if (!hasFilters) {
    appState.filteredData = [];
    return false;
  }

  appState.filteredData = appState.cleanedData.filter(row => {
    const categoricalMatch = Object.keys(appState.activeFilters).every(col => row[col] === appState.activeFilters[col]);
    if (!categoricalMatch) return false;
    return Object.keys(appState.numericFilterRanges).every(col => {
      const val = parseNumeric(row[col]);
      if (!isFinite(val)) return false;
      const { min, max } = appState.numericFilterRanges[col];
      if (min !== null && val < min) return false;
      if (max !== null && val > max) return false;
      return true;
    });
  });
  return true;
}

function clearAllFilters() {
  document.querySelectorAll("#filtersContainer2 select").forEach(sel => { sel.value = ""; });
  document.querySelectorAll("#filtersContainer2 input[type=number]").forEach(inp => { inp.value = ""; });
  const searchInput = document.getElementById("filterSearchInput");
  if (searchInput) {
    searchInput.value = "";
    filterSidebarSearch();
  }
  appState.activeFilters = {};
  appState.numericFilterRanges = {};
  appState.filteredData = [];
  appState.filtersActive = false;
  showToast("Filters cleared.", "info");
  initializeVisualizations();
  saveSession();
}

function toggleFiltersPanel() {
  const content = document.getElementById("filtersContent");
  if (!content) return;
  const isHidden = content.style.display === "none";
  content.style.display = isHidden ? "block" : "none";
  const header = document.querySelector(".filters-header");
  if (header) header.setAttribute("aria-expanded", String(isHidden));
}

// ========= VISUALIZATIONS =========
function initializeVisualizations() {
  if (!appState.isDataLoaded || appState.cleanedData.length === 0) return;

  const columns = Object.keys(appState.cleanedData[0]);
  const categoricalCols = columns.filter(c => appState.columnTypes[c] === "categorical");
  const numericCols = columns.filter(c => appState.columnTypes[c] === "numeric");

  const noDataMsg = document.getElementById("noVisualizationsMessage");
  if (noDataMsg) noDataMsg.style.display = "none";

  ["categoricalSection", "numericSection", "pieSection", "comparisonSection", "heatmapSection"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "block";
  });

  fillSelect("categoricalColumnSelect", categoricalCols, "Choose a column...");
  fillSelect("pieColumnSelect", categoricalCols, "Choose a column...");
  fillSelect("numericColumnSelect", numericCols, "Choose a column...");
  fillSelect("xAxisSelect", columns, "Choose a column...");
  fillSelect("yAxisSelect", columns, "Choose a column...");
  fillSelect("groupBySelect", categoricalCols, "No grouping", true);

  document.getElementById("categoricalColumnSelect").disabled = categoricalCols.length === 0;
  document.getElementById("pieColumnSelect").disabled = categoricalCols.length === 0;
  document.getElementById("numericColumnSelect").disabled = numericCols.length === 0;

  if (categoricalCols.length > 0) renderCategoricalChart(categoricalCols[0]);
  else showChartEmptyState("categoricalChart", "No categorical columns detected in this dataset.");

  if (numericCols.length > 0) renderNumericChart(numericCols[0]);
  else showChartEmptyState("numericChart", "No numeric columns detected in this dataset.");

  if (categoricalCols.length > 0) renderPieChartViz(categoricalCols[0]);
  else showChartEmptyState("pieChart", "No categorical columns detected in this dataset.");

  if (numericCols.length >= 1 && columns.length >= 2) {
    const typeSelect = document.getElementById("comparisonChartType");
    const xSelect = document.getElementById("xAxisSelect");
    const ySelect = document.getElementById("yAxisSelect");

    if (numericCols.length >= 2) {
      // Two numeric columns make a numeric-vs-numeric scatter meaningful.
      typeSelect.value = "scatter";
      xSelect.value = numericCols[0];
      ySelect.value = numericCols[1];
    } else {
      // Only one numeric column: defaulting to scatter would need a
      // numeric X too, which - for a dataset whose first column is a
      // non-numeric id/name (extremely common) - silently plots zero
      // points with no explanation. A category-vs-number bar is what
      // this data actually supports.
      typeSelect.value = "bar";
      xSelect.value = columns.find(c => c !== numericCols[0]) || columns[0];
      ySelect.value = numericCols[0];
    }
    renderComparisonChart();
  } else {
    showChartEmptyState("comparisonChart", "Need at least one numeric column to compare.");
  }

  renderCorrelationHeatmap();
}

function showChartEmptyState(containerId, message) {
  const existing = appState.chartInstances[containerId];
  if (existing && typeof existing.destroy === "function") existing.destroy();
  delete appState.chartInstances[containerId];
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = `<div class="chart-empty-state">${escapeHtml(message)}</div>`;
}

function fillSelect(selectId, values, placeholder, keepPlaceholderValue) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` +
    values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if (!keepPlaceholderValue && values.includes(current)) select.value = current;
}

const CHART_COLORS = ["#B3D9FF", "#FFB3D9", "#B3FFD9", "#FFFAB3", "#D9B3FF", "#FFD9B3", "#7c3aed", "#2563eb", "#f59e0b", "#10b981"];

function ensureCanvas(containerId) {
  const container = document.getElementById(containerId);
  if (appState.chartInstances[containerId] && typeof appState.chartInstances[containerId].destroy === "function") {
    appState.chartInstances[containerId].destroy();
    delete appState.chartInstances[containerId];
  }
  container.innerHTML = `<canvas id="${containerId}Canvas"></canvas>`;
  return document.getElementById(`${containerId}Canvas`).getContext("2d");
}

function renderCategoricalChart(columnName) {
  if (!columnName) {
    showChartEmptyState("categoricalChart", "Choose a column to see its distribution.");
    return;
  }
  document.getElementById("categoricalColumnSelect").value = columnName;
  const data = activeData();
  const ctx = ensureCanvas("categoricalChart");

  const frequencies = {};
  data.forEach(row => {
    const value = String(row[columnName] ?? "N/A");
    frequencies[value] = (frequencies[value] || 0) + 1;
  });

  const labels = Object.keys(frequencies).slice(0, 30);

  appState.chartInstances.categoricalChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Count",
        data: labels.map(l => frequencies[l]),
        backgroundColor: CHART_COLORS,
        borderColor: "#1A1A1A",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderNumericChart(columnName) {
  if (!columnName) {
    showChartEmptyState("numericChart", "Choose a column to see its distribution.");
    return;
  }
  document.getElementById("numericColumnSelect").value = columnName;
  const data = activeData();

  const values = data.map(row => parseNumeric(row[columnName])).filter(v => isFinite(v));
  if (values.length === 0) {
    showChartEmptyState("numericChart", "No numeric values available for this column.");
    return;
  }

  const ctx = ensureCanvas("numericChart");
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = Math.max(1, Math.min(20, Math.ceil(Math.sqrt(values.length))));
  const binSize = (max - min) / binCount || 1;

  const bins = new Array(binCount).fill(0);
  const binLabels = [];
  for (let i = 0; i < binCount; i++) {
    const start = min + i * binSize;
    binLabels.push(start.toFixed(1));
  }
  values.forEach(v => {
    let idx = Math.floor((v - min) / binSize);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx]++;
  });

  appState.chartInstances.numericChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: binLabels,
      datasets: [{
        label: "Frequency",
        data: bins,
        backgroundColor: "rgba(16, 185, 129, 0.6)",
        borderColor: "#10b981",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
    }
  });
}

function renderPieChartViz(columnName) {
  if (!columnName) {
    showChartEmptyState("pieChart", "Choose a column to see its proportions.");
    return;
  }
  document.getElementById("pieColumnSelect").value = columnName;
  const data = activeData();
  const ctx = ensureCanvas("pieChart");

  const frequencies = {};
  data.forEach(row => {
    const value = String(row[columnName] ?? "N/A");
    frequencies[value] = (frequencies[value] || 0) + 1;
  });

  const labels = Object.keys(frequencies).slice(0, 12);

  appState.chartInstances.pieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{
        data: labels.map(l => frequencies[l]),
        backgroundColor: CHART_COLORS,
        borderColor: "#fff",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } }
    }
  });
}

function partitionByGroup(data, groupCol) {
  if (!groupCol) return { "": data };
  const groups = {};
  data.forEach(row => {
    const key = String(row[groupCol] ?? "N/A");
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  const keys = Object.keys(groups);
  if (keys.length > 8) {
    const kept = keys.slice(0, 7);
    const merged = { Other: [] };
    keys.slice(7).forEach(k => merged.Other.push(...groups[k]));
    const result = {};
    kept.forEach(k => { result[k] = groups[k]; });
    result.Other = merged.Other;
    return result;
  }
  return groups;
}

function renderComparisonChart() {
  const chartType = document.getElementById("comparisonChartType")?.value || "scatter";
  const xColumn = document.getElementById("xAxisSelect")?.value;
  const yColumn = document.getElementById("yAxisSelect")?.value;
  const groupBy = document.getElementById("groupBySelect")?.value;

  if (!xColumn || !yColumn) {
    showChartEmptyState("comparisonChart", "Choose both X and Y columns to compare.");
    return;
  }

  const data = activeData();
  const ctx = ensureCanvas("comparisonChart");
  const groups = partitionByGroup(data, groupBy);
  const groupKeys = Object.keys(groups);

  let chartConfig;

  if (chartType === "scatter") {
    chartConfig = {
      type: "scatter",
      data: {
        datasets: groupKeys.map((key, i) => ({
          label: groupBy ? key : `${yColumn} vs ${xColumn}`,
          data: groups[key].map(row => ({ x: parseNumeric(row[xColumn]), y: parseNumeric(row[yColumn]) }))
            .filter(p => isFinite(p.x) && isFinite(p.y)).slice(0, 500),
          backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
          borderColor: "#1A1A1A",
          pointRadius: 4
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: groupKeys.length > 1 || !!groupBy } },
        scales: { x: { grid: { color: "#e5e5e5" } }, y: { grid: { color: "#e5e5e5" } } }
      }
    };
  } else if (chartType === "line") {
    const allLabels = [...new Set(data.map(r => String(r[xColumn])))].sort().slice(0, 50);
    chartConfig = {
      type: "line",
      data: {
        labels: allLabels,
        datasets: groupKeys.map((key, i) => {
          const byX = {};
          groups[key].forEach(r => { byX[String(r[xColumn])] = parseNumeric(r[yColumn]) || 0; });
          return {
            label: groupBy ? key : yColumn,
            data: allLabels.map(l => byX[l] ?? null),
            borderColor: CHART_COLORS[i % CHART_COLORS.length],
            backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            spanGaps: true
          };
        })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: groupKeys.length > 1 || !!groupBy } },
        scales: { y: { beginAtZero: false } }
      }
    };
  } else {
    const allLabels = [...new Set(data.map(r => String(r[xColumn])))].slice(0, 30);
    chartConfig = {
      type: "bar",
      data: {
        labels: allLabels,
        datasets: groupKeys.map((key, i) => {
          const agg = {};
          groups[key].forEach(row => {
            const xVal = String(row[xColumn]);
            const yVal = parseNumeric(row[yColumn]);
            if (!isFinite(yVal)) return;
            if (!agg[xVal]) agg[xVal] = { sum: 0, count: 0 };
            agg[xVal].sum += yVal;
            agg[xVal].count++;
          });
          return {
            label: groupBy ? key : `Average ${yColumn}`,
            data: allLabels.map(l => agg[l] ? agg[l].sum / agg[l].count : 0),
            backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
            borderColor: "#1A1A1A",
            borderWidth: 2
          };
        })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: groupKeys.length > 1 || !!groupBy } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
      }
    };
  }

  appState.chartInstances.comparisonChart = new Chart(ctx, chartConfig);
}

// ========= CORRELATION HEATMAP =========
function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  if (n === 0) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function correlationColor(v) {
  const t = (v + 1) / 2;
  const c1 = [37, 99, 235];
  const c2 = [255, 255, 255];
  const c3 = [220, 38, 38];
  let r, g, b;
  if (t < 0.5) {
    const k = t / 0.5;
    r = c1[0] + (c2[0] - c1[0]) * k;
    g = c1[1] + (c2[1] - c1[1]) * k;
    b = c1[2] + (c2[2] - c1[2]) * k;
  } else {
    const k = (t - 0.5) / 0.5;
    r = c2[0] + (c3[0] - c2[0]) * k;
    g = c2[1] + (c3[1] - c2[1]) * k;
    b = c2[2] + (c3[2] - c2[2]) * k;
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function truncateLabel(s) {
  return s.length > 12 ? s.slice(0, 11) + "…" : s;
}

function renderCorrelationHeatmap() {
  const container = document.getElementById("heatmapChart");
  if (!container) return;

  const inst = appState.chartInstances.heatmapChart;
  if (inst && typeof inst.destroy === "function") inst.destroy();
  delete appState.chartInstances.heatmapChart;

  const numericCols = Object.keys(appState.columnTypes).filter(c => appState.columnTypes[c] === "numeric").slice(0, 10);
  if (numericCols.length < 2) {
    container.innerHTML = '<div class="chart-empty-state">Need at least 2 numeric columns for a correlation heatmap.</div>';
    return;
  }

  const data = activeData();
  const n = numericCols.length;
  const matrix = [];
  for (let i = 0; i < n; i++) {
    matrix.push([]);
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i].push(1);
        continue;
      }
      const pairs = data
        .map(r => [parseNumeric(r[numericCols[i]]), parseNumeric(r[numericCols[j]])])
        .filter(p => isFinite(p[0]) && isFinite(p[1]));
      matrix[i].push(pairs.length < 2 ? 0 : pearsonCorrelation(pairs.map(p => p[0]), pairs.map(p => p[1])));
    }
  }

  const cellSize = 70;
  const labelSpace = 130;
  const canvasWidth = labelSpace + n * cellSize + 20;
  const canvasHeight = labelSpace + n * cellSize + 20;

  container.innerHTML = '<div class="heatmap-wrapper"><canvas id="heatmapChartCanvas"></canvas></div>' +
    '<div class="heatmap-legend"><span>-1</span><div class="heatmap-legend-gradient"></div><span>+1</span></div>';

  const canvas = document.getElementById("heatmapChartCanvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.font = "11px Inter, monospace";
  ctx.fillStyle = "#1A1A1A";

  for (let i = 0; i < n; i++) {
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1A1A1A";
    ctx.fillText(truncateLabel(numericCols[i]), labelSpace - 8, labelSpace + i * cellSize + cellSize / 2);
  }

  for (let j = 0; j < n; j++) {
    ctx.save();
    ctx.translate(labelSpace + j * cellSize + cellSize / 2, labelSpace - 8);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1A1A1A";
    ctx.fillText(truncateLabel(numericCols[j]), 0, 0);
    ctx.restore();
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const val = matrix[i][j];
      const x = labelSpace + j * cellSize;
      const y = labelSpace + i * cellSize;
      ctx.fillStyle = correlationColor(val);
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.strokeStyle = "#1A1A1A";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cellSize, cellSize);
      ctx.fillStyle = Math.abs(val) > 0.6 ? "#ffffff" : "#1A1A1A";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "12px Inter, monospace";
      ctx.fillText(val.toFixed(2), x + cellSize / 2, y + cellSize / 2);
    }
  }

  appState.chartInstances.heatmapChart = { toBase64Image: () => canvas.toDataURL("image/png") };
}

function downloadChartImage(containerId) {
  const chart = appState.chartInstances[containerId];
  if (!chart || typeof chart.toBase64Image !== "function") {
    showToast("Render a chart first.", "warning");
    return;
  }
  const a = document.createElement("a");
  a.href = chart.toBase64Image();
  a.download = `${containerId}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Bridges a specific chart to the AI Insights flow: pre-fills a focused
// question so the user only has to click Generate, instead of the AI
// panel being a disconnected page from what they're actually looking at.
function askAIAboutChart(containerId, chartTitle) {
  if (!appState.isDataLoaded) {
    showToast("Upload a dataset first.", "warning");
    return;
  }

  const columnHints = {
    categoricalChart: () => document.getElementById("categoricalColumnSelect")?.value,
    numericChart: () => document.getElementById("numericColumnSelect")?.value,
    pieChart: () => document.getElementById("pieColumnSelect")?.value,
    comparisonChart: () => {
      const x = document.getElementById("xAxisSelect")?.value;
      const y = document.getElementById("yAxisSelect")?.value;
      return x && y ? `${x} vs ${y}` : "";
    },
    heatmapChart: () => "the numeric columns"
  };
  const columnHint = columnHints[containerId] ? columnHints[containerId]() : "";

  const prompt = columnHint
    ? `Explain the "${chartTitle}" chart (${columnHint}): what patterns, trends, or anomalies stand out, and what should I do about them?`
    : `Explain the "${chartTitle}" chart: what patterns, trends, or anomalies stand out, and what should I do about them?`;

  switchSection(null, "insights");
  const textarea = document.getElementById("insightsRequest");
  if (textarea) {
    textarea.value = prompt;
    textarea.focus();
  }
  showToast("Question ready — click Generate Insights.", "info");
}

// ========= MARKDOWN RENDERING =========
function inlineMarkdown(text) {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
  return escaped;
}

function renderMarkdown(text) {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  let html = "";
  let listType = null;
  let paragraphBuffer = [];

  function flushParagraph() {
    if (paragraphBuffer.length > 0) {
      html += `<p>${inlineMarkdown(paragraphBuffer.join(" "))}</p>`;
      paragraphBuffer = [];
    }
  }
  function closeList() {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  }

  lines.forEach(rawLine => {
    const line = rawLine.trim();
    if (line === "") {
      flushParagraph();
      closeList();
      return;
    }

    let m;
    if ((m = line.match(/^###\s+(.*)$/))) { flushParagraph(); closeList(); html += `<h4>${inlineMarkdown(m[1])}</h4>`; return; }
    if ((m = line.match(/^##\s+(.*)$/))) { flushParagraph(); closeList(); html += `<h3>${inlineMarkdown(m[1])}</h3>`; return; }
    if ((m = line.match(/^#\s+(.*)$/))) { flushParagraph(); closeList(); html += `<h2>${inlineMarkdown(m[1])}</h2>`; return; }

    if ((m = line.match(/^[-*]\s+(.*)$/))) {
      flushParagraph();
      if (listType !== "ul") { closeList(); html += "<ul>"; listType = "ul"; }
      html += `<li>${inlineMarkdown(m[1])}</li>`;
      return;
    }
    if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      flushParagraph();
      if (listType !== "ol") { closeList(); html += "<ol>"; listType = "ol"; }
      html += `<li>${inlineMarkdown(m[1])}</li>`;
      return;
    }

    closeList();
    paragraphBuffer.push(line);
  });
  flushParagraph();
  closeList();
  return html;
}

// ========= AI INSIGHTS =========
function renderQuickInsights() {
  if (!appState.isDataLoaded) return;
  const data = activeData();
  const columns = Object.keys(data[0] || {});
  const numericCols = columns.filter(c => appState.columnTypes[c] === "numeric");
  const insights = [];

  insights.push({
    icon: "📊",
    title: "Dataset Overview",
    description: `${data.length.toLocaleString()} records × ${columns.length} columns`,
    type: "info"
  });

  let missingCells = 0;
  columns.forEach(col => {
    missingCells += data.filter(row => row[col] === "" || row[col] === null || row[col] === undefined).length;
  });
  const totalCells = data.length * columns.length;
  const completeness = totalCells > 0 ? ((totalCells - missingCells) / totalCells * 100).toFixed(1) : "100.0";
  insights.push({
    icon: completeness > 95 ? "✅" : "⚠️",
    title: "Data Completeness",
    description: `${completeness}% complete`,
    type: completeness > 95 ? "success" : "warning"
  });

  if (numericCols.length > 0) {
    const col = numericCols[0];
    const s = appState.columnStats[col];
    if (s && s.mean !== undefined) {
      insights.push({
        icon: "📈",
        title: `${col} Stats`,
        description: `Mean: ${s.mean.toFixed(2)}, Range: ${s.min.toFixed(2)} – ${s.max.toFixed(2)}`,
        type: "info"
      });
    }
  }

  const duplicates = findDuplicates(data);
  insights.push({
    icon: duplicates > 0 ? "⚠️" : "✅",
    title: "Duplicate Rows",
    description: duplicates > 0 ? `${duplicates} duplicate rows found` : "No duplicates detected",
    type: duplicates > 0 ? "warning" : "success"
  });

  appState.quickInsights = insights;

  const grid = document.getElementById("quickInsightsGrid");
  if (!grid) return;
  grid.innerHTML = "";
  insights.forEach(ins => {
    const card = document.createElement("div");
    card.className = `insight-card ${ins.type}`;
    card.innerHTML = `
      <div class="insight-icon">${ins.icon}</div>
      <h4>${escapeHtml(ins.title)}</h4>
      <p>${escapeHtml(ins.description)}</p>
    `;
    grid.appendChild(card);
  });
}

async function generateInsightsDocument() {
  if (!appState.isDataLoaded) {
    showToast("Upload a dataset first.", "warning");
    return;
  }

  const btn = document.getElementById("generateInsightsBtn");
  const promptInput = document.getElementById("insightsRequest");
  const userPrompt = promptInput ? promptInput.value.trim() : "";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Generating...';
  }

  try {
    const data = activeData();
    const payload = {
      question: userPrompt || "Give 3-5 business-relevant insights and risks for this dataset.",
      columns: Object.keys(data[0] || {}),
      sample_rows: data.slice(0, 200)
    };

    const res = await fetch(CONFIG.API.BASE_URL + CONFIG.API.INSIGHTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Backend error:", txt);
      showToast("Backend insights failed. Check server logs.", "error");
      return;
    }

    const json = await res.json();
    appState.currentInsights = json;

    const doc = document.getElementById("insightsDocumentContent");
    if (doc) doc.innerHTML = json.insights ? renderMarkdown(json.insights) : "(backend returned no insights text)";

    const dateEl = document.getElementById("insightsGeneratedDate");
    if (dateEl) dateEl.textContent = `Generated ${new Date().toLocaleString()}`;

    const card = document.getElementById("generatedInsights");
    if (card) card.style.display = "block";

    showToast("AI insights generated.", "success");
    saveSession();
  } catch (err) {
    console.error(err);
    showToast("Network error talking to backend.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "✓ Generate Insights";
    }
  }
}

// ========= EXPORTS =========
function exportFilteredData() {
  const data = activeData();
  if (!data || data.length === 0) {
    showToast("No data to export.", "warning");
    return;
  }
  downloadFile(convertToCSV(data), "datavizard_export.csv", "text/csv");
  showToast("Data exported as CSV.", "success");
}

function exportFilteredDataXLSX() {
  const data = activeData();
  if (!data || data.length === 0) {
    showToast("No data to export.", "warning");
    return;
  }
  const columns = Object.keys(data[0]);
  const wb = XLSX.utils.book_new();

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = autoColumnWidths(columns, data);
  XLSX.utils.book_append_sheet(wb, ws, "Data");

  if (appState.isDataLoaded) {
    const summaryRows = [
      ["DataVizard Export Summary"],
      [],
      ["Generated", new Date().toLocaleString()],
      ["File", appState.fileName],
      ["Rows exported", data.length],
      ["Columns", columns.length],
      [],
      ["Column", "Detected Type"]
    ];
    columns.forEach(col => summaryRows.push([col, appState.columnTypes[col] || "unknown"]));
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    summaryWs["!cols"] = [{ wch: 32 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
  }

  XLSX.writeFile(wb, "datavizard_export.xlsx");
  showToast("Data exported as XLSX (Data + Summary sheets).", "success");
}

function autoColumnWidths(columns, data) {
  const sample = data.slice(0, 200);
  return columns.map(col => {
    const maxLen = sample.reduce((max, row) => Math.max(max, String(row[col] ?? "").length), col.length);
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
  });
}

function padKV(key, value, width = 20) {
  return `  ${(key + ":").padEnd(width)}${value}`;
}

function exportSummary() {
  if (!appState.isDataLoaded) {
    showToast("Upload a dataset first.", "warning");
    return;
  }
  const data = appState.cleanedData;
  const columns = Object.keys(data[0] || {});
  const rule = "=".repeat(64);
  const sub = "-".repeat(64);
  const lines = [];

  lines.push(rule);
  lines.push("  DATAVIZARD - DATASET SUMMARY");
  lines.push(rule);
  lines.push("");
  lines.push(padKV("Generated", new Date().toLocaleString()));
  lines.push(padKV("File", appState.fileName || "(untitled)"));
  lines.push(padKV("File size", formatFileSize(appState.fileSize)));
  lines.push(padKV("Rows", data.length.toLocaleString()));
  lines.push(padKV("Columns", columns.length));
  lines.push("");

  lines.push(sub);
  lines.push("  DATA QUALITY");
  lines.push(sub);
  let missingCells = 0;
  columns.forEach(col => {
    missingCells += data.filter(row => row[col] === "" || row[col] === null || row[col] === undefined).length;
  });
  const totalCells = data.length * columns.length;
  const completeness = totalCells > 0 ? (((totalCells - missingCells) / totalCells) * 100).toFixed(1) : "100.0";
  const duplicates = findDuplicates(data);
  const outliers = detectOutliersWithDetails(data);
  const outlierValueCount = Object.values(outliers).reduce((a, v) => a + v.length, 0);
  lines.push(padKV("Completeness", `${completeness}%`));
  lines.push(padKV("Missing cells", missingCells.toLocaleString()));
  lines.push(padKV("Duplicate rows", duplicates.toLocaleString()));
  lines.push(padKV("Outlier values", outlierValueCount.toLocaleString()));
  lines.push("");

  lines.push(sub);
  lines.push("  COLUMN TYPES");
  lines.push(sub);
  const maxColLen = Math.max(...columns.map(c => c.length), 10);
  columns.forEach(col => lines.push(`  ${col.padEnd(maxColLen + 3)}${(appState.columnTypes[col] || "unknown").toUpperCase()}`));
  lines.push("");

  lines.push(sub);
  lines.push("  CLEANING LOG");
  lines.push(sub);
  if (appState.cleaningActions.history.length === 0) {
    lines.push("  (no cleaning actions performed)");
  } else {
    appState.cleaningActions.history.forEach((h, i) => lines.push(`  ${String(i + 1).padStart(2, " ")}. ${h}`));
  }
  lines.push("");

  lines.push(rule);
  lines.push("  Generated by DataVizard");
  lines.push(rule);

  downloadFile(lines.join("\n"), "datavizard_summary.txt", "text/plain");
  showToast("Summary exported.", "success");
}

function exportInsights() {
  if (!appState.isDataLoaded) {
    showToast("Upload a dataset first.", "warning");
    return;
  }
  const columns = Object.keys(appState.cleanedData[0] || {});
  const payload = {
    generatedAt: new Date().toISOString(),
    fileName: appState.fileName,
    dataset: {
      rowCount: appState.cleanedData.length,
      columnCount: columns.length,
      columnTypes: appState.columnTypes
    },
    cleaningLog: appState.cleaningActions.history,
    quickInsights: appState.quickInsights,
    aiInsights: appState.currentInsights || null
  };
  downloadFile(JSON.stringify(payload, null, 2), "datavizard_insights.json", "application/json");
  showToast("Insights exported.", "success");
}

function chartTitleFor(id) {
  const map = {
    categoricalChart: "Categorical Distribution",
    numericChart: "Numeric Distribution",
    pieChart: "Proportion Analysis",
    comparisonChart: "Variable Comparison",
    heatmapChart: "Correlation Heatmap"
  };
  return map[id] || id;
}

const PDF_BRAND = {
  pink: [255, 179, 217],
  blue: [179, 217, 255],
  green: [179, 255, 217],
  yellow: [255, 250, 179],
  dark: [26, 26, 26],
  muted: [110, 110, 110]
};

function stripInlineMarkdown(s) {
  return s.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
}

// Renders the same markdown structure as renderMarkdown(), but as
// styled jsPDF text (bold headers, indented bullets/numbers) instead
// of one flat wrapped paragraph - returns the y position to continue from.
function renderMarkdownToPDF(doc, text, x, startY, maxWidth, pageHeight, margin) {
  let y = startY;
  const lineHeight = 13;

  function ensureSpace() {
    if (y > pageHeight - 50) {
      doc.addPage();
      y = margin;
    }
  }

  text.split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.trim();
    if (!line) {
      y += 6;
      return;
    }

    let m;
    if ((m = line.match(/^#{1,6}\s+(.*)$/))) {
      ensureSpace();
      doc.setFont(undefined, "bold");
      doc.setFontSize(11.5);
      doc.setTextColor(...PDF_BRAND.dark);
      doc.splitTextToSize(stripInlineMarkdown(m[1]), maxWidth).forEach(l => {
        ensureSpace();
        doc.text(l, x, y);
        y += 15;
      });
      doc.setFont(undefined, "normal");
      doc.setFontSize(9.5);
      y += 3;
      return;
    }

    if ((m = line.match(/^[-*]\s+(.*)$/))) {
      doc.splitTextToSize(stripInlineMarkdown(m[1]), maxWidth - 14).forEach((l, idx) => {
        ensureSpace();
        doc.text(idx === 0 ? `•  ${l}` : `    ${l}`, x, y);
        y += lineHeight;
      });
      return;
    }

    if ((m = line.match(/^(\d+)\.\s+(.*)$/))) {
      doc.splitTextToSize(stripInlineMarkdown(m[2]), maxWidth - 20).forEach((l, idx) => {
        ensureSpace();
        doc.text(idx === 0 ? `${m[1]}. ${l}` : `    ${l}`, x, y);
        y += lineHeight;
      });
      return;
    }

    ensureSpace();
    doc.splitTextToSize(stripInlineMarkdown(line), maxWidth).forEach(l => {
      ensureSpace();
      doc.text(l, x, y);
      y += lineHeight;
    });
    y += 3;
  });

  return y;
}

function pdfSectionHeading(doc, text, x, y) {
  doc.setFont(undefined, "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PDF_BRAND.dark);
  doc.text(text, x, y);
  doc.setFont(undefined, "normal");
  doc.setFontSize(9.5);
}

async function exportPDFReport() {
  if (!appState.isDataLoaded) {
    showToast("Upload a dataset first.", "warning");
    return;
  }

  const btn = document.getElementById("exportPdfBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Generating PDF...";
  }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    // --- Branded header band ---
    doc.setFillColor(...PDF_BRAND.pink);
    doc.rect(0, 0, pageWidth, 76, "F");
    doc.setDrawColor(...PDF_BRAND.dark);
    doc.setLineWidth(2);
    doc.line(0, 76, pageWidth, 76);
    doc.setTextColor(...PDF_BRAND.dark);
    doc.setFont(undefined, "bold");
    doc.setFontSize(22);
    doc.text("DataVizard Report", margin, 42);
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    doc.text(`${appState.fileName || "(untitled)"}  •  Generated ${new Date().toLocaleString()}`, margin, 60);

    let y = 104;

    // --- Dataset overview table ---
    const cleanedData = appState.cleanedData;
    const columns = Object.keys(cleanedData[0] || {});
    let missingCells = 0;
    columns.forEach(col => {
      missingCells += cleanedData.filter(row => row[col] === "" || row[col] === null || row[col] === undefined).length;
    });
    const totalCells = cleanedData.length * columns.length;
    const completeness = totalCells > 0 ? (((totalCells - missingCells) / totalCells) * 100).toFixed(1) : "100.0";
    const duplicates = findDuplicates(cleanedData);

    pdfSectionHeading(doc, "Dataset Overview", margin, y);
    doc.autoTable({
      startY: y + 10,
      head: [["Metric", "Value"]],
      body: [
        ["Rows", cleanedData.length.toLocaleString()],
        ["Columns", columns.length],
        ["File size", formatFileSize(appState.fileSize)],
        ["Data completeness", `${completeness}%`],
        ["Duplicate rows", duplicates.toLocaleString()]
      ],
      theme: "grid",
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 6, lineColor: PDF_BRAND.dark, lineWidth: 0.75, textColor: PDF_BRAND.dark },
      headStyles: { fillColor: PDF_BRAND.blue, textColor: PDF_BRAND.dark, fontStyle: "bold" }
    });
    y = doc.lastAutoTable.finalY + 26;

    // --- Quick insights table ---
    if (appState.quickInsights.length > 0) {
      if (y > pageHeight - 100) {
        doc.addPage();
        y = margin;
      }
      pdfSectionHeading(doc, "Quick Insights", margin, y);
      doc.autoTable({
        startY: y + 10,
        head: [["Insight", "Detail"]],
        body: appState.quickInsights.map(ins => [ins.title, ins.description]),
        theme: "grid",
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 6, lineColor: PDF_BRAND.dark, lineWidth: 0.75, textColor: PDF_BRAND.dark },
        headStyles: { fillColor: PDF_BRAND.green, textColor: PDF_BRAND.dark, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 140, fontStyle: "bold" } }
      });
      y = doc.lastAutoTable.finalY + 26;
    }

    // --- AI-generated insights (real markdown structure, not one flat paragraph) ---
    if (appState.currentInsights && appState.currentInsights.insights) {
      if (y > pageHeight - 120) {
        doc.addPage();
        y = margin;
      }
      pdfSectionHeading(doc, "AI-Generated Insights", margin, y);
      y += 18;
      doc.setTextColor(...PDF_BRAND.dark);
      y = renderMarkdownToPDF(doc, appState.currentInsights.insights, margin, y, contentWidth, pageHeight, margin);
      y += 14;
    }

    // --- Cleaning log table ---
    if (appState.cleaningActions.history.length > 0) {
      if (y > pageHeight - 100) {
        doc.addPage();
        y = margin;
      }
      pdfSectionHeading(doc, "Cleaning Log", margin, y);
      doc.autoTable({
        startY: y + 10,
        head: [["#", "Action"]],
        body: appState.cleaningActions.history.map((h, i) => [i + 1, h]),
        theme: "grid",
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 6, lineColor: PDF_BRAND.dark, lineWidth: 0.75, textColor: PDF_BRAND.dark },
        headStyles: { fillColor: PDF_BRAND.yellow, textColor: PDF_BRAND.dark, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 24 } }
      });
    }

    // --- Charts, one per page ---
    const chartIds = ["categoricalChart", "numericChart", "pieChart", "comparisonChart", "heatmapChart"];
    chartIds.forEach(id => {
      const inst = appState.chartInstances[id];
      if (!inst || typeof inst.toBase64Image !== "function") return;
      try {
        const img = inst.toBase64Image();
        if (!img || !img.startsWith("data:image")) return;
        doc.addPage();
        pdfSectionHeading(doc, chartTitleFor(id), margin, margin + 10);
        const imgWidth = contentWidth;
        const imgHeight = imgWidth * 0.55;
        doc.addImage(img, "PNG", margin, margin + 24, imgWidth, imgHeight);
      } catch (chartErr) {
        console.warn(`Skipping ${id} in PDF report:`, chartErr);
      }
    });

    // --- Footer: page numbers on every page ---
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont(undefined, "normal");
      doc.setFontSize(8);
      doc.setTextColor(...PDF_BRAND.muted);
      doc.text(`DataVizard Report  •  Page ${i} of ${totalPages}`, margin, pageHeight - 20);
    }

    doc.save("datavizard_report.pdf");
    showToast("PDF report downloaded.", "success");
  } catch (err) {
    console.error(err);
    showToast("Could not generate PDF report.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Download PDF";
    }
  }
}

function convertToCSV(data) {
  if (!data || data.length === 0) return "";
  const columns = Object.keys(data[0]);
  let csv = columns.join(",") + "\n";
  data.forEach(row => {
    const line = columns.map(c => {
      const v = row[c] === undefined || row[c] === null ? "" : String(row[c]).replace(/"/g, '""');
      return `"${v}"`;
    }).join(",");
    csv += line + "\n";
  });
  return csv;
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========= TOASTS =========
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, CONFIG.UI.TOAST_DURATION_MS || 4000);
}
