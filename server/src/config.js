import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** server/ 目录 */
export const SERVER_ROOT = path.resolve(__dirname, '..');
/** 赤光社/ 项目目录 */
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

// 优先读取项目根目录 .env，其次读取 server/.env；已存在的环境变量不会被覆盖。
dotenv.config({ path: path.resolve(PROJECT_ROOT, '.env'), quiet: true });
dotenv.config({ path: path.resolve(SERVER_ROOT, '.env'), quiet: true });

export const BOOK_CATEGORIES = [
  '马恩著作',
  '列宁著作',
  '哲学',
  '政治经济学',
  '科学社会主义',
  '党史',
  '历史',
  '其他',
];

/** 上传体积/数量阈值 */
export const LIMITS = {
  zipSize: 100 * 1024 * 1024, // 100MB
  imageSize: 5 * 1024 * 1024,
  zipEntries: 2000,
  zipUncompressed: 500 * 1024 * 1024,
  coverWidth: 600,
};

function stringValue(env, key, fallback) {
  const value = env[key];
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function numberValue(env, key, fallback) {
  const value = Number(env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * 读取运行配置。可注入自定义 env 以便测试。
 * @param {NodeJS.ProcessEnv} env
 */
export function loadConfig(env = process.env) {
  const nodeEnv = stringValue(env, 'NODE_ENV', 'development');
  const dbDriver = stringValue(env, 'DB_DRIVER', 'sqlite').toLowerCase() === 'mysql' ? 'mysql' : 'sqlite';
  const appRoot = path.resolve(stringValue(env, 'APP_ROOT', SERVER_ROOT));
  const uploadDir = path.resolve(appRoot, stringValue(env, 'UPLOAD_DIR', 'uploads'));
  const dbFile = path.resolve(appRoot, stringValue(env, 'DB_FILE', 'data/redlight.db'));
  const smtpHost = stringValue(env, 'SMTP_HOST', '');
  const smtpUser = stringValue(env, 'SMTP_USER', '');
  const smtpPass = stringValue(env, 'SMTP_PASS', '');
  const smtpPort = numberValue(env, 'SMTP_PORT', 465);
  const smtpSecure = stringValue(env, 'SMTP_SECURE', smtpPort === 465 ? 'true' : 'false') === 'true';

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port: numberValue(env, 'PORT', 3000),
    host: stringValue(env, 'HOST', '0.0.0.0'),
    trustProxy: stringValue(env, 'TRUST_PROXY', 'true') === 'true',
    corsOrigin: stringValue(env, 'CORS_ORIGIN', '*'),
    appRoot,
    projectRoot: PROJECT_ROOT,
    uploadDir,
    tempDir: path.join(uploadDir, 'temp'),
    booksDir: path.join(uploadDir, 'books'),
    imagesDir: path.join(uploadDir, 'images'),
    placeholderCoverPath: path.join(uploadDir, 'images', 'default-cover.svg'),
    placeholderCoverUrl: '/uploads/images/default-cover.svg',
    dbDriver,
    dbFile,
    mysql: {
      host: stringValue(env, 'DB_HOST', '127.0.0.1'),
      port: numberValue(env, 'DB_PORT', 3306),
      user: stringValue(env, 'DB_USER', 'root'),
      password: stringValue(env, 'DB_PASSWORD', ''),
      database: stringValue(env, 'DB_NAME', 'redlight'),
    },
    redisUrl: stringValue(env, 'REDIS_URL', ''),
    jwtSecret: stringValue(env, 'JWT_SECRET', 'redlight-dev-secret-please-change'),
    jwtExpiresIn: stringValue(env, 'JWT_EXPIRES_IN', '7d'),
    smtp: {
      enabled: Boolean(smtpHost && smtpUser && smtpPass),
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      user: smtpUser,
      pass: smtpPass,
      from: stringValue(env, 'SMTP_FROM', smtpUser ? `赤光社 <${smtpUser}>` : '赤光社 <no-reply@redlight.local>'),
    },
    codeTtlSec: numberValue(env, 'CODE_TTL_SEC', 300),
    codeCooldownSec: numberValue(env, 'CODE_COOLDOWN_SEC', 60),
    maxPostContent: numberValue(env, 'MAX_POST_CONTENT', 1000),
    maxPostImages: numberValue(env, 'MAX_POST_IMAGES', 9),
    maxCommentContent: numberValue(env, 'MAX_COMMENT_CONTENT', 500),
    limits: LIMITS,
    bookCategories: BOOK_CATEGORIES,
  };
}
