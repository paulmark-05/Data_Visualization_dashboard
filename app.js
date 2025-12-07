// ========== ENHANCED APPLICATION STATE ==========
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
        cleaningHistory: [] 
    },
    visualizationFilters: {},
    geminiApiKey: '' 
};

let filtersChanged = false;

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing DataVizard...');
    loadGeminiApiKeySecurely();
    initializeFileUpload();
    initializeApp();
});


function loadGeminiApiKeySecurely() {
    if (window.__GEMINI_API_KEY && window.__GEMINI_API_KEY.length > 10) {
        appState.geminiApiKey = window.__GEMINI_API_KEY;
        console.log('✅ Gemini API Key loaded from environment (Secure)');
        return;
    }
    
    try {
        const sessionKey = sessionStorage.getItem('__gemini_key');
        if (sessionKey && sessionKey.length > 10) {
            appState.geminiApiKey = sessionKey;
            console.log('✅ Gemini API Key loaded from session (Secure)');
            return;
        }
    } catch (e) {
        console.warn('⚠️ Session storage access denied');
    }
    
    if (window.GEMINI_API_KEY && window.GEMINI_API_KEY.length > 10) {
        appState.geminiApiKey = window.GEMINI_API_KEY;
        console.log('✅ Gemini API Key loaded from window variable');
        return;
    }
    
    console.warn('⚠️ Gemini API Key not found in environment. Using fallback (automated) insights only.');
    console.info('💡 To enable AI insights: Set GEMINI_API_KEY environment variable in Render');
}

/**
 * ✅ SECURE: Calls Gemini API with safety checks
 * No API key exposed in logs or errors
 * Graceful fallback if API unavailable
 */
async function callGeminiAPISafe(prompt) {
    // Validate API key exists and is valid length
    if (!appState.geminiApiKey || appState.geminiApiKey.length < 20) {
        console.warn('⚠️ No valid Gemini API key. Returning null for fallback.');
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
                contents: [{
                    parts: [{ text: prompt }]
                }],
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
        console.error('❌ API call failed (fallback available)');
        return null;
    }
}

// ========== FILE UPLOAD ==========
function initializeFileUpload() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');

    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', function(e) {
        if (e.target.tagName !== 'INPUT') fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) processFile(file);
    });

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
        if (file) processFile(file);
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
            showToast('Please upload data first from Home section', 'warning');
        }
        return;
    }
    
    if (sectionName === 'visualizations') {
        setTimeout(() => {
            initializeVisualizations();
        }, 50);
    } else if (sectionName === 'insights') {
        setTimeout(() => {
            generateInsights();
        }, 50);
    } else if (sectionName === 'quality') {
        setTimeout(() => {
            generateDataQuality();
        }, 50);
    }
}

function processFile(file) {
    const validExtensions = ['xlsx', 'xls', 'csv'];
    const fileExtension = file.name.split('.').pop().toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
        showToast('Please upload a valid Excel or CSV file', 'error');
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
            appState.cleaningActions = { removedDuplicates: 0, filledMissing: 0, removedOutliers: 0, history: [], missingValueDetails: [], outlierDetails: [] };
            
            detectColumnTypes(jsonData);
            computeColumnStats(jsonData);
            
            if (progressText) progressText.textContent = 'Complete!';
            if (progressFill) progressFill.style.width = '100%';
            
            setTimeout(() => {
                transitionToDataOverview();
            }, 500);
            
        } catch (error) {
            console.error('❌ Error processing file:', error);
            showToast('Error processing file: ' + error.message, 'error');
            if (progressDiv) progressDiv.style.display = 'none';
        }
    };
    
    reader.onerror = function() {
        console.error('❌ Error reading file');
        showToast('Error reading file', 'error');
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
    
    showToast('File uploaded successfully!', 'success');
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
                stats.sum = numValues.reduce((a, b) => a + b, 0).toFixed(2);
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
        table.innerHTML = '<p style="padding: 20px; text-align: center; color: #64748b;">No data to display</p>';
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
            const value = row[col] || '-';
            let displayValue = String(value);
            if (displayValue.length > 100) {
                displayValue = displayValue.substring(0, 97) + '...';
            }
            html += `<td title="${value}">${displayValue}</td>`;
        });
        html += '</tr>';
    });
    
    html += '</tbody>';
    table.innerHTML = html;
}


