const express = require('express');
const cors = require('cors');

const { VALID_SERVICES, PAYMENT_LINK } = require('./config');
const { bookingSchema } = require('./validators');
const { insertBooking, getBookingByToken, confirmBookingByToken } = require('./db');
const { computeAvailability } = require('./services/availability');
const {
    sendAdminNewBookingEmail,
    sendClientPendingEmail,
    sendClientConfirmedEmail
} = require('./services/email');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function mapBookingRecord(record) {
    return {
        id: record.id,
        serviceKey: record.service_key,
        packageId: record.package_id,
        packageName: record.package_name,
        clientName: record.client_name,
        clientEmail: record.client_email,
        clientPhone: record.client_phone,
        eventType: record.event_type,
        guestCount: record.guest_count,
        eventLocation: record.event_location,
        extraNotes: record.extra_notes,
        eventDate: record.event_date,
        eventTime: record.event_time,
        createdAt: record.created_at,
        status: record.status,
        confirmedAt: record.confirmed_at
    };
}

async function sendNewBookingNotifications(bookingRecord) {
    const results = {
        admin: { success: false },
        clientPending: { success: false }
    };

    await Promise.all([
        (async () => {
            try {
                await sendAdminNewBookingEmail(bookingRecord);
                results.admin.success = true;
            } catch (error) {
                console.error('[email] failed to notify admin', error);
                results.admin.error = error.message;
            }
        })(),
        (async () => {
            try {
                await sendClientPendingEmail(bookingRecord);
                results.clientPending.success = true;
            } catch (error) {
                console.error('[email] failed to notify client (pending)', error);
                results.clientPending.error = error.message;
            }
        })()
    ]);

    return results;
}

function renderHtmlPage({ title, message, nextSteps }) {
    const stepsHtml = nextSteps
        ? `<p style="margin-top:16px;">${nextSteps}</p>`
        : '<p style="margin-top:16px;">Poti inchide aceasta fereastra.</p>';
    return `<!DOCTYPE html>
<html lang="ro">
<head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f6fb; color:#111; margin:0; padding:40px; }
        .card { max-width:520px; margin:0 auto; background:#fff; padding:32px; border-radius:16px; box-shadow:0 10px 30px rgba(17,17,17,0.08); }
        h1 { font-size:24px; margin-top:0; color:#2a2466; }
        p { line-height:1.6; margin-bottom:12px; }
        a.btn { display:inline-block; background:#7b57f6; color:#fff; text-decoration:none; padding:12px 20px; border-radius:8px; margin-top:12px; }
        small { color:#555; }
    </style>
</head>
<body>
    <div class="card">
        <h1>${title}</h1>
        <p>${message}</p>
        ${stepsHtml}
        <small style="display:block;margin-top:24px;">Happyjoybooth Booking System</small>
    </div>
</body>
</html>`;
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/services', (req, res) => {
    res.json({
        services: VALID_SERVICES
    });
});

app.get('/api/availability', async (req, res) => {
    const service = (req.query.service || '').trim();

    if (!service) {
        return res.status(400).json({
            error: 'Parametrul "service" este obligatoriu.'
        });
    }

    if (!VALID_SERVICES.includes(service)) {
        return res.status(400).json({
            error: 'Serviciul selectat nu exista.'
        });
    }

    try {
        const availability = await computeAvailability(service);
        return res.json(availability);
    } catch (error) {
        console.error('[availability] failed to compute', error);
        return res.status(500).json({
            error: 'Nu am putut incarca disponibilitatea. Incearca din nou.'
        });
    }
});

app.post('/api/bookings', async (req, res) => {
    const parseResult = bookingSchema.safeParse(req.body);

    if (!parseResult.success) {
        const { fieldErrors, formErrors } = parseResult.error.flatten();
        return res.status(400).json({
            error: 'Datele trimise nu sunt valide.',
            details: fieldErrors,
            formErrors
        });
    }

    const bookingPayload = {
        ...parseResult.data,
        status: 'pending',
        confirmedAt: null
    };

    let bookingRecord;

    try {
        bookingRecord = await insertBooking(bookingPayload);
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
            const availability = await computeAvailability(bookingPayload.serviceKey);
            return res.status(409).json({
                error: 'Interval indisponibil.',
                message: 'Exista deja o rezervare pentru acest serviciu la data si ora selectate.',
                availability
            });
        }

        console.error('[bookings] failed to insert', error);
        return res.status(500).json({
            error: 'Nu am putut salva rezervarea. Te rugam sa incerci din nou.'
        });
    }

    const availability = await computeAvailability(bookingPayload.serviceKey);
    const notifications = await sendNewBookingNotifications(bookingRecord);

    return res.status(201).json({
        status: 'ok',
        booking: mapBookingRecord(bookingRecord),
        availability,
        notifications
    });
});

app.get('/api/bookings/confirm/:token', async (req, res) => {
    const { token } = req.params;
    if (!token) {
        return res
            .status(400)
            .send(
                renderHtmlPage({
                    title: 'Token lipsa',
                    message: 'Nu am putut procesa confirmarea pentru ca lipseste tokenul din link.',
                    nextSteps: 'Te rugam sa folosesti linkul corect din emailul de notificare.'
                })
            );
    }

    const booking = await getBookingByToken(token);

    if (!booking) {
        return res
            .status(404)
            .send(
                renderHtmlPage({
                    title: 'Link invalid',
                    message: 'Nu am gasit nicio rezervare asociata acestui link. Poate a fost deja procesata.',
                    nextSteps: 'Daca crezi ca este o eroare, contacteaza echipa tehnica.'
                })
            );
    }

    if (booking.status === 'confirmed') {
        return res
            .status(200)
            .send(
                renderHtmlPage({
                    title: 'Rezervarea este deja confirmata',
                    message: `Rezervarea pentru ${booking.client_name} era deja confirmata. Clientul a primit emailul cu plata la momentul confirmarii initiale.`,
                    nextSteps: `Daca clientul are nevoie din nou de link, il poti trimite manual: <a class="btn" href="${PAYMENT_LINK}">Plateste avansul</a>`
                })
            );
    }

    const updatedBooking = await confirmBookingByToken(token);

    if (!updatedBooking) {
        return res
            .status(409)
            .send(
                renderHtmlPage({
                    title: 'Nu am putut confirma',
                    message: 'Rezervarea nu a putut fi confirmata probabil pentru ca a fost procesata in paralel.',
                    nextSteps: 'Verifica baza de date sau contacteaza echipa tehnica.'
                })
            );
    }

    try {
        await sendClientConfirmedEmail(updatedBooking);
    } catch (error) {
        console.error('[email] failed to notify client (confirmed)', error);
        return res
            .status(500)
            .send(
                renderHtmlPage({
                    title: 'Rezervarea a fost confirmata, dar emailul nu a plecat',
                    message:
                        'Slotul a fost marcat ca confirmat, insa trimiterea emailului catre client a esuat. Verifica logurile serverului si incearca trimiterea manual.',
                    nextSteps: `Poti trimite clientului linkul de plata: <a class="btn" href="${PAYMENT_LINK}">Plateste avansul</a>`
                })
            );
    }

    return res
        .status(200)
        .send(
            renderHtmlPage({
                title: 'Rezervare confirmata',
                message: `Clientul a fost notificat si a primit linkul pentru plata avansului.`,
                nextSteps: `Link plata (pentru referinta): <a class="btn" href="${PAYMENT_LINK}">Plateste avansul</a>`
            })
        );
});

app.use((req, res) => {
    res.status(404).json({ error: 'Ruta nu a fost gasita.' });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
    console.error('[server] unexpected error', error);
    res.status(500).json({ error: 'A aparut o eroare neasteptata.' });
});

if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`API ready on port ${PORT}`);
    });
}

module.exports = app;
