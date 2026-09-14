import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { obtenerTasaBcv } from "@/lib/tasa";

export const dynamic = "force-dynamic";

/** Dos crons (vercel.json):
 *    0 10 * * *  → 06:00 Caracas — captura de apertura.
 *    0 1  * * *  → 21:00 Caracas (día anterior) — CAPTURA NOCTURNA.
 *
 *  La nocturna existe por el caso SÁBADO: el BCV publica el viernes por la
 *  tarde la tasa que rige sábado, domingo y lunes. La corrida de las 6am del
 *  viernes es anterior a esa publicación, así que arrastraba la tasa vieja todo
 *  el fin de semana. Corriendo a las 9pm la nueva tasa queda guardada el mismo
 *  viernes y el turno del sábado la toma. Ver app/turno/page.tsx.
 *
 *  La fecha se calcula en horario de Caracas, NO en UTC (antes usaba
 *  toISOString(), que a partir de las 8pm de Caracas ya escribe el día siguiente).
 *  Si falla, NO inventa nada: devuelve 503 y el turno se abre con captura manual. */
const fechaCaracas = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const r = await obtenerTasaBcv();
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 503 });

  const fecha = fechaCaracas();
  const { error } = await supabaseAdmin()
    .from("tasas")
    .upsert(
      { fecha, eur_bs: r.eurBs, fuente: r.fuente, capturada_ts: new Date().toISOString() },
      { onConflict: "fecha,fuente" }
    );

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, fecha, eur_bs: r.eurBs, fuente: r.fuente });
}
