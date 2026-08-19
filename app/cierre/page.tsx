import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion, puede } from "@/lib/session";
import { METODOS, type Metodo } from "@/lib/money";
import FormCierre from "@/components/FormCierre";

export const dynamic = "force-dynamic";

export type Concepto = {
  concepto: string; metodo: string | null; moneda: "BS" | "USD" | "EUR";
  tipo: "efectivo" | "electronico"; esperado: number; nota: string;
};

export default async function CierrePage({ searchParams }: { searchParams: { e?: string } }) {
  const s = leerSesion();
  if (!s) redirect("/login");
  if (!puede(s.rol, "supervisor")) redirect("/turno?e=Solo supervisor o admin cierran caja");

  const db = supabaseAdmin();
  const { data: turno } = await db.from("turnos").select("*").eq("estado", "abierto").maybeSingle();
  if (!turno) redirect("/turno?e=" + encodeURIComponent("No hay turno abierto"));

  const { count: abiertos } = await db
    .from("tickets").select("id", { count: "exact", head: true })
    .eq("turno_id", turno.id).eq("estado", "abierto");

  const { data: resumen, error } = await db.rpc("resumen_turno", { p_turno_id: turno.id });
  if (error) console.error("[cierre] resumen_turno:", error.message);

  const porMetodo = new Map<string, { moneda: string; monto: number; eur: number }>();
  for (const r of resumen ?? []) {
    porMetodo.set(r.metodo, {
      moneda: r.moneda, monto: Number(r.total_original), eur: Number(r.total_eur),
    });
  }
  const totalEur = (resumen ?? []).reduce((a: number, r: any) => a + Number(r.total_eur), 0);

  /* ---------- EFECTIVO: se cuenta físico ---------- */
  const conceptos: Concepto[] = [];

  conceptos.push({
    concepto: "Efectivo Bs", metodo: "efectivo_bs", moneda: "BS", tipo: "efectivo",
    esperado: Number(turno.fondo_bs) + (porMetodo.get("efectivo_bs")?.monto ?? 0),
    nota: "Fondo inicial + cobros en billetes de bolívares, menos el vuelto entregado.",
  });
  conceptos.push({
    concepto: "Efectivo USD", metodo: "efectivo_usd", moneda: "USD", tipo: "efectivo",
    esperado: Number(turno.fondo_usd) + (porMetodo.get("efectivo_usd")?.monto ?? 0),
    nota: "Fondo inicial + cobros en dólares.",
  });
  conceptos.push({
    concepto: "Efectivo EUR", metodo: "efectivo_eur", moneda: "EUR", tipo: "efectivo",
    esperado: porMetodo.get("efectivo_eur")?.monto ?? 0,
    nota: "Cobros en euros.",
  });

  /* ---------- ELECTRÓNICO: se concilia contra lote / estado de cuenta ---------- */
  const electronicos: Metodo[] = ["bs_pago_movil", "tdd", "tdc", "zelle", "binance"];
  for (const m of electronicos) {
    const d = porMetodo.get(m);
    conceptos.push({
      concepto: METODOS[m].label, metodo: m,
      moneda: METODOS[m].moneda as any, tipo: "electronico",
      esperado: d?.monto ?? 0,
      nota: m === "tdd" || m === "tdc" ? "Comparar contra el lote del punto."
          : "Comparar contra el estado de cuenta.",
    });
  }

  return (
    <main className="max-w-3xl mx-auto p-4 lg:p-6 space-y-5">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-cafe-800">Cierre de caja</h1>
          <p className="text-sm text-cafe-700">
            Turno #{turno.id} · tasa {Number(turno.tasa_eur_bs).toFixed(2)} Bs/€
          </p>
        </div>
        <Link href="/turno" className="btn-sec text-sm">Volver</Link>
      </header>

      {searchParams.e && (
        <p className="card p-4 text-sm font-semibold text-red-600">{searchParams.e}</p>
      )}

      {!!abiertos && (
        <div className="card p-4 bg-yellow-50 border-yellow-300">
          <p className="font-bold text-yellow-900">
            Hay {abiertos} cuenta{abiertos > 1 ? "s" : ""} sin cobrar
          </p>
          <p className="text-sm text-yellow-900">
            No se puede cerrar el turno hasta resolverlas.{" "}
            <Link href="/cuentas" className="underline font-semibold">Ir a cuentas abiertas</Link>
          </p>
        </div>
      )}

      <FormCierre
        turnoId={turno.id}
        conceptos={conceptos}
        totalEur={Math.round(totalEur * 100) / 100}
        hayAbiertos={!!abiertos}
      />
    </main>
  );
}
