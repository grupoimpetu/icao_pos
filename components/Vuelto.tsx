"use client";

/** ============ Vuelto (19-sep-2026 · Fase A) ============
 *  Cuando el cliente paga de más (billete grande), el EXCEDENTE se reparte:
 *    · Efectivo USD / Efectivo Bs → sale de la gaveta ya. Baja el esperado del cierre.
 *    · Pago Móvil                 → queda PENDIENTE; administración lo paga y lo marca.
 *    · Lo que no se asigna        → se queda en caja (propina / redondeo, máx. €5).
 *  Se teclea en la moneda del método, igual que los pagos.
 * ======================================================= */

import { METODOS, eur, fmtEur, tasaDe, simboloDe, type Metodo } from "@/lib/money";

export type MetodoVuelto = "efectivo_usd" | "efectivo_bs" | "bs_pago_movil";
export type VueltoLinea = {
  metodo: MetodoVuelto; montoOriginal: number;
  pmTelefono: string; pmCedula: string; pmBanco: string;
};

/** Lo que puede quedarse en caja sin asignar. Más que esto casi seguro es un
 *  vuelto que el barista olvidó registrar. Debe coincidir con app/venta/acciones.ts */
export const TOPE_PROPINA_EUR = 5;
/** Por encima de esto se pide confirmación (anti error de tecleo). No bloquea. */
export const CONFIRMAR_EXCEDENTE_EUR = 50;

const BANCOS = [
  "0102 Venezuela", "0104 Venezolano de Crédito", "0105 Mercantil", "0108 Provincial",
  "0114 Bancaribe", "0115 Exterior", "0128 Caroní", "0134 Banesco", "0137 Sofitasa",
  "0138 Plaza", "0151 BFC", "0156 100% Banco", "0157 Delsur", "0163 Tesoro",
  "0166 Agrícola", "0168 Bancrecer", "0169 R4", "0171 Activo", "0172 Bancamiga",
  "0174 Banplus", "0175 Bicentenario", "0177 Banfanb", "0178 N58", "0191 BNC",
];

const OPCIONES: { m: MetodoVuelto; label: string }[] = [
  { m: "efectivo_usd", label: "Vuelto $ efectivo" },
  { m: "efectivo_bs", label: "Vuelto Bs efectivo" },
  { m: "bs_pago_movil", label: "Vuelto por Pago Móvil" },
];

export function vueltoEnEur(v: VueltoLinea, tasaEurBs: number, tasaEurUsd: number) {
  const t = tasaDe(v.metodo as Metodo, tasaEurBs, tasaEurUsd);
  return eur((Number(v.montoOriginal) || 0) / (t || 1));
}
export function sumaVueltosEur(vs: VueltoLinea[], tasaEurBs: number, tasaEurUsd: number) {
  return eur(vs.reduce((a, v) => a + vueltoEnEur(v, tasaEurBs, tasaEurUsd), 0));
}

/** Estado del reparto: lo que queda sin asignar y si se puede cobrar. */
export function estadoVuelto(excedenteEur: number, vs: VueltoLinea[], tasaEurBs: number, tasaEurUsd: number) {
  const devuelto = sumaVueltosEur(vs, tasaEurBs, tasaEurUsd);
  const queda = eur(excedenteEur - devuelto);
  const pmIncompleto = vs.some((v) => v.metodo === "bs_pago_movil"
    && (!v.pmTelefono.trim() || !v.pmCedula.trim() || !v.pmBanco.trim()));
  const enCero = vs.some((v) => !(Number(v.montoOriginal) > 0));
  let bloqueo: string | null = null;
  if (queda < -0.01) bloqueo = `El vuelto supera lo que el cliente pagó de más por ${fmtEur(-queda)}.`;
  else if (queda > TOPE_PROPINA_EUR) bloqueo = `Quedan ${fmtEur(queda)} sin devolver. Agrégalo como vuelto.`;
  else if (pmIncompleto) bloqueo = "Faltan datos del Pago Móvil (teléfono, cédula y banco).";
  else if (enCero) bloqueo = "Hay una línea de vuelto en cero. Quítala o ponle monto.";
  return { devuelto, queda: Math.max(0, queda), bloqueo };
}

