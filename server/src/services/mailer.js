import nodemailer from 'nodemailer';

function buildHtml(code) {
  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:0;background:#FAF8F5;font-family:'Microsoft YaHei','PingFang SC',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FAF8F5;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <tr>
              <td style="background:#C8102E;padding:22px 28px;color:#FFFFFF;">
                <span style="font-size:22px;letter-spacing:2px;font-family:SimSun,serif;font-weight:bold;">★ 赤光社 RedLight</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 8px;color:#2C2C2C;">
                <p style="margin:0 0 12px;font-size:16px;">同志，您好：</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.8;color:#595959;">您正在登录赤光社，本次登录验证码为：</p>
                <div style="text-align:center;padding:18px 0;background:#FAF8F5;border:1px solid #F0E6D8;border-radius:6px;">
                  <span style="font-size:34px;letter-spacing:10px;font-weight:bold;color:#C8102E;">${code}</span>
                </div>
                <p style="margin:20px 0 0;font-size:13px;color:#8C8C8C;line-height:1.8;">验证码 5 分钟内有效，请勿泄露给他人。若非本人操作，请忽略本邮件。</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 26px;">
                <div style="height:2px;background:linear-gradient(90deg,#C8102E,#D4AF37);"></div>
                <p style="margin:14px 0 0;font-size:13px;color:#8C8C8C;">为了新世界，学习理论，团结同志。</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * 邮件服务：配置 SMTP 时真实发信；否则走 console 模式（本地开发把验证码打印到控制台）。
 */
export function createMailer(config, logger = console) {
  let transporter = null;
  if (config.smtp.enabled) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }

  return {
    mode: transporter ? 'smtp' : 'console',
    async sendVerificationCode(email, code) {
      if (!transporter) {
        logger.log(`[赤光社][mail:console] 发送至 ${email} 的验证码：${code}（5 分钟内有效）`);
        return { mode: 'console' };
      }
      await transporter.sendMail({
        from: config.smtp.from,
        to: email,
        subject: '【赤光社】您的登录验证码',
        text: `您的赤光社登录验证码是 ${code}，5 分钟内有效。若非本人操作请忽略。`,
        html: buildHtml(code),
      });
      return { mode: 'smtp' };
    },
  };
}
