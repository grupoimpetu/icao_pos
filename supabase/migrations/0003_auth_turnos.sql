-- ============================================================
-- ICAO POS — Día 2: auth por PIN, turnos y snapshot de tasa
-- ============================================================

-- ---------- AUTH POR PIN ----------
-- El PIN se guarda con bcrypt (pgcrypto). Nunca en texto plano, nunca sale del server.
create or replace function set_pin(p_empleado_id int, p_pin text)
returns void language plpgsql security definer as $$
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe ser exactamente 4 dígitos';
  end if;
  update empleados set pin_hash = crypt(p_pin, gen_salt('bf', 10)) where id = p_empleado_id;
end $$;

-- Verificación: devuelve el empleado si el PIN es válido. Se llama SOLO desde el server.
create or replace function verificar_pin(p_pin text)
returns table (id int, nombre text, rol text)
language sql security definer as $$
  select e.id, e.nombre, e.rol
  from empleados e
  where e.activo and e.pin_hash = crypt(p_pin, e.pin_hash)
  limit 1;
$$;

revoke execute on function set_pin(int, text)   from anon, authenticated;
revoke execute on function verificar_pin(text)  from anon, authenticated;

-- Anti fuerza bruta: 4 dígitos = 10.000 combinaciones. Sin esto se rompe en minutos.
create table intentos_pin (
  id       bigserial primary key,
  ip       text,
  exitoso  boolean not null,
  ts       timestamptz not null default now()
);
create index on intentos_pin (ip, ts desc);

create or replace function pin_bloqueado(p_ip text)
returns boolean language sql stable as $$
  select count(*) >= 5
  from intentos_pin
  where ip = p_ip and not exitoso and ts > now() - interval '10 minutes';
$$;

-- ---------- TURNOS ----------
-- Abre turno congelando la tasa. Falla si ya hay uno abierto (índice un_turno_abierto).
create or replace function abrir_turno(
  p_empleado_id int,
  p_tasa_eur_bs numeric,
  p_fuente_tasa text,
  p_fondo_bs    numeric default 0,
  p_fondo_usd   numeric default 0
) returns int language plpgsql security definer as $$
declare
  v_id  int;
  v_usd numeric;
begin
  if p_tasa_eur_bs is null or p_tasa_eur_bs <= 0 then
    raise exception 'Tasa EUR/Bs inválida. No se abre turno sin tasa.';
  end if;

  select valor::numeric into v_usd from config where clave = 'tasa_eur_usd_cash';

  insert into turnos (empleado_id, tasa_eur_bs, tasa_eur_usd_cash, fuente_tasa, fondo_bs, fondo_usd)
  values (p_empleado_id, p_tasa_eur_bs, coalesce(v_usd, 1.00), p_fuente_tasa, p_fondo_bs, p_fondo_usd)
  returning id into v_id;

  insert into audit_log (tabla, registro_id, accion, valores_despues, empleado_id)
  values ('turnos', v_id::text, 'abrir_turno',
          jsonb_build_object('tasa_eur_bs', p_tasa_eur_bs, 'fuente', p_fuente_tasa,
                             'fondo_bs', p_fondo_bs, 'fondo_usd', p_fondo_usd),
          p_empleado_id);
  return v_id;
end $$;

-- Re-snapshot de tasa a media jornada. Solo supervisor/admin. Queda auditado.
create or replace function resnapshot_tasa(
  p_turno_id int, p_nueva_tasa numeric, p_empleado_id int, p_fuente text
) returns void language plpgsql security definer as $$
declare v_rol text; v_anterior numeric;
begin
  select rol into v_rol from empleados where id = p_empleado_id;
  if v_rol not in ('supervisor','admin') then
    raise exception 'Solo supervisor o admin pueden re-snapshotear la tasa';
  end if;

  select tasa_eur_bs into v_anterior from turnos where id = p_turno_id and estado = 'abierto';
  if v_anterior is null then raise exception 'Turno no encontrado o ya cerrado'; end if;

  update turnos set tasa_eur_bs = p_nueva_tasa, fuente_tasa = p_fuente where id = p_turno_id;

  insert into audit_log (tabla, registro_id, accion, valores_antes, valores_despues, empleado_id)
  values ('turnos', p_turno_id::text, 'resnapshot_tasa',
          jsonb_build_object('tasa_eur_bs', v_anterior),
          jsonb_build_object('tasa_eur_bs', p_nueva_tasa, 'fuente', p_fuente),
          p_empleado_id);
end $$;

-- Cierre: bloquea si quedan tickets abiertos. Esto evita el descuadre #1 de todo POS.
create or replace function cerrar_turno(p_turno_id int, p_empleado_id int)
returns void language plpgsql security definer as $$
declare v_abiertos int;
begin
  select count(*) into v_abiertos from tickets where turno_id = p_turno_id and estado = 'abierto';
  if v_abiertos > 0 then
    raise exception 'No se puede cerrar el turno: % ticket(s) abierto(s)', v_abiertos;
  end if;

  update turnos set estado = 'cerrado', cierre_ts = now()
  where id = p_turno_id and estado = 'abierto';

  insert into audit_log (tabla, registro_id, accion, empleado_id)
  values ('turnos', p_turno_id::text, 'cerrar_turno', p_empleado_id);
end $$;

-- ---------- AUDITORÍA AUTOMÁTICA DEL CRUD DE PRODUCTOS ----------
create or replace function log_productos() returns trigger
language plpgsql as $$
begin
  insert into audit_log (tabla, registro_id, accion, valores_antes, valores_despues)
  values ('productos',
          coalesce(new.id, old.id)::text,
          tg_op,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger tr_log_productos
after insert or update or delete on productos
for each row execute function log_productos();

create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger tr_touch_productos before update on productos
for each row execute function touch_updated_at();

-- ---------- SEMILLA DE EMPLEADOS ----------
-- Cambiar estos PIN antes de operar. select set_pin(id, 'XXXX');
insert into empleados (nombre, pin_hash, rol) values
  ('Admin ICAO',  crypt('1234', gen_salt('bf', 10)), 'admin'),
  ('Supervisor',  crypt('2345', gen_salt('bf', 10)), 'supervisor'),
  ('Barista 1',   crypt('3456', gen_salt('bf', 10)), 'barista');