function generateDataQuality() {
    if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) return;
    
    const container = document.getElementById('qualityContainer');
    const data = appState.originalData;

    let html = '<div class="quality-grid">';

    // ✅ Missing Values Card with Individual Controls
    const columns = Object.keys(data[0]);
    const missingData = [];
    let totalMissing = 0;

    columns.forEach(col => {
        const missing = data.filter(row => !row[col] || row[col] === '').length;
        if (missing > 0) {
            const percentage = ((missing / data.length) * 100).toFixed(1);
            missingData.push({ column: col, count: missing, percentage });
            totalMissing += missing;
        }
    });

    html += '<div id="missingValuesSection" class="quality-card missing-values-card" data-section="missing">';
    html += '<h3>🔍 Missing Values</h3>';
    html += '<p style="color: var(--color-text-secondary); font-size: 14px; margin-bottom: 16px;">Choose handling method for each field.</p>';
    
    if (missingData.length === 0) {
        html += '<div style="padding: 20px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #166534;">✅ <strong>No missing values!</strong></div>';
    } else {
        html += '<div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 12px; margin-bottom: 16px; color: #991b1b;"><strong>⚠️ Found ' + totalMissing + ' missing values in ' + missingData.length + ' column(s)</strong></div>';
        
        missingData.forEach((item, idx) => {
            html += `<div class="missing-value-item-enhanced" style="padding: 12px; background: #fff5f5; border-left: 3px solid #fc8181; margin-bottom: 12px; border-radius: 4px;">`;
            html += `<div style="margin-bottom: 8px;"><strong>${item.column}</strong>: ${item.count} cells (${item.percentage}%)</div>`;
            html += `<select id="missingMethod_${idx}" onchange="updateMissingValueMethod('${item.column}', this.value)" style="padding: 6px; border: 1px solid #ddd; border-radius: 4px; width: 100%; font-size: 12px; cursor: pointer;">`;
            html += `<option value="">-- Select handling method --</option>`;
            if (appState.columnTypes[item.column] === 'numeric') {
                html += `<option value="mean">Fill with Mean</option>`;
                html += `<option value="median">Fill with Median</option>`;
                html += `<option value="forward_fill">Forward Fill</option>`;
            } else {
                html += `<option value="mode">Fill with Mode (Most Frequent)</option>`;
                html += `<option value="forward_fill">Forward Fill</option>`;
            }
            html += `<option value="remove">Remove Rows with Missing</option>`;
            html += `<option value="null">Leave as Null</option>`;
            html += `</select>`;
            html += `</div>`;
        });
        
        html += '<button class="btn btn-primary" onclick="applyAllMissingValueMethods()" style="margin-top: 16px; width: 100%; padding: 10px; cursor: pointer;">✅ Apply Selected Methods</button>';
    }
    html += '</div>';

    // ✅ Outliers Card with IQR Detection
    html += '<div id="outliersSection" class="quality-card outliers-card" data-section="outliers">';
    html += '<h3>📈 Outliers Detection (IQR Method)</h3>';
    html += '<p style="color: var(--color-text-secondary); font-size: 14px; margin-bottom: 12px;">Detect values beyond 1.5 × IQR range.</p>';
    
    const outliersDetails = detectOutliersWithDetails(data);
    if (Object.keys(outliersDetails).length === 0) {
        html += '<div style="padding: 20px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #166534;">✅ <strong>No outliers detected!</strong></div>';
    } else {
        let totalOutliers = 0;
        Object.keys(outliersDetails).forEach(col => {
            totalOutliers += outliersDetails[col].count;
        });
        html += `<div style="background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 12px; margin-bottom: 16px; color: #92400e;"><strong>⚠️ Found ${totalOutliers} outliers in ${Object.keys(outliersDetails).length} column(s)</strong></div>`;
        Object.keys(outliersDetails).forEach(col => {
            const details = outliersDetails[col];
            html += `<div style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 12px; margin-bottom: 8px; border-radius: 4px;">`;
            html += `<div style="margin-bottom: 6px;"><strong>${col}</strong>: ${details.count} outliers</div>`;
            html += `<div style="font-size: 11px; color: #92400e; margin-bottom: 8px;">Q1: ${details.q1.toFixed(2)} | Q3: ${details.q3.toFixed(2)} | IQR: ${details.iqr.toFixed(2)}</div>`;
            html += `<div style="font-size: 11px; color: #92400e; margin-bottom: 8px;">Valid Range: ${details.lowerBound.toFixed(2)} - ${details.upperBound.toFixed(2)}</div>`;
            html += `<select id="outlierMethod_${col}" onchange="updateOutlierMethod('${col}', this.value)" style="padding: 6px; border: 1px solid #d97706; border-radius: 4px; width: 100%; font-size: 12px; cursor: pointer;">`;
            html += `<option value="">-- Select handling method --</option>`;
            html += `<option value="remove">Remove Outlier Rows</option>`;
            html += `<option value="cap">Cap to Bounds (Min/Max)</option>`;
            html += `</select>`;
            html += `</div>`;
        });
        
        html += '<button class="btn btn-primary" onclick="applyAllOutlierMethods()" style="margin-top: 12px; width: 100%; padding: 10px; cursor: pointer;">✅ Apply Selected Methods</button>';
    }
    html += '</div>';

    // ✅ Duplicates Card
    html += '<div id="duplicatesSection" class="quality-card duplicates-card" data-section="duplicates">';
    html += '<h3>🔄 Duplicate Rows</h3>';
    const duplicates = findDuplicates(data);
    if (duplicates === 0) {
        html += '<div style="padding: 20px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #166534;">✅ <strong>No duplicates found!</strong></div>';
    } else {
        html += `<div style="padding: 16px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; color: #991b1b; margin-bottom: 12px;">⚠️ <strong>Found ${duplicates} duplicate rows (${((duplicates/data.length)*100).toFixed(1)}%)</strong></div>`;
        html += `<select id="duplicateMethod" onchange="updateDuplicateMethod(this.value)" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; width: 100%; margin-bottom: 8px; font-size: 12px; cursor: pointer;">`;
        html += `<option value="">-- Select handling method --</option>`;
        html += `<option value="remove_all">Remove All Duplicates</option>`;
        html += `<option value="keep_first">Keep First Occurrence</option>`;
        html += `</select>`;
        html += '<button class="btn btn-primary" onclick="applyDuplicateMethod()" style="width: 100%; padding: 10px; cursor: pointer;">✅ Apply Method</button>';
    }
    html += '</div>';

    // ✅ Cleaning Summary Card
    html += '<div id="cleaningSummarySection" class="quality-card cleaning-summary-card" data-section="summary">';
    html += '<h3>📊 Cleaning Summary</h3>';
    html += `<p><strong>Status:</strong> <span style="color: ${appState.cleanedData.length === appState.originalData.length ? '#10b981' : '#f59e0b'}; font-weight: 700;">${appState.cleanedData.length === appState.originalData.length ? '✅ Clean' : '⚠️ Needs Cleaning'}</span></p>`;
    html += `<div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin: 12px 0; font-size: 13px;">`;
    html += `<p style="margin: 4px 0;"><strong>Duplicates Removed:</strong> ${appState.cleaningActions.removedDuplicates}</p>`;
    html += `<p style="margin: 4px 0;"><strong>Missing Values Filled:</strong> ${appState.cleaningActions.filledMissing}</p>`;
    html += `<p style="margin: 4px 0;"><strong>Outliers Removed/Capped:</strong> ${appState.cleaningActions.removedOutliers}</p>`;
    html += `<p style="margin: 4px 0; color: #666;">Final rows: ${appState.cleanedData.length} / Original: ${appState.originalData.length}</p>`;
    html += `</div>`;
    
    if (Object.values(appState.cleaningActions).slice(0, 3).some(v => v > 0)) {
        html += '<button class="btn btn-secondary" onclick="resetCleaning()" style="margin-top: 8px; width: 100%; padding: 8px; cursor: pointer; font-size: 13px;">↶ Reset to Original</button>';
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
}

