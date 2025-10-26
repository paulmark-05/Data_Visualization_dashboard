// Global State
let uploadedFiles = [];
let activeDataset = null;
let currentChart = null;
let filteredData = null;
let currentPage = 1;
const rowsPerPage = 50;

// Chart Colors
const chartColors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B'];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

function setupEventListeners() {
    // File upload
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    
    // Chart controls
    document.getElementById('updateChart').addEventListener('click', updateVisualization);
    
    // Chat
    document.getElementById('sendChat').addEventListener('click', sendChatMessage);
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    
    // Search
    document.getElementById('searchInput').addEventListener('input', handleSearch);
}

// File Upload Handler
async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    
    if (uploadedFiles.length + files.length > 5) {
        alert('Maximum 5 files allowed. Please remove some files first.');
        return;
    }
    
    for (const file of files) {
        try {
            const data = await parseFile(file);
            const fileObj = {
                id: Date.now() + Math.random(),
                name: file.name,
                size: formatFileSize(file.size),
                data: data,
                rows: data.length,
                columns: data.length > 0 ? Object.keys(data[0]).length : 0
            };
            uploadedFiles.push(fileObj);
        } catch (error) {
            alert(`Error parsing ${file.name}: ${error.message}`);
        }
    }
    
    updateFileList();
    
    if (!activeDataset && uploadedFiles.length > 0) {
        setActiveDataset(uploadedFiles[0].id);
    }
    
    event.target.value = '';
}

// Parse File
function parseFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const fileName = file.name.toLowerCase();
        
        reader.onload = (e) => {
            try {
                if (fileName.endsWith('.json')) {
                    const data = JSON.parse(e.target.result);
                    resolve(Array.isArray(data) ? data : [data]);
                } else if (fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                    resolve(jsonData);
                } else {
                    reject(new Error('Unsupported file format'));
                }
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('Failed to read file'));
        
        if (fileName.endsWith('.json')) {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
    });
}

// Update File List
function updateFileList() {
    const fileList = document.getElementById('fileList');
    const fileCount = document.getElementById('fileCount');
    
    fileCount.textContent = uploadedFiles.length;
    
    if (uploadedFiles.length === 0) {
        fileList.innerHTML = '<p class="empty-state">No files uploaded</p>';
        return;
    }
    
    fileList.innerHTML = uploadedFiles.map(file => `
        <div class="file-item ${activeDataset && activeDataset.id === file.id ? 'active' : ''}" 
             onclick="setActiveDataset(${file.id})">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">${file.rows} rows × ${file.columns} cols | ${file.size}</div>
        </div>
    `).join('');
}

// Set Active Dataset
function setActiveDataset(fileId) {
    activeDataset = uploadedFiles.find(f => f.id === fileId);
    if (!activeDataset) return;
    
    filteredData = [...activeDataset.data];
    
    updateFileList();
    showDataView();
    displaySummaryStats();
    displayDataQuality();
    displayFilters();
    displayInsights();
    populateAxisSelectors();
    updateVisualization();
    displayDataTable();
}

// Show Data View
function showDataView() {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('dataView').style.display = 'block';
}

