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

function errorResponse(res, error, status = 500) {
  let message = '';
  if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === 'object') {
    message = error.message || error.error || String(error);
  } else {
    message = String(error);
  }
  return res.status(status).json({ error: message });
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = { paginatedResponse, errorResponse, formatBytes };
