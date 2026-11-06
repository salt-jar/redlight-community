import http from 'node:http';
import { loadConfig } from './config.js';
import { createDeps } from './bootstrap.js';
import { createApp } from './app.js';
import { createSocket } from './socket.js';
import { ensureStorage } from './services/storage.js';

const config = loadConfig();
ensureStorage(config);

if (config.isProduction && config.jwtSecret === 'redlight-dev-secret-please-change') {
  console.warn('[warn] 生产环境仍在使用默认 JWT_SECRET，请在 .env 中设置强随机密钥');
}

const deps = await createDeps(config);
const app = createApp(deps);
const server = http.createServer(app);
const io = createSocket(server, deps);
app.locals.io = io;

server.listen(config.port, config.host, () => {
  console.log(`赤光社 RedLight API 已启动：http://localhost:${config.port} （driver=${deps.db.driver}, cache=${deps.cache.mode}, mailer=${deps.mailer.mode}）`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[${signal}] 正在关闭赤光社服务...`);
  io.close();
  server.close(async () => {
    try {
      await deps.db.close();
      await deps.cache.close();
    } finally {
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
