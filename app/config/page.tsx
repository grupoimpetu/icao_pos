import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion, puede } from "@/lib/session";
import FormConfig from "@/components/FormConfig";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const s = leerSesion();
  if (!s) redirect("/login");
  if (!puede(s.rol, "admin")) redirect("/turno?e=Solo admin");

  const db = supabaseAdmin();
  const { data: mDiv } = await db
    .from("motivos_descuento").select("pct").eq("id", 2).maybeSingle();
  const { data: cfg } = await db
    .from("config").select("valor").eq("clave", "tasa_eur_usd_cash").maybeSingle();

  const { data: log } = await db
    .from("audit_log")
    .select("tabla, valores_antes, valores_despues, ts, empleado_id")
    .in("tabla", ["config", "motivos_descuento"])
    .order("ts", { ascending: false })
    .limit(8);

  return (
    <main className="min-h-screen p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-cafe-700">Admin</p>
          <h1 className="text-2xl font-black text-cafe-800">Parámetros</h1>
        </div>
        <Link href="/turno" className="btn-sec text-sm">Volver</Link>
      </header>

      <FormConfig
        pctDivisas={Number(mDiv?.pct ?? 0)}
        tasaEurUsdCash={Number(cfg?.valor ?? 1)}
      />

      <section className="card p-4">
        <h2 className="font-black text-cafe-800 mb-2">Últimos cambios</h2>
        {!log?.length && <p className="text-sm text-cafe-700">Sin cambios registrados.</p>}
        {log?.map((r: any, i: number) => (
          <div key={i} className="text-xs text-cafe-700 border-b border-cafe-200 py-2 last:border-0">
            <span className="font-semibold">{r.tabla}</span>
            {" · "}
            {JSON.stringify(r.valores_antes)} → {JSON.stringify(r.valores_despues)}
            <span className="block">
              Empleado #{r.empleado_id} · {new Date(r.ts).toLocaleString("es-VE")}
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
