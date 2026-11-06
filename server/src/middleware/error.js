import { HttpError } from '../utils/errors.js';

export function notFoundApi(req, res) {
  res.status(404).json({ msg: `接口不存在：${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof HttpError) {
    return res.status(error.status).json({ msg: error.message });
  }

  if (error?.name === 'MulterError') {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ msg: '文件大小超过限制（图片最大 5MB，图书压缩包最大 100MB）' });
    }
    return res.status(400).json({ msg: `上传失败：${error.message}` });
  }

  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ msg: '请求体 JSON 格式不正确' });
  }

  console.error('[error]', error);
  return res.status(500).json({ msg: '服务器开小差了，请稍后重试' });
}
