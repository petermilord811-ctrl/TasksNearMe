# Spanish glossary

For anyone writing Spanish copy (`messages/es/**`, the Spanish emails and texts in `messages/es/app/server.json`, `content/help/es`). It records the terms the copy already uses and the rules from the review in completion plan 5.20 (2026-11-14). Staff tools (`admin*`, `staff*`) are English only.

## Voice

- **US Spanish for neighbors in Austin**, not a literal translation. Short sentences, everyday words. "Laptop", "chat" and "app" are fine; so are "camioneta" and "rentado".
- **Tú, always.** Informal imperatives: *Revisa, Elige, Inténtalo de nuevo*. Never *usted*, *Ingrese* or *su cuenta*. *Ustedes* is only for addressing both people on a booking ("Conversen… entre ustedes").
- **Sentence case.** Capitalize only the first word and names ("Términos del servicio" is a document's name, so it keeps its capital).
- **Opening marks.** Every question starts with ¿ and every exclamation with ¡, also inside ICU branches.
- **Same arguments and tags as English.** `npm run i18n:check -- <namespace>` and `src/i18n/catalog.test.ts` check them. The e2e build throws on a bad key or argument (5.19).

## Terms

| English | Spanish | Notes |
|---|---|---|
| booking | **reserva** (f) | *reservar*: to book. Not *cita* or *contratación*. Keep *reservar* for bookings only: don't use it to mean "claim" (a gift-card spot is *asegurar*, *tomar*). |
| book again | volver a reservar | |
| task | **tarea** (f) | |
| helper | **ayudante** | Not *asistente* or *trabajador*. Founding helper: *ayudante fundador*. |
| client | **cliente** | |
| offer | **oferta** (f) | *contraoferta* for a counter-offer |
| request (a direct invite) | **solicitud** (f) | *solicitud de reserva* |
| proposal (rebook, regular visits) | **propuesta** (f) | |
| regular visits | **visitas regulares** | |
| terms of a booking (price, time, scope) | **condiciones** | *Condiciones actuales*, *Nuevas condiciones*, *condiciones de cancelación* |
| legal terms | **términos** | *Términos del servicio*, *términos de las recompensas* |
| scope | alcance | |
| service fee | **tarifa de servicio** | |
| late cancellation fee | **cargo por cancelación tardía** | a one-off charge, not a rate |
| charge / be charged | **cobrar** / se te cobra | a card: *se cobra a tu tarjeta* (not *tu tarjeta se cobra*) |
| refund | **reembolso**, reembolsar | |
| payout | **pago** | "Tu pago necesita atención"; the payout account is *cuenta de pagos* |
| earnings | **ganancias** | "lo que ganarás" in running text |
| tip | **propina** | |
| hold (on a card) | **retención** | the payment *queda retenido* |
| expense allowance | **asignación para gastos** | |
| review (noun) | **reseña** (f) | *revisar* is "to check" |
| report a problem | **reportar un problema** | a Checkr report is an *informe* |
| no-show | **ausencia** | *reportar una ausencia* |
| dispute | **disputa** | a bank dispute is *disputa del banco* |
| support | **soporte** | *Contactar a soporte*, *Soporte respondió* |
| sign in | **iniciar sesión** | *Inicia sesión o crea una cuenta* |
| email (noun) | **correo** | not *email* |
| text message | **mensaje de texto** | |
| neighborhood | **vecindario** | |
| home address | **domicilio** | *comprobante de domicilio*. Not *dirección de domicilio*. |
| ID check | **verificación de identidad** | the document is an *identificación* |
| background check | **verificación de antecedentes** | badge: *Antecedentes verificados* |
| gift card | **tarjeta de regalo** | *canjear* to redeem |
| badge | **insignia** (f) | |
| deadline | plazo, fecha límite | "Vence {deadline}" |
| skip (a visit) | **omitir** | |

## Statuses

Status labels agree with the noun they describe:

- **Booking** (la reserva): *Reservada*, *Reservada · se paga después*, *En curso*, *Completada*, *Cancelada*, *Problema reportado*.
- **Task** (la tarea): *Abierta*, *Reservada*, *Completada*, *Cancelada*, *Vencida*.
- **Offer** (la oferta) and **request** (la solicitud): *Reservada* (accepted), *Rechazada*, *Retirada*, *Vencida*.
- **Payment** (el pago): *Pagado*, *Reembolsado*, *Cancelado*.
- **Case** (el caso): *Abierto*, *Resuelto*, *Cerrado*.
- Expired is always *vencido / vencida* (never *expirado* or *caducado*). A finished step is *Listo*.

## Actions

First person for what a helper says or does on the day: *Voy en camino*, *Llegaré tarde*, *Ya llegué*, *Estoy aquí*, *No puedo entrar*. Infinitives for everything else: *Enviar oferta*, *Aprobar tarea*, *Reportar un problema*, *Volver a reservar*.

## Formats

Dates, times and money come from `@/shared/format` in the page's language ("sáb, 21 de nov", "10:30 a.m.", "$60.00"); write times in copy the same way ("8 a.m."). Don't write them into copy. Central time is *hora del centro*.
