# Happyjoybooth Booking API

Node.js + SQLite service that powers the booking form from `_public_html/contact.html`. It stores reservations, blocks time slots, and sends email notifications to the team and to clients.

## Requirements

- Node.js 18 or newer (tested with v22.20.0)
- npm (`npm.cmd` when using Windows PowerShell)

## Quick start

```bash
cd backend
npm install
npm run start
```

By default the server listens on port `4000`. Override with:

```bash
PORT=5000 npm run start
```

A SQLite database is created automatically at `backend/data/bookings.db`. The schema enforces a unique combination of `(service_key, event_date, event_time)` so two reservations for the same slot are rejected.

## Environment variables

| Name | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port for the API. |
| `APP_BASE_URL` | `http://localhost:4000` | Public base URL of the API (used to generate confirmation links). |
| `CONFIRMATION_URL_BASE` | `${APP_BASE_URL}/api/bookings/confirm` | Override if the confirmation route is reverse-proxied elsewhere. |
| `PAYMENT_LINK` | `https://happyjoybooth.ro/plata` | Link included in the confirmation email for clients. |
| `EMAIL_TRANSPORT` | `console` | `console` for preview output, `smtp` for real delivery. |
| `EMAIL_SMTP_URL` | - | Full SMTP connection string (overrides the granular SMTP settings). |
| `EMAIL_SMTP_HOST` | - | SMTP host name (used when `EMAIL_TRANSPORT=smtp`). |
| `EMAIL_SMTP_PORT` | `587` | SMTP port. |
| `EMAIL_SMTP_SECURE` | `false` | Set to `true` for SMTPS (port 465). |
| `EMAIL_SMTP_USER` / `EMAIL_SMTP_PASS` | - | SMTP credentials. |
| `EMAIL_FROM` | `Happyjoybooth <no-reply@happyjoybooth.local>` | Sender shown in emails. |
| `EMAIL_ADMIN` | `bizi.ighi@gmail.com` | Address that receives new booking alerts and the confirmation CC. |
| `MIN_LEAD_DAYS` | `3` | Minimum number of days ahead a booking can be made. |
| `MAX_DAYS_AHEAD` | `365` | How far in the future availability is generated. |
| `BLACKOUT_DAY_OFFSETS` | `5,12,19,27,33` | Comma-separated list of day offsets (starting today) to block by default. |
| `VALID_SERVICES` | `photobooth,platform360,mirrorbooth,aibooth` | Comma-separated service keys accepted by the API. |
| `DATABASE_CLIENT` | `sqlite` | `sqlite` for local dev (default) or `postgres` for hosted DBs (Railway, etc.). |
| `DATABASE_URL` | - | Required when `DATABASE_CLIENT=postgres`; use the Postgres connection string provided by the host. |
| `DATABASE_SSL` | `false` | Set to `true` if the Postgres provider requires SSL (Railway does). |

### Email workflow

1. Client submits the booking form.  
2. API stores the reservation with status `pending` and generates a unique confirmation token.  
3. Notification emails are sent:  
   - **Admin** (configured via `EMAIL_ADMIN`) receives reservation details and a confirmation link.  
   - **Client** gets a "thank you" email letting them know the team will confirm shortly.  
4. When the admin clicks the confirmation link (`/api/bookings/confirm/:token`), the booking status switches to `confirmed` and the client receives a new email containing the `PAYMENT_LINK`. The admin address is CC'd.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Simple status check. |
| `GET` | `/api/services` | List of allowed service keys. |
| `GET` | `/api/availability?service=<key>` | Available dates and time slots for the selected service. |
| `POST` | `/api/bookings` | Validates payload, stores the booking, and triggers notification emails. |
| `GET` | `/api/bookings/confirm/:token` | Marks a pending booking as confirmed and sends the payment email to the client. |

### Sample payload for `POST /api/bookings`

```json
{
  "serviceKey": "photobooth",
  "packageId": "photobooth-gold",
  "packageName": "Pachet Gold",
  "clientName": "Andrei Ionescu",
  "clientEmail": "andrei@example.com",
  "clientPhone": "0722123456",
  "eventType": "Nunta",
  "guestCount": 150,
  "eventLocation": "Biavati Events, Bucuresti",
  "extraNotes": "Preferam setup la ora 17:00.",
  "eventDate": "2025-11-21",
  "eventTime": "18:00"
}
```

Successful response (`201 Created`):

```json
{
  "status": "ok",
  "booking": { "...": "..." },
  "availability": { "...": "..." },
  "notifications": {
    "admin": { "success": true },
    "clientPending": { "success": true }
  }
}
```

If the slot is already taken (`409`), the response includes an updated `availability` object so the front-end can refresh the calendar.

## Front-end integration

The public site (`_public_html`) keeps calling the API as before. When the form submits successfully, the user sees the "cererea a fost trimisa" overlay while emails are sent in the background.

If the API runs on another origin (development proxy, VPS, etc.), define the base path before loading `booking.js`:

```html
<script>
  window.BOOKING_API_BASE_URL = 'https://api.example.com/api';
</script>
<script src="booking.js" defer></script>
```

## Local email testing

With `EMAIL_TRANSPORT=console` (default) the API does **not** send real emails. Instead, the full MIME message is printed to the server console so you can inspect the content while developing. Switch to SMTP settings only when deploying to production.

## Maintenance snippets

- Reset the booking table during development:

  ```bash
  node -e "const { db } = require('./src/db'); db.exec('DELETE FROM bookings; VACUUM;');"
  ```

- Preview the number of occupied slots per service:

  ```bash
  node -e "const { db } = require('./src/db'); console.log(db.prepare('SELECT service_key, COUNT(*) AS total FROM bookings GROUP BY service_key').all());"
  ```

## Deployment notes

Ensure your hosting plan supports Node.js long-running processes (VPS, Cloud, or shared plans with Node manager). After uploading the `backend/` folder:

1. Install dependencies with `npm install` (or enable automatic install in the hosting panel).  
2. Set the environment variables (SMTP, payment link, etc.).  
3. Point the process manager to `src/server.js`.  
4. Expose `/api` through your reverse proxy so the static site can reach the API.  
5. Keep backups of `backend/data/bookings.db` or move to a managed SQL database when traffic grows.

### Railway specific notes

- Create a new Railway project and link your GitHub repository (or deploy via CLI).  
- Add a **PostgreSQL** database plugin; Railway exposes `DATABASE_URL` and requires SSL.  
- In the service settings set:
  - `DATABASE_CLIENT=postgres`
  - `DATABASE_URL=<value from Railway>`
  - `DATABASE_SSL=true`
  - plus the email/payment variables from the table above.
- Build command: `cd backend && npm install`  
- Start command: `cd backend && npm run start`  
- After deploy, copy the public URL (e.g. `https://happyjoy-api.up.railway.app`) and point the front-end to `${URL}/api` by updating `window.BOOKING_API_BASE_URL`.  
- Railway free tier sleeps after inactivity; the first request may take a few seconds to warm up.
