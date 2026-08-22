# Bitácora técnica — bugs y aprendizajes vigentes

Consolida `DIA2_LOG`, `DIA3_VENTA` y `DIA7_CIERRE_DASHBOARD`.
Solo lo que sigue siendo cierto. La cronología se descartó a propósito.

---

## 🐞 Bugs resueltos que NO deben repetirse

### 1. `search_path` de pgcrypto (Día 2)
**Síntoma:** el PIN correcto daba "PIN incorrecto" en producción, pero
`verificar_pin()` funcionaba perfecto desde el SQL Editor.

**Causa raíz:** Supabase instala **pgcrypto en el esquema `extensions`**. Desde el
SQL Editor el `search_path` lo incluye y `crypt()` resuelve; vía PostgREST **no**.

**Fix:** toda función `security definer` lleva
`set search_path = public, extensions` + `notify pgrst, 'reload schema';`

**Cómo se diagnosticó:** la tabla `intentos_pin` SÍ registraba los intentos desde
la IP de Vercel. O sea: la app conectaba bien, las llaves estaban bien, los
INSERT funcionaban. Solo fallaba la RPC. **Mirar qué sí funciona acota más rápido
que mirar qué falla.**

### 2. Errores de Supabase silenciados (Día 2 → pagado Día 3)
`app/login/page.tsx` hacía `const { data } = await db.rpc(...)` e **ignoraba
`error`**. Un fallo de base se veía idéntico a un PIN equivocado, y el
diagnóstico tomó 4 intentos.

**Regla:** toda llamada a Supabase captura `error` y lo distingue del caso de
negocio. Un POS que esconde sus errores es imposible de soportar en caja un
sábado lleno.

### 3. Layout de 3521px en pantalla de 1470px (Día 3)
El panel del ticket quedaba fuera de pantalla: en tablet el barista no habría
podido cobrar.

**Causa:** un hijo `flex` no se encoge por debajo del ancho de su contenido. La
fila de categorías (con `overflow-x-auto`) empujaba toda la sección.

**Fix:** `min-w-0` en la sección, `max-w-full` en la fila de chips,
`lg:shrink-0` en el aside, `overflow-x-hidden` en el main.

**Regla:** todo contenedor `flex-1` con hijos que hacen scroll horizontal
necesita `min-w-0`. **Verificar con `document.body.scrollWidth === window.innerWidth`.**

### 4. "Efectivo Bs" faltaba como método (Día 7)
Choco confirmó que SÍ reciben billetes de bolívares. Sin ese método el fondo en
Bs solo podía bajar (el vuelto sale de ahí) y nunca subir → **el cierre en
bolívares jamás habría cuadrado.**

**Lección:** preguntarle a Choco por el flujo físico del dinero antes de diseñar
el arqueo. Él ve lo que el modelo no.

---

## Decisiones de diseño que siguen vigentes

### Pantalla de venta
- **El grid abre en `CAFÉ CALIENTE`, `NEVERA` al lado.** Constante `PRIORIDAD`.
  Razón: el pedido más común es café solo y bebida de nevera (alumnas esperando
  clase). Todo lo demás va detrás de un toque de categoría.
- **Venta y cobro en UNA sola pantalla.** SAINT los separa; Choco lo quiere junto,
  pensando en el uso móvil en eventos.
- **Cuenta abierta existe pero es excepcional** — enlace pequeño con `confirm()`.
  > Razón operativa: cuando abrir cuenta cuesta lo mismo que cobrar, el personal
  > cobra menos y "después le paso la cuenta". A fin de mes falta plata que nadie
  > sabe explicar. **La fricción extra es intencional.**
- **Cliente obligatorio** (`tickets.cliente_id` NOT NULL a nivel de base). Un
  ticket huérfano es imposible, incluso desde el SQL editor.
- **Borrador en `localStorage` por turno.** Si se cae el navegador, el ticket vive.
  Al volver a `/venta` reaparece el borrador anterior — es intencional, pero hay
  que avisarle al equipo para que no lo confundan con un ticket ya cobrado.
  El botón "Vaciar ticket" lo descarta.

### Seguridad en `acciones.ts`
- **Los precios se releen de la base**, nunca se confía en los del navegador.
  Sin esto, cualquiera con la consola abierta se cobra un café a €0.01.
- **Las tasas salen del turno**, no del cliente.
- **Los descuentos solo existen si están en `motivos_descuento`**, con el % de la
  tabla. Los que exigen supervisor/admin piden PIN, se valida contra
  `verificar_pin` y se registra quién autorizó.
- **`construirPago()`** para los campos de cada pago (evita deriva de redondeo).
- El ticket no se cierra si `Σ pagos ≠ total` (tolerancia 0.01).

### Cierre de caja
Separa lo que se **cuenta** de lo que se **concilia**:

| Bloque | Conceptos | Qué hace el supervisor |
|---|---|---|
| **Efectivo** | Bs, USD | Cuenta el dinero físico |
| **Electrónico** | Pago Móvil, TDD, TDC, Zelle, Binance | Compara contra lote / estado de cuenta |

- Muestra **esperado vs declarado** y calcula sobrante/faltante en vivo
- **Descuadre ⇒ nota obligatoria.** Validado en `guardar_cierre()` (la base lanza
  excepción), no solo en la pantalla
- **Bloquea el cierre si hay cuentas abiertas**
- Un cierre por `(turno_id, concepto)`: reintentar corrige, no duplica

### Atribución por barista
Se cuenta por `ticket_items.agregado_por` (quien agregó los productos), **NO** por
quien abrió el turno. En una barra compartida son personas distintas.

### El KPI de disciplina
> El % de clientes genéricos es el termómetro: si un día tranquilo sale 70%,
> no había cola — alguien dejó de preguntar el nombre.

---

## Historia que ya NO aplica

- ~~Deploy arrastrando carpeta a Vercel~~ → GitHub conectado, deploy automático
- ~~PIN de fábrica 1234/2345/3456~~ → cambiados
- ~~Cliente IMPETU = 10% de descuento~~ → error corregido, no dan descuento
- ~~Personal ICAO con cortesía 100%~~ → eliminado
- ~~Clientes sin teléfono~~ → 458 de 460 tienen número en formato `wa.me`
- ~~gzip+base64 para subir código a GitHub~~ → dejó de funcionar, ver HANDOFF
