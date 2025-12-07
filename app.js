// ========== DATAVIZARD - COMPLETE APPLICATION STATE ========== 
let appState = {
  uploadedData: [],
  filteredData: [],
  originalData: [],
  cleanedData: [],
  activeFilters: {},
  chatHistory: [],
  columnTypes: {},
  columnStats: {},
  fileName: '',
  fileSize: 0,
  isDataLoaded: false,
  charts: [],
  chartInstances: {},
  chartConfigs: {
    chart1: { type: 'bar', column: '', xColumn: '', yColumn: '' },
    chart2: { type: 'line', column: '', xColumn: '', yColumn: '' },
    chart3: { type: 'pie', column: '', xColumn: '', yColumn: '' },
    chart4: { type: 'scatter', column: '', xColumn: '', yColumn: '' }
  },
  pendingFilters: {},
  currentInsights: null,
  selectedColumns: [],
  sortColumn: '',
  sortOrder: 'asc',
  cleaningActions: {
    removedDuplicates: 0,
    filledMissing: 0,
    removedOutliers: 0,
    history: [],
    missingValueDetails: [],
    outlierDetails: [],
    cleaningHistory: [] // ✅ FIXED: Store full cleaning state for undo
  },
  visualizationFilters: {},
  geminiApiKey: '' // ✅ SECURE: NO HARDCODED KEY
};

let filtersChanged = false;

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Initializing DataVizard...');
  loadGeminiApiKeySecurely();
  initializeFileUpload();
  initializeApp();
});

// ========== ✅ SECURE GEMINI API KEY LOADING ==========
function loadGeminiApiKeySecurely() {
  // Try window.__GEMINI_API_KEY (set by backend or .env)
  if (window.__GEMINI_API_KEY && window.__GEMINI_API_KEY.length > 10) {
    appState.geminiApiKey = window.__GEMINI_API_KEY;
    console.log('✅ Gemini API Key loaded from environment');
    return;
  }

  // Try sessionStorage (if backend stored it)
  try {
    const sessionKey = sessionStorage.getItem('__gemini_key');
    if (sessionKey && sessionKey.length > 10) {
      appState.geminiApiKey = sessionKey;
      console.log('✅ Gemini API Key loaded from session');
      return;
    }
  } catch (e) {
    console.warn('⚠️ Session storage access denied');
  }

  // Try window.GEMINI_API_KEY (alternative naming)
  if (window.GEMINI_API_KEY && window.GEMINI_API_KEY.length > 10) {
    appState.geminiApiKey = window.GEMINI_API_KEY;
    console.log('✅ Gemini API Key loaded from window variable');
    return;
  }

  console.warn('⚠️ Gemini API Key not found. Using automated insights only.');
}

// ========== ✅ SECURE GEMINI API CALL ==========
async function callGeminiAPISafe(prompt) {
  if (!appState.geminiApiKey || appState.geminiApiKey.length < 20) {
    console.warn('⚠️ No valid Gemini API key available');
    return null;
  }

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': appState.geminiApiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.7
        }
      })
    });

    if (!response.ok) {
      console.warn('⚠️ Gemini API error:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return content || null;
  } catch (error) {
    console.error('❌ API call failed:', error.message);
    return null;
  }
}

// ========== FILE UPLOAD ==========
function initializeFileUpload() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  if (!dropzone || !fileInput) {
    console.error('❌ Upload elements not found');
    return;
  }

  // Click to browse
  dropzone.addEventListener('click', function(e) {
    if (e.target.tagName !== 'INPUT') {
      fileInput.click();
    }
  });

  // File selected
  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      processFile(file);
    }
  });

  // Drag and drop
  dropzone.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  });
}

function initializeApp() {
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const section = this.getAttribute('data-section');
      if (section) switchSection(null, section);
    });
  });
}

