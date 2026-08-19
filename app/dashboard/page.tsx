import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion, puede } from "@/lib/session";
import { METODOS, fmtEur, fmtBs, type Metodo } from "@/lib/money";

export const dynamic = "force-dynamic";

const fmtMoneda = (m: string, n: number) =>
  m === "BS" ? fmtBs(n) : m === "USD" ? `$${n.toFixed(2)}` : fmtEur(n);

export default async function DashboardPage() {
  const s = leerSesion();
  if (!s) redirect("/login");
  if (!puede(s.rol, "supervisor")) redirect("/turno?e=Sin permisos para el dashboard");

  const db = supabaseAdmin();

  const { data: turno } = await db
    .from("turnos").select("*").order("id", { ascending: false }).limit(1).maybeSingle();
  if (!turno) redirect("/turno?e=" + encodeURIComponent("Todavía no hay turnos"));

  const [{ data: resumen }, { data: porEmpleado }, { data: top }] = await Promise.all([
    db.rpc("resumen_turno", { p_turno_id: turno.id }),
    db.rpc("ventas_por_empleado", { p_turno_id: turno.id }),
    db.rpc("top_productos", { p_turno_id: turno.id, p_limite: 8 }),
  ]);

  const { data: tickets } = await db
    .from("tickets")
    .select("total_eur,descuento_eur,estado,clientes(es_generico)")
    .eq("turno_id", turno.id);

  const pagados = (tickets ?? []).filter((t: any) => t.estado === "pagado");
  const abiertos = (tickets ?? []).filter((t: any) => t.estado === "abierto");
  const totalEur = pagados.reduce((a: number, t: any) => a + Number(t.total_eur), 0);
  const descuentos = pagados.reduce((a: number, t: any) => a + Number(t.descuento_eur), 0);
  const genericos = pagados.filter((t: any) => t.clientes?.es_generico).length;
  const ticketProm = pagados.length ? totalEur / pagados.length : 0;
  const pctGenerico = pagados.length ? Math.round((genericos / pagados.length) * 100) : 0;
  const maxMetodo = Math.max(1, ...(resumen ?? []).map((r: any) => Number(r.total_eur)));

  const kpis = [
    { t: "Vendido", v: fmtEur(totalEur), s: fmtBs(Math.ceil(totalEur * Number(turno.tasa_eur_bs))) },
    { t: "Tickets", v: String(pagados.length), s: abiertos.length ? `${abiertos.length} sin cobrar` : "todos cobrados" },
    { t: "Ticket promedio", v: fmtEur(ticketProm), s: "por venta" },
    { t: "Descuentos", v: fmtEur(descuentos), s: totalEur ? `${Math.round(descuentos / (totalEur + descuentos) * 100)}% del bruto` : "—" },
  ];

  return (
    <main className="max-w-4xl mx-auto p-4 lg:p-6 space-y-5">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-cafe-800">Dashboard</h1>
          <p className="text-sm text-cafe-700">
            Turno #{turno.id} · {turno.estado === "abierto" ? "ABIERTO" : "cerrado"} ·
            tasa {Number(turno.tasa_eur_bs).toFixed(2)} Bs/€
          </p>
        </div>
        <div className="flex gap-2">
          {turno.estado === "abierto" && puede(s.rol, "supervisor") && (
            <Link href="/cierre" className="btn-acc text-sm">Cerrar caja</Link>
          )}
          <Link href="/turno" className="btn-sec text-sm">Volver</Link>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.t} className="card p-4">
            <p className="label">{k.t}</p>
            <p className="text-2xl font-black tabular-nums">{k.v}</p>
            <p className="text-xs text-cafe-700">{k.s}</p>
          </div>
        ))}
      </div>

      <section className="card p-4 space-y-3">
        <h2 className="font-black">Por método de pago</h2>
        {!resumen?.length && <p className="text-sm text-cafe-700">Sin cobros todavía.</p>}
        {(resumen ?? []).map((r: any) => {
          const eurTot = Number(r.total_eur);
          return (
            <div key={r.metodo} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">{METODOS[r.metodo as Metodo]?.label ?? r.metodo}</span>
                <span className="tabular-nums">
                  {fmtMoneda(r.moneda, Number(r.total_original))}
                  <span className="text-cafe-700"> · {fmtEur(eurTot)}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-cafe-200 overflow-hidden">
                <div className="h-full bg-cafe-800" style={{ width: `${(eurTot / maxMetodo) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="card p-4 space-y-2">
          <h2 className="font-black">Por barista</h2>
          {!porEmpleado?.length && <p className="text-sm text-cafe-700">Sin ventas.</p>}
          {(porEmpleado ?? []).map((e: any) => (
            <div key={e.empleado} className="flex justify-between text-sm border-b border-cafe-200 pb-1">
              <span>{e.empleado} <span className="text-cafe-700">· {e.tickets} tickets</span></span>
              <span className="font-bold tabular-nums">{fmtEur(Number(e.total_eur))}</span>
            </div>
          ))}
          <p className="text-xs text-cafe-700 pt-1">
            Se atribuye a quien agregó los productos, no a quien abrió el turno.
          </p>
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-black">Más vendidos</h2>
          {!top?.length && <p className="text-sm text-cafe-700">Sin ventas.</p>}
          {(top ?? []).map((p: any) => (
            <div key={p.producto} className="flex justify-between text-sm border-b border-cafe-200 pb-1">
              <span className="truncate mr-2">{Number(p.unidades)}× {p.producto}</span>
              <span className="font-bold tabular-nums whitespace-nowrap">{fmtEur(Number(p.total_eur))}</span>
            </div>
          ))}
        </section>
      </div>

      <section className="card p-4">
        <div className="flex justify-between items-baseline">
          <h2 className="font-black">Clientes sin identificar</h2>
          <span className="text-2xl font-black">{pctGenerico}%</span>
        </div>
        <p className="text-sm text-cafe-700">
          {genericos} de {pagados.length} tickets fueron a un cliente genérico.
          {pctGenerico > 60 && pagados.length >= 5 &&
            " Si no hubo cola real, alguien dejó de preguntar el nombre."}
        </p>
      </section>
    </main>
  );
}
