# Supabase — proyecto ICAO POS

## Datos del proyecto
- Org: `daniel@grupoimpetu.com's Org` — plan **Free**
- Proyecto: **icao-pos**
- Ref: `doavqlhgunezlbsamudw`
- Dashboard: https://supabase.com/dashboard/project/doavqlhgunezlbsamudw
- La **database password** la tiene solo Choco (yo no la manejo — restricción dura)

## Estado (22-ago-2026)
| Métrica | Valor |
|---|---|
| Productos | 319 (312 activos + 7 BARRA solo-eventos) |
| Categorías | 22 |
| Clientes | 460 (458 reales + 2 genéricos) |
| Tickets / turnos / cierres | **0** — base limpia |
| Empleados | 4 (admin, supervisor, 2 baristas) |
| Motivos de descuento | 3 activos |

## RLS
Se eligió **"Run and enable RLS"**. Correcto: el POS accede con la **service role
key** desde el servidor (bypassea RLS), y el `anon key` queda bloqueado. Como la
autenticación es por PIN propio y no por Supabase Auth, no debe haber acceso
público a estas tablas.

**Nota:** Supabase renombró las llaves — ahora son `sb_publishable_...` y
`sb_secret_...` en vez de anon/service_role. Funcionan igual con supabase-js.

---

## ⚠️ TRAMPA CRÍTICA DEL SQL EDITOR — leer siempre

El panel de resultados **conserva el resultado anterior**, y `cmd+Return` no
siempre dispara la ejecución si el foco no está dentro del editor.

**Consecuencia:** el editor puede decir `"Success. No rows returned"` sin haber
creado absolutamente nada.

Pasó dos veces:
1. **19-ago:** el seed pareció exitoso pero `productos = 0`.
2. **22-ago:** 3 funciones de reporte fallaron en silencio por nombres de columna
   inventados (`abierto_ts` en vez de `apertura_ts`).

**Regla innegociable:** después de CADA carga, verificar con un `select` real
(`select count(*)`, o `select proname from pg_proc ...`). **Nunca confiar en el
mensaje del panel.**

### Cómo escribir SQL en el editor (Monaco)
```js
window.monaco.editor.getModels()[0].setValue(sql);
[...document.querySelectorAll('button')]
  .find(x=>x.textContent.trim().startsWith('Run')).click();
```
**Hacer clic en el botón Run, NO `cmd+Return`.**

### Leer resultados sin pelear con el filtro
El SQL Editor renderiza las celdas largas truncadas. Para inspeccionar esquema,
devolver **filas cortas** (`select column_name from information_schema.columns`)
en vez de un `string_agg` gigante que se corta en pantalla.

---

## ⚠️ Trampas de Postgres

- `CREATE OR REPLACE` **no puede** cambiar el tipo de retorno ni la firma de una
  función → `DROP FUNCTION` primero.
- Toda función `security definer` necesita
  **`set search_path = public, extensions`**.
  Razón: Supabase instala **pgcrypto en el esquema `extensions`**, no en `public`.
  Desde el SQL Editor el `search_path` lo incluye y `crypt()` resuelve; vía
  PostgREST **no lo incluye**, la función revienta y supabase-js devuelve error.
  Este bug costó 4 intentos de diagnóstico el Día 2.
- Después de cambiar funciones: `notify pgrst, 'reload schema';`

## Antes de escribir cualquier función
Consultar el esquema real. Nombres que **no** son los intuitivos:
- `turnos`: `empleado_id`, `apertura_ts`, `cierre_ts`
- `audit_log`: `tabla, registro_id, accion, valores_antes, valores_despues, empleado_id, ts`

```sql
select column_name from information_schema.columns
where table_name = '<tabla>' order by ordinal_position;
```

## Borrado de datos
Las tablas `tickets`/`pagos`/`audit_log` son **append-only** (4 triggers).
Un `delete` normal no pasa. Para limpiar:
```sql
set session_replication_role = replica;   -- desactiva triggers
-- ... deletes ...
set session_replication_role = origin;
```
**Lo corre Choco, no yo** — borrar datos es restricción dura mía.
