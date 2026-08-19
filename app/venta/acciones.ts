"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion } from "@/lib/session";
import { construirPago, ticketCuadra, eur, type Metodo } from "@/lib/money";

/* ================= Búsqueda y alta de clientes ================= */

export async function buscarClientes(q: string) {
  if (!leerSesion()) return { ok: false as const, error: "Sesión expirada" };
  if (!q || q.trim().length < 2) return { ok: true as const, clientes: [] };

  const { data, error } = await supabaseAdmin().rpc("buscar_cliente", { p_q: q.trim() });
  if (error) {
    console.error("[buscarClientes]", error.message);
    return { ok: false as const, error: "No se pudo buscar el cliente" };
  }
  return { ok: true as const, clientes: data ?? [] };
}

export async function crearCliente(f: { nombre: string; telefono?: string; alumno?: string; email?: string }) {
  if (!leerSesion()) return { ok: false as const, error: "Sesión expirada" };
  if (!f.nombre?.trim()) return { ok: false as const, error: "El nombre es obligatorio" };

  const db = supabaseAdmin();
  const { data: id, error } = await db.rpc("crear_cliente", {
    p_nombre: f.nombre, p_telefono: f.telefono ?? null,
    p_alumno: f.alumno ?? null, p_email: f.email ?? null,
  });
  if (error) {
    console.error("[crearCliente]", error.message);
    return { ok: false as const, error: error.message };
  }
  const { data: cli } = await db
    .from("clientes").select("id,nombre,alumno,telefono,tipo,descuento_default_pct")
    .eq("id", id).single();
  return { ok: true as const, cliente: cli };
}

/* ================= Cobro ================= */

export type LineaTicket = { producto_id: number; cant: number; precio_unit_eur: number };
export type PagoEntrada = { metodo: Metodo; montoEur: number; referencia?: string };

export async function cobrarTicket(input: {
  turnoId: number;
  clienteId: number;
  lineas: LineaTicket[];
  pagos: PagoEntrada[];
  descuentoPct: number;
  motivoDescuento: string | null;
  pinAutorizacion?: string;
  dejarAbierto?: boolean;
}) {
  const ses = leerSesion();
  if (!ses) return { ok: false as const, error: "Sesión expirada" };
  if (!input.lineas.length) return { ok: false as const, error: "El ticket está vacío" };
  if (!input.clienteId) return { ok: false as const, error: "Falta seleccionar el cliente" };

  const db = supabaseAdmin();

  // --- Turno + tasas congeladas. NUNCA confiar en las que manda el navegador. ---
  const { data: turno, error: eT } = await db
    .from("turnos").select("id,tasa_eur_bs,tasa_eur_usd_cash,estado")
    .eq("id", input.turnoId).single();
  if (eT || !turno) return { ok: false as const, error: "Turno no encontrado" };
  if (turno.estado !== "abierto") return { ok: false as const, error: "El turno ya está cerrado" };
  const tasaBs = Number(turno.tasa_eur_bs);
  const tasaUsd = Number(turno.tasa_eur_usd_cash);

  // --- Precios desde la BASE, no desde el cliente. Evita que alguien
  //     manipule el precio en el navegador y cobre lo que quiera. ---
  const ids = [...new Set(input.lineas.map((l) => l.producto_id))];
  const { data: prods, error: eP } = await db
    .from("productos").select("id,nombre,precio_eur").in("id", ids);
  if (eP || !prods) return { ok: false as const, error: "No se pudieron leer los precios" };
  const precio = new Map(prods.map((p) => [p.id, Number(p.precio_eur)]));
  if (input.lineas.some((l) => !precio.has(l.producto_id)))
    return { ok: false as const, error: "Hay un producto que ya no existe" };

  const subtotal = eur(input.lineas.reduce((a, l) => a + precio.get(l.producto_id)! * l.cant, 0));

  // --- Descuento: solo motivos de la tabla, con el % que dice la tabla. ---
  let descuentoPct = 0;
  let motivo: string | null = null;
  if (input.descuentoPct > 0 || input.motivoDescuento) {
    const { data: m } = await db
      .from("motivos_descuento").select("*").eq("motivo", input.motivoDescuento ?? "").maybeSingle();
    if (!m) return { ok: false as const, error: "Motivo de descuento inválido" };

    descuentoPct = m.pct === null ? Number(input.descuentoPct) : Number(m.pct);
    motivo = m.motivo;
    if (descuentoPct < 0 || descuentoPct > 100)
      return { ok: false as const, error: "Descuento fuera de rango" };

    const jerarquia = { auto: 0, barista: 1, supervisor: 2, admin: 3 } as const;
    const necesita = jerarquia[m.autoriza as keyof typeof jerarquia] ?? 3;
    const tiene = jerarquia[ses.rol as keyof typeof jerarquia] ?? 0;

    if (necesita > tiene) {
      if (!input.pinAutorizacion)
        return { ok: false as const, error: `"${m.motivo}" requiere PIN de ${m.autoriza}`, requierePin: true };
      const { data: autor } = await db.rpc("verificar_pin", { p_pin: input.pinAutorizacion });
      const a = autor?.[0];
      const rolAutor = jerarquia[a?.rol as keyof typeof jerarquia] ?? 0;
      if (!a || rolAutor < necesita)
        return { ok: false as const, error: "PIN sin permisos para ese descuento" };
      motivo = `${m.motivo} (autorizó ${a.nombre})`;
    }
    if (m.autoriza === "admin" && !input.motivoDescuento)
      return { ok: false as const, error: "Ajuste comercial exige nota" };
  }

  const descuentoEur = eur(subtotal * (descuentoPct / 100));
  const total = eur(subtotal - descuentoEur);

  // --- Pagos: se reconstruyen en el servidor con construirPago() ---
  let pagos: ReturnType<typeof construirPago>[] = [];
  if (!input.dejarAbierto) {
    try {
      pagos = input.pagos.map((p) =>
        construirPago(p.metodo, tasaBs, tasaUsd, { montoEur: p.montoEur }, p.referencia)
      );
    } catch (e: any) {
      return { ok: false as const, error: e.message };
    }
    if (!ticketCuadra(total, pagos.map((p) => p.monto_eur)))
      return { ok: false as const, error: "Los pagos no suman el total del ticket" };
  }

  // --- Correlativo por turno: T{turno}-{n} ---
  const { count } = await db
    .from("tickets").select("id", { count: "exact", head: true }).eq("turno_id", turno.id);
  const correlativo = `T${turno.id}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data: ticket, error: eTicket } = await db
    .from("tickets").insert({
      correlativo, turno_id: turno.id, cliente_id: input.clienteId,
      estado: input.dejarAbierto ? "abierto" : "pagado",
      cerrado_ts: input.dejarAbierto ? null : new Date().toISOString(),
      subtotal_eur: subtotal, descuento_eur: descuentoEur,
      motivo_descuento: motivo, total_eur: total,
    }).select().single();
  if (eTicket || !ticket) {
    console.error("[cobrarTicket] ticket:", eTicket?.message);
    return { ok: false as const, error: "No se pudo crear el ticket" };
  }

  const { error: eItems } = await db.from("ticket_items").insert(
    input.lineas.map((l) => ({
      ticket_id: ticket.id, producto_id: l.producto_id, cant: l.cant,
      precio_unit_eur: precio.get(l.producto_id)!, agregado_por: ses.empleadoId,
    }))
  );
  if (eItems) console.error("[cobrarTicket] items:", eItems.message);

  if (pagos.length) {
    const { error: ePagos } = await db.from("pagos").insert(
      pagos.map((p) => ({ ...p, ticket_id: ticket.id }))
    );
    if (ePagos) {
      console.error("[cobrarTicket] pagos:", ePagos.message);
      return { ok: false as const, error: "El ticket se creó pero falló el registro del pago" };
    }
  }

  const { data: cli } = await db
    .from("clientes").select("nombre,telefono").eq("id", input.clienteId).single();

  return {
    ok: true as const,
    ticket: {
      id: ticket.id, correlativo, subtotal, descuentoEur, total,
      abierto: !!input.dejarAbierto,
      cliente: cli?.nombre ?? "", telefono: cli?.telefono ?? null,
      tasaBs, lineas: input.lineas.map((l) => ({
        nombre: prods.find((p) => p.id === l.producto_id)!.nombre,
        cant: l.cant, precio: precio.get(l.producto_id)!,
      })),
    },
  };
}
