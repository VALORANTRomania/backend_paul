const nodemailer = require('nodemailer');
const {
    EMAIL_TRANSPORT,
    EMAIL_FROM,
    EMAIL_ADMIN,
    SMTP_CONFIG,
    PAYMENT_LINK,
    CONFIRMATION_URL_BASE
} = require('../config');

let transporterPromise = null;

function resolveTransporter() {
    if (transporterPromise) {
        return transporterPromise;
    }

    transporterPromise = (async () => {
        if (EMAIL_TRANSPORT === 'console') {
            return nodemailer.createTransport({
                streamTransport: true,
                newline: 'unix',
                buffer: true
            });
        }

        if (process.env.EMAIL_SMTP_URL) {
            return nodemailer.createTransport(process.env.EMAIL_SMTP_URL);
        }

        if (SMTP_CONFIG.host) {
            return nodemailer.createTransport({
                ...SMTP_CONFIG
            });
        }

        console.warn(
            '[email] Falling back to console transport because no SMTP configuration was provided. Set EMAIL_TRANSPORT=console to silence this message.'
        );
        return nodemailer.createTransport({
            streamTransport: true,
            newline: 'unix',
            buffer: true
        });
    })();

    return transporterPromise;
}

async function sendMail({ to, subject, text, html, cc, bcc }) {
    const transporter = await resolveTransporter();
    const message = {
        from: EMAIL_FROM,
        to,
        subject,
        text,
        html,
        cc,
        bcc
    };

    const info = await transporter.sendMail(message);

    if (EMAIL_TRANSPORT === 'console' || info.message) {
        const output = info.message?.toString?.() || '';
        console.info('\n[Email preview]\n', output);
    }

    return info;
}

function formatDate(isoDate) {
    if (!isoDate) {
        return '-';
    }
    const formatter = new Intl.DateTimeFormat('ro-RO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    return formatter.format(new Date(isoDate));
}

function formatBookingDetails(booking) {
    return `
        <ul>
            <li><strong>Serviciu:</strong> ${booking.service_key}</li>
            <li><strong>Pachet:</strong> ${booking.package_name || booking.package_id}</li>
            <li><strong>Data:</strong> ${formatDate(booking.event_date)}</li>
            <li><strong>Interval:</strong> ${booking.event_time}</li>
            <li><strong>Client:</strong> ${booking.client_name} (${booking.client_email}, ${booking.client_phone})</li>
            <li><strong>Eveniment:</strong> ${booking.event_type || '-'}</li>
            <li><strong>Nr. invitati:</strong> ${booking.guest_count ?? '-'}</li>
            <li><strong>Locatie:</strong> ${booking.event_location}</li>
        </ul>
        ${
            booking.extra_notes
                ? `<p><strong>Detalii suplimentare:</strong> ${booking.extra_notes}</p>`
                : '<p><em>Nu exista detalii suplimentare.</em></p>'
        }
    `;
}

function buildConfirmUrl(token) {
    return `${CONFIRMATION_URL_BASE}/${token}`;
}

async function sendAdminNewBookingEmail(booking) {
    const confirmUrl = buildConfirmUrl(booking.confirmation_token);
    const subject = `[Rezervare noua] ${booking.client_name} - ${booking.event_date} ${booking.event_time}`;
    const html = `
        <p>Salut! Ai o noua cerere de rezervare.</p>
        ${formatBookingDetails(booking)}
        <p>
            <a href="${confirmUrl}">Confirma rezervarea</a> sau deschide linkul:<br>
            <code>${confirmUrl}</code>
        </p>
    `;
    const text = [
        'Salut! Ai o noua cerere de rezervare.',
        `Serviciu: ${booking.service_key}`,
        `Pachet: ${booking.package_name || booking.package_id}`,
        `Data: ${formatDate(booking.event_date)} ${booking.event_time}`,
        `Client: ${booking.client_name} (${booking.client_email}, ${booking.client_phone})`,
        `Eveniment: ${booking.event_type || '-'}`,
        `Nr. invitati: ${booking.guest_count ?? '-'}`,
        `Locatie: ${booking.event_location}`,
        `Detalii suplimentare: ${booking.extra_notes || '-'}`,
        '',
        `Confirma rezervarea: ${confirmUrl}`
    ].join('\n');

    return sendMail({
        to: EMAIL_ADMIN,
        subject,
        text,
        html
    });
}

async function sendClientPendingEmail(booking) {
    const subject = 'Cererea ta a ajuns la noi - Happyjoybooth';
    const html = `
        <p>Buna, ${booking.client_name.split(' ')[0] || 'prietene'}!</p>
        <p>Iti multumim ca ai ales Happyjoybooth. Cererea ta pentru <strong>${formatDate(
            booking.event_date
        )}</strong>, interval <strong>${booking.event_time}</strong>, a fost inregistrata.</p>
        <p>Echipa noastra verifica disponibilitatea completa si revine cu confirmarea in cel mult 12 ore.</p>
        <p>Daca ai intrebari urgente, ne poti scrie pe <a href="mailto:hello@happyjoybooth.ro">hello@happyjoybooth.ro</a> sau suna la <a href="tel:+40733456789">+40 733 456 789</a>.</p>
        <p>Cu energie,<br>Echipa Happyjoybooth</p>
    `;
    const text = [
        `Buna, ${booking.client_name}!`,
        'Iti multumim ca ai ales Happyjoybooth.',
        `Cererea ta pentru ${formatDate(booking.event_date)}, interval ${booking.event_time}, a fost inregistrata.`,
        'Echipa noastra verifica disponibilitatea completa si revine cu confirmarea in cel mult 12 ore.',
        'Intrebari? hello@happyjoybooth.ro sau +40 733 456 789.',
        '',
        'Cu energie,',
        'Echipa Happyjoybooth'
    ].join('\n');

    return sendMail({
        to: booking.client_email,
        subject,
        text,
        html
    });
}

async function sendClientConfirmedEmail(booking) {
    const subject = 'Rezervarea ta a fost confirmata - Happyjoybooth';
    const html = `
        <p>Buna, ${booking.client_name.split(' ')[0] || 'prietene'}!</p>
        <p>Ne bucuram sa iti confirmam ca rezervarea pentru <strong>${formatDate(
            booking.event_date
        )}</strong>, interval <strong>${booking.event_time}</strong>, este blocata pentru tine.</p>
        <p>Pentru a securiza data, te rugam sa accesezi linkul de plata a avansului:</p>
        <p><a href="${PAYMENT_LINK}">Plateste avansul Happyjoybooth</a></p>
        <p>Daca ai nevoie de ajutor, raspunde direct la acest email sau contacteaza-ne la <a href="tel:+40733456789">+40 733 456 789</a>.</p>
        <p>Multumim si abia asteptam sa cream amintiri faine impreuna!<br>Echipa Happyjoybooth</p>
    `;
    const text = [
        `Buna, ${booking.client_name}!`,
        'Rezervarea ta a fost confirmata.',
        `Data: ${formatDate(booking.event_date)} | Interval: ${booking.event_time}`,
        `Plateste avansul: ${PAYMENT_LINK}`,
        'Ai intrebari? Raspunde la acest email sau suna la +40 733 456 789.',
        '',
        'Echipa Happyjoybooth'
    ].join('\n');

    return sendMail({
        to: booking.client_email,
        subject,
        text,
        html,
        cc: EMAIL_ADMIN
    });
}

module.exports = {
    sendAdminNewBookingEmail,
    sendClientPendingEmail,
    sendClientConfirmedEmail,
    buildConfirmUrl
};
