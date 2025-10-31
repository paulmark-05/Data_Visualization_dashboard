// Application State (in-memory, no localStorage)
let appState = {
    uploadedData: [],
    filteredData: [],
    originalData: [],
    activeFilters: {},
    chatHistory: [],
    columnTypes: {},
    fileName: '',
    fileSize: 0,
    isDataLoaded: false, // Track if data has been loaded
    charts: [],
    chartInstances: {}, // Store Chart.js instances
    chartConfigs: { // Store chart configurations
        chart1: { type: 'bar', column: '', xColumn: '', yColumn: '' },
        chart2: { type: 'line', column: '', xColumn: '', yColumn: '' },
        chart3: { type: 'pie', column: '', xColumn: '', yColumn: '' },
        chart4: { type: 'scatter', column: '', xColumn: '', yColumn: '' }
    },
    pendingFilters: {}, // Track pending filter changes
    currentInsights: null, // Store generated insights for download
    selectedColumns: [], // Store selected columns for data preview
    sortColumn: '', // Column to sort by
    sortOrder: 'asc' // Sort order (asc/desc)
};

// Track if filters have changed but not applied
let filtersChanged = false;

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    initializeFileUpload();
    initializeApp();
});

// File upload initialization
function initializeFileUpload() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');

    if (!dropzone || !fileInput) {
        console.error('Upload elements not found');
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
    // Sidebar navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.dataset.section;
            showSection(section);
            
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Sidebar toggle
    document.getElementById('toggleSidebar').addEventListener('click', function() {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });
}

function showSection(sectionName) {
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => section.classList.remove('active'));
    const targetSection = document.getElementById(`section-${sectionName}`);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // If navigating away from dashboard and no data loaded, show message
    if (sectionName !== 'dashboard' && !appState.isDataLoaded) {
        showNoDataMessage(sectionName);
        return;
    }
    
    // Initialize section content if data is loaded
    if (appState.isDataLoaded) {
        switch(sectionName) {
            case 'dashboard':
                updateDashboardOverview();
                break;
            case 'visualizations':
                initializeVisualizations();
                break;
            case 'quality':
                generateDataQuality();
                break;
            case 'insights':
                generateInsights();
                break;
        }
    }
}

// Process file with robust error handling
function processFile(file) {
    console.log('=== FILE UPLOAD START ===');
    console.log('File name:', file.name);
    console.log('File size:', file.size);
    console.log('File type:', file.type);
    
    // Validate file type
    const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv'
    ];
    
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const validExtensions = ['xlsx', 'xls', 'csv'];
    
    if (!validExtensions.includes(fileExtension)) {
        showToast('Please upload a valid Excel or CSV file', 'error');
        return;
    }
    
    // Store file info
    appState.fileName = file.name;
    appState.fileSize = file.size;
    
    // Show progress
    const progressDiv = document.getElementById('uploadProgress');
    const progressText = document.getElementById('progressText');
    const progressFill = document.getElementById('progressFill');
    
    if (progressDiv) {
        progressDiv.style.display = 'block';
        progressText.textContent = 'Reading file...';
        progressFill.style.width = '20%';
    }
    
    // Read file
    const reader = new FileReader();
    
    reader.onprogress = function(e) {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 50; // First 50% is reading
            if (progressFill) {
                progressFill.style.width = percentComplete + '%';
            }
        }
    };
    
    reader.onload = function(e) {
        try {
            console.log('File read successfully, parsing...');
            
            if (progressText) progressText.textContent = 'Parsing data...';
            if (progressFill) progressFill.style.width = '60%';
            
            let jsonData;
            
            if (fileExtension === 'csv') {
                // Parse CSV
                const text = e.target.result;
                jsonData = parseCSV(text);
            } else {
                // Parse Excel
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                jsonData = XLSX.utils.sheet_to_json(firstSheet);
            }
            
            console.log('=== DATA PARSED ===');
            console.log('Rows:', jsonData.length);
            if (jsonData.length > 0) {
                console.log('Columns:', Object.keys(jsonData[0]).length);
                console.log('First row:', jsonData[0]);
            }
            
            if (!jsonData || jsonData.length === 0) {
                throw new Error('File is empty or contains no valid data');
            }
            
            if (progressText) progressText.textContent = 'Processing data...';
            if (progressFill) progressFill.style.width = '80%';
            
            // Store data in appState
            appState.originalData = jsonData;
            appState.uploadedData = jsonData;
            appState.filteredData = [];
            appState.isDataLoaded = true;
            appState.activeFilters = {};
            
            // Detect column types
            detectColumnTypes(jsonData);
            
            console.log('=== DATA STORED ===');
            console.log('appState.isDataLoaded:', appState.isDataLoaded);
            console.log('appState.originalData length:', appState.originalData.length);
            
            if (progressText) progressText.textContent = 'Complete!';
            if (progressFill) progressFill.style.width = '100%';
            
            // Transition to data overview
            setTimeout(() => {
                transitionToDataOverview();
            }, 500);
            
        } catch (error) {
            console.error('Error processing file:', error);
            showToast('Error processing file: ' + error.message, 'error');
            
            // Reset upload area
            if (progressDiv) progressDiv.style.display = 'none';
            if (progressFill) progressFill.style.width = '0%';
        }
    };
    
    reader.onerror = function() {
        console.error('Error reading file');
        showToast('Error reading file', 'error');
        if (progressDiv) progressDiv.style.display = 'none';
    };
    
    // Read based on file type
    if (fileExtension === 'csv') {
        reader.readAsText(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
}



// CSV parser function
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

// Transition to data overview
function transitionToDataOverview() {
    console.log('=== TRANSITION TO DATA OVERVIEW ===');
    
    // Hide welcome screen and upload area
    const welcomeScreen = document.getElementById('welcomeScreen');
    const uploadArea = document.getElementById('uploadArea');
    const dataOverview = document.getElementById('dataOverview');
    
    console.log('Elements found:', {
        welcomeScreen: !!welcomeScreen,
        uploadArea: !!uploadArea,
        dataOverview: !!dataOverview
    });
    
    if (welcomeScreen) {
        welcomeScreen.style.display = 'none';
        console.log('Welcome screen hidden');
    }
    
    if (uploadArea) {
        uploadArea.style.display = 'none';
        console.log('Upload area hidden');
    }
    
    // Show data overview
    if (dataOverview) {
        dataOverview.style.display = 'block';
        console.log('Data overview shown');
        
        // Update content
        updateDashboardOverview();
    } else {
        console.error('dataOverview element not found!');
    }
    
    // Generate all sections
    generateDataQuality();
    generateFilters();
    initializeVisualizations();
    generateInsights();
    
    showToast('File uploaded successfully!', 'success');
    addChatMessage('ai', `Data uploaded successfully! I've analyzed ${appState.originalData.length} rows and ${Object.keys(appState.originalData[0] || {}).length} columns. Ask me anything about your data!`);
    
    console.log('=== TRANSITION COMPLETE ===');
}



// Detect column types
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
        
        // Check if numeric
        const numericCount = sample.filter(val => !isNaN(parseFloat(val)) && isFinite(val)).length;
        if (numericCount / sample.length > 0.8) {
            appState.columnTypes[col] = 'numeric';
            return;
        }
        
        // Check if date
        const dateCount = sample.filter(val => !isNaN(Date.parse(val))).length;
        if (dateCount / sample.length > 0.8) {
            appState.columnTypes[col] = 'date';
            return;
        }
        
        // Check if categorical
        const uniqueValues = new Set(sample);
        if (uniqueValues.size < 20 || uniqueValues.size / sample.length < 0.5) {
            appState.columnTypes[col] = 'categorical';
            return;
        }
        
        // Default to text
        appState.columnTypes[col] = 'text';
    });
}

function updateDashboardOverview() {
    console.log('=== UPDATING DASHBOARD OVERVIEW ===');
    console.log('Data loaded:', appState.isDataLoaded);
    console.log('Data rows:', appState.originalData ? appState.originalData.length : 0);
    
    if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) {
        console.error('No data to display in overview');
        return;
    }
    
    const data = appState.originalData;
    const columns = Object.keys(data[0] || {});
    
    console.log('Columns:', columns.length);
    
    // Update statistics cards
    const statFileName = document.getElementById('statFileName');
    const statRows = document.getElementById('statRows');
    const statColumns = document.getElementById('statColumns');
    const statSize = document.getElementById('statSize');
    
    if (statFileName) statFileName.textContent = appState.fileName;
    if (statRows) statRows.textContent = data.length.toLocaleString();
    if (statColumns) statColumns.textContent = columns.length;
    if (statSize) statSize.textContent = formatFileSize(appState.fileSize);
    
    console.log('Statistics updated');
    
    // DO NOT display column types - REMOVED
    // displayColumnTypes();
    
    // Display ALL data in preview
    console.log('Calling displayDataPreview with ALL rows:', data.length);
    displayDataPreview(data); // Pass ALL data, not just slice
    
    console.log('=== DASHBOARD OVERVIEW UPDATE COMPLETE ===');
}

function initializeColumnFilters() {
    if (!appState.originalData || appState.originalData.length === 0) return;
    
    const columns = Object.keys(appState.originalData[0]);
    appState.selectedColumns = [...columns]; // All selected by default
    
    const container = document.getElementById('columnCheckboxes');
    if (!container) return;
    
    container.innerHTML = '';
    
    columns.forEach(col => {
        const checkbox = document.createElement('label');
        checkbox.className = 'column-checkbox-label';
        checkbox.innerHTML = `
            <input 
                type="checkbox" 
                value="${col}" 
                checked 
                onchange="toggleColumn('${col.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', this.checked)"
            />
            <span>${col}</span>
        `;
        container.appendChild(checkbox);
    });
    
    // Populate sort dropdown
    const sortSelect = document.getElementById('sortColumnSelect');
    if (sortSelect) {
        sortSelect.innerHTML = '<option value="">No Sorting</option>';
        columns.forEach(col => {
            const option = document.createElement('option');
            option.value = col;
            option.textContent = col;
            sortSelect.appendChild(option);
        });
    }
}

function toggleColumn(columnName, isChecked) {
    if (isChecked) {
        if (!appState.selectedColumns.includes(columnName)) {
            appState.selectedColumns.push(columnName);
        }
    } else {
        appState.selectedColumns = appState.selectedColumns.filter(col => col !== columnName);
    }
    
    // Re-render table with selected columns
    renderFilteredTable();
}

