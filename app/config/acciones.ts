"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion, puede } from "@/lib/session";

/** Parametros editables por admin. Cada cambio queda en audit_log. */
export async function guardarConfig(entrada: {
  pctDivisas: number;
  tasaEurUsdCash: number;
}) {
  const s = leerSesion();
  if (!s) return { ok: false as const, error: "Sesion vencida" };
  if (!puede(s.rol, "admin"))
    return { ok: false as const, error: "Solo un admin puede cambiar estos parametros" };

  const pct = Number(entrada.pctDivisas);
  const tasa = Number(entrada.tasaEurUsdCash);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100)
    return { ok: false as const, error: "El porcentaje debe estar entre 0 y 100" };
  if (!Number.isFinite(tasa) || tasa <= 0 || tasa > 100)
    return { ok: false as const, error: "La tasa EUR/USD cash no es valida" };

  const db = supabaseAdmin();

  // --- % de divisas: vive en motivos_descuento id=2 (fuente unica)
  const { data: antesPct } = await db
    .from("motivos_descuento").select("pct").eq("id", 2).maybeSingle();
  const pctAntes = Number(antesPct?.pct ?? 0);

  if (pctAntes !== pct) {
    const { error } = await db
      .from("motivos_descuento").update({ pct }).eq("id", 2);
    if (error) return { ok: false as const, error: error.message };
    await db.from("audit_log").insert({
      tabla: "motivos_descuento", registro_id: "2", accion: "update",
      valores_antes: { pct: pctAntes }, valores_despues: { pct },
      empleado_id: s.empleadoId,
    });
  }

  // --- tasa EUR/USD cash: vive en config
  const { data: antesTasa } = await db
    .from("config").select("valor").eq("clave", "tasa_eur_usd_cash").maybeSingle();
  const tasaAntes = Number(antesTasa?.valor ?? 0);

  if (tasaAntes !== tasa) {
    const { error } = await db
      .from("config").update({ valor: String(tasa), updated_at: new Date().toISOString() })
      .eq("clave", "tasa_eur_usd_cash");
    if (error) return { ok: false as const, error: error.message };
    await db.from("audit_log").insert({
      tabla: "config", registro_id: "tasa_eur_usd_cash", accion: "update",
      valores_antes: { valor: String(tasaAntes) }, valores_despues: { valor: String(tasa) },
      empleado_id: s.empleadoId,
    });
  }

  revalidatePath("/config");
  revalidatePath("/venta");
  return { ok: true as const, sinCambios: pctAntes === pct && tasaAntes === tasa };
}
