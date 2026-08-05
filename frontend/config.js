
/**
 * DataVizard configuration
 * This runs purely in the browser; no secrets here.
 */
const CONFIG = {
  API: {
    // Empty string = same origin as the page. Works locally and in
    // production because FastAPI serves this frontend and the API
    // from a single service.
    BASE_URL: "",
    INSIGHTS_ENDPOINT: "/api/insights"
  },
  FILE_UPLOAD: {
    ALLOWED_FORMATS: ["csv", "xlsx", "xls"],
    MAX_FILE_SIZE_MB: 50,
    MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024
  },
  UI: {
    TOAST_DURATION_MS: 4000
  }
};
