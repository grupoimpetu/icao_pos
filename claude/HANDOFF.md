# ICAO POS — HANDOFF

**Actualizado: 22-ago-2026** · Plan de 8 días **COMPLETO**

**Alcance original:** Notion → `HANDOFF_POS_ICAO_v1`
https://app.notion.com/p/grupoimpetu/HANDOFF_POS_ICAO_v1-3c06bd0cd3df80d3858ecf9b5a7933af

**LEER SIEMPRE AL RETOMAR:** este doc + `claude/CONTEXTO_OWNER.md`
(Choco NO es programador — yo hago todo el trabajo técnico).
Otros: `TASA_BCV.md`, `DIA2_LOG.md`, `DIA3_VENTA.md`, `DIA7_CIERRE_DASHBOARD.md`,
`CLIENTES_IMPETU.md`, `DECISIONES_VENTA.md`.

---

## 🟢 EN PRODUCCIÓN — https://pos.icaobuencafe.com · **$0/mes**

| Pieza | Estado |
|---|---|
| Supabase `icao-pos` (`doavqlhgunezlbsamudw`) | ✅ |
| GitHub `grupoimpetu/icao_pos` (privado) | ✅ deploy automático |
| Vercel `impetu2/icao-pos` | ✅ conectado a GitHub |
| **Dominio `pos.icaobuencafe.com`** | ✅ SSL emitido, Valid Configuration |

`icao-pos.vercel.app` sigue funcionando (ambas apuntan a Production).
**Al equipo hay que darle el dominio nuevo**, no la URL de Vercel.

**PIN:** Admin `1402` · Supervisor `2005` · Barista 1 `2026` · Barista 2 `6202`

**Pantallas:** `/login` `/turno` `/venta` `/cuentas` `/cierre` `/dashboard`
`/productos` `/clientes` `/config` `/reportes`

**⚠️ El POS todavía NO opera en vivo.** Base limpia, listo para el piloto.

---

## Estado de los datos (base limpia — verificado 22-ago)

- 319 productos (312 activos + 7 BARRA solo-eventos)
- 460 clientes (458 reales + 2 genéricos) · 458 con teléfono
- **0 tickets · 0 ticket_items · 0 pagos** ✅
- **0 turnos · 0 cierres_caja** ✅ (limpiados por Choco; secuencias en 1)

Todo arranca desde cero. El primer reporte real va a estar limpio.

---

## 🆕 CAMBIOS DEL 22-AGO (26 commits)

### 1. El 5% de divisas dejó de ser un botón — ahora es una REGLA

**El hallazgo:** Choco pidió auditar "Ajuste comercial", que ya estaba en `admin`
(más cerrado de lo que creía). **El hueco real estaba en "Pago en divisas 5%":
lo autorizaba el barista, sin PIN, sobre ~50% de los tickets.** Un 5% sistemático
que cualquiera podía regalar a quien quisiera.

**Solución** (mismo patrón que el socio ICAO embebido en la ficha del cliente):
- `motivos_descuento` id=2 → `autoriza = 'auto'` ⇒ **desapareció del cobro**
- En el modal el barista declara la porción: **`Nada` / `Todo` / `Parte`**
- El 5% se calcula **solo sobre la porción declarada**, ya neta del descuento manual:
  ```
  baseDivisas = declarado   × (1 − pctManual/100)
  descDivisas = baseDivisas × (pctDivisas/100)
  total       = subtotal×(1−pctManual/100) − descDivisas
  ```
- **El ticket NO cierra si lo declarado ≠ lo pagado en divisa** (`divisasCuadran`)
- La pantalla muestra cuánto debe recibir en **ambas monedas: `€3.63 / $3.63`**

**Por qué la porción se declara y no se deduce de los pagos:** si el sistema
dedujera el descuento de los montos tecleados, cualquier error de tecleo movería
el descuento sin que nadie se entere. Declarando primero, el descuento queda fijo
y los pagos tienen que cuadrar contra él.

### 2. Permisos de descuento — estado final

| id | Motivo | % | Autoriza |
|---|---|---|---|
| 2 | Pago en divisas | 5.00 (editable en `/config`) | **auto** — no es botón |
| 4 | Ajuste comercial | libre (`pct = null`) | **supervisor** |
| 5 | Socio ICAO | 5.00 | auto — embebido en ficha |

- **Ajuste comercial ya NO exige nota.** Con PIN de supervisor basta (decisión de
  Choco). Se eliminó `if (m.autoriza === "admin") ... "exige nota"`, que además
  había quedado muerta al bajar el motivo a supervisor.
