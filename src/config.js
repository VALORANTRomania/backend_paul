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
const DATABASE_URL = process.env.DATABASE_URL || '';
const DATABASE_SSL = process.env.DATABASE_SSL === 'true';

const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const CONFIRMATION_URL_BASE =
    (process.env.CONFIRMATION_URL_BASE || `${APP_BASE_URL}/api/bookings/confirm`).replace(/\/$/, '');
const PAYMENT_LINK = process.env.PAYMENT_LINK || 'https://happyjoybooth.ro/plata';
const EMAIL_TRANSPORT = (process.env.EMAIL_TRANSPORT || 'console').toLowerCase();
const EMAIL_FROM = process.env.EMAIL_FROM || 'Happyjoybooth <no-reply@happyjoybooth.local>';
const EMAIL_ADMIN = process.env.EMAIL_ADMIN || 'bizi.ighi@gmail.com';

const SMTP_CONFIG = {
    host: process.env.EMAIL_SMTP_HOST || '',
    port: Number.parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
    secure: process.env.EMAIL_SMTP_SECURE === 'true',
    auth:
        process.env.EMAIL_SMTP_USER && process.env.EMAIL_SMTP_PASS
            ? {
                  user: process.env.EMAIL_SMTP_USER,
                  pass: process.env.EMAIL_SMTP_PASS
              }
            : undefined
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