// ✅ MISSING VALUE HANDLERS
function updateMissingValueMethod(column, method) {
    if (!method) return;
    appState.pendingFilters[`missing_${column}`] = method;
}

function applyAllMissingValueMethods() {
    const columns = Object.keys(appState.originalData[0]);
    let totalFilled = 0;
    let totalRemoved = 0;
    
    columns.forEach(col => {
        const method = appState.pendingFilters[`missing_${col}`];
        if (!method) return;
        
        switch(method) {
            case 'mean':
                totalFilled += fillMissingWithMean(col);
                break;
            case 'median':
                totalFilled += fillMissingWithMedian(col);
                break;
            case 'mode':
                totalFilled += fillMissingWithMode(col);
                break;
            case 'forward_fill':
                totalFilled += forwardFillMissing(col);
                break;
            case 'remove':
                totalRemoved += removeMissingRows(col);
                break;
            case 'null':
                // Leave as is
                break;
        }
    });
    
    if (totalFilled > 0 || totalRemoved > 0) {
        appState.cleaningActions.filledMissing += totalFilled;
        appState.cleaningActions.removedOutliers += totalRemoved;
        appState.cleaningActions.history.push(`Applied missing value methods: Filled ${totalFilled}, Removed ${totalRemoved}`);
        appState.pendingFilters = {};
        showSuccessToast(`✅ Applied missing value handling: ${totalFilled} filled, ${totalRemoved} rows removed`);
        generateDataQuality();
        renderAllCharts();
    }
}

function fillMissingWithMean(column) {
    if (appState.columnTypes[column] !== 'numeric') return 0;
    
    let filled = 0;
    const values = appState.cleanedData
        .map(row => parseFloat(row[column]))
        .filter(v => !isNaN(v));
    
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    
    appState.cleanedData.forEach(row => {
        if (!row[column] || row[column] === '') {
            row[column] = mean.toFixed(2);
            filled++;
        }
    });
    
    return filled;
}

function fillMissingWithMedian(column) {
    if (appState.columnTypes[column] !== 'numeric') return 0;
    
    let filled = 0;
    const values = appState.cleanedData
        .map(row => parseFloat(row[column]))
        .filter(v => !isNaN(v));
    
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted.length % 2 
        ? sorted[Math.floor(sorted.length / 2)]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    
    appState.cleanedData.forEach(row => {
        if (!row[column] || row[column] === '') {
            row[column] = median.toFixed(2);
            filled++;
        }
    });
    
    return filled;
}

function fillMissingWithMode(column) {
    let filled = 0;
    const values = appState.cleanedData
        .map(row => row[column])
        .filter(v => v !== '' && v !== null && v !== undefined);
    
    if (values.length === 0) return 0;
    
    const frequency = {};
    values.forEach(v => {
        frequency[v] = (frequency[v] || 0) + 1;
    });
    
    const mode = Object.keys(frequency).reduce((a, b) => 
        frequency[a] > frequency[b] ? a : b
    );
    
    appState.cleanedData.forEach(row => {
        if (!row[column] || row[column] === '') {
            row[column] = mode;
            filled++;
        }
    });
    
    return filled;
}

function forwardFillMissing(column) {
    let filled = 0;
    let lastValue = null;
    
    appState.cleanedData.forEach(row => {
        if (row[column] && row[column] !== '') {
            lastValue = row[column];
        } else if (lastValue) {
            row[column] = lastValue;
            filled++;
        }
    });
    
    return filled;
}

function removeMissingRows(column) {
    const before = appState.cleanedData.length;
    appState.cleanedData = appState.cleanedData.filter(row => row[column] && row[column] !== '');
    return before - appState.cleanedData.length;
}

