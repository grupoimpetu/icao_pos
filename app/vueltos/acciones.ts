"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion, puede } from "@/lib/session";

/** Administración marca que ya hizo el Pago Móvil del vuelto. */
export async function marcarVueltoPagado(id: number, referencia: string) {
  const ses = leerSesion();
  if (!ses || !puede(ses.rol, "admin")) return { ok: false as const, error: "Solo admin" };
  if (!referencia?.trim()) return { ok: false as const, error: "La referencia del Pago Móvil es obligatoria" };

  const db = supabaseAdmin();
  const { data, error } = await db.from("vueltos")
    .update({ estado: "pagado", referencia_pago: referencia.trim(), resuelto_por: ses.empleadoId, resuelto_ts: new Date().toISOString() })
    .eq("id", id).eq("estado", "pendiente").select("id").maybeSingle();
  if (error || !data) return { ok: false as const, error: error?.message ?? "Ese vuelto ya no está pendiente" };

  await db.from("audit_log").insert({
    tabla: "vueltos", registro_id: String(id), accion: "vuelto_pagado",
    valores_despues: { referencia_pago: referencia.trim() }, empleado_id: ses.empleadoId,
  });
  revalidatePath("/vueltos");
  return { ok: true as const };
}

/** Anular un vuelto pendiente (ej. el cliente decidió dejarlo). Nota obligatoria. */
export async function anularVuelto(id: number, nota: string) {
  const ses = leerSesion();
  if (!ses || !puede(ses.rol, "admin")) return { ok: false as const, error: "Solo admin" };
  if (!nota?.trim()) return { ok: false as const, error: "Explica por qué se anula" };

  const db = supabaseAdmin();
  const { data, error } = await db.from("vueltos")
    .update({ estado: "anulado", nota: nota.trim(), resuelto_por: ses.empleadoId, resuelto_ts: new Date().toISOString() })
    .eq("id", id).eq("estado", "pendiente").select("id").maybeSingle();
  if (error || !data) return { ok: false as const, error: error?.message ?? "Ese vuelto ya no está pendiente" };

  await db.from("audit_log").insert({
    tabla: "vueltos", registro_id: String(id), accion: "vuelto_anulado",
    valores_despues: { nota: nota.trim() }, empleado_id: ses.empleadoId,
  });
  revalidatePath("/vueltos");
  return { ok: true as const };
}
