import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion, cerrarSesion, puede } from "@/lib/session";
import { obtenerTasaBcv } from "@/lib/tasa";
import { fmtBs, fmtEur } from "@/lib/money";
import FormAbrirTurno from "@/components/FormAbrirTurno";

export const dynamic = "force-dynamic";

export default async function TurnoPage({ searchParams }: { searchParams: { e?: string } }) {
  const s = leerSesion();
  if (!s) redirect("/login");
  const db = supabaseAdmin();

  const { data: turno } = await db
    .from("turnos").select("*, empleados(nombre)")
    .eq("estado", "abierto").maybeSingle();

  // Tasa sugerida solo si hay que abrir turno.
  let sugerida: { valor: number; fuente: string } | null = null;
  if (!turno) {
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: guardada } = await db
      .from("tasas").select("*").eq("fecha", hoy)
      .order("capturada_ts", { ascending: false }).limit(1).maybeSingle();

    if (guardada) sugerida = { valor: Number(guardada.eur_bs), fuente: guardada.fuente };
    else {
      const r = await obtenerTasaBcv();
      if (r.ok) {
        await db.from("tasas").upsert({ fecha: hoy, eur_bs: r.eurBs, fuente: r.fuente });
        sugerida = { valor: r.eurBs, fuente: r.fuente };
      }
    }
  }

  async function abrir(formData: FormData) {
    "use server";
    const ses = leerSesion();
    if (!ses) redirect("/login");
    const tasa = Number(formData.get("tasa"));
    const fuente = String(formData.get("fuente") || "manual");
    const { error } = await supabaseAdmin().rpc("abrir_turno", {
      p_empleado_id: ses.empleadoId,
      p_tasa_eur_bs: tasa,
      p_fuente_tasa: fuente,
      p_fondo_bs: Number(formData.get("fondo_bs") || 0),
      p_fondo_usd: Number(formData.get("fondo_usd") || 0),
    });
    if (error) redirect("/turno?e=" + encodeURIComponent(error.message));
    redirect("/turno");
  }

  async function salir() {
    "use server";
    cerrarSesion();
    redirect("/login");
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-cafe-700">{s.rol}</p>
          <h1 className="text-2xl font-black text-cafe-800">{s.nombre}</h1>
        </div>
        <form action={salir}><button className="btn-sec text-sm">Salir</button></form>
      </header>

      {searchParams.e && (
        <p className="card p-4 text-sm font-semibold text-red-600">{searchParams.e}</p>
      )}

      {turno ? (
        <>
          <section className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Turno abierto</h2>
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 font-semibold">
                ACTIVO
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="label">Abierto por</dt>
                <dd className="font-semibold">{(turno as any).empleados?.nombre}</dd>
              </div>
              <div>
                <dt className="label">Desde</dt>
                <dd className="font-semibold">
                  {new Date(turno.apertura_ts).toLocaleString("es-VE")}
                </dd>
              </div>
              <div>
                <dt className="label">Tasa EUR/Bs (congelada)</dt>
                <dd className="font-semibold text-lg">{Number(turno.tasa_eur_bs).toFixed(2)}</dd>
              </div>
              <div>
                <dt className="label">Fuente</dt>
                <dd>
                  {turno.fuente_tasa === "manual" ? (
                    <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-900 text-xs font-bold">
                      TASA MANUAL
                    </span>
                  ) : (
                    <span className="text-cafe-700">{turno.fuente_tasa}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="label">Fondo Bs</dt>
                <dd className="font-semibold">{fmtBs(Number(turno.fondo_bs))}</dd>
              </div>
              <div>
                <dt className="label">Fondo USD</dt>
                <dd className="font-semibold">${Number(turno.fondo_usd).toFixed(2)}</dd>
              </div>
            </dl>

            <p className="text-xs text-cafe-700">
              Referencia: 1 café de {fmtEur(3.82)} ={" "}
              {fmtBs(Math.ceil(3.82 * Number(turno.tasa_eur_bs)))}
            </p>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <Link href="/venta" className="btn-acc grid place-items-center text-lg">Vender</Link>
            <Link href="/cierre" className="btn-sec grid place-items-center">Cerrar caja</Link>
          </div>
        </>
      ) : (
        <FormAbrirTurno accion={abrir} sugerida={sugerida} />
      )}

      {turno && (
        <Link href="/cuentas" className="block text-center text-sm text-cafe-700 underline">
          Cuentas abiertas
        </Link>
      )}

      {puede(s.rol, "supervisor") && (
        <div className="flex justify-center gap-6 text-sm text-cafe-700">
          <Link href="/productos" className="underline">Catálogo</Link>
          <Link href="/dashboard" className="underline">Dashboard</Link>
          {puede(s.rol, "admin") && <Link href="/clientes" className="underline">Clientes y socios</Link>}
        </div>
      )}
    </main>
  );
}
