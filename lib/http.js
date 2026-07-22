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
  const message = error instanceof Error ? error.message : String(error);
  return res.status(status).json({ error: message });
}

module.exports = { paginatedResponse, errorResponse };
