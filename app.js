// Application State (in-memory, no localStorage)
let appState = {
    uploadedData: [],
    filteredData: [],
    originalData: [],
    activeFilters: {},
    chatHistory: [],
    columnTypes: {},
    fileName: '',
    charts: []
};

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

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

    // File upload
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', function() {
        this.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });

    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFileUpload(this.files[0]);
        }
    });

    // Chat input enter key
    document.getElementById('chatInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
}

function showSection(sectionName) {
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => section.classList.remove('active'));
    document.getElementById(`section-${sectionName}`).classList.add('active');
}

// File Upload Handler
function handleFileUpload(file) {
    const fileName = file.name;
    const fileSize = (file.size / 1024).toFixed(2) + ' KB';
    
    if (!fileName.match(/\.(xlsx|xls|csv)$/i)) {
        alert('Please upload a valid Excel or CSV file');
        return;
    }

    // Show progress
    document.getElementById('uploadProgress').style.display = 'block';
    document.getElementById('progressText').textContent = 'Processing file...';
    document.getElementById('progressFill').style.width = '0%';

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            processFile(e.target.result, fileName, fileSize);
        } catch (error) {
            alert('Error processing file: ' + error.message);
            document.getElementById('uploadProgress').style.display = 'none';
        }
    };

    if (fileName.match(/\.csv$/i)) {
        reader.readAsText(file);
    } else {
        reader.readAsBinaryString(file);
    }
}

function processFile(data, fileName, fileSize) {
    let workbook, worksheet, jsonData;

    if (fileName.match(/\.csv$/i)) {
        // Parse CSV
        jsonData = parseCSV(data);
    } else {
        // Parse Excel
        workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        worksheet = workbook.Sheets[sheetName];
        jsonData = XLSX.utils.sheet_to_json(worksheet);
    }

    // Batch processing simulation
    const batchSize = 1000;
    const totalBatches = Math.ceil(jsonData.length / batchSize);
    let processedBatches = 0;

    const processBatch = (batchIndex) => {
        setTimeout(() => {
            processedBatches++;
            const progress = (processedBatches / totalBatches) * 100;
            document.getElementById('progressFill').style.width = progress + '%';
            document.getElementById('progressPercent').textContent = Math.round(progress) + '%';
            document.getElementById('progressText').textContent = `Processing batch ${processedBatches} of ${totalBatches}...`;

            if (processedBatches === totalBatches) {
                // Processing complete
                setTimeout(() => {
                    finalizeDataProcessing(jsonData, fileName, fileSize);
                }, 500);
            } else {
                processBatch(batchIndex + 1);
            }
        }, 100);
    };

    processBatch(0);
}

function parseCSV(data) {
    const lines = data.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] ? values[index].trim() : '';
        });
        result.push(row);
    }

    return result;
}

function finalizeDataProcessing(data, fileName, fileSize) {
    appState.uploadedData = data;
    appState.filteredData = [...data];
    appState.originalData = [...data];
    appState.fileName = fileName;

    // Analyze column types
    analyzeColumnTypes(data);

    // Update UI
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('fileInfo').style.display = 'block';
    document.getElementById('fileName').textContent = fileName;
    document.getElementById('fileSize').textContent = fileSize;
    document.getElementById('rowCount').textContent = data.length;
    document.getElementById('columnCount').textContent = Object.keys(data[0] || {}).length;

    // Show data preview
    displayDataPreview(data);
    
    // Generate all sections
    generateDataQuality();
    generateFilters();
    generateVisualizations();
    generateInsights();

    // Show success message in chat
    addChatMessage('ai', `Data uploaded successfully! I've analyzed ${data.length} rows and ${Object.keys(data[0] || {}).length} columns. Ask me anything about your data!`);
}

