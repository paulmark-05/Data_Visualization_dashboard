
// ========= GLOBAL APP STATE =========
let appState = {
  uploadedData: [],
  filteredData: [],
  originalData: [],
  cleanedData: [],
  activeFilters: {},
  columnTypes: {},
  columnStats: {},
  fileName: "",
  fileSize: 0,
  isDataLoaded: false,
  chartInstances: {},
  cleaningActions: {
    removedDuplicates: 0,
    filledMissing: 0,
    removedOutliers: 0,
    history: [],
    missingValueDetails: [],
    outlierDetails: [],
    cleaningHistory: [],
    undoStack: []
  },
  currentInsights: null
};

document.addEventListener("DOMContentLoaded", () => {
  initializeFileUpload();
  initializeApp();
});

// ========= NAVIGATION =========
function switchSection(e, sectionName) {
  if (e) e.preventDefault();

  document.querySelectorAll(".content-section").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(`section-${sectionName}`);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  const link = document.querySelector(`.nav-link[data-section='${sectionName}']`);
  if (link) link.classList.add("active");

  if (!appState.isDataLoaded && sectionName !== "dashboard") {
    showToast("Upload a dataset first.", "warning");
    return;
  }

  if (sectionName === "visualizations") {
    setTimeout(initializeVisualizations, 20);
  } else if (sectionName === "insights") {
    setTimeout(generateInsights, 20);
  } else if (sectionName === "cleaning") {
    setTimeout(generateDataQuality, 20);
  }
}

function initializeApp() {
  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const section = link.getAttribute("data-section");
      switchSection(e, section);
    });
  });
}

// ========= FILE UPLOAD =========
function initializeFileUpload() {
  const input = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  if (!input || !dropzone) return;

  dropzone.addEventListener("click", () => input.click());

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

function processFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!CONFIG.FILE_UPLOAD.ALLOWED_FORMATS.includes(ext)) {
    showToast("Unsupported file type. Use CSV / Excel.", "error");
    return;
  }
  if (file.size > CONFIG.FILE_UPLOAD.MAX_FILE_SIZE_BYTES) {
    showToast("File too large (50MB max).", "error");
    return;
  }

  appState.fileName = file.name;
  appState.fileSize = file.size;

  const progressDiv = document.getElementById("uploadProgress");
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");
  const progressValue = document.getElementById("progressValue");

  if (progressDiv) progressDiv.style.display = "block";
  if (progressText) progressText.textContent = "Reading file…";
  if (progressFill) progressFill.style.width = "10%";
  if (progressValue) progressValue.textContent = "10%";

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      if (progressText) progressText.textContent = "Parsing data…";
      if (progressFill) progressFill.style.width = "50%";
      if (progressValue) progressValue.textContent = "50%";

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

      appState.originalData = jsonData;
      appState.uploadedData = jsonData;
      appState.cleanedData = JSON.parse(JSON.stringify(jsonData));
      appState.filteredData = [];
      appState.isDataLoaded = true;
      appState.activeFilters = {};
      appState.cleaningActions = {
        removedDuplicates: 0,
        filledMissing: 0,
        removedOutliers: 0,
        history: [],
        missingValueDetails: [],
        outlierDetails: [],
        cleaningHistory: [],
        undoStack: []
      };

      detectColumnTypes(jsonData);
      computeColumnStats(jsonData);
      renderDataOverview();

      if (progressText) progressText.textContent = "Complete.";
      if (progressFill) progressFill.style.width = "100%";
      if (progressValue) progressValue.textContent = "100%";

      showToast("File loaded successfully.", "success");
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
  // Split into logical rows, respecting newlines embedded inside quoted fields.
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

// ========= DATA OVERVIEW =========
function renderDataOverview() {
  const { fileName, fileSize, originalData } = appState;
  const rows = originalData.length;
  const cols = rows > 0 ? Object.keys(originalData[0]).length : 0;

  const nameEl = document.getElementById("statFileName");
  const rowsEl = document.getElementById("statRows");
  const colsEl = document.getElementById("statColumns");
  const sizeEl = document.getElementById("statSize");

  if (nameEl) nameEl.textContent = fileName || "–";
  if (rowsEl) rowsEl.textContent = rows.toLocaleString();
  if (colsEl) colsEl.textContent = cols.toLocaleString();
  if (sizeEl) sizeEl.textContent = (fileSize / 1024).toFixed(1) + " KB";

  renderPreviewTable(originalData);
}

