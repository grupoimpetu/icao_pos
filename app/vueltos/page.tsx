import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion, puede } from "@/lib/session";
import AccionVuelto from "@/components/AccionVuelto";

export const dynamic = "force-dynamic";

const bs = (n: number) => `Bs ${Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso: string) => new Date(iso).toLocaleString("es-VE", { timeZone: "America/Caracas" });

export default async function VueltosPage() {
  const s = leerSesion();
  if (!s) redirect("/login");
  if (!puede(s.rol, "supervisor")) redirect("/turno?e=Solo supervisor o admin");
  const esAdmin = puede(s.rol, "admin");

  const db = supabaseAdmin();
  const sel = "id,monto_original,monto_eur,pm_telefono,pm_cedula,pm_banco,estado,referencia_pago,nota,creado_ts,resuelto_ts,tickets(correlativo,clientes(nombre))";
  const { data: pend } = await db.from("vueltos").select(sel)
    .eq("metodo", "bs_pago_movil").eq("estado", "pendiente").order("creado_ts");
  const { data: hechos } = await db.from("vueltos").select(sel)
    .eq("metodo", "bs_pago_movil").neq("estado", "pendiente")
    .order("resuelto_ts", { ascending: false }).limit(20);

  const totalPend = (pend ?? []).reduce((a, v: any) => a + Number(v.monto_original), 0);

  return (
    <main className="max-w-3xl mx-auto p-4 lg:p-6 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-cafe-800">Vueltos por Pago Móvil</h1>
          <p className="text-sm text-cafe-700">Lo que ICAO le debe a clientes que pagaron de más.</p>
        </div>
        <Link href="/turno" className="btn-sec text-sm">Volver</Link>
      </header>

      <div className="card p-4 flex items-center justify-between">
        <span className="font-bold">Pendientes: {pend?.length ?? 0}</span>
        <span className="text-2xl font-black text-orange-700">{bs(totalPend)}</span>
      </div>

      {(pend ?? []).map((v: any) => (
        <div key={v.id} className="card p-4 space-y-3 border-orange-300">
          <div className="flex justify-between gap-3 flex-wrap">
            <div>
              <p className="font-bold">{v.tickets?.clientes?.nombre ?? "—"}</p>
              <p className="text-xs text-cafe-700">{v.tickets?.correlativo} · {fecha(v.creado_ts)}</p>
            </div>
            <p className="text-2xl font-black tabular-nums">{bs(v.monto_original)}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm bg-cafe-50 rounded-lg p-2 select-all">
            <div><p className="text-xs text-cafe-700">Teléfono</p><p className="font-bold">{v.pm_telefono}</p></div>
            <div><p className="text-xs text-cafe-700">Cédula</p><p className="font-bold">{v.pm_cedula}</p></div>
            <div><p className="text-xs text-cafe-700">Banco</p><p className="font-bold">{v.pm_banco}</p></div>
          </div>
          {esAdmin
            ? <AccionVuelto id={v.id} telefono={v.pm_telefono} montoBs={bs(v.monto_original)} />
            : <p className="text-xs text-cafe-700">Solo admin puede marcarlo como pagado.</p>}
        </div>
      ))}
      {!pend?.length && <p className="card p-4 text-sm text-green-700 font-bold">No hay vueltos pendientes ✓</p>}

      {!!hechos?.length && (
        <section className="card">
          <h2 className="p-3 font-black bg-cafe-800 text-white rounded-t-2xl">Últimos resueltos</h2>
          {hechos.map((v: any) => (
            <div key={v.id} className="p-3 border-b border-cafe-200 last:border-0 flex justify-between gap-3 text-sm">
              <div>
                <p className="font-semibold">{v.tickets?.clientes?.nombre ?? "—"} · {v.tickets?.correlativo}</p>
                <p className="text-xs text-cafe-700">
                  {v.estado === "pagado" ? `Pagado · ref ${v.referencia_pago}` : `Anulado · ${v.nota}`} · {v.resuelto_ts && fecha(v.resuelto_ts)}
                </p>
              </div>
              <p className={`font-bold tabular-nums ${v.estado === "pagado" ? "text-green-700" : "text-cafe-700 line-through"}`}>
                {bs(v.monto_original)}
              </p>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