// ✅ OUTLIER HANDLERS (IQR Method)
function updateOutlierMethod(column, method) {
    if (!method) return;
    appState.pendingFilters[`outlier_${column}`] = method;
}

function applyAllOutlierMethods() {
    const outliersDetails = detectOutliersWithDetails(appState.cleanedData);
    let totalRemoved = 0;
    let totalCapped = 0;
    
    Object.keys(outliersDetails).forEach(col => {
        const method = appState.pendingFilters[`outlier_${col}`];
        if (!method) return;
        
        const details = outliersDetails[col];
        
        if (method === 'remove') {
            const before = appState.cleanedData.length;
            appState.cleanedData = appState.cleanedData.filter(row => {
                const val = parseFloat(row[col]);
                return isNaN(val) || (val >= details.lowerBound && val <= details.upperBound);
            });
            totalRemoved += before - appState.cleanedData.length;
        } else if (method === 'cap') {
            appState.cleanedData.forEach(row => {
                const val = parseFloat(row[col]);
                if (!isNaN(val)) {
                    if (val < details.lowerBound) {
                        row[col] = details.lowerBound.toFixed(2);
                        totalCapped++;
                    } else if (val > details.upperBound) {
                        row[col] = details.upperBound.toFixed(2);
                        totalCapped++;
                    }
                }
            });
        }
    });
    
    if (totalRemoved > 0 || totalCapped > 0) {
        appState.cleaningActions.removedOutliers += totalRemoved + totalCapped;
        appState.cleaningActions.history.push(`Handled outliers: Removed ${totalRemoved}, Capped ${totalCapped}`);
        appState.pendingFilters = {};
        showSuccessToast(`✅ Handled outliers: ${totalRemoved} removed, ${totalCapped} capped`);
        generateDataQuality();
        renderAllCharts();
    }
}

function detectOutliersWithDetails(data) {
    const outliersDetails = {};
    const columns = Object.keys(data[0]);
    
    columns.forEach(col => {
        if (appState.columnTypes[col] === 'numeric') {
            const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
            if (values.length > 3) {
                const sorted = [...values].sort((a, b) => a - b);
                const q1Idx = Math.floor(sorted.length * 0.25);
                const q3Idx = Math.floor(sorted.length * 0.75);
                
                const q1 = sorted[q1Idx];
                const q3 = sorted[q3Idx];
                const iqr = q3 - q1;
                const lowerBound = q1 - 1.5 * iqr;
                const upperBound = q3 + 1.5 * iqr;
                
                const outlierCount = values.filter(v => v < lowerBound || v > upperBound).length;
                if (outlierCount > 0) {
                    outliersDetails[col] = {
                        count: outlierCount,
                        q1: q1,
                        q3: q3,
                        iqr: iqr,
                        lowerBound: lowerBound,
                        upperBound: upperBound
                    };
                }
            }
        }
    });
    
    return outliersDetails;
}

// ✅ DUPLICATE HANDLERS
function updateDuplicateMethod(method) {
    appState.pendingFilters.duplicateMethod = method;
}