- **`acciones.ts` SÍ respeta `autoriza`**: jerarquía `auto:0 < barista:1 <
  supervisor:2 < admin:3`, valida con `verificar_pin` y **guarda el nombre de
  quien autorizó** dentro del motivo.
- Botones en el cobro: `Sin descuento` / `Solo socio ICAO` · `Ajuste comercial`

### 3. Efectivo EUR fuera del teclado de caja

En Venezuela **el efectivo que entra es USD, no EUR.** El ancla de precios sigue
en EUR porque es la mayor tasa BCV y da "paridad" con el dólar no oficial.
`tasa_eur_usd_cash = 1.00`.

`METODOS.efectivo_eur.enCaja = false` ⇒ sale del teclado, **sobrevive en el check
de la base** por histórico. Mismo criterio que "Bs Transferencia".

**Métodos en caja (7):** Efectivo Bs · Bs Pago Móvil · TDD · TDC · Efectivo USD ·
Zelle ($) · Binance (USDT)

> Verificado: el redondeo a $0.25 de `efectivo_usd` **no rompe** la validación de
> cuadre — `construirPago` guarda `monto_eur` exacto y solo redondea
> `monto_original` (el vuelto físico). Diseño correcto desde el Día 3.

### 4. `/config` — parámetros editables por admin

- Edita **% de divisas** y **tasa EUR/USD efectivo**
- Solo admin (supervisor y barista no entran ni por URL)
- Valida rangos **en el servidor** (0–100 % · tasa > 0)
- **Cada cambio va a `audit_log`** con valor antes, después, empleado y hora
- Muestra los últimos 8 cambios en pantalla
- Solo escribe si el valor cambió (no ensucia la auditoría)

**Decisión de arquitectura:** el % vive **solo** en `motivos_descuento` id=2.
NO se duplicó en `config`. Dos fuentes para el mismo número = descuadres que
nadie sabe explicar.

### 5. `/reportes` — rango, Z y CSV

**7 funciones nuevas** (todas `security definer` +
`set search_path = public, extensions`, zona `America/Caracas`):

`reporte_rango` · `reporte_metodos` · `reporte_por_dia` · `reporte_descuentos`
· `reporte_turnos` · `reporte_z` · `reporte_z_cabecera`

**Pantalla** (supervisor/admin):
- Rango con atajos `Hoy` / `7 días` / `30 días` + fechas manuales
- **KPIs con los dos descuentos SEPARADOS:**
  `Desc. comercial` (criterio humano) vs `Desc. divisas` (regla automática).
  **Ese split era el punto de todo el trabajo.** Si sube el comercial, alguien
  está decidiendo; si sube el de divisas, cambió el mix de pago. Problemas distintos.
- Bloques: por día · por método (total en su moneda real) · descuentos con
  ticket/cliente/motivo/autorizador · turnos del rango
- **Reporte Z** por turno: logotipo ICAO, esperado vs contado por concepto,
  diferencia verde/rojo, total del descuadre, notas obligatorias, firma del
  supervisor. Botón **Imprimir / PDF** con `print:hidden` en los controles.
- **CSV** por bloque: separador `;` + BOM UTF-8 (para Excel en español)
- Los bloques se renderizan aunque estén vacíos (si no, el botón CSV desaparecía
  y el usuario no sabía que existía)

### 6. Identidad ICAO

| Dónde | Qué |
|---|---|
| `/login` | Logotipo ICAO BUENCAFÉ (`next/image`, `priority`) |
| `/turno` · `/venta` | Isotipo (corazón) junto al nombre del empleado |
| Recibo | Logotipo arriba del ✓ — lo que ve el cliente por WhatsApp |
| Reporte Z | Logotipo en el encabezado impreso |
| Favicon / PWA | Isotipo como `icon`, `shortcut`, `apple-touch-icon` + `manifest.json` |

Archivos: `public/logo-icao.png` · `public/isotipo-icao.png`

**La paleta de Tailwind ya estaba alineada con la marca** desde el Día 1
(`cafe-800: #3B2314`, `acento: #C9852B`, fondo `#FAF6F1`). No hubo que tocar un color.

⚠️ El ícono PWA usa el isotipo tal cual. En iPad se ve bien. En Android los íconos
`maskable` se recortan en círculo y el corazón podría quedar apretado. Si pasa:
PNG de 512×512 con el corazón centrado y ~20% de margen.

