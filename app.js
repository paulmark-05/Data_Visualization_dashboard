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
        detailedLogs: []
    },
    visualizationFilters: {},
    geminiApiKey: '',
    undoStack: [],
    cleaningLogs: [],
    isDataClean: true,
    lastInsightsPrompt: '',
    correlations: [],
    trends: []
};

let filtersChanged = false;

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DataVizard Initializing...');
    try {
        loadGeminiApiKeySecurely();
        initializeFileUploadHandlers();
        initializeApp();
        console.log('✅ Initialization complete');
    } catch (error) {
        console.error('❌ Initialization error:', error);
    }
});

// ========== FILE UPLOAD INITIALIZATION ==========
function initializeFileUploadHandlers() {
    console.log('📁 Setting up file upload handlers...');
    
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    
    console.log('Dropzone:', dropzone ? '✅ Found' : '❌ Not found');
    console.log('FileInput:', fileInput ? '✅ Found' : '❌ Not found');

    if (!dropzone || !fileInput) {
        console.error('❌ Upload elements not found in DOM');
        return;
    }

    // File input change event
    fileInput.addEventListener('change', function(e) {
        console.log('📄 File input change event triggered');
        const file = e.target.files[0];
        if (file) {
            console.log('📤 File selected:', file.name, '|', formatFileSize(file.size));
            processFile(file);
        } else {
            console.warn('⚠️ No file selected');
        }
    });

    // Dropzone click
    dropzone.addEventListener('click', function(e) {
        console.log('🖱️ Dropzone clicked');
        if (e.target.tagName !== 'INPUT') {
            fileInput.click();
        }
    });

    // Drag over
    dropzone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.style.background = '#f0f0f0';
        this.style.borderColor = '#1FB8CD';
    });

    // Drag leave
    dropzone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.style.background = '#f9f9f9';
        this.style.borderColor = '#1A1A1A';
    });

    // Drop
    dropzone.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.style.background = '#f9f9f9';
        this.style.borderColor = '#1A1A1A';
        
        const file = e.dataTransfer.files[0];
        if (file) {
            console.log('📥 File dropped:', file.name);
            fileInput.files = e.dataTransfer.files;
            processFile(file);
        } else {
            console.warn('⚠️ No file in drop event');
        }
    });

    console.log('✅ Upload handlers initialized');
}

function loadGeminiApiKeySecurely() {
    // Priority 1: Direct window variable (most secure for production)
    if (window.__GEMINI_API_KEY && window.__GEMINI_API_KEY.length > 10) {
        appState.geminiApiKey = window.__GEMINI_API_KEY;
        console.log('✅ Gemini API Key loaded from secure variable');
        return;
    }
    
    // Priority 2: Session storage
    try {
        const sessionKey = sessionStorage.getItem('__gemini_key');
        if (sessionKey && sessionKey.length > 10) {
            appState.geminiApiKey = sessionKey;
            console.log('✅ Gemini API Key from session storage');
            return;
        }
    } catch (e) {
        console.warn('⚠️ Session storage access denied');
    }
    
    // Priority 3: Global GEMINI_API_KEY
    if (window.GEMINI_API_KEY && window.GEMINI_API_KEY.length > 10) {
        appState.geminiApiKey = window.GEMINI_API_KEY;
        console.log('✅ Gemini API Key from global variable');
        return;
    }
    
    console.warn('⚠️ No Gemini API Key found - AI insights will be unavailable');
}

// ========== ENHANCED GEMINI API CALL WITH ERROR HANDLING ==========
async function callGeminiAPISafe(prompt, maxTokens = 1500, temperature = 0.7) {
    if (!appState.geminiApiKey || appState.geminiApiKey.length < 20) {
        console.warn('⚠️ Gemini API Key not available');
        return null;
    }
    
    try {
        console.log('🤖 Calling Gemini API...');
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${appState.geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: maxTokens,
                    temperature: temperature,
                    topP: 0.95,
                    topK: 40
                },
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_NONE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_NONE"
                    }
                ]
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Gemini API error:', response.status, errorText);
            return null;
        }
        
        const data = await response.json();
        const result = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
        
        if (result) {
            console.log('✅ Gemini API response received');
        } else {
            console.warn('⚠️ Empty response from Gemini API');
        }
        
        return result;
    } catch (error) {
        console.error('❌ Gemini API call failed:', error);
        return null;
    }
}

// ========== QUICK INSIGHTS (OPTIMIZED FOR SPEED) ==========
async function generateQuickInsight(userQuery) {
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const columns = Object.keys(data[0]);
    const numericCols = columns.filter(col => appState.columnTypes[col] === 'numeric');
    
    // Use only first 100 rows for quick analysis
    const sampleData = data.slice(0, 100);
    
    let quickPrompt = `Dataset Quick Analysis (${sampleData.length} rows sample):\n`;
    quickPrompt += `Columns: ${columns.slice(0, 5).join(', ')}\n`;
    
    if (numericCols.length > 0) {
        const firstNumCol = numericCols[0];
        const stats = appState.columnStats[firstNumCol];
        quickPrompt += `${firstNumCol}: mean=${stats.mean}, range=[${stats.min}, ${stats.max}]\n`;
    }
    
    quickPrompt += `\nUser Question: ${userQuery}\n\n`;
    quickPrompt += `Provide ONE major finding and ONE immediate recommendation (max 2 sentences total).`;
    
    // Use lower max tokens and higher temperature for faster response
    return await callGeminiAPISafe(quickPrompt, 150, 0.9);
}

// ========== APP INITIALIZATION ==========
function initializeApp() {
    console.log('🔧 Initializing app navigation...');
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            if (section) switchSection(null, section);
        });
    });
    console.log('✅ Navigation initialized');
}

// ========== SHOW UPLOAD AREA ==========
function showUploadArea() {
    console.log('📂 Showing upload area...');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const uploadArea = document.getElementById('uploadArea');
    
    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (uploadArea) uploadArea.style.display = 'block';
    
    console.log('✅ Upload area displayed');
}