function applyDuplicateMethod() {
    const method = appState.pendingFilters.duplicateMethod;
    if (!method) {
        showToast('Select a handling method', 'warning');
        return;
    }
    
    const before = appState.cleanedData.length;
    
    if (method === 'remove_all') {
        const seen = new Set();
        appState.cleanedData = appState.cleanedData.filter(row => {
            const key = JSON.stringify(row);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    } else if (method === 'keep_first') {
        const seen = new Set();
        appState.cleanedData = appState.cleanedData.filter(row => {
            const key = JSON.stringify(row);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    
    const removed = before - appState.cleanedData.length;
    if (removed > 0) {
        appState.cleaningActions.removedDuplicates += removed;
        appState.cleaningActions.history.push(`Removed ${removed} duplicates using ${method}`);
        appState.pendingFilters = {};
        showSuccessToast(`✅ Removed ${removed} duplicate rows`);
        generateDataQuality();
        renderAllCharts();
    }
}

function findDuplicates(data) {
    const seen = new Set();
    let duplicates = 0;
    data.forEach(row => {
        const key = JSON.stringify(row);
        if (seen.has(key)) {
            duplicates++;
        } else {
            seen.add(key);
        }
    });
    return duplicates;
}

function resetCleaning() {
    appState.cleanedData = JSON.parse(JSON.stringify(appState.originalData));
    appState.cleaningActions = { removedDuplicates: 0, filledMissing: 0, removedOutliers: 0, history: [], missingValueDetails: [], outlierDetails: [] };
    appState.uploadedData = appState.cleanedData;
    appState.pendingFilters = {};
    showSuccessToast('✓ Reset to original data');
    generateDataQuality();
    renderAllCharts();
    generateInsights();
}

// ========== ✅ ENHANCED DYNAMIC VISUALIZATION FILTERS ==========
/**
 * Two-step filter system:
 * Step 1: Select field (dropdown 1)
 * Step 2: Select values from that field (dropdown 2)
 * Multi-select capabilities
 */
function generateFilters() {
    const container = document.getElementById('filtersContainer2');
    if (!container) return;
    
    const data = appState.uploadedData;
    if (data.length === 0) return;

    const columns = Object.keys(data[0]);
    const filterableColumns = columns.filter(col => {
        const type = appState.columnTypes[col];
        const uniqueCount = new Set(data.map(r => r[col])).size;
        return type === 'categorical' || (type === 'numeric' && uniqueCount < 50) || (type === 'text' && uniqueCount < 100);
    });

    if (filterableColumns.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No categorical columns available.</p>';
        return;
    }

    let html = '<div style="margin-bottom: 16px;">';
    html += '<label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 13px;">📊 Step 1: Select Field to Filter</label>';
    html += '<select id="filterFieldSelect" onchange="updateFilterValues()" style="padding: 8px; border: 1px solid #ddd; border-radius: 6px; width: 100%; font-size: 12px; cursor: pointer; background: #fff;">';
    html += '<option value="">-- Choose a field --</option>';
    filterableColumns.forEach(col => {
        html += `<option value="${col}">${col}</option>`;
    });
    html += '</select>';
    html += '</div>';

    html += '<div style="margin-bottom: 16px;">';
    html += '<label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 13px;">🔍 Step 2: Select Values (Multi-Select)</label>';
    html += '<div id="filterValuesContainer" style="display: none; max-height: 250px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; padding: 8px; background: #fafafa;">';
    html += '</div>';
    html += '<p id="noValuesMessage" style="text-align: center; color: #999; padding: 16px; font-size: 12px;">Select a field first</p>';
    html += '</div>';

    container.innerHTML = html;
}

function updateFilterValues() {
    const fieldSelect = document.getElementById('filterFieldSelect');
    const valuesContainer = document.getElementById('filterValuesContainer');
    const noValuesMessage = document.getElementById('noValuesMessage');
    
    if (!fieldSelect.value) {
        valuesContainer.style.display = 'none';
        noValuesMessage.style.display = 'block';
        return;
    }
    
    const column = fieldSelect.value;
    const data = appState.uploadedData;
    const uniqueValues = [...new Set(data.map(row => String(row[column])).filter(v => v))].sort().slice(0, 100);
    
    if (uniqueValues.length === 0) {
        noValuesMessage.style.display = 'block';
        valuesContainer.style.display = 'none';
        return;
    }
    
    let html = '';
    uniqueValues.forEach((val, idx) => {
        const safeId = `filter_val_${idx}`;
        html += `<div style="margin-bottom: 6px; display: flex; align-items: center;">`;
        html += `<input type="checkbox" id="${safeId}" class="filter-value-checkbox" data-column="${column}" data-value="${val}" style="margin-right: 8px; cursor: pointer;">`;
        html += `<label for="${safeId}" style="cursor: pointer; font-size: 12px;">${val}</label>`;
        html += `</div>`;
    });
    
    valuesContainer.innerHTML = html;
    valuesContainer.style.display = 'block';
    noValuesMessage.style.display = 'none';
}

function applyFiltersClick() {
    const fieldSelect = document.getElementById('filterFieldSelect');
    const column = fieldSelect.value;
    
    if (!column) {
        showToast('Select a field to filter', 'warning');
        return;
    }
    
    const selectedValues = [];
    document.querySelectorAll('.filter-value-checkbox:checked').forEach(checkbox => {
        selectedValues.push(checkbox.dataset.value);
    });
    
    if (selectedValues.length === 0) {
        showToast('Select at least one value', 'warning');
        return;
    }
    
    appState.activeFilters[column] = selectedValues;
    
    const originalCount = appState.uploadedData.length;
    let filtered = [...appState.uploadedData];
    
    Object.keys(appState.activeFilters).forEach(filterCol => {
        const filterValues = appState.activeFilters[filterCol];
        filtered = filtered.filter(row => filterValues.includes(String(row[filterCol])));
    });
    
    appState.filteredData = filtered;
    const filteredCount = appState.filteredData.length;
    
    renderAllCharts();
    generateInsights();
    
    showSuccessToast(`✓ Filters applied! Showing ${filteredCount} of ${originalCount} rows`);
}

function clearAllFilters() {
    appState.activeFilters = {};
    appState.filteredData = [];
    document.getElementById('filterFieldSelect').value = '';
    document.getElementById('filterValuesContainer').style.display = 'none';
    document.getElementById('noValuesMessage').style.display = 'block';
    document.querySelectorAll('.filter-value-checkbox').forEach(cb => cb.checked = false);
    
    renderAllCharts();
    generateInsights();
    showSuccessToast('✓ All filters cleared');
}

// ========== VISUALIZATIONS ==========
function initializeVisualizations() {
    console.log('🎨 initializeVisualizations called');
    
    if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) {
        console.warn('❌ No data available for visualizations');
        return;
    }
    
    const data = appState.uploadedData;
    console.log('✅ Initializing with', data.length, 'rows');
    
    const noVizMsg = document.getElementById('noVisualizationsMessage');
    const filtersPanel = document.getElementById('filtersPanel');
    if (noVizMsg) noVizMsg.style.display = 'none';
    if (filtersPanel) filtersPanel.style.display = 'block';
    
    generateFilters();
    
    const columns = Object.keys(data[0]);
    console.log('📋 Columns found:', columns);
    
    const categoricalColumns = columns.filter(col => {
        const uniqueValues = [...new Set(data.map(row => row[col]))];
        return uniqueValues.length < 50 || appState.columnTypes[col] === 'categorical';
    });
    const numericColumns = columns.filter(col => appState.columnTypes[col] === 'numeric');
    
    // Categorical Charts
    if (categoricalColumns.length > 0) {
        document.getElementById('categoricalSection').style.display = 'block';
        populateSelect('categoricalColumnSelect', categoricalColumns);
        const catSelect = document.getElementById('categoricalColumnSelect');
        if (catSelect) {
            catSelect.value = categoricalColumns[0];
            if (!catSelect.__listener) {
                catSelect.addEventListener('change', function() {
                    renderCategoricalChart(this.value);
                });
                catSelect.__listener = true;
            }
            renderCategoricalChart(categoricalColumns[0]);
        }
    } else {
        document.getElementById('categoricalSection').style.display = 'none';
    }
    
    // Numeric Charts
    if (numericColumns.length > 0) {
        document.getElementById('numericSection').style.display = 'block';
        populateSelect('numericColumnSelect', numericColumns);
        const numSelect = document.getElementById('numericColumnSelect');
        if (numSelect) {
            numSelect.value = numericColumns[0];
            if (!numSelect.__listener) {
                numSelect.addEventListener('change', function() {
                    renderNumericChart(this.value);
                });
                numSelect.__listener = true;
            }
            renderNumericChart(numericColumns[0]);
        }
    } else {
        document.getElementById('numericSection').style.display = 'none';
    }
    
    // Pie Charts
    if (categoricalColumns.length > 0) {
        document.getElementById('pieSection').style.display = 'block';
        populateSelect('pieColumnSelect', categoricalColumns);
        const pieSelect = document.getElementById('pieColumnSelect');
        if (pieSelect) {
            pieSelect.value = categoricalColumns[0];
            if (!pieSelect.__listener) {
                pieSelect.addEventListener('change', function() {
                    renderPieChartViz(this.value);
                });
                pieSelect.__listener = true;
            }
            renderPieChartViz(categoricalColumns[0]);
        }
    } else {
        document.getElementById('pieSection').style.display = 'none';
    }
    
    // Comparison Charts
    if (columns.length >= 2) {
        document.getElementById('comparisonSection').style.display = 'block';
        populateSelect('xAxisSelect', columns);
        populateSelect('yAxisSelect', numericColumns.length > 0 ? numericColumns : columns);
        populateSelect('groupBySelect', ['None', ...categoricalColumns]);
        
        const xSelect = document.getElementById('xAxisSelect');
        const ySelect = document.getElementById('yAxisSelect');
        const chartTypeSelect = document.getElementById('comparisonChartType');
        
        if (xSelect) xSelect.value = columns[0];
        if (ySelect && numericColumns.length > 0) ySelect.value = numericColumns[0];
        
        if (xSelect && !xSelect.__listener) {
            xSelect.addEventListener('change', renderComparisonChart);
            xSelect.__listener = true;
        }
        if (ySelect && !ySelect.__listener) {
            ySelect.addEventListener('change', renderComparisonChart);
            ySelect.__listener = true;
        }
        if (chartTypeSelect && !chartTypeSelect.__listener) {
            chartTypeSelect.addEventListener('change', renderComparisonChart);
            chartTypeSelect.__listener = true;
        }
        
        renderComparisonChart();
    } else {
        document.getElementById('comparisonSection').style.display = 'none';
    }
    
    console.log('✅ Visualizations initialized!');
}

function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = '<option value="">Choose a column...</option>';
    options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        select.appendChild(opt);
    });
}

function renderCategoricalChart(columnName) {
    if (!columnName) return;
    
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const container = document.getElementById('categoricalChart');
    
    if (!container) return;
    
    if (appState.chartInstances['categoricalChart']) {
        appState.chartInstances['categoricalChart'].destroy();
    }
    
    container.innerHTML = '<canvas id="categoricalChartCanvas"></canvas>';
    const ctx = document.getElementById('categoricalChartCanvas');
    if (!ctx) return;
    
    const ctxObj = ctx.getContext('2d');
    
    const frequencies = {};
    data.forEach(row => {
        const value = String(row[columnName] || 'N/A');
        frequencies[value] = (frequencies[value] || 0) + 1;
    });
    
    const sorted = Object.entries(frequencies).sort((a, b) => b[1] - a[1]);
    const labels = sorted.slice(0, 20).map(x => x[0]);
    const values = sorted.slice(0, 20).map(x => x[1]);
    const colors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B'];
    
    appState.chartInstances['categoricalChart'] = new Chart(ctxObj, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Count',
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: colors.slice(0, labels.length),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: labels.length > 5 ? 'y' : 'x',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = values.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed.y / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed.y} (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true }
            }
        }
    });
}

