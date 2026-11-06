import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// 读取项目根目录 .env，供 dev 脚本与子进程共享（已存在的环境变量优先）
function loadRootEnv() {
  const envFile = path.join(root, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const rawLine of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

loadRootEnv();

const port = process.env.PORT || '3000';
const proxyTarget = process.env.VITE_PROXY_TARGET || `http://127.0.0.1:${port}`;
const children = [];
let shuttingDown = false;

function start(name, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    env: { ...process.env, ...options.env },
    stdio: 'inherit',
  });
  children.push({ name, child });
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[dev] ${name} 进程退出（code=${code}），正在停止另一个进程...`);
      shutdown(code || 1);
    }
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), 500);
}

async function waitForHealth(timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return true;
    } catch {
      /* 服务尚未就绪 */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[dev] 启动后端 ...');
const server = start('server', process.execPath, ['src/index.js'], {
  cwd: path.join(root, 'server'),
  env: { NODE_ENV: process.env.NODE_ENV || 'development' },
});

console.log('[dev] 等待后端健康检查 ...');
const healthy = await waitForHealth();
if (!healthy) {
  console.error('[dev] 后端未在 30 秒内就绪，请检查 server 日志与 .env 配置');
  shutdown(1);
} else {
  console.log(`[dev] 后端已就绪：http://127.0.0.1:${port}/api/health`);
  console.log('[dev] 启动前端 Vite ...');
  start('client', process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js')], {
    cwd: path.join(root, 'client'),
    env: { VITE_PROXY_TARGET: proxyTarget },
  });
  console.log('[dev] 前端：http://127.0.0.1:5173');
  console.log('[dev] 按 Ctrl+C 停止前后端');
}

// 让进程保持存活（等待子进程）
await new Promise(() => {});
