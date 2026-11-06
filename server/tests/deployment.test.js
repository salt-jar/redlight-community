import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(projectRoot, file), 'utf8');

describe('部署配置静态校验（本机无 Docker）', () => {
  it('docker-compose 包含 mysql / redis / backend / frontend 与数据卷', () => {
    const compose = read('docker-compose.yml');
    expect(compose).toContain('name: redlight');
    for (const service of ['mysql:', 'redis:', 'backend:', 'frontend:']) {
      expect(compose).toContain(service);
    }
    expect(compose).toContain('image: mysql:8.0');
    expect(compose).toContain('image: redis:7-alpine');
    expect(compose).toContain('condition: service_healthy');
    expect(compose).toContain('mysql_data:');
    expect(compose).toContain('redis_data:');
    expect(compose).toContain('uploads_data:');
    expect(compose).toContain('docker-entrypoint-initdb.d/01-schema.sql');
    expect(compose).toContain('REDIS_URL: redis://redis:6379');
  });

  it('nginx 配置包含 100M 限制、API / 上传 / Socket.IO 代理与 SPA 回退', () => {
    const nginx = read('nginx.conf');
    expect(nginx).toContain('client_max_body_size 100M');
    expect(nginx).toContain('location /api/');
    expect(nginx).toContain('location /uploads/');
    expect(nginx).toContain('location /socket.io/');
    expect(nginx).toContain('proxy_set_header Upgrade $http_upgrade');
    expect(nginx).toContain('proxy_pass http://backend:3000');
    expect(nginx).toContain('try_files $uri $uri/ /index.html');
  });

  it('前后端 Dockerfile 完整且使用生产安装 / Nginx 托管', () => {
    const serverDockerfile = read('server/Dockerfile');
    expect(serverDockerfile).toContain('FROM node:22-bookworm');
    expect(serverDockerfile).toContain('npm ci --omit=dev');
    expect(serverDockerfile).toContain('CMD ["node", "src/index.js"]');
    expect(serverDockerfile).toContain('EXPOSE 3000');

    const clientDockerfile = read('client/Dockerfile');
    expect(clientDockerfile).toContain('npm run build');
    expect(clientDockerfile).toContain('FROM nginx:1.27-alpine');
    expect(clientDockerfile).toContain('COPY nginx.conf /etc/nginx/conf.d/default.conf');
    expect(clientDockerfile).toContain('EXPOSE 80');
  });

  it('.env.example 与 README 覆盖本地启动、Docker、SMTP、ngram 与版权提示', () => {
    const envExample = read('.env.example');
    for (const key of [
      'DB_DRIVER=sqlite',
      'DB_HOST=127.0.0.1',
      'REDIS_URL=',
      'SMTP_HOST=',
      'SMTP_PASS=',
      'JWT_SECRET=',
      'VITE_PROXY_TARGET=',
    ]) {
      expect(envExample).toContain(key);
    }

    const readme = read('README.md');
    expect(readme).toContain('npm run dev');
    expect(readme).toContain('docker compose up -d --build');
    expect(readme).toContain('授权码');
    expect(readme).toContain('ngram');
    expect(readme).toContain('版权提示');
    expect(readme).toContain('npm run test:server');
    expect(readme).toContain('npm run e2e');
  });
});