function selectAllColumns() {
    if (!appState.originalData || appState.originalData.length === 0) return;
    
    const columns = Object.keys(appState.originalData[0]);
    appState.selectedColumns = [...columns];
    
    // Check all checkboxes
    const checkboxes = document.querySelectorAll('#columnCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
    
    renderFilteredTable();
}

function deselectAllColumns() {
    appState.selectedColumns = [];
    
    // Uncheck all checkboxes
    const checkboxes = document.querySelectorAll('#columnCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    
    renderFilteredTable();
}

function applySorting() {
    const sortColumn = document.getElementById('sortColumnSelect')?.value;
    const sortOrder = document.getElementById('sortOrderSelect')?.value || 'asc';
    
    if (!sortColumn) {
        showToast('Please select a column to sort by', 'info');
        return;
    }
    
    appState.sortColumn = sortColumn;
    appState.sortOrder = sortOrder;
    
    renderFilteredTable();
    showToast(`Sorted by ${sortColumn} (${sortOrder === 'asc' ? 'ascending' : 'descending'})`, 'success');
}

function sortData(data, column, order) {
    if (!column) return data;
    
    const sorted = [...data].sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        
        // Handle null/undefined
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        
        // Try numeric comparison
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        
        if (!isNaN(numA) && !isNaN(numB)) {
            return order === 'asc' ? numA - numB : numB - numA;
        }
        
        // String comparison
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
        
        if (order === 'asc') {
            return valA < valB ? -1 : valA > valB ? 1 : 0;
        } else {
            return valA > valB ? -1 : valA < valB ? 1 : 0;
        }
    });
    
    return sorted;
}

function renderFilteredTable() {
    if (!appState.originalData || appState.originalData.length === 0) return;
    
    let data = appState.originalData;
    
    // Apply sorting
    if (appState.sortColumn) {
        data = sortData(data, appState.sortColumn, appState.sortOrder);
    }
    
    displayDataPreviewWithFilters(data, appState.selectedColumns);
}

