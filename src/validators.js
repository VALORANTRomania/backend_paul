const { z } = require('zod');
const { VALID_SERVICES, BASE_TIME_SLOTS } = require('./config');

const phoneRegex = /^(?:\+?4?0)?7\d{8}$/;

const bookingSchema = z
    .object({
        serviceKey: z.enum(VALID_SERVICES, {
            errorMap: () => ({ message: 'Serviciul selectat nu este valid.' })
        }),
        packageId: z
            .string({ required_error: 'Pachetul este obligatoriu.' })
            .trim()
            .min(1, 'Pachetul este obligatoriu.'),
        packageName: z
            .string()
            .trim()
            .min(1)
            .max(120)
            .optional(),
        clientName: z
            .string({ required_error: 'Numele este obligatoriu.' })
            .trim()
            .min(3, 'Te rugam sa completezi numele complet.'),
        clientEmail: z
            .string({ required_error: 'Emailul este obligatoriu.' })
            .trim()
            .email('Te rugam sa introduci o adresa de email valida.'),
        clientPhone: z
            .string({ required_error: 'Telefonul este obligatoriu.' })
            .trim()
            .regex(phoneRegex, 'Format telefon invalid.'),
        eventType: z
            .string({ required_error: 'Tipul evenimentului este obligatoriu.' })
            .trim()
            .min(2, 'Selecteaza tipul evenimentului.'),
        guestCount: z
            .union([z.number(), z.string()])
            .transform((value) => Number(value))
            .refine((value) => Number.isInteger(value) && value >= 1 && value <= 500, {
                message: 'Numarul de invitati trebuie sa fie intre 1 si 500.'
            }),
        eventLocation: z
            .string({ required_error: 'Locatia este obligatorie.' })
            .trim()
            .min(3, 'Te rugam sa completezi locatia evenimentului.'),
        extraNotes: z
            .string()
            .trim()
            .max(1000, 'Detaliile suplimentare sunt prea lungi.')
            .optional()
            .or(z.literal('')),
        eventDate: z
            .string({ required_error: 'Data evenimentului este obligatorie.' })
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format data invalid (YYYY-MM-DD).'),
        eventTime: z
            .string({ required_error: 'Intervalul orar este obligatoriu.' })
            .refine((value) => BASE_TIME_SLOTS.includes(value), {
                message: 'Intervalul orar selectat nu este disponibil.'
            })
    })
    .transform((data) => ({
        ...data,
        extraNotes: data.extraNotes || ''
    }));

module.exports = {
    bookingSchema
};
