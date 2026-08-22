"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion, puede } from "@/lib/session";

export type Rango = { desde: string; hasta: string };

/** Todo el reporte de un rango, en una sola llamada. */
export async function cargarReporte(r: Rango) {
  const s = leerSesion();
  if (!s) return { ok: false as const, error: "Sesion vencida" };
  if (!puede(s.rol, "supervisor"))
    return { ok: false as const, error: "Sin permisos" };

  const db = supabaseAdmin();
  const [resumen, metodos, porDia, descuentos, turnos] = await Promise.all([
    db.rpc("reporte_rango", { p_desde: r.desde, p_hasta: r.hasta }),
    db.rpc("reporte_metodos", { p_desde: r.desde, p_hasta: r.hasta }),
    db.rpc("reporte_por_dia", { p_desde: r.desde, p_hasta: r.hasta }),
    db.rpc("reporte_descuentos", { p_desde: r.desde, p_hasta: r.hasta }),
    db.rpc("reporte_turnos", { p_desde: r.desde, p_hasta: r.hasta }),
  ]);

  const fallo = [resumen, metodos, porDia, descuentos, turnos].find((x) => x.error);
  if (fallo?.error) return { ok: false as const, error: fallo.error.message };

  return {
    ok: true as const,
    resumen: resumen.data?.[0] ?? null,
    metodos: metodos.data ?? [],
    porDia: porDia.data ?? [],
    descuentos: descuentos.data ?? [],
    turnos: turnos.data ?? [],
  };
}

/** Z de un turno: cabecera + conceptos declarados vs esperados. */
export async function cargarZ(turnoId: number) {
  const s = leerSesion();
  if (!s) return { ok: false as const, error: "Sesion vencida" };
  if (!puede(s.rol, "supervisor"))
    return { ok: false as const, error: "Sin permisos" };

  const db = supabaseAdmin();
  const [cab, lineas] = await Promise.all([
    db.rpc("reporte_z_cabecera", { p_turno_id: turnoId }),
    db.rpc("reporte_z", { p_turno_id: turnoId }),
  ]);
  if (cab.error) return { ok: false as const, error: cab.error.message };
  if (lineas.error) return { ok: false as const, error: lineas.error.message };

  return {
    ok: true as const,
    cabecera: cab.data?.[0] ?? null,
    lineas: lineas.data ?? [],
  };
}
