
// ========= GLOBAL APP STATE =========
let appState = {
  originalData: [],
  cleanedData: [],
  filteredData: [],
  columnTypes: {},
  columnStats: {},
  fileName: "",
  fileSize: 0,
  isDataLoaded: false,
  chartInstances: {},
  activeFilters: {},
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
});

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
  document.getElementById("navMenu").classList.toggle("active");
  document.getElementById("hamburger").classList.toggle("active");
}

function closeMenu() {
  document.getElementById("navMenu").classList.remove("active");
  document.getElementById("hamburger").classList.remove("active");
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
  appState.isDataLoaded = false;
  appState.fileName = "";
  appState.fileSize = 0;
  appState.activeFilters = {};
  appState.cleaningActions = { removedDuplicates: 0, filledMissing: 0, removedOutliers: 0, history: [], undoStack: [] };
  appState.currentInsights = null;
  appState.quickInsights = [];

  Object.keys(appState.chartInstances).forEach(id => {
    if (appState.chartInstances[id]) appState.chartInstances[id].destroy();
  });
  appState.chartInstances = {};

  document.getElementById("welcomeScreen").style.display = "block";
  document.getElementById("uploadArea").style.display = "none";
  document.getElementById("dataOverview").style.display = "none";
  document.getElementById("fileInput").value = "";

  const generated = document.getElementById("generatedInsights");
  if (generated) generated.style.display = "none";

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

  const progressDiv = document.getElementById("uploadProgress");
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");

  if (progressDiv) progressDiv.style.display = "block";
  if (progressText) progressText.textContent = "Reading file...";
  if (progressFill) progressFill.style.width = "20%";

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      if (progressText) progressText.textContent = "Parsing data...";
      if (progressFill) progressFill.style.width = "60%";

      let jsonData;
      if (ext === "csv") {
        jsonData = parseCSV(e.target.result);
      } else {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        jsonData = XLSX.utils.sheet_to_json(sheet);
      }

      if (!jsonData || jsonData.length === 0) {
        throw new Error("File is empty or has no valid rows.");
      }

      if (progressText) progressText.textContent = "Processing data...";
      if (progressFill) progressFill.style.width = "85%";

      appState.originalData = jsonData;
      appState.cleanedData = JSON.parse(JSON.stringify(jsonData));
      appState.filteredData = [];
      appState.isDataLoaded = true;
      appState.activeFilters = {};
      appState.cleaningActions = { removedDuplicates: 0, filledMissing: 0, removedOutliers: 0, history: [], undoStack: [] };
      appState.currentInsights = null;

      detectColumnTypes(jsonData);
      computeColumnStats(jsonData);

      if (progressText) progressText.textContent = "Complete!";
      if (progressFill) progressFill.style.width = "100%";

      setTimeout(transitionToDataOverview, 400);
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
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] !== undefined ? cols[idx].trim() : "";
    });
    rows.push(row);
  }
  return rows;
}

// ========= COLUMN TYPING & STATS =========
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

    const numericCount = sample.filter(v => !isNaN(parseFloat(v)) && isFinite(v)).length;
    if (numericCount / sample.length > 0.8) {
      appState.columnTypes[col] = "numeric";
      return;
    }

    const dateCount = sample.filter(v => !isNaN(Date.parse(v))).length;
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
      const numValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
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
  const overview = document.getElementById("dataOverview");
  overview.style.display = "block";
  updateDashboardOverview();

  const progressDiv = document.getElementById("uploadProgress");
  if (progressDiv) progressDiv.style.display = "none";

  generateDataQuality();
  generateFilters();
  initializeVisualizations();
  renderQuickInsights();

  showToast("File uploaded successfully!", "success");
}

function updateDashboardOverview() {
  const { fileName, fileSize, originalData } = appState;
  const rows = originalData.length;
  const cols = rows > 0 ? Object.keys(originalData[0]).length : 0;

  document.getElementById("statFileName").textContent = fileName || "-";
  document.getElementById("statRows").textContent = rows.toLocaleString();
  document.getElementById("statColumns").textContent = cols.toLocaleString();
  document.getElementById("statSize").textContent = formatFileSize(fileSize);

  displayDataPreview(originalData);
}

function formatFileSize(bytes) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function displayDataPreview(rows) {
  const table = document.getElementById("dataPreviewTable");
  if (!table) return;

  if (!rows || rows.length === 0) {
    table.innerHTML = "<tr><td>No data to display</td></tr>";
    return;
  }

  const columns = Object.keys(rows[0]);
  let html = "<thead><tr>";
  columns.forEach(col => { html += `<th>${escapeHtml(col)}</th>`; });
  html += "</tr></thead><tbody>";

  rows.slice(0, 50).forEach(row => {
    html += "<tr>";
    columns.forEach(col => { html += `<td>${escapeHtml(row[col])}</td>`; });
    html += "</tr>";
  });
  html += "</tbody>";
  table.innerHTML = html;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value === null || value === undefined ? "" : String(value);
  return div.innerHTML;
}

