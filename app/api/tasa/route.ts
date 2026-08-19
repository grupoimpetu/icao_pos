import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { obtenerTasaBcv } from "@/lib/tasa";

export const dynamic = "force-dynamic";

/** Cron 6:00am (vercel.json). Guarda la tasa del día en la tabla `tasas`.
 *  Si falla, NO inventa nada: devuelve 503 y el turno se abre con captura manual. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const r = await obtenerTasaBcv();
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 503 });

  const fecha = new Date().toISOString().slice(0, 10);
  const { error } = await supabaseAdmin()
    .from("tasas")
    .upsert({ fecha, eur_bs: r.eurBs, fuente: r.fuente }, { onConflict: "fecha,fuente" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, fecha, eur_bs: r.eurBs, fuente: r.fuente });
}
