-- ICAO POS · 14-sep-2026 · columna de EXCEDENTE
-- Registra lo que el cliente paga de más cuando entrega billete redondo
-- (ej. $2.00 por un ticket de $1.96). Sin esto, el POS registraba menos de lo
-- que entraba a la gaveta y el Reporte Z mostraba una sobra fantasma diaria.
-- Correr ANTES de subir el código.

begin;

alter table tickets
  add column if not exists excedente_eur numeric(12,2) not null default 0;

comment on column tickets.excedente_eur is
  'Lo que el cliente pagó por encima del total (billete redondo). No es venta: es ingreso por redondeo. Reportar aparte del total_eur.';

commit;

-- Verificación
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'tickets' and column_name = 'excedente_eur';

-- Excedente acumulado (correr después de unos días de uso)
select date_trunc('day', abierto_ts at time zone 'America/Caracas')::date as dia,
       count(*) filter (where excedente_eur > 0) as tickets_con_excedente,
       round(sum(excedente_eur), 2) as excedente_eur
from tickets
where estado = 'pagado' and abierto_ts > now() - interval '30 days'
group by 1 order by 1 desc;
