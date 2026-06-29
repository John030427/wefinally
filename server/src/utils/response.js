function success(res, data = null, message = 'ok') {
  return res.json({ code: 0, message, data });
}

function fail(res, message = 'error', code = 1, status = 200) {
  return res.status(status).json({ code, message, data: null });
}

function paginate(rows, total, page, pageSize) {
  return {
    list: rows,
    total,
    page: Number(page),
    pageSize: Number(pageSize),
    totalPages: Math.ceil(total / pageSize) || 0,
  };
}

module.exports = { success, fail, paginate };
