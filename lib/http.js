'use strict';

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

function parseBoundedInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

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

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function handleApiError(res, error) {
  return errorResponse(res, error);
}

module.exports = { paginatedResponse, errorResponse, handleApiError, formatBytes, parseBoundedInt };
