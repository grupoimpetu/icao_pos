import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion } from "@/lib/session";
import { fmtEur, fmtBs } from "@/lib/money";
import CobrarCuenta from "@/components/CobrarCuenta";

export const dynamic = "force-dynamic";

export default async function CuentasPage({ searchParams }: { searchParams: { e?: string } }) {
  const s = leerSesion();
  if (!s) redirect("/login");
  const db = supabaseAdmin();

  const { data: turno } = await db
    .from("turnos").select("*").eq("estado", "abierto").maybeSingle();
  if (!turno) redirect("/turno?e=" + encodeURIComponent("No hay turno abierto"));

  const { data: abiertos, error } = await db
    .from("tickets")
    .select("id,correlativo,total_eur,abierto_ts,motivo_descuento,clientes(nombre,telefono),ticket_items(cant,precio_unit_eur,productos(nombre))")
    .eq("turno_id", turno.id).eq("estado", "abierto")
    .order("abierto_ts");
  if (error) console.error("[cuentas]", error.message);

  const tasaBs = Number(turno.tasa_eur_bs);
  const ahora = Date.now();

  return (
    <main className="max-w-4xl mx-auto p-4 lg:p-6 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-cafe-800">Cuentas abiertas</h1>
          <p className="text-sm text-cafe-700">
            {abiertos?.length ?? 0} sin cobrar · turno #{turno.id}
          </p>
        </div>
        <Link href="/venta" className="btn-acc">Volver a vender</Link>
      </header>

      {searchParams.e && (
        <p className="card p-4 text-sm font-semibold text-red-600">{searchParams.e}</p>
      )}

      {!abiertos?.length && (
        <div className="card p-8 text-center space-y-2">
          <p className="text-4xl">✓</p>
          <p className="font-bold">No hay cuentas abiertas</p>
          <p className="text-sm text-cafe-700">
            Todo lo vendido en este turno está cobrado. Así debe verse casi siempre.
          </p>
        </div>
      )}

      {abiertos?.map((t: any) => {
        const horas = (ahora - new Date(t.abierto_ts).getTime()) / 3_600_000;
        // Semáforo por antigüedad: una cuenta vieja es plata que se pierde.
        const tono = horas >= 3 ? "bg-red-100 text-red-800"
                   : horas >= 1 ? "bg-yellow-100 text-yellow-900"
                   : "bg-green-100 text-green-800";
        const edad = horas < 1 ? `${Math.round(horas * 60)} min` : `${horas.toFixed(1)} h`;

        return (
          <section key={t.id} className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-black text-lg truncate">{t.clientes?.nombre}</p>
                <p className="text-xs text-cafe-700">
                  {t.correlativo} · abierta {new Date(t.abierto_ts).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${tono}`}>{edad}</span>
            </div>

            <div className="text-sm">
              {t.ticket_items?.map((i: any, k: number) => (
                <div key={k} className="flex justify-between">
                  <span>{i.cant}× {i.productos?.nombre}</span>
                  <span className="tabular-nums">{fmtEur(i.cant * Number(i.precio_unit_eur))}</span>
                </div>
              ))}
            </div>

            <div className="flex items-end justify-between border-t border-cafe-200 pt-2">
              <div>
                <p className="text-2xl font-black">{fmtEur(Number(t.total_eur))}</p>
                <p className="text-sm text-cafe-700">{fmtBs(Math.ceil(Number(t.total_eur) * tasaBs))}</p>
              </div>
              <CobrarCuenta
                ticketId={t.id}
                correlativo={t.correlativo}
                cliente={t.clientes?.nombre ?? ""}
                totalEur={Number(t.total_eur)}
                tasaEurBs={tasaBs}
                tasaEurUsd={Number(turno.tasa_eur_usd_cash)}
              />
            </div>
          </section>
        );
      })}
    </main>
  );
}
