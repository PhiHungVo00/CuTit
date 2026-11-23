import test from 'node:test';
import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
import { loadConfig } from '../dist/config.js';
import { createMailProvider } from '../dist/services/mail/MailProvider.js';
import { GmailSmtpMailProvider } from '../dist/services/mail/gmailSmtp.js';

test('createMailProvider: none (mặc định) => available() false, send ném provider_unavailable', async () => {
  const p = createMailProvider(loadConfig({ NODE_ENV: 'test' }));
  assert.equal(p.name, 'none');
  assert.equal(p.available(), false);
  await assert.rejects(() => p.send('a@example.com', 'Mã', 'Code', 'x'), (e) => e.code === 'provider_unavailable');
});

test('createMailProvider: gmail-smtp => GmailSmtpMailProvider, mặc định smtp.gmail.com:465 TLS', () => {
  const p = createMailProvider(
    loadConfig({ NODE_ENV: 'test', MAIL_PROVIDER: 'gmail-smtp', MAIL_SMTP_USER: 'app@gmail.com', MAIL_SMTP_PASS: 'abcd efgh ijkl mnop' })
  );
  assert.equal(p.name, 'gmail-smtp');
  assert.equal(p.available(), true);
  assert.deepEqual(p.transportInfo(), { host: 'smtp.gmail.com', port: 465, secure: true });
});

test('gmail-smtp: gửi tới máy chủ SMTP giả (không gửi thật) — đăng nhập, From, tiêu đề song ngữ, nội dung', async () => {
  const received = [];
  const server = new SMTPServer({
    secure: false,
    authOptional: false,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    onAuth(auth, _session, cb) {
      if (auth.username === 'app@gmail.com' && auth.password === 'app-pass') cb(null, { user: auth.username });
      else cb(new Error('bad auth'));
    },
    onData(stream, session, cb) {
      let raw = '';
      stream.on('data', (c) => (raw += c));
      stream.on('end', () => {
        received.push({ raw, from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map((r) => r.address) });
        cb();
      });
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.server.address();
  try {
    const p = new GmailSmtpMailProvider(
      { user: 'app@gmail.com', pass: 'app-pass', from: 'Bé Cu Tít <app@gmail.com>' },
      { host: '127.0.0.1', port, secure: false, ignoreTLS: true }
    );
    await p.send('nguoi.hoc@example.com', 'Mã của bạn', 'Your code', 'Mã: 123456 / Code: 123456');
    assert.equal(received.length, 1);
    assert.equal(received[0].from, 'app@gmail.com');
    assert.deepEqual(received[0].to, ['nguoi.hoc@example.com']);
    assert.match(received[0].raw, /Subject: /);
    assert.match(received[0].raw, /123456/);

    const wrong = new GmailSmtpMailProvider({ user: 'app@gmail.com', pass: 'sai', from: 'app@gmail.com' }, { host: '127.0.0.1', port, secure: false, ignoreTLS: true });
    await assert.rejects(() => wrong.send('nguoi.hoc@example.com', 'a', 'b', 'c'));
  } finally {
    await new Promise((r) => server.close(r));
  }
});
