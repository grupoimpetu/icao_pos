"use server";

/** POS — Pre-orders (Fase C3). Entregar crea el ticket del día (pago 'preorden', no entra a gaveta)
 *  y acredita puntos. Todo ocurre en una sola función SQL (atómica). */

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion } from "@/lib/session";

export async function entregarPreorden(preordenId: number) {
  const s = leerSesion();
  if (!s) return { ok: false as const, error: "Sesión expirada" };
  const db = supabaseAdmin();
  const { data: turno } = await db.from("turnos").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) return { ok: false as const, error: "Abre un turno antes de entregar" };

  const { data, error } = await db.rpc("preorden_entregar", {
    p_preorden: preordenId, p_turno: turno.id, p_empleado: s.empleadoId, p_no_show: false,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/preordenes");
  return { ok: true as const, correlativo: String(data) };
}

export async function marcarPreorden(preordenId: number, estado: "lista" | "no_show") {
  const s = leerSesion();
  if (!s) return { ok: false as const, error: "Sesión expirada" };
  const db = supabaseAdmin();
  let error: { message: string } | null = null;
  if (estado === "lista") {
    ({ error } = await db.rpc("preorden_marcar", { p_preorden: preordenId, p_estado: "lista", p_empleado: s.empleadoId }));
  } else {
    /* No-show: igual se registra la venta (la comida se hizo), sin puntos */
    const { data: turno } = await db.from("turnos").select("id").eq("estado", "abierto").maybeSingle();
    if (!turno) return { ok: false as const, error: "Abre un turno primero" };
    ({ error } = await db.rpc("preorden_entregar", {
      p_preorden: preordenId, p_turno: turno.id, p_empleado: s.empleadoId, p_no_show: true,
    }));
  }
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/preordenes");
  return { ok: true as const };
}
