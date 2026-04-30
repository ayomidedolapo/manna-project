import nodemailer from "nodemailer";

function mustEnv(name: string, v: string | undefined) {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function getTransport() {
  // Use SMTP (recommended). Example providers: Gmail SMTP, Mailgun SMTP, SendGrid SMTP etc.
  const host = mustEnv("SMTP_HOST", process.env.SMTP_HOST);
  const port = Number(mustEnv("SMTP_PORT", process.env.SMTP_PORT));
  const user = mustEnv("SMTP_USER", process.env.SMTP_USER);
  const pass = mustEnv("SMTP_PASS", process.env.SMTP_PASS);

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for 587
    auth: { user, pass },
  });
}
