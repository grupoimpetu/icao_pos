"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtEur } from "@/lib/money";
import { cerrarCaja } from "@/app/cierre/acciones";
import type { Concepto } from "@/app/cierre/page";

const simbolo = (m: string) => (m === "BS" ? "Bs" : m === "USD" ? "$" : "€");
const fmt = (m: string, n: number) =>
  m === "BS" ? `Bs ${Math.round(n).toLocaleString("es-VE")}` : `${simbolo(m)}${n.toFixed(2)}`;

type Fila = {
  concepto: string; metodo: string | null; moneda: string;
  tipo: "efectivo" | "electronico"; esperado: number;
  declarado: number; vacio: boolean; dif: number; nota: string; cuadra: boolean;
};

export default function FormCierre({
  turnoId, conceptos, totalEur, hayAbiertos, empleado, aperturaTs, tasaBs,
}: {
  turnoId: number; conceptos: Concepto[]; totalEur: number; hayAbiertos: boolean;
  empleado: string; aperturaTs: string; tasaBs: number;
}) {
  const [decl, setDecl] = useState<Record<string, { declarado: string; nota: string }>>(
    Object.fromEntries(conceptos.map((c) => [c.concepto, { declarado: "", nota: "" }]))
  );
  const [err, setErr] = useState<string | null>(null);
  const [listo, setListo] = useState<number | null>(null);
  const [cierreTs, setCierreTs] = useState<string | null>(null);
  const [verX, setVerX] = useState(false);
  const [pend, start] = useTransition();
  const router = useRouter();

  const filas: Fila[] = useMemo(() => conceptos.map((c) => {
    const d = decl[c.concepto] ?? { declarado: "", nota: "" };
    const vacio = d.declarado.trim() === "";
    const declarado = vacio ? 0 : Number(d.declarado);
    const dif = declarado - c.esperado;
    return { ...c, declarado, vacio, dif, nota: d.nota, cuadra: Math.abs(dif) <= 0.01 };
  }), [conceptos, decl]);

  const sinContar = filas.filter((f) => f.vacio && f.esperado !== 0).length;
  const descuadresSinNota = filas.filter((f) => !f.cuadra && !f.nota.trim()).length;
  const descuadres = filas.filter((f) => !f.cuadra).length;

  /* ============ Reporte Z (al cerrar) / X (corte parcial) ============ */
  if (listo !== null) {
    return (
      <ReporteZX
        modo="Z" turnoId={turnoId} empleado={empleado} aperturaTs={aperturaTs}
        cierreTs={cierreTs} tasaBs={tasaBs} totalEur={totalEur} filas={filas} descuadres={listo}
        onSalir={() => router.push("/turno")}
      />
    );
  }
  if (verX) {
    return (
      <ReporteZX
        modo="X" turnoId={turnoId} empleado={empleado} aperturaTs={aperturaTs}
        cierreTs={null} tasaBs={tasaBs} totalEur={totalEur} filas={filas} descuadres={0}
        onSalir={() => setVerX(false)}
      />
    );
  }

  const bloque = (tipo: "efectivo" | "electronico") => filas.filter((f) => f.tipo === tipo);

  const campo = (f: Fila) => (
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
        <div className="flex items-center gap-3">
          <button onClick={() => setVerX(true)} className="btn-sec text-xs">Reporte X (corte)</button>
          <span className="text-2xl font-black">{fmtEur(totalEur)}</span>
        </div>
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
          if (r.ok) { setCierreTs(new Date().toISOString()); setListo(r.descuadres); }
          else setErr(r.error);
        })}>
        {pend ? "Cerrando…" : descuadres > 0 ? `Cerrar turno con ${descuadres} descuadre(s)` : "Cerrar turno"}
      </button>

      <p className="text-xs text-cafe-700">
        El cierre queda guardado con tu nombre y la hora. Los descuadres no se borran:
        se explican. Al cerrar verás el <strong>Reporte Z</strong> para enviar a administración.
      </p>
    </>
  );
}

/* ================= Reporte Z / X en pantalla ================= */