// ========== FILE PROCESSING ==========
function processFile(file) {
    console.log('🔄 Processing file:', file.name);
    
    const validExtensions = ['xlsx', 'xls', 'csv'];
    const fileExtension = file.name.split('.').pop().toLowerCase();
    
    console.log('📋 File extension:', fileExtension);
    
    if (!validExtensions.includes(fileExtension)) {
        console.error('❌ Invalid file format:', fileExtension);
        showToast('Invalid file format. Use .xlsx, .xls, or .csv', 'error');
        return;
    }
    
    appState.fileName = file.name;
    appState.fileSize = file.size;
    
    const progressDiv = document.getElementById('uploadProgress');
    const progressText = document.getElementById('progressText');
    const progressFill = document.getElementById('progressFill');
    
    if (progressDiv) {
        progressDiv.style.display = 'block';
        if (progressText) progressText.textContent = 'Reading file...';
        if (progressFill) progressFill.style.width = '20%';
        console.log('📊 Progress bar shown');
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            console.log('📖 File loaded, parsing...');
            if (progressText) progressText.textContent = 'Parsing data...';
            if (progressFill) progressFill.style.width = '60%';
            
            let jsonData;
            
            if (fileExtension === 'csv') {
                console.log('🔄 Parsing CSV...');
                jsonData = parseCSV(e.target.result);
            } else {
                console.log('🔄 Parsing Excel...');
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                jsonData = XLSX.utils.sheet_to_json(firstSheet);
            }
            
            console.log('✅ Parsed', jsonData.length, 'rows');
            
            if (!jsonData || jsonData.length === 0) {
                throw new Error('File is empty or invalid');
            }
            
            if (progressText) progressText.textContent = 'Processing...';
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
                detailedLogs: []
            };
            appState.undoStack = [];
            appState.cleaningLogs = [];
            appState.isDataClean = true;
            appState.correlations = [];
            appState.trends = [];
            
            console.log('🔍 Detecting column types...');
            detectColumnTypes(jsonData);
            console.log('📊 Computing statistics...');
            computeColumnStats(jsonData);
            console.log('🔗 Computing correlations...');
            computeCorrelations(jsonData);
            
            if (progressText) progressText.textContent = 'Complete!';
            if (progressFill) progressFill.style.width = '100%';
            
            console.log('✅ Upload complete');
            
            setTimeout(() => {
                transitionToDataOverview();
            }, 500);
            
        } catch (error) {
            console.error('❌ Error processing file:', error);
            showToast('Error: ' + error.message, 'error');
            if (progressDiv) progressDiv.style.display = 'none';
        }
    };
    
    reader.onerror = function(error) {
        console.error('❌ File read error:', error);
        showToast('Error reading file', 'error');
        if (progressDiv) progressDiv.style.display = 'none';
    };
    
    reader.onprogress = function(event) {
        if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            console.log('📈 Reading:', Math.round(percentComplete) + '%');
        }
    };
    
    if (fileExtension === 'csv') {
        console.log('📖 Reading as text...');
        reader.readAsText(file);
    } else {
        console.log('📖 Reading as array buffer...');
        reader.readAsArrayBuffer(file);
    }
}

function parseCSV(text) {
    console.log('🔄 Parsing CSV text...');
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
        console.warn('⚠️ CSV has less than 2 lines');
        return [];
    }
    
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
    
    console.log('✅ CSV parsed:', data.length, 'rows');
    return data;
}

