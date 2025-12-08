// ---------- Global state ----------
const appState = {
  rawData: [],
  headers: [],
  fileName: '',
  cleaningHistory: [], // for undo (stores {rawData, headers})
  cleaningLog: [],     // log lines for download
  isGeneratingInsights: false,
};

// ---------- Utility: toast ----------
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = 'block';
  toast.style.background =
    type === 'success' ? '#2e7d32' :
    type === 'error'   ? '#c62828' :
    type === 'warning' ? '#f9a825' : '#323232';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 2500);
}

// ---------- Utility: download ----------
function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- File upload ----------
function initFileUpload() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  if (!dropzone || !fileInput) {
    console.error('Upload elements missing');
    return;
  }

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  console.log('✅ File upload initialized');
}

function handleFile(file) {
  console.log('📂 Selected file:', file);
  const allowed = ['text/csv',
                   'application/vnd.ms-excel',
                   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

  if (!allowed.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
    showToast('Please upload a CSV or Excel file', 'warning');
    return;
  }

  showProgress(true, 'Reading file...');
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const data = e.target.result;
      if (file.name.endsWith('.csv')) {
        parseCSV(data, file.name);
      } else {
        if (typeof XLSX === 'undefined') {
          throw new Error('XLSX library not loaded');
        }
        parseXLSX(data, file.name);
      }
    } catch (err) {
      console.error(err);
      showToast('Error reading file', 'error');
    } finally {
      showProgress(false);
    }
  };

  if (file.name.endsWith('.csv')) {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
}

function showProgress(show, text = '') {
  const progress = document.getElementById('uploadProgress');
  const fill = document.getElementById('progressFill');
  const label = document.getElementById('progressText');
  if (!progress || !fill || !label) return;

  if (show) {
    progress.style.display = 'block';
    fill.style.width = '40%';
    label.textContent = text;
  } else {
    progress.style.display = 'none';
    fill.style.width = '0%';
  }
}

// ---------- Parsing ----------
function parseCSV(text, fileName) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV must have header + at least one row');
  }
  const headers = splitCSVLine(lines[0]);
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const rowValues = splitCSVLine(lines[i]);
    if (rowValues.length === 1 && rowValues[0] === '') continue;
    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = rowValues[idx] ?? '';
    });
    data.push(rowObj);
  }

  loadDataIntoState(headers, data, fileName);
}

function splitCSVLine(line) {
  // Simple split, ok for most sanitized CSVs
  return line.split(',').map(v => v.trim());
}

function parseXLSX(arrayBuffer, fileName) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '' }); // keep empty cells
  if (!json.length) throw new Error('Excel sheet has no data');

  const headers = Object.keys(json[0]);
  loadDataIntoState(headers, json, fileName);
}

function loadDataIntoState(headers, data, fileName) {
  appState.headers = headers;
  appState.rawData = data;
  appState.fileName = fileName;
  appState.cleaningHistory = [];
  appState.cleaningLog = [];

  console.log('✅ Parsed data:', { headers, rows: data.length });

  updateDataOverview();
  updateCleaningSection();
  showToast('File loaded successfully', 'success');
}

