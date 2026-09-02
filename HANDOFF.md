# ICAO POS — HANDOFF (fuente de verdad)

> **Última actualización:** 2-sep-2026
> **Estado:** ✅ EN PRODUCCIÓN REAL desde el 1-sep-2026
> **URL:** https://pos.icaobuencafe.com · **Repo:** `github.com/grupoimpetu/icao_pos` (privado)
> **Costo de infraestructura:** $0/mes

---

## 0. Cómo retomar una sesión (leer esto primero)

1. **Este archivo es la única fuente de verdad.** Los archivos del Project de Claude son snapshots
   y pueden estar desactualizados. Si algo contradice a este doc, gana este doc.
2. Al cerrar cada sesión con cambios relevantes → **actualizar este archivo y subirlo al repo.**
3. Docs complementarios en `claude/`: `CONTEXTO_OWNER.md`, `SUPABASE.md`, `TASA_BCV.md`,
   `CLIENTES_IMPETU.md`, `BITACORA.md`.

---

## 1. Contexto de negocio

ICAO Buencafé es un café dentro de **Paseo El Hatillo, Venezuela**, operando bajo el paraguas
legal/fiscal de otra empresa. Por eso se construyó un **POS propio** en vez de comprar software
comercial: propiedad total del dato y cero costo de infraestructura.

**Personas:** Choco (Daniel Solórzano, co-owner, ingeniero — no programador) + socia co-owner.
Equipo operativo: baristas y supervisores. Contador externo relevante para `factura_host_ref`.

---

## 2. Stack y operación

| Capa | Herramienta |
|---|---|
| App | Next.js + TypeScript + Tailwind |
| Datos / Auth | Supabase (proyecto `doavqlhgunezlbsamudw`) |
| Hosting | Vercel (free tier) |
| Repo | GitHub `grupoimpetu/icao_pos` (privado) |
| DNS | `pos.icaobuencafe.com` vía CNAME en Spaceship |

### Reglas de operación del código y la base

- **Desplegar código:** los archivos se suben por la UI de GitHub (**Add file → Upload files** a `main`).
  Vercel deploya solo. No se usa `git push` desde local.
- **Cambiar la base viva:** SQL pegado en el **SQL Editor de Supabase**. Las migraciones del repo
  **NO corren solas**. Todo script debe entregarse con `begin/commit` + query de verificación.
- **Choco no borra data.** Restricción dura. Claude escribe el SQL de borrado; Choco decide y ejecuta.
- **Verificación obligatoria:** después de cualquier cambio de archivo, hacer fetch del raw y
  comparar longitudes.

---

## 3. Pantallas en producción

`/login` · `/turno` · `/venta` · `/cuentas` · `/cierre` · `/dashboard` · `/productos` ·
`/clientes` · `/config` · `/reportes`

---

## 4. Modelo monetario (Venezuela)

- **Ancla de precios: EUR**, por ser la mayor tasa BCV — permite paridad práctica con el dólar
  no oficial.
- El **efectivo físico que entra es USD**, tratado 1:1. `tasa_eur_usd_cash = 1.00`, editable en `/config`.
- "Efectivo EUR" salió del teclado de caja pero **se conserva en la base** para registros históricos.
- El display muestra ambos: `€3.63 / $3.63`.

### Cobro por partes (divisa + Bs)

Lo declarado en el campo **"Parte"** es **lo que el cliente ENTREGA en divisa**, no el neto.
El descuento vive dentro del total y el resto se completa en Bs.

```
divisaObjetivo = min(baseDivisas, total)
```

El total no cambia; solo cambia el reparto divisa/Bs. Archivos:
`components/PantallaVenta.tsx`, `app/venta/acciones.ts`.

---

## 5. Descuentos y permisos

| Descuento | Mecanismo | Autoriza |
|---|---|---|
| **Divisa** | Regla automática, `motivos_descuento` id=2, `autoriza='auto'` | Sistema. **Hoy en 0%**, editable por Admin en `/config` |
| **Ajuste comercial** | Botón manual | Requiere **PIN de supervisor** |
| **Socio ICAO 5%** | Embebido en la ficha del cliente | Automático al identificar al cliente |

- El descuento de divisa aplica **solo sobre la porción declarada en divisa**. No es un botón del barista.
- **Arquitectura deliberada:** "Ajuste comercial" y el descuento de divisa aparecen como
  **líneas separadas** en `/reportes` — no colapsadas. Esa distinción importa para auditoría.
- Cada cambio de parámetro en `/config` queda registrado en `audit_log`.

---

## 6. Catálogo

**138 productos**, precio ancla EUR (= USD 1:1), **13 categorías** derivadas del nombre:

| Categoría | # | Categoría | # |
|---|---|---|---|
| CAFÉ CALIENTE | 22 | EXTRAS | 9 |
| BEBIDAS FRÍAS | 15 | SALADOS | 6 |
| CAO | 14 | SMOOTHIES | 6 |
| FRAPPÉS | 14 | SNACKS | 6 |
| TORTAS | 14 | CAFÉ FRÍO | 4 |
| COOKIES Y DULCES | 13 | PROTEÍNAS | 3 |
| YOGURT Y TÉ | 12 | | |

Fuente: `PRECIOS HATILLO`. Cargado con `arranque_limpio_catalogo.sql`.
`supabase/migrations/0002_seed_productos.sql` está sincronizado con esto.

---

## 7. Roles y cierre de caja

- **El barista puede abrir turno, vender y CERRAR caja.** El guard de rol en `app/cierre/page.tsx`
  y `app/cierre/acciones.ts` está en `barista` (antes era `supervisor`).
- **Reporte Z** (al cerrar): logo, esperado vs contado por método, diferencias, notas, total.
  Acciones: **Imprimir/PDF** y **Enviar a administración** (WhatsApp).
- **Reporte X**: corte parcial sin cerrar turno.
- Archivo: `components/FormCierre.tsx` (props desde `app/cierre/page.tsx`).

---

## 8. Scripts de mantenimiento

| Script | Qué hace |
|---|---|
| `limpiar_pruebas.sql` | Borra tickets/turnos/pagos. **Conserva catálogo y clientes.** |
| `arranque_limpio_catalogo.sql` | Lo anterior + recarga los 138 productos |

⚠️ Estos scripts son destructivos. Ya no deben correrse en producción salvo decisión explícita del owner.

---

## 9. Fuera de alcance — decidido, no reabrir

- **Impresora térmica / tickera: DESCARTADA DEFINITIVAMENTE.** No hay integración de impresión
  por hardware ni la habrá. La entrega de comprobantes es **digital**: PDF y envío por WhatsApp
  desde el Reporte Z. No proponer ESC/POS, bridges locales ni drivers.
- **Inventario:** fuera de v1.
- **Sync offline:** fuera de v1.

---

## 10. Pendientes abiertos

- [ ] Registrar a ambos owners como **socios ICAO** desde `/clientes`.
- [ ] Confirmar la lógica de **`factura_host_ref`** con el contador externo.
- [ ] **Piloto de 5 días en paralelo** con el método manual, cuadrando ambos. El sistema no se
      considera validado hasta completar esto con dos baristas y pagos mixtos reales.
- [ ] Entregar dominio + acceso directo en la tablet al equipo.

---

## 11. Principios aprendidos

- **No sobre-diseñar v1.** Offline, impresión e inventario se cortaron para poder salir. Fue correcto.
- **El contexto obsoleto es el riesgo real**, no la falta de contexto. Por eso existe `claude/`
  y por eso `BITACORA.md` tiene una sección explícita de "historia que ya no aplica".
- **Ninguna prueba de desarrollo sustituye un turno real.** Piloto primero, validación después.