function renderPreviewTable(data) {
  const container = document.getElementById("dataPreview");
  if (!container) return;
  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.textContent = "No data loaded.";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  const columns = Object.keys(data[0]);
  const headerRow = document.createElement("tr");
  columns.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  data.slice(0, 20).forEach(row => {
    const tr = document.createElement("tr");
    columns.forEach(col => {
      const td = document.createElement("td");
      td.textContent = row[col];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);
}

// ========= COLUMN TYPING & STATS =========
function detectColumnTypes(data) {
  if (!data || data.length === 0) return;
  const first = data[0];
  const types = {};
  Object.keys(first).forEach(col => {
    let numericCount = 0;
    let nonEmpty = 0;
    data.forEach(row => {
      const val = row[col];
      if (val !== null && val !== undefined && String(val).trim() !== "") {
        nonEmpty++;
        if (!isNaN(parseFloat(val))) numericCount++;
      }
    });
    if (numericCount > 0 && numericCount / Math.max(nonEmpty, 1) > 0.7) {
      types[col] = "numeric";
    } else {
      types[col] = "categorical";
    }
  });
  appState.columnTypes = types;
}

function computeColumnStats(data) {
  if (!data || data.length === 0) return;
  const stats = {};
  const columns = Object.keys(data[0]);

  columns.forEach(col => {
    const values = data
      .map(row => parseFloat(row[col]))
      .filter(v => !isNaN(v));
    if (values.length === 0) return;

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    const min = sorted[0];
    const max = sorted[n - 1];
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];

    stats[col] = { mean, median, min, max, q1, q3, count: n };
  });

  appState.columnStats = stats;
}

// ========= CLEANING ACTIONS =========
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
  const result = [];

  appState.cleanedData.forEach(row => {
    const key = JSON.stringify(row);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(row);
    }
  });

  const removed = before - result.length;
  appState.cleanedData = result;
  appState.cleaningActions.removedDuplicates += removed;
  appState.cleaningActions.history.push(`Removed ${removed} duplicate rows.`);
  renderCleaningHistory();
  generateDataQuality();
  showToast(`Removed ${removed} duplicate rows.`, "success");
}

