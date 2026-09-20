"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion } from "@/lib/session";
import { construirPago, eur, totalDivisasEur, type Metodo } from "@/lib/money";

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

export async function crearCliente(f: { nombre: string; telefono?: string; alumno?: string; email?: string; zona?: string }) {
  if (!leerSesion()) return { ok: false as const, error: "Sesión expirada" };
  if (!f.nombre?.trim()) return { ok: false as const, error: "El nombre es obligatorio" };

  const db = supabaseAdmin();
  const { data: id, error } = await db.rpc("crear_cliente", {
    p_nombre: f.nombre, p_telefono: f.telefono ?? null,
    p_alumno: f.alumno ?? null, p_email: f.email ?? null, p_zona: f.zona ?? null,
  });
  if (error) {
    console.error("[crearCliente]", error.message);
    return { ok: false as const, error: error.message };
  }
  const { data: cli } = await db
    .from("clientes").select("id,nombre,alumno,telefono,zona,tipo,descuento_default_pct")
    .eq("id", id).single();
  return { ok: true as const, cliente: cli };
}

/* ================= Cobro ================= */

/** Tope de excedente por ticket. Sobre esto no es "billete redondo", es un
 *  error de tecleo y hay que frenarlo antes de que ensucie la caja. */
const TOPE_EXCEDENTE_EUR = 5;   // aplica a lo que SE QUEDA en caja, no al vuelto

/* ================= Vueltos (19-sep-2026 · Fase A) =================
 *  El excedente ya no tiene tope: si el billete es grande, se devuelve.
 *  El vuelto se reparte en efectivo (sale de la gaveta) y/o Pago Móvil
 *  (queda PENDIENTE para administración). Lo no devuelto queda en caja,
 *  y eso sí tiene tope de €5: más que eso es un vuelto olvidado. */
export type VueltoEntrada = {
  metodo: "efectivo_usd" | "efectivo_bs" | "bs_pago_movil" | "wallet";
  montoOriginal: number; pmTelefono?: string; pmCedula?: string; pmBanco?: string;
};

function prepararVueltos(vs: VueltoEntrada[] | undefined, excedenteEur: number, tasaBs: number, tasaUsd: number, permitirWallet = false) {
  const filas = (vs ?? []).map((v) => {
    const validos = ["efectivo_usd", "efectivo_bs", "bs_pago_movil", ...(permitirWallet ? ["wallet"] : [])];
    if (!validos.includes(v.metodo)) throw new Error("Método de vuelto inválido");
    const moneda = v.metodo === "efectivo_usd" || v.metodo === "wallet" ? "USD" : "BS";
    const tasa = moneda === "USD" ? tasaUsd : tasaBs;
    const monto = Math.round(Number(v.montoOriginal) * 100) / 100;
    if (!(monto > 0)) throw new Error("Hay una línea de vuelto en cero");
    const esPm = v.metodo === "bs_pago_movil";
    if (esPm && (!v.pmTelefono?.trim() || !v.pmCedula?.trim() || !v.pmBanco?.trim()))
      throw new Error("El vuelto por Pago Móvil exige teléfono, cédula y banco del cliente");
    return {
      metodo: v.metodo, moneda, monto_original: monto, tasa_aplicada: tasa,
      monto_eur: eur(monto / tasa),
      estado: esPm ? "pendiente" : "entregado",
      pm_telefono: esPm ? v.pmTelefono!.trim() : null,
      pm_cedula: esPm ? v.pmCedula!.trim().toUpperCase() : null,
      pm_banco: esPm ? v.pmBanco!.trim() : null,
    };
  });
  const devuelto = eur(filas.reduce((a, f) => a + f.monto_eur, 0));
  const queda = eur(excedenteEur - devuelto);
  if (queda < -0.01)
    throw new Error(`El vuelto (${devuelto.toFixed(2)}) supera lo pagado de más (${excedenteEur.toFixed(2)})`);
  if (queda > TOPE_EXCEDENTE_EUR)
    throw new Error(`Quedan ${queda.toFixed(2)} sin devolver. Regístralo como vuelto (efectivo o Pago Móvil).`);
  return filas;
}

export type LineaTicket = { producto_id: number; cant: number; precio_unit_eur: number };
/** CAMBIO 14-sep-2026: el barista teclea en la MONEDA DEL MÉTODO (Bs o $),
 *  no en EUR. El EUR es ancla de precios, no es plata que se mueve. */
export type PagoEntrada = { metodo: Metodo; montoOriginal: number; referencia?: string };

export async function cobrarTicket(input: {
  turnoId: number;
  clienteId: number;
  lineas: LineaTicket[];
  pagos: PagoEntrada[];
  vueltos?: VueltoEntrada[];
  /** PIN de la wallet del cliente, si paga con wallet. */
  walletPin?: string;
  descuentoPct: number;
  divisasDeclaradoEur?: number;
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
  }

  const descuentoEur = eur(subtotal * (descuentoPct / 100));

  // --- % divisas: REGLA, no criterio. Sale de motivos_descuento id=2.
  //
  //  CAMBIO 14-sep-2026: la porcion en divisa YA NO se declara aparte. Se
  //  DERIVA de las lineas de pago que el barista registro. Antes habia dos
  //  fuentes de verdad (el selector "Nada/Todo/Parte" y los metodos de pago)
  //  y si no coincidian el cobro se bloqueaba — por eso no se podia combinar
  //  efectivo + Pago Movil. Ahora hay UNA sola fuente: los pagos.
  const { data: mDiv } = await db
    .from("motivos_descuento").select("pct").eq("id", 2).maybeSingle();
  const pctDivisas = Number(mDiv?.pct ?? 0);

  // --- Pagos: se reconstruyen en el servidor con construirPago() ---
  let pagos: ReturnType<typeof construirPago>[] = [];
  if (!input.dejarAbierto) {
    try {
      pagos = input.pagos.map((p) =>
        construirPago(p.metodo, tasaBs, tasaUsd, { montoOriginal: p.montoOriginal }, p.referencia)
      );
    } catch (e: any) {
      return { ok: false as const, error: e.message };
    }
    if (pagos.some((p) => !(p.monto_eur > 0)))
      return { ok: false as const, error: "Hay una linea de pago en cero. Quitala o ponle monto." };
  }

  // Lo efectivamente entregado en divisa. Se topa al subtotal neto: si el
  // cliente paga de más (billete redondo), el excedente NO genera descuento.
  const baseDivisas = eur(Math.min(totalDivisasEur(pagos), subtotal - descuentoEur));
  const descuentoDivisasEur = eur(baseDivisas * (pctDivisas / 100));
  // Para el ticket abierto todavia no hay pagos: se guarda 0 y se recalcula al cobrar.
  const declarado = input.dejarAbierto ? 0 : eur(baseDivisas / (1 - descuentoPct / 100 || 1));

  const total = eur(subtotal - descuentoEur - descuentoDivisasEur);

  //  EXCEDENTE (14-sep-2026): en la barra el cliente suele pagar con billete
  //  redondo ($2 por un ticket de $1.96) y se le cobra completo. Antes el POS
  //  exigia suma == total, asi que se registraba menos de lo que entraba y el
  //  Reporte Z mostraba una sobra fantasma todos los dias. Ahora se registra
  //  LO QUE ENTRO DE VERDAD: el sobrante se guarda en `excedente_eur` y la
  //  gaveta cuadra en cero. Lo que NO se acepta es cobrar de menos.
  let excedenteEur = 0;
  if (!input.dejarAbierto) {
    const suma = eur(pagos.reduce((a, p) => a + p.monto_eur, 0));
    const dif = eur(total - suma);
    if (dif > 0.01)
      return { ok: false as const, error: `Faltan ${dif.toFixed(2)} para completar el total (${total.toFixed(2)})` };

    excedenteEur = eur(Math.max(0, -dif));
  }
  // --- Wallet (Fase B): consumo con PIN y vuelto abonado a la wallet ---
  const { data: cliW } = await db.from("clientes").select("es_generico").eq("id", input.clienteId).single();
  const walletPermitida = !!cliW && !cliW.es_generico;
  const walletEur = eur(pagos.filter((p) => p.metodo === "wallet").reduce((a, p) => a + p.monto_eur, 0));
  if (walletEur > 0) {
    if (!walletPermitida) return { ok: false as const, error: "Los clientes genéricos no tienen wallet" };
    if (excedenteEur > 0.01)
      return { ok: false as const, error: "La wallet no puede pagar de más. Baja el monto de la wallet al restante." };
    const { data: v } = await db.rpc("wallet_verificar_pin", { p_cliente: input.clienteId, p_pin: input.walletPin ?? "" });
    if (v !== "ok")
      return { ok: false as const, error: v === "bloqueado" ? "Wallet bloqueada 15 min por PIN fallido" : v === "sin_pin" ? "El cliente aún no tiene PIN: haz una recarga primero" : "PIN de wallet incorrecto" };
    const { data: saldo } = await db.rpc("wallet_saldo", { p_cliente: input.clienteId });
    if (Number(saldo ?? 0) + 0.001 < walletEur)
      return { ok: false as const, error: `Saldo insuficiente en la wallet (${Number(saldo ?? 0).toFixed(2)})` };
  }

  let vueltos: ReturnType<typeof prepararVueltos> = [];
  if (!input.dejarAbierto) {
    try { vueltos = prepararVueltos(input.vueltos, excedenteEur, tasaBs, tasaUsd, walletPermitida); }
    catch (e: any) { return { ok: false as const, error: e.message }; }
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
      divisas_declarado_eur: declarado, descuento_divisas_eur: descuentoDivisasEur,
      excedente_eur: excedenteEur,
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

  if (vueltos.length) {
    const { error: eV } = await db.from("vueltos").insert(
      vueltos.map((v) => ({ ...v, ticket_id: ticket.id, turno_id: turno.id, creado_por: ses.empleadoId }))
    );
    if (eV) {
      console.error("[cobrarTicket] vueltos:", eV.message);
      return { ok: false as const, error: "El ticket se cobró pero falló el registro del vuelto. Avisa al supervisor." };
    }
    for (const v of vueltos.filter((x) => x.metodo === "wallet")) {
      const { error: eW } = await db.rpc("wallet_mover", {
        p_cliente: input.clienteId, p_tipo: "vuelto", p_monto_eur: v.monto_eur,
        p_ticket: ticket.id, p_turno: turno.id, p_empleado: ses.empleadoId,
      });
      if (eW) {
        console.error("[cobrarTicket] vuelto wallet:", eW.message);
        return { ok: false as const, error: "El ticket se cobró pero el vuelto no llegó a la wallet. Avisa al supervisor." };
      }
    }
  }

  if (walletEur > 0) {
    const { error: eW } = await db.rpc("wallet_mover", {
      p_cliente: input.clienteId, p_tipo: "consumo", p_monto_eur: -walletEur,
      p_ticket: ticket.id, p_turno: turno.id, p_empleado: ses.empleadoId,
    });
    if (eW) {
      console.error("[cobrarTicket] consumo wallet:", eW.message);
      return { ok: false as const, error: "El ticket se cobró pero no se descontó la wallet. Avisa al supervisor." };
    }
  }

  const { data: cli } = await db
    .from("clientes").select("nombre,telefono").eq("id", input.clienteId).single();

  return {
    ok: true as const,
    ticket: {
      id: ticket.id, correlativo, subtotal, descuentoEur, total, excedenteEur,
      vueltos: vueltos.map((v) => ({ metodo: v.metodo, moneda: v.moneda, monto: v.monto_original, estado: v.estado })),
      abierto: !!input.dejarAbierto,
      cliente: cli?.nombre ?? "", telefono: cli?.telefono ?? null,
      tasaBs, lineas: input.lineas.map((l) => ({
        nombre: prods.find((p) => p.id === l.producto_id)!.nombre,
        cant: l.cant, precio: precio.get(l.producto_id)!,
      })),
    },
  };
}

/* ================= Cobrar una cuenta que quedó abierta ================= */

export async function cobrarCuentaAbierta(input: {
  ticketId: number;
  pagos: PagoEntrada[];
  vueltos?: VueltoEntrada[];
}) {
  const ses = leerSesion();
  if (!ses) return { ok: false as const, error: "Sesión expirada" };

  const db = supabaseAdmin();

  const { data: t, error: eT } = await db
    .from("tickets").select("id,correlativo,total_eur,estado,turno_id").eq("id", input.ticketId).single();
  if (eT || !t) return { ok: false as const, error: "Ticket no encontrado" };
  if (t.estado !== "abierto") return { ok: false as const, error: "Esa cuenta ya fue cobrada o anulada" };

  const { data: turno } = await db
    .from("turnos").select("tasa_eur_bs,tasa_eur_usd_cash,estado").eq("id", t.turno_id).single();
  if (!turno || turno.estado !== "abierto")
    return { ok: false as const, error: "El turno de esa cuenta ya cerró" };

  const total = Number(t.total_eur);
  let pagos;
  try {
    pagos = input.pagos.map((p) =>
      construirPago(p.metodo, Number(turno.tasa_eur_bs), Number(turno.tasa_eur_usd_cash),
                    { montoOriginal: p.montoOriginal }, p.referencia)
    );
  } catch (e: any) {
    return { ok: false as const, error: e.message };
  }
  if (pagos.some((p) => p.metodo === "wallet"))
    return { ok: false as const, error: "La wallet solo se usa al cobrar en Vender" };
  const sumaCA = pagos.reduce((a, p) => a + p.monto_eur, 0);
  const difCA = Number((total - sumaCA).toFixed(2));
  if (difCA > 0.01)
    return { ok: false as const, error: `Faltan ${difCA.toFixed(2)} para completar el total` };
  const excedenteCA = Math.max(0, Number((-difCA).toFixed(2)));
  let vueltosCA: ReturnType<typeof prepararVueltos>;
  try {
    vueltosCA = prepararVueltos(input.vueltos, excedenteCA,
      Number(turno.tasa_eur_bs), Number(turno.tasa_eur_usd_cash));
  } catch (e: any) { return { ok: false as const, error: e.message }; }

  const { error: eP } = await db.from("pagos").insert(pagos.map((p) => ({ ...p, ticket_id: t.id })));
  if (eP) {
    console.error("[cobrarCuentaAbierta] pagos:", eP.message);
    return { ok: false as const, error: "No se pudo registrar el pago" };
  }

  const { error: eU } = await db.from("tickets")
    .update({ estado: "pagado", cerrado_ts: new Date().toISOString(), excedente_eur: excedenteCA })
    .eq("id", t.id).eq("estado", "abierto");
  if (eU) {
    console.error("[cobrarCuentaAbierta] cierre:", eU.message);
    return { ok: false as const, error: "El pago quedó registrado pero el ticket no se cerró. Avisa al supervisor." };
  }

  if (vueltosCA.length) {
    const { error: eV } = await db.from("vueltos").insert(
      vueltosCA.map((v) => ({ ...v, ticket_id: t.id, turno_id: t.turno_id, creado_por: ses.empleadoId }))
    );
    if (eV) {
      console.error("[cobrarCuentaAbierta] vueltos:", eV.message);
      return { ok: false as const, error: "La cuenta se cobró pero falló el registro del vuelto. Avisa al supervisor." };
    }
  }

  await db.from("audit_log").insert({
    tabla: "tickets", registro_id: String(t.id), accion: "cobrar_cuenta_abierta",
    valores_despues: { total_eur: total, pagos: pagos.length }, empleado_id: ses.empleadoId,
  });

  return { ok: true as const, correlativo: t.correlativo };
}
