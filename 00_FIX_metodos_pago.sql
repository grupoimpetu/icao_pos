-- ICAO POS · 14-sep-2026
-- FIX CRÍTICO: la restricción de `pagos.metodo` en la base NO incluye
-- 'efectivo_bs', 'zelle' ni 'binance', pero la app SÍ los ofrece en caja.
-- Efecto: el ticket se crea como PAGADO y luego el INSERT del pago revienta
-- -> ticket cobrado con CERO pagos -> descuadre en el Reporte Z.
-- Correr en el SQL Editor de Supabase.

begin;

-- 1) ¿Hay tickets pagados sin ningún pago? (daño ya ocurrido)
create temp table _huerfanos as
select t.id, t.correlativo, t.abierto_ts, t.total_eur
from tickets t
left join pagos p on p.ticket_id = t.id
where t.estado = 'pagado'
group by t.id, t.correlativo, t.abierto_ts, t.total_eur
having count(p.id) = 0;

select count(*) as tickets_pagados_sin_pago from _huerfanos;
select * from _huerfanos order by abierto_ts desc;

-- 2) Ampliar la restricción a los métodos que la app realmente usa
alter table pagos drop constraint if exists pagos_metodo_check;
alter table pagos add constraint pagos_metodo_check
  check (metodo in (
    'efectivo_bs','bs_pago_movil','bs_transferencia','tdd','tdc',
    'efectivo_usd','efectivo_eur','zelle','binance','wallet'
  ));

commit;

-- 3) Verificación
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'pagos'::regclass and conname = 'pagos_metodo_check';
