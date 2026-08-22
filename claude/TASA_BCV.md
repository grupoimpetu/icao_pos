# Tasa BCV — fuente confirmada

## La fuente
```
GET https://ve.dolarapi.com/v1/euros
```
Devuelve dos objetos: `fuente: "oficial"` y `fuente: "paralelo"`.

**Usar siempre `fuente: "oficial"`** — esa es la del BCV. El paralelo se guarda
solo como referencia informativa; **jamás se cobra con él**.

El endpoint hermano es `https://ve.dolarapi.com/v1/dolares` (USD oficial BCV).
`/v1/monedas` NO existe — devuelve error.

## Por qué esta y no otra
Es exactamente la que ya usa el plugin **"TIP — EUR→VES Anchor Pricing"** en el
WooCommerce de Choco (`tiptickera.com`), que muestra "Fuente: DolarApi BCV (cron)".

**Consecuencia operativa: el POS y la tienda web cotizan igual.** Si alguna vez
difieren, es un bug, no una diferencia de criterio.

## Dato de arquitectura importante
El plugin de WooCommerce **ya opera con anchor pricing en EUR** y recalcula VES
automáticamente. Es la misma decisión del HANDOFF para el POS. No es teoría:
Choco ya la tiene corriendo en producción y funciona.

## Por qué el ancla es EUR y no USD
El EUR es la **mayor tasa del BCV**, y eso permite "paridad" práctica con el
dólar no oficial del mercado local. Es una decisión de pricing, no técnica.

**Pero el efectivo que entra en caja es USD, no EUR.** Se tratan 1:1
(`tasa_eur_usd_cash = 1.00`, editable en `/config`). Por eso "Efectivo EUR"
salió del teclado de caja — nunca entran billetes de euro.

## Implementado en `lib/tasa.ts`
- Un solo fetch, timeout 8s, sin cache
- Valida rango 1 – 1.000.000 (si la API cambia de formato, no se opera)
- Devuelve `paraleloRef` y `fechaBcv` además de la tasa
- `tasaEsDeHoy()` compara contra la fecha en zona America/Caracas — el BCV
  publica con timestamp 00:00, así que hay que comparar **por día, no por hora**
- Si falla: captura manual del supervisor + badge amarillo `TASA MANUAL`

## Cómo se usa en el turno
La tasa se **congela al abrir el turno** (`turnos.tasa_eur_bs`). Todos los tickets
del turno usan esa. Si el BCV cambia a media jornada, un supervisor puede
re-snapshotearla y **queda en el log de auditoría**.

## NO tocar en el WP de Choco
Los botones "Actualizar tasa desde API ahora" y "Recalcular todos los productos"
afectan su tienda en producción. **Solo lectura ahí.**