function displayDataPreviewWithFilters(rows, selectedColumns) {
    console.log('Displaying data preview with filters:', rows.length, 'rows', selectedColumns.length, 'columns');
    
    const table = document.getElementById('dataPreviewTable');
    if (!table) {
        console.error('dataPreviewTable element not found');
        return;
    }
    
    if (!rows || rows.length === 0) {
        table.innerHTML = '<p style="padding: 20px; text-align: center; color: #64748b;">No data to display</p>';
        return;
    }
    
    const allColumns = Object.keys(rows[0]);
    const displayColumns = selectedColumns.length > 0 ? selectedColumns : allColumns;
    
    // Update table info
    const rowCountEl = document.getElementById('tableRowCount');
    const colCountEl = document.getElementById('tableColumnCount');
    if (rowCountEl) rowCountEl.textContent = `${rows.length.toLocaleString()} rows`;
    if (colCountEl) colCountEl.textContent = `${displayColumns.length} of ${allColumns.length} columns`;
    
    // Build table header
    let html = '<thead><tr>';
    displayColumns.forEach(col => {
        const sortIcon = appState.sortColumn === col 
            ? (appState.sortOrder === 'asc' ? ' ↑' : ' ↓')
            : '';
        html += `<th>${col}${sortIcon}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    // Build table body
    rows.forEach((row, rowIndex) => {
        html += '<tr>';
        displayColumns.forEach(col => {
            const value = row[col];
            let displayValue = value !== undefined && value !== null ? String(value) : '-';
            if (displayValue.length > 100) {
                displayValue = displayValue.substring(0, 97) + '...';
            }
            html += `<td title="${value}">${displayValue}</td>`;
        });
        html += '</tr>';
    });
    
    html += '</tbody>';
    table.innerHTML = html;
    
    console.log('Filtered table rendered');
}

function displayDataPreview(rows) {
    console.log('Displaying data preview:', rows.length, 'rows');
    
    // Initialize column filters on first render
    initializeColumnFilters();
    
    // Render with all columns selected by default
    displayDataPreviewWithFilters(rows, appState.selectedColumns);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function resetUpload() {
    // Clear state
    appState.originalData = [];
    appState.uploadedData = [];
    appState.filteredData = [];
    appState.isDataLoaded = false;
    appState.fileName = '';
    appState.fileSize = 0;
    appState.activeFilters = {};
    
    // Reset UI to welcome screen
    document.getElementById('welcomeScreen').style.display = 'block';
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('dataOverview').style.display = 'none';
    document.getElementById('fileInput').value = '';
    
    showToast('Ready for new upload', 'info');
}

function displayColumnTypes() {
    console.log('Displaying column types');
    
    const container = document.getElementById('columnTypesDisplay');
    if (!container) {
        console.error('columnTypesDisplay element not found');
        return;
    }
    
    if (!appState.originalData || appState.originalData.length === 0) {
        container.innerHTML = '<p style="color: #64748b;">No data loaded</p>';
        return;
    }
    
    const columns = Object.keys(appState.originalData[0]);
    
    let html = '<div class="column-types-list">';
    
    columns.forEach(col => {
        const type = appState.columnTypes[col] || 'text';
        const icon = type === 'numeric' ? '🔢' : type === 'date' ? '📅' : '📝';
        html += `
            <div class="column-type-item">
                <span class="column-icon">${icon}</span>
                <span class="column-name">${col}</span>
                <span class="column-type-badge">${type}</span>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    console.log('Column types displayed:', columns.length, 'columns');
}

function renderInsights(insights) {
    const grid = document.getElementById('quickInsightsGrid');
    let html = '';
    
    insights.forEach(insight => {
        html += `<div class="insight-card ${insight.type || ''}">`;
        html += `<div class="insight-icon">${insight.icon}</div>`;
        html += `<h4>${insight.title}</h4>`;
        html += `<p>${insight.description}</p>`;
        html += `</div>`;
    });
    
    grid.innerHTML = html;
}

// Navigate to Data Quality with subsection highlighting
function navigateToDataQuality(subsection) {
    console.log('Navigating to Data Quality:', subsection);
    
    // First, show the Data Quality section
    showSection('quality');
    
    // Wait for section to be visible, then scroll to subsection
    setTimeout(() => {
        let targetElement = null;
        
        if (subsection === 'duplicates') {
            // Find duplicates section
            targetElement = document.querySelector('#duplicatesSection') || 
                          document.querySelector('[data-section="duplicates"]') ||
                          document.querySelector('.duplicates-card');
        } else if (subsection === 'missing') {
            // Find missing values section
            targetElement = document.querySelector('#missingValuesSection') || 
                          document.querySelector('[data-section="missing"]') ||
                          document.querySelector('.missing-values-card');
        } else if (subsection === 'outliers') {
            // Find outliers section
            targetElement = document.querySelector('#outliersSection') || 
                          document.querySelector('[data-section="outliers"]') ||
                          document.querySelector('.outliers-card');
        }
        
        if (targetElement) {
            // Scroll to element
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Add highlight effect
            targetElement.style.transition = 'box-shadow 0.3s ease';
            targetElement.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.3)';
            
            // Remove highlight after 2 seconds
            setTimeout(() => {
                targetElement.style.boxShadow = '';
            }, 2000);
        }
    }, 300);
}

// Data Quality Analysis
function generateDataQuality() {
    if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) {
        showNoDataMessage('quality');
        return;
    }
    
    const container = document.getElementById('qualityContainer');
    const data = appState.uploadedData;

    let html = '<div class="quality-grid">';

    // Missing Values
    html += '<div id="missingValuesSection" class="quality-card missing-values-card" data-section="missing">';
    html += '<h3>🔍 Missing Values</h3>';
    html += '<p style="color: var(--color-text-secondary); font-size: 14px; margin-bottom: 16px;">';
    html += 'Missing values are empty cells or null values in your dataset. These can affect the accuracy of your analysis and should be addressed.';
    html += '</p>';
    
    const columns = Object.keys(data[0]);
    const missingData = [];

    columns.forEach(col => {
        const missing = data.filter(row => !row[col] || row[col] === '').length;
        if (missing > 0) {
            const percentage = ((missing / data.length) * 100).toFixed(1);
            missingData.push({ column: col, count: missing, percentage });
        }
    });

    if (missingData.length === 0) {
        html += '<div style="padding: 20px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #166534;">';
        html += '✅ <strong>No missing values detected!</strong> Your dataset is complete.';
        html += '</div>';
    } else {
        html += '<div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 12px; margin-bottom: 16px; color: #991b1b;">';
        html += `<strong>⚠️ Found missing values in ${missingData.length} column(s)</strong><br>`;
        html += '<small>Missing data can lead to inaccurate calculations and biased results.</small>';
        html += '</div>';
        
        missingData.forEach(item => {
            html += `<div class="missing-value-item">`;
            html += `<div class="missing-header">`;
            html += `<strong>${item.column}</strong>`;
            html += `<span>${item.count} missing (${item.percentage}%)</span>`;
            html += `</div>`;
            html += `<div class="missing-bar-container">`;
            html += `<div class="missing-bar" style="width: ${item.percentage}%"></div>`;
            html += `</div>`;
            html += `<div style="margin-top: 12px;"><strong>Suggested Fixes:</strong></div>`;
            html += `<div class="fix-buttons">`;
            html += `<button class="btn btn-sm btn-secondary" onclick="fixMissingValues('${item.column}', 'delete')" title="Removes all rows that have any missing values">🗑️ Delete Rows</button>`;
            html += `<button class="btn btn-sm btn-secondary" onclick="fixMissingValues('${item.column}', 'mean')" title="Replaces missing numbers with column average">🧮 Fill with Mean</button>`;
            html += `<button class="btn btn-sm btn-secondary" onclick="fixMissingValues('${item.column}', 'mode')" title="Replaces with the most common value">🔁 Fill with Mode</button>`;
            html += `<button class="btn btn-sm btn-secondary" onclick="fixMissingValues('${item.column}', 'forward')" title="Carries forward the last known value">➡️ Forward Fill</button>`;
            html += `</div>`;
            html += `</div>`;
        });
    }
    html += '</div>';

    // Outliers with IQR explanation
    html += '<div id="outliersSection" class="quality-card outliers-card" data-section="outliers">';
    html += '<h3>📈 Outliers</h3>';
    html += '<p style="color: var(--color-text-secondary); font-size: 14px; margin-bottom: 12px;">';
    html += 'Outliers are values that differ significantly from other observations. We detect them using the <strong>IQR (Interquartile Range) method</strong>.';
    html += '</p>';
    html += '<div style="background: #eff6ff; border: 1px solid #93c5fd; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 13px;">';
    html += '<strong>📚 How we detect outliers:</strong><br>';
    html += '1. Calculate Q1 (25th percentile) and Q3 (75th percentile)<br>';
    html += '2. Calculate IQR = Q3 - Q1<br>';
    html += '3. Values below Q1 - 1.5×IQR or above Q3 + 1.5×IQR are outliers<br>';
    html += '<small style="color: #1e40af;"><strong>Example:</strong> If most salaries are between $40K-$80K, a value of $500K would be flagged as an outlier.</small>';
    html += '</div>';
    
    const outliersDetails = detectOutliersWithDetails(data);
    if (Object.keys(outliersDetails).length === 0) {
        html += '<div style="padding: 20px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #166534;">';
        html += '✅ <strong>No significant outliers detected!</strong> Your data appears to be within expected ranges.';
        html += '</div>';
    } else {
        Object.keys(outliersDetails).forEach(col => {
            const details = outliersDetails[col];
            html += `<div style="background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 16px; margin-bottom: 12px;">`;
            html += `<strong style="font-size: 15px;">${col}</strong><br>`;
            html += `<div style="margin-top: 8px; font-size: 13px; color: #854d0e;">`;
            html += `⚠️ <strong>${details.count} outliers detected</strong><br>`;
            html += `Q1 (25th percentile): ${details.q1.toFixed(2)}<br>`;
            html += `Q3 (75th percentile): ${details.q3.toFixed(2)}<br>`;
            html += `IQR: ${details.iqr.toFixed(2)}<br>`;
            html += `Valid range: ${details.lowerBound.toFixed(2)} to ${details.upperBound.toFixed(2)}`;
            html += `</div>`;
            html += `<div style="margin-top: 12px;"><strong>Handling Options:</strong></div>`;
            html += `<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">`;
            html += `<button class="btn btn-sm btn-danger" onclick="handleOutliers('${col}', 'remove')" title="Delete rows containing outlier values">🗑️ Remove Outliers</button>`;
            html += `<button class="btn btn-sm btn-secondary" onclick="handleOutliers('${col}', 'cap')" title="Replace outliers with maximum acceptable value">📊 Cap at Threshold</button>`;
            html += `<button class="btn btn-sm btn-success" onclick="handleOutliers('${col}', 'keep')" title="Sometimes outliers are valid data points">✓ Keep Outliers</button>`;
            html += `</div>`;
            html += `</div>`;
        });
    }
    html += '</div>';

    // Duplicates
    html += '<div id="duplicatesSection" class="quality-card duplicates-card" data-section="duplicates">';
    html += '<h3>🔄 Duplicate Rows</h3>';
    html += '<p style="color: var(--color-text-secondary); font-size: 14px; margin-bottom: 16px;">';
    html += 'Duplicate rows are identical records that appear multiple times in your dataset.';
    html += '</p>';
    const duplicates = findDuplicates(data);
    if (duplicates === 0) {
        html += '<div style="padding: 20px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #166534;">';
        html += '✅ <strong>No duplicate rows found!</strong> Each record is unique.';
        html += '</div>';
    } else {
        html += '<div style="padding: 16px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; color: #991b1b; margin-bottom: 12px;">';
        html += `⚠️ <strong>Found ${duplicates} duplicate rows</strong><br>`;
        html += '<small>Duplicates can skew your analysis results.</small>';
        html += '</div>';
        html += `<button class="btn btn-primary" onclick="removeDuplicates()">Remove All Duplicates</button>`;
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
}

function showNoDataMessage(sectionName) {
    const section = document.getElementById(`section-${sectionName}`);
    if (!section) return;
    
    const contentArea = section.querySelector('.quality-container, .insights-grid, #visualizationsContainer') || section;
    
    const messageHtml = `
        <div class="no-data-message" style="text-align: center; padding: 80px 20px; max-width: 500px; margin: 0 auto;">
            <div style="font-size: 64px; margin-bottom: 20px;">📊</div>
            <h3 style="font-size: 24px; color: #1e293b; margin-bottom: 12px;">No Data Loaded</h3>
            <p style="font-size: 16px; color: #64748b; margin-bottom: 24px;">Please upload a data file from the Dashboard section to get started.</p>
            <button class="btn btn-primary" onclick="goToDashboard()" style="padding: 12px 24px; font-size: 16px;">
                ⬆️ Go to Dashboard
            </button>
        </div>
    `;
    
    if (sectionName === 'quality') {
        const qualityContainer = document.getElementById('qualityContainer');
        if (qualityContainer) qualityContainer.innerHTML = messageHtml;
    } else if (sectionName === 'insights') {
        const insightsGrid = document.getElementById('insightsGrid');
        if (insightsGrid) insightsGrid.innerHTML = messageHtml;
    } else if (sectionName === 'visualizations') {
        document.getElementById('noVisualizationsMessage').innerHTML = messageHtml;
        document.getElementById('noVisualizationsMessage').style.display = 'block';
        hideAllVizSections();
        document.getElementById('filtersPanel').style.display = 'none';
    }
}

function goToDashboard() {
    // Click on dashboard nav item
    const dashboardNav = document.querySelector('.nav-item[data-section="dashboard"]');
    if (dashboardNav) {
        dashboardNav.click();
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

function detectOutliers(data) {
    const outliers = {};
    const columns = Object.keys(data[0]);
    
    columns.forEach(col => {
        if (appState.columnTypes[col] === 'numeric') {
            const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
            if (values.length > 0) {
                const sorted = values.sort((a, b) => a - b);
                const q1 = sorted[Math.floor(sorted.length * 0.25)];
                const q3 = sorted[Math.floor(sorted.length * 0.75)];
                const iqr = q3 - q1;
                const lowerBound = q1 - 1.5 * iqr;
                const upperBound = q3 + 1.5 * iqr;
                
                const outlierCount = values.filter(v => v < lowerBound || v > upperBound).length;
                if (outlierCount > 0) {
                    outliers[col] = outlierCount;
                }
            }
        }
    });
    
    return outliers;
}

function detectOutliersWithDetails(data) {
    const outliersDetails = {};
    const columns = Object.keys(data[0]);
    
    columns.forEach(col => {
        if (appState.columnTypes[col] === 'numeric') {
            const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
            if (values.length > 3) {
                const sorted = [...values].sort((a, b) => a - b);
                const q1 = sorted[Math.floor(sorted.length * 0.25)];
                const q3 = sorted[Math.floor(sorted.length * 0.75)];
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

function handleOutliers(column, action) {
    const data = appState.uploadedData;
    const values = data.map(row => parseFloat(row[column])).filter(v => !isNaN(v));
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    if (action === 'remove') {
        appState.uploadedData = data.filter(row => {
            const val = parseFloat(row[column]);
            return isNaN(val) || (val >= lowerBound && val <= upperBound);
        });
        showToast(`Removed outliers from ${column}`, 'success');
    } else if (action === 'cap') {
        data.forEach(row => {
            const val = parseFloat(row[column]);
            if (!isNaN(val)) {
                if (val < lowerBound) row[column] = lowerBound;
                if (val > upperBound) row[column] = upperBound;
            }
        });
        showToast(`Capped outliers in ${column}`, 'success');
    } else if (action === 'keep') {
        showToast(`Outliers in ${column} will be kept`, 'info');
        return;
    }
    
    appState.filteredData = [...appState.uploadedData];
    generateDataQuality();
    renderAllCharts();
}

function fixMissingValues(column, method) {
    const data = appState.uploadedData;
    
    if (method === 'delete') {
        appState.uploadedData = data.filter(row => row[column] && row[column] !== '');
    } else if (method === 'mean') {
        const values = data.map(row => parseFloat(row[column])).filter(v => !isNaN(v));
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        data.forEach(row => {
            if (!row[column] || row[column] === '') {
                row[column] = mean.toFixed(2);
            }
        });
    } else if (method === 'mode') {
        const values = data.map(row => row[column]).filter(v => v && v !== '');
        const mode = values.sort((a, b) =>
            values.filter(v => v === a).length - values.filter(v => v === b).length
        ).pop();
        data.forEach(row => {
            if (!row[column] || row[column] === '') {
                row[column] = mode;
            }
        });
    } else if (method === 'forward') {
        let lastValue = null;
        data.forEach(row => {
            if (row[column] && row[column] !== '') {
                lastValue = row[column];
            } else if (lastValue) {
                row[column] = lastValue;
            }
        });
    }
    
    appState.filteredData = [...appState.uploadedData];
    generateDataQuality();
    generateVisualizations();
    alert(`Missing values in ${column} fixed using ${method} method!`);
}

function removeDuplicates() {
    const seen = new Set();
    appState.uploadedData = appState.uploadedData.filter(row => {
        const key = JSON.stringify(row);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
    appState.filteredData = [...appState.uploadedData];
    generateDataQuality();
    alert('Duplicate rows removed!');
}

// Filters
function generateFilters() {
    const container = document.getElementById('filtersContainer');
    const data = appState.uploadedData;
    
    if (data.length === 0) return;

    const columns = Object.keys(data[0]);
    const categoricalColumns = columns.filter(col => 
        appState.columnTypes[col] === 'categorical' || appState.columnTypes[col] === 'text'
    );

    if (categoricalColumns.length === 0) {
        container.innerHTML = '<div class="no-data-message">No categorical columns found for filtering.</div>';
        return;
    }

    let html = '<div class="filters-grid">';

    categoricalColumns.forEach(col => {
        const uniqueValues = [...new Set(data.map(row => row[col]).filter(v => v))].sort();
        html += '<div class="filter-card">';
        html += `<label style="font-weight: 600; margin-bottom: 12px; display: block;">${col}</label>`;
        html += '<div style="max-height: 200px; overflow-y: auto;">';
        uniqueValues.forEach(val => {
            const safeVal = String(val).replace(/'/g, "\\'");
            html += `<div style="margin-bottom: 8px;">`;
            html += `<label style="display: flex; align-items: center; cursor: pointer; font-weight: normal;">`;
            html += `<input type="checkbox" class="filter-checkbox" data-column="${col}" data-value="${safeVal}" style="margin-right: 8px; cursor: pointer;">`;
            html += `<span>${val}</span>`;
            html += `</label>`;
            html += `</div>`;
        });
        html += '</div>';
        html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;

    // Show filters header section
    const headerSection = document.getElementById('filtersHeaderSection');
    if (headerSection) {
        headerSection.style.display = 'block';
    }

    // Attach event listeners to checkboxes
    document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            onFilterChange();
        });
    });
}

function applyFilters() {
    // Start with original data
    let filtered = [...appState.originalData];
    
    // Apply each active filter
    Object.keys(appState.activeFilters).forEach(column => {
        const selectedValues = appState.activeFilters[column];
        if (selectedValues && selectedValues.length > 0) {
            filtered = filtered.filter(row => 
                selectedValues.includes(String(row[column]))
            );
        }
    });
    
    // Update state
    appState.filteredData = filtered;
    appState.uploadedData = filtered;
    
    // Re-render all sections that display data
    updateActiveFilters();
    updateFilterBadge();
    displayDataPreview(filtered);
    
    console.log('Rendering visualizations with filtered data...');
    renderAllVisualizations();
    generateInsights();
    
    // Update data overview counts
    const rowCountElement = document.getElementById('rowCount');
    if (rowCountElement) {
        if (filtered.length !== appState.originalData.length) {
            rowCountElement.textContent = `${filtered.length} (filtered from ${appState.originalData.length})`;
        } else {
            rowCountElement.textContent = appState.originalData.length;
        }
    }
}

function updateActiveFilters() {
    const container = document.getElementById('activeFilters');
    if (!container) return;
    
    let html = '';
    
    Object.keys(appState.activeFilters).forEach(col => {
        const values = appState.activeFilters[col];
        values.forEach(val => {
            const safeCol = String(col).replace(/'/g, "\\'");
            const safeVal = String(val).replace(/'/g, "\\'");
            html += `<div class="filter-chip">${col}: ${val} <button onclick="removeFilterValue('${safeCol}', '${safeVal}')">×</button></div>`;
        });
    });
    
    container.innerHTML = html;
}

function updateFilterBadge() {
    const badge = document.getElementById('filterBadge');
    if (!badge) return;
    
    const filterCount = Object.keys(appState.activeFilters).reduce((sum, col) => 
        sum + appState.activeFilters[col].length, 0
    );
    
    if (filterCount > 0) {
        badge.textContent = `${filterCount} filter${filterCount > 1 ? 's' : ''} active`;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function removeFilterValue(column, value) {
    if (appState.activeFilters[column]) {
        appState.activeFilters[column] = appState.activeFilters[column].filter(v => v !== value);
        
        if (appState.activeFilters[column].length === 0) {
            delete appState.activeFilters[column];
        }
    }
    
    // Uncheck the corresponding checkbox
    const checkbox = document.querySelector(`.filter-checkbox[data-column="${column}"][data-value="${value}"]`);
    if (checkbox) {
        checkbox.checked = false;
    }
    
    // Mark filters as changed and update button
    onFilterChange();
}

// Handle filter change event
function onFilterChange() {
    filtersChanged = true;
    const applyBtn = document.getElementById('applyFiltersBtn2');
    if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply Filters (Changed)';
    }
}

// Apply filters when button is clicked
function applyFiltersClick() {
    if (!filtersChanged) return;
    
    console.log('Apply Filters clicked');
    
    // Build active filters from checkboxes
    appState.activeFilters = {};
    document.querySelectorAll('.filter-checkbox:checked').forEach(checkbox => {
        const column = checkbox.dataset.column;
        const value = checkbox.dataset.value;
        
        if (!appState.activeFilters[column]) {
            appState.activeFilters[column] = [];
        }
        
        if (!appState.activeFilters[column].includes(value)) {
            appState.activeFilters[column].push(value);
        }
    });
    
    console.log('Active filters:', appState.activeFilters);
    
    const originalCount = appState.originalData.length;
    
    // Apply the filters
    let filtered = [...appState.originalData];
    
    Object.keys(appState.activeFilters).forEach(column => {
        const selectedValues = appState.activeFilters[column];
        if (selectedValues && selectedValues.length > 0) {
            filtered = filtered.filter(row => 
                selectedValues.includes(String(row[column]))
            );
        }
    });
    
    appState.filteredData = filtered;
    
    const filteredCount = appState.filteredData.length;
    console.log(`Filtered from ${originalCount} to ${filteredCount} rows`);
    
    // Update active filters display
    displayActiveFiltersChips();
    
    // Re-render all charts with filtered data
    renderAllCharts();
    
    // Reset button state
    filtersChanged = false;
    const applyBtn = document.getElementById('applyFiltersBtn2');
    if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Apply Filters';
    }
    
    // Show success feedback
    showToast(`Filters applied! Showing ${filteredCount} of ${originalCount} rows`, 'success');
}

// Display active filter chips
function displayActiveFiltersChips() {
    const container = document.getElementById('activeFiltersChips');
    if (!container) return;
    
    let html = '';
    
    Object.keys(appState.activeFilters).forEach(col => {
        const values = appState.activeFilters[col];
        values.forEach(val => {
            const safeCol = String(col).replace(/'/g, "\\'");
            const safeVal = String(val).replace(/'/g, "\\'");
            html += `<div class="filter-chip-inline">${col}: ${val} <button onclick="removeFilterChip('${safeCol}', '${safeVal}')">×</button></div>`;
        });
    });
    
    container.innerHTML = html;
}

// Remove filter chip
function removeFilterChip(column, value) {
    if (appState.activeFilters[column]) {
        appState.activeFilters[column] = appState.activeFilters[column].filter(v => v !== value);
        
        if (appState.activeFilters[column].length === 0) {
            delete appState.activeFilters[column];
        }
    }
    
    // Uncheck the corresponding checkbox
    const checkbox = document.querySelector(`.filter-checkbox[data-column="${column}"][data-value="${value}"]`);
    if (checkbox) {
        checkbox.checked = false;
    }
    
    // Reapply filters
    let filtered = [...appState.originalData];
    
    Object.keys(appState.activeFilters).forEach(col => {
        const selectedValues = appState.activeFilters[col];
        if (selectedValues && selectedValues.length > 0) {
            filtered = filtered.filter(row => 
                selectedValues.includes(String(row[col]))
            );
        }
    });
    
    appState.filteredData = filtered;
    
    // Update display
    displayActiveFiltersChips();
    renderAllCharts();
    
    showToast('Filter removed', 'success');
}

function clearAllFilters() {
    appState.activeFilters = {};
    appState.filteredData = [];
    
    // Reset all filter checkboxes
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.checked = false);
    
    // Reset filter changed flag and button
    filtersChanged = false;
    const applyBtn = document.getElementById('applyFiltersBtn2');
    if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Apply Filters';
    }
    
    // Clear active filters display
    const chipsContainer = document.getElementById('activeFiltersChips');
    if (chipsContainer) {
        chipsContainer.innerHTML = '';
    }
    
    // Re-render charts with original data
    renderAllCharts();
    
    showToast('All filters cleared', 'success');
}

// Toggle filters panel
function toggleFiltersPanel() {
    const panel = document.getElementById('filtersPanel');
    if (panel) {
        panel.classList.toggle('collapsed');
    }
}

// Visualizations - Initialize with controls
function initializeVisualizations() {
    if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) {
        showNoDataMessage('visualizations');
        return;
    }
    
    const data = appState.originalData;
    
    // Hide no data message, show sections
    document.getElementById('noVisualizationsMessage').style.display = 'none';
    document.getElementById('filtersPanel').style.display = 'block';
    
    // Generate filters in the integrated panel
    generateIntegratedFilters();
    
    // Get column names and types
    const columns = Object.keys(data[0]);
    
    // Detect categorical columns (strings or <20 unique values)
    const categoricalColumns = columns.filter(col => {
        const uniqueValues = [...new Set(data.map(row => row[col]))];
        return uniqueValues.length < 20 || typeof data[0][col] === 'string';
    });
    
    // Detect numeric columns
    const numericColumns = columns.filter(col => {
        const value = data[0][col];
        return typeof value === 'number' || !isNaN(parseFloat(value));
    });
    
    // Show and populate categorical section
    if (categoricalColumns.length > 0) {
        document.getElementById('categoricalSection').style.display = 'block';
        populateSelect('categoricalColumnSelect', categoricalColumns);
        document.getElementById('categoricalColumnSelect').value = categoricalColumns[0];
        document.getElementById('categoricalColumnSelect').addEventListener('change', function() {
            renderCategoricalChart(this.value);
        });
        renderCategoricalChart(categoricalColumns[0]);
    }
    
    // Show and populate numeric section
    if (numericColumns.length > 0) {
        document.getElementById('numericSection').style.display = 'block';
        populateSelect('numericColumnSelect', numericColumns);
        document.getElementById('numericColumnSelect').value = numericColumns[0];
        document.getElementById('numericColumnSelect').addEventListener('change', function() {
            renderNumericChart(this.value);
        });
        renderNumericChart(numericColumns[0]);
    }
    
    // Show and populate pie section
    if (categoricalColumns.length > 0) {
        document.getElementById('pieSection').style.display = 'block';
        populateSelect('pieColumnSelect', categoricalColumns);
        document.getElementById('pieColumnSelect').value = categoricalColumns[0];
        document.getElementById('pieColumnSelect').addEventListener('change', function() {
            renderPieChartViz(this.value);
        });
        renderPieChartViz(categoricalColumns[0]);
    }
    
    // Show and populate comparison section
    if (columns.length >= 2) {
        document.getElementById('comparisonSection').style.display = 'block';
        populateSelect('xAxisSelect', columns);
        populateSelect('yAxisSelect', numericColumns.length > 0 ? numericColumns : columns);
        populateSelect('groupBySelect', categoricalColumns, true);
        
        if (columns.length > 0) {
            document.getElementById('xAxisSelect').value = columns[0];
        }
        if (numericColumns.length > 0) {
            document.getElementById('yAxisSelect').value = numericColumns[0];
        } else if (columns.length > 1) {
            document.getElementById('yAxisSelect').value = columns[1];
        }
        
        document.getElementById('comparisonChartType').addEventListener('change', renderComparisonChart);
        document.getElementById('xAxisSelect').addEventListener('change', renderComparisonChart);
        document.getElementById('yAxisSelect').addEventListener('change', renderComparisonChart);
        document.getElementById('groupBySelect').addEventListener('change', renderComparisonChart);
        
        renderComparisonChart();
    }
}

function hideAllVizSections() {
    document.getElementById('categoricalSection').style.display = 'none';
    document.getElementById('numericSection').style.display = 'none';
    document.getElementById('pieSection').style.display = 'none';
    document.getElementById('comparisonSection').style.display = 'none';
}

function populateSelect(selectId, options, includeNone = false) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // Keep first option (placeholder)
    const firstOption = select.options[0];
    select.innerHTML = '';
    if (firstOption) {
        select.appendChild(firstOption);
    }
    
    options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        select.appendChild(opt);
    });
}

// Generate integrated filters panel
function generateIntegratedFilters() {
    const container = document.getElementById('filtersContainer2');
    const data = appState.originalData;
    
    if (data.length === 0) return;

    const columns = Object.keys(data[0]);
    const categoricalColumns = columns.filter(col => 
        appState.columnTypes[col] === 'categorical' || appState.columnTypes[col] === 'text'
    );

    if (categoricalColumns.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No categorical columns available for filtering.</p>';
        return;
    }

    let html = '';

    categoricalColumns.forEach(col => {
        const uniqueValues = [...new Set(data.map(row => row[col]).filter(v => v))].sort();
        html += '<div class="filter-group-inline">';
        html += `<label class="filter-title">${col}</label>`;
        html += '<div class="filter-options">';
        uniqueValues.forEach(val => {
            const safeVal = String(val).replace(/'/g, "\\'").replace(/"/g, '&quot;');
            html += `<div class="filter-option">`;
            html += `<input type="checkbox" class="filter-checkbox" data-column="${col}" data-value="${safeVal}" onchange="onFilterChange()">`;
            html += `<span>${val}</span>`;
            html += `</div>`;
        });
        html += '</div>';
        html += '</div>';
    });

    container.innerHTML = html;
}

// Render trend section charts
function renderCategoricalChart(columnName) {
    if (!columnName) return;
    
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.originalData;
    const container = document.getElementById('categoricalChart');
    
    // Destroy previous chart
    if (appState.chartInstances['categoricalChart']) {
        appState.chartInstances['categoricalChart'].destroy();
    }
    
    container.innerHTML = '<canvas id="categoricalChartCanvas"></canvas>';
    const ctx = document.getElementById('categoricalChartCanvas').getContext('2d');
    
    // Count frequencies
    const frequencies = {};
    data.forEach(row => {
        const value = String(row[columnName] || 'N/A');
        frequencies[value] = (frequencies[value] || 0) + 1;
    });
    
    const labels = Object.keys(frequencies);
    const values = Object.values(frequencies);
    const total = values.reduce((a, b) => a + b, 0);
    const colors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B'];
    
    appState.chartInstances['categoricalChart'] = new Chart(ctx, {
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
            plugins: {
                title: {
                    display: true,
                    text: `${columnName} Distribution`,
                    font: { size: 18, weight: 'bold' }
                },
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const percentage = ((context.parsed.y / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed.y} (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: columnName, font: { size: 14, weight: '600' } },
                    grid: { display: false }
                },
                y: {
                    title: { display: true, text: 'Count', font: { size: 14, weight: '600' } },
                    grid: { color: '#e5e5e5' },
                    beginAtZero: true
                }
            }
        }
    });
}

function renderNumericChart(columnName) {
    if (!columnName) return;
    
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.originalData;
    const container = document.getElementById('numericChart');
    
    // Destroy previous chart
    if (appState.chartInstances['numericChart']) {
        appState.chartInstances['numericChart'].destroy();
    }
    
    container.innerHTML = '<canvas id="numericChartCanvas"></canvas>';
    const ctx = document.getElementById('numericChartCanvas').getContext('2d');
    
    // Get numeric values
    const values = data.map(row => parseFloat(row[columnName])).filter(v => !isNaN(v));
    
    if (values.length === 0) {
        container.innerHTML = '<p class="no-data">No numeric data available</p>';
        return;
    }
    
    // Create histogram bins
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(20, Math.ceil(Math.sqrt(values.length)));
    const binSize = (max - min) / binCount;
    
    const bins = [];
    const binLabels = [];
    for (let i = 0; i < binCount; i++) {
        bins.push(0);
        const binStart = min + i * binSize;
        const binEnd = binStart + binSize;
        binLabels.push(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}`);
    }
    
    // Count values in bins
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
                title: {
                    display: true,
                    text: `${columnName} Distribution`,
                    font: { size: 18, weight: 'bold' }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    title: { display: true, text: columnName, font: { size: 14, weight: '600' } },
                    grid: { display: false }
                },
                y: {
                    title: { display: true, text: 'Frequency', font: { size: 14, weight: '600' } },
                    grid: { color: '#e5e5e5' },
                    beginAtZero: true
                }
            }
        }
    });
}

function renderPieChartViz(columnName) {
    if (!columnName) return;
    
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.originalData;
    const container = document.getElementById('pieChart');
    
    // Destroy previous chart
    if (appState.chartInstances['pieChart']) {
        appState.chartInstances['pieChart'].destroy();
    }
    
    container.innerHTML = '<canvas id="pieChartCanvas"></canvas>';
    const ctx = document.getElementById('pieChartCanvas').getContext('2d');
    
    // Count frequencies
    const frequencies = {};
    data.forEach(row => {
        const value = String(row[columnName] || 'N/A');
        frequencies[value] = (frequencies[value] || 0) + 1;
    });
    
    const labels = Object.keys(frequencies);
    const values = Object.values(frequencies);
    const colors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B'];
    
    appState.chartInstances['pieChart'] = new Chart(ctx, {
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
                title: {
                    display: true,
                    text: `${columnName} Distribution`,
                    font: { size: 18, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'right',
                    labels: { font: { size: 12 }, padding: 15 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = values.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderComparisonChart() {
    const chartType = document.getElementById('comparisonChartType').value;
    const xColumn = document.getElementById('xAxisSelect').value;
    const yColumn = document.getElementById('yAxisSelect').value;
    const groupBy = document.getElementById('groupBySelect').value;
    
    if (!xColumn || !yColumn) return;
    
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.originalData;
    const container = document.getElementById('comparisonChart');
    
    // Destroy previous chart
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
        }));
        
        chartConfig = {
            type: 'scatter',
            data: {
                datasets: [{
                    label: `${yColumn} vs ${xColumn}`,
                    data: points,
                    backgroundColor: 'rgba(124, 58, 237, 0.6)',
                    borderColor: '#7c3aed',
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `${yColumn} vs ${xColumn}`,
                        font: { size: 18, weight: 'bold' }
                    },
                    legend: { display: true, position: 'top' }
                },
                scales: {
                    x: {
                        title: { display: true, text: xColumn, font: { size: 14, weight: '600' } },
                        grid: { color: '#e5e5e5' }
                    },
                    y: {
                        title: { display: true, text: yColumn, font: { size: 14, weight: '600' } },
                        grid: { color: '#e5e5e5' }
                    }
                }
            }
        };
    } else if (chartType === 'line') {
        const points = data.map(row => ({
            x: row[xColumn],
            y: parseFloat(row[yColumn]) || 0
        }));
        
        // Sort by x
        points.sort((a, b) => {
            if (typeof a.x === 'number') return a.x - b.x;
            return String(a.x).localeCompare(String(b.x));
        });
        
        chartConfig = {
            type: 'line',
            data: {
                labels: points.map(p => p.x),
                datasets: [{
                    label: yColumn,
                    data: points.map(p => p.y),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `${yColumn} vs ${xColumn}`,
                        font: { size: 18, weight: 'bold' }
                    },
                    legend: { display: true, position: 'top' }
                },
                scales: {
                    x: {
                        title: { display: true, text: xColumn, font: { size: 14, weight: '600' } },
                        grid: { color: '#e5e5e5' }
                    },
                    y: {
                        title: { display: true, text: yColumn, font: { size: 14, weight: '600' } },
                        grid: { color: '#e5e5e5' }
                    }
                }
            }
        };
    } else { // bar
        // Aggregate y values by x category
        const aggregated = {};
        data.forEach(row => {
            const xVal = String(row[xColumn]);
            const yVal = parseFloat(row[yColumn]) || 0;
            if (!aggregated[xVal]) {
                aggregated[xVal] = { sum: 0, count: 0 };
            }
            aggregated[xVal].sum += yVal;
            aggregated[xVal].count += 1;
        });
        
        const labels = Object.keys(aggregated);
        const values = labels.map(label => aggregated[label].sum / aggregated[label].count);
        
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
                plugins: {
                    title: {
                        display: true,
                        text: `${yColumn} by ${xColumn}`,
                        font: { size: 18, weight: 'bold' }
                    },
                    legend: { display: true, position: 'top' }
                },
                scales: {
                    x: {
                        title: { display: true, text: xColumn, font: { size: 14, weight: '600' } },
                        grid: { display: false }
                    },
                    y: {
                        title: { display: true, text: `Average ${yColumn}`, font: { size: 14, weight: '600' } },
                        grid: { color: '#e5e5e5' },
                        beginAtZero: true
                    }
                }
            }
        };
    }
    
    appState.chartInstances['comparisonChart'] = new Chart(ctx, chartConfig);
}

// Re-render all charts
function renderAllCharts() {
    // Render categorical chart if visible
    const catSelect = document.getElementById('categoricalColumnSelect');
    if (catSelect && catSelect.value) {
        renderCategoricalChart(catSelect.value);
    }
    
    // Render numeric chart if visible
    const numSelect = document.getElementById('numericColumnSelect');
    if (numSelect && numSelect.value) {
        renderNumericChart(numSelect.value);
    }
    
    // Render pie chart if visible
    const pieSelect = document.getElementById('pieColumnSelect');
    if (pieSelect && pieSelect.value) {
        renderPieChartViz(pieSelect.value);
    }
    
    // Render comparison chart if visible
    const xAxisSelect = document.getElementById('xAxisSelect');
    const yAxisSelect = document.getElementById('yAxisSelect');
    if (xAxisSelect && yAxisSelect && xAxisSelect.value && yAxisSelect.value) {
        renderComparisonChart();
    }
}

function renderAllVisualizations() {
    renderAllCharts();
}

function generateVisualizations() {
    const container = document.getElementById('visualizationsContainer');
    const data = appState.filteredData;
    
    if (data.length === 0) return;

    const columns = Object.keys(data[0]);
    const numericColumns = columns.filter(col => appState.columnTypes[col] === 'numeric');
    const categoricalColumns = columns.filter(col => appState.columnTypes[col] === 'categorical');

    // Clear existing charts
    appState.charts.forEach(chart => {
        if (chart && chart.destroy) chart.destroy();
    });
    appState.charts = [];

    let html = '<div class="charts-grid">';

    // Chart 1: Bar Chart - Categorical frequency
    if (categoricalColumns.length > 0) {
        html += `<div class="chart-card">
            <h3>Categorical Distribution</h3>
            <div class="chart-controls">
                <div>
                    <label>Column</label>
                    <select id="bar-column" onchange="updateChart('bar')">`;
        categoricalColumns.forEach(col => {
            html += `<option value="${col}">${col}</option>`;
        });
        html += `</select></div></div>
            <div class="chart-container"><canvas id="chart-bar"></canvas></div>
        </div>`;
    }

    // Chart 2: Line Chart - Numeric trend
    if (numericColumns.length > 0) {
        html += `<div class="chart-card">
            <h3>Numeric Trend</h3>
            <div class="chart-controls">
                <div>
                    <label>Column</label>
                    <select id="line-column" onchange="updateChart('line')">`;
        numericColumns.forEach(col => {
            html += `<option value="${col}">${col}</option>`;
        });
        html += `</select></div></div>
            <div class="chart-container"><canvas id="chart-line"></canvas></div>
        </div>`;
    }

    // Chart 3: Pie Chart
    if (categoricalColumns.length > 0) {
        html += `<div class="chart-card">
            <h3>Pie Chart</h3>
            <div class="chart-controls">
                <div>
                    <label>Column</label>
                    <select id="pie-column" onchange="updateChart('pie')">`;
        categoricalColumns.forEach(col => {
            html += `<option value="${col}">${col}</option>`;
        });
        html += `</select></div></div>
            <div class="chart-container"><canvas id="chart-pie"></canvas></div>
        </div>`;
    }

    // Chart 4: Scatter Plot
    if (numericColumns.length >= 2) {
        html += `<div class="chart-card">
            <h3>Scatter Plot</h3>
            <div class="chart-controls">
                <div>
                    <label>X-Axis</label>
                    <select id="scatter-x" onchange="updateChart('scatter')">`;
        numericColumns.forEach(col => {
            html += `<option value="${col}">${col}</option>`;
        });
        html += `</select></div>
                <div>
                    <label>Y-Axis</label>
                    <select id="scatter-y" onchange="updateChart('scatter')">`;
        numericColumns.forEach((col, i) => {
            html += `<option value="${col}" ${i === 1 ? 'selected' : ''}>${col}</option>`;
        });
        html += `</select></div></div>
            <div class="chart-container"><canvas id="chart-scatter"></canvas></div>
        </div>`;
    }

    html += '</div>';
    container.innerHTML = html;

    // Create charts
    setTimeout(() => {
        if (categoricalColumns.length > 0) {
            createBarChart();
            createPieChart();
        }
        if (numericColumns.length > 0) {
            createLineChart();
        }
        if (numericColumns.length >= 2) {
            createScatterChart();
        }
    }, 100);
}

// Old chart creation functions (keep for backwards compatibility with Filters section)
function createBarChart() {
    const column = document.getElementById('bar-column').value;
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    
    if (data.length === 0) {
        document.getElementById('chart-bar').parentElement.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 40px;">No data matches the current filters</p>';
        return;
    }
    
    const frequency = {};
    data.forEach(row => {
        const val = row[column];
        frequency[val] = (frequency[val] || 0) + 1;
    });

    const ctx = document.getElementById('chart-bar').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(frequency),
            datasets: [{
                label: 'Count',
                data: Object.values(frequency),
                backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `${column} Distribution (Bar Chart)`,
                    font: { size: 18, weight: 'bold' },
                    padding: { bottom: 20 }
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed.y / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed.y} (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: column,
                        font: { size: 14, weight: '600' },
                        padding: { top: 10 }
                    },
                    grid: { display: false }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Number of Items',
                        font: { size: 14, weight: '600' },
                        padding: { bottom: 10 }
                    },
                    grid: { color: '#e5e5e5' },
                    beginAtZero: true
                }
            }
        }
    });
    appState.charts.push(chart);
}

function createLineChart() {
    const column = document.getElementById('line-column').value;
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    
    if (data.length === 0) {
        document.getElementById('chart-line').parentElement.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 40px;">No data matches the current filters</p>';
        return;
    }
    
    const values = data.map(row => parseFloat(row[column])).filter(v => !isNaN(v));
    
    const ctx = document.getElementById('chart-line').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: values.map((_, i) => i + 1),
            datasets: [{
                label: column,
                data: values,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `${column} Trend (Line Chart)`,
                    font: { size: 18, weight: 'bold' },
                    padding: { bottom: 20 }
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${column}: ${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Row Index',
                        font: { size: 14, weight: '600' },
                        padding: { top: 10 }
                    },
                    grid: { color: '#e5e5e5' }
                },
                y: {
                    title: {
                        display: true,
                        text: column,
                        font: { size: 14, weight: '600' },
                        padding: { bottom: 10 }
                    },
                    grid: { color: '#e5e5e5' },
                    beginAtZero: false
                }
            }
        }
    });
    appState.charts.push(chart);
}

function createPieChart() {
    const column = document.getElementById('pie-column').value;
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    
    if (data.length === 0) {
        document.getElementById('chart-pie').parentElement.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 40px;">No data matches the current filters</p>';
        return;
    }
    
    const frequency = {};
    data.forEach(row => {
        const val = row[column];
        frequency[val] = (frequency[val] || 0) + 1;
    });
    
    const ctx = document.getElementById('chart-pie').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(frequency),
            datasets: [{
                label: column,
                data: Object.values(frequency),
                backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `${column} Breakdown (Pie Chart)`,
                    font: { size: 18, weight: 'bold' },
                    padding: { bottom: 20 }
                },
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        font: { size: 12 },
                        padding: 15,
                        generateLabels: function(chart) {
                            const data = chart.data;
                            const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                            return data.labels.map((label, i) => {
                                const value = data.datasets[0].data[i];
                                const percentage = ((value / total) * 100).toFixed(1);
                                return {
                                    text: `${label} (${percentage}%)`,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    hidden: false,
                                    index: i
                                };
                            });
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
    appState.charts.push(chart);
}

function createScatterChart() {
    const xCol = document.getElementById('scatter-x').value;
    const yCol = document.getElementById('scatter-y').value;
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    
    if (data.length === 0) {
        document.getElementById('chart-scatter').parentElement.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 40px;">No data matches the current filters</p>';
        return;
    }
    
    const points = data.map(row => ({
        x: parseFloat(row[xCol]),
        y: parseFloat(row[yCol])
    })).filter(p => !isNaN(p.x) && !isNaN(p.y));
    
    const ctx = document.getElementById('chart-scatter').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: `Data Points`,
                data: points,
                backgroundColor: 'rgba(124, 58, 237, 0.6)',
                borderColor: 'rgba(124, 58, 237, 1)',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `${xCol} vs ${yCol} (Scatter Plot)`,
                    font: { size: 18, weight: 'bold' },
                    padding: { bottom: 20 }
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${xCol}: ${context.parsed.x.toFixed(2)}, ${yCol}: ${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: xCol,
                        font: { size: 14, weight: '600' },
                        padding: { top: 10 }
                    },
                    grid: { color: '#e5e5e5' }
                },
                y: {
                    title: {
                        display: true,
                        text: yCol,
                        font: { size: 14, weight: '600' },
                        padding: { bottom: 10 }
                    },
                    grid: { color: '#e5e5e5' }
                }
            }
        }
    });
    appState.charts.push(chart);
}

function updateChart(type) {
    if (type === 'bar') createBarChart();
    else if (type === 'line') createLineChart();
    else if (type === 'pie') createPieChart();
    else if (type === 'scatter') createScatterChart();
}

// AI Assistant Functions
function toggleAIAssistant() {
    const panel = document.getElementById('aiAssistantPanel');
    const btn = document.getElementById('aiAssistantToggle');
    
    panel.classList.toggle('open');
    
    if (panel.classList.contains('open')) {
        btn.style.display = 'none';
    } else {
        btn.style.display = 'flex';
    }
}

function sendAIMessage() {
    const input = document.getElementById('aiChatInput');
    const question = input.value.trim();
    
    if (!question) return;
    
    addAIMessage('user', question);
    input.value = '';
    
    // Process question
    setTimeout(() => {
        const response = processAIQuestion(question);
        addAIMessage('assistant', response);
    }, 500);
}

function addAIMessage(type, message) {
    const container = document.getElementById('aiChatHistory');
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message-item ${type}`;
    
    messageDiv.innerHTML = `<div class="ai-message-bubble">${message}</div>`;
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}



function processAIQuestion(question) {
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.uploadedData;
    const lowerQ = question.toLowerCase();
    
    if (data.length === 0) {
        return "Please upload a dataset first so I can answer your questions!";
    }
    
    const columns = Object.keys(data[0]);
    
    // Find mentioned column
    let mentionedColumn = null;
    for (let col of columns) {
        if (lowerQ.includes(col.toLowerCase())) {
            mentionedColumn = col;
            break;
        }
    }
    
    // Average/Mean
    if (lowerQ.includes('average') || lowerQ.includes('mean')) {
        if (mentionedColumn && appState.columnTypes[mentionedColumn] === 'numeric') {
            const values = data.map(row => parseFloat(row[mentionedColumn])).filter(v => !isNaN(v));
            const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
            return `The average value of ${mentionedColumn} is ${avg}.`;
        }
        return "Please specify a numeric column name in your question.";
    }
    
    // Sum/Total
    if (lowerQ.includes('sum') || lowerQ.includes('total')) {
        if (mentionedColumn && appState.columnTypes[mentionedColumn] === 'numeric') {
            const values = data.map(row => parseFloat(row[mentionedColumn])).filter(v => !isNaN(v));
            const sum = values.reduce((a, b) => a + b, 0).toFixed(2);
            return `The total sum of ${mentionedColumn} is ${sum}.`;
        }
        return "Please specify a numeric column name in your question.";
    }
    
    // Max/Maximum
    if (lowerQ.includes('max') || lowerQ.includes('maximum') || lowerQ.includes('highest')) {
        if (mentionedColumn && appState.columnTypes[mentionedColumn] === 'numeric') {
            const values = data.map(row => parseFloat(row[mentionedColumn])).filter(v => !isNaN(v));
            const max = Math.max(...values).toFixed(2);
            return `The maximum value of ${mentionedColumn} is ${max}.`;
        }
        return "Please specify a numeric column name in your question.";
    }
    
    // Min/Minimum
    if (lowerQ.includes('min') || lowerQ.includes('minimum') || lowerQ.includes('lowest')) {
        if (mentionedColumn && appState.columnTypes[mentionedColumn] === 'numeric') {
            const values = data.map(row => parseFloat(row[mentionedColumn])).filter(v => !isNaN(v));
            const min = Math.min(...values).toFixed(2);
            return `The minimum value of ${mentionedColumn} is ${min}.`;
        }
        return "Please specify a numeric column name in your question.";
    }
    
    // Top values
    if (lowerQ.includes('top')) {
        if (mentionedColumn) {
            const frequency = {};
            data.forEach(row => {
                const val = row[mentionedColumn];
                frequency[val] = (frequency[val] || 0) + 1;
            });
            const sorted = Object.entries(frequency).sort((a, b) => b[1] - a[1]).slice(0, 5);
            let response = `Top 5 values in ${mentionedColumn}:\n`;
            sorted.forEach(([val, count], i) => {
                response += `${i + 1}. ${val} (${count} occurrences)\n`;
            });
            return response;
        }
    }
    
    // Summary
    if (lowerQ.includes('summary') || lowerQ.includes('summarize') || lowerQ.includes('overview')) {
        let summary = `Dataset Summary:\n\n`;
        summary += `📊 Total Rows: ${data.length}\n`;
        summary += `📋 Total Columns: ${columns.length}\n\n`;
        
        const numericCols = columns.filter(col => appState.columnTypes[col] === 'numeric');
        if (numericCols.length > 0) {
            summary += `Numeric Columns (${numericCols.length}):\n`;
            numericCols.slice(0, 3).forEach(col => {
                const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
                const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
                summary += `  • ${col}: avg = ${avg}\n`;
            });
        }
        return summary;
    }
    
    // Correlation
    if (lowerQ.includes('correlation') || lowerQ.includes('correlate') || lowerQ.includes('relationship')) {
        const numericCols = columns.filter(col => appState.columnTypes[col] === 'numeric');
        if (numericCols.length >= 2) {
            const correlations = [];
            for (let i = 0; i < numericCols.length; i++) {
                for (let j = i + 1; j < numericCols.length; j++) {
                    const corr = calculateCorrelation(data, numericCols[i], numericCols[j]);
                    if (Math.abs(corr) > 0.5) {
                        correlations.push({ cols: [numericCols[i], numericCols[j]], corr });
                    }
                }
            }
            if (correlations.length > 0) {
                let response = "Strong correlations found:\n";
                correlations.slice(0, 3).forEach(item => {
                    response += `${item.cols[0]} ↔ ${item.cols[1]}: ${item.corr.toFixed(2)}\n`;
                });
                return response;
            } else {
                return "No strong correlations found between numeric columns.";
            }
        }
        return "Need at least 2 numeric columns to calculate correlations.";
    }
    
    // Insights
    if (lowerQ.includes('insight') || lowerQ.includes('interesting') || lowerQ.includes('finding')) {
        return generateQuickInsights();
    }
    
    // Distribution
    if (lowerQ.includes('distribution')) {
        if (mentionedColumn) {
            if (appState.columnTypes[mentionedColumn] === 'numeric') {
                const values = data.map(row => parseFloat(row[mentionedColumn])).filter(v => !isNaN(v));
                const sorted = values.sort((a, b) => a - b);
                const median = sorted[Math.floor(sorted.length / 2)];
                const mean = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
                return `Distribution of ${mentionedColumn}:\nMean: ${mean}\nMedian: ${median}\nMin: ${Math.min(...values)}\nMax: ${Math.max(...values)}`;
            } else {
                const frequency = {};
                data.forEach(row => {
                    const val = row[mentionedColumn];
                    frequency[val] = (frequency[val] || 0) + 1;
                });
                const uniqueCount = Object.keys(frequency).length;
                return `${mentionedColumn} has ${uniqueCount} unique values. The most common is ${Object.entries(frequency).sort((a, b) => b[1] - a[1])[0][0]}.`;
            }
        }
    }
    
    // Default response
    return `I can help you with:\n• Statistics (average, sum, min, max)\n• Top values\n• Correlations\n• Data summary\n• Distribution analysis\n• Insights\n\nTry asking "What is the average of [column]?" or "Show me a summary"`;
}

function calculateCorrelation(data, col1, col2) {
    const pairs = data.map(row => [parseFloat(row[col1]), parseFloat(row[col2])]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
    const n = pairs.length;
    
    const sum1 = pairs.reduce((a, b) => a + b[0], 0);
    const sum2 = pairs.reduce((a, b) => a + b[1], 0);
    const sum1Sq = pairs.reduce((a, b) => a + b[0] * b[0], 0);
    const sum2Sq = pairs.reduce((a, b) => a + b[1] * b[1], 0);
    const pSum = pairs.reduce((a, b) => a + b[0] * b[1], 0);
    
    const num = pSum - (sum1 * sum2 / n);
    const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));
    
    return den === 0 ? 0 : num / den;
}

function generateQuickInsights() {
    const data = appState.filteredData;
    const columns = Object.keys(data[0]);
    let insights = "Key Insights:\n\n";
    
    // Check for missing values
    const missingCols = [];
    columns.forEach(col => {
        const missing = data.filter(row => !row[col] || row[col] === '').length;
        if (missing > data.length * 0.1) {
            missingCols.push(col);
        }
    });
    if (missingCols.length > 0) {
        insights += `⚠️ Columns with >10% missing data: ${missingCols.join(', ')}\n\n`;
    }
    
    // Numeric insights
    const numericCols = columns.filter(col => appState.columnTypes[col] === 'numeric');
    if (numericCols.length > 0) {
        const col = numericCols[0];
        const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
        const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
        insights += `📈 ${col} average: ${avg}\n`;
    }
    
    insights += `\n📊 Dataset has ${data.length} rows across ${columns.length} columns.`;
    
    return `I can help you with:\n• Statistics (average, sum, min, max)\n• Top values\n• Correlations\n• Data summary\n• Distribution analysis\n• Insights\n\nTry asking "What is the average of [column]?" or "Show me a summary"`;
}

// Chart Export Functions
function downloadChartImage(chartId) {
    const chartInstance = appState.chartInstances[chartId];
    if (!chartInstance) {
        showToast('Chart not available', 'error');
        return;
    }
    
    const canvas = chartInstance.canvas;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${chartId}_${new Date().getTime()}.png`;
    link.href = url;
    link.click();
    
    showToast('Chart downloaded successfully!', 'success');
}

function zoomChart(chartId) {
    const chartInstance = appState.chartInstances[chartId];
    if (!chartInstance) {
        showToast('Chart not available', 'error');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'chart-modal';
    modal.innerHTML = `
        <div class="chart-modal-content">
            <div class="chart-modal-header">
                <h3>${chartInstance.options.plugins.title.text || 'Chart'}</h3>
                <button class="close-modal" onclick="this.closest('.chart-modal').remove()">✕</button>
            </div>
            <div class="chart-modal-body">
                <canvas id="modalChart"></canvas>
            </div>
            <div class="chart-modal-footer">
                <button class="btn-secondary" onclick="downloadChartImageFromModal('${chartId}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Download PNG
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const modalCanvas = modal.querySelector('#modalChart');
    const ctx = modalCanvas.getContext('2d');
    
    const config = JSON.parse(JSON.stringify(chartInstance.config));
    new Chart(ctx, config);
}

function downloadChartImageFromModal(chartId) {
    const modalCanvas = document.querySelector('#modalChart');
    if (modalCanvas) {
        const url = modalCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `${chartId}_zoomed_${new Date().getTime()}.png`;
        link.href = url;
        link.click();
        showToast('Chart downloaded!', 'success');
    }
}

function exportAllChartsToPDF() {
    if (typeof jspdf === 'undefined') {
        showToast('PDF library not loaded', 'error');
        return;
    }
    
    showToast('Generating PDF...', 'info');
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // Add title page
    pdf.setFontSize(24);
    pdf.text('Data Visualization Report', 105, 30, { align: 'center' });
    pdf.setFontSize(12);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 105, 40, { align: 'center' });
    pdf.text(`Dataset: ${appState.fileName || 'Unknown'}`, 105, 50, { align: 'center' });
    
    const chartIds = ['categoricalChart', 'numericChart', 'pieChart', 'comparisonChart'];
    let pageNum = 1;
    
    chartIds.forEach((chartId, index) => {
        const chartInstance = appState.chartInstances[chartId];
        if (!chartInstance) return;
        
        if (index > 0) {
            pdf.addPage();
            pageNum++;
        }
        
        // Add chart title
        pdf.setFontSize(16);
        const title = chartInstance.options.plugins.title.text || chartId;
        pdf.text(title, 105, 20, { align: 'center' });
        
        // Convert canvas to image and add to PDF
        const canvas = chartInstance.canvas;
        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 15, 30, 180, 120);
        
        // Add page number
        pdf.setFontSize(10);
        pdf.text(`Page ${pageNum}`, 105, 290, { align: 'center' });
    });
    
    pdf.save(`data_visualization_report_${new Date().getTime()}.pdf`);
    showToast('PDF exported successfully!', 'success');
}

// Insights Generation Functions
function generateInsightsDocument() {
    const request = document.getElementById('insightsRequest').value;
    
    if (!request.trim()) {
        showToast('Please describe what insights you want', 'warning');
        return;
    }
    
    if (!appState.isDataLoaded) {
        showToast('Please upload data first', 'warning');
        return;
    }
    
    showToast('Generating insights...', 'info');
    
    // Simulate AI processing
    setTimeout(() => {
        const insights = analyzeDataForInsights(request);
        displayInsightsDocument(insights, request);
        showToast('Insights generated successfully!', 'success');
    }, 1500);
}

function analyzeDataForInsights(userRequest) {
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.originalData;
    const columns = Object.keys(data[0]);
    
    let insights = {
        title: 'Data Insights Report',
        generatedDate: new Date().toLocaleString(),
        userRequest: userRequest,
        sections: []
    };
    
    // 1. Executive Summary
    insights.sections.push({
        title: 'Executive Summary',
        content: `This report provides comprehensive insights based on your request: "${userRequest}". 
                  The analysis covers ${data.length} records across ${columns.length} variables.`
    });
    
    // 2. Dataset Overview
    const numericCols = columns.filter(col => !isNaN(parseFloat(data[0][col])));
    const categoricalCols = columns.filter(col => isNaN(parseFloat(data[0][col])));
    
    insights.sections.push({
        title: 'Dataset Overview',
        content: `
            <ul>
                <li><strong>Total Records:</strong> ${data.length.toLocaleString()}</li>
                <li><strong>Numeric Columns:</strong> ${numericCols.length} (${numericCols.join(', ')})</li>
                <li><strong>Categorical Columns:</strong> ${categoricalCols.length} (${categoricalCols.slice(0, 5).join(', ')}${categoricalCols.length > 5 ? '...' : ''})</li>
            </ul>
        `
    });
    
    // 3. Key Statistics
    let statsContent = '<div class="stats-summary">';
    numericCols.slice(0, 5).forEach(col => {
        const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
        if (values.length > 0) {
            const avg = values.reduce((a, b) => a + b) / values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);
            
            statsContent += `
                <div class="stat-item">
                    <strong>${col}:</strong><br/>
                    Average: ${avg.toFixed(2)}<br/>
                    Range: ${min.toFixed(2)} - ${max.toFixed(2)}
                </div>
            `;
        }
    });
    statsContent += '</div>';
    
    insights.sections.push({
        title: 'Key Statistics',
        content: statsContent
    });
    
    // 4. Distribution Analysis
    if (categoricalCols.length > 0) {
        const topCat = categoricalCols[0];
        const frequencies = {};
        data.forEach(row => {
            const val = String(row[topCat]);
            frequencies[val] = (frequencies[val] || 0) + 1;
        });
        
        const topValues = Object.entries(frequencies)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        let distContent = `<p>Distribution of <strong>${topCat}</strong>:</p><ul>`;
        topValues.forEach(([val, count]) => {
            const pct = ((count / data.length) * 100).toFixed(1);
            distContent += `<li>${val}: ${count} (${pct}%)</li>`;
        });
        distContent += '</ul>';
        
        insights.sections.push({
            title: 'Distribution Analysis',
            content: distContent
        });
    }
    
    // 5. Correlations (if numeric columns exist)
    if (numericCols.length >= 2) {
        const corr = calculateCorrelation(
            data, 
            numericCols[0], 
            numericCols[1]
        );
        
        insights.sections.push({
            title: 'Correlation Analysis',
            content: `
                <p>Correlation between <strong>${numericCols[0]}</strong> and <strong>${numericCols[1]}</strong>:</p>
                <p>Correlation coefficient: <strong>${corr.toFixed(3)}</strong></p>
                <p>${Math.abs(corr) > 0.7 ? 'Strong' : Math.abs(corr) > 0.4 ? 'Moderate' : 'Weak'} 
                ${corr > 0 ? 'positive' : 'negative'} correlation detected.</p>
            `
        });
    }
    
    // 6. Recommendations
    insights.sections.push({
        title: 'Recommendations',
        content: `
            <ul>
                <li>Consider creating visualizations for the identified trends</li>
                <li>Investigate outliers in numeric columns for potential data quality issues</li>
                <li>Explore deeper relationships between correlated variables</li>
                <li>Use filters to segment analysis by key categories</li>
            </ul>
        `
    });
    
    return insights;
}

function displayInsightsDocument(insights, userRequest) {
    const container = document.getElementById('generatedInsights');
    const contentDiv = document.getElementById('insightsDocumentContent');
    
    // Store insights for download
    appState.currentInsights = insights;
    
    // Update date
    document.getElementById('insightsGeneratedDate').textContent = 
        `Generated: ${insights.generatedDate}`;
    
    // Build document HTML
    let html = `<div class="insights-doc">`;
    html += `<h2>${insights.title}</h2>`;
    html += `<p class="insights-request"><strong>Your Request:</strong> ${userRequest}</p>`;
    
    insights.sections.forEach(section => {
        html += `
            <div class="insight-section">
                <h3>${section.title}</h3>
                <div class="insight-content">${section.content}</div>
            </div>
        `;
    });
    
    html += `</div>`;
    
    contentDiv.innerHTML = html;
    container.style.display = 'block';
    document.getElementById('downloadInsightsBtn').style.display = 'inline-flex';
    
    // Scroll to document
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function downloadInsightsDocument() {
    if (!appState.currentInsights) {
        showToast('No insights to download', 'warning');
        return;
    }
    
    const insights = appState.currentInsights;
    
    // Create markdown document
    let markdown = `# ${insights.title}\n\n`;
    markdown += `**Generated:** ${insights.generatedDate}\n\n`;
    markdown += `**User Request:** ${insights.userRequest}\n\n`;
    markdown += `---\n\n`;
    
    insights.sections.forEach(section => {
        markdown += `## ${section.title}\n\n`;
        // Strip HTML tags for markdown
        const plainContent = section.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
        markdown += `${plainContent}\n\n`;
    });
    
    // Create download
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `insights_report_${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
    
    showToast('Insights document downloaded!', 'success');
}

// Insights Generation
function generateInsights() {
    if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) {
        showNoDataMessage('insights');
        return;
    }
    
    generateAutoInsights();
}

function generateAutoInsights() {
    if (!appState.isDataLoaded || !appState.originalData || appState.originalData.length === 0) {
        showNoDataMessage('insights');
        return;
    }
    
    const data = appState.filteredData.length > 0 ? appState.filteredData : appState.originalData;
    const columns = Object.keys(data[0]);
    const insights = [];
    
    // 1. Dataset Summary Insight
    const numericCols = columns.filter(col => {
        const val = data[0][col];
        return typeof val === 'number' || !isNaN(parseFloat(val));
    });
    
    const categoricalCols = columns.filter(col => {
        const unique = [...new Set(data.map(row => row[col]))];
        return unique.length < 20;
    });
    
    insights.push({
        icon: '📊',
        title: 'Dataset Overview',
        description: `Your dataset contains ${data.length.toLocaleString()} records with ${columns.length} variables. There are ${numericCols.length} numeric columns for quantitative analysis and ${categoricalCols.length} categorical columns for segmentation.`,
        type: 'info',
        stats: `${data.length.toLocaleString()} rows × ${columns.length} columns`
    });

    // 2. Data Completeness
    let totalCells = data.length * columns.length;
    let missingCells = 0;
    columns.forEach(col => {
        missingCells += data.filter(row => !row[col] || row[col] === '').length;
    });
    const completeness = ((totalCells - missingCells) / totalCells * 100).toFixed(1);
    
    insights.push({
        icon: completeness > 95 ? '✅' : completeness > 80 ? '⚠️' : '❌',
        title: 'Data Completeness',
        description: `Your data is ${completeness}% complete with ${missingCells.toLocaleString()} missing values across all fields. ${completeness > 95 ? 'Excellent data quality!' : completeness > 80 ? 'Consider addressing missing values for better analysis.' : 'Significant data quality issues detected. Review the Data Quality section.'}`,
        type: completeness > 95 ? 'success' : completeness > 80 ? 'warning' : 'error',
        stats: `${completeness}% complete`,
        action: completeness < 95 ? { text: 'Fix Issues', section: 'quality', subsection: 'missing' } : null
    });

    // 3. Numeric Statistics Summary
    if (numericCols.length > 0) {
        const firstNumCol = numericCols[0];
        const values = data.map(row => parseFloat(row[firstNumCol])).filter(v => !isNaN(v));
        
        if (values.length > 0) {
            const avg = values.reduce((a, b) => a + b) / values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);
            const range = max - min;
            
            insights.push({
                icon: '📈',
                title: `${firstNumCol} Analysis`,
                description: `The ${firstNumCol} ranges from ${min.toFixed(2)} to ${max.toFixed(2)} with an average of ${avg.toFixed(2)}. ${range > avg * 2 ? 'High variability detected - consider investigating outliers.' : 'Values show consistent patterns.'}`,
                type: 'info',
                stats: `Avg: ${avg.toFixed(2)}`
            });
        }
    }

    // 4. Categorical Distribution
    if (categoricalCols.length > 0) {
        const topCat = categoricalCols[0];
        const frequencies = {};
        data.forEach(row => {
            const val = String(row[topCat] || 'Unknown');
            frequencies[val] = (frequencies[val] || 0) + 1;
        });
        
        const sorted = Object.entries(frequencies).sort((a, b) => b[1] - a[1]);
        const topCategory = sorted[0];
        const topPercentage = ((topCategory[1] / data.length) * 100).toFixed(1);
        
        insights.push({
            icon: '🏷️',
            title: `${topCat} Distribution`,
            description: `The most common ${topCat} is "${topCategory[0]}" representing ${topPercentage}% of all records (${topCategory[1].toLocaleString()} items). ${sorted.length} unique categories detected.`,
            type: 'info',
            stats: `${sorted.length} categories`
        });
    }

    // 5. Correlations (if multiple numeric columns)
    if (numericCols.length >= 2) {
        const col1 = numericCols[0];
        const col2 = numericCols[1];
        const corr = calculateCorrelation(data, col1, col2);
        
        const strength = Math.abs(corr) > 0.7 ? 'Strong' : Math.abs(corr) > 0.4 ? 'Moderate' : 'Weak';
        const direction = corr > 0 ? 'positive' : 'negative';
        
        insights.push({
            icon: Math.abs(corr) > 0.7 ? '🔗' : Math.abs(corr) > 0.4 ? '↔️' : '⚪',
            title: 'Correlation Detected',
            description: `${strength} ${direction} correlation (${corr.toFixed(3)}) found between ${col1} and ${col2}. ${Math.abs(corr) > 0.7 ? 'These variables are highly related - changes in one tend to predict changes in the other.' : 'Consider exploring relationships in the Visualizations section.'}`,
            type: Math.abs(corr) > 0.7 ? 'success' : 'info',
            stats: `r = ${corr.toFixed(3)}`
        });
    }

    // 6. Duplicate Records
    const uniqueRows = new Set(data.map(row => JSON.stringify(row)));
    const duplicates = data.length - uniqueRows.size;
    
    if (duplicates > 0) {
        insights.push({
            icon: '🔄',
            title: 'Duplicate Records',
            description: `Found ${duplicates.toLocaleString()} duplicate records (${((duplicates / data.length) * 100).toFixed(1)}% of data). Consider removing duplicates to improve data quality and analysis accuracy.`,
            type: 'warning',
            stats: `${duplicates} duplicates`,
            action: { text: 'Review Duplicates', section: 'quality', subsection: 'duplicates' }
        });
    } else {
        insights.push({
            icon: '✨',
            title: 'No Duplicates',
            description: 'All records are unique - excellent data quality! No duplicate removal needed.',
            type: 'success',
            stats: 'All unique'
        });
    }
    
    // Render insights
    renderQuickInsights(insights);
}

function renderQuickInsights(insights) {
    const grid = document.getElementById('quickInsightsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    insights.forEach(insight => {
        const card = document.createElement('div');
        card.className = `insight-card insight-${insight.type}`;
        
        let html = `
            <div class="insight-header">
                <div class="insight-icon-large">${insight.icon}</div>
                <div class="insight-title-group">
                    <h4>${insight.title}</h4>
                    ${insight.stats ? `<span class="insight-stat">${insight.stats}</span>` : ''}
                </div>
            </div>
            <p class="insight-description">${insight.description}</p>
        `;
        
        if (insight.action) {
            const subsection = insight.action.subsection || '';
            html += `
                <button class="insight-action-btn" onclick="navigateToDataQuality('${subsection}')">
                    ${insight.action.text} →
                </button>
            `;
        }
        
        card.innerHTML = html;
        grid.appendChild(card);
    });
}

// Export Functions
function exportFilteredData() {
    const data = appState.filteredData;
    if (data.length === 0) {
        alert('No data to export!');
        return;
    }

    const columns = Object.keys(data[0]);
    let csv = columns.join(',') + '\n';
    
    data.forEach(row => {
        const values = columns.map(col => {
            const val = row[col] || '';
            return `"${val}"`;
        });
        csv += values.join(',') + '\n';
    });

    downloadFile(csv, 'filtered_data.csv', 'text/csv');
}

function exportSummary() {
    const data = appState.uploadedData;
    if (data.length === 0) {
        alert('No data to summarize!');
        return;
    }

    const columns = Object.keys(data[0]);
    let summary = 'DATA SUMMARY\n';
    summary += '='.repeat(50) + '\n\n';
    summary += `File: ${appState.fileName}\n`;
    summary += `Total Rows: ${data.length}\n`;
    summary += `Total Columns: ${columns.length}\n\n`;
    
    summary += 'COLUMN DETAILS:\n';
    summary += '-'.repeat(50) + '\n';
    columns.forEach(col => {
        summary += `\n${col} (${appState.columnTypes[col]})\n`;
        if (appState.columnTypes[col] === 'numeric') {
            const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
            if (values.length > 0) {
                const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
                summary += `  Mean: ${avg}\n`;
                summary += `  Min: ${Math.min(...values)}\n`;
                summary += `  Max: ${Math.max(...values)}\n`;
            }
        } else {
            const uniqueValues = new Set(data.map(row => row[col]).filter(v => v));
            summary += `  Unique values: ${uniqueValues.size}\n`;
        }
        const missing = data.filter(row => !row[col] || row[col] === '').length;
        if (missing > 0) {
            summary += `  Missing: ${missing} (${((missing / data.length) * 100).toFixed(1)}%)\n`;
        }
    });

    downloadFile(summary, 'data_summary.txt', 'text/plain');
}

function exportInsights() {
    const data = appState.uploadedData;
    if (data.length === 0) {
        alert('No data to analyze!');
        return;
    }

    const insights = {
        fileName: appState.fileName,
        totalRows: data.length,
        totalColumns: Object.keys(data[0]).length,
        columnTypes: appState.columnTypes,
        missingValues: {},
        duplicates: findDuplicates(data),
        generatedAt: new Date().toISOString()
    };

    const columns = Object.keys(data[0]);
    columns.forEach(col => {
        const missing = data.filter(row => !row[col] || row[col] === '').length;
        if (missing > 0) {
            insights.missingValues[col] = {
                count: missing,
                percentage: ((missing / data.length) * 100).toFixed(2)
            };
        }
    });

    downloadFile(JSON.stringify(insights, null, 2), 'insights.json', 'application/json');
}

// Show toast notification
function showToast(message, type = 'info') {
    console.log('Toast:', type, message);
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Style based on type
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
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    // Remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
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

// Legacy chat functions for backwards compatibility
function sendChatMessage() {
    sendAIMessage();
}

function addChatMessage(type, message) {
    addAIMessage(type === 'ai' ? 'assistant' : 'user', message);
}