# Cómo trabajar con Choco en este proyecto

**LEER ANTES DE RESPONDER NADA TÉCNICO.**

## Perfil
Daniel "Choco" Solórzano — **ingeniero de producción, NO programador.**
Ha construido websites, un agente IA ("Clari") y otros proyectos *conmigo*,
pero el código lo escribo yo. Él decide, valida y opera.

## Regla de oro
**Yo hago el heavy work.** Conectarme a su Chrome, escribir el código, correr el
SQL, comitear, desplegar. Él no abre una terminal salvo que no haya alternativa,
y si lo hace es copiar-pegar algo que yo le doy literal.

## Cómo comunicar
- ❌ "Levanta Supabase y corre las migraciones" — asume vocabulario que no tiene
- ✅ "Supabase es la base de datos, gratis. Necesito que hagas 3 clics: [pasos
  numerados con lo que ve en pantalla]. El resto lo hago yo."
- Explicar **qué es** una herramienta la primera vez que se nombra, en una línea.
- Siempre separar explícito: **lo que hace él** vs **lo que hago yo**.
- No pedirle que "revise el código". Pedirle que valide *decisiones de negocio*:
  precios, categorías, flujos de caja, permisos de su gente.

## Qué SÍ necesita sus manos (no puedo hacerlo por él)
- Crear cuentas y contraseñas — restricción dura mía
- **Borrar datos de forma permanente** — restricción dura mía. Le paso el SQL
  exacto y él lo corre en Supabase.
- Aprobar permisos de dominio en la extensión de Chrome
- **Probar en caja con PIN** — yo no manejo credenciales, así que toda prueba
  end-to-end del POS la hace él.
- Datos de negocio: BBDD de clientes, precios, decisiones fiscales

## Lo que él aporta y hay que aprovechar
Criterio de operación real: sabe cómo se mueve una barra, qué descuadra una caja,
cómo roba o se equivoca el personal, qué pasa en un evento. Cuando él dice
"eso no funciona en la práctica", tiene razón — preguntarle por el flujo real
antes de diseñar la pantalla.

Ejemplo real (22-ago): él aportó que en Venezuela el efectivo entra en USD y no
en EUR. Eso cambió la UI del cobro y sacó un método de pago del teclado.

## Estilo de respuesta que prefiere
Directo, opinado, con tablas y pasos accionables. Sin prefacios largos ni
hedging. Si algo se puede mejorar o retar, decirlo. Prioriza velocidad de
ejecución sobre perfección: 80% claro y accionable ya.

## Nota de eficiencia (dicha por él, aplicar por defecto)
> "No inviertas tokens y energía en tareas donde yo puedo ayudarte."

Si arrastrar un ZIP le toma 30 segundos y a mí miles de tokens y reintentos,
se lo pido. No es último recurso, es el camino por defecto.

## Antipatrón a evitar
Sobre-construir. El scope se protege activamente: la impresora térmica se cortó,
el inventario es v2, el sync offline v2.5. Cuando dude entre simple y completo,
proponer lo simple y decir qué se pierde.
