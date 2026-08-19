/** ============ Captura de tasa BCV (HANDOFF §7) ============
 *  Fuente confirmada 19-ago-2026 contra el plugin EUR→VES que ya corre en
 *  tiptickera.com (WooCommerce con anchor pricing en EUR). Misma fuente = las
 *  dos plataformas de Choco cotizan idéntico. Si difieren, es bug, no criterio.
 *
 *  GET https://ve.dolarapi.com/v1/euros
 *  [ { moneda:"EUR", fuente:"oficial",  promedio: 897.82311808, ... },
 *    { moneda:"EUR", fuente:"paralelo", promedio: 1032.65901,   ... } ]
 *
 *  Se usa SIEMPRE `fuente: "oficial"` — es la del BCV.
 *  El paralelo se captura solo como referencia informativa; jamás se cobra con él.
 *
 *  Regla: si la API falla, el sistema NO adivina. El supervisor la introduce a
 *  mano al abrir turno y queda marcada 'manual'. Nunca operar con tasa vieja.
 * ========================================================== */

export type TasaResultado =
  | { ok: true; eurBs: number; fuente: string; paraleloRef: number | null; fechaBcv: string | null }
  | { ok: false; error: string };

type FilaDolarApi = {
  moneda: string;
  fuente: string;
  promedio: number | null;
  compra: number | null;
  venta: number | null;
  fechaActualizacion: string;
};

const URL_EUR = "https://ve.dolarapi.com/v1/euros";

/** Sanidad: a agosto 2026 el EUR/Bs ronda 900. Un valor fuera de este rango
 *  significa que la API cambió de formato o devolvió basura — no se opera con él. */
const MIN = 1;
const MAX = 1_000_000;

export async function obtenerTasaBcv(): Promise<TasaResultado> {
  try {
    const r = await fetch(URL_EUR, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false, error: `DolarApi respondió HTTP ${r.status}` };

    const filas: FilaDolarApi[] = await r.json();
    if (!Array.isArray(filas)) return { ok: false, error: "DolarApi devolvió un formato inesperado" };

    const oficial = filas.find((f) => f.fuente === "oficial" && f.moneda === "EUR");
    const paralelo = filas.find((f) => f.fuente === "paralelo" && f.moneda === "EUR");

    const valor = Number(oficial?.promedio ?? oficial?.venta);
    if (!valor || !isFinite(valor) || valor < MIN || valor > MAX) {
      return { ok: false, error: `Tasa oficial ausente o fuera de rango (${oficial?.promedio})` };
    }

    return {
      ok: true,
      eurBs: Number(valor.toFixed(4)),
      fuente: "dolarapi_bcv_eur",
      paraleloRef: Number(paralelo?.promedio) || null,
      fechaBcv: oficial?.fechaActualizacion ?? null,
    };
  } catch (e: any) {
    return { ok: false, error: `No se pudo contactar DolarApi (${e?.name ?? "error"})` };
  }
}

/** El BCV publica una vez al día con fecha 00:00. Si la fecha no es de hoy,
 *  la tasa está vieja y hay que avisarle al supervisor antes de abrir turno. */
export function tasaEsDeHoy(fechaIso: string | null) {
  if (!fechaIso) return false;
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  const f = new Date(fechaIso).toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  return f === hoy;
}
