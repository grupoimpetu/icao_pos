-- ICAO POS · diagnóstico (SOLO LECTURA, no modifica nada)
-- La columna correcta en `tickets` es abierto_ts / cerrado_ts, no creado_en.

-- A) ¿Hay tickets con 2+ métodos de pago en producción?
select t.correlativo, t.abierto_ts, t.total_eur,
       count(p.id) as n_pagos,
       string_agg(p.metodo || ' ' || p.monto_eur || '€', ' + ' order by p.id) as detalle
from tickets t
join pagos p on p.ticket_id = t.id
where t.abierto_ts > now() - interval '21 days'
group by t.correlativo, t.abierto_ts, t.total_eur
having count(p.id) > 1
order by t.abierto_ts desc
limit 30;

-- B) Métodos usados y si alguno está fuera de la restricción
select metodo, moneda, count(*) as veces, sum(monto_eur) as total_eur
from pagos p
join tickets t on t.id = p.ticket_id
where t.abierto_ts > now() - interval '21 days'
group by metodo, moneda order by veces desc;

-- C) Historial de la tasa: fíjate en los SÁBADOS
select fecha,
       to_char(capturada_ts at time zone 'America/Caracas','YYYY-MM-DD HH24:MI') as capturada_caracas,
       trim(to_char(fecha,'Day')) as dia,
       eur_bs, fuente
from tasas
order by capturada_ts desc
limit 40;

-- D) ¿Con qué tasa se abrió cada turno del último mes?
select id, to_char(apertura_ts at time zone 'America/Caracas','YYYY-MM-DD HH24:MI') as apertura,
       trim(to_char(apertura_ts at time zone 'America/Caracas','Day')) as dia,
       tasa_eur_bs, fuente_tasa
from turnos
where apertura_ts > now() - interval '30 days'
order by apertura_ts desc;
