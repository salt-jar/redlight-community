/** 包装 async 路由，把 rejection 交给 Express 错误中间件 */
export function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** 解析分页参数，做上下限保护 */
export function parsePagination(query, defaultSize = 20, maxSize = 50) {
  const rawPage = Number(query?.page);
  const rawSize = Number(query?.size);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const size = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(Math.floor(rawSize), maxSize) : defaultSize;
  return { page, size, offset: (page - 1) * size };
}
