const {
    GOOGLE_CALENDAR_ENABLED,
    GOOGLE_CALENDAR_ID,
    GOOGLE_CALENDAR_TIMEZONE,
    GOOGLE_CALENDAR_EVENT_DURATION_MINUTES,
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_SERVICE_ACCOUNT_KEY
} = require('../config');

let googleModule = null;
let googleLoadError = null;
let calendarClientPromise = null;

function isCalendarEnabled() {
    return GOOGLE_CALENDAR_ENABLED;
}

function loadGoogleModule() {
    if (googleModule || googleLoadError) {
        return googleModule;
    }

    try {
        const { google } = require('googleapis');
        googleModule = google;
        return googleModule;
    } catch (error) {
        googleLoadError = error;
        console.warn(
            '[calendar] googleapis package not available, skipping calendar integration.',
            error.message
        );
        return null;
    }
}

function getEventDurationMinutes() {
    return Math.max(GOOGLE_CALENDAR_EVENT_DURATION_MINUTES || 0, 30);
}

async function getCalendarClient() {
    if (!isCalendarEnabled()) {
        return null;
    }

    if (!calendarClientPromise) {
        calendarClientPromise = (async () => {
            const google = loadGoogleModule();
            if (!google) {
                return null;
            }

            try {
                const auth = new google.auth.JWT({
                    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
                    key: GOOGLE_SERVICE_ACCOUNT_KEY,
                    scopes: ['https://www.googleapis.com/auth/calendar']
                });
                await auth.authorize();
                return google.calendar({ version: 'v3', auth });
            } catch (error) {
                console.error('[calendar] failed to initialize google calendar client', error);
                throw error;
            }
        })();
    }

    return calendarClientPromise;
}

function parseDateParts(isoDate) {
    const [year, month, day] = isoDate.split('-').map((part) => Number.parseInt(part, 10));
    return { year, month, day };
}

function parseTimeParts(time) {
    const [hours, minutes] = time.split(':').map((part) => Number.parseInt(part, 10));
    return { hours, minutes };
}

function buildDateTime(dateIso, time, offsetMinutes = 0) {
    const { year, month, day } = parseDateParts(dateIso);
    const { hours, minutes } = parseTimeParts(time);
    const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
    if (offsetMinutes) {
        date.setUTCMinutes(date.getUTCMinutes() + offsetMinutes);
    }
    return date.toISOString();
}

function buildEventPayload(booking) {
    const eventTime = (booking.event_time || '').trim();
    const summary = `[${booking.service_key}] ${booking.client_name} @ ${eventTime || 'TBA'}`;
    const descriptionLines = [
        `Client: ${booking.client_name}`,
        `Email: ${booking.client_email}`,
        `Telefon: ${booking.client_phone}`,
        `Pachet: ${booking.package_name || booking.package_id}`,
        `Eveniment: ${booking.event_type || '-'}`,
        `Nr. invitati: ${booking.guest_count ?? '-'}`,
        `Locatie: ${booking.event_location}`,
        booking.extra_notes ? `Detalii: ${booking.extra_notes}` : null
    ].filter(Boolean);

    const durationMinutes = getEventDurationMinutes();

    const startDateTimeIso = buildDateTime(booking.event_date, eventTime);
    const endDateTimeIso = buildDateTime(booking.event_date, eventTime, durationMinutes);

    return {
        calendarId: GOOGLE_CALENDAR_ID,
        requestBody: {
            summary,
            description: descriptionLines.join('\n'),
            start: {
                dateTime: startDateTimeIso,
                timeZone: GOOGLE_CALENDAR_TIMEZONE
            },
            end: {
                dateTime: endDateTimeIso,
                timeZone: GOOGLE_CALENDAR_TIMEZONE
            },
            location: booking.event_location,
            extendedProperties: {
                private: {
                    bookingId: booking.id?.toString() || '',
                    serviceKey: booking.service_key,
                    confirmationToken: booking.confirmation_token || ''
                }
            }
        }
    };
}

async function createCalendarEventForBooking(booking) {
    if (!isCalendarEnabled()) {
        return null;
    }

    const eventTime = (booking.event_time || '').trim();
    if (!booking.event_date || !eventTime) {
        console.warn('[calendar] booking missing event date/time, skipping calendar event');
        return null;
    }

    try {
        const calendar = await getCalendarClient();
        if (!calendar) {
            return null;
        }

        const eventPayload = buildEventPayload({
            ...booking,
            event_time: eventTime
        });
        const { data } = await calendar.events.insert(eventPayload);
        console.info('[calendar] created event', data.id);
        return data.id || null;
    } catch (error) {
        console.error('[calendar] failed to create event', error);
        return null;
    }
}

module.exports = {
    isCalendarEnabled,
    createCalendarEventForBooking
};
