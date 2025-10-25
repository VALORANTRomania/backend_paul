const { BASE_TIME_SLOTS, MIN_LEAD_DAYS, MAX_DAYS_AHEAD } = require('../config');
const { listBookingsForService } = require('../db');

function addDays(baseDate, days) {
    const result = new Date(baseDate);
    result.setDate(result.getDate() + days);
    result.setHours(0, 0, 0, 0);
    return result;
}

function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function startOfMonth(date) {
    const result = new Date(date.getFullYear(), date.getMonth(), 1);
    result.setHours(0, 0, 0, 0);
    return result;
}

function formatMonth(date) {
    return toIsoDate(startOfMonth(date));
}

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

async function computeAvailability(serviceKey) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rangeStart = addDays(today, MIN_LEAD_DAYS);
    const rangeEnd = addDays(today, MAX_DAYS_AHEAD);
    const startIso = toIsoDate(rangeStart);
    const endIso = toIsoDate(rangeEnd);

    const bookings = await listBookingsForService(serviceKey, startIso, endIso);
    const bookingMap = new Map();
    bookings.forEach(({ eventDate, eventTime }) => {
        if (!bookingMap.has(eventDate)) {
            bookingMap.set(eventDate, new Set());
        }
        bookingMap.get(eventDate).add(eventTime);
    });

    const dates = [];
    const slotMap = {};

    for (let offset = MIN_LEAD_DAYS; offset <= MAX_DAYS_AHEAD; offset += 1) {
        const candidate = addDays(today, offset);
        const iso = toIsoDate(candidate);

        const bookedSlots = bookingMap.get(iso) || new Set();
        const availableSlots = BASE_TIME_SLOTS.filter((slot) => !bookedSlots.has(slot));

        if (!availableSlots.length) {
            continue;
        }

        dates.push({
            value: iso,
            isWeekend: isWeekend(candidate)
        });

        if (availableSlots.length !== BASE_TIME_SLOTS.length) {
            slotMap[iso] = availableSlots;
        }
    }

    const firstDate = dates[0]?.value || null;
    const lastDate = dates.length ? dates[dates.length - 1].value : null;
    const todayMonth = formatMonth(today);

    return {
        service: serviceKey,
        generatedAt: new Date().toISOString(),
        dates,
        slotMap,
        range: {
            min: firstDate ? formatMonth(new Date(firstDate)) : todayMonth,
            max: lastDate ? formatMonth(new Date(lastDate)) : todayMonth
        },
        initialMonth: firstDate ? formatMonth(new Date(firstDate)) : todayMonth,
        baseTimeSlots: BASE_TIME_SLOTS,
        leadInfo: {
            minLeadDays: MIN_LEAD_DAYS,
            maxDaysAhead: MAX_DAYS_AHEAD
        }
    };
}

module.exports = {
    computeAvailability
};