// ========= DATA HELPERS =========
function activeData() {
  return appState.filteredData.length > 0 ? appState.filteredData : appState.cleanedData;
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

function detectOutliersWithDetails(data) {
  const outliers = {};
  const numericCols = Object.keys(appState.columnTypes).filter(c => appState.columnTypes[c] === "numeric");

  numericCols.forEach(col => {
    const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
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
        <button class="btn btn-primary" onclick="removeOutliers()">Remove Outliers (${appState.cleaningActions.removedOutliers})</button>
        <button class="btn btn-secondary" onclick="undoLastCleaning()" ${appState.cleaningActions.undoStack.length === 0 ? "disabled" : ""}>↺ Undo Last Action</button>
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
  generateDataQuality();
}

function fillMissing() {
  const data = appState.cleanedData;
  if (!data || data.length === 0) return;
  pushUndoSnapshot();
  let filled = 0;

  Object.keys(data[0]).forEach(col => {
    if (appState.columnTypes[col] === "numeric") {
      const vals = data.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
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
  generateDataQuality();
}

function removeOutliers() {
  const data = appState.cleanedData;
  if (!data || data.length === 0) return;
  pushUndoSnapshot();

  const outliers = detectOutliersWithDetails(data);
  const outlierRowIndexes = new Set();

  Object.keys(outliers).forEach(col => {
    const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    data.forEach((row, idx) => {
      const val = parseFloat(row[col]);
      if (!isNaN(val) && (val < lower || val > upper)) outlierRowIndexes.add(idx);
    });
  });

  const before = data.length;
  appState.cleanedData = data.filter((row, idx) => !outlierRowIndexes.has(idx));
  const removed = before - appState.cleanedData.length;

  appState.cleaningActions.removedOutliers += removed;
  appState.cleaningActions.history.push(`Removed ${removed} outlier rows.`);
  showToast(`Removed ${removed} outlier rows.`, "success");
  generateDataQuality();
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
  generateDataQuality();
}

// ========= FILTERS =========
function generateFilters() {
  const panel = document.getElementById("filtersPanel");
  const container = document.getElementById("filtersContainer2");
  if (!panel || !container) return;

  const data = appState.cleanedData;
  const categoricalColumns = Object.keys(appState.columnTypes).filter(c => appState.columnTypes[c] === "categorical");

  if (categoricalColumns.length === 0) {
    panel.style.display = "none";
    container.innerHTML = "";
    return;
  }

  panel.style.display = "block";
  container.innerHTML = categoricalColumns.map(col => {
    const uniqueValues = [...new Set(data.map(row => row[col]).filter(v => v !== "" && v !== null && v !== undefined))].sort();
    return `
      <div class="control-group">
        <label>${escapeHtml(col)}</label>
        <select id="filter-${cssEscape(col)}" class="chart-select">
          <option value="">All</option>
          ${uniqueValues.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}
        </select>
      </div>
    `;
  }).join("");
}

function cssEscape(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function applyFiltersClick() {
  const categoricalColumns = Object.keys(appState.columnTypes).filter(c => appState.columnTypes[c] === "categorical");
  appState.activeFilters = {};

  categoricalColumns.forEach(col => {
    const select = document.getElementById(`filter-${cssEscape(col)}`);
    if (select && select.value) appState.activeFilters[col] = select.value;
  });

  if (Object.keys(appState.activeFilters).length === 0) {
    appState.filteredData = [];
    showToast("No filters selected — showing cleaned data.", "info");
  } else {
    appState.filteredData = appState.cleanedData.filter(row =>
      Object.keys(appState.activeFilters).every(col => row[col] === appState.activeFilters[col])
    );
    showToast(`Filters applied — ${appState.filteredData.length.toLocaleString()} rows match.`, "success");
  }

  initializeVisualizations();
}

function clearAllFilters() {
  document.querySelectorAll("#filtersContainer2 select").forEach(sel => { sel.value = ""; });
  appState.activeFilters = {};
  appState.filteredData = [];
  showToast("Filters cleared.", "info");
  initializeVisualizations();
}

function toggleFiltersPanel() {
  const content = document.getElementById("filtersContent");
  if (!content) return;
  content.style.display = content.style.display === "none" ? "block" : "none";
}

// ========= VISUALIZATIONS =========
function initializeVisualizations() {
  if (!appState.isDataLoaded || appState.cleanedData.length === 0) return;

  const columns = Object.keys(appState.cleanedData[0]);
  const categoricalCols = columns.filter(c => appState.columnTypes[c] === "categorical");
  const numericCols = columns.filter(c => appState.columnTypes[c] === "numeric");

  const noDataMsg = document.getElementById("noVisualizationsMessage");
  const hasAnyCols = columns.length > 0;
  if (noDataMsg) noDataMsg.style.display = hasAnyCols ? "none" : "block";

  const categoricalSection = document.getElementById("categoricalSection");
  const numericSection = document.getElementById("numericSection");
  const pieSection = document.getElementById("pieSection");
  const comparisonSection = document.getElementById("comparisonSection");

  if (categoricalSection) categoricalSection.style.display = categoricalCols.length > 0 ? "block" : "none";
  if (pieSection) pieSection.style.display = categoricalCols.length > 0 ? "block" : "none";
  if (numericSection) numericSection.style.display = numericCols.length > 0 ? "block" : "none";
  if (comparisonSection) comparisonSection.style.display = columns.length >= 2 ? "block" : "none";

  fillSelect("categoricalColumnSelect", categoricalCols, "Choose a column...");
  fillSelect("pieColumnSelect", categoricalCols, "Choose a column...");
  fillSelect("numericColumnSelect", numericCols, "Choose a column...");
  fillSelect("xAxisSelect", columns, "Choose a column...");
  fillSelect("yAxisSelect", columns, "Choose a column...");
  fillSelect("groupBySelect", categoricalCols, "No grouping", true);

  if (categoricalCols.length > 0) renderCategoricalChart(categoricalCols[0]);
  if (numericCols.length > 0) renderNumericChart(numericCols[0]);
  if (categoricalCols.length > 0) renderPieChartViz(categoricalCols[0]);
  if (columns.length >= 2) {
    document.getElementById("xAxisSelect").value = columns[0];
    document.getElementById("yAxisSelect").value = numericCols[0] || columns[1];
    renderComparisonChart();
  }
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
  if (appState.chartInstances[containerId]) {
    appState.chartInstances[containerId].destroy();
    delete appState.chartInstances[containerId];
  }
  container.innerHTML = `<canvas id="${containerId}Canvas"></canvas>`;
  return document.getElementById(`${containerId}Canvas`).getContext("2d");
}

function renderCategoricalChart(columnName) {
  if (!columnName) return;
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
  if (!columnName) return;
  document.getElementById("numericColumnSelect").value = columnName;
  const data = activeData();
  const ctx = ensureCanvas("numericChart");

  const values = data.map(row => parseFloat(row[columnName])).filter(v => !isNaN(v));
  if (values.length === 0) return;

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
  if (!columnName) return;
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
    const merged = { "Other": [] };
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
  if (!xColumn || !yColumn) return;

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
          data: groups[key].map(row => ({ x: parseFloat(row[xColumn]), y: parseFloat(row[yColumn]) }))
            .filter(p => !isNaN(p.x) && !isNaN(p.y)).slice(0, 500),
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
          groups[key].forEach(r => { byX[String(r[xColumn])] = parseFloat(r[yColumn]) || 0; });
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
            const yVal = parseFloat(row[yColumn]);
            if (isNaN(yVal)) return;
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

function downloadChartImage(containerId) {
  const chart = appState.chartInstances[containerId];
  if (!chart) {
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
    btn.textContent = "Generating...";
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
    if (doc) doc.textContent = json.insights || "(backend returned no insights text)";

    const dateEl = document.getElementById("insightsGeneratedDate");
    if (dateEl) dateEl.textContent = `Generated ${new Date().toLocaleString()}`;

    const card = document.getElementById("generatedInsights");
    if (card) card.style.display = "block";

    showToast("AI insights generated.", "success");
  } catch (err) {
    console.error(err);
    showToast("Network error talking to backend.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "✓ Generate Insights";
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
  showToast("Data exported.", "success");
}

function exportSummary() {
  if (!appState.isDataLoaded) {
    showToast("Upload a dataset first.", "warning");
    return;
  }
  const data = appState.cleanedData;
  const columns = Object.keys(data[0] || {});
  const lines = [];
  lines.push("DataVizard - Dataset Summary");
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push("");
  lines.push(`File: ${appState.fileName}`);
  lines.push(`Rows: ${data.length}`);
  lines.push(`Columns: ${columns.length}`);
  lines.push("");
  lines.push("Column types:");
  columns.forEach(col => lines.push(`  - ${col}: ${appState.columnTypes[col] || "unknown"}`));
  lines.push("");
  lines.push("Cleaning actions:");
  if (appState.cleaningActions.history.length === 0) {
    lines.push("  (none)");
  } else {
    appState.cleaningActions.history.forEach(h => lines.push(`  - ${h}`));
  }

  downloadFile(lines.join("\n"), "datavizard_summary.txt", "text/plain");
  showToast("Summary exported.", "success");
}

function exportInsights() {
  if (!appState.isDataLoaded) {
    showToast("Upload a dataset first.", "warning");
    return;
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    fileName: appState.fileName,
    quickInsights: appState.quickInsights,
    aiInsights: appState.currentInsights || null
  };
  downloadFile(JSON.stringify(payload, null, 2), "datavizard_insights.json", "application/json");
  showToast("Insights exported.", "success");
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
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, CONFIG.UI.TOAST_DURATION_MS || 4000);
}
