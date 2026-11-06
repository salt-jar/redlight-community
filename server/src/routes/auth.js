import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../utils/http.js';
import { serializeUser } from '../utils/serialize.js';
import { HttpError } from '../utils/errors.js';
import { generateCommunityNo, isValidUsername, USERNAME_RULE } from '../utils/identity.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const AUTH_PURPOSES = ['login', 'register'];

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
}

function clientUserAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 512);
}

async function writeLoginLog(db, { userId, email, ip, userAgent, status }) {
  await db.query(
    'INSERT INTO login_logs (user_id, email, login_ip, user_agent, status) VALUES (?, ?, ?, ?, ?)',
    [Number(userId) || 0, email, ip, userAgent, status],
  );
}

function signToken(user, config) {
  return jwt.sign({ userId: Number(user.id) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function isUniqueViolation(error) {
  const code = String(error?.code || '');
  return code.includes('SQLITE_CONSTRAINT') || code === 'ER_DUP_ENTRY' || error?.errno === 1062;
}

export function createAuthRouter({ db, cache, mailer, config, authGuard }) {
  const router = express.Router();

  router.post(
    '/send-code',
    asyncHandler(async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      const purpose = String(req.body?.purpose || 'login').toLowerCase();
      if (!EMAIL_RE.test(email)) throw new HttpError(400, '请输入正确的邮箱地址');
      if (!AUTH_PURPOSES.includes(purpose)) throw new HttpError(400, '验证码用途不正确');

      const existingRows = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
      const emailExists = existingRows.length > 0;
      if (purpose === 'register' && emailExists) {
        throw new HttpError(409, '该邮箱已注册，请直接登录');
      }
      if (purpose === 'login' && !emailExists) {
        throw new HttpError(400, '该邮箱尚未注册，请先注册');
      }

      if (!mailer.mode || mailer.mode === 'console') {
        if (config.isProduction) throw new HttpError(503, '邮件服务尚未配置，暂时无法发送验证码');
      }

      const cooldownKey = `email:cooldown:${email}`;
      if (await cache.get(cooldownKey)) {
        return res.status(429).json({ msg: '验证码发送过于频繁，请 60 秒后再试', retryAfter: config.codeCooldownSec });
      }

      const code = String(crypto.randomInt(100000, 1000000));
      const codeKey = `email:code:${email}`;
      await cache.set(codeKey, code, config.codeTtlSec);
      await cache.set(cooldownKey, '1', config.codeCooldownSec);

      try {
        await mailer.sendVerificationCode(email, code);
      } catch (error) {
        await cache.del(codeKey);
        await cache.del(cooldownKey);
        throw new HttpError(502, `验证码邮件发送失败：${error.message}`);
      }

      const body = {
        success: true,
        purpose,
        expiresIn: config.codeTtlSec,
        cooldown: config.codeCooldownSec,
      };
      // 仅非生产环境返回 devCode，便于本地无 SMTP 联调
      if (!config.isProduction) body.devCode = code;
      res.json(body);
    }),
  );

  // 注册：邮箱验证码 + 自定义用户名 ID；社区号由系统随机生成
  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      const code = String(req.body?.code || '').trim();
      const username = String(req.body?.username || '').trim();
      if (!EMAIL_RE.test(email)) throw new HttpError(400, '请输入正确的邮箱地址');
      if (!isValidUsername(username)) throw new HttpError(400, USERNAME_RULE);
      if (!/^\d{6}$/.test(code)) throw new HttpError(400, '请输入 6 位数字验证码');

      const emailRows = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
      if (emailRows.length) throw new HttpError(409, '该邮箱已注册，请直接登录');

      const usernameRows = await db.query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
      if (usernameRows.length) throw new HttpError(409, '该用户名 ID 已被占用，请换一个');

      const savedCode = await cache.get(`email:code:${email}`);
      if (!savedCode || savedCode !== code) {
        throw new HttpError(400, '验证码错误或已过期');
      }

      const communityNo = await generateCommunityNo(db);
      let inserted;
      try {
        inserted = await db.query(
          'INSERT INTO users (email, nickname, username, community_no) VALUES (?, ?, ?, ?)',
          [email, username, username, communityNo],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError(409, '该邮箱或用户名 ID 已被占用，请更换后重试');
        }
        throw error;
      }

      await cache.del(`email:code:${email}`);
      const rows = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [inserted.insertId]);
      const user = rows[0];
      const ip = clientIp(req);
      const userAgent = clientUserAgent(req);
      await writeLoginLog(db, { userId: user.id, email, ip, userAgent, status: 1 });

      const token = signToken(user, config);
      res.json({ token, user: serializeUser(user) });
    }),
  );

  // 登录：仅允许已注册邮箱，不再自动注册
  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      const code = String(req.body?.code || '').trim();
      if (!EMAIL_RE.test(email)) throw new HttpError(400, '请输入正确的邮箱地址');

      const ip = clientIp(req);
      const userAgent = clientUserAgent(req);
      const existingRows = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
      const existing = existingRows[0] || null;

      if (!existing) {
        await writeLoginLog(db, { userId: 0, email, ip, userAgent, status: 0 });
        return res.status(400).json({ msg: '该邮箱尚未注册，请先注册' });
      }

      // 非法格式同样属于一次失败登录尝试，需记录 login_logs
      if (!/^\d{6}$/.test(code)) {
        await writeLoginLog(db, { userId: existing.id, email, ip, userAgent, status: 0 });
        return res.status(400).json({ msg: '请输入 6 位数字验证码' });
      }

      const savedCode = await cache.get(`email:code:${email}`);
      if (!savedCode || savedCode !== code) {
        await writeLoginLog(db, { userId: existing.id, email, ip, userAgent, status: 0 });
        return res.status(400).json({ msg: '验证码错误或已过期' });
      }

      await cache.del(`email:code:${email}`);
      await writeLoginLog(db, { userId: existing.id, email, ip, userAgent, status: 1 });

      const token = signToken(existing, config);
      return res.json({ token, user: serializeUser(existing) });
    }),
  );

  router.get(
    '/me',
    authGuard,
    asyncHandler(async (req, res) => {
      const rows = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.userId]);
      if (!rows.length) throw new HttpError(401, '账号不存在或已被注销');
      res.json({ user: serializeUser(rows[0]) });
    }),
  );

  return router;
}