/** Payload para el servidor. */
export const vueltosPayload = (vs: VueltoLinea[]) => vs.map((v) => ({
  metodo: v.metodo, montoOriginal: Number(v.montoOriginal),
  pmTelefono: v.pmTelefono.trim() || undefined, pmCedula: v.pmCedula.trim() || undefined,
  pmBanco: v.pmBanco.trim() || undefined,
}));

export default function EditorVuelto({
  excedenteEur, vueltos, setVueltos, tasaEurBs, tasaEurUsd,
}: {
  excedenteEur: number;
  vueltos: VueltoLinea[];
  setVueltos: (f: (vs: VueltoLinea[]) => VueltoLinea[]) => void;
  tasaEurBs: number; tasaEurUsd: number;
}) {
  const { queda, bloqueo } = estadoVuelto(excedenteEur, vueltos, tasaEurBs, tasaEurUsd);

  function agregar(m: MetodoVuelto) {
    const t = tasaDe(m as Metodo, tasaEurBs, tasaEurUsd);
    const montoOriginal = Math.round(Math.max(0, queda) * t * 100) / 100;
    setVueltos((vs) => [...vs, { metodo: m, montoOriginal, pmTelefono: "", pmCedula: "", pmBanco: "" }]);
  }
  const set = (i: number, p: Partial<VueltoLinea>) =>
    setVueltos((vs) => vs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-3 space-y-3">
      <div>
        <p className="font-black text-blue-900">
          Vuelto · el cliente pagó ${eur(excedenteEur * tasaEurUsd).toFixed(2)} de más
        </p>
        <p className="text-xs text-blue-900">
          Elige cómo se devuelve. Puedes combinar: lo que haya de $ en la gaveta y el resto por Pago Móvil.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {OPCIONES.map((o) => (
          <button key={o.m} onClick={() => agregar(o.m)} className="btn-sec text-xs">{o.label}</button>
        ))}
      </div>

      {vueltos.map((v, i) => (
        <div key={i} className="bg-white border border-blue-200 rounded-xl p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-sm">
              {OPCIONES.find((o) => o.m === v.metodo)!.label}
              {v.metodo === "bs_pago_movil" && <span className="ml-1 text-xs text-orange-700">· queda pendiente</span>}
            </span>
            <button className="text-xs underline text-red-600"
              onClick={() => setVueltos((vs) => vs.filter((_, j) => j !== i))}>Quitar</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-cafe-800 w-8 shrink-0">{simboloDe(v.metodo as Metodo)}</span>
            <input type="number" step="0.01" min={0} inputMode="decimal" className="input text-lg font-bold"
              value={v.montoOriginal} onChange={(e) => set(i, { montoOriginal: Number(e.target.value) })} />
          </div>
          {v.metodo === "bs_pago_movil" && (
            <div className="grid grid-cols-2 gap-2">
              <input className="input" inputMode="tel" placeholder="Teléfono (0414…)"
                value={v.pmTelefono} onChange={(e) => set(i, { pmTelefono: e.target.value })} />
              <input className="input" placeholder="Cédula (V-12345678)"
                value={v.pmCedula} onChange={(e) => set(i, { pmCedula: e.target.value })} />
              <select className="input col-span-2" value={v.pmBanco}
                onChange={(e) => set(i, { pmBanco: e.target.value })}>
                <option value="">Banco del cliente…</option>
                {BANCOS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
        </div>
      ))}

      <p className="text-sm">
        {queda > 0.01
          ? <>Se queda en caja: <strong>{fmtEur(queda)}</strong> {queda <= TOPE_PROPINA_EUR && "(propina / redondeo)"}</>
          : <span className="text-green-700 font-bold">Vuelto completo ✓</span>}
      </p>
      {bloqueo && <p className="text-sm font-bold text-red-600">{bloqueo}</p>}
    </div>
  );
}

export const labelVuelto = (m: string) =>
  m === "bs_pago_movil" ? "Pago Móvil" : (METODOS as any)[m]?.label ?? m;