function switchSection(e, sectionName) {
  if (e) e.preventDefault();

  const sections = document.querySelectorAll('.content-section');
  sections.forEach(s => s.classList.remove('active'));

  const targetSection = document.getElementById(`section-${sectionName}`);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => link.classList.remove('active'));

  const activeLink = document.querySelector(`[data-section="${sectionName}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }

  if (!appState.isDataLoaded) {
    if (sectionName !== 'dashboard') {
      showToast('Please upload data first', 'warning');
    }
    return;
  }

  if (sectionName === 'visualizations') {
    setTimeout(() => initializeVisualizations(), 50);
  } else if (sectionName === 'insights') {
    setTimeout(() => generateInsights(), 50);
  } else if (sectionName === 'quality') {
    setTimeout(() => generateDataQuality(), 50);
  }
}

// ✅ FILE UPLOAD WITH ERROR FEEDBACK
function processFile(file) {
  const validExtensions = ['xlsx', 'xls', 'csv'];
  const fileExtension = file.name.split('.').pop().toLowerCase();

  if (!validExtensions.includes(fileExtension)) {
    showToast('❌ Please upload a valid Excel or CSV file', 'error');
    return;
  }

  appState.fileName = file.name;
  appState.fileSize = file.size;

  const progressDiv = document.getElementById('uploadProgress');
  const progressText = document.getElementById('progressText');
  const progressFill = document.getElementById('progressFill');

  if (progressDiv) {
    progressDiv.style.display = 'block';
    progressText.textContent = 'Reading file...';
    progressFill.style.width = '20%';
  }

  const reader = new FileReader();

  reader.onload = function(e) {
    try {
      if (progressText) progressText.textContent = 'Parsing data...';
      if (progressFill) progressFill.style.width = '60%';

      let jsonData;
      if (fileExtension === 'csv') {
        jsonData = parseCSV(e.target.result);
      } else {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        jsonData = XLSX.utils.sheet_to_json(firstSheet);
      }

      if (!jsonData || jsonData.length === 0) {
        throw new Error('File is empty or contains no valid data');
      }

      if (progressText) progressText.textContent = 'Processing data...';
      if (progressFill) progressFill.style.width = '80%';

      appState.originalData = jsonData;
      appState.uploadedData = jsonData;
      appState.cleanedData = JSON.parse(JSON.stringify(jsonData));
      appState.filteredData = [];
      appState.isDataLoaded = true;
      appState.activeFilters = {};
      appState.visualizationFilters = {};
      appState.cleaningActions = {
        removedDuplicates: 0,
        filledMissing: 0,
        removedOutliers: 0,
        history: [],
        missingValueDetails: [],
        outlierDetails: [],
        cleaningHistory: []
      };

      detectColumnTypes(jsonData);
      computeColumnStats(jsonData);

      if (progressText) progressText.textContent = '✅ Complete!';
      if (progressFill) progressFill.style.width = '100%';

      setTimeout(() => {
        transitionToDataOverview();
      }, 500);
    } catch (error) {
      console.error('❌ Error processing file:', error);
      showToast('❌ Error: ' + error.message, 'error');
      if (progressDiv) progressDiv.style.display = 'none';
    }
  };

  reader.onerror = function() {
    console.error('❌ Error reading file');
    showToast('❌ Error reading file', 'error');
    if (progressDiv) progressDiv.style.display = 'none';
  };

  if (fileExtension === 'csv') {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
}

function parseCSV(text) {
  const lines = text.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1'));
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"(.*)"$/, '$1'));
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    data.push(row);
  }

  return data;
}

function showUploadArea() {
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('uploadArea').style.display = 'block';
}

function transitionToDataOverview() {
  const welcomeScreen = document.getElementById('welcomeScreen');
  const uploadArea = document.getElementById('uploadArea');
  const dataOverview = document.getElementById('dataOverview');

  if (welcomeScreen) welcomeScreen.style.display = 'none';
  if (uploadArea) uploadArea.style.display = 'none';
  if (dataOverview) {
    dataOverview.style.display = 'block';
    updateDashboardOverview();
  }

  generateDataQuality();
  generateFilters();
  initializeVisualizations();
  generateInsights();

  showToast('✅ File uploaded successfully!', 'success');
}

function detectColumnTypes(data) {
  if (!data || data.length === 0) return;

  const columns = Object.keys(data[0]);
  appState.columnTypes = {};

  columns.forEach(col => {
    const sample = data.slice(0, 100).map(row => row[col]).filter(val => val !== null && val !== undefined && val !== '');

    if (sample.length === 0) {
      appState.columnTypes[col] = 'text';
      return;
    }

    const numericCount = sample.filter(val => !isNaN(parseFloat(val)) && isFinite(val)).length;
    if (numericCount / sample.length > 0.8) {
      appState.columnTypes[col] = 'numeric';
      return;
    }

    const dateCount = sample.filter(val => !isNaN(Date.parse(val))).length;
    if (dateCount / sample.length > 0.8) {
      appState.columnTypes[col] = 'date';
      return;
    }

    const uniqueValues = new Set(sample);
    if (uniqueValues.size < 20 || uniqueValues.size / sample.length < 0.5) {
      appState.columnTypes[col] = 'categorical';
      return;
    }

    appState.columnTypes[col] = 'text';
  });

  console.log('📋 Column types detected:', appState.columnTypes);
}

function computeColumnStats(data) {
  if (!data || data.length === 0) return;

  const columns = Object.keys(data[0]);
  appState.columnStats = {};

  columns.forEach(col => {
    const stats = {};
    const values = data.map(row => row[col]).filter(v => v !== '' && v !== null && v !== undefined);

    stats.nonNullCount = values.length;
    stats.nullCount = data.length - values.length;
    stats.uniqueCount = new Set(values).size;
    stats.uniquePercentage = ((stats.uniqueCount / data.length) * 100).toFixed(1);

    if (appState.columnTypes[col] === 'numeric') {
      const numValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
      if (numValues.length > 0) {
        stats.min = Math.min(...numValues).toFixed(2);
        stats.max = Math.max(...numValues).toFixed(2);
        stats.mean = (numValues.reduce((a, b) => a + b, 0) / numValues.length).toFixed(2);
        stats.median = getMedian(numValues).toFixed(2);
        stats.stdDev = getStdDev(numValues).toFixed(2);
      }
    }

    appState.columnStats[col] = stats;
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

function updateDashboardOverview() {
  if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) return;

  const data = appState.originalData;
  const columns = Object.keys(data[0] || {});

  document.getElementById('statFileName').textContent = appState.fileName;
  document.getElementById('statRows').textContent = data.length.toLocaleString();
  document.getElementById('statColumns').textContent = columns.length;
  document.getElementById('statSize').textContent = formatFileSize(appState.fileSize);

  displayDataPreview(data);
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function resetUpload() {
  appState.originalData = [];
  appState.uploadedData = [];
  appState.filteredData = [];
  appState.cleanedData = [];
  appState.isDataLoaded = false;
  appState.fileName = '';
  appState.fileSize = 0;
  appState.activeFilters = {};

  document.getElementById('welcomeScreen').style.display = 'block';
  document.getElementById('uploadArea').style.display = 'none';
  document.getElementById('dataOverview').style.display = 'none';
  document.getElementById('fileInput').value = '';

  showToast('Ready for new upload', 'info');
}

function displayDataPreview(rows) {
  const table = document.getElementById('dataPreviewTable');
  if (!table) return;

  if (!rows || rows.length === 0) {
    table.innerHTML = '<tr><td colspan="10">No data to display</td></tr>';
    return;
  }

  const columns = Object.keys(rows[0]);
  let html = '<thead><tr>';

  columns.forEach(col => {
    html += `<th>${col}</th>`;
  });

  html += '</tr></thead><tbody>';

  rows.slice(0, 50).forEach(row => {
    html += '<tr>';
    columns.forEach(col => {
      html += `<td>${row[col] || ''}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody>';
  table.innerHTML = html;
}

