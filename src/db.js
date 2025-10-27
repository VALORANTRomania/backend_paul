const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    DATABASE_CLIENT,
    DATABASE_PATH,
    DATABASE_URL,
    DATABASE_SSL
} = require('./config');

const isPostgres = DATABASE_CLIENT === 'postgres' && DATABASE_URL;

let sqliteDb = null;
let pool = null;
let initPromise = null;

if (isPostgres) {
    const { Pool } = require('pg');
    // Log masked URL for debugging
    const maskedUrl = DATABASE_URL.replace(/:([^:@]{4})[^:@]*@/, ':$1****@');
    console.log('Connecting to Postgres with URL:', maskedUrl);
    pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: DATABASE_SSL
            ? {
                  rejectUnauthorized: false
              }
            : undefined
    });
    initPromise = initializePostgres();
} else {
    const Database = require('better-sqlite3');
    const databaseDir = path.dirname(DATABASE_PATH);
    fs.mkdirSync(databaseDir, { recursive: true });
    sqliteDb = new Database(DATABASE_PATH);
    sqliteDb.pragma('journal_mode = WAL');
    initializeSqlite(sqliteDb);
    initPromise = Promise.resolve();
}

function parseExtras(rawExtras) {
    if (!rawExtras) {
        return [];
    }
    if (Array.isArray(rawExtras)) {
        return rawExtras;
    }
    try {
        const parsed = JSON.parse(rawExtras);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function normalizeBookingRow(row) {
    if (!row) {
        return null;
    }
    return {
        ...row,
        extras: parseExtras(row.extras)
    };
}

function initializeSqlite(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_key TEXT NOT NULL,
            package_id TEXT NOT NULL,
            package_name TEXT,
            client_name TEXT NOT NULL,
            client_email TEXT NOT NULL,
            client_phone TEXT NOT NULL,
            event_type TEXT,
            guest_count INTEGER,
            event_location TEXT NOT NULL,
            extra_notes TEXT,
            extras TEXT,
            event_date TEXT NOT NULL,
            event_time TEXT NOT NULL,
            created_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            confirmation_token TEXT NOT NULL DEFAULT '',
            confirmed_at TEXT,
            calendar_event_id TEXT
        );
    `);

    const existingColumns = new Set(
        db
            .prepare('PRAGMA table_info(bookings)')
            .all()
            .map((column) => column.name)
    );

    const requiredColumns = [
        { name: 'extras', sql: 'ALTER TABLE bookings ADD COLUMN extras TEXT' },
        { name: 'status', sql: "ALTER TABLE bookings ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'" },
        {
            name: 'confirmation_token',
            sql: "ALTER TABLE bookings ADD COLUMN confirmation_token TEXT NOT NULL DEFAULT ''"
        },
        { name: 'confirmed_at', sql: 'ALTER TABLE bookings ADD COLUMN confirmed_at TEXT' },
        { name: 'calendar_event_id', sql: 'ALTER TABLE bookings ADD COLUMN calendar_event_id TEXT' }
    ];

    requiredColumns.forEach((column) => {
        if (!existingColumns.has(column.name)) {
            db.exec(column.sql);
        }
    });

    db.exec(`
        UPDATE bookings
        SET confirmation_token = lower(hex(randomblob(16)))
        WHERE confirmation_token IS NULL OR confirmation_token = '';
    `);

    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_service_date_time
            ON bookings(service_key, event_date, event_time);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_token
            ON bookings(confirmation_token);
    `);
}

