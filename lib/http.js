'use strict';

/**
 * Generates a standardized paginated response envelope.
 * @param {Array} data - Paginated items array.
 * @param {number} total - Total item count across all pages.
 * @param {number} page - Current page number (1-indexed).
 * @param {number} pageSize - Number of items per page.
 * @returns {object} Standard paginated response object.
 */
function paginatedResponse(data, total, page, pageSize) {
  const totalPages = Math.ceil(total / pageSize);
  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Parses and bounds an integer value within specified min/max range.
 * @param {string|number} value - Input value to parse.
 * @param {number} fallback - Fallback value if parse fails.
 * @param {object} [options] - Clamping bounds.
 * @param {number} [options.min=0] - Lower bound.
 * @param {number} [options.max=Number.MAX_SAFE_INTEGER] - Upper bound.
 * @returns {number} Clamped integer value.
 */
function parseBoundedInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Sends a standardized JSON error response.
 * @param {object} res - Express response object.
 * @param {Error|string|object} error - Error message or Error instance.
 * @param {number} [status=500] - HTTP status code.
 * @returns {object} Express JSON response.
 */
function errorResponse(res, error, status = 500) {
  // Use `unknown` to force type checking.
  const err = error;
  let message = 'An unknown error occurred.';

  if (err instanceof Error) {
    message = err.message;
  } else if (typeof err === 'string' && err.trim()) {
    message = err;
  } else if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    message = err.message;
  } else {
    message = String(err);
  }

  // Prevent leaking technical details in production environments.
  if (process.env.NODE_ENV === 'production' && status >= 500) {
    console.error(`[Internal Server Error]: ${message}`, { originalError: err });
    message = 'Internal Server Error';
  }

  return res.status(status).json({
    error: message,
    statusCode: status
  });
}

/**
 * Formats raw bytes into human-readable binary unit string (KB, MB, GB, etc.).
 * @param {number} bytes - Raw byte count.
 * @param {number} [decimals=2] - Number of decimal places.
 * @returns {string} Formatted string representation.
 */
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Handles caught API exceptions with standard 500 error response.
 * @param {object} res - Express response object.
 * @param {Error|unknown} error - Caught exception.
 * @returns {object} Express JSON response.
 */
function handleApiError(res, error) {
  return errorResponse(res, error);
}

module.exports = { paginatedResponse, errorResponse, handleApiError, formatBytes, parseBoundedInt };