// ========== DATA QUALITY & CLEANING ==========
function generateDataQuality() {
  if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) return;

  const data = appState.originalData;
  const container = document.getElementById('dataQualityContainer');
  if (!container) return;

  let html = '<div class="quality-section">';

  // Missing values
  html += '<h3>📊 Missing Values</h3>';
  const missingData = [];
  Object.keys(data[0]).forEach(col => {
    const missing = data.filter(row => !row[col] || row[col] === '').length;
    if (missing > 0) {
      missingData.push({ column: col, count: missing, percentage: ((missing / data.length) * 100).toFixed(1) });
    }
  });

  if (missingData.length === 0) {
    html += '<p>✅ No missing values detected</p>';
  } else {
    html += '<table class="quality-table"><thead><tr><th>Column</th><th>Count</th><th>Percentage</th></tr></thead><tbody>';
    missingData.forEach(item => {
      html += `<tr><td>${item.column}</td><td>${item.count}</td><td>${item.percentage}%</td></tr>`;
    });
    html += '</tbody></table>';
  }

  // Duplicates
  html += '<h3>🔄 Duplicates</h3>';
  const duplicates = findDuplicates(data);
  html += `<p>${duplicates} duplicate rows detected</p>`;

  // Outliers
  html += '<h3>⚠️ Outliers</h3>';
  const numericCols = Object.keys(appState.columnTypes).filter(col => appState.columnTypes[col] === 'numeric');
  if (numericCols.length === 0) {
    html += '<p>No numeric columns to analyze</p>';
  } else {
    const outliers = detectOutliersWithDetails(data);
    if (Object.keys(outliers).length === 0) {
      html += '<p>✅ No outliers detected</p>';
    } else {
      html += '<table class="quality-table"><thead><tr><th>Column</th><th>Outlier Count</th></tr></thead><tbody>';
      Object.keys(outliers).forEach(col => {
        html += `<tr><td>${col}</td><td>${outliers[col].length}</td></tr>`;
      });
      html += '</tbody></table>';
    }
  }

  // Cleaning actions
  html += '<h3>🧹 Data Cleaning Actions</h3>';
  html += `
    <div class="cleaning-buttons">
      <button onclick="removeDuplicates()" class="btn btn-primary">Remove Duplicates (${appState.cleaningActions.removedDuplicates})</button>
      <button onclick="fillMissingValues()" class="btn btn-primary">Fill Missing Values (${appState.cleaningActions.filledMissing})</button>
      <button onclick="removeOutliers()" class="btn btn-primary">Remove Outliers (${appState.cleaningActions.removedOutliers})</button>
      <button onclick="undoCleaning()" class="btn btn-secondary" ${appState.cleaningActions.cleaningHistory.length === 0 ? 'disabled' : ''}>↶ Undo Last Action</button>
    </div>
  `;

  // Cleaning history
  if (appState.cleaningActions.history.length > 0) {
    html += '<h4>Cleaning History</h4><ul>';
    appState.cleaningActions.history.forEach(action => {
      html += `<li>${action}</li>`;
    });
    html += '</ul>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function findDuplicates(data) {
  const seen = new Set();
  let duplicates = 0;

  data.forEach(row => {
    const rowStr = JSON.stringify(row);
    if (seen.has(rowStr)) {
      duplicates++;
    }
    seen.add(rowStr);
  });

  return duplicates;
}

