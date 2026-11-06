import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { io as clientIo } from 'socket.io-client';
import { loadConfig } from '../../src/config.js';
import { createDeps } from '../../src/bootstrap.js';
import { createApp } from '../../src/app.js';
import { createSocket } from '../../src/socket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_ROOT = path.join(__dirname, '..', '.tmp');
export const FIXTURES = path.join(__dirname, '..', 'fixtures');

/**
 * 启动一套隔离的服务端环境：独立 SQLite 文件、独立 uploads 目录、随机端口。
 */
export async function createTestContext(name, overrides = {}) {
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  const root = path.join(TMP_ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(root, { recursive: true });

  const config = loadConfig({
    NODE_ENV: 'test',
    DB_DRIVER: 'sqlite',
    DB_FILE: path.join(root, 'test.db'),
    APP_ROOT: root,
    UPLOAD_DIR: path.join(root, 'uploads'),
    JWT_SECRET: 'redlight-test-secret',
    SMTP_HOST: '',
    REDIS_URL: '',
    PORT: '0',
  });
  if (overrides.limits) config.limits = { ...config.limits, ...overrides.limits };

  const deps = await createDeps(config);
  const app = createApp(deps);
  const server = http.createServer(app);
  const io = createSocket(server, deps);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const agent = request(app);

  async function register(email = 'reader@example.com', code = '123456') {
    const local =
      email
        .toLowerCase()
        .split('@')[0]
        .replace(/[^a-z0-9_\u4e00-\u9fa5]/g, '')
        .slice(0, 15) || 'user';
    const username = `同志_${local}`;
    await deps.cache.set(`email:code:${email.toLowerCase()}`, code, 300);
    const response = await agent
      .post('/api/auth/register')
      .set('User-Agent', 'vitest-agent/1.0')
      .send({ email, code, username });
    if (response.status !== 200) {
      throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body;
  }

  async function createPost(token, content = '测试动态', images = []) {
    const response = await agent
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content, images });
    if (response.status !== 200) {
      throw new Error(`createPost failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body.post;
  }

  async function close() {
    await new Promise((resolve) => {
      io.close(() => resolve());
      setTimeout(resolve, 1000);
    });
    if (server.listening) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
    await deps.db.close();
    await deps.cache.close();
    fs.rmSync(root, { recursive: true, force: true });
  }

  return { app, deps, config, server, io, port, baseUrl, agent, register, createPost, close, root };
}

export function openSocket(baseUrl, token) {
  return clientIo(baseUrl, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000,
  });
}

export function waitForConnection(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 6000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function waitForEvent(socket, event, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`wait ${event} timeout`));
    }, timeout);
    const handler = (payload) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

export async function waitFor(predicate, timeout = 5000, interval = 50) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('waitFor timeout');
}
