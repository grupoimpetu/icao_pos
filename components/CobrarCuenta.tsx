"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtEur, fmtBs, eur, type Metodo } from "@/lib/money";
import LineasPago, { sumaEur, type LineaPago } from "@/components/LineasPago";
import { cobrarCuentaAbierta } from "@/app/venta/acciones";

export default function CobrarCuenta({
  ticketId, correlativo, cliente, totalEur, tasaEurBs, tasaEurUsd,
}: {
  ticketId: number; correlativo: string; cliente: string;
  totalEur: number; tasaEurBs: number; tasaEurUsd: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pagos, setPagos] = useState<LineaPago[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const router = useRouter();

  const pagado = sumaEur(pagos, tasaEurBs, tasaEurUsd);
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
          <p className="text-right text-sm text-cafe-700">{fmtBs(Math.round(totalEur * tasaEurBs * 100) / 100)}</p>
        </div>

        <LineasPago
          pagos={pagos} setPagos={setPagos}
          tasaEurBs={tasaEurBs} tasaEurUsd={tasaEurUsd} faltaEur={falta}
        />

        {!!pagos.length && (
          <p className={`text-sm font-bold ${falta <= 0.01 ? "text-green-700" : "text-cafe-800"}`}>
            {Math.abs(falta) <= 0.01
              ? "Cuadra ✓"
              : falta > 0
                ? `Falta ${fmtEur(falta)}`
                : -falta > 5
                  ? `Excedente muy alto (${fmtEur(-falta)}). Revisa los montos.`
                  : `Cuadra ✓ · paga ${fmtEur(-falta)} de más (se registra como excedente)`}
          </p>
        )}

        {err && <p className="text-sm font-semibold text-red-600">{err}</p>}

        <button className="btn-acc w-full text-lg"
          disabled={pend || !pagos.length || falta > 0.01 || -falta > 5}
          onClick={() => start(async () => {
            setErr(null);
            const r = await cobrarCuentaAbierta({
              ticketId,
              pagos: pagos.map((p) => ({ metodo: p.metodo, montoOriginal: p.montoOriginal, referencia: p.referencia || undefined })),
            });
            if (r.ok) { setAbierto(false); router.refresh(); } else setErr(r.error);
          })}>
          {pend ? "Procesando…" : `Confirmar ${fmtEur(totalEur)}`}
        </button>
      </div>
    </div>
  );
}
