"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { METODOS, METODOS_CAJA, fmtEur, fmtBs, eur, convertir, type Metodo } from "@/lib/money";
import { cobrarCuentaAbierta } from "@/app/venta/acciones";

export default function CobrarCuenta({
  ticketId, correlativo, cliente, totalEur, tasaEurBs, tasaEurUsd,
}: {
  ticketId: number; correlativo: string; cliente: string;
  totalEur: number; tasaEurBs: number; tasaEurUsd: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pagos, setPagos] = useState<{ metodo: Metodo; montoEur: number; referencia: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const router = useRouter();

  const pagado = eur(pagos.reduce((a, p) => a + p.montoEur, 0));
  const falta = eur(totalEur - pagado);

  if (!abierto) {
    return <button className="btn-acc" onClick={() => setAbierto(true)}>Cobrar</button>;
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl p-5 space-y-4 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black">Cobrar cuenta</h2>
            <p className="text-xs text-cafe-700">{correlativo} · {cliente}</p>
          </div>
          <button onClick={() => setAbierto(false)} className="btn-sec text-sm">Volver</button>
        </div>

        <div className="rounded-xl bg-cafe-50 p-3">
          <div className="flex justify-between text-2xl font-black"><span>Total</span><span>{fmtEur(totalEur)}</span></div>
          <p className="text-right text-sm text-cafe-700">{fmtBs(Math.ceil(totalEur * tasaEurBs))}</p>
        </div>

        <div>
          <p className="label">Método de pago</p>
          <div className="grid grid-cols-2 gap-2">
            {METODOS_CAJA.map((m) => (
              <button key={m} className="btn-sec text-sm"
                onClick={() => setPagos((ps) => [...ps, { metodo: m, montoEur: Math.max(0, falta), referencia: "" }])}>
                {METODOS[m].label}
              </button>
            ))}
          </div>
        </div>

        {pagos.map((p, i) => {
          const conv = convertir(p.montoEur, p.metodo, tasaEurBs, tasaEurUsd);
          return (
            <div key={i} className="border border-cafe-200 rounded-xl p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-sm">{METODOS[p.metodo].label}</span>
                <button className="text-xs underline text-red-600"
                  onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))}>Quitar</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-cafe-700">€</span>
                <input type="number" step="0.01" className="input" value={p.montoEur}
                  onChange={(e) => setPagos((ps) => ps.map((x, j) => j === i ? { ...x, montoEur: Number(e.target.value) } : x))} />
                <span className="text-sm font-bold whitespace-nowrap">
                  {conv.moneda === "BS" ? fmtBs(conv.monto) : conv.moneda === "USD" ? `$${conv.monto.toFixed(2)}` : fmtEur(conv.monto)}
                </span>
              </div>
              {METODOS[p.metodo].refObligatoria && (
                <input className="input" placeholder="Referencia (obligatorio)" value={p.referencia}
                  onChange={(e) => setPagos((ps) => ps.map((x, j) => j === i ? { ...x, referencia: e.target.value } : x))} />
              )}
            </div>
          );
        })}

        {!!pagos.length && (
          <p className={`text-sm font-bold ${Math.abs(falta) <= 0.01 ? "text-green-700" : "text-cafe-800"}`}>
            {Math.abs(falta) <= 0.01 ? "Cuadra ✓" : falta > 0 ? `Falta ${fmtEur(falta)}` : `Sobra ${fmtEur(-falta)}`}
          </p>
        )}

        {err && <p className="text-sm font-semibold text-red-600">{err}</p>}

        <button className="btn-acc w-full text-lg"
          disabled={pend || !pagos.length || Math.abs(falta) > 0.01}
          onClick={() => start(async () => {
            setErr(null);
            const r = await cobrarCuentaAbierta({
              ticketId,
              pagos: pagos.map((p) => ({ metodo: p.metodo, montoEur: p.montoEur, referencia: p.referencia || undefined })),
            });
            if (r.ok) { setAbierto(false); router.refresh(); } else setErr(r.error);
          })}>
          {pend ? "Procesando…" : `Confirmar ${fmtEur(totalEur)}`}
        </button>
      </div>
    </div>
  );
}