function renderNumericChart(columnName) {
    if (!columnName) return;
    
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const container = document.getElementById('numericChart');
    
    if (!container) return;
    
    if (appState.chartInstances['numericChart']) {
        appState.chartInstances['numericChart'].destroy();
    }
    
    container.innerHTML = '<canvas id="numericChartCanvas"></canvas>';
    const ctx = document.getElementById('numericChartCanvas');
    if (!ctx) return;
    
    const ctxObj = ctx.getContext('2d');
    
    const values = data.map(row => parseFloat(row[columnName])).filter(v => !isNaN(v));
    if (values.length === 0) {
        container.innerHTML = '<p class="no-data">No numeric data</p>';
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
    
    appState.chartInstances['numericChart'] = new Chart(ctxObj, {
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
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true }
            }
        }
    });
}

function renderPieChartViz(columnName) {
    if (!columnName) return;
    
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const container = document.getElementById('pieChart');
    
    if (!container) return;
    
    if (appState.chartInstances['pieChart']) {
        appState.chartInstances['pieChart'].destroy();
    }
    
    container.innerHTML = '<canvas id="pieChartCanvas"></canvas>';
    const ctx = document.getElementById('pieChartCanvas');
    if (!ctx) return;
    
    const ctxObj = ctx.getContext('2d');
    
    const frequencies = {};
    data.forEach(row => {
        const value = String(row[columnName] || 'N/A');
        frequencies[value] = (frequencies[value] || 0) + 1;
    });
    
    const sorted = Object.entries(frequencies).sort((a, b) => b[1] - a[1]);
    const labels = sorted.slice(0, 12).map(x => x[0]);
    const values = sorted.slice(0, 12).map(x => x[1]);
    const colors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B'];
    
    appState.chartInstances['pieChart'] = new Chart(ctxObj, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { size: 11 }, padding: 15 }
                }
            }
        }
    });
}

