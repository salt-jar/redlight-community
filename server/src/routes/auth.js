import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../utils/http.js';
import { serializeUser } from '../utils/serialize.js';
import { HttpError } from '../utils/errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
}

function clientUserAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 512);
}

export function createAuthRouter({ db, cache, mailer, config, authGuard }) {
  const router = express.Router();

  router.post(
    '/send-code',
    asyncHandler(async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      if (!EMAIL_RE.test(email)) throw new HttpError(400, '请输入正确的邮箱地址');
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
        expiresIn: config.codeTtlSec,
        cooldown: config.codeCooldownSec,
      };
      // 仅非生产环境返回 devCode，便于本地无 SMTP 联调
      if (!config.isProduction) body.devCode = code;
      res.json(body);
    }),
  );

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

      // 非法格式同样属于一次失败登录尝试，需记录 login_logs
      if (!/^\d{6}$/.test(code)) {
        await db.query(
          'INSERT INTO login_logs (user_id, email, login_ip, user_agent, status) VALUES (?, ?, ?, ?, 0)',
          [existing ? Number(existing.id) : 0, email, ip, userAgent],
        );
        return res.status(400).json({ msg: '请输入 6 位数字验证码' });
      }

      const savedCode = await cache.get(`email:code:${email}`);

      if (!savedCode || savedCode !== code) {
        await db.query(
          'INSERT INTO login_logs (user_id, email, login_ip, user_agent, status) VALUES (?, ?, ?, ?, 0)',
          [existing ? Number(existing.id) : 0, email, ip, userAgent],
        );
        return res.status(400).json({ msg: '验证码错误或已过期' });
      }

      await cache.del(`email:code:${email}`);

      let user = existing;
      if (!user) {
        const prefix = email.split('@')[0].slice(0, 6) || '新同志';
        const nickname = `同志_${prefix}`;
        const result = await db.query('INSERT INTO users (email, nickname) VALUES (?, ?)', [email, nickname]);
        const created = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId]);
        user = created[0];
      }

      await db.query(
        'INSERT INTO login_logs (user_id, email, login_ip, user_agent, status) VALUES (?, ?, ?, ?, 1)',
        [Number(user.id), email, ip, userAgent],
      );

      const token = jwt.sign({ userId: Number(user.id) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
      return res.json({ token, user: serializeUser(user) });
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
