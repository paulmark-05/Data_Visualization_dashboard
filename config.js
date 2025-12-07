/**
 * ==========================================
 * APPLICATION CONFIGURATION
 * ==========================================
 * Central configuration for DataVizard
 * All settings and constants in one place
 */

const CONFIG = {
    // ==========================================
    // API CONFIGURATION
    // ==========================================
    API: {
        GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
        MODEL: 'gemini-1.5-flash',
        MAX_RETRIES: 3,
        TIMEOUT_MS: 30000
    },

    // ==========================================
    // FILE UPLOAD CONFIGURATION
    // ==========================================
    FILE_UPLOAD: {
        ALLOWED_FORMATS: ['csv', 'xlsx', 'xls'],
        MAX_FILE_SIZE_MB: 50,
        MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,
        CHUNK_SIZE: 1024 * 1024
    },

    // ==========================================
    // ELEMENT IDS (Must match HTML)
    // ==========================================
    ELEMENTS: {
        // Upload Section
        FILE_INPUT: 'fileInput',
        DROPZONE: 'dropzone',
        UPLOAD_PROGRESS: 'uploadProgress',
        PROGRESS_TEXT: 'progressText',
        PROGRESS_FILL: 'progressFill',

        // Screens
        WELCOME_SCREEN: 'welcomeScreen',
        DATA_OVERVIEW: 'dataOverview',
        UPLOAD_AREA: 'uploadArea',

        // Data Display
        DATA_PREVIEW: 'dataPreview',
        DATA_STATS: {
            FILE_NAME: 'statFileName',
            ROWS: 'statRows',
            COLUMNS: 'statColumns',
            SIZE: 'statSize'
        },

        // Data Cleaning
        CLEANING_SECTION: 'dataCleaningSection',
        CLEANING_HISTORY_PANEL: 'cleaningHistoryPanel',
        UNDO_BUTTON: 'undoButton',

        // Insights
        INSIGHTS_CONTAINER: 'insightsContainer',
        INSIGHTS_REQUEST: 'insightsRequest'
    },

    // ==========================================
    // ERROR MESSAGES
    // ==========================================
    ERRORS: {
        FILE_NOT_SELECTED: '❌ Please upload a file first',
        FILE_EMPTY: '❌ File is empty or contains no valid data',
        INVALID_FORMAT: '❌ Please upload a valid Excel or CSV file',
        FILE_TOO_LARGE: '❌ File size exceeds 50MB limit',
        NO_DATA_LOADED: '❌ No data loaded. Please upload a file first',
        NO_API_KEY: '❌ Gemini API key not configured',
        INVALID_API_KEY: '❌ Invalid or expired API key',
        API_ERROR: (code) => `❌ API Error ${code}`,
        RATE_LIMIT: '⏳ Rate limited. Wait 30 seconds and try again',
        NETWORK_ERROR: '🌐 Network error. Check connection and try again',
        XLSX_NOT_LOADED: '❌ Excel library not loaded. Reload page and try again'
    },

    // ==========================================
    // SUCCESS MESSAGES
    // ==========================================
    SUCCESS: {
        FILE_UPLOADED: '✅ File uploaded successfully!',
        INSIGHTS_GENERATED: '✅ Insights generated successfully!',
        DATA_CLEANED: (action) => `✅ ${action} complete`,
        UNDO_SUCCESS: '✅ Undo successful',
        EXPORT_SUCCESS: '✅ Log exported successfully'
    },

    // ==========================================
    // UI CONFIGURATION
    // ==========================================
    UI: {
        TOAST_DURATION_MS: 4000,
        ANIMATION_DURATION_MS: 300,
        PROGRESS_UPDATE_INTERVAL_MS: 100
    },

    // ==========================================
    // DATA CLEANING
    // ==========================================
    CLEANING: {
        MISSING_VALUE_SYMBOLS: ['', 'null', 'NULL', 'none', 'None', 'NONE', 'N/A', 'NA', '#N/A', '-'],
        IQR_MULTIPLIER: 1.5,
        MIN_ROWS_FOR_ANALYSIS: 2
    },

    // ==========================================
    // DATA PROCESSING
    // ==========================================
    DATA: {
        MAX_ROWS_PREVIEW: 100,
        COLUMN_TYPE_DETECTION_SAMPLE: 100,
        NUMERIC_THRESHOLD: 0.8,
        DATE_THRESHOLD: 0.8
    }
};

/**
 * Get Gemini API Key from multiple sources (in priority order)
 * 1. window.__GEMINI_API_KEY (set via console or inline script)
 * 2. process.env.GEMINI_API_KEY (Node.js/Render)
 * 3. sessionStorage (browser storage)
 * 4. meta tag (HTML meta tag)
 */
function getGeminiApiKey() {
    console.log('🔍 Attempting to retrieve Gemini API key...');

    // 1. Check window global (highest priority)
    if (typeof window !== 'undefined' && window.__GEMINI_API_KEY) {
        console.log('✅ API Key found in window.__GEMINI_API_KEY');
        return window.__GEMINI_API_KEY;
    }

    // 2. Check process.env (Node.js)
    if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
        console.log('✅ API Key found in process.env.GEMINI_API_KEY');
        return process.env.GEMINI_API_KEY;
    }

    // 3. Check sessionStorage
    try {
        const stored = sessionStorage.getItem('gemini_api_key');
        if (stored && stored.length > 20 && !stored.includes('PLACEHOLDER')) {
            console.log('✅ API Key found in sessionStorage');
            return stored;
        }
    } catch (e) {
        // sessionStorage may not be available
    }

    // 4. Check meta tag
    try {
        const metaTag = document.querySelector('meta[name="gemini-api-key"]');
        if (metaTag) {
            const content = metaTag.getAttribute('content');
            if (content && content.length > 20 && !content.includes('PLACEHOLDER')) {
                console.log('✅ API Key found in meta tag');
                return content;
            }
        }
    } catch (e) {
        // Meta tag may not exist
    }

    console.error('❌ No valid Gemini API key found in any location');
    return null;
}

/**
 * Validate API Key format
 */
function isValidApiKey(key) {
    if (!key) {
        console.error('❌ API Key is null or undefined');
        return false;
    }
    if (typeof key !== 'string') {
        console.error('❌ API Key is not a string');
        return false;
    }
    if (key.length < 20) {
        console.error('❌ API Key is too short');
        return false;
    }
    if (key.toLowerCase().includes('placeholder') || key.toLowerCase().includes('xxx')) {
        console.error('❌ API Key contains placeholder text');
        return false;
    }
    if (!key.startsWith('AIzaSy_')) {
        console.warn('⚠️  API Key does not start with AIzaSy_');
    }
    console.log('✅ API Key format is valid');
    return true;
}

/**
 * Check if data is loaded
 */
function isDataLoaded() {
    return typeof appState !== 'undefined' && appState.isDataLoaded && appState.uploadedData.length > 0;
}

/**
 * Get data load status message
 */
function getDataLoadStatus() {
    if (!isDataLoaded()) {
        return CONFIG.ERRORS.FILE_NOT_SELECTED;
    }
    return null;
}

/**
 * Initialize configuration on document ready
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('⚙️ DataVizard Configuration Loaded');
    });
} else {
    console.log('⚙️ DataVizard Configuration Loaded');
}
