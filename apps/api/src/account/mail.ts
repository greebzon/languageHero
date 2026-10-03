import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export type AccountMail = { email: string; code: string; challengeId: string; purpose: string };
/** The previous address learns that the account moved to another one. */
export type AccountNotice = { kind: 'email-changed'; email: string; newEmail: string };
export type Mailer = (mail: AccountMail | AccountNotice) => Promise<void>;
const isNotice = (mail: AccountMail | AccountNotice): mail is AccountNotice => 'kind' in mail;
/** «a***@example.com»: enough to recognise, not enough to learn the new address. */
export const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@');
  return `${name.slice(0, 1)}***@${domain}`;
};
export function createMailer(config: {
  mode: 'disabled' | 'smtp' | 'file';
  directory: string;
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from?: string;
}): Mailer {
  if (config.mode === 'file') {
    if (process.env.NODE_ENV === 'production')
      throw new Error('File mail is forbidden in production');
    return async (mail) => {
      await mkdir(config.directory, { recursive: true, mode: 0o700 });
      const name = isNotice(mail) ? `notice-${Date.now()}` : mail.challengeId;
      await writeFile(join(config.directory, `${name}.json`), JSON.stringify(mail), {
        mode: 0o600,
      });
    };
  }
  if (config.mode === 'disabled')
    return async () => {
      throw new Error('Mail is not configured');
    };
  if (!config.host || !config.from) throw new Error('SMTP_HOST and SMTP_FROM are required');
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  return async (mail) => {
    if (isNotice(mail)) {
      await transport.sendMail({
        from: config.from,
        to: mail.email,
        subject: 'ЛингвоГерой — почта аккаунта изменена',
        text: `Аккаунт ЛингвоГероя, привязанный к этому адресу, теперь использует почту ${maskEmail(mail.newEmail)}.\n\nЕсли это сделал ты или твои родители, ничего делать не нужно. Если нет — восстанови аккаунт резервным кодом и напиши нам.`,
      });
      return;
    }
    const { email, code } = mail;
    await transport.sendMail({
      from: config.from,
      to: email,
      subject: 'ЛингвоГерой — код подтверждения',
      text: `Твой код: ${code}\n\nКод действует 10 минут и подходит только для одного подтверждения. Если ты не запрашивал код, просто удали письмо.`,
    });
  };
}