function analyzeColumnTypes(data) {
    if (data.length === 0) return;
    
    const columns = Object.keys(data[0]);
    appState.columnTypes = {};

    columns.forEach(col => {
        const values = data.map(row => row[col]).filter(v => v !== '' && v !== null && v !== undefined);
        
        if (values.length === 0) {
            appState.columnTypes[col] = 'empty';
            return;
        }

        // Check if numeric
        const numericValues = values.filter(v => !isNaN(parseFloat(v)));
        if (numericValues.length / values.length > 0.8) {
            appState.columnTypes[col] = 'numeric';
            return;
        }

        // Check if date
        const dateValues = values.filter(v => !isNaN(Date.parse(v)));
        if (dateValues.length / values.length > 0.8) {
            appState.columnTypes[col] = 'date';
            return;
        }

        // Check if categorical
        const uniqueValues = new Set(values);
        if (uniqueValues.size < 20 || uniqueValues.size / values.length < 0.5) {
            appState.columnTypes[col] = 'categorical';
            return;
        }

        appState.columnTypes[col] = 'text';
    });
}

function displayDataPreview(data) {
    const preview = data.slice(0, 10);
    const columns = Object.keys(preview[0] || {});

    let tableHtml = '<table><thead><tr>';
    columns.forEach(col => {
        tableHtml += `<th>${col}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';

    preview.forEach(row => {
        tableHtml += '<tr>';
        columns.forEach(col => {
            tableHtml += `<td>${row[col] || ''}</td>`;
        });
        tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table>';
    document.getElementById('previewTable').innerHTML = tableHtml;
    document.getElementById('dataOverview').style.display = 'block';
}

// Data Quality Analysis
function generateDataQuality() {
    const container = document.getElementById('qualityContainer');
    const data = appState.uploadedData;
    
    if (data.length === 0) return;

    let html = '<div class="quality-grid">';

    // Missing Values
    html += '<div class="quality-card">';
    html += '<h3>📋 Missing Values</h3>';
    
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
        html += '<p>✅ No missing values detected!</p>';
    } else {
        missingData.forEach(item => {
            html += `<div class="missing-value-item">`;
            html += `<div class="missing-header">`;
            html += `<strong>${item.column}</strong>`;
            html += `<span>${item.count} missing (${item.percentage}%)</span>`;
            html += `</div>`;
            html += `<div class="missing-bar-container">`;
            html += `<div class="missing-bar" style="width: ${item.percentage}%"></div>`;
            html += `</div>`;
            html += `<div class="fix-buttons">`;
            html += `<button class="btn btn-sm btn-secondary" onclick="fixMissingValues('${item.column}', 'delete')">Delete Rows</button>`;
            html += `<button class="btn btn-sm btn-secondary" onclick="fixMissingValues('${item.column}', 'mean')">Fill with Mean</button>`;
            html += `<button class="btn btn-sm btn-secondary" onclick="fixMissingValues('${item.column}', 'mode')">Fill with Mode</button>`;
            html += `<button class="btn btn-sm btn-secondary" onclick="fixMissingValues('${item.column}', 'forward')">Forward Fill</button>`;
            html += `</div>`;
            html += `</div>`;
        });
    }
    html += '</div>';

    // Duplicates
    html += '<div class="quality-card">';
    html += '<h3>🔄 Duplicate Rows</h3>';
    const duplicates = findDuplicates(data);
    if (duplicates === 0) {
        html += '<p>✅ No duplicate rows found!</p>';
    } else {
        html += `<p>⚠️ Found ${duplicates} duplicate rows</p>`;
        html += `<button class="btn btn-primary" onclick="removeDuplicates()">Remove Duplicates</button>`;
    }
    html += '</div>';

    // Outliers
    html += '<div class="quality-card">';
    html += '<h3>📊 Outliers Detection</h3>';
    const outliers = detectOutliers(data);
    if (Object.keys(outliers).length === 0) {
        html += '<p>✅ No significant outliers detected!</p>';
    } else {
        Object.keys(outliers).forEach(col => {
            html += `<p><strong>${col}:</strong> ${outliers[col]} outliers detected</p>`;
        });
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
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

    let html = '<div class="active-filters" id="activeFilters"></div>';
    html += '<button class="btn btn-danger" onclick="clearAllFilters()">Clear All Filters</button>';
    html += '<div class="filters-grid">';

    categoricalColumns.forEach(col => {
        const uniqueValues = [...new Set(data.map(row => row[col]).filter(v => v))];
        html += '<div class="filter-card">';
        html += `<label>${col}</label>`;
        html += `<select onchange="applyFilter('${col}', this.value)" id="filter-${col}">`;
        html += '<option value="">All</option>';
        uniqueValues.forEach(val => {
            html += `<option value="${val}">${val}</option>`;
        });
        html += '</select>';
        html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
}

function applyFilter(column, value) {
    if (value === '') {
        delete appState.activeFilters[column];
    } else {
        appState.activeFilters[column] = value;
    }

    // Apply filters
    appState.filteredData = appState.uploadedData.filter(row => {
        for (let col in appState.activeFilters) {
            if (row[col] !== appState.activeFilters[col]) {
                return false;
            }
        }
        return true;
    });

    updateActiveFilters();
    generateVisualizations();
}

function updateActiveFilters() {
    const container = document.getElementById('activeFilters');
    let html = '';
    
    Object.keys(appState.activeFilters).forEach(col => {
        html += `<div class="filter-chip">${col}: ${appState.activeFilters[col]} <button onclick="removeFilter('${col}')">×</button></div>`;
    });
    
    container.innerHTML = html;
}

function removeFilter(column) {
    delete appState.activeFilters[column];
    document.getElementById(`filter-${column}`).value = '';
    applyFilter(column, '');
}

function clearAllFilters() {
    appState.activeFilters = {};
    appState.filteredData = [...appState.uploadedData];
    
    const selects = document.querySelectorAll('[id^="filter-"]');
    selects.forEach(select => select.value = '');
    
    updateActiveFilters();
    generateVisualizations();
}

// Visualizations
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

function createBarChart() {
    const column = document.getElementById('bar-column').value;
    const data = appState.filteredData;
    
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
                label: column,
                data: Object.values(frequency),
                backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
    appState.charts.push(chart);
}

function createLineChart() {
    const column = document.getElementById('line-column').value;
    const data = appState.filteredData;
    
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
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true }
            }
        }
    });
    appState.charts.push(chart);
}

function createPieChart() {
    const column = document.getElementById('pie-column').value;
    const data = appState.filteredData;
    
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
                data: Object.values(frequency),
                backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
    appState.charts.push(chart);
}

function createScatterChart() {
    const xCol = document.getElementById('scatter-x').value;
    const yCol = document.getElementById('scatter-y').value;
    const data = appState.filteredData;
    
    const points = data.map(row => ({
        x: parseFloat(row[xCol]),
        y: parseFloat(row[yCol])
    })).filter(p => !isNaN(p.x) && !isNaN(p.y));
    
    const ctx = document.getElementById('chart-scatter').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: `${xCol} vs ${yCol}`,
                data: points,
                backgroundColor: 'rgba(124, 58, 237, 0.5)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true }
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

// AI Chatbot
function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const question = input.value.trim();
    
    if (!question) return;
    
    addChatMessage('user', question);
    input.value = '';
    
    // Process question
    setTimeout(() => {
        const response = processAIQuestion(question);
        addChatMessage('ai', response);
    }, 500);
}

function addChatMessage(type, message) {
    const container = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;
    
    const avatar = type === 'ai' ? '🤖' : '👤';
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content"><p>${message}</p></div>
    `;
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}

function processAIQuestion(question) {
    const data = appState.filteredData;
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
    
    return insights;
}

// Insights Generation
function generateInsights() {
    const container = document.getElementById('insightsContainer');
    const data = appState.uploadedData;
    
    if (data.length === 0) return;

    const columns = Object.keys(data[0]);
    let html = '<div class="insights-grid">';

    // Data Overview Insight
    html += `<div class="insight-card success">
        <div class="insight-header">
            <span class="insight-icon">📊</span>
            <h3>Dataset Overview</h3>
        </div>
        <p>Your dataset contains <strong>${data.length} rows</strong> and <strong>${columns.length} columns</strong>. The data includes ${columns.filter(c => appState.columnTypes[c] === 'numeric').length} numeric columns and ${columns.filter(c => appState.columnTypes[c] === 'categorical').length} categorical columns.</p>
    </div>`;

    // Missing Data Insight
    const missingCols = [];
    columns.forEach(col => {
        const missing = data.filter(row => !row[col] || row[col] === '').length;
        if (missing > 0) {
            missingCols.push({ col, count: missing, percentage: ((missing / data.length) * 100).toFixed(1) });
        }
    });
    
    if (missingCols.length > 0) {
        const highMissing = missingCols.filter(m => parseFloat(m.percentage) > 10);
        if (highMissing.length > 0) {
            html += `<div class="insight-card warning">
                <div class="insight-header">
                    <span class="insight-icon">⚠️</span>
                    <h3>Data Quality Alert</h3>
                </div>
                <p><strong>${highMissing.length} columns</strong> have more than 10% missing data: ${highMissing.map(m => m.col).join(', ')}. Consider cleaning or imputing these values.</p>
            </div>`;
        }
    } else {
        html += `<div class="insight-card success">
            <div class="insight-header">
                <span class="insight-icon">✅</span>
                <h3>Data Quality</h3>
            </div>
            <p>Excellent! No missing values detected in your dataset. The data is complete and ready for analysis.</p>
        </div>`;
    }

    // Correlation Insight
    const numericCols = columns.filter(col => appState.columnTypes[col] === 'numeric');
    if (numericCols.length >= 2) {
        let maxCorr = 0;
        let corrPair = [];
        for (let i = 0; i < numericCols.length; i++) {
            for (let j = i + 1; j < numericCols.length; j++) {
                const corr = Math.abs(calculateCorrelation(data, numericCols[i], numericCols[j]));
                if (corr > maxCorr) {
                    maxCorr = corr;
                    corrPair = [numericCols[i], numericCols[j]];
                }
            }
        }
        if (maxCorr > 0.5) {
            html += `<div class="insight-card">
                <div class="insight-header">
                    <span class="insight-icon">🔗</span>
                    <h3>Strong Correlation Found</h3>
                </div>
                <p><strong>${corrPair[0]}</strong> and <strong>${corrPair[1]}</strong> show a strong correlation (${maxCorr.toFixed(2)}). These variables are likely related.</p>
            </div>`;
        }
    }

    // Numeric Statistics
    if (numericCols.length > 0) {
        const col = numericCols[0];
        const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
        const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
        const min = Math.min(...values).toFixed(2);
        const max = Math.max(...values).toFixed(2);
        
        html += `<div class="insight-card">
            <div class="insight-header">
                <span class="insight-icon">📈</span>
                <h3>${col} Statistics</h3>
            </div>
            <p>Average: <strong>${avg}</strong><br>Range: ${min} to ${max}<br>This provides a quick overview of your numeric data distribution.</p>
        </div>`;
    }

    // Categorical Distribution
    const categoricalCols = columns.filter(col => appState.columnTypes[col] === 'categorical');
    if (categoricalCols.length > 0) {
        const col = categoricalCols[0];
        const uniqueValues = new Set(data.map(row => row[col]).filter(v => v));
        
        html += `<div class="insight-card">
            <div class="insight-header">
                <span class="insight-icon">🏷️</span>
                <h3>Categorical Diversity</h3>
            </div>
            <p><strong>${col}</strong> has ${uniqueValues.size} unique categories. This indicates the diversity of your categorical data.</p>
        </div>`;
    }

    // Duplicate Check
    const duplicates = findDuplicates(data);
    if (duplicates > 0) {
        html += `<div class="insight-card warning">
            <div class="insight-header">
                <span class="insight-icon">🔄</span>
                <h3>Duplicate Rows Detected</h3>
            </div>
            <p>Found <strong>${duplicates} duplicate rows</strong>. Consider removing duplicates to improve data quality and analysis accuracy.</p>
        </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
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