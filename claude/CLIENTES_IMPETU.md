# Clientes IMPETU — carga y normalización

Fuentes:
1. `BBDD Paseo el Hatillo.xlsx` (Studio Pro Report) — 95 representantes de la sede
2. `studiopro_parents.csv` — 466 filas, padrón completo con teléfono

## Estado en Supabase
| Métrica | Valor |
|---|---|
| Clientes totales | **460** (458 reales + 2 genéricos) |
| Con teléfono | **458** |
| Sede Hatillo (`sede_hatillo = true`) | **95** |
| **Hatillo con teléfono** | **95 / 95 = 100%** ✅ |
| Otras sedes IMPETU (`origen='studiopro'`) | 363 |
| Teléfonos venezolanos (+58) | 450 |

## Normalización de teléfonos
El CSV traía todos los formatos imaginables. Se normalizó todo a **E.164**
(`+58XXXXXXXXXX`), que es lo que exige `wa.me` para el ticket por WhatsApp:

| Formato de entrada | Ejemplo | Resultado |
|---|---|---|
| Local con 0 | `04141788954` | `+584141788954` |
| Sin 0 | `4127355494` | `+584127355494` |
| Con guiones | `0414-1788954` | `+584141788954` |
| Con espacios | `0414 4770324` | `+584144770324` |
| Con paréntesis y puntos | `(0412) 322.07.74` | `+584123220774` |
| Prefijo internacional largo | `00584241061436` | `+584241061436` |
| Ya internacional | `+584147965288` | `+584147965288` |
| Extranjeros (10) | `+16789828007` | preservados |

466 filas → **460 únicos**. Deduplicado por email, y a igualdad se prefirió la
fila con teléfono venezolano válido. Duplicados resueltos: Alejandra Abreu,
Claudia Chafardet, Jhoaylin Chirinos, Vanessa Maggi, María Alejandra Lucero,
y una fila con nombre vacío.

Mojibake corregido (`GonzÃ¡lez` → `González`).

## Cruce
Los **95 de Hatillo cruzaron al 100% por email** con el padrón de teléfonos.
Cero requirieron match por nombre, cero quedaron sin número.

Los 363 restantes se incorporaron con `sede_hatillo = false`: son socias de otras
sedes que pueden aparecer por Hatillo.

## ⚠️ Regla de negocio corregida
**Ser cliente de IMPETU NO da descuento.** El 10% inicial fue un error y ya se
corrigió. El único descuento por ficha es **Socio ICAO = 5%**, y aplica solo a
Choco y su socia.

## Clientes genéricos (`es_generico = true`)
| Cliente | Uso |
|---|---|
| **Público General** | Cola larga o cliente de paso |
| **Cliente Evento** | Eventos ICAO fuera de sede |

"Personal ICAO" con 100% **fue eliminado** — no existe cortesía para staff.

### KPI que esto habilita
`% de tickets con cliente genérico por día` (visible en `/dashboard` y `/reportes`).
Si se dispara: o hay cola real, o el barista dejó de preguntar el nombre.
Es dato de gestión, no de contabilidad.

## Columnas de `clientes`
`id, nombre, telefono, email, alumno, tipo, descuento_default_pct, origen,
sede_hatillo, es_generico, activo, zona, nota, created_at`

`origen`: `impetu_studio` (Hatillo) | `studiopro` (otras sedes) | `manual` (alta
en caja) | `sistema` (genéricos)

## Pendiente
`clientes.zona` (requisito legal) está vacía en casi todos. Se llena poco a poco
desde el alta rápida en caja y desde `/clientes`. El encabezado muestra cuántos
faltan.