function renderComparisonChart() {
    const chartType = document.getElementById('comparisonChartType')?.value || 'scatter';
    const xColumn = document.getElementById('xAxisSelect')?.value;
    const yColumn = document.getElementById('yAxisSelect')?.value;
    
    if (!xColumn || !yColumn) return;
    
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const container = document.getElementById('comparisonChart');
    
    if (!container) return;
    
    if (appState.chartInstances['comparisonChart']) {
        appState.chartInstances['comparisonChart'].destroy();
    }
    
    container.innerHTML = '<canvas id="comparisonChartCanvas"></canvas>';
    const ctx = document.getElementById('comparisonChartCanvas');
    if (!ctx) return;
    
    const ctxObj = ctx.getContext('2d');
    
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
                indexAxis: labels.length > 10 ? 'y' : 'x',
                plugins: { legend: { display: true } },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true }
                }
            }
        };
    }
    
    appState.chartInstances['comparisonChart'] = new Chart(ctxObj, chartConfig);
}

function renderAllCharts() {
    const catSelect = document.getElementById('categoricalColumnSelect');
    if (catSelect && catSelect.value) renderCategoricalChart(catSelect.value);
    
    const numSelect = document.getElementById('numericColumnSelect');
    if (numSelect && numSelect.value) renderNumericChart(numSelect.value);
    
    const pieSelect = document.getElementById('pieColumnSelect');
    if (pieSelect && pieSelect.value) renderPieChartViz(pieSelect.value);
    
    const xAxisSelect = document.getElementById('xAxisSelect');
    const yAxisSelect = document.getElementById('yAxisSelect');
    if (xAxisSelect && yAxisSelect && xAxisSelect.value && yAxisSelect.value) renderComparisonChart();
}