function detectOutliersWithDetails(data) {
  const outliers = {};
  const numericCols = Object.keys(appState.columnTypes).filter(col => appState.columnTypes[col] === 'numeric');

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
    if (outlierValues.length > 0) {
      outliers[col] = outlierValues;
    }
  });

  return outliers;
}

function removeDuplicates() {
  const before = appState.cleanedData.length;

  // Save state for undo
  appState.cleaningActions.cleaningHistory.push({
    action: 'removeDuplicates',
    data: JSON.parse(JSON.stringify(appState.cleanedData))
  });

  const seen = new Set();
  appState.cleanedData = appState.cleanedData.filter(row => {
    const rowStr = JSON.stringify(row);
    if (seen.has(rowStr)) {
      return false;
    }
    seen.add(rowStr);
    return true;
  });

  const removed = before - appState.cleanedData.length;
  appState.cleaningActions.removedDuplicates += removed;
  appState.cleaningActions.history.push(`Removed ${removed} duplicate rows`);

  appState.uploadedData = appState.cleanedData;
  showToast(`✅ Removed ${removed} duplicate rows`, 'success');
  generateDataQuality();
}

function fillMissingValues() {
  let filled = 0;

  // Save state for undo
  appState.cleaningActions.cleaningHistory.push({
    action: 'fillMissing',
    data: JSON.parse(JSON.stringify(appState.cleanedData))
  });

  Object.keys(appState.cleanedData[0]).forEach(col => {
    if (appState.columnTypes[col] === 'numeric') {
      const values = appState.cleanedData.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;

      appState.cleanedData.forEach(row => {
        if (!row[col] || row[col] === '') {
          row[col] = mean.toFixed(2);
          filled++;
        }
      });
    } else {
      const values = appState.cleanedData.map(row => row[col]).filter(v => v);
      const mode = values.length > 0 ? values[0] : 'N/A';

      appState.cleanedData.forEach(row => {
        if (!row[col] || row[col] === '') {
          row[col] = mode;
          filled++;
        }
      });
    }
  });

  appState.cleaningActions.filledMissing += filled;
  appState.cleaningActions.history.push(`Filled ${filled} missing values`);

  appState.uploadedData = appState.cleanedData;
  showToast(`✅ Filled ${filled} missing values`, 'success');
  generateDataQuality();
}

