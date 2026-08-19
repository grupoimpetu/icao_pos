/** ================= Reglas de multimoneda (HANDOFF §7) =================
 *  El catálogo vive en EUR. Bs y USD son PRESENTACIONES, nunca fuente de verdad.
 *  La tasa se congela por turno.
 * ====================================================================== */

export type Moneda = "EUR" | "BS" | "USD";

export type Metodo =
  | "bs_transferencia" | "bs_pago_movil" | "efectivo_usd"
  | "efectivo_eur" | "tdd" | "tdc" | "wallet";

export const METODOS: Record<Metodo, { label: string; moneda: Moneda; refObligatoria: boolean }> = {
  bs_transferencia: { label: "Bs Transferencia", moneda: "BS",  refObligatoria: true  },
  bs_pago_movil:    { label: "Bs Pago Móvil",    moneda: "BS",  refObligatoria: true  },
  tdd:              { label: "TDD (punto)",      moneda: "BS",  refObligatoria: true  },
  tdc:              { label: "TDC (punto)",      moneda: "BS",  refObligatoria: true  },
  efectivo_usd:     { label: "Efectivo USD",     moneda: "USD", refObligatoria: false },
  efectivo_eur:     { label: "Efectivo EUR",     moneda: "EUR", refObligatoria: false },
  wallet:           { label: "Wallet ICAO",      moneda: "EUR", refObligatoria: false },
};

export const eur = (n: number) => Math.round(n * 100) / 100;

/** Bs: unidad entera hacia arriba (el vuelto se da en Bs). */
export const aBs = (montoEur: number, tasaEurBs: number) => Math.ceil(eur(montoEur) * tasaEurBs);

/** USD cash: se redondea a $0.25 para que el vuelto físico sea práctico. */
export const aUsdCash = (montoEur: number, tasaEurUsd: number) =>
  Math.ceil(eur(montoEur) * tasaEurUsd * 4) / 4;

export function convertir(montoEur: number, metodo: Metodo, tasaEurBs: number, tasaEurUsd: number) {
  const { moneda } = METODOS[metodo];
  if (moneda === "BS")  return { moneda, monto: aBs(montoEur, tasaEurBs),      tasa: tasaEurBs };
  if (moneda === "USD") return { moneda, monto: aUsdCash(montoEur, tasaEurUsd), tasa: tasaEurUsd };
  return { moneda, monto: eur(montoEur), tasa: 1 };
}

/** Inverso: cuánto EUR representa un monto cobrado en otra moneda.
 *  OJO: solo para PAGOS PARCIALES, cuando el cliente entrega una cantidad
 *  arbitraria (ej. "tengo 500 Bs, el resto en efectivo"). */
export function aEur(montoOriginal: number, metodo: Metodo, tasaEurBs: number, tasaEurUsd: number) {
  const { moneda } = METODOS[metodo];
  if (moneda === "BS")  return eur(montoOriginal / tasaEurBs);
  if (moneda === "USD") return eur(montoOriginal / tasaEurUsd);
  return eur(montoOriginal);
}

/** Construye los 5 campos de `pagos` (HANDOFF §7, regla 3).
 *
 *  BUG QUE ESTO EVITA: el redondeo de Bs es `ceil` a unidad entera, así que
 *  convertir de vuelta (Bs → EUR) NO devuelve el mismo número.
 *  €3.82 × 36.42 = Bs 140 → 140 / 36.42 = €3.84. Dos céntimos de deriva por
 *  pago. En 200 tickets/día son ~€4 de descuadre fantasma que nadie encuentra.
 *
 *  Regla: cuando el pago cubre un monto EUR conocido, `monto_eur` es ESE monto.
 *  Solo se recalcula cuando el cliente entrega una cantidad arbitraria. */
export function construirPago(
  metodo: Metodo,
  tasaEurBs: number,
  tasaEurUsd: number,
  opts: { montoEur: number } | { montoOriginal: number },
  referencia?: string
) {
  const { moneda } = METODOS[metodo];
  const tasa = moneda === "BS" ? tasaEurBs : moneda === "USD" ? tasaEurUsd : 1;

  const esExacto = "montoEur" in opts;
  const monto_eur = esExacto ? eur(opts.montoEur) : aEur(opts.montoOriginal, metodo, tasaEurBs, tasaEurUsd);
  const monto_original = esExacto
    ? convertir(opts.montoEur, metodo, tasaEurBs, tasaEurUsd).monto
    : opts.montoOriginal;

  if (METODOS[metodo].refObligatoria && !referencia) {
    throw new Error(`${METODOS[metodo].label} exige número de referencia`);
  }

  return { metodo, moneda, monto_original, tasa_aplicada: tasa, monto_eur, referencia: referencia ?? null };
}

/** El ticket no se cierra hasta que Σ pagos_eur == total_eur (tolerancia 0.01). */
export function ticketCuadra(totalEur: number, pagosEur: number[]) {
  return Math.abs(eur(pagosEur.reduce((a, b) => a + b, 0)) - eur(totalEur)) <= 0.01;
}

export const fmtEur = (n: number) => `€${eur(n).toFixed(2)}`;
export const fmtBs  = (n: number) => `Bs ${Math.round(n).toLocaleString("es-VE")}`;
export const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