// ========== ✅ AI INSIGHTS WITH GEMINI API (SECURE) ==========
async function generateInsights() {
    if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) return;
    
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
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
            <h4>${insight.title}</h4>
            <p>${insight.description}</p>
        `;
        grid.appendChild(card);
    });
}

/**
 * ✅ SECURE: Generate insights with Gemini API
 * Reads uploaded file content
 * Takes user prompt
 * Returns AI-powered insights
 * Falls back gracefully if API unavailable
 */
async function generateInsightsDocument() {
    const userPrompt = document.getElementById('insightsRequest')?.value?.trim();
    if (!userPrompt) {
        showToast('Please describe what insights you want', 'warning');
        return;
    }
    
    console.log('🤖 Generating insights with Gemini API...');
    showToast('🔄 Generating insights...', 'info');
    
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const columns = Object.keys(data[0]);
    
    // Prepare data context for Gemini
    const numericCols = columns.filter(col => appState.columnTypes[col] === 'numeric');
    const categoricalCols = columns.filter(col => appState.columnTypes[col] === 'categorical');
    
    let dataContext = `Dataset Analysis Request:\n`;
    dataContext += `File: ${appState.fileName}\n`;
    dataContext += `Total Records: ${data.length}\n`;
    dataContext += `Columns: ${columns.length}\n`;
    dataContext += `Numeric Fields: ${numericCols.join(', ')}\n`;
    dataContext += `Categorical Fields: ${categoricalCols.join(', ')}\n\n`;
    
    dataContext += `Key Statistics:\n`;
    numericCols.slice(0, 5).forEach(col => {
        const stats = appState.columnStats[col];
        if (stats) {
            dataContext += `- ${col}: Mean=${stats.mean}, Median=${stats.median}, StdDev=${stats.stdDev}\n`;
        }
    });
    
    dataContext += `\nCleaning Actions Applied:\n`;
    if (appState.cleaningActions.history.length > 0) {
        appState.cleaningActions.history.forEach(action => {
            dataContext += `- ${action}\n`;
        });
    } else {
        dataContext += `- None\n`;
    }
    
    dataContext += `\nUser Request:\n${userPrompt}`;
    
    // Call Gemini API safely
    let aiResponse = null;
    if (appState.geminiApiKey && appState.geminiApiKey.length > 20) {
        aiResponse = await callGeminiAPISafe(dataContext);
    }
    
    // Build insights document
    let insightContent = `<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">📊 Analysis: ${userPrompt}</h3>`;
    insightContent += `<p style="font-size: 13px; color: #666; margin-bottom: 20px;">Generated: ${new Date().toLocaleString()}${aiResponse ? ' (AI-Powered with Gemini)' : ' (Automated Analysis)'}</p>`;
    insightContent += `<hr style="border: none; border-top: 1px solid #ddd; margin-bottom: 20px;">`;
    
    if (aiResponse) {
        insightContent += `<h4 style="font-size: 15px; font-weight: 700; margin-top: 20px; margin-bottom: 12px;">🤖 AI Analysis</h4>`;
        insightContent += `<div style="font-size: 13px; line-height: 1.8; background: #f9fafb; padding: 12px; border-left: 3px solid #3b82f6; border-radius: 4px;">${aiResponse}</div>`;
    }
    
    // Fallback: Automated Analysis
    insightContent += `<h4 style="font-size: 15px; font-weight: 700; margin-top: 20px; margin-bottom: 12px;">📈 Automated Analysis</h4>`;
    insightContent += `<ul style="font-size: 13px; line-height: 1.8;">`;
    insightContent += `<li><strong>Dataset Size:</strong> ${data.length.toLocaleString()} records with ${columns.length} variables</li>`;
    
    let totalMissing = 0;
    columns.forEach(col => {
        totalMissing += data.filter(row => !row[col] || row[col] === '').length;
    });
    insightContent += `<li><strong>Data Quality:</strong> ${totalMissing} missing values total. ${((1 - totalMissing / (data.length * columns.length)) * 100).toFixed(1)}% completeness</li>`;
    
    if (numericCols.length > 0) {
        insightContent += `<li><strong>Numeric Columns:</strong> ${numericCols.length} found (${numericCols.join(', ')})</li>`;
        const firstNum = numericCols[0];
        const stats = appState.columnStats[firstNum];
        if (stats) {
            insightContent += `<li><strong>Sample Statistic (${firstNum}):</strong> Mean=${stats.mean}, Min=${stats.min}, Max=${stats.max}</li>`;
        }
    }
    
    if (appState.cleaningActions.history.length > 0) {
        insightContent += `<li><strong>Cleaning Applied:</strong> ${appState.cleaningActions.history.join('; ')}</li>`;
    }
    
    insightContent += `</ul>`;
    
    document.getElementById('insightsDocumentContent').innerHTML = insightContent;
    document.getElementById('generatedInsights').style.display = 'block';
    document.getElementById('insightsGeneratedDate').textContent = `Generated: ${new Date().toLocaleString()}`;
    
    showSuccessToast('✓ Insights generated!');
}

// ========== EXPORT ==========
function exportFilteredData() {
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const columns = Object.keys(data[0]);
    
    let csv = columns.join(',') + '\n';
    data.forEach(row => {
        csv += columns.map(col => `"${row[col]}"`).join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_${new Date().getTime()}.csv`;
    a.click();
    showSuccessToast('✓ Data exported!');
}

function exportSummary() {
    const data = appState.uploadedData;
    const columns = Object.keys(data[0]);
    let summary = `DataVizard Summary Report\n`;
    summary += `Generated: ${new Date().toLocaleString()}\n\n`;
    summary += `Total Rows: ${data.length}\n`;
    summary += `Total Columns: ${columns.length}\n\n`;
    summary += `Cleaning Actions: ${appState.cleaningActions.history.join(', ') || 'None'}\n\n`;
    summary += `Columns:\n`;
    columns.forEach(col => {
        const stats = appState.columnStats[col];
        summary += `- ${col} (${appState.columnTypes[col]})\n`;
    });
    
    const blob = new Blob([summary], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summary_${new Date().getTime()}.txt`;
    a.click();
    showSuccessToast('✓ Summary exported!');
}

function exportInsights() {
    const insights = {
        timestamp: new Date().toISOString(),
        fileName: appState.fileName,
        totalRows: appState.uploadedData.length,
        totalColumns: Object.keys(appState.uploadedData[0]).length,
        cleaningActions: appState.cleaningActions,
        columnStats: appState.columnStats,
        columnTypes: appState.columnTypes
    };
    
    const blob = new Blob([JSON.stringify(insights, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insights_${new Date().getTime()}.json`;
    a.click();
    showSuccessToast('✓ Insights exported!');
}

// ========== TOAST NOTIFICATIONS ==========
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.textContent = message;
    
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    
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
        font-weight: 500;
        letter-spacing: 0.3px;
        font-size: 14px;
        animation: slideInUp 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function showSuccessToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #10b981;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        z-index: 10000;
        font-weight: 500;
        letter-spacing: 0.3px;
        font-size: 14px;
        animation: slideInUp 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ========== UTILITIES ==========
function toggleFiltersPanel() {
    const content = document.getElementById('filtersContent');
    if (content) {
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
    }
}

function downloadChartImage(chartId) {
    const canvas = document.getElementById(chartId + 'Canvas') || document.querySelector(`#${chartId} canvas`);
    if (!canvas) {
        showToast('Chart not found', 'warning');
        return;
    }
    
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${chartId}-${new Date().getTime()}.png`;
    link.click();
    showSuccessToast('✓ Chart downloaded!');
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInUp {
        from {
            transform: translateY(20px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);