function removeOutliers() {
  const outliers = detectOutliersWithDetails(appState.cleanedData);
  const before = appState.cleanedData.length;

  // Save state for undo
  appState.cleaningActions.cleaningHistory.push({
    action: 'removeOutliers',
    data: JSON.parse(JSON.stringify(appState.cleanedData))
  });

  const outliersToRemove = new Set();
  Object.keys(outliers).forEach(col => {
    const values = appState.cleanedData.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    appState.cleanedData.forEach((row, idx) => {
      const val = parseFloat(row[col]);
      if (!isNaN(val) && (val < lower || val > upper)) {
        outliersToRemove.add(idx);
      }
    });
  });

  appState.cleanedData = appState.cleanedData.filter((row, idx) => !outliersToRemove.has(idx));

  const removed = before - appState.cleanedData.length;
  appState.cleaningActions.removedOutliers += removed;
  appState.cleaningActions.history.push(`Removed ${removed} outliers`);

  appState.uploadedData = appState.cleanedData;
  showToast(`✅ Removed ${removed} outliers`, 'success');
  generateDataQuality();
}

// ✅ FIXED: UNDO CLEANING WITH FULL STATE RESTORATION
function undoCleaning() {
  if (appState.cleaningActions.cleaningHistory.length === 0) {
    showToast('❌ No actions to undo', 'warning');
    return;
  }

  const lastAction = appState.cleaningActions.cleaningHistory.pop();
  appState.cleanedData = JSON.parse(JSON.stringify(lastAction.data));
  appState.uploadedData = appState.cleanedData;

  // Reset counters and history
  appState.cleaningActions.removedDuplicates = 0;
  appState.cleaningActions.filledMissing = 0;
  appState.cleaningActions.removedOutliers = 0;
  appState.cleaningActions.history = [];

  showToast('↶ Last cleaning action undone', 'success');
  generateDataQuality();
}

// ========== FILTERS ==========
function generateFilters() {
  if (!appState.isDataLoaded) return;

  const data = appState.originalData;
  const columns = Object.keys(data[0]);
  const categoricalColumns = columns.filter(col => appState.columnTypes[col] === 'categorical');

  let html = '';
  categoricalColumns.forEach(col => {
    const uniqueValues = [...new Set(data.map(row => row[col]).filter(v => v))].sort();
    html += `<div class="filter-group">
      <label>${col}</label>
      <select id="filter-${col}" onchange="applyFilters()">
        <option value="">All</option>`;
    uniqueValues.forEach(val => {
      html += `<option value="${val}">${val}</option>`;
    });
    html += '</select></div>';
  });

  const filtersContainer = document.getElementById('filtersContainer');
  if (filtersContainer) {
    filtersContainer.innerHTML = html || '<p>No categorical columns to filter</p>';
  }
}

function applyFilters() {
  const data = appState.originalData;
  const columns = Object.keys(data[0]);
  const categoricalColumns = columns.filter(col => appState.columnTypes[col] === 'categorical');

  appState.filteredData = data.filter(row => {
    return categoricalColumns.every(col => {
      const select = document.getElementById(`filter-${col}`);
      const value = select?.value;
      return !value || row[col] === value;
    });
  });

  initializeVisualizations();
  showToast('✅ Filters applied', 'success');
}

