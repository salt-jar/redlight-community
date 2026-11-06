FROM node:22-bookworm

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# 先安装依赖，利用 Docker 层缓存
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 源码
COPY server/src ./src

# 运行时目录（Compose 会把 uploads 挂载为数据卷）
RUN mkdir -p uploads/books uploads/images uploads/temp data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