function ReporteZX({
  modo, turnoId, empleado, aperturaTs, cierreTs, tasaBs, totalEur, filas, descuadres, onSalir,
}: {
  modo: "Z" | "X";
  turnoId: number; empleado: string; aperturaTs: string; cierreTs: string | null;
  tasaBs: number; totalEur: number; filas: Fila[]; descuadres: number; onSalir: () => void;
}) {
  const esZ = modo === "Z";
  const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-VE") : "—");
  const conMovimiento = filas.filter((f) => f.esperado !== 0 || (esZ && !f.vacio));

  const texto = useMemo(() => {
    const L: string[] = [];
    L.push(`ICAO Buencafé · Paseo El Hatillo`);
    L.push(`Reporte ${modo} — ${esZ ? "cierre de turno" : "corte parcial (turno abierto)"}`);
    L.push(`Turno #${turnoId} · ${empleado}`);
    L.push(`Apertura: ${fecha(aperturaTs)}`);
    if (esZ) L.push(`Cierre: ${fecha(cierreTs)}`);
    else L.push(`Corte: ${fecha(new Date().toISOString())}`);
    L.push(`Tasa: ${tasaBs.toFixed(2)} Bs/€`);
    L.push(`Vendido en el turno: ${fmtEur(totalEur)}`);
    L.push(`—`);
    for (const f of conMovimiento) {
      if (esZ) {
        const estado = f.cuadra ? "cuadra" : `${f.dif > 0 ? "sobra" : "falta"} ${fmt(f.moneda, Math.abs(f.dif))}`;
        L.push(`${f.concepto}: esperado ${fmt(f.moneda, f.esperado)} · contado ${fmt(f.moneda, f.declarado)} · ${estado}`);
      } else {
        L.push(`${f.concepto}: ${fmt(f.moneda, f.esperado)}`);
      }
    }
    if (esZ) {
      L.push(`—`);
      L.push(descuadres === 0 ? `Cuadró ✓` : `${descuadres} concepto(s) con descuadre`);
      for (const f of filas.filter((x) => !x.cuadra && x.nota)) L.push(`Nota ${f.concepto}: ${f.nota}`);
    }
    L.push(`—`);
    L.push(`Documento interno de control. No es documento fiscal.`);
    return L.join("\n");
  }, [modo, turnoId, empleado, aperturaTs, cierreTs, tasaBs, totalEur, conMovimiento, descuadres, filas, esZ]);

  const waHref = `https://wa.me/?text=${encodeURIComponent(texto)}`;

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-4" id="reporte-zx">
        <div className="text-center border-b border-cafe-200 pb-3">
          <img src="/logo-icao.png" alt="ICAO Buencafé" className="mx-auto h-10 w-auto" />
          <p className="text-xs text-cafe-700">Paseo El Hatillo</p>
          <p className="mt-1 text-sm font-black">
            Reporte {modo} · {esZ ? "cierre de turno" : "corte parcial"}
          </p>
          <p className="text-xs text-cafe-700">Turno #{turnoId} · {empleado}</p>
          <p className="text-xs text-cafe-700">
            {fecha(aperturaTs)}{esZ ? ` → ${fecha(cierreTs)}` : " · turno ABIERTO"}
          </p>
          <p className="text-xs text-cafe-700">Tasa {tasaBs.toFixed(2)} Bs/€</p>
        </div>

        <div className="flex justify-between text-sm">
          <span>Vendido en el turno</span>
          <span className="font-black">{fmtEur(totalEur)}</span>
        </div>

        <table className="w-full text-xs border-t border-cafe-200 pt-2">
          <thead>
            <tr className="text-left text-cafe-700">
              <th className="py-1">Concepto</th>
              <th className="py-1 text-right">Esperado</th>
              {esZ && <th className="py-1 text-right">Contado</th>}
              {esZ && <th className="py-1 text-right">Dif.</th>}
            </tr>
          </thead>
          <tbody>
            {conMovimiento.map((f, i) => (
              <tr key={i} className="border-t border-cafe-200">
                <td className="py-1">{f.concepto}</td>
                <td className="py-1 text-right tabular-nums">{fmt(f.moneda, f.esperado)}</td>
                {esZ && <td className="py-1 text-right tabular-nums">{f.vacio ? "—" : fmt(f.moneda, f.declarado)}</td>}
                {esZ && (
                  <td className={`py-1 text-right tabular-nums font-bold ${f.cuadra ? "text-green-700" : "text-red-600"}`}>
                    {f.vacio ? "—" : `${f.dif > 0 ? "+" : ""}${f.dif.toFixed(2)}`}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {esZ && (
          <p className={`text-sm font-black ${descuadres === 0 ? "text-green-700" : "text-red-600"}`}>
            {descuadres === 0 ? "Cuadró ✓" : `${descuadres} concepto(s) con descuadre`}
          </p>
        )}
        {esZ && filas.filter((f) => !f.cuadra && f.nota).map((f, i) => (
          <p key={i} className="text-xs text-cafe-700"><strong>{f.concepto}:</strong> {f.nota}</p>
        ))}
        {!esZ && (
          <p className="text-xs text-cafe-700">
            Lectura acumulada. El turno sigue abierto; los montos pueden cambiar hasta el cierre.
          </p>
        )}

        <div className="border-t border-cafe-200 pt-3 text-[10px] text-cafe-700">
          {esZ && <p>Firma: ________________________</p>}
          <p className="mt-1">Documento interno de control. No es documento fiscal.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 print:hidden">
        <a href={waHref} target="_blank" rel="noopener noreferrer"
          className="btn-acc grid place-items-center text-sm">Enviar a administración</a>
        <button onClick={() => window.print()} className="btn-sec text-sm">Imprimir / PDF</button>
      </div>
      <button onClick={onSalir} className="btn-sec w-full text-sm print:hidden">
        {esZ ? "Ir al turno" : "Volver al cierre"}
      </button>
    </div>
  );
}
