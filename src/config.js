const path = require('path');
require('dotenv').config();

const BASE_TIME_SLOTS = Array.from({ length: 13 }, (_, index) => {
    const hour = index + 12;
    return hour === 24 ? '00:00' : `${String(hour).padStart(2, '0')}:00`;
});

const MIN_LEAD_DAYS = Number.parseInt(process.env.MIN_LEAD_DAYS ?? '3', 10);
const MAX_DAYS_AHEAD = Number.parseInt(process.env.MAX_DAYS_AHEAD ?? '365', 10);
const BLACKOUT_DAY_OFFSETS = (process.env.BLACKOUT_DAY_OFFSETS || '5,12,19,27,33')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((value) => !Number.isNaN(value));
const VALID_SERVICES = (process.env.VALID_SERVICES || 'photobooth,platform360,mirrorbooth,aibooth')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const DATABASE_CLIENT = (process.env.DATABASE_CLIENT || 'sqlite').toLowerCase();
const DATABASE_PATH = path.join(__dirname, '..', 'data', 'bookings.db');
const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL || '';
const DATABASE_SSL = process.env.DATABASE_SSL === 'true';

const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const CONFIRMATION_URL_BASE =
    (process.env.CONFIRMATION_URL_BASE || `${APP_BASE_URL}/api/bookings/confirm`).replace(/\/$/, '');
const PAYMENT_LINK = process.env.PAYMENT_LINK || 'https://happyjoybooth.ro/plata';
const EMAIL_TRANSPORT = (process.env.EMAIL_TRANSPORT || 'console').toLowerCase();
const EMAIL_FROM = process.env.EMAIL_FROM || 'Happyjoybooth <no-reply@happyjoybooth.local>';
const EMAIL_ADMIN = process.env.EMAIL_ADMIN || 'bizi.ighi@gmail.com';

const SMTP_HOST =
    process.env.EMAIL_SMTP_HOST ||
    process.env.SMTP_HOST ||
    '';
const SMTP_PORT = Number.parseInt(
    process.env.EMAIL_SMTP_PORT ||
        process.env.SMTP_PORT ||
        (SMTP_HOST ? '587' : '587'),
    10
);
const SMTP_SECURE_VALUE =
    process.env.EMAIL_SMTP_SECURE ??
    process.env.SMTP_SECURE ??
    (SMTP_PORT === 465 ? 'true' : 'false');
const SMTP_SECURE = String(SMTP_SECURE_VALUE).toLowerCase() === 'true';
const SMTP_USER = process.env.EMAIL_SMTP_USER || process.env.SMTP_USER;
const SMTP_PASS = process.env.EMAIL_SMTP_PASS || process.env.SMTP_PASS;
const SMTP_TLS_REJECT_UNAUTHORIZED_VALUE =
    process.env.EMAIL_SMTP_TLS_REJECT_UNAUTHORIZED ?? process.env.SMTP_TLS_REJECT_UNAUTHORIZED;
const SMTP_TLS =
    SMTP_TLS_REJECT_UNAUTHORIZED_VALUE !== undefined
        ? {
              rejectUnauthorized: String(SMTP_TLS_REJECT_UNAUTHORIZED_VALUE).toLowerCase() !== 'false'
          }
        : undefined;

const SMTP_CONFIG = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth:
        SMTP_USER && SMTP_PASS
            ? {
                  user: SMTP_USER,
                  pass: SMTP_PASS
              }
            : undefined,
    tls: SMTP_TLS
};

module.exports = {
    BASE_TIME_SLOTS,
    MIN_LEAD_DAYS,
    MAX_DAYS_AHEAD,
    BLACKOUT_DAY_OFFSETS,
    VALID_SERVICES,
    DATABASE_CLIENT,
    DATABASE_PATH,
    DATABASE_URL,
    DATABASE_SSL,
    APP_BASE_URL,
    CONFIRMATION_URL_BASE,
    PAYMENT_LINK,
    EMAIL_TRANSPORT,
    EMAIL_FROM,
    EMAIL_ADMIN,
    SMTP_CONFIG
};
