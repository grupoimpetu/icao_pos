import { redirect } from "next/navigation";
import Link from "next/link";
import { leerSesion } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import PreordenesPanel, { type PreordenPOS } from "@/components/PreordenesPanel";

export const dynamic = "force-dynamic";

const hoyCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const sumar = (f: string, n: number) => {
  const [y, m, d] = f.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export default async function PreordenesPage({ searchParams }: { searchParams: { fecha?: string } }) {
  const s = leerSesion();
  if (!s) redirect("/login");

  const hoy = hoyCaracas();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.fecha ?? "") ? searchParams.fecha! : hoy;

  const db = supabaseAdmin();
  const [{ data: peds }, { data: prod }, { data: turno }] = await Promise.all([
    db.from("preordenes")
      .select("id,codigo,franja,estado,metodo_pago,total_eur,nota,clientes(nombre,telefono),preorden_items(cant,productos(nombre)),tickets(correlativo)")
      .eq("fecha_retiro", fecha).in("estado", ["pagada", "lista", "entregada", "no_show"])
      .order("franja").order("id"),
    db.from("v_preorden_produccion").select("producto,unidades,pedidos").eq("fecha_retiro", fecha).order("producto"),
    db.from("turnos").select("id").eq("estado", "abierto").maybeSingle(),
  ]);

  const pedidos: PreordenPOS[] = ((peds ?? []) as any[]).map((p) => ({
    id: Number(p.id), codigo: p.codigo, franja: p.franja, estado: p.estado, metodo: p.metodo_pago,
    total: Number(p.total_eur), nota: p.nota, cliente: p.clientes?.nombre ?? "", telefono: p.clientes?.telefono ?? null,
    ticket: p.tickets?.correlativo ?? null,
    items: (p.preorden_items ?? []).map((i: any) => ({ nombre: i.productos?.nombre ?? "", cant: Number(i.cant) })),
  }));

  const dias = [-1, 0, 1, 2, 3].map((n) => sumar(hoy, n));
  const etiqueta = (f: string) => {
    const [y, m, d] = f.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d, 12));
    const txt = t.toLocaleDateString("es-VE", { weekday: "short", day: "numeric", timeZone: "UTC" });
    return f === hoy ? `Hoy · ${txt}` : txt;
  };

  return (
    <main className="max-w-3xl mx-auto p-4 lg:p-6 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-cafe-800">Pre-orders</h1>
          <p className="text-sm text-cafe-700">Bowls pagados por adelantado desde la app</p>
        </div>
        <Link href="/turno" className="btn-sec text-sm">Volver</Link>
      </header>

      <nav className="flex gap-2 overflow-x-auto">
        {dias.map((f) => (
          <Link key={f} href={`/preordenes?fecha=${f}`}
            className={`btn text-sm whitespace-nowrap ${f === fecha ? "bg-cafe-800 text-white" : "bg-cafe-200"}`}>
            {etiqueta(f)}
          </Link>
        ))}
      </nav>

      <section className="card p-4 space-y-2">
        <h2 className="font-bold text-cafe-800">Producción del día</h2>
        {(prod ?? []).length === 0 ? (
          <p className="text-sm text-cafe-700">Sin pedidos para esta fecha.</p>
        ) : (
          <ul className="divide-y">
            {(prod as any[]).map((r) => (
              <li key={r.producto} className="flex justify-between py-2">
                <span>{r.producto}</span>
                <span className="font-black tabular-nums">{r.unidades}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PreordenesPanel pedidos={pedidos} esHoy={fecha === hoy} hayTurno={!!turno} />
    </main>
  );
}
