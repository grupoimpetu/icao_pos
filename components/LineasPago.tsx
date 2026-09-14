"use client";

/** ============ Captura de pagos (14-sep-2026) ============
 *  REGLA: el barista teclea SIEMPRE en la moneda del método.
 *    · Bs Pago Móvil / Efectivo Bs / TDD / TDC  → se teclea en Bs (con céntimos)
 *    · Efectivo USD / Zelle / Binance           → se teclea en $
 *  El EUR es ancla de precios, no es plata que se mueve: se calcula por detrás
 *  y solo aparece como referencia chiquita.
 *
 *  Al agregar una línea se precarga EL RESTANTE ya convertido, para que el
 *  barista no haga aritmética mental: toca "Efectivo USD", ajusta a lo que el
 *  cliente le da, toca "Bs Pago Móvil" y el sistema le dicta los Bs exactos.
 * ======================================================== */

import { METODOS, METODOS_CAJA, eur, esDivisa, tasaDe, simboloDe, type Metodo } from "@/lib/money";

export type LineaPago = { metodo: Metodo; montoOriginal: number; referencia: string };

/** EUR que representa una línea tecleada en moneda nativa. */
export function lineaEnEur(l: LineaPago, tasaEurBs: number, tasaEurUsd: number) {
  const t = tasaDe(l.metodo, tasaEurBs, tasaEurUsd);
  return eur((Number(l.montoOriginal) || 0) / (t || 1));
}

export function sumaEur(ls: LineaPago[], tasaEurBs: number, tasaEurUsd: number) {
  return eur(ls.reduce((a, l) => a + lineaEnEur(l, tasaEurBs, tasaEurUsd), 0));
}

export function sumaDivisasEur(ls: LineaPago[], tasaEurBs: number, tasaEurUsd: number) {
  return eur(
    ls.filter((l) => esDivisa(l.metodo))
      .reduce((a, l) => a + lineaEnEur(l, tasaEurBs, tasaEurUsd), 0)
  );
}

export default function LineasPago({
  pagos, setPagos, tasaEurBs, tasaEurUsd, faltaEur, k = 0,
}: {
  pagos: LineaPago[];
  setPagos: (f: (ps: LineaPago[]) => LineaPago[]) => void;
  tasaEurBs: number;
  tasaEurUsd: number;
  /** Lo que falta por cobrar, en EUR. */
  faltaEur: number;
  /** % divisa / 100. Agregar una línea en divisa baja el total, así que el
   *  restante para esa línea es falta/(1+k), no falta. */
  k?: number;
}) {
  function agregar(metodo: Metodo) {
    const restEur = Math.max(0, esDivisa(metodo) ? faltaEur / (1 + k) : faltaEur);
    const t = tasaDe(metodo, tasaEurBs, tasaEurUsd);
    const montoOriginal = Math.round(restEur * t * 100) / 100;
    setPagos((ps) => [...ps, { metodo, montoOriginal, referencia: "" }]);
  }

  const set = (i: number, patch: Partial<LineaPago>) =>
    setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <>
      <div>
        <p className="label">Método de pago</p>
        <p className="text-xs text-cafe-700 mb-2">
          Toca un método y se llena con lo que falta, ya convertido a su moneda.
          Ajusta el monto y toca otro método para el resto.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {METODOS_CAJA.map((m) => (
            <button key={m} onClick={() => agregar(m)} className="btn-sec text-sm">
              {METODOS[m].label}
            </button>
          ))}
        </div>
      </div>

      {pagos.map((p, i) => {
        const simbolo = simboloDe(p.metodo);
        const enEur = lineaEnEur(p, tasaEurBs, tasaEurUsd);
        return (
          <div key={i} className="border border-cafe-200 rounded-xl p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-sm">{METODOS[p.metodo].label}</span>
              <button className="text-xs underline text-red-600"
                onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))}>Quitar</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-cafe-800 w-8 shrink-0">{simbolo}</span>
              <input
                type="number" step="0.01" min={0} inputMode="decimal"
                className="input text-lg font-bold" value={p.montoOriginal}
                onChange={(e) => set(i, { montoOriginal: Number(e.target.value) })}
              />
            </div>
            <p className="text-xs text-cafe-700 text-right">≈ €{enEur.toFixed(2)}</p>
            {METODOS[p.metodo].refObligatoria && (
              <input className="input" placeholder="Referencia / lote (obligatorio)"
                value={p.referencia} onChange={(e) => set(i, { referencia: e.target.value })} />
            )}
          </div>
        );
      })}
    </>
  );
}
