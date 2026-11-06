/** 业务异常：由统一错误处理中间件转换为 JSON 响应 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const badRequest = (message) => new HttpError(400, message);
export const unauthorized = (message = '未登录或登录已过期') => new HttpError(401, message);
export const forbidden = (message = '没有权限执行该操作') => new HttpError(403, message);
export const notFound = (message = '资源不存在') => new HttpError(404, message);
