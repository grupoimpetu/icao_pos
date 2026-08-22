"use client";

import { useState, useTransition } from "react";
import { guardarConfig } from "@/app/config/acciones";

export default function FormConfig({
  pctDivisas, tasaEurUsdCash,
}: { pctDivisas: number; tasaEurUsdCash: number }) {
  const [pct, setPct] = useState(String(pctDivisas));
  const [tasa, setTasa] = useState(String(tasaEurUsdCash));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pend, start] = useTransition();

  const sucio =
    Number(pct) !== pctDivisas || Number(tasa) !== tasaEurUsdCash;

  return (
    <section className="card p-4 space-y-5">
      <div>
        <p className="label">Descuento por pago en divisas</p>
        <div className="flex items-center gap-2">
          <input type="number" step="0.01" min={0} max={100} className="input"
            value={pct} onChange={(e) => { setPct(e.target.value); setMsg(null); }} />
          <span className="font-black text-cafe-800">%</span>
        </div>
        <p className="mt-1 text-xs text-cafe-700">
          Se aplica solo a la porción del ticket pagada en USD, EUR, Zelle o Binance.
          Súbelo o bájalo según la brecha entre la tasa oficial y la paralela.
        </p>
      </div>

      <div>
        <p className="label">Tasa EUR / USD efectivo</p>
        <input type="number" step="0.01" min={0} className="input"
          value={tasa} onChange={(e) => { setTasa(e.target.value); setMsg(null); }} />
        <p className="mt-1 text-xs text-cafe-700">
          Cuántos EUR vale 1 USD en efectivo. Hoy el mercado local los trata 1:1.
        </p>
      </div>

      {err && <p className="text-sm font-semibold text-red-600">{err}</p>}
      {msg && <p className="text-sm font-semibold text-green-700">{msg}</p>}

      <button className="btn-acc w-full text-lg" disabled={pend || !sucio}
        onClick={() => start(async () => {
          setErr(null); setMsg(null);
          const r = await guardarConfig({
            pctDivisas: Number(pct), tasaEurUsdCash: Number(tasa),
          });
          if (r.ok) setMsg(r.sinCambios ? "Sin cambios" : "Guardado ✓");
          else setErr(r.error);
        })}>
        {pend ? "Guardando…" : sucio ? "Guardar cambios" : "Sin cambios"}
      </button>

      <p className="text-xs text-cafe-700">
        Cada cambio queda registrado con tu nombre y la hora.
        Afecta los tickets nuevos, nunca los ya cobrados.
      </p>
    </section>
  );
}