// ========== VISUALIZATIONS ==========
function initializeVisualizations() {
  if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) return;

  const container = document.getElementById('visualizationsContainer');
  if (!container) return;

  const columns = Object.keys(appState.originalData[0]);
  const categoricalCols = columns.filter(col => appState.columnTypes[col] === 'categorical');
  const numericCols = columns.filter(col => appState.columnTypes[col] === 'numeric');

  let html = `
    <div class="viz-section">
      <h3>Categorical Distribution</h3>
      <select id="categoricalColumnSelect" onchange="renderCategoricalChart(this.value)">
        <option value="">Select a column</option>
  `;

  categoricalCols.forEach(col => {
    html += `<option value="${col}">${col}</option>`;
  });

  html += `
      </select>
      <div id="categoricalChart" style="position: relative; height: 300px;"></div>
    </div>

    <div class="viz-section">
      <h3>Numeric Distribution</h3>
      <select id="numericColumnSelect" onchange="renderNumericChart(this.value)">
        <option value="">Select a column</option>
  `;

  numericCols.forEach(col => {
    html += `<option value="${col}">${col}</option>`;
  });

  html += `
      </select>
      <div id="numericChart" style="position: relative; height: 300px;"></div>
    </div>

    <div class="viz-section">
      <h3>Pie Chart</h3>
      <select id="pieColumnSelect" onchange="renderPieChartViz(this.value)">
        <option value="">Select a column</option>
  `;

  categoricalCols.forEach(col => {
    html += `<option value="${col}">${col}</option>`;
  });

  html += `
      </select>
      <div id="pieChart" style="position: relative; height: 300px;"></div>
    </div>

    <div class="viz-section">
      <h3>Comparison Chart</h3>
      <select id="comparisonChartType" onchange="renderComparisonChart()">
        <option value="scatter">Scatter</option>
        <option value="line">Line</option>
        <option value="bar">Bar</option>
      </select>
      <select id="xAxisSelect" onchange="renderComparisonChart()">
        <option value="">X-Axis</option>
  `;

  columns.forEach(col => {
    html += `<option value="${col}">${col}</option>`;
  });

  html += `
      </select>
      <select id="yAxisSelect" onchange="renderComparisonChart()">
        <option value="">Y-Axis</option>
  `;

  columns.forEach(col => {
    html += `<option value="${col}">${col}</option>`;
  });

  html += `
      </select>
      <div id="comparisonChart" style="position: relative; height: 300px;"></div>
    </div>
  `;

  container.innerHTML = html;
}