### 7. Navegación táctil

Links de texto → **botones de 72px en grilla 2×**:
`Catálogo` · `Dashboard` · `Reportes` · `Clientes y socios` · `Parámetros`
(los dos últimos solo admin).

### 8. Fix: `motivoSocio` anclado por id

`motivos.find(m => m.autoriza === "auto")` agarraba **el primero**, y al pasar
divisas a `auto` había dos. Tomaba divisas (id 2) como si fuera socio (id 5).
Mismo 5% ⇒ invisible en pantalla, pero **etiquetaba mal el ticket** y eso envenena
los reportes. Ahora hay constantes explícitas:
`MOTIVO_SOCIO_ICAO = 5` · `MOTIVO_DIVISAS = 2`.

---

## Dominio — cómo quedó (22-ago)

**Vercel:** `pos.icaobuencafe.com` → Production, sin redirect.

**Spaceship** (`icaobuencafe.com`, nameservers `launch1/2.spaceship.net`):

| Host | Tipo | Valor | TTL |
|---|---|---|---|
| **pos** | **CNAME** | **`1ced88c63046f632.vercel-dns-017.com.`** | **30 min** |

Los 5 registros previos quedaron **intactos**: `@`/`ftp`/`webdisk` A →
`66.29.148.121`, `www` CNAME → `icaobuencafe.com`, `@` TXT SPF.
La web y el correo no se tocaron. Propagó en menos de un minuto.

> Vercel avisa que los legacy `cname.vercel-dns.com` y `76.76.21.21` siguen
> funcionando, pero se usó el valor nuevo que él mismo recomienda.

---

## Cambios de esquema (22-ago)

```sql
alter table tickets add column divisas_declarado_eur  numeric(12,2) not null default 0;
alter table tickets add column descuento_divisas_eur  numeric(12,2) not null default 0;
```

**Nombres reales que hay que respetar** (me equivoqué dos veces con esto):
- `turnos`: `empleado_id`, `apertura_ts`, `cierre_ts` — **NO** `abierto_por`/`abierto_ts`
- `Sesion`: `empleadoId` — **NO** `id`
- `audit_log`: `tabla, registro_id, accion, valores_antes, valores_despues, empleado_id, ts`
- `construirPago()` → `{ metodo, moneda, monto_original, tasa_aplicada, monto_eur }`
- `supabaseAdmin` es **const**, se invoca `supabaseAdmin()`

**Regla:** consultar `information_schema.columns` ANTES de escribir cada función,
no después de que falle.

---

## Reglas de negocio (estado final)

### Descuentos
- **Ser cliente de IMPETU no da descuento.**
- **Socio ICAO = 5%**, solo Choco y su socia. Embebido en la ficha, no es botón.
- **Pago en divisas = 5%**, regla automática sobre la porción declarada. No es botón.
- **Ajuste comercial**: % libre, PIN de supervisor, sin nota.
- **NO existe** cortesía 100% para staff.

### Zona de residencia (requisito legal)
`clientes.zona`, alta rápida en caja + `/clientes`. Función `actualizar_zona(id, zona)`.

### Métodos de pago
7 en caja. Zelle/Binance/TDD/TDC/Pago Móvil: **referencia obligatoria**.
Solo `efectivo_usd` redondea a $0.25. Pago mixto multimoneda funciona.

---

## Invariantes que el código hace cumplir

- Cliente **obligatorio** en cada ticket (NOT NULL)
- Precios y tasas **se releen del servidor** al cobrar
- Descuentos solo desde `motivos_descuento`, con PIN si el rol no alcanza, y se
  registra quién autorizó
- **Lo declarado en divisas debe coincidir con lo pagado en divisas**
- Un solo turno abierto a la vez (índice único parcial)
- No se cierra turno con tickets abiertos
- `tickets`/`pagos`/`audit_log` **append-only** (4 triggers activos)
- Descuadre en cierre ⇒ **nota obligatoria** (validado en la base)
- `construirPago()` evita la deriva de redondeo Bs→EUR

---

## ⚙️ Cómo subir código (MÉTODO PROBADO — 26 commits sin fricción)

**Todo desde el navegador en github.com. Choco no toca nada.**

1. **Leer:** `fetch('/grupoimpetu/icao_pos/raw/refs/heads/main/<ruta>', {cache:'no-store'})`
2. **Editar:** `String.replace()` con ancla exacta. **Verificar que matchee UNA
   sola vez ANTES de reemplazar.**
