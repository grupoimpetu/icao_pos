# ICAO POS — v1

POS web para ICAO Buencafé, sede IMPETU Paseo El Hatillo.
Emite **comprobante interno de control**, no factura fiscal (la emite la empresa host —
ver `tickets.factura_host_ref`).

**Moneda de verdad: EUR.** Bs y USD son presentaciones. Nunca guardar un precio en Bs.

---

## Puesta en marcha (15 min)

### 1. Supabase
Crear proyecto en supabase.com y correr, **en orden**, desde el SQL Editor:

```
supabase/migrations/0001_schema.sql          esquema completo
supabase/migrations/0002_seed_productos.sql  319 productos en EUR
supabase/migrations/0003_auth_turnos.sql     PIN, turnos, auditoría
```

### 2. Cambiar los PIN de fábrica (obligatorio antes de operar)
La migración 0003 crea 3 empleados con PIN `1234` / `2345` / `3456`.

```sql
select id, nombre, rol from empleados;
select set_pin(1, '8391');   -- Admin
select set_pin(2, '4726');   -- Supervisor
select set_pin(3, '5052');   -- Barista
```

### 3. Variables de entorno
Copiar `.env.example` a `.env.local` y llenar con las claves de Supabase
(Settings → API). `CRON_SECRET` es un string largo cualquiera — firma la cookie
de sesión y protege `/api/tasa`.

### 4. Correr
```bash
npm install
npm run dev      # http://localhost:3000
```

### 5. Deploy
```bash
vercel --prod
```
Cargar las mismas variables en Vercel → Settings → Environment Variables.
Apuntar `pos.icaobuencafe.com` (CNAME en Spaceship) a Vercel.
El cron de `vercel.json` corre a las 6:00am VET (10:00 UTC).

---

## Qué hay construido

| Módulo | Estado |
|---|---|
| Auth por PIN de 4 dígitos + roles | ✅ Día 2 |
| Anti fuerza bruta (5 intentos / 10 min por IP) | ✅ Día 2 |
| Turnos con tasa BCV congelada | ✅ Día 2 |
| Captura automática de tasa + fallback manual | ✅ Día 2 |
| Re-snapshot de tasa (supervisor, auditado) | ✅ Día 2 |
| CRUD de productos completo | ✅ Día 2 |
| Auditoría automática del catálogo | ✅ Día 2 |
| Banner de sin conexión | ✅ Día 2 |
| Librería de multimoneda + redondeo | ✅ Día 2 |
| Pantalla de venta (grid + ticket) | Día 3–4 |
| Cobro multimoneda / pago mixto / descuentos | Día 5 |
| Cuentas abiertas + clientes IMPETU | Día 6 |
| Cierre de caja + dashboard | Día 7 |
| Ticket WhatsApp + deploy | Día 8 |

---

## Reglas que el código hace cumplir (no son convenciones)

- **Un solo turno abierto a la vez** — índice único parcial `un_turno_abierto`.
  Imposible abrir dos, incluso desde el SQL editor.
- **`pagos`, `tickets` y `audit_log` son append-only** — triggers que lanzan
  excepción ante DELETE/UPDATE. Se anula con contra-asiento (`anula_ticket_id`).
- **No se cierra turno con tickets abiertos** — `cerrar_turno()` falla.
  Es el descuadre número uno de cualquier POS.
- **El PIN nunca sale del servidor** — bcrypt vía `pgcrypto`, funciones
  `security definer` con `execute` revocado a `anon` y `authenticated`.
- **"Borrar" producto = desactivar** — el histórico de ventas apunta a ese `id`.
- **Sin tasa no se abre turno** — y si vino a mano, badge amarillo `TASA MANUAL`.

## Redondeo (`lib/money.ts`)

| Moneda | Regla |
|---|---|
| EUR | 2 decimales — es el libro contable |
| Bs | unidad entera hacia arriba (`ceil`) |
| USD cash | múltiplo de $0.25 hacia arriba (vuelto físico práctico) |

**Trampa importante:** convertir Bs → EUR de vuelta NO devuelve el mismo número
por el `ceil`. €3.82 → Bs 140 → €3.84. Dos céntimos por pago, ~€4/día de
descuadre fantasma. Por eso existe `construirPago()`: cuando el pago cubre un
monto EUR conocido, `monto_eur` **es** ese monto y no se recalcula. Usar siempre
`construirPago()`, nunca `aEur()` a secas.

## Tasa BCV
`lib/tasa.ts` intenta 3 espejos públicos en cascada. Si todos fallan, no adivina:
el supervisor la teclea al abrir turno y queda marcada `fuente = 'manual'`.
Nunca se opera con tasa vieja en silencio.
