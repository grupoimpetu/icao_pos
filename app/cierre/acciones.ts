"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion, puede } from "@/lib/session";

export type DeclaracionEntrada = {
  concepto: string; metodo: string | null; moneda: string;
  tipo: "efectivo" | "electronico"; esperado: number; declarado: number; nota: string;
};

export async function cerrarCaja(input: { turnoId: number; declaraciones: DeclaracionEntrada[] }) {
  const ses = leerSesion();
  if (!ses) return { ok: false as const, error: "Sesión expirada" };
  // Barista habilitado para cerrar caja (decisión owner 29-ago).
  if (!puede(ses.rol, "barista"))
    return { ok: false as const, error: "Necesitas iniciar sesión para cerrar caja" };

  const db = supabaseAdmin();

  const { data: turno } = await db
    .from("turnos").select("id,estado").eq("id", input.turnoId).single();
  if (!turno || turno.estado !== "abierto")
    return { ok: false as const, error: "El turno ya está cerrado" };

  const { count: abiertos } = await db
    .from("tickets").select("id", { count: "exact", head: true })
    .eq("turno_id", input.turnoId).eq("estado", "abierto");
  if (abiertos)
    return { ok: false as const, error: `Quedan ${abiertos} cuenta(s) sin cobrar` };

  // Cada concepto se guarda por separado. Si hay descuadre sin nota,
  // la función de la base lanza excepción y el cierre no avanza.
  for (const d of input.declaraciones) {
    const { error } = await db.rpc("guardar_cierre", {
      p_turno_id: input.turnoId, p_concepto: d.concepto, p_metodo: d.metodo,
      p_moneda: d.moneda, p_tipo: d.tipo,
      p_esperado: d.esperado, p_declarado: d.declarado,
      p_nota: d.nota ?? "", p_empleado_id: ses.empleadoId,
    });
    if (error) {
      console.error("[cerrarCaja] guardar_cierre:", error.message);
      return { ok: false as const, error: error.message };
    }
  }

  const { error: eCierre } = await db.rpc("cerrar_turno", {
    p_turno_id: input.turnoId, p_empleado_id: ses.empleadoId,
  });
  if (eCierre) {
    console.error("[cerrarCaja] cerrar_turno:", eCierre.message);
    return { ok: false as const, error: eCierre.message };
  }

  const descuadres = input.declaraciones.filter(
    (d) => Math.abs(d.declarado - d.esperado) > 0.01
  ).length;

  return { ok: true as const, descuadres };
}