function switchSection(e, sectionName) {
    if (e) e.preventDefault();
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(s => s.classList.remove('active'));
    const targetSection = document.getElementById(`section-${sectionName}`);
    if (targetSection) targetSection.classList.add('active');
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => link.classList.remove('active'));
    const activeLink = document.querySelector(`[data-section="${sectionName}"]`);
    if (activeLink) activeLink.classList.add('active');
    if (!appState.isDataLoaded && sectionName !== 'dashboard') {
        showToast('Upload data first', 'warning');
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

function transitionToDataOverview() {
    console.log('🎯 Transitioning to data overview...');
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('dataOverview').style.display = 'block';
    updateDashboardOverview();
    generateDataQuality();
    generateFilters();
    initializeVisualizations();
    generateInsights();
    showToast('✅ File uploaded successfully!', 'success');
    console.log('✅ Data overview ready');
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
    console.log('✅ Column types detected');
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
    console.log('✅ Statistics computed');
}

// ========== CORRELATION ANALYSIS ==========
function computeCorrelations(data) {
    if (!data || data.length === 0) return;
    const numericCols = Object.keys(data[0]).filter(col => appState.columnTypes[col] === 'numeric');
    appState.correlations = [];
    
    for (let i = 0; i < numericCols.length; i++) {
        for (let j = i + 1; j < numericCols.length; j++) {
            const col1 = numericCols[i];
            const col2 = numericCols[j];
            const correlation = calculateCorrelation(data, col1, col2);
            if (Math.abs(correlation) > 0.5) { // Only store significant correlations
                appState.correlations.push({
                    col1,
                    col2,
                    value: correlation.toFixed(3),
                    strength: Math.abs(correlation) > 0.8 ? 'Strong' : 'Moderate'
                });
            }
        }
    }
    
    // Sort by absolute correlation value
    appState.correlations.sort((a, b) => Math.abs(parseFloat(b.value)) - Math.abs(parseFloat(a.value)));
    console.log('✅ Correlations computed:', appState.correlations.length, 'significant pairs');
}

function calculateCorrelation(data, col1, col2) {
    const values1 = data.map(row => parseFloat(row[col1])).filter(v => !isNaN(v));
    const values2 = data.map(row => parseFloat(row[col2])).filter(v => !isNaN(v));
    
    if (values1.length === 0 || values2.length === 0) return 0;
    
    const n = Math.min(values1.length, values2.length);
    const mean1 = values1.reduce((a, b) => a + b, 0) / n;
    const mean2 = values2.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;
    
    for (let i = 0; i < n; i++) {
        const diff1 = values1[i] - mean1;
        const diff2 = values2[i] - mean2;
        numerator += diff1 * diff2;
        denominator1 += diff1 * diff1;
        denominator2 += diff2 * diff2;
    }
    
    if (denominator1 === 0 || denominator2 === 0) return 0;
    return numerator / Math.sqrt(denominator1 * denominator2);
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

function displayDataPreview(rows) {
    const table = document.getElementById('dataPreviewTable');
    if (!table) return;
    if (!rows || rows.length === 0) {
        table.innerHTML = '<p style="padding: 20px; text-align: center; color: #64748b;">No data</p>';
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

function resetUpload() {
    appState.originalData = [];
    appState.uploadedData = [];
    appState.filteredData = [];
    appState.cleanedData = [];
    appState.isDataLoaded = false;
    document.getElementById('welcomeScreen').style.display = 'block';
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('dataOverview').style.display = 'none';
    document.getElementById('fileInput').value = '';
    showToast('Ready for new upload', 'info');
}

// ========== UNDO/REDO & LOGGING SYSTEMS ==========
function pushToUndoStack() {
    appState.undoStack.push({
        timestamp: new Date(),
        cleanedData: JSON.parse(JSON.stringify(appState.cleanedData)),
        cleaningActions: JSON.parse(JSON.stringify(appState.cleaningActions)),
        uploadedData: JSON.parse(JSON.stringify(appState.uploadedData))
    });
    updateUndoButton();
}

function undoLastAction() {
    if (appState.undoStack.length === 0) {
        showToast('No actions to undo', 'warning');
        return;
    }
    const previousState = appState.undoStack.pop();
    appState.cleanedData = previousState.cleanedData;
    appState.cleaningActions = previousState.cleaningActions;
    appState.uploadedData = previousState.uploadedData;
    appState.isDataClean = JSON.stringify(appState.cleanedData) === JSON.stringify(appState.originalData);
    addCleaningLog('UNDO', 'Undid last action', 'Reverted to previous state');
    showSuccessToast('↶ Undid last action');
    generateDataQuality();
    renderAllCharts();
    generateInsights();
    updateUndoButton();
}

function updateUndoButton() {
    const btn = document.getElementById('undoButton');
    if (btn) {
        btn.disabled = appState.undoStack.length === 0;
        btn.style.opacity = appState.undoStack.length === 0 ? '0.5' : '1';
        btn.textContent = `↶ UNDO (${appState.undoStack.length})`;
    }
}

// ========== ENHANCED CLEANING LOG WITH DESCRIPTIONS ==========
function addCleaningLog(action, title, details) {
    appState.cleaningLogs.push({
        timestamp: new Date().toLocaleString(),
        action: action,
        title: title,
        details: details,
        cleanedRows: appState.cleanedData.length,
        removedRows: appState.originalData.length - appState.cleanedData.length
    });
    updateCleaningLogDisplay();
}

function updateCleaningLogDisplay() {
    const logsContainer = document.getElementById('cleaningLogsContainer');
    if (!logsContainer) return;
    if (appState.cleaningLogs.length === 0) {
        logsContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No actions yet</p>';
        return;
    }
    let html = '<div style="font-size: 11px; line-height: 1.8;">';
    appState.cleaningLogs.slice().reverse().forEach((log) => {
        const actionColor = log.action === 'UNDO' ? '#f59e0b' : '#10b981';
        html += `<div style="padding: 8px; background: #f9fafb; border-left: 3px solid ${actionColor}; margin-bottom: 6px; border-radius: 3px;">`;
        html += `<div style="font-weight: 700; color: ${actionColor}; margin-bottom: 4px;">${log.action}</div>`;
        html += `<div style="font-size: 10px; color: #999; margin-bottom: 3px;">${log.timestamp}</div>`;
        html += `<div style="color: #111; font-weight: 600;">${log.title}</div>`;
        html += `<div style="color: #666; font-size: 10px; margin-top: 2px;">${log.details}</div>`;
        html += `<div style="color: #999; font-size: 10px; margin-top: 4px;">Rows: ${log.cleanedRows} | Removed: ${log.removedRows}</div>`;
        html += `</div>`;
    });
    html += '</div>';
    logsContainer.innerHTML = html;
}

function downloadCleaningLog() {
    let logContent = `Data Cleaning Log - DataVizard\n`;
    logContent += `${'='.repeat(60)}\n`;
    logContent += `Generated: ${new Date().toLocaleString()}\n`;
    logContent += `File: ${appState.fileName}\n`;
    logContent += `Original Rows: ${appState.originalData.length}\n`;
    logContent += `Final Rows: ${appState.cleanedData.length}\n`;
    logContent += `Removed Rows: ${appState.originalData.length - appState.cleanedData.length}\n\n`;
    
    logContent += `${'='.repeat(60)}\n`;
    logContent += `CLEANING HISTORY\n`;
    logContent += `${'='.repeat(60)}\n\n`;
    
    appState.cleaningLogs.forEach((log, index) => {
        logContent += `[${index + 1}] ${log.action} - ${log.timestamp}\n`;
        logContent += `    ${log.title}\n`;
        logContent += `    ${log.details}\n`;
        logContent += `    Status: ${log.cleanedRows} rows remaining (${log.removedRows} removed)\n\n`;
    });
    
    logContent += `${'='.repeat(60)}\n`;
    logContent += `SUMMARY OF ACTIONS\n`;
    logContent += `${'='.repeat(60)}\n`;
    appState.cleaningActions.history.forEach((action, index) => {
        logContent += `${index + 1}. ${action}\n`;
    });
    
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cleaning_log_${appState.fileName.replace(/\.[^/.]+$/, '')}_${new Date().getTime()}.txt`;
    a.click();
    showSuccessToast('✓ Log downloaded');
}

// ========== CLEANING METHODS CONFIGURATION ==========
const CLEANING_METHODS = {
    missing: {
        remove: {
            title: '🗑️ Remove Rows',
            description: 'Delete rows with missing values. Use when data loss is acceptable.',
            impact: 'Rows removed permanently',
            use_case: '✓ Few missing | ✓ Random missing | ✗ Large data loss'
        },
        mean: {
            title: '📊 Fill Mean',
            description: 'Replace with average. Good for normal distributions.',
            impact: 'Reduces variance',
            use_case: '✓ Numeric | ✓ Normal data | ✗ Skewed data'
        },
        median: {
            title: '📈 Fill Median',
            description: 'Replace with middle value. Robust to outliers.',
            impact: 'Preserves distribution',
            use_case: '✓ Numeric | ✓ Skewed | ✓ Outliers'
        },
        mode: {
            title: '🏷️ Fill Mode',
            description: 'Replace with most frequent. For categorical data.',
            impact: 'Adds category bias',
            use_case: '✓ Categorical | ✓ Clear dominant | ✗ Balanced'
        },
        forward_fill: {
            title: '⬇️ Forward Fill',
            description: 'Use previous row value. For time-series.',
            impact: 'Assumes continuity',
            use_case: '✓ Time-series | ✓ Sequential | ✗ Random'
        },
        null: {
            title: '❓ Keep Null',
            description: 'Leave unchanged. When missingness is informative.',
            impact: 'No changes',
            use_case: '✓ Informative | ✓ Advanced tools'
        }
    },
    outliers: {
        remove: {
            title: '🗑️ Remove Rows',
            description: 'Delete outlier rows. Use when outliers are errors.',
            impact: 'Data loss',
            use_case: '✓ Errors | ✓ Few outliers | ✗ Valid extremes'
        },
        cap: {
            title: '📊 Cap Bounds',
            description: 'Limit to [Q1-1.5×IQR, Q3+1.5×IQR]. Keeps data.',
            impact: 'Reduces extreme values',
            use_case: '✓ Valid outliers | ✓ Keeps data | ✓ Reduces impact'
        }
    },
    duplicates: {
        remove_all: {
            title: '🗑️ Remove All',
            description: 'Delete all duplicates, keep unique.',
            impact: 'Removes duplicates',
            use_case: '✓ Clear duplicates | ✓ Data errors'
        },
        keep_first: {
            title: '⭐ Keep First',
            description: 'Keep first, remove rest in each group.',
            impact: 'Keeps one copy',
            use_case: '✓ Duplicate records | ✓ Most common'
        }
    }
};

// ========== DATA QUALITY GENERATION ==========
function generateDataQuality() {
    if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) return;
    const container = document.getElementById('qualityContainer');
    const data = appState.originalData;
    
    appState.isDataClean = JSON.stringify(appState.cleanedData) === JSON.stringify(appState.originalData);
    const cleanStatusColor = appState.isDataClean ? '#10b981' : '#f59e0b';
    const cleanStatusText = appState.isDataClean ? '✅ CLEAN' : '⚠️ PROCESSING';

    let html = `<div style="background: ${cleanStatusColor}; color: white; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-weight: 700;">${cleanStatusText}</div>`;
    html += `<button id="undoButton" class="btn btn-secondary" style="width: 100%; padding: 10px; margin-bottom: 16px; cursor: pointer;" onclick="undoLastAction()">↶ UNDO (${appState.undoStack.length})</button>`;
    html += '<div class="quality-grid" style="display: grid; gap: 16px;">';

    const columns = Object.keys(data[0]);
    const missingData = [];
    let totalMissing = 0;

    columns.forEach(col => {
        const missing = data.filter(row => !row[col] || row[col] === '').length;
        if (missing > 0) {
            const percentage = ((missing / data.length) * 100).toFixed(1);
            const missingType = detectMissingType(data, col);
            missingData.push({ column: col, count: missing, percentage, missingType });
            totalMissing += missing;
        }
    });

    // MISSING VALUES
    html += '<div id="missingValuesSection" class="quality-card" style="border: 1px solid #fca5a5; background: #fff5f5; padding: 16px; border-radius: 6px;">';
    html += '<h3 style="margin-top: 0;">🔍 Missing Values</h3>';
    if (missingData.length === 0) {
        html += '<div style="padding: 16px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #166534;">✅ No missing values detected!</div>';
    } else {
        html += `<div style="padding: 12px; background: #fef2f2; border: 1px solid #fc8181; border-radius: 6px; margin-bottom: 12px; color: #991b1b;">`;
        html += `⚠️ Detected ${totalMissing} missing values across ${missingData.length} column(s) (${((totalMissing/(data.length*columns.length))*100).toFixed(2)}% of total data)`;
        html += `</div>`;
        missingData.forEach((item) => {
            html += `<div style="padding: 12px; background: #fef9f7; border: 1px solid #fed7aa; margin-bottom: 12px; border-radius: 6px;">`;
            html += `<p style="margin: 0 0 6px 0; font-weight: 700; font-size: 13px;">${item.column}</p>`;
            html += `<p style="margin: 0 0 8px 0; font-size: 11px; color: #991b1b;">`;
            html += `<strong>${item.count}</strong> missing values (${item.percentage}% of ${data.length} rows)<br>`;
            html += `Type: ${item.missingType}`;
            html += `</p>`;
            html += `<div style="display: flex; flex-wrap: wrap; gap: 6px;">`;
            const methodsForType = appState.columnTypes[item.column] === 'numeric' 
                ? ['mean', 'median', 'forward_fill', 'remove', 'null']
                : ['mode', 'forward_fill', 'remove', 'null'];
            methodsForType.forEach(method => {
                const methodData = CLEANING_METHODS.missing[method];
                html += `<button class="btn btn-sm" style="padding: 6px 10px; font-size: 11px; cursor: pointer; background: #e5e7eb; border: 1px solid #9ca3af; color: #000; border-radius: 4px;" 
                    title="${methodData.description}\n${methodData.use_case}" 
                    onclick="applyMissingMethod('${item.column}', '${method}')"><strong>${methodData.title}</strong></button>`;
            });
            html += `</div></div>`;
        });
    }
    html += '</div>';

    // OUTLIERS
    html += '<div id="outliersSection" class="quality-card" style="border: 1px solid #fde047; background: #fefce8; padding: 16px; border-radius: 6px;">';
    html += '<h3 style="margin-top: 0;">📈 Outliers</h3>';
    const outliersDetails = detectOutliersWithDetails(data);
    if (Object.keys(outliersDetails).length === 0) {
        html += '<div style="padding: 16px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #166534;">✅ No outliers detected using IQR method!</div>';
    } else {
        let totalOutliers = 0;
        Object.keys(outliersDetails).forEach(col => { totalOutliers += outliersDetails[col].count; });
        html += `<div style="padding: 12px; background: #fefce8; border: 1px solid #fde047; border-radius: 6px; margin-bottom: 12px; color: #92400e;">`;
        html += `⚠️ Detected ${totalOutliers} outliers in ${Object.keys(outliersDetails).length} numeric column(s) using IQR method`;
        html += `</div>`;
        Object.keys(outliersDetails).forEach(col => {
            const details = outliersDetails[col];
            html += `<div style="padding: 12px; background: #fffbeb; border: 1px solid #fed7aa; margin-bottom: 12px; border-radius: 6px;">`;
            html += `<p style="margin: 0 0 6px 0; font-weight: 700; font-size: 13px;">${col}</p>`;
            html += `<p style="margin: 0 0 8px 0; font-size: 11px; color: #92400e;">`;
            html += `<strong>${details.count}</strong> outliers detected<br>`;
            html += `Valid range: [${details.lowerBound.toFixed(2)}, ${details.upperBound.toFixed(2)}]<br>`;
            html += `Q1=${details.q1.toFixed(2)}, Q3=${details.q3.toFixed(2)}, IQR=${details.iqr.toFixed(2)}`;
            html += `</p>`;
            html += `<div style="display: flex; gap: 6px;">`;
            ['remove', 'cap'].forEach(method => {
                const methodData = CLEANING_METHODS.outliers[method];
                html += `<button class="btn btn-sm" style="padding: 6px 10px; font-size: 11px; cursor: pointer; background: #fed7aa; border: 1px solid #f59e0b; color: #000; border-radius: 4px;" 
                    title="${methodData.description}\n${methodData.use_case}" 
                    onclick="applyOutlierMethod('${col}', '${method}')"><strong>${methodData.title}</strong></button>`;
            });
            html += `</div></div>`;
        });
    }
    html += '</div>';

    // DUPLICATES
    html += '<div id="duplicatesSection" class="quality-card" style="border: 1px solid #a78bfa; background: #faf5ff; padding: 16px; border-radius: 6px;">';
    html += '<h3 style="margin-top: 0;">🔄 Duplicates</h3>';
    const duplicates = findDuplicates(data);
    if (duplicates === 0) {
        html += '<div style="padding: 16px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #166534;">✅ No duplicate rows detected!</div>';
    } else {
        html += `<div style="padding: 12px; background: #faf5ff; border: 1px solid #a78bfa; border-radius: 6px; margin-bottom: 12px; color: #6b21a8;">`;
        html += `⚠️ Detected ${duplicates} duplicate rows (${((duplicates/data.length)*100).toFixed(1)}% of total ${data.length} rows)<br>`;
        html += `<span style="font-size: 11px;">Exact matches based on all column values</span>`;
        html += `</div>`;
        html += `<div style="display: flex; gap: 6px;">`;
        ['remove_all', 'keep_first'].forEach(method => {
            const methodData = CLEANING_METHODS.duplicates[method];
            html += `<button class="btn btn-sm" style="padding: 8px 12px; font-size: 11px; cursor: pointer; background: #e9d5ff; border: 1px solid #d8b4fe; color: #000; border-radius: 4px;" 
                title="${methodData.description}\n${methodData.use_case}" 
                onclick="applyDuplicateMethod('${method}')"><strong>${methodData.title}</strong></button>`;
        });
        html += `</div>`;
    }
    html += '</div>';

    // SUMMARY
    html += '<div id="cleaningSummarySection" class="quality-card" style="border: 1px solid #b0e0e6; background: #f0feff; padding: 16px; border-radius: 6px;">';
    html += '<h3 style="margin-top: 0;">📊 Summary</h3>';
    html += `<p><strong>Original:</strong> ${appState.originalData.length} rows</p>`;
    html += `<p><strong>Current:</strong> ${appState.cleanedData.length} rows</p>`;
    html += `<p><strong>Removed:</strong> ${appState.originalData.length - appState.cleanedData.length} rows</p>`;
    html += `<p><strong>Status:</strong> <span style="color: ${cleanStatusColor}; font-weight: 700;">${cleanStatusText}</span></p>`;
    html += `<p><strong>Actions:</strong> ${appState.cleaningActions.history.length}</p>`;
    if (appState.cleaningActions.history.length > 0) {
        html += '<ul style="font-size: 12px; margin: 8px 0; padding-left: 20px;">';
        appState.cleaningActions.history.slice(-5).forEach(action => {
            html += `<li>${action}</li>`;
        });
        html += '</ul>';
    }
    html += '</div>';
    html += '</div>';
    container.innerHTML = html;
    updateUndoButton();
}

function detectMissingType(data, column) {
    const sample = data.map(row => row[column]).filter((v, i) => i < 10);
    const hasNull = sample.some(v => v === null);
    const hasUndefined = sample.some(v => v === undefined);
    const hasEmptyString = sample.some(v => v === '');
    
    let types = [];
    if (hasNull) types.push('NULL');
    if (hasUndefined) types.push('undefined');
    if (hasEmptyString) types.push('empty string ""');
    
    return types.length > 0 ? types.join(', ') : 'unknown';
}

function applyMissingMethod(column, method) {
    pushToUndoStack();
    let filled = 0;
    const methodInfo = CLEANING_METHODS.missing[method];
    
    switch(method) {
        case 'mean': filled = fillMissingWithMean(column); break;
        case 'median': filled = fillMissingWithMedian(column); break;
        case 'mode': filled = fillMissingWithMode(column); break;
        case 'forward_fill': filled = forwardFillMissing(column); break;
        case 'remove': filled = removeMissingRows(column); break;
        case 'null': 
            appState.undoStack.pop(); // No actual changes
            showToast('Keeping missing values unchanged', 'info');
            return;
    }
    
    if (filled > 0) {
        appState.cleaningActions.filledMissing += filled;
        const historyEntry = `${methodInfo.title}: ${filled} values in "${column}"`;
        appState.cleaningActions.history.push(historyEntry);
        appState.isDataClean = false;
        
        const detailDescription = method === 'remove' 
            ? `Removed ${filled} rows with missing values in the "${column}" column (${((filled/appState.originalData.length)*100).toFixed(2)}% of dataset)`
            : `Filled ${filled} missing values in "${column}" using ${method} strategy`;
        
        addCleaningLog('MISSING', methodInfo.title, detailDescription);
        showSuccessToast(`✅ ${column}: ${filled} values handled`);
        generateDataQuality();
        renderAllCharts();
        generateInsights();
    }
}

function applyOutlierMethod(column, method) {
    pushToUndoStack();
    const outliersDetails = detectOutliersWithDetails(appState.cleanedData);
    const details = outliersDetails[column];
    if (!details) {
        showToast('No outliers found', 'info');
        appState.undoStack.pop();
        return;
    }
    
    let affected = 0;
    const methodInfo = CLEANING_METHODS.outliers[method];
    
    if (method === 'remove') {
        const before = appState.cleanedData.length;
        appState.cleanedData = appState.cleanedData.filter(row => {
            const val = parseFloat(row[column]);
            return isNaN(val) || (val >= details.lowerBound && val <= details.upperBound);
        });
        affected = before - appState.cleanedData.length;
    } else if (method === 'cap') {
        appState.cleanedData.forEach(row => {
            const val = parseFloat(row[column]);
            if (!isNaN(val)) {
                if (val < details.lowerBound) {
                    row[column] = details.lowerBound.toFixed(2);
                    affected++;
                } else if (val > details.upperBound) {
                    row[column] = details.upperBound.toFixed(2);
                    affected++;
                }
            }
        });
    }
    
    if (affected > 0) {
        appState.cleaningActions.removedOutliers += affected;
        appState.cleaningActions.history.push(`${methodInfo.title}: ${affected} outliers in "${column}"`);
        appState.isDataClean = false;
        
        const detailDescription = method === 'remove'
            ? `Removed ${affected} rows with outlier values in "${column}" outside range [${details.lowerBound.toFixed(2)}, ${details.upperBound.toFixed(2)}] (${((affected/appState.originalData.length)*100).toFixed(2)}% of dataset)`
            : `Capped ${affected} outlier values in "${column}" to bounds [${details.lowerBound.toFixed(2)}, ${details.upperBound.toFixed(2)}] using IQR method`;
        
        addCleaningLog('OUTLIER', methodInfo.title, detailDescription);
        showSuccessToast(`✅ ${column}: ${affected} outliers ${method === 'remove' ? 'removed' : 'capped'}`);
        generateDataQuality();
        renderAllCharts();
        generateInsights();
    }
}

function applyDuplicateMethod(method) {
    pushToUndoStack();
    const before = appState.cleanedData.length;
    const seen = new Set();
    const methodInfo = CLEANING_METHODS.duplicates[method];
    
    appState.cleanedData = appState.cleanedData.filter(row => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    
    const removed = before - appState.cleanedData.length;
    if (removed > 0) {
        appState.cleaningActions.removedDuplicates += removed;
        appState.cleaningActions.history.push(`${methodInfo.title}: ${removed} duplicate rows`);
        appState.isDataClean = false;
        
        const detailDescription = `Removed ${removed} duplicate rows based on exact match across all columns (${((removed/appState.originalData.length)*100).toFixed(2)}% of original dataset)`;
        
        addCleaningLog('DUPLICATE', methodInfo.title, detailDescription);
        showSuccessToast(`✅ Removed ${removed} duplicates`);
        generateDataQuality();
        renderAllCharts();
        generateInsights();
    } else {
        appState.undoStack.pop();
        showToast('No duplicates found', 'info');
    }
}

function fillMissingWithMean(column) {
    if (appState.columnTypes[column] !== 'numeric') return 0;
    let filled = 0;
    const values = appState.cleanedData.map(row => parseFloat(row[column])).filter(v => !isNaN(v));
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
    const values = appState.cleanedData.map(row => parseFloat(row[column])).filter(v => !isNaN(v));
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
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
    const values = appState.cleanedData.map(row => row[column]).filter(v => v !== '' && v !== null && v !== undefined);
    if (values.length === 0) return 0;
    const frequency = {};
    values.forEach(v => { frequency[v] = (frequency[v] || 0) + 1; });
    const mode = Object.keys(frequency).reduce((a, b) => frequency[a] > frequency[b] ? a : b);
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
                    outliersDetails[col] = { count: outlierCount, q1, q3, iqr, lowerBound, upperBound };
                }
            }
        }
    });
    return outliersDetails;
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

// ========== FILTERS ==========
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
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No filterable columns</p>';
        return;
    }
    let html = '<div><label style="display: block; margin-bottom: 8px; font-weight: 600;">📊 Field</label>';
    html += '<select id="filterFieldSelect" onchange="updateFilterValues()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">';
    html += '<option value="">Choose...</option>';
    filterableColumns.forEach(col => html += `<option value="${col}">${col}</option>`);
    html += '</select></div>';
    html += '<div style="margin-top: 12px;"><label style="display: block; margin-bottom: 8px; font-weight: 600;">🔍 Values</label>';
    html += '<div id="filterValuesContainer" style="display: none; max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; padding: 8px; background: #fafafa;"></div>';
    html += '<p id="noValuesMessage" style="text-align: center; color: #999; padding: 16px; font-size: 12px;">Select a field</p></div>';
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
        showToast('Select a field', 'warning');
        return;
    }
    const selectedValues = [];
    document.querySelectorAll('.filter-value-checkbox:checked').forEach(checkbox => {
        selectedValues.push(checkbox.dataset.value);
    });
    if (selectedValues.length === 0) {
        showToast('Select values', 'warning');
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
    renderAllCharts();
    generateInsights();
    showSuccessToast(`✓ ${filtered.length} of ${originalCount} rows`);
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
    showSuccessToast('✓ Filters cleared');
}

// ========== VISUALIZATIONS ==========
function initializeVisualizations() {
    if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) return;
    const data = appState.uploadedData;
    const noVizMsg = document.getElementById('noVisualizationsMessage');
    const filtersPanel = document.getElementById('filtersPanel');
    if (noVizMsg) noVizMsg.style.display = 'none';
    if (filtersPanel) filtersPanel.style.display = 'block';
    generateFilters();
    const columns = Object.keys(data[0]);
    const categoricalColumns = columns.filter(col => {
        const uniqueValues = [...new Set(data.map(row => row[col]))];
        return uniqueValues.length < 50 || appState.columnTypes[col] === 'categorical';
    });
    const numericColumns = columns.filter(col => appState.columnTypes[col] === 'numeric');
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
}

function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">Choose...</option>';
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
    if (appState.chartInstances['categoricalChart']) appState.chartInstances['categoricalChart'].destroy();
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
            datasets: [{ label: 'Count', data: values, backgroundColor: colors.slice(0, labels.length), borderColor: colors.slice(0, labels.length), borderWidth: 2 }]
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
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
        }
    });
}

function renderNumericChart(columnName) {
    if (!columnName) return;
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const container = document.getElementById('numericChart');
    if (!container) return;
    if (appState.chartInstances['numericChart']) appState.chartInstances['numericChart'].destroy();
    container.innerHTML = '<canvas id="numericChartCanvas"></canvas>';
    const ctx = document.getElementById('numericChartCanvas');
    if (!ctx) return;
    const ctxObj = ctx.getContext('2d');
    const values = data.map(row => parseFloat(row[columnName])).filter(v => !isNaN(v));
    if (values.length === 0) {
        container.innerHTML = '<p class="no-data">No data</p>';
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
            datasets: [{ label: 'Frequency', data: bins, backgroundColor: 'rgba(16, 185, 129, 0.6)', borderColor: 'rgba(16, 185, 129, 1)', borderWidth: 2 }]
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
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const container = document.getElementById('pieChart');
    if (!container) return;
    if (appState.chartInstances['pieChart']) appState.chartInstances['pieChart'].destroy();
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
            datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderColor: '#ffffff', borderWidth: 2 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 15 } } }
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
    if (appState.chartInstances['comparisonChart']) appState.chartInstances['comparisonChart'].destroy();
    container.innerHTML = '<canvas id="comparisonChartCanvas"></canvas>';
    const ctx = document.getElementById('comparisonChartCanvas');
    if (!ctx) return;
    const ctxObj = ctx.getContext('2d');
    let chartConfig;
    if (chartType === 'scatter') {
        const points = data.map(row => ({ x: parseFloat(row[xColumn]) || 0, y: parseFloat(row[yColumn]) || 0 })).filter(p => !isNaN(p.x) && !isNaN(p.y)).slice(0, 500);
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
                scales: { x: { grid: { color: '#e5e5e5' } }, y: { grid: { color: '#e5e5e5' } } }
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
                datasets: [{ label: yColumn, data: values, borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)', borderWidth: 2, fill: true, tension: 0.3 }]
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
                datasets: [{ label: `Average ${yColumn}`, data: values, backgroundColor: 'rgba(245, 158, 11, 0.6)', borderColor: 'rgba(245, 158, 11, 1)', borderWidth: 2 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: labels.length > 10 ? 'y' : 'x',
                plugins: { legend: { display: true } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
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

// ========== ENHANCED INSIGHTS WITH PERSONALIZATION ==========
async function generateInsights() {
    if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) return;
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const columns = Object.keys(data[0]);
    const insights = [];
    const numericCols = columns.filter(col => appState.columnTypes[col] === 'numeric');
    const categoricalCols = columns.filter(col => appState.columnTypes[col] === 'categorical' || appState.columnTypes[col] === 'text');
    
    insights.push({ icon: '📊', title: 'Dataset', description: `${data.length.toLocaleString()} × ${columns.length}`, type: 'info' });
    
    let totalCells = data.length * columns.length;
    let missingCells = 0;
    columns.forEach(col => {
        missingCells += data.filter(row => !row[col] || row[col] === '').length;
    });
    const completeness = ((totalCells - missingCells) / totalCells * 100).toFixed(1);
    insights.push({ icon: completeness > 95 ? '✅' : '⚠️', title: 'Completeness', description: `${completeness}%`, type: completeness > 95 ? 'success' : 'warning' });
    
    if (numericCols.length > 0) {
        const firstNumCol = numericCols[0];
        const stats = appState.columnStats[firstNumCol];
        if (stats) {
            insights.push({ icon: '📈', title: `${firstNumCol}`, description: `μ=${stats.mean}`, type: 'info' });
        }
    }
    
    if (categoricalCols.length > 0) {
        const uniqueCatCount = new Set(data.map(r => r[categoricalCols[0]])).size;
        insights.push({ icon: '🏷️', title: `Categories`, description: `${uniqueCatCount} unique`, type: 'info' });
    }
    
    if (appState.cleaningActions.history.length > 0) {
        insights.push({ icon: '✨', title: 'Cleaned', description: `${appState.cleaningActions.history.length} actions`, type: 'success' });
    }
    
    insights.push({ icon: appState.isDataClean ? '✅' : '🔄', title: 'Status', description: appState.isDataClean ? 'CLEAN' : 'PROCESSING', type: appState.isDataClean ? 'success' : 'warning' });
    
    renderQuickInsights(insights);
    await generateEnhancedAIInsights();
}

// ========== ENHANCED AI INSIGHTS WITH TRENDS & RECOMMENDATIONS ==========
async function generateEnhancedAIInsights() {
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const columns = Object.keys(data[0]);
    const numericCols = columns.filter(col => appState.columnTypes[col] === 'numeric');
    const categoricalCols = columns.filter(col => appState.columnTypes[col] === 'categorical');
    
    // Build comprehensive data context
    let prompt = `You are a data analyst. Analyze this dataset and provide ACTIONABLE insights.\n\n`;
    prompt += `DATASET OVERVIEW:\n`;
    prompt += `- File: ${appState.fileName}\n`;
    prompt += `- Records: ${data.length} rows\n`;
    prompt += `- Columns: ${columns.length} (${numericCols.length} numeric, ${categoricalCols.length} categorical)\n\n`;
    
    prompt += `NUMERIC FEATURES:\n`;
    numericCols.slice(0, 5).forEach(col => {
        const s = appState.columnStats[col];
        prompt += `- ${col}: mean=${s.mean}, median=${s.median}, std=${s.stdDev}, range=[${s.min}, ${s.max}]\n`;
    });
    
    if (appState.correlations.length > 0) {
        prompt += `\nCORRELATIONS (significant pairs):\n`;
        appState.correlations.slice(0, 3).forEach(corr => {
            prompt += `- ${corr.col1} ↔ ${corr.col2}: ${corr.value} (${corr.strength})\n`;
        });
    }
    
    if (categoricalCols.length > 0) {
        prompt += `\nCATEGORICAL FEATURES:\n`;
        categoricalCols.slice(0, 3).forEach(col => {
            const unique = new Set(data.map(r => r[col])).size;
            prompt += `- ${col}: ${unique} unique values\n`;
        });
    }
    
    if (appState.cleaningActions.history.length > 0) {
        prompt += `\nCLEANING APPLIED:\n`;
        appState.cleaningActions.history.slice(-3).forEach(action => {
            prompt += `- ${action}\n`;
        });
    }
    
    prompt += `\nPROVIDE ANALYSIS IN THIS FORMAT:\n\n`;
    prompt += `## 🔍 Top 3 Trends/Patterns:\n`;
    prompt += `1. [Describe the most significant trend]\n`;
    prompt += `2. [Second most important pattern]\n`;
    prompt += `3. [Third notable finding]\n\n`;
    prompt += `## 💡 Actionable Recommendations:\n`;
    prompt += `1. [Specific action user should take]\n`;
    prompt += `2. [Second concrete recommendation]\n`;
    prompt += `3. [Third practical suggestion]\n\n`;
    prompt += `Keep each point to 1-2 sentences. Be specific and data-driven.`;
    
    let aiResponse = null;
    if (appState.geminiApiKey && appState.geminiApiKey.length > 20) {
        console.log('🤖 Generating enhanced AI insights...');
        aiResponse = await callGeminiAPISafe(prompt, 2000, 0.7);
    }
    
    let insightContent = `<h4 style="font-size: 14px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">`;
    insightContent += aiResponse ? '🤖 AI-Powered Insights' : '📊 Automated Summary';
    insightContent += `</h4>`;
    
    if (aiResponse) {
        insightContent += `<div style="font-size: 12px; line-height: 1.8; background: #f3f4f6; padding: 16px; border-left: 4px solid #3b82f6; border-radius: 4px; white-space: pre-wrap;">${aiResponse}</div>`;
    } else {
        insightContent += `<div style="font-size: 12px; line-height: 1.7; background: #f9fafb; padding: 14px; border-left: 4px solid #94a3b8; border-radius: 4px;">`;
        insightContent += `<strong>📊 Dataset Summary:</strong><br>`;
        insightContent += `• ${data.length} records across ${columns.length} features<br>`;
        insightContent += `• Data completeness: ${((1 - data.filter(r => Object.values(r).some(v => !v)).length / data.length) * 100).toFixed(1)}%<br>`;
        if (numericCols.length > 0) {
            insightContent += `• ${numericCols.length} numeric features for analysis<br>`;
        }
        if (appState.correlations.length > 0) {
            insightContent += `• ${appState.correlations.length} significant correlations detected<br>`;
        }
        insightContent += `<br><em>💡 Tip: Configure your Gemini API key for AI-powered insights with trends and recommendations.</em>`;
        insightContent += `</div>`;
    }
    
    document.getElementById('autoInsightsContent').innerHTML = insightContent;
}

function renderQuickInsights(insights) {
    const grid = document.getElementById('quickInsightsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    insights.forEach(insight => {
        const card = document.createElement('div');
        card.className = `insight-card insight-${insight.type}`;
        card.innerHTML = `<div class="insight-icon" style="font-size: 24px; margin-bottom: 8px;">${insight.icon}</div><h4>${insight.title}</h4><p>${insight.description}</p>`;
        grid.appendChild(card);
    });
}

// ========== CUSTOM INSIGHTS WITH USER QUERY ==========
async function generateInsightsDocument() {
    const userPrompt = document.getElementById('insightsRequest')?.value?.trim();
    if (!userPrompt) {
        showToast('Describe insights you want', 'warning');
        return;
    }
    
    showToast('🔄 Generating personalized insights...', 'info');
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const columns = Object.keys(data[0]);
    const numericCols = columns.filter(col => appState.columnTypes[col] === 'numeric');
    
    let dataContext = `You are a data analyst helping the user. Priority: Address their specific question first.\n\n`;
    dataContext += `DATASET CONTEXT:\n`;
    dataContext += `File: ${appState.fileName}\n`;
    dataContext += `Records: ${data.length} rows\n`;
    dataContext += `Features: ${columns.join(', ')}\n\n`;
    
    dataContext += `STATISTICS:\n`;
    numericCols.slice(0, 5).forEach(col => {
        const s = appState.columnStats[col];
        dataContext += `${col}: μ=${s.mean}, σ=${s.stdDev}, range=[${s.min}, ${s.max}]\n`;
    });
    
    if (appState.correlations.length > 0) {
        dataContext += `\nKEY CORRELATIONS:\n`;
        appState.correlations.slice(0, 3).forEach(c => {
            dataContext += `${c.col1} ↔ ${c.col2}: ${c.value}\n`;
        });
    }
    
    dataContext += `\n=== USER'S SPECIFIC QUESTION ===\n`;
    dataContext += `${userPrompt}\n\n`;
    dataContext += `INSTRUCTIONS:\n`;
    dataContext += `1. Answer the user's specific question FIRST and DIRECTLY\n`;
    dataContext += `2. Provide 2-3 related insights or trends\n`;
    dataContext += `3. Give 2-3 concrete, actionable recommendations\n`;
    dataContext += `4. Keep response under 300 words, be specific and data-driven\n`;
    
    let aiResponse = null;
    if (appState.geminiApiKey && appState.geminiApiKey.length > 20) {
        aiResponse = await callGeminiAPISafe(dataContext, 1500, 0.7);
    }
    
    let insightContent = `<h3 style="font-size: 15px; font-weight: 700; margin-bottom: 8px; color: #111;">📊 ${userPrompt}</h3>`;
    insightContent += `<p style="font-size: 11px; color: #999; margin-bottom: 16px;">${new Date().toLocaleString()}${aiResponse ? ' | AI-Powered Analysis' : ' | Automated Analysis'}</p>`;
    
    if (aiResponse) {
        insightContent += `<div style="font-size: 12px; line-height: 1.8; background: #f9fafb; padding: 16px; border-left: 4px solid #3b82f6; border-radius: 4px; white-space: pre-wrap;">${aiResponse}</div>`;
    } else {
        insightContent += `<div style="font-size: 12px; line-height: 1.7; background: #fef3c7; padding: 14px; border-left: 4px solid #f59e0b; border-radius: 4px;">`;
        insightContent += `<strong>⚠️ Limited Analysis (No AI):</strong><br><br>`;
        insightContent += `<strong>Question:</strong> ${userPrompt}<br><br>`;
        insightContent += `<strong>Dataset Overview:</strong><br>`;
        insightContent += `• ${data.length} records, ${columns.length} features<br>`;
        insightContent += `• Completeness: ${((1 - data.filter(r => Object.values(r).some(v => !v)).length / data.length) * 100).toFixed(1)}%<br>`;
        if (numericCols.length > 0) {
            const topCol = numericCols[0];
            const s = appState.columnStats[topCol];
            insightContent += `• ${topCol}: mean=${s.mean}, std=${s.stdDev}<br>`;
        }
        insightContent += `<br><em>💡 Configure Gemini API key for personalized AI analysis addressing your specific questions.</em>`;
        insightContent += `</div>`;
    }
    
    document.getElementById('insightsDocumentContent').innerHTML = insightContent;
    document.getElementById('generatedInsights').style.display = 'block';
    document.getElementById('insightsGeneratedDate').textContent = `Generated: ${new Date().toLocaleString()}`;
    showSuccessToast('✓ Insights generated');
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
    showSuccessToast('✓ Exported');
}

function exportSummary() {
    let summary = `DataVizard Report | ${new Date().toLocaleString()}\n`;
    summary += `File: ${appState.fileName}\n`;
    summary += `Rows: ${appState.uploadedData.length} | Cols: ${Object.keys(appState.uploadedData[0]).length}\n`;
    summary += `Clean: ${appState.isDataClean ? 'YES' : 'NO'}\n`;
    summary += `Actions: ${appState.cleaningActions.history.length}\n\n`;
    appState.cleaningActions.history.forEach(a => summary += `- ${a}\n`);
    const blob = new Blob([summary], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summary_${new Date().getTime()}.txt`;
    a.click();
    showSuccessToast('✓ Exported');
}

function exportInsights() {
    const insights = {
        timestamp: new Date().toISOString(),
        fileName: appState.fileName,
        cleanStatus: appState.isDataClean ? 'CLEAN' : 'PROCESSING',
        cleaningActions: appState.cleaningActions,
        columnStats: appState.columnStats,
        correlations: appState.correlations
    };
    const blob = new Blob([JSON.stringify(insights, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insights_${new Date().getTime()}.json`;
    a.click();
    showSuccessToast('✓ Exported');
}

// ========== TOAST NOTIFICATIONS ==========
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.textContent = message;
    const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    toast.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; background: ${colors[type]}; color: white;
        padding: 16px 24px; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); z-index: 10000;
        font-weight: 500; font-size: 14px; animation: slideInUp 0.3s ease-out;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function showSuccessToast(message) {
    showToast(message, 'success');
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideInUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`;
document.head.appendChild(style);

console.log('✅ app.js loaded successfully');
