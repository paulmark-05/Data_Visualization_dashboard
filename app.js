// Global State
let uploadedFiles = [];
let activeDataset = null;
let currentChart = null;
let filteredData = null;
let currentPage = 1;
const rowsPerPage = 50;

// Chart Colors - A modern, accessible palette
const chartColors = [
    '#06b6d4', '#f97316', '#10b981', '#ef4444', '#6366f1', 
    '#f59e0b', '#3b82f6', '#ec4899', '#84cc16', '#a855f7'
];

// Tailwind/Lucide icon mappings for status/severity
const severityMap = {
    high: { color: 'text-red-600', icon: 'zap' },
    medium: { color: 'text-yellow-600', icon: 'alert-triangle' },
    low: { color: 'text-green-600', icon: 'check-circle' },
    info: { color: 'text-blue-600', icon: 'info' }
};

// --- Initialization and Setup ---

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons (available globally via CDN in index.html)
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    document.getElementById('updateChart').addEventListener('click', updateVisualization);
    document.getElementById('sendChat').addEventListener('click', sendChatMessage);
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    document.getElementById('searchInput').addEventListener('input', handleSearch);
}

// --- File Handling ---

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    
    if (uploadedFiles.length + files.length > 5) {
        // Use chat for notifications instead of alert()
        addChatMessage('bot', 'Maximum 5 files allowed. Please remove some files first.');
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
            addChatMessage('bot', `File "${file.name}" uploaded successfully with ${fileObj.rows} rows.`);
        } catch (error) {
            addChatMessage('bot', `Error parsing ${file.name}: ${error.message}`);
        }
    }
    
    updateFileList();
    
    if (!activeDataset && uploadedFiles.length > 0) {
        setActiveDataset(uploadedFiles[uploadedFiles.length - 1].id);
    }
    
    event.target.value = ''; // Clear input for next upload
}

function parseFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const fileName = file.name.toLowerCase();
        
        reader.onload = (e) => {
            try {
                let jsonData;
                if (fileName.endsWith('.json')) {
                    const data = JSON.parse(e.target.result);
                    jsonData = Array.isArray(data) ? data : [data];
                } else if (fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                    const data = new Uint8Array(e.target.result);
                    // XLSX is available globally from the CDN
                    const workbook = XLSX.read(data, { type: 'array' }); 
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    // Use {defval: null} to ensure missing cells are treated as null
                    jsonData = XLSX.utils.sheet_to_json(firstSheet, {defval: null}); 
                } else {
                    reject(new Error('Unsupported file format'));
                    return;
                }

                // Basic cleaning: ensure all objects have the same keys and handle nulls
                if (jsonData.length > 0) {
                    const allKeys = new Set();
                    jsonData.forEach(row => Object.keys(row).forEach(key => allKeys.add(key)));
                    const keysArray = Array.from(allKeys);
                    jsonData = jsonData.map(row => {
                        const newRow = {};
                        keysArray.forEach(key => {
                            newRow[key] = row.hasOwnProperty(key) ? row[key] : null;
                        });
                        return newRow;
                    });
                }
                
                resolve(jsonData);
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

// --- Dataset Management and UI Rendering ---

function updateFileList() {
    const fileList = document.getElementById('fileList');
    document.getElementById('fileCount').textContent = uploadedFiles.length;
    
    if (uploadedFiles.length === 0) {
        fileList.innerHTML = '<p class="text-xs text-gray-400 text-center italic">No files uploaded</p>';
        document.getElementById('fileStatus').textContent = 'No file loaded';
        document.getElementById('dataView').classList.add('hidden');
        document.getElementById('emptyState').classList.remove('hidden');
        return;
    }
    
    fileList.innerHTML = uploadedFiles.map(file => `
        <div class="p-3 border rounded-lg cursor-pointer transition duration-150 ${activeDataset && activeDataset.id === file.id ? 'bg-cyan-100 border-cyan-400' : 'bg-white hover:bg-gray-50 border-gray-200'}" 
            onclick="setActiveDataset(${file.id})">
            <div class="flex items-center justify-between">
                <span class="font-medium text-sm text-gray-800 truncate">${file.name}</span>
                <button onclick="event.stopPropagation(); removeFile(${file.id});" class="text-gray-400 hover:text-red-500 transition">
                     <i data-lucide="x" class="icon w-4 h-4"></i>
                </button>
            </div>
            <div class="text-xs text-gray-500">${file.rows} rows x ${file.columns} cols | ${file.size}</div>
        </div>
    `).join('');
    
    // Re-initialize icons for new elements
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

function removeFile(fileId) {
    uploadedFiles = uploadedFiles.filter(f => f.id !== fileId);
    if (activeDataset && activeDataset.id === fileId) {
        activeDataset = uploadedFiles.length > 0 ? uploadedFiles[0] : null;
    }
    updateFileList();
    if (activeDataset) {
        setActiveDataset(activeDataset.id);
    } else {
        // Return to empty state if all files are removed
        document.getElementById('fileStatus').textContent = 'No file loaded';
        document.getElementById('dataView').classList.add('hidden');
        document.getElementById('emptyState').classList.remove('hidden');
    }
}

function setActiveDataset(fileId) {
    activeDataset = uploadedFiles.find(f => f.id === fileId);
    if (!activeDataset) return;
    
    filteredData = [...activeDataset.data];
    currentPage = 1;

    document.getElementById('fileStatus').textContent = `Loaded: ${activeDataset.name}`;
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('dataView').classList.remove('hidden');

    updateFileList();
    displaySummaryStats();
    displayDataQuality();
    populateAxisSelectors();
    updateVisualization();
    displayDataTable();
    displayFilters(); // Must be called after populating selectors for initial columns
}

// --- Data Quality and Fixes ---

function displayDataQuality() {
    const container = document.getElementById('qualityContainer');
    const data = activeDataset.data;
    const columns = Object.keys(data[0] || {});
    const issues = [];
    
    // 1. Missing values
    columns.forEach(col => {
        // Count missing, including null and empty strings
        const missingCount = data.filter(row => row[col] === null || row[col] === undefined || String(row[col] || '').trim() === '').length;
        const percentage = ((missingCount / data.length) * 100);
        
        if (missingCount > 0) {
            let severity = 'low';
            if (percentage > 20) severity = 'high';
            else if (percentage > 5) severity = 'medium';

            const isNumeric = getNumericColumns(data).includes(col);
            
            issues.push({
                severity,
                description: `Column <strong>${col}</strong> has ${percentage.toFixed(1)}% missing values (${missingCount} rows).`,
                column: col,
                type: 'missing',
                isNumeric: isNumeric
            });
        }
    });
    
    // 2. Duplicates
    const uniqueRows = new Set(data.map(row => JSON.stringify(row))).size;
    const duplicates = data.length - uniqueRows;
    if (duplicates > 0) {
        const severity = duplicates > data.length * 0.1 ? 'high' : 'medium';
        issues.push({
            severity,
            description: `Found <strong>${duplicates}</strong> duplicate rows.`,
            type: 'duplicates'
        });
    }

    // 3. Low Cardinality (Potential Index/Categorical)
    const lowCardinalityCols = getCategoricalColumns(data).filter(col => {
        const unique = [...new Set(data.map(row => row[col]))].length;
        return unique > 1 && unique <= 5;
    });
    if (lowCardinalityCols.length > 0) {
         issues.push({
            severity: 'low',
            description: `Potential categorical columns (low cardinality): ${lowCardinalityCols.slice(0, 3).join(', ')}.`,
            type: 'info'
        });
    }
    
    if (issues.length === 0) {
        container.innerHTML = `
            <p class="text-sm text-center py-4 bg-green-50 text-green-700 rounded-lg">
                <i data-lucide="check" class="icon mr-1"></i> Excellent! No immediate quality issues detected.
            </p>`;
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
        return;
    }
    
    container.innerHTML = issues.map(issue => {
        const map = severityMap[issue.severity];
        const colorPrefix = map.color.split('-')[1];
        const severityBadge = `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-${colorPrefix}-100 ${map.color}"><i data-lucide="${map.icon}" class="icon w-3 h-3 mr-1"></i>${issue.severity.toUpperCase()}</span>`;
        
        let fixes = '';
        if (issue.type === 'missing' && issue.isNumeric) {
            fixes = `
                <div class="flex flex-wrap gap-2 mt-2">
                    <button class="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded-md" onclick="applyFix('${issue.column}', 'mean')">Fill Mean</button>
                    <button class="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded-md" onclick="applyFix('${issue.column}', 'median')">Fill Median</button>
                    <button class="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded-md" onclick="applyFix('${issue.column}', 'remove')">Remove Rows</button>
                </div>`;
        } else if (issue.type === 'missing' && !issue.isNumeric) {
             fixes = `
                <div class="flex flex-wrap gap-2 mt-2">
                    <button class="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded-md" onclick="applyFix('${issue.column}', 'mode')">Fill Mode</button>
                    <button class="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded-md" onclick="applyFix('${issue.column}', 'remove')">Remove Rows</button>
                </div>`;
        } else if (issue.type === 'duplicates') {
            fixes = `
                <div class="flex flex-wrap gap-2 mt-2">
                    <button class="text-xs bg-red-100 hover:bg-red-200 px-2 py-1 rounded-md text-red-700" onclick="applyFix('all', 'remove_duplicates')">Remove Duplicates</button>
                </div>`;
        }

        return `
            <div class="p-3 border border-gray-200 rounded-lg space-y-1">
                <div class="flex items-center space-x-2">${severityBadge}</div>
                <p class="text-sm text-gray-700">${issue.description}</p>
                ${fixes}
            </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

function applyFix(column, method) {
    const data = activeDataset.data;
    
    if (method === 'remove') {
        activeDataset.data = data.filter(row => row[column] !== null && row[column] !== undefined && String(row[column] || '').trim() !== '');
    } else if (method === 'remove_duplicates') {
        const uniqueRowsMap = new Map();
        data.forEach(row => {
            const key = JSON.stringify(row);
            if (!uniqueRowsMap.has(key)) {
                uniqueRowsMap.set(key, row);
            }
        });
        activeDataset.data = Array.from(uniqueRowsMap.values());
    } else {
        // Impute: mean, median, mode
        const values = data.map(row => row[column]).filter(v => v !== null && v !== undefined && String(v || '').trim() !== '');
        
        let fillValue;
        if (method === 'mean' || method === 'median') {
            const numericValues = values.filter(v => !isNaN(Number(v))).map(Number);
            if (method === 'mean') fillValue = mean(numericValues);
            if (method === 'median') fillValue = median(numericValues);
        } else if (method === 'mode') {
            fillValue = mode(values);
        }
        
        activeDataset.data = data.map(row => {
            if (row[column] === null || row[column] === undefined || String(row[column] || '').trim() === '') {
                return { ...row, [column]: fillValue };
            }
            return row;
        });
    }
    
    // Re-sync all dependent state and UI
    activeDataset.rows = activeDataset.data.length;
    filteredData = [...activeDataset.data];
    
    addChatMessage('bot', `Applied <strong>${method.replace('_', ' ')}</strong> fix on column "${column === 'all' ? 'dataset' : column}". ${activeDataset.rows} rows remaining. Please review the updated Data Quality and Summary.`);
    
    displayDataQuality();
    displaySummaryStats();
    populateAxisSelectors();
    updateVisualization();
    displayDataTable();
    updateFileList();
}

// --- Filtering ---

function displayFilters() {
    const container = document.getElementById('filtersContainer');
    const data = activeDataset.data;
    const categoricalColumns = getCategoricalColumns(data);
    
    if (categoricalColumns.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400 text-center italic">No suitable categorical columns found for quick filters.</p>';
        return;
    }
    
    // Only show up to 3 columns for quick filters
    const filterGroups = categoricalColumns.slice(0, 3).map(col => {
        const uniqueValues = [...new Set(data.map(row => String(row[col] || 'N/A')))];
        // Only show top 5 values
        const topValues = uniqueValues.slice(0, 5);
        
        return `
            <div class="space-y-2 border-b pb-3 last:border-b-0 last:pb-0">
                <div class="text-sm font-semibold text-gray-700">${col}</div>
                ${topValues.map(value => `
                    <div class="flex items-center space-x-2">
                        <input type="checkbox" id="filter-${col}-${value}" 
                            data-column="${col}" data-value="${value}" 
                            onchange="applyFilters()" checked
                            class="rounded text-cyan-600 focus:ring-cyan-500 border-gray-300">
                        <label for="filter-${col}-${value}" class="text-sm text-gray-600">${value}</label>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
    
    container.innerHTML = filterGroups;
}

function applyFilters() {
    const checkboxes = document.querySelectorAll('#filtersContainer input[type="checkbox"]');
    const filters = {};
    
    checkboxes.forEach(cb => {
        const column = cb.dataset.column;
        const value = cb.dataset.value;
        
        if (!filters[column]) filters[column] = { checked: [], unchecked: [] };
        if (cb.checked) {
            filters[column].checked.push(value);
        } else {
            filters[column].unchecked.push(value);
        }
    });
    
    filteredData = activeDataset.data.filter(row => {
        // A row passes if for every column filter, the row's value is in the 'checked' list.
        return Object.keys(filters).every(col => {
            const rowValue = String(row[col] || 'N/A');
            
            // This complex check ensures that if a user unchecks ALL available filter options for a column,
            // the filter for that column is applied to exclude all values, resulting in an empty dataset.
            // If filters[col].checked.length is 0, but filters[col].unchecked.length > 0, we exclude all rows 
            // whose value matches any of the original unique values, effectively filtering out everything.
            if (filters[col].checked.length === 0 && filters[col].unchecked.length > 0) {
                const originalValues = [...new Set(activeDataset.data.map(r => String(r[col] || 'N/A')))];
                if (originalValues.includes(rowValue)) return false;
            }

            // Standard filter: if the column has any checked items, the row must match one of them.
            if (filters[col].checked.length > 0) {
                return filters[col].checked.includes(rowValue);
            }
            
            return true;
        });
    });

    currentPage = 1;
    updateVisualization();
    displayDataTable();
    addChatMessage('bot', `Filters applied! Showing ${filteredData.length} of ${activeDataset.data.length} rows.`);
}

// --- Summary Stats ---

function displaySummaryStats() {
    const container = document.getElementById('summaryStats');
    const data = activeDataset.data;
    const numericColumns = getNumericColumns(data);
    const categoricalColumns = getCategoricalColumns(data);
    
    // Example: Mean of first numeric column
    let meanStat = 'N/A';
    if (numericColumns.length > 0) {
        const values = data.map(row => Number(row[numericColumns[0]]) || 0);
        meanStat = mean(values).toFixed(2);
    }
    
    // Example: Mode of first categorical column
    let modeStat = 'N/A';
    if (categoricalColumns.length > 0) {
        const values = data.map(row => row[categoricalColumns[0]]);
        modeStat = mode(values);
    }

    // Stat Card Helper
    const statCard = (label, value, color) => `
        <div class="p-4 bg-${color}-50 rounded-lg border border-${color}-200">
            <div class="text-xs font-medium text-gray-500 uppercase tracking-wider">${label}</div>
            <div class="text-xl font-bold text-gray-800">${value}</div>
        </div>
    `;
    
    container.innerHTML = `
        ${statCard('Total Rows', data.length.toLocaleString(), 'blue')}
        ${statCard('Total Columns', Object.keys(data[0] || {}).length, 'purple')}
        ${statCard(`Avg. (${numericColumns[0] || 'Numeric'})`, meanStat, 'green')}
        ${statCard(`Mode (${categoricalColumns[0] || 'Category'})`, modeStat, 'yellow')}
    `;
}


// --- Visualization (Chart.js) ---

function populateAxisSelectors() {
    const xAxis = document.getElementById('xAxis');
    const yAxis = document.getElementById('yAxis');
    const columns = Object.keys(activeDataset.data[0] || {});
    const numericColumns = getNumericColumns(activeDataset.data);
    
    const allOptions = columns.map(col => `<option value="${col}">${col}</option>`).join('');
    const numericOptions = numericColumns.map(col => `<option value="${col}">${col}</option>`).join('');

    xAxis.innerHTML = allOptions;
    yAxis.innerHTML = numericOptions;
    
    // Pre-select reasonable defaults
    if (columns.length > 0) xAxis.value = columns[0];
    if (numericColumns.length > 0) yAxis.value = numericColumns[0];
}

function updateVisualization() {
    if (filteredData.length === 0) {
         addChatMessage('bot', 'Cannot visualize: Filtered data set is empty.');
         return;
    }

    const chartType = document.getElementById('chartType').value;
    const xColumn = document.getElementById('xAxis').value;
    const yColumn = document.getElementById('yAxis').value;
    
    // Chart is available globally from the CDN
    const ctx = document.getElementById('mainChart').getContext('2d'); 
    
    if (currentChart) currentChart.destroy();
    
    const chartConfig = prepareChartData(filteredData, xColumn, yColumn, chartType);
    
    currentChart = new Chart(ctx, {
        type: chartConfig.type,
        data: chartConfig.data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: chartType === 'pie' || chartType === 'doughnut' },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: chartConfig.scales || {}
        }
    });
    
    displayInsights(); // Re-run insights after every chart update
}

function prepareChartData(data, xColumn, yColumn, chartType) {
    // Check if X-axis is numeric for scatter/bar/line
    const isXNumeric = getNumericColumns(data).includes(xColumn);

    if (chartType === 'pie' || chartType === 'doughnut') {
        const grouped = {};
        data.forEach(row => {
            const key = String(row[xColumn] || 'N/A');
            // Pie charts typically aggregate counts or a single numeric measure
            grouped[key] = (grouped[key] || 0) + (Number(row[yColumn]) || 1);
        });
        
        return {
            type: chartType,
            data: {
                labels: Object.keys(grouped),
                datasets: [{
                    data: Object.values(grouped),
                    backgroundColor: chartColors
                }]
            },
            scales: {}
        };
    }
    
    if (chartType === 'scatter' && isXNumeric) {
        return {
            type: 'scatter',
            data: {
                datasets: [{
                    label: `${yColumn} vs ${xColumn}`,
                    data: data.map(row => ({
                        x: Number(row[xColumn]) || 0,
                        y: Number(row[yColumn]) || 0
                    })),
                    backgroundColor: chartColors[0]
                }]
            },
            scales: {
                x: { type: 'linear', position: 'bottom', title: { display: true, text: xColumn } },
                y: { type: 'linear', position: 'left', title: { display: true, text: yColumn } }
            }
        };
    }
    
    // Aggregation for non-scatter plots if X is categorical
    if (!isXNumeric) {
         const grouped = {};
        data.forEach(row => {
            const key = String(row[xColumn] || 'N/A');
            grouped[key] = (grouped[key] || 0) + (Number(row[yColumn]) || 0);
        });
        
        const labels = Object.keys(grouped);
        const values = Object.values(grouped);

        return {
            type: chartType,
            data: {
                labels: labels,
                datasets: [{
                    label: yColumn,
                    data: values,
                    backgroundColor: chartType === 'bar' ? chartColors[0] : 'rgba(6, 182, 212, 0.2)',
                    borderColor: chartColors[0],
                    borderWidth: 1,
                    tension: 0.4,
                    fill: chartType === 'line' ? false : true // No fill for line by default
                }]
            },
            scales: {
                 x: { title: { display: true, text: xColumn } },
                 y: { title: { display: true, text: yColumn } }
            }
        };
    }

    // Default fallback for ordered data display (e.g., Line/Bar with numeric X)
    const labels = data.slice(0, 50).map(row => row[xColumn]);
    const values = data.slice(0, 50).map(row => Number(row[yColumn]) || 0);

     return {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: yColumn,
                data: values,
                backgroundColor: chartType === 'bar' ? chartColors[0] : 'rgba(6, 182, 212, 0.2)',
                borderColor: chartColors[0],
                borderWidth: 1,
                tension: 0.4,
                fill: chartType === 'line' ? false : true
            }]
        },
         scales: {
             x: { title: { display: true, text: xColumn } },
             y: { title: { display: true, text: yColumn } }
        }
    };
}

function displayInsights() {
    const container = document.getElementById('insightsContainer');
    const data = activeDataset.data;
    const currentChartType = document.getElementById('chartType').value;
    const xCol = document.getElementById('xAxis').value;
    const yCol = document.getElementById('yAxis').value;
    const insights = [];

    // 1. Filter status
    if (filteredData.length < data.length) {
        insights.push({ severity: 'info', text: `<strong>Active Filter:</strong> Currently viewing a subset of ${filteredData.length} rows (${((filteredData.length / data.length) * 100).toFixed(0)}%).`});
    }

    // 2. Correlation insight (from chart axes)
    const numericCols = getNumericColumns(data);
    if (numericCols.includes(xCol) && numericCols.includes(yCol)) {
        const corr = calculateCorrelation(data, xCol, yCol);
        if (Math.abs(corr) > 0.7) {
            insights.push({ severity: 'high', text: `<strong>Strong Correlation:</strong> A ${corr > 0 ? 'positive' : 'negative'} correlation of <strong>${corr.toFixed(2)}</strong> exists between ${xCol} and ${yCol}.`});
        } else if (Math.abs(corr) < 0.2) {
            insights.push({ severity: 'low', text: `<strong>Weak Relationship:</strong> The correlation between ${xCol} and ${yCol} is very weak (${corr.toFixed(2)}). Consider alternative metrics.`});
        }
    }

    // 3. Visualization suggestion based on current axes
    const isXNumeric = numericCols.includes(xCol);
    if (!isXNumeric && currentChartType !== 'bar' && currentChartType !== 'pie' && currentChartType !== 'doughnut') {
         insights.push({ severity: 'medium', text: `<strong>Chart Type Alert:</strong> Since <strong>${xCol}</strong> is categorical, a <strong>Bar Chart</strong> or <strong>Pie Chart</strong> might be more suitable than a ${currentChartType}.`});
    }


    // 4. Missing value reminder
    const missingCol = Object.keys(data[0] || {}).find(col => {
        const missing = data.filter(row => row[col] === null || row[col] === undefined || String(row[col] || '').trim() === '').length;
        return missing > 0;
    });

    if (missingCol) {
        insights.push({ severity: 'medium', text: `<strong>Data Quality Reminder:</strong> Missing values are present. Check the <strong>Data Quality</strong> panel for imputation suggestions.`});
    }

    
    // Format insights for display
    container.innerHTML = insights.length > 0 ? insights.map(insight => {
         const map = severityMap[insight.severity];
        const colorPrefix = map.color.split('-')[1];
        return `
            <div class="flex p-3 rounded-lg bg-${colorPrefix}-50 border-l-4 border-${colorPrefix}-500 text-sm text-gray-700">
                 <i data-lucide="${map.icon}" class="icon w-5 h-5 mr-3 flex-shrink-0 ${map.color}"></i>
                <p>${insight.text}</p>
            </div>
        `;
    }).join('') : `
         <p class="text-sm text-gray-400 text-center italic py-4">No immediate insights or suggestions to display. Ask the AI assistant for more!</p>
    `;
     if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

// --- Data Table ---

function displayDataTable() {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const tableInfo = document.getElementById('tableInfo');
    
    if (filteredData.length === 0) {
         tbody.innerHTML = `<tr><td colspan="100" class="text-center py-4 text-gray-500">No data to display. Adjust filters or search terms.</td></tr>`;
         tableInfo.textContent = '0 rows';
         updatePagination();
         return;
    }

    const columns = Object.keys(filteredData[0] || {});
    const startIdx = (currentPage - 1) * rowsPerPage;
    const endIdx = startIdx + rowsPerPage;
    const pageData = filteredData.slice(startIdx, endIdx);
    
    // Headers with Sortable Icons
    thead.innerHTML = `<tr>${columns.map(col => `
        <th onclick="sortTable('${col}')" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition duration-150">
            ${col} <i data-lucide="arrow-down-up" class="icon w-3 h-3 ml-1"></i>
        </th>
    `).join('')}</tr>`;
    
    // Body
    tbody.innerHTML = pageData.map(row => `
        <tr>${columns.map(col => {
            const value = row[col] !== null && row[col] !== undefined ? row[col] : '';
            return `<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${value}</td>`;
        }).join('')}</tr>
    `).join('');
    
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
    
    // Info
    tableInfo.textContent = `Showing ${startIdx + 1}-${Math.min(endIdx, filteredData.length)} of ${filteredData.length.toLocaleString()} rows`;
    
    updatePagination();
}

function updatePagination() {
    const pagination = document.getElementById('pagination');
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    
    const prevDisabled = currentPage === 1;
    const nextDisabled = currentPage === totalPages || totalPages === 0;

    pagination.innerHTML = `
        <button class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-1 px-3 rounded-md transition disabled:opacity-50" onclick="changePage(${currentPage - 1})" ${prevDisabled ? 'disabled' : ''}>
            <i data-lucide="chevron-left" class="icon w-4 h-4"></i>
        </button>
        <span class="text-sm text-gray-600">Page ${totalPages > 0 ? currentPage : 0} of ${totalPages}</span>
        <button class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-1 px-3 rounded-md transition disabled:opacity-50" onclick="changePage(${currentPage + 1})" ${nextDisabled ? 'disabled' : ''}>
            <i data-lucide="chevron-right" class="icon w-4 h-4"></i>
        </button>
    `;
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

function changePage(page) {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    displayDataTable();
}

function sortTable(column) {
    const isNumeric = getNumericColumns(activeDataset.data).includes(column);
    
    filteredData.sort((a, b) => {
        const valA = a[column];
        const valB = b[column];

        if (isNumeric) {
            // Sort numerically
            return (Number(valA) || 0) - (Number(valB) || 0);
        }
        // Sort alphabetically
        return String(valA || '').localeCompare(String(valB || ''));
    });
    
    currentPage = 1;
    displayDataTable();
}

function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    
    if (!searchTerm) {
        filteredData = [...activeDataset.data];
    } else {
        filteredData = activeDataset.data.filter(row => {
            return Object.values(row).some(val => 
                String(val || '').toLowerCase().includes(searchTerm)
            );
        });
    }
    
    currentPage = 1;
    displayDataTable();
}


// --- AI Chat Functions (Mock LLM) ---

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

    // Simulate API call delay
    setTimeout(() => {
        const response = generateAIResponse(question);
        addChatMessage('bot', response);
    }, 800);
}

function addChatMessage(type, content) {
    const container = document.getElementById('chatContainer');
    const message = document.createElement('div');
    message.className = `chat-message ${type} p-3 rounded-xl max-w-[90%] ${type === 'user' ? 'self-end ml-auto' : 'self-start mr-auto'}`;
    message.innerHTML = `
        <div class="message-content text-sm leading-relaxed">
            ${content}
        </div>
    `;
    container.appendChild(message);
    container.scrollTop = container.scrollHeight;
}

function generateAIResponse(question) {
    const lowerQ = question.toLowerCase();
    
    if (!activeDataset) {
        return 'I need an active dataset to provide assistance. Please upload a file first!';
    }
    
    const data = activeDataset.data;
    const columns = Object.keys(data[0] || {});
    
    // Summarize data
    if (lowerQ.includes('summar') || lowerQ.includes('metric')) {
        const numericCols = getNumericColumns(data);
        return `
            <strong>📊 Data Summary for ${activeDataset.name}:</strong><br>
            • Total Rows: <strong>${data.length.toLocaleString()}</strong><br>
            • Columns: <strong>${columns.length}</strong> (${columns.slice(0, 3).join(', ')}${columns.length > 3 ? '...' : ''})<br>
            • Numeric Columns: ${numericCols.length}<br>
            <br>
            The average of <strong>${numericCols[0] || 'the main numeric column'}</strong> is <strong>${numericCols.length > 0 ? mean(data.map(row => Number(row[numericCols[0]]) || 0)).toFixed(2) : 'N/A'}</strong>.
        `;
    }
    
    // Missing values
    if (lowerQ.includes('missing') || lowerQ.includes('null')) {
        const missing = [];
        columns.forEach(col => {
            const count = data.filter(row => row[col] === null || row[col] === undefined || String(row[col] || '').trim() === '').length;
            if (count > 0) {
                missing.push(`<strong>${col}</strong>: ${((count / data.length) * 100).toFixed(1)}% (${count} rows)`);
            }
        });
        
        if (missing.length === 0) {
            return 'Great news! No missing values detected in the entire dataset.';
        }
        
        return `
            ⚠️ <strong>Missing Values Found:</strong><br><br>
            ${missing.slice(0, 5).map(m => `• ${m}`).join('<br>')}
            <br>
            Check the <strong>Data Quality</strong> panel to fill these using Mean, Median, or Mode.
        `;
    }
    
    // Key Improvements
    if (lowerQ.includes('improvement') || lowerQ.includes('recommend')) {
        const missingCount = data.filter(row => Object.values(row).some(v => v === null || v === undefined || String(v || '').trim() === '')).length;
        const uniqueRows = new Set(data.map(row => JSON.stringify(row))).size;
        const duplicates = data.length - uniqueRows;
        
        const recs = [];
        if (missingCount > 0) recs.push('Address <strong>missing values</strong> in key columns (see Quality panel for fixes).');
        if (duplicates > 0) recs.push(`Remove <strong>${duplicates} duplicate rows</strong> for cleaner analysis.`);
        recs.push('Ensure date columns are properly formatted for time-series analysis (if applicable).');
        recs.push('Segment the data using the Quick Filters to find hidden patterns.');
        
        return `
            💡 <strong>Key Recommendations for Improvement:</strong><br><br>
            ${recs.map(r => `• ${r}`).join('<br>')}
            <br>
            Addressing these steps will significantly improve the accuracy of your models and visualizations.
        `;
    }
    
    // Visualization suggestions
    if (lowerQ.includes('visualiz') || lowerQ.includes('chart')) {
        const numericCols = getNumericColumns(data);
        const categoricalCols = getCategoricalColumns(data);
        
        if (numericCols.length >= 2) {
            return `
                📊 <strong>Visualization Suggestions:</strong><br><br>
                • **Scatter Plot:** For relationship between <strong>${numericCols[0]}</strong> and <strong>${numericCols[1]}</strong>.<br>
                • **Bar Chart:** Compare a measure (e.g., Sum of <strong>${numericCols[0]}</strong>) across a category (e.g., <strong>${categoricalCols[0] || 'ID'}</strong>).<br>
                • **Line Chart:** Show trends for <strong>${numericCols[0]}</strong> (if time data is present).<br>
                <br>
                Use the visualization controls above to explore these options!
            `;
        }
    }
    
    return `I can help you analyze this dataset. Try asking about:<br><br>
            • "Summarize key metrics"<br>
            • "Where are the missing values?"<br>
            • "Suggest a better visualization"<br>
            • "What are the key improvements?"`;
}

// --- Utility Functions (Statistical Helpers) ---

function getNumericColumns(data) {
    if (data.length === 0) return [];
    return Object.keys(data[0]).filter(col => {
        // Check up to 100 rows for type consistency
        return data.slice(0, 100).every(row => 
            row[col] === null || row[col] === undefined || String(row[col] || '').trim() === '' || !isNaN(Number(row[col]))
        );
    });
}

function getCategoricalColumns(data) {
    if (data.length === 0) return [];
    return Object.keys(data[0]).filter(col => {
        const uniqueValues = new Set(data.map(row => row[col]));
        // A column is likely categorical if it has fewer than 50 unique values AND fewer than 50% of the data rows
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
    // Finds the key with the highest frequency count
    return Object.keys(frequency).reduce((a, b) => (frequency[a] || 0) > (frequency[b] || 0) ? a : b) || 'N/A';
}

function calculateCorrelation(data, col1, col2) {
    const pairs = data.map(row => [Number(row[col1]) || 0, Number(row[col2]) || 0]);
    const n = pairs.length;
    
    const sum1 = pairs.reduce((a, p) => a + p[0], 0);
    const sum2 = pairs.reduce((a, p) => a + p[1], 0);
    const sum1Sq = pairs.reduce((a, p) => a + p[0] * p[0], 0);
    const sum2Sq = pairs.reduce((a, p) => a + p[1] * p[1], 0);
    const pSum = pairs.reduce((a, p) => a + p[0] * p[1], 0);
    
    // Pearson correlation formula
    const num = pSum - (sum1 * sum2 / n);
    const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));
    
    return den === 0 ? 0 : num / den;
}