// Display Summary Stats
function displaySummaryStats() {
    const container = document.getElementById('summaryStats');
    const data = activeDataset.data;
    
    const numericColumns = getNumericColumns(data);
    const categoricalColumns = getCategoricalColumns(data);
    
    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-label">Total Rows</div>
            <div class="stat-value">${data.length}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Total Columns</div>
            <div class="stat-value">${Object.keys(data[0] || {}).length}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Numeric Columns</div>
            <div class="stat-value">${numericColumns.length}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Categorical Columns</div>
            <div class="stat-value">${categoricalColumns.length}</div>
        </div>
    `;
}

// Display Data Quality
function displayDataQuality() {
    const container = document.getElementById('qualityContainer');
    const data = activeDataset.data;
    const columns = Object.keys(data[0] || {});
    const issues = [];
    
    // Check for missing values
    columns.forEach(col => {
        const missingCount = data.filter(row => row[col] === null || row[col] === undefined || row[col] === '').length;
        const percentage = ((missingCount / data.length) * 100).toFixed(1);
        
        if (missingCount > 0) {
            const severity = percentage > 20 ? 'high' : percentage > 10 ? 'medium' : 'low';
            issues.push({
                severity,
                description: `Column "${col}" has ${percentage}% missing values (${missingCount} rows)`,
                column: col,
                type: 'missing'
            });
        }
    });
    
    // Check for duplicates
    const uniqueRows = new Set(data.map(row => JSON.stringify(row)));
    const duplicates = data.length - uniqueRows.size;
    if (duplicates > 0) {
        issues.push({
            severity: duplicates > data.length * 0.1 ? 'high' : 'medium',
            description: `Found ${duplicates} duplicate rows`,
            type: 'duplicates'
        });
    }
    
    if (issues.length === 0) {
        container.innerHTML = '<p class="empty-state">✓ No data quality issues detected</p>';
        return;
    }
    
    container.innerHTML = issues.map(issue => `
        <div class="quality-item ${issue.severity}">
            <div class="quality-header">
                <span class="quality-severity">${issue.severity.toUpperCase()}</span>
            </div>
            <div class="quality-description">${issue.description}</div>
            ${issue.type === 'missing' ? `
                <div class="quality-fixes">
                    <button class="quality-fix-btn" onclick="applyFix('${issue.column}', 'mean')">Fill with Mean</button>
                    <button class="quality-fix-btn" onclick="applyFix('${issue.column}', 'median')">Fill with Median</button>
                    <button class="quality-fix-btn" onclick="applyFix('${issue.column}', 'mode')">Fill with Mode</button>
                    <button class="quality-fix-btn" onclick="applyFix('${issue.column}', 'remove')">Remove Rows</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// Apply Data Quality Fix
function applyFix(column, method) {
    const data = activeDataset.data;
    
    if (method === 'remove') {
        activeDataset.data = data.filter(row => row[column] !== null && row[column] !== undefined && row[column] !== '');
    } else {
        const values = data.map(row => row[column]).filter(v => v !== null && v !== undefined && v !== '');
        const numericValues = values.filter(v => !isNaN(v)).map(Number);
        
        let fillValue;
        if (method === 'mean') {
            fillValue = mean(numericValues);
        } else if (method === 'median') {
            fillValue = median(numericValues);
        } else if (method === 'mode') {
            fillValue = mode(values);
        }
        
        activeDataset.data = data.map(row => {
            if (row[column] === null || row[column] === undefined || row[column] === '') {
                return { ...row, [column]: fillValue };
            }
            return row;
        });
    }
    
    filteredData = [...activeDataset.data];
    displayDataQuality();
    displaySummaryStats();
    updateVisualization();
    displayDataTable();
    
    addChatMessage('bot', `Applied ${method} fix to column "${column}". Data has been updated.`);
}

// Display Filters
function displayFilters() {
    const container = document.getElementById('filtersContainer');
    const data = activeDataset.data;
    const categoricalColumns = getCategoricalColumns(data);
    
    if (categoricalColumns.length === 0) {
        container.innerHTML = '<p class="empty-state">No categorical columns found</p>';
        return;
    }
    
    const filterGroups = categoricalColumns.slice(0, 3).map(col => {
        const uniqueValues = [...new Set(data.map(row => row[col]).filter(v => v !== null && v !== undefined))];
        return `
            <div class="filter-group">
                <div class="filter-group-title">${col}</div>
                ${uniqueValues.slice(0, 5).map(value => `
                    <div class="filter-option">
                        <input type="checkbox" id="filter-${col}-${value}" 
                               data-column="${col}" data-value="${value}" 
                               onchange="applyFilters()" checked>
                        <label for="filter-${col}-${value}">${value}</label>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
    
    container.innerHTML = filterGroups + `
        <div class="filter-actions">
            <button class="btn btn--secondary" onclick="clearFilters()">Clear All</button>
            <button class="btn btn--primary" onclick="applyFilters()">Apply</button>
        </div>
    `;
}

// Apply Filters
function applyFilters() {
    const checkboxes = document.querySelectorAll('#filtersContainer input[type="checkbox"]');
    const filters = {};
    
    checkboxes.forEach(cb => {
        const column = cb.dataset.column;
        const value = cb.dataset.value;
        
        if (!filters[column]) filters[column] = [];
        if (cb.checked) filters[column].push(value);
    });
    
    filteredData = activeDataset.data.filter(row => {
        return Object.keys(filters).every(col => {
            return filters[col].length === 0 || filters[col].includes(String(row[col]));
        });
    });
    
    updateVisualization();
    displayDataTable();
}

// Clear Filters
function clearFilters() {
    const checkboxes = document.querySelectorAll('#filtersContainer input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
    filteredData = [...activeDataset.data];
    updateVisualization();
    displayDataTable();
}

// Display Insights
function displayInsights() {
    const container = document.getElementById('insightsContainer');
    const data = activeDataset.data;
    const insights = [];
    
    // Missing values insight
    const columns = Object.keys(data[0] || {});
    const missingCols = [];
    columns.forEach(col => {
        const missing = data.filter(row => row[col] === null || row[col] === undefined || row[col] === '').length;
        if (missing > 0) {
            missingCols.push(`${col} (${((missing / data.length) * 100).toFixed(1)}%)`);
        }
    });
    
    if (missingCols.length > 0) {
        insights.push(`⚠️ Missing values detected in: ${missingCols.slice(0, 3).join(', ')}`);
    } else {
        insights.push('✓ No missing values detected in the dataset');
    }
    
    // Numeric insights
    const numericColumns = getNumericColumns(data);
    if (numericColumns.length >= 2) {
        const corr = calculateCorrelation(data, numericColumns[0], numericColumns[1]);
        if (Math.abs(corr) > 0.7) {
            insights.push(`📊 Strong ${corr > 0 ? 'positive' : 'negative'} correlation (${corr.toFixed(2)}) between ${numericColumns[0]} and ${numericColumns[1]}`);
        }
    }
    
    // Size insight
    if (data.length > 10000) {
        insights.push(`📈 Large dataset with ${data.length.toLocaleString()} rows - consider filtering for better performance`);
    }
    
    // Data type distribution
    insights.push(`📋 Dataset contains ${numericColumns.length} numeric and ${getCategoricalColumns(data).length} categorical columns`);
    
    container.innerHTML = insights.map(insight => `<div class="insight-item">${insight}</div>`).join('');
}

// Populate Axis Selectors
function populateAxisSelectors() {
    const xAxis = document.getElementById('xAxis');
    const yAxis = document.getElementById('yAxis');
    const columns = Object.keys(activeDataset.data[0] || {});
    const numericColumns = getNumericColumns(activeDataset.data);
    
    xAxis.innerHTML = columns.map(col => `<option value="${col}">${col}</option>`).join('');
    yAxis.innerHTML = numericColumns.map(col => `<option value="${col}">${col}</option>`).join('');
    
    if (numericColumns.length > 1) {
        yAxis.value = numericColumns[1];
    }
}

// Update Visualization
function updateVisualization() {
    const chartType = document.getElementById('chartType').value;
    const xColumn = document.getElementById('xAxis').value;
    const yColumn = document.getElementById('yAxis').value;
    
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    if (currentChart) {
        currentChart.destroy();
    }
    
    const chartData = prepareChartData(filteredData, xColumn, yColumn, chartType);
    
    currentChart = new Chart(ctx, {
        type: chartType === 'scatter' ? 'scatter' : chartType,
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: chartType === 'pie' || chartType === 'doughnut',
                    position: 'bottom'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: chartType === 'pie' || chartType === 'doughnut' ? {} : {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: xColumn
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: yColumn
                    }
                }
            }
        }
    });
}

// Prepare Chart Data
function prepareChartData(data, xColumn, yColumn, chartType) {
    if (chartType === 'pie' || chartType === 'doughnut') {
        const grouped = {};
        data.forEach(row => {
            const key = row[xColumn];
            grouped[key] = (grouped[key] || 0) + (Number(row[yColumn]) || 1);
        });
        
        return {
            labels: Object.keys(grouped),
            datasets: [{
                data: Object.values(grouped),
                backgroundColor: chartColors
            }]
        };
    }
    
    if (chartType === 'scatter') {
        return {
            datasets: [{
                label: `${yColumn} vs ${xColumn}`,
                data: data.map(row => ({
                    x: Number(row[xColumn]) || 0,
                    y: Number(row[yColumn]) || 0
                })),
                backgroundColor: chartColors[0]
            }]
        };
    }
    
    // Line, Bar, Area charts
    const labels = data.slice(0, 50).map(row => row[xColumn]);
    const values = data.slice(0, 50).map(row => Number(row[yColumn]) || 0);
    
    return {
        labels: labels,
        datasets: [{
            label: yColumn,
            data: values,
            backgroundColor: chartType === 'bar' ? chartColors[0] : 'rgba(31, 184, 205, 0.2)',
            borderColor: chartColors[0],
            borderWidth: 2,
            fill: chartType === 'area'
        }]
    };
}

// Display Data Table
function displayDataTable() {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const tableInfo = document.getElementById('tableInfo');
    
    const columns = Object.keys(filteredData[0] || {});
    const startIdx = (currentPage - 1) * rowsPerPage;
    const endIdx = startIdx + rowsPerPage;
    const pageData = filteredData.slice(startIdx, endIdx);
    
    // Headers
    thead.innerHTML = `<tr>${columns.map(col => `<th onclick="sortTable('${col}')">${col}</th>`).join('')}</tr>`;
    
    // Body
    tbody.innerHTML = pageData.map(row => `
        <tr>${columns.map(col => `<td>${row[col] !== null && row[col] !== undefined ? row[col] : ''}</td>`).join('')}</tr>
    `).join('');
    
    // Info
    tableInfo.textContent = `Showing ${startIdx + 1}-${Math.min(endIdx, filteredData.length)} of ${filteredData.length} rows`;
    
    // Pagination
    updatePagination();
}

// Update Pagination
function updatePagination() {
    const pagination = document.getElementById('pagination');
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    
    pagination.innerHTML = `
        <button class="btn btn--secondary" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
        <span style="padding: 0 12px; color: var(--color-text-secondary);">Page ${currentPage} of ${totalPages}</span>
        <button class="btn btn--secondary" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
    `;
}

// Change Page
function changePage(page) {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    displayDataTable();
}

// Sort Table
function sortTable(column) {
    const isNumeric = !isNaN(filteredData[0][column]);
    
    filteredData.sort((a, b) => {
        if (isNumeric) {
            return (Number(a[column]) || 0) - (Number(b[column]) || 0);
        }
        return String(a[column]).localeCompare(String(b[column]));
    });
    
    currentPage = 1;
    displayDataTable();
}

// Handle Search
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    
    if (!searchTerm) {
        filteredData = [...activeDataset.data];
    } else {
        filteredData = activeDataset.data.filter(row => {
            return Object.values(row).some(val => 
                String(val).toLowerCase().includes(searchTerm)
            );
        });
    }
    
    currentPage = 1;
    displayDataTable();
}

// AI Chat Functions
function askQuestion(question) {
    document.getElementById('chatInput').value = question;
    sendChatMessage();
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const question = input.value.trim();
    
    if (!question) return;
    
    addChatMessage('user', question);
    input.value = '';
    
    setTimeout(() => {
        const response = generateAIResponse(question);
        addChatMessage('bot', response);
    }, 500);
}

function addChatMessage(type, content) {
    const container = document.getElementById('chatContainer');
    const message = document.createElement('div');
    message.className = `chat-message ${type}`;
    message.innerHTML = `<div class="message-content">${content}</div>`;
    container.appendChild(message);
    container.scrollTop = container.scrollHeight;
}

function generateAIResponse(question) {
    const lowerQ = question.toLowerCase();
    
    if (!activeDataset) {
        return 'Please upload a dataset first so I can help you analyze it.';
    }
    
    const data = activeDataset.data;
    const columns = Object.keys(data[0] || {});
    
    // Summarize data
    if (lowerQ.includes('summar')) {
        const numericCols = getNumericColumns(data);
        return `📊 <strong>Dataset Summary:</strong><br><br>
                • Total Rows: ${data.length}<br>
                • Total Columns: ${columns.length}<br>
                • Columns: ${columns.join(', ')}<br>
                • Numeric Columns: ${numericCols.length}<br>
                • File: ${activeDataset.name}`;
    }
    
    // Missing values
    if (lowerQ.includes('missing')) {
        const missing = [];
        columns.forEach(col => {
            const count = data.filter(row => row[col] === null || row[col] === undefined || row[col] === '').length;
            if (count > 0) {
                missing.push(`${col}: ${((count / data.length) * 100).toFixed(1)}% (${count} rows)`);
            }
        });
        
        if (missing.length === 0) {
            return '✓ Great news! No missing values detected in the dataset.';
        }
        
        return `⚠️ <strong>Missing Values Found:</strong><br><br>${missing.map(m => `• ${m}`).join('<br>')}`;
    }
    
    // Correlation
    if (lowerQ.includes('correlat')) {
        const numericCols = getNumericColumns(data);
        if (numericCols.length < 2) {
            return 'Not enough numeric columns to calculate correlations.';
        }
        
        const correlations = [];
        for (let i = 0; i < Math.min(3, numericCols.length - 1); i++) {
            for (let j = i + 1; j < Math.min(4, numericCols.length); j++) {
                const corr = calculateCorrelation(data, numericCols[i], numericCols[j]);
                correlations.push(`${numericCols[i]} ↔ ${numericCols[j]}: ${corr.toFixed(3)}`);
            }
        }
        
        return `📈 <strong>Correlation Analysis:</strong><br><br>${correlations.map(c => `• ${c}`).join('<br>')}`;
    }
    
    // Trends
    if (lowerQ.includes('trend')) {
        const numericCols = getNumericColumns(data);
        if (numericCols.length === 0) {
            return 'No numeric columns available for trend analysis.';
        }
        
        const col = numericCols[0];
        const values = data.slice(0, 100).map(row => Number(row[col]) || 0);
        const trend = values[values.length - 1] > values[0] ? 'increasing' : 'decreasing';
        
        return `📊 Column "${col}" shows an ${trend} trend. Consider using a line chart to visualize this pattern.`;
    }
    
    // Data quality
    if (lowerQ.includes('quality')) {
        const missing = columns.filter(col => 
            data.some(row => row[col] === null || row[col] === undefined || row[col] === '')
        ).length;
        
        const uniqueRows = new Set(data.map(row => JSON.stringify(row))).size;
        const duplicates = data.length - uniqueRows;
        
        return `🔍 <strong>Data Quality Report:</strong><br><br>
                • Columns with missing values: ${missing}<br>
                • Duplicate rows: ${duplicates}<br>
                • Data completeness: ${(((data.length - duplicates) / data.length) * 100).toFixed(1)}%<br>
                ${missing === 0 && duplicates === 0 ? '<br>✓ Dataset looks clean!' : '<br>⚠️ Check the Data Quality panel for fixes.'}`;
    }
    
    // Visualization suggestions
    if (lowerQ.includes('visualiz') || lowerQ.includes('chart') || lowerQ.includes('graph')) {
        const numericCols = getNumericColumns(data);
        const categoricalCols = getCategoricalColumns(data);
        
        return `💡 <strong>Visualization Suggestions:</strong><br><br>
                • Bar Chart: Compare ${categoricalCols[0] || 'categories'} across ${numericCols[0] || 'values'}<br>
                • Line Chart: Show trends over ${columns[0]}<br>
                • Scatter Plot: Explore relationships between numeric columns<br>
                • Pie Chart: Display distribution of ${categoricalCols[0] || 'categories'}<br><br>
                Use the Visualization controls above to create these charts!`;
    }
    
    return `I can help you analyze this dataset. Try asking about:<br><br>
            • "Summarize the data"<br>
            • "What columns have missing values?"<br>
            • "Show me correlations"<br>
            • "Check data quality"<br>
            • "Suggest visualizations"`;
}

// Utility Functions
function getNumericColumns(data) {
    if (data.length === 0) return [];
    return Object.keys(data[0]).filter(col => {
        return data.slice(0, 100).every(row => 
            row[col] === null || row[col] === undefined || row[col] === '' || !isNaN(row[col])
        );
    });
}

function getCategoricalColumns(data) {
    if (data.length === 0) return [];
    return Object.keys(data[0]).filter(col => {
        const uniqueValues = new Set(data.map(row => row[col]));
        return uniqueValues.size < data.length * 0.5 && uniqueValues.size < 50;
    });
}

function mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mode(values) {
    const frequency = {};
    values.forEach(v => frequency[v] = (frequency[v] || 0) + 1);
    return Object.keys(frequency).reduce((a, b) => frequency[a] > frequency[b] ? a : b);
}

function calculateCorrelation(data, col1, col2) {
    const pairs = data.map(row => [Number(row[col1]) || 0, Number(row[col2]) || 0]);
    const n = pairs.length;
    
    const sum1 = pairs.reduce((a, p) => a + p[0], 0);
    const sum2 = pairs.reduce((a, p) => a + p[1], 0);
    const sum1Sq = pairs.reduce((a, p) => a + p[0] * p[0], 0);
    const sum2Sq = pairs.reduce((a, p) => a + p[1] * p[1], 0);
    const pSum = pairs.reduce((a, p) => a + p[0] * p[1], 0);
    
    const num = pSum - (sum1 * sum2 / n);
    const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));
    
    return den === 0 ? 0 : num / den;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}