"use server";

/** ================= Wallet ICAO (Fase B · 20-sep-2026) =================
 *  Toda escritura al libro pasa por la RPC `wallet_mover` (bloqueo + saldo).
 *  El saldo nunca se guarda: es la suma de movimientos.
 * ====================================================================== */

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion, puede } from "@/lib/session";
import { METODOS, eur, esDivisa, type Metodo } from "@/lib/money";

const METODOS_RECARGA: Metodo[] = ["efectivo_usd", "efectivo_bs", "bs_pago_movil", "tdd", "tdc", "zelle", "binance"];

async function supervisorPorPin(pin: string) {
  const { data } = await supabaseAdmin().rpc("verificar_pin", { p_pin: pin });
  const a = data?.[0];
  return a && ["supervisor", "admin"].includes(a.rol) ? a : null;
}

export async function infoWallet(clienteId: number) {
  if (!leerSesion()) return { ok: false as const, error: "Sesión expirada" };
  const db = supabaseAdmin();
  const { data: c } = await db.from("clientes")
    .select("id,nombre,telefono,es_generico,wallet_pin_hash,wallet_bloqueo_hasta").eq("id", clienteId).single();
  if (!c) return { ok: false as const, error: "Cliente no encontrado" };
  if (c.es_generico) return { ok: false as const, error: "Los clientes genéricos no tienen wallet" };
  const { data: saldo } = await db.rpc("wallet_saldo", { p_cliente: clienteId });
  const { data: movs } = await db.from("wallet_movimientos")
    .select("id,tipo,monto_eur,metodo,monto_original,moneda,referencia,nota,ts,tickets(correlativo)")
    .eq("cliente_id", clienteId).order("ts", { ascending: false }).limit(15);
  return {
    ok: true as const,
    cliente: { id: c.id, nombre: c.nombre, telefono: c.telefono },
    saldoEur: Number(saldo ?? 0),
    tienePin: !!c.wallet_pin_hash,
    bloqueado: !!c.wallet_bloqueo_hasta && new Date(c.wallet_bloqueo_hasta) > new Date(),
    movimientos: movs ?? [],
  };
}

export async function recargarWallet(input: {
  clienteId: number; metodo: Metodo; montoOriginal: number; referencia?: string; pinNuevo?: string;
}) {
  const ses = leerSesion();
  if (!ses) return { ok: false as const, error: "Sesión expirada" };
  if (!METODOS_RECARGA.includes(input.metodo)) return { ok: false as const, error: "Método de recarga inválido" };
  const monto = Math.round(Number(input.montoOriginal) * 100) / 100;
  if (!(monto > 0)) return { ok: false as const, error: "El monto debe ser mayor a cero" };
  if (METODOS[input.metodo].refObligatoria && !input.referencia?.trim())
    return { ok: false as const, error: `${METODOS[input.metodo].label} exige referencia` };

  const db = supabaseAdmin();
  const { data: turno } = await db.from("turnos")
    .select("id,tasa_eur_bs,tasa_eur_usd_cash").eq("estado", "abierto").maybeSingle();
  if (!turno) return { ok: false as const, error: "Abre un turno para recargar: la plata entra a la caja" };

  const { data: c } = await db.from("clientes").select("wallet_pin_hash,es_generico").eq("id", input.clienteId).single();
  if (!c || c.es_generico) return { ok: false as const, error: "Ese cliente no puede tener wallet" };

  // Primera recarga: el cliente elige su PIN en la tablet.
  if (!c.wallet_pin_hash) {
    if (!input.pinNuevo) return { ok: false as const, error: "El cliente debe crear su PIN de 4 dígitos", pedirPin: true };
    const { error: ePin } = await db.rpc("wallet_set_pin", { p_cliente: input.clienteId, p_pin: input.pinNuevo });
    if (ePin) return { ok: false as const, error: ePin.message };
  }

  const moneda = METODOS[input.metodo].moneda;
  const tasa = moneda === "BS" ? Number(turno.tasa_eur_bs) : Number(turno.tasa_eur_usd_cash);
  const montoEur = eur(monto / tasa);

  const { data: recId, error: eR } = await db.rpc("wallet_mover", {
    p_cliente: input.clienteId, p_tipo: "recarga", p_monto_eur: montoEur,
    p_metodo: input.metodo, p_moneda: moneda, p_monto_original: monto, p_tasa: tasa,
    p_referencia: input.referencia?.trim() || null, p_turno: turno.id, p_empleado: ses.empleadoId,
  });
  if (eR) return { ok: false as const, error: eR.message };

  // Bono por recargar en divisa (reemplaza el descuento divisa en la wallet)
  let bonoEur = 0;
  if (esDivisa(input.metodo)) {
    const { data: cfg } = await db.from("config").select("valor").eq("clave", "wallet_bono_divisa_pct").maybeSingle();
    const pct = Number(cfg?.valor ?? 0);
    bonoEur = eur(montoEur * pct / 100);
    if (bonoEur > 0) {
      const { error: eB } = await db.rpc("wallet_mover", {
        p_cliente: input.clienteId, p_tipo: "bono", p_monto_eur: bonoEur, p_turno: turno.id,
        p_recarga: recId, p_nota: `Bono ${pct}% recarga en divisa`, p_empleado: ses.empleadoId,
      });
      if (eB) console.error("[recargarWallet] bono:", eB.message);
    }
  }

  await db.from("audit_log").insert({
    tabla: "wallet_movimientos", registro_id: String(recId), accion: "wallet_recarga",
    valores_despues: { cliente_id: input.clienteId, metodo: input.metodo, monto, bono_eur: bonoEur },
    empleado_id: ses.empleadoId,
  });
  revalidatePath("/wallet");
  return { ok: true as const, montoEur, bonoEur };
}

