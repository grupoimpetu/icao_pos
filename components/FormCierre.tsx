"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtEur } from "@/lib/money";
import { cerrarCaja } from "@/app/cierre/acciones";
import type { Concepto } from "@/app/cierre/page";

const simbolo = (m: string) => (m === "BS" ? "Bs" : m === "USD" ? "$" : "€");
const fmt = (m: string, n: number) =>
  m === "BS" ? `Bs ${Math.round(n).toLocaleString("es-VE")}` : `${simbolo(m)}${n.toFixed(2)}`;

export default function FormCierre({
  turnoId, conceptos, totalEur, hayAbiertos,
}: {
  turnoId: number; conceptos: Concepto[]; totalEur: number; hayAbiertos: boolean;
}) {
  const [decl, setDecl] = useState<Record<string, { declarado: string; nota: string }>>(
    Object.fromEntries(conceptos.map((c) => [c.concepto, { declarado: "", nota: "" }]))
  );
  const [err, setErr] = useState<string | null>(null);
  const [listo, setListo] = useState<number | null>(null);
  const [pend, start] = useTransition();
  const router = useRouter();

  const filas = useMemo(() => conceptos.map((c) => {
    const d = decl[c.concepto] ?? { declarado: "", nota: "" };
    const vacio = d.declarado.trim() === "";
    const declarado = vacio ? 0 : Number(d.declarado);
    const dif = declarado - c.esperado;
    return { ...c, declarado, vacio, dif, nota: d.nota, cuadra: Math.abs(dif) <= 0.01 };
  }), [conceptos, decl]);

  const sinContar = filas.filter((f) => f.vacio && f.esperado !== 0).length;
  const descuadresSinNota = filas.filter((f) => !f.cuadra && !f.nota.trim()).length;
  const descuadres = filas.filter((f) => !f.cuadra).length;

  if (listo !== null) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-4xl">{listo === 0 ? "✓" : "⚠"}</p>
        <h2 className="text-xl font-black">Turno cerrado</h2>
        <p className="text-sm text-cafe-700">
          {listo === 0
            ? "Todo cuadró. Nada que perseguir."
            : `${listo} concepto(s) con descuadre, cada uno con su nota. Revísalos mañana con calma.`}
        </p>
        <button onClick={() => router.push("/turno")} className="btn-acc w-full">Ir al turno</button>
      </div>
    );
  }

  const bloque = (tipo: "efectivo" | "electronico") => filas.filter((f) => f.tipo === tipo);

  const campo = (f: (typeof filas)[number]) => (
    <div key={f.concepto} className="p-3 border-b border-cafe-200 last:border-0 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-bold">{f.concepto}</p>
          <p className="text-xs text-cafe-700">{f.nota}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-cafe-700">Esperado</p>
          <p className="font-black tabular-nums">{fmt(f.moneda, f.esperado)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-cafe-700 w-8">{simbolo(f.moneda)}</span>
        <input
          type="number" step="0.01" inputMode="decimal" className="input"
          placeholder={f.tipo === "efectivo" ? "Cuenta y escribe aquí" : "Lo que dice el lote / estado"}
          value={decl[f.concepto]?.declarado ?? ""}
          onChange={(e) => setDecl((d) => ({ ...d, [f.concepto]: { ...d[f.concepto], declarado: e.target.value } }))}
        />
        {!f.vacio && (
          <span className={`text-sm font-bold whitespace-nowrap w-28 text-right ${
            f.cuadra ? "text-green-700" : f.dif > 0 ? "text-blue-700" : "text-red-600"}`}>
            {f.cuadra ? "cuadra ✓" : `${f.dif > 0 ? "sobra" : "falta"} ${fmt(f.moneda, Math.abs(f.dif))}`}
          </span>
        )}
      </div>

      {!f.vacio && !f.cuadra && (
        <input
          className="input border-red-300"
          placeholder="¿Por qué no cuadra? (obligatorio)"
          value={decl[f.concepto]?.nota ?? ""}
          onChange={(e) => setDecl((d) => ({ ...d, [f.concepto]: { ...d[f.concepto], nota: e.target.value } }))}
        />
      )}
    </div>
  );

  return (
    <>
      <div className="card p-4 flex items-center justify-between">
        <span className="font-bold">Vendido en el turno</span>
        <span className="text-2xl font-black">{fmtEur(totalEur)}</span>
      </div>

      <section className="card">
        <h2 className="p-3 font-black bg-cafe-800 text-white rounded-t-2xl">
          Efectivo · cuenta el dinero físico
        </h2>
        {bloque("efectivo").map(campo)}
      </section>

      <section className="card">
        <h2 className="p-3 font-black bg-cafe-500 text-white rounded-t-2xl">
          Electrónico · concilia contra lote o estado de cuenta
        </h2>
        {bloque("electronico").map(campo)}
      </section>

      {sinContar > 0 && (
        <p className="text-sm text-cafe-700">
          Faltan {sinContar} concepto(s) con movimiento por declarar. Los que están en cero
          puedes dejarlos vacíos.
        </p>
      )}
      {descuadresSinNota > 0 && (
        <p className="text-sm font-semibold text-red-600">
          {descuadresSinNota} descuadre(s) sin explicación. Sin nota no se cierra.
        </p>
      )}
      {err && <p className="card p-4 text-sm font-semibold text-red-600">{err}</p>}

      <button
        className="btn-acc w-full text-lg"
        disabled={pend || hayAbiertos || descuadresSinNota > 0}
        onClick={() => start(async () => {
          setErr(null);
          const r = await cerrarCaja({
            turnoId,
            declaraciones: filas.map((f) => ({
              concepto: f.concepto, metodo: f.metodo, moneda: f.moneda, tipo: f.tipo,
              esperado: f.esperado, declarado: f.declarado, nota: f.nota,
            })),
          });
          if (r.ok) setListo(r.descuadres); else setErr(r.error);
        })}>
        {pend ? "Cerrando…" : descuadres > 0 ? `Cerrar turno con ${descuadres} descuadre(s)` : "Cerrar turno"}
      </button>

      <p className="text-xs text-cafe-700">
        El cierre queda guardado con tu nombre y la hora. Los descuadres no se borran:
        se explican.
      </p>
    </>
  );
}
