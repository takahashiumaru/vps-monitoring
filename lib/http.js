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

module.exports = { paginatedResponse, errorResponse };
