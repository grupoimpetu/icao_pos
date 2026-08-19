-- ============================================================
-- ICAO POS v1 — Esquema Supabase (Postgres)
-- Moneda de verdad: EUR. Bs y USD son presentaciones.
-- tickets / pagos / audit_log = append-only.
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- CATÁLOGO ----------
create table categorias (
  id            serial primary key,
  nombre        text not null unique,
  orden_display int  not null default 0,
  solo_eventos  boolean not null default false,
  activo        boolean not null default true
);

create table productos (
  id            serial primary key,
  codigo_saint  text,                       -- referencia, NUNCA llave
  nombre        text not null,
  categoria     text not null,
  precio_eur    numeric(10,2) not null check (precio_eur >= 0),
  es_vendible   boolean not null default true,
  activo        boolean not null default true,
  solo_eventos  boolean not null default false,
  orden_display int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on productos (categoria, orden_display) where activo;
create index on productos using gin (to_tsvector('spanish', nombre));

-- modificadores (EXTRAS enganchados a productos)
create table modificadores (
  id          serial primary key,
  nombre      text not null,
  precio_eur  numeric(10,2) not null default 0,
  activo      boolean not null default true
);
create table producto_modificadores (
  producto_id     int references productos(id) on delete cascade,
  modificador_id  int references modificadores(id) on delete cascade,
  primary key (producto_id, modificador_id)
);

-- combos / promos: descuenta componentes en v2
create table combo_componentes (
  combo_id      int references productos(id) on delete cascade,
  componente_id int references productos(id),
  cant          numeric(6,2) not null default 1,
  primary key (combo_id, componente_id)
);

-- ---------- PERSONAS ----------
create table clientes (
  id                    serial primary key,
  nombre                text not null,
  telefono              text,
  tipo                  text not null default 'general',  -- general | socio_impetu | staff
  descuento_default_pct numeric(5,2) not null default 0,
  created_at            timestamptz not null default now()
);
create index on clientes (telefono);

create table empleados (
  id       serial primary key,
  nombre   text not null,
  pin_hash text not null,
  rol      text not null check (rol in ('barista','supervisor','admin')),
  activo   boolean not null default true
);

-- ---------- TASAS ----------
create table tasas (
  id        serial primary key,
  fecha     date not null,
  eur_bs    numeric(14,4) not null,
  fuente    text not null,          -- 'bcv_api' | 'manual'
  capturada_ts timestamptz not null default now(),
  unique (fecha, fuente)
);

create table config (
  clave text primary key,
  valor text not null,
  updated_at timestamptz not null default now()
);
insert into config (clave, valor) values
  ('tasa_eur_usd_cash','1.00'),
  ('redondeo_bs','entero_arriba'),
  ('redondeo_usd_cash','0.25');

-- ---------- OPERACIÓN ----------
create table turnos (
  id                 serial primary key,
  empleado_id        int not null references empleados(id),
  apertura_ts        timestamptz not null default now(),
  cierre_ts          timestamptz,
  tasa_eur_bs        numeric(14,4) not null,      -- congelada al abrir
  tasa_eur_usd_cash  numeric(10,4) not null default 1.00,
  fuente_tasa        text not null,
  fondo_bs           numeric(14,2) not null default 0,
  fondo_usd          numeric(12,2) not null default 0,
  estado             text not null default 'abierto' check (estado in ('abierto','cerrado'))
);
create unique index un_turno_abierto on turnos (estado) where estado = 'abierto';

create table tickets (
  id                serial primary key,
  correlativo       text not null unique,
  turno_id          int not null references turnos(id),
  cliente_id        int references clientes(id),
  estado            text not null default 'abierto'
                    check (estado in ('abierto','pagado','anulado')),
  abierto_ts        timestamptz not null default now(),
  cerrado_ts        timestamptz,
  subtotal_eur      numeric(12,2) not null default 0,
  descuento_eur     numeric(12,2) not null default 0,
  motivo_descuento  text,
  total_eur         numeric(12,2) not null default 0,
  factura_host_ref  text,                       -- mapeo contra facturación de la empresa host
  anula_ticket_id   int references tickets(id)  -- contra-asiento
);
create index on tickets (turno_id, estado);
create index on tickets (cliente_id);

create table ticket_items (
  id              serial primary key,
  ticket_id       int not null references tickets(id),
  producto_id     int not null references productos(id),
  cant            numeric(6,2) not null check (cant > 0),
  precio_unit_eur numeric(10,2) not null,
  modificadores   jsonb not null default '[]'::jsonb,
  agregado_ts     timestamptz not null default now(),
  agregado_por    int not null references empleados(id)
);
create index on ticket_items (ticket_id);

create table pagos (
  id             serial primary key,
  ticket_id      int not null references tickets(id),
  metodo         text not null check (metodo in
                 ('bs_transferencia','bs_pago_movil','efectivo_usd','efectivo_eur','tdd','tdc','wallet')),
  monto_original numeric(14,2) not null,
  moneda         text not null check (moneda in ('BS','USD','EUR')),
  tasa_aplicada  numeric(14,4) not null,
  monto_eur      numeric(12,2) not null,
  referencia     text,
  ts             timestamptz not null default now()
);
create index on pagos (ticket_id);

create table motivos_descuento (
  id        serial primary key,
  motivo    text not null unique,
  pct       numeric(5,2),          -- null = libre
  autoriza  text not null check (autoriza in ('auto','barista','supervisor','admin'))
);
insert into motivos_descuento (motivo, pct, autoriza) values
  ('Socio IMPETU', 10, 'auto'),
  ('Pago en divisas', 5, 'barista'),
  ('Cortesía / staff', 100, 'supervisor'),
  ('Ajuste comercial', null, 'admin');

create table cierres_caja (
  id            serial primary key,
  turno_id      int not null references turnos(id),
  moneda        text not null check (moneda in ('BS','USD','EUR')),
  esperado      numeric(14,2) not null,
  declarado     numeric(14,2) not null,
  diferencia    numeric(14,2) generated always as (declarado - esperado) stored,
  nota          text,
  supervisor_id int references empleados(id),
  ts            timestamptz not null default now()
);

create table audit_log (
  id              bigserial primary key,
  tabla           text not null,
  registro_id     text not null,
  accion          text not null,
  valores_antes   jsonb,
  valores_despues jsonb,
  empleado_id     int references empleados(id),
  ts              timestamptz not null default now()
);
create index on audit_log (tabla, registro_id);

-- ---------- APPEND-ONLY (regla de oro) ----------
create or replace function bloquear_mutacion() returns trigger as $$
begin
  raise exception 'Tabla append-only: use contra-asiento en vez de % ', tg_op;
end $$ language plpgsql;

create trigger no_delete_pagos    before delete on pagos    for each row execute function bloquear_mutacion();
create trigger no_delete_audit    before delete on audit_log for each row execute function bloquear_mutacion();
create trigger no_update_audit    before update on audit_log for each row execute function bloquear_mutacion();
create trigger no_delete_tickets  before delete on tickets  for each row execute function bloquear_mutacion();

-- ---------- VISTA DE CAJA ESPERADA ----------
create view v_caja_esperada as
select p.metodo, t.turno_id, sum(p.monto_original) as total_moneda, p.moneda
from pagos p join tickets t on t.id = p.ticket_id
where t.estado = 'pagado'
group by 1,2,4;

-- ---------- RLS (activar tras crear políticas por rol) ----------
alter table productos    enable row level security;
alter table tickets      enable row level security;
alter table pagos        enable row level security;
alter table clientes     enable row level security;