3. **Guardar en `localStorage`** (sobrevive la navegación; `window` no)
4. **Comitear:** `/edit/main/<ruta>` (o `/new/main` para archivo nuevo)

```js
// nombre de archivo nuevo: el placeholder es "Name your file..."
const n=[...document.querySelectorAll('input')].find(e=>/Name your file/i.test(e.placeholder||''));
Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n, path);
n.dispatchEvent(new Event('input',{bubbles:true}));

const cm=document.querySelector('.cm-content[contenteditable="true"]');
cm.focus(); document.getSelection().selectAllChildren(cm);
document.execCommand('insertText', false, localStorage.getItem(key));

// botones POR TEXTO, nunca por coordenadas
[...document.querySelectorAll('button')].find(b=>/^Commit changes(\.\.\.|…)$/.test(b.textContent.trim())).click();
// el campo del mensaje puede ser input O textarea — detectar el tagName
```

5. **Verificar SIEMPRE** con `fetch` del raw comparando **longitudes**.

### Trampas confirmadas
- ⚠️ **El filtro de seguridad bloquea devolver contenido de archivos.** Se puede
  leer por `grep`/regex devolviendo booleanos o fragmentos cortos, pero no volcar
  un archivo entero. Para archivos grandes: **pedirle el archivo a Choco** (pegar
  en el chat) o editar a ciegas con anclas verificadas.
- ⚠️ El input de nombre **NO** es `input[name="filename"]`, es el del placeholder.
- ⚠️ `computer:type` **falla si la página se reflowea** — escribir directo al input
  con el setter nativo + `dispatchEvent`.
- ⚠️ `cm.innerText` NO sirve para verificar (CodeMirror virtualiza).
- ⚠️ **NO** usar gzip+base64+`DecompressionStream` en github.com.
- ⚠️ **La lista de deployments de Vercel se queda pegada en "Building".** Abrir el
  deployment concreto, o verificar la URL de producción directamente.
- ⚠️ Commits parciales rompen el build (un archivo referencia otro que aún no
  subió). Es esperado y se autocorrige con el último commit.
- ⚠️ `fetch` a otro origen desde github.com falla por CORS. Navegar a la URL.

### Trampas de Postgres
- `CREATE OR REPLACE` no puede cambiar tipo de retorno ni firma → `DROP FUNCTION` primero.
- Toda función `security definer` necesita `set search_path = public, extensions`.
- ⚠️ **El SQL Editor dice "Success. No rows returned" aunque NO haya creado nada.**
  Pasó otra vez el 22-ago: 3 funciones fallaron en silencio por nombres de columna
  inventados. **Verificar SIEMPRE con un `select` después de cada carga.**

---

## Pendientes

### Antes de operar
- ⬜ **Darle al equipo el dominio nuevo** `pos.icaobuencafe.com` y poner el acceso
  directo en la tablet (Añadir a pantalla de inicio → ya sale el ícono ICAO).
- ⬜ **Piloto de 5 días en paralelo con el método manual, cuadrando ambos.**
  Es el paso que convierte esto de "software que funciona" a "sistema en el que
  confías para cerrar caja un sábado lleno". Ningún test sustituye una jornada
  real con dos baristas, cola, y alguien pagando mitad en Bs y mitad en dólares.

### Media
- ⬜ **Errores de sesión en lenguaje humano.** `/reportes` carga con sesión inválida
  y muestra el error crudo `JWT issued at future` en vez de redirigir a `/login`.
  Con PIN válido funciona bien, pero un barista con la tablet no sabría qué hacer
  con ese mensaje. Aplica a `/reportes` y `/config`. Posible desfase de reloj
  Vercel↔Supabase, revisar.
- ⬜ Verificar el CSV en el Excel de Choco (separador `;` según config regional).
- ⬜ Confirmar mecánica de `factura_host_ref` con el contador.

### Después
- ⬜ v2: inventario · v2.5: sync offline · v3: Wallet ICAO

---

## Probado por Choco el 22-ago ✅

- 5% divisas: `Todo` / `Nada` / declarar-y-pagar-en-Bs (rechaza) — **los 3 pasaron**
- `/config`: edición del % con registro en auditoría
- `/reportes` + Reporte Z + Imprimir/PDF
- Limpieza de tickets, turnos y cierres (`0` en todas)
- `pos.icaobuencafe.com` con SSL y logotipo en el login

**Sin probar todavía:** CSV en Excel · reportes con datos reales de venta.