/** El cliente olvidó el PIN: lo resetea un supervisor. */
export async function resetPinWallet(input: { clienteId: number; pinNuevo: string; pinSupervisor: string }) {
  const ses = leerSesion();
  if (!ses) return { ok: false as const, error: "Sesión expirada" };
  const sup = await supervisorPorPin(input.pinSupervisor);
  if (!sup) return { ok: false as const, error: "PIN de supervisor inválido" };
  const db = supabaseAdmin();
  const { error } = await db.rpc("wallet_set_pin", { p_cliente: input.clienteId, p_pin: input.pinNuevo });
  if (error) return { ok: false as const, error: error.message };
  await db.from("audit_log").insert({
    tabla: "clientes", registro_id: String(input.clienteId), accion: "wallet_reset_pin",
    valores_despues: { autorizo: sup.nombre }, empleado_id: ses.empleadoId,
  });
  return { ok: true as const };
}

/** Corrección manual (±) con PIN de supervisor y nota obligatoria. */
export async function ajustarWallet(input: { clienteId: number; montoUsd: number; nota: string; pinSupervisor: string }) {
  const ses = leerSesion();
  if (!ses) return { ok: false as const, error: "Sesión expirada" };
  if (!input.nota?.trim()) return { ok: false as const, error: "La nota es obligatoria" };
  const sup = await supervisorPorPin(input.pinSupervisor);
  if (!sup) return { ok: false as const, error: "PIN de supervisor inválido" };
  const db = supabaseAdmin();
  const { data: cfg } = await db.from("config").select("valor").eq("clave", "tasa_eur_usd_cash").maybeSingle();
  const montoEur = eur(Number(input.montoUsd) / Number(cfg?.valor ?? 1));
  if (!montoEur) return { ok: false as const, error: "Monto inválido" };
  const { data: id, error } = await db.rpc("wallet_mover", {
    p_cliente: input.clienteId, p_tipo: "ajuste", p_monto_eur: montoEur,
    p_nota: `${input.nota.trim()} (autorizó ${sup.nombre})`, p_empleado: ses.empleadoId,
  });
  if (error) return { ok: false as const, error: error.message };
  await db.from("audit_log").insert({
    tabla: "wallet_movimientos", registro_id: String(id), accion: "wallet_ajuste",
    valores_despues: { monto_eur: montoEur, nota: input.nota, autorizo: sup.nombre }, empleado_id: ses.empleadoId,
  });
  revalidatePath("/wallet");
  return { ok: true as const };
}

/** KPIs de la wallet (supervisor+): lo que ICAO debe y el movimiento de 30 días. */
export async function kpisWallet() {
  const ses = leerSesion();
  if (!ses || !puede(ses.rol, "supervisor")) return null;
  const db = supabaseAdmin();
  const { data } = await db.from("wallet_movimientos").select("tipo,monto_eur,ts,cliente_id");
  const hace30 = Date.now() - 30 * 86400000;
  const k = { pasivoEur: 0, clientes: 0, recargas30: 0, bonos30: 0, consumos30: 0, vueltos30: 0 };
  const cl = new Set<number>();
  for (const m of data ?? []) {
    const v = Number(m.monto_eur);
    k.pasivoEur += v; cl.add(m.cliente_id);
    if (new Date(m.ts).getTime() >= hace30) {
      if (m.tipo === "recarga") k.recargas30 += v;
      if (m.tipo === "bono") k.bonos30 += v;
      if (m.tipo === "consumo") k.consumos30 += -v;
      if (m.tipo === "vuelto") k.vueltos30 += v;
    }
  }
  k.clientes = cl.size;
  for (const key of Object.keys(k) as (keyof typeof k)[]) k[key] = Math.round(k[key] * 100) / 100;
  return k;
}