// ---------- Data overview render ----------
function updateDataOverview() {
  const section = document.getElementById('dataSection');
  const nameEl = document.getElementById('statFileName');
  const rowsEl = document.getElementById('statRows');
  const colsEl = document.getElementById('statColumns');
  const table = document.getElementById('dataPreviewTable');

  if (!section || !nameEl || !rowsEl || !colsEl || !table) return;

  section.style.display = 'block';

  nameEl.textContent = appState.fileName || '-';
  rowsEl.textContent = appState.rawData.length;
  colsEl.textContent = appState.headers.length;

  // Build table
  table.innerHTML = '';
  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  appState.headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const maxRows = 50;
  appState.rawData.slice(0, maxRows).forEach(row => {
    const tr = document.createElement('tr');
    appState.headers.forEach(h => {
      const td = document.createElement('td');
      td.textContent = row[h];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  // show cleaning & insights
  document.getElementById('cleaningSection').style.display = 'block';
  document.getElementById('insightsSection').style.display = 'block';
}

// ---------- Cleaning ----------
function snapshotForUndo() {
  appState.cleaningHistory.push({
    rawData: structuredClone(appState.rawData),
    headers: [...appState.headers],
  });
}

function addCleaningLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ${message}`;
  appState.cleaningLog.push(line);

  const logList = document.getElementById('cleaningLog');
  if (!logList) return;
  const li = document.createElement('li');
  li.textContent = line;
  logList.prepend(li);
}

function updateCleaningSection() {
  // currently only ensures visibility in updateDataOverview
}

function removeDuplicates() {
  if (!appState.rawData.length) {
    showToast('No data loaded', 'warning');
    return;
  }
  snapshotForUndo();
  const seen = new Set();
  const result = [];
  let removed = 0;

  for (const row of appState.rawData) {
    const key = appState.headers.map(h => String(row[h])).join('|');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(row);
    } else {
      removed++;
    }
  }

  appState.rawData = result;
  updateDataOverview();
  addCleaningLog(`Removed ${removed} duplicate rows`);
  showToast('Duplicates removed', 'success');
}

function fillMissing() {
  if (!appState.rawData.length) {
    showToast('No data loaded', 'warning');
    return;
  }
  snapshotForUndo();

  const cols = appState.headers;
  const numericCols = [];
  const nonNumericCols = [];

  // simple detection: if majority numeric in col
  cols.forEach(col => {
    let numericCount = 0, total = 0;
    appState.rawData.forEach(r => {
      const v = r[col];
      if (v !== '' && v !== null && v !== undefined) {
        total++;
        if (!isNaN(Number(v))) numericCount++;
      }
    });
    if (total && numericCount / total > 0.6) numericCols.push(col);
    else nonNumericCols.push(col);
  });

  const means = {};
  numericCols.forEach(col => {
    let sum = 0, count = 0;
    appState.rawData.forEach(r => {
      const v = r[col];
      if (v !== '' && v !== null && v !== undefined && !isNaN(Number(v))) {
        sum += Number(v);
        count++;
      }
    });
    means[col] = count ? sum / count : null;
  });

  const modes = {};
  nonNumericCols.forEach(col => {
    const freq = {};
    appState.rawData.forEach(r => {
      const v = r[col];
      if (v !== '' && v !== null && v !== undefined) {
        freq[v] = (freq[v] || 0) + 1;
      }
    });
    let best = null, bestCount = 0;
    Object.entries(freq).forEach(([val, c]) => {
      if (c > bestCount) {
        best = val;
        bestCount = c;
      }
    });
    modes[col] = best;
  });

  let filled = 0;
  appState.rawData.forEach(r => {
    cols.forEach(col => {
      const v = r[col];
      if (v === '' || v === null || v === undefined) {
        if (numericCols.includes(col) && means[col] !== null) {
          r[col] = means[col];
          filled++;
        } else if (nonNumericCols.includes(col) && modes[col] != null) {
          r[col] = modes[col];
          filled++;
        }
      }
    });
  });

  updateDataOverview();
  addCleaningLog(`Filled ${filled} missing cells (mean/mode)`);
  showToast('Missing values filled', 'success');
}

function undoCleaning() {
  if (!appState.cleaningHistory.length) {
    showToast('Nothing to undo', 'warning');
    return;
  }
  const prev = appState.cleaningHistory.pop();
  appState.rawData = prev.rawData;
  appState.headers = prev.headers;
  updateDataOverview();
  addCleaningLog('Undo last cleaning action');
  showToast('Undo successful', 'success');
}

// ---------- Download cleaning log ----------
function downloadCleaningLog() {
  if (!appState.cleaningLog.length) {
    showToast('No cleaning actions to download', 'warning');
    return;
  }
  const content = appState.cleaningLog.join('\n');
  const baseName = appState.fileName ? appState.fileName.replace(/\.[^.]+$/, '') : 'data';
  downloadFile(content, `${baseName}_cleaning_log.txt`, 'text/plain');
  showToast('Cleaning log downloaded', 'success');
}

// ---------- Gemini insights ----------
async function generateInsights() {
  if (!appState.rawData.length) {
    showToast('Upload data first', 'warning');
    return;
  }
  if (appState.isGeneratingInsights) return;

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    showToast('Gemini API key missing in config.js', 'error');
    return;
  }

  appState.isGeneratingInsights = true;
  showToast('Generating AI insights...', 'info');

  const previewSample = appState.rawData.slice(0, 40);
  const payload = {
    contents: [
      {
        parts: [
          {
            text:
`You are a data analyst. Given tabular data (first rows), produce:
- 3–5 key descriptive insights
- distribution observations
- possible quality issues
- 2–3 suggestions for further analysis

Respond in short bullet points, no markdown.

Sample data (JSON):
${JSON.stringify(previewSample).slice(0, 12000)}`
          }
        ]
      }
    ]
  };

  try {
    const model = CONFIG.GEMINI_MODEL || 'gemini-1.5-flash';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Gemini error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') ||
      'No insights returned.';

    renderInsights(text);
    showToast('Insights generated', 'success');
  } catch (err) {
    console.error('Gemini error', err);
    showToast('Failed to generate AI insights', 'error');
  } finally {
    appState.isGeneratingInsights = false;
  }
}

function renderInsights(text) {
  const container = document.getElementById('insightsContainer');
  if (!container) return;
  container.textContent = text;
}

// ---------- Init ----------
function initCleaningButtons() {
  document.getElementById('btnRemoveDuplicates')
    ?.addEventListener('click', removeDuplicates);
  document.getElementById('btnFillMissing')
    ?.addEventListener('click', fillMissing);
  document.getElementById('btnUndoCleaning')
    ?.addEventListener('click', undoCleaning);
  document.getElementById('btnDownloadLog')
    ?.addEventListener('click', downloadCleaningLog);
}

function initInsightsButton() {
  document.getElementById('btnGenerateInsights')
    ?.addEventListener('click', generateInsights);
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Initializing DataVizard (minimal version)');
  initFileUpload();
  initCleaningButtons();
  initInsightsButton();
});