function renderCategoricalChart(columnName) {
  if (!columnName) return;

  const data = appState.filteredData.length > 0 ? appState.filteredData : appState.originalData;
  const container = document.getElementById('categoricalChart');

  if (appState.chartInstances['categoricalChart']) {
    appState.chartInstances['categoricalChart'].destroy();
  }

  container.innerHTML = '<canvas id="categoricalChartCanvas"></canvas>';
  const ctx = document.getElementById('categoricalChartCanvas').getContext('2d');

  const frequencies = {};
  data.forEach(row => {
    const value = String(row[columnName] || 'N/A');
    frequencies[value] = (frequencies[value] || 0) + 1;
  });

  const colors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B'];

  appState.chartInstances['categoricalChart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(frequencies),
      datasets: [{
        label: 'Count',
        data: Object.values(frequencies),
        backgroundColor: colors.slice(0, Object.keys(frequencies).length),
        borderColor: '#333',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function renderNumericChart(columnName) {
  if (!columnName) return;

  const data = appState.filteredData.length > 0 ? appState.filteredData : appState.originalData;
  const container = document.getElementById('numericChart');

  if (appState.chartInstances['numericChart']) {
    appState.chartInstances['numericChart'].destroy();
  }

  container.innerHTML = '<canvas id="numericChartCanvas"></canvas>';
  const ctx = document.getElementById('numericChartCanvas').getContext('2d');

  const values = data.map(row => parseFloat(row[columnName])).filter(v => !isNaN(v));

  if (values.length === 0) {
    container.innerHTML = '<p>No numeric data available</p>';
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = Math.min(20, Math.ceil(Math.sqrt(values.length)));
  const binSize = (max - min) / binCount || 1;

  const bins = new Array(binCount).fill(0);
  const binLabels = [];

  for (let i = 0; i < binCount; i++) {
    const binStart = min + i * binSize;
    const binEnd = binStart + binSize;
    binLabels.push(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}`);
  }

  values.forEach(value => {
    let binIndex = Math.floor((value - min) / binSize);
    if (binIndex >= binCount) binIndex = binCount - 1;
    bins[binIndex]++;
  });

  appState.chartInstances['numericChart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: binLabels,
      datasets: [{
        label: 'Frequency',
        data: bins,
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true }
      }
    }
  });
}

function renderPieChartViz(columnName) {
  if (!columnName) return;

  const data = appState.filteredData.length > 0 ? appState.filteredData : appState.originalData;
  const container = document.getElementById('pieChart');

  if (appState.chartInstances['pieChart']) {
    appState.chartInstances['pieChart'].destroy();
  }

  container.innerHTML = '<canvas id="pieChartCanvas"></canvas>';
  const ctx = document.getElementById('pieChartCanvas').getContext('2d');

  const frequencies = {};
  data.forEach(row => {
    const value = String(row[columnName] || 'N/A');
    frequencies[value] = (frequencies[value] || 0) + 1;
  });

  const colors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B'];

  appState.chartInstances['pieChart'] = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(frequencies),
      datasets: [{
        data: Object.values(frequencies),
        backgroundColor: colors.slice(0, Object.keys(frequencies).length),
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

function renderComparisonChart() {
  const chartType = document.getElementById('comparisonChartType')?.value || 'scatter';
  const xColumn = document.getElementById('xAxisSelect')?.value;
  const yColumn = document.getElementById('yAxisSelect')?.value;

  if (!xColumn || !yColumn) return;

  const data = appState.filteredData.length > 0 ? appState.filteredData : appState.originalData;
  const container = document.getElementById('comparisonChart');

  if (appState.chartInstances['comparisonChart']) {
    appState.chartInstances['comparisonChart'].destroy();
  }

  container.innerHTML = '<canvas id="comparisonChartCanvas"></canvas>';
  const ctx = document.getElementById('comparisonChartCanvas').getContext('2d');

  let chartConfig;

  if (chartType === 'scatter') {
    const points = data.map(row => ({
      x: parseFloat(row[xColumn]) || 0,
      y: parseFloat(row[yColumn]) || 0
    })).filter(p => !isNaN(p.x) && !isNaN(p.y)).slice(0, 500);

    chartConfig = {
      type: 'scatter',
      data: {
        datasets: [{
          label: `${yColumn} vs ${xColumn}`,
          data: points,
          backgroundColor: 'rgba(124, 58, 237, 0.6)',
          borderColor: '#7c3aed',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: {
          x: { grid: { color: '#e5e5e5' } },
          y: { grid: { color: '#e5e5e5' } }
        }
      }
    };
  } else if (chartType === 'line') {
    const sortedData = [...data].sort((a, b) => String(a[xColumn]).localeCompare(String(b[xColumn])));
    const labels = sortedData.map(r => String(r[xColumn])).slice(0, 50);
    const values = sortedData.map(r => parseFloat(r[yColumn]) || 0).slice(0, 50);

    chartConfig = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: yColumn,
          data: values,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: false } }
      }
    };
  } else {
    const aggregated = {};
    data.forEach(row => {
      const xVal = String(row[xColumn]);
      const yVal = parseFloat(row[yColumn]) || 0;
      if (!isNaN(yVal)) {
        if (!aggregated[xVal]) aggregated[xVal] = { sum: 0, count: 0 };
        aggregated[xVal].sum += yVal;
        aggregated[xVal].count++;
      }
    });

    const labels = Object.keys(aggregated).slice(0, 30);
    const values = labels.map(l => aggregated[l].sum / aggregated[l].count);

    chartConfig = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: `Average ${yColumn}`,
          data: values,
          backgroundColor: 'rgba(245, 158, 11, 0.6)',
          borderColor: 'rgba(245, 158, 11, 1)',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true }
        }
      }
    };
  }

  appState.chartInstances['comparisonChart'] = new Chart(ctx, chartConfig);
}

// ========== ✅ AI INSIGHTS WITH GEMINI API ==========
async function generateInsights() {
  if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) return;

  const data = appState.filteredData.length > 0 ? appState.filteredData : appState.originalData;
  const columns = Object.keys(data[0]);
  const insights = [];

  const numericCols = columns.filter(col => appState.columnTypes[col] === 'numeric');
  const categoricalCols = columns.filter(col => appState.columnTypes[col] === 'categorical' || appState.columnTypes[col] === 'text');

  insights.push({
    icon: '📊',
    title: 'Dataset Overview',
    description: `${data.length.toLocaleString()} records × ${columns.length} columns`,
    type: 'info'
  });

  let totalCells = data.length * columns.length;
  let missingCells = 0;
  columns.forEach(col => {
    missingCells += data.filter(row => !row[col] || row[col] === '').length;
  });

  const completeness = ((totalCells - missingCells) / totalCells * 100).toFixed(1);
  insights.push({
    icon: completeness > 95 ? '✅' : '⚠️',
    title: 'Data Completeness',
    description: `${completeness}% complete`,
    type: completeness > 95 ? 'success' : 'warning'
  });

  if (numericCols.length > 0) {
    const firstNumCol = numericCols[0];
    const stats = appState.columnStats[firstNumCol];
    if (stats) {
      insights.push({
        icon: '📈',
        title: `${firstNumCol} Stats`,
        description: `Avg: ${stats.mean}, Range: ${stats.min}-${stats.max}`,
        type: 'info'
      });
    }
  }

  // ✅ Try Gemini API for AI insights
  let aiInsightText = null;
  if (appState.geminiApiKey) {
    showToast('🤖 Generating AI insights...', 'info');

    const numericStats = numericCols.slice(0, 5).map(col => {
      const stats = appState.columnStats[col];
      return `${col}: Mean=${stats?.mean}, Median=${stats?.median}`;
    }).join('; ');

    const prompt = `Analyze this dataset: ${data.length} rows, columns: ${columns.join(', ')}. 
    Numeric columns: ${numericCols.join(', ')}. 
    Stats: ${numericStats}.
    Give 2-3 key insights in bullet points.`;

    aiInsightText = await callGeminiAPISafe(prompt);

    if (aiInsightText) {
      insights.push({
        icon: '🤖',
        title: 'AI Insights (Gemini)',
        description: aiInsightText.substring(0, 200) + '...',
        type: 'success'
      });
    }
  }

  renderQuickInsights(insights);
}

function renderQuickInsights(insights) {
  const grid = document.getElementById('quickInsightsGrid');
  if (!grid) return;

  grid.innerHTML = '';

  insights.forEach(insight => {
    const card = document.createElement('div');
    card.className = `insight-card insight-${insight.type}`;
    card.innerHTML = `
      <div class="insight-icon">${insight.icon}</div>
      <div class="insight-title">${insight.title}</div>
      <div class="insight-description">${insight.description}</div>
    `;
    grid.appendChild(card);
  });
}

// ========== TOAST NOTIFICATIONS ==========
function showToast(message, type = 'info') {
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${colors[type] || colors.info};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// Export functions
function exportCleanedData() {
  const data = appState.cleanedData;
  if (data.length === 0) {
    showToast('No data to export', 'warning');
    return;
  }

  const csv = convertToCSV(data);
  downloadFile(csv, 'cleaned_data.csv', 'text/csv');
  showToast('✅ Data exported', 'success');
}

function convertToCSV(data) {
  if (data.length === 0) return '';

  const columns = Object.keys(data[0]);
  let csv = columns.join(',') + '\n';

  data.forEach(row => {
    const values = columns.map(col => {
      const val = row[col] || '';
      return `"${val}"`;
    });
    csv += values.join(',') + '\n';
  });

  return csv;
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