function fillMissing() {
  const data = appState.cleanedData;
  if (!data || data.length === 0) return;
  pushUndoSnapshot();
  let filled = 0;

  const numericMeans = {};
  Object.keys(appState.columnTypes).forEach(col => {
    if (appState.columnTypes[col] === "numeric") {
      const vals = data
        .map(r => parseFloat(r[col]))
        .filter(v => !isNaN(v));
      if (vals.length > 0) {
        numericMeans[col] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
    }
  });

  data.forEach(row => {
    Object.keys(row).forEach(col => {
      if (row[col] === "" || row[col] === null || row[col] === undefined) {
        if (appState.columnTypes[col] === "numeric" && !isNaN(numericMeans[col])) {
          row[col] = numericMeans[col];
        } else {
          row[col] = "N/A";
        }
        filled++;
      }
    });
  });

  appState.cleaningActions.filledMissing += filled;
  appState.cleaningActions.history.push(`Filled ${filled} missing values.`);
  renderCleaningHistory();
  generateDataQuality();
  showToast(`Filled ${filled} missing values.`, "success");
}

function removeOutliers() {
  const data = appState.cleanedData;
  if (!data || data.length === 0) return;
  pushUndoSnapshot();

  let removedTotal = 0;
  const keepRows = [];

  data.forEach(row => {
    let isOutlier = false;
    Object.keys(appState.columnStats).forEach(col => {
      const stats = appState.columnStats[col];
      const val = parseFloat(row[col]);
      if (isNaN(val)) return;
      const iqr = stats.q3 - stats.q1;
      const lower = stats.q1 - 1.5 * iqr;
      const upper = stats.q3 + 1.5 * iqr;
      if (val < lower || val > upper) {
        isOutlier = true;
      }
    });
    if (!isOutlier) {
      keepRows.push(row);
    } else {
      removedTotal++;
    }
  });

  appState.cleanedData = keepRows;
  appState.cleaningActions.removedOutliers += removedTotal;
  appState.cleaningActions.history.push(`Removed ${removedTotal} outlier rows.`);
  renderCleaningHistory();
  generateDataQuality();
  showToast(`Removed ${removedTotal} outlier rows.`, "success");
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
  renderCleaningHistory();
  generateDataQuality();
  showToast("Last cleaning action undone.", "info");
}

function renderCleaningHistory() {
  const panel = document.getElementById("cleaningHistoryPanel");
  if (!panel) return;
  panel.innerHTML = "";
  if (appState.cleaningActions.history.length === 0) {
    panel.textContent = "No cleaning actions yet.";
    return;
  }
  appState.cleaningActions.history.slice().reverse().forEach(entry => {
    const div = document.createElement("div");
    div.className = "log-entry";
    div.textContent = entry;
    panel.appendChild(div);
  });
}

function generateDataQuality() {
  const container = document.getElementById("dataQualityContainer");
  if (!container) return;
  const data = appState.cleanedData;
  if (!data || data.length === 0) {
    container.textContent = "No data loaded.";
    return;
  }

  const rows = data.length;
  const cols = Object.keys(data[0]);
  let missing = 0;

  data.forEach(row => {
    cols.forEach(col => {
      const v = row[col];
      if (v === "" || v === null || v === undefined) missing++;
    });
  });

  const totalCells = rows * cols.length;
  const completeness = ((totalCells - missing) / totalCells * 100).toFixed(1);

  container.innerHTML = `
    <p><strong>Rows:</strong> ${rows.toLocaleString()}</p>
    <p><strong>Columns:</strong> ${cols.length}</p>
    <p><strong>Missing cells:</strong> ${missing.toLocaleString()}</p>
    <p><strong>Completeness:</strong> ${completeness}%</p>
  `;
}

// ========= VISUALIZATIONS =========
function initializeVisualizations() {
  const data = appState.cleanedData;
  if (!data || data.length === 0) return;
  const columns = Object.keys(data[0]);

  const xSel = document.getElementById("vizXColumn");
  const ySel = document.getElementById("vizYColumn");
  if (!xSel || !ySel) return;

  xSel.innerHTML = "";
  ySel.innerHTML = "";

  columns.forEach(col => {
    const optX = document.createElement("option");
    optX.value = col;
    optX.textContent = col;
    xSel.appendChild(optX);

    const optY = document.createElement("option");
    optY.value = col;
    optY.textContent = col;
    ySel.appendChild(optY);
  });

  xSel.value = columns[0];
  if (columns.length > 1) {
    ySel.value = columns[1];
  }
}

function renderMainChart() {
  const data = appState.cleanedData;
  if (!data || data.length === 0) return;

  const xCol = document.getElementById("vizXColumn").value;
  const yCol = document.getElementById("vizYColumn").value;
  const type = document.getElementById("vizChartType").value;

  const ctx = document.getElementById("mainChart").getContext("2d");
  if (appState.chartInstances.main) {
    appState.chartInstances.main.destroy();
  }

  let chartConfig;

  if (type === "scatter") {
    const points = data.map(r => ({
      x: parseFloat(r[xCol]),
      y: parseFloat(r[yCol])
    })).filter(p => !isNaN(p.x) && !isNaN(p.y));

    chartConfig = {
      type: "scatter",
      data: {
        datasets: [{
          label: `${yCol} vs ${xCol}`,
          data: points
        }]
      }
    };
  } else if (type === "line") {
    const sorted = [...data].sort((a, b) => String(a[xCol]).localeCompare(String(b[xCol])));
    const labels = sorted.map(r => String(r[xCol]));
    const values = sorted.map(r => parseFloat(r[yCol]) || 0);

    chartConfig = {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: yCol,
          data: values
        }]
      }
    };
  } else if (type === "pie") {
    const counts = {};
    data.forEach(r => {
      const key = String(r[xCol]);
      counts[key] = (counts[key] || 0) + 1;
    });
    const labels = Object.keys(counts).slice(0, 12);
    const values = labels.map(l => counts[l]);

    chartConfig = {
      type: "pie",
      data: {
        labels,
        datasets: [{
          data: values
        }]
      }
    };
  } else { // bar
    const labels = data.map(r => String(r[xCol])).slice(0, 40);
    const values = data.map(r => parseFloat(r[yCol]) || 0).slice(0, 40);

    chartConfig = {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: yCol,
          data: values
        }]
      }
    };
  }

  appState.chartInstances.main = new Chart(ctx, {
    ...chartConfig,
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

// ========= AI INSIGHTS (via backend) =========
async function generateInsights() {
  if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) return;

  const data = appState.cleanedData;
  const cols = Object.keys(data[0]);
  const numericCols = cols.filter(c => appState.columnTypes[c] === "numeric");
  const insights = [];

  // local quick tiles
  insights.push({
    icon: "📊",
    title: "Dataset footprint",
    description: `${data.length.toLocaleString()} rows × ${cols.length} columns`,
    type: "info"
  });

  let missing = 0;
  data.forEach(row => {
    cols.forEach(col => {
      const v = row[col];
      if (v === "" || v === null || v === undefined) missing++;
    });
  });
  const completeness = (((data.length * cols.length) - missing) / (data.length * cols.length) * 100).toFixed(1);
  insights.push({
    icon: completeness > 95 ? "✅" : "⚠️",
    title: "Data completeness",
    description: `${completeness}% cells populated`,
    type: completeness > 95 ? "success" : "warning"
  });

  if (numericCols.length > 0) {
    const col = numericCols[0];
    const s = appState.columnStats[col];
    if (s) {
      insights.push({
        icon: "📈",
        title: `${col} stats`,
        description: `Mean: ${s.mean.toFixed(2)}, Range: ${s.min.toFixed(2)} – ${s.max.toFixed(2)}`,
        type: "info"
      });
    }
  }

  renderQuickInsights(insights);

  // call backend Gemini
  const promptInput = document.getElementById("insightsRequest");
  const userPrompt = promptInput ? promptInput.value.trim() : "";
  showToast("Sending sample to backend for Gemini insights…", "info");

  try {
    const payload = {
      question: userPrompt || "Give 3–5 business‑relevant insights and risks for this dataset.",
      columns: cols,
      sample_rows: data.slice(0, 200)
    };

    const res = await fetch(CONFIG.API.BASE_URL + CONFIG.API.INSIGHTS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
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
    if (doc) {
      doc.textContent = json.insights || "(backend returned no insights text)";
    }

    showToast("AI insights generated.", "success");
  } catch (err) {
    console.error(err);
    showToast("Network error talking to backend.", "error");
  }
}

function renderQuickInsights(items) {
  const grid = document.getElementById("quickInsightsGrid");
  if (!grid) return;
  grid.innerHTML = "";
  items.forEach(ins => {
    const card = document.createElement("div");
    card.className = "insight-card";
    card.innerHTML = `
      <div class="insight-icon">${ins.icon}</div>
      <div class="insight-title">${ins.title}</div>
      <div class="insight-description">${ins.description}</div>
    `;
    grid.appendChild(card);
  });
}

// ========= EXPORTS =========
function exportCleanedData() {
  const data = appState.cleanedData;
  if (!data || data.length === 0) {
    showToast("No cleaned data to export.", "warning");
    return;
  }
  const csv = convertToCSV(data);
  downloadFile(csv, "cleaned_data.csv", "text/csv");
  showToast("Cleaned data exported.", "success");
}

function exportInsights() {
  const insights = appState.currentInsights;
  if (!insights) {
    showToast("Generate AI insights first.", "warning");
    return;
  }
  const content = `DataVizard – AI Insights\n\n${insights.insights || ""}\n\nMetadata:\nRows analysed: ${insights.row_count}\nColumns: ${insights.column_count}`;
  downloadFile(content, "insights_report.txt", "text/plain");
  showToast("Insights report exported.", "success");
}

function exportCleaningLog() {
  const history = appState.cleaningActions.history || [];
  if (history.length === 0) {
    showToast("No cleaning actions logged.", "warning");
    return;
  }
  const content = history.join("\n");
  downloadFile(content, "cleaning_log.txt", "text/plain");
  showToast("Cleaning log exported.", "success");
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
  const colors = {
    success: "#10b981",
    error: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6"
  };
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.background = colors[type] || colors.info;
  toast.style.color = "white";
  toast.style.padding = "10px 16px";
  toast.style.borderRadius = "999px";
  toast.style.border = "2px solid #111827";
  toast.style.boxShadow = "3px 3px 0 #111827";
  toast.style.fontSize = "13px";
  toast.style.fontWeight = "600";
  toast.textContent = message;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, CONFIG.UI.TOAST_DURATION_MS || 4000);
}