async function initializePostgres() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS bookings (
            id SERIAL PRIMARY KEY,
            service_key TEXT NOT NULL,
            package_id TEXT NOT NULL,
            package_name TEXT,
            client_name TEXT NOT NULL,
            client_email TEXT NOT NULL,
            client_phone TEXT NOT NULL,
            event_type TEXT,
            guest_count INTEGER,
            event_location TEXT NOT NULL,
            extra_notes TEXT,
            extras TEXT,
            event_date TEXT NOT NULL,
            event_time TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            confirmation_token TEXT NOT NULL DEFAULT '',
            confirmed_at TIMESTAMPTZ,
            calendar_event_id TEXT
        );
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_service_date_time
            ON bookings(service_key, event_date, event_time);
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_token
            ON bookings(confirmation_token);
    `);
    await pool.query(`
        ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS extras TEXT
    `);
}

function withTimestamps(payload) {
    return {
        ...payload,
        createdAt: payload.createdAt || new Date().toISOString(),
        confirmedAt: payload.confirmedAt || null
    };
}

async function insertBooking(payload) {
    await initPromise;
    const confirmationToken = payload.confirmationToken || crypto.randomUUID().replace(/-/g, '');
    const extrasArray = Array.isArray(payload.extras) ? payload.extras : [];
    const preparedPayload = withTimestamps({
        ...payload,
        extras: JSON.stringify(extrasArray),
        confirmationToken
    });

    if (isPostgres) {
        const result = await pool.query(
            `
                INSERT INTO bookings (
                    service_key,
                    package_id,
                    package_name,
                    client_name,
                    client_email,
                    client_phone,
                    event_type,
                    guest_count,
                    event_location,
                    extra_notes,
                    extras,
                    event_date,
                    event_time,
                    created_at,
                    status,
                    confirmation_token,
                    confirmed_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
                )
                RETURNING *
            `,
            [
                preparedPayload.serviceKey,
                preparedPayload.packageId,
                preparedPayload.packageName,
                preparedPayload.clientName,
                preparedPayload.clientEmail,
                preparedPayload.clientPhone,
                preparedPayload.eventType,
                preparedPayload.guestCount ?? null,
                preparedPayload.eventLocation,
                preparedPayload.extraNotes,
                preparedPayload.extras,
                preparedPayload.eventDate,
                preparedPayload.eventTime,
                preparedPayload.createdAt,
                preparedPayload.status || 'pending',
                preparedPayload.confirmationToken,
                preparedPayload.confirmedAt
            ]
        );
        return normalizeBookingRow(result.rows[0]);
    }

    const insertBookingStmt = sqliteDb.prepare(`
        INSERT INTO bookings (
            service_key,
            package_id,
            package_name,
            client_name,
            client_email,
            client_phone,
            event_type,
            guest_count,
            event_location,
            extra_notes,
            extras,
            event_date,
            event_time,
            created_at,
            status,
            confirmation_token,
            confirmed_at
        ) VALUES (
            @serviceKey,
            @packageId,
            @packageName,
            @clientName,
            @clientEmail,
            @clientPhone,
            @eventType,
            @guestCount,
            @eventLocation,
            @extraNotes,
            @extras,
            @eventDate,
            @eventTime,
            @createdAt,
            @status,
            @confirmationToken,
            @confirmedAt
        )
    `);
    const bookingByIdStmt = sqliteDb.prepare(`
        SELECT *
        FROM bookings
        WHERE id = ?
    `);
    const info = insertBookingStmt.run(preparedPayload);
    const row = bookingByIdStmt.get(info.lastInsertRowid);
    return normalizeBookingRow(row);
}

async function listBookingsForService(serviceKey, startDate, endDate) {
    await initPromise;
    if (isPostgres) {
        const result = await pool.query(
            `
                SELECT event_date AS "eventDate", event_time AS "eventTime"
                FROM bookings
                WHERE service_key = $1
                  AND event_date BETWEEN $2 AND $3
                ORDER BY event_date ASC, event_time ASC
            `,
            [serviceKey, startDate, endDate]
        );
        return result.rows;
    }

    const bookingsByServiceWithinRangeStmt = sqliteDb.prepare(`
        SELECT event_date AS eventDate, event_time AS eventTime
        FROM bookings
        WHERE service_key = @serviceKey
          AND event_date BETWEEN @startDate AND @endDate
        ORDER BY event_date ASC, event_time ASC
    `);
    return bookingsByServiceWithinRangeStmt.all({ serviceKey, startDate, endDate });
}

async function getBookingByToken(token) {
    await initPromise;
    if (isPostgres) {
        const result = await pool.query(
            `
                SELECT *
                FROM bookings
                WHERE confirmation_token = $1
            `,
            [token]
        );
        return normalizeBookingRow(result.rows[0]);
    }

    const bookingByTokenStmt = sqliteDb.prepare(`
        SELECT *
        FROM bookings
        WHERE confirmation_token = ?
    `);
    return normalizeBookingRow(bookingByTokenStmt.get(token));
}

async function confirmBookingByToken(token) {
    await initPromise;
    const confirmedAt = new Date().toISOString();
    if (isPostgres) {
        const result = await pool.query(
            `
                UPDATE bookings
                SET status = 'confirmed',
                    confirmed_at = $1
                WHERE confirmation_token = $2
                  AND status = 'pending'
                RETURNING *
            `,
            [confirmedAt, token]
        );
        return normalizeBookingRow(result.rows[0]);
    }

    const confirmBookingStmt = sqliteDb.prepare(`
        UPDATE bookings
        SET status = 'confirmed',
            confirmed_at = @confirmedAt
        WHERE confirmation_token = @token
          AND status = 'pending'
    `);
    const bookingByTokenStmt = sqliteDb.prepare(`
        SELECT *
        FROM bookings
        WHERE confirmation_token = ?
    `);
    const result = confirmBookingStmt.run({ confirmedAt, token });
    if (result.changes === 0) {
        return null;
    }
    return normalizeBookingRow(bookingByTokenStmt.get(token));
}

async function updateBookingCalendarEventId(bookingId, calendarEventId) {
    await initPromise;
    if (isPostgres) {
        const result = await pool.query(
            `
                UPDATE bookings
                SET calendar_event_id = $2
                WHERE id = $1
                RETURNING *
            `,
            [bookingId, calendarEventId]
        );
        return normalizeBookingRow(result.rows[0]);
    }

    const updateStmt = sqliteDb.prepare(
        `
            UPDATE bookings
            SET calendar_event_id = @calendarEventId
            WHERE id = @bookingId
        `
    );
    const selectStmt = sqliteDb.prepare(
        `
            SELECT *
            FROM bookings
            WHERE id = ?
        `
    );
    const result = updateStmt.run({ bookingId, calendarEventId });
    if (result.changes === 0) {
        return null;
    }
    return normalizeBookingRow(selectStmt.get(bookingId));
}

module.exports = {
    isPostgres,
    pool,
    insertBooking,
    listBookingsForService,
    getBookingByToken,
    confirmBookingByToken,
    updateBookingCalendarEventId
};
