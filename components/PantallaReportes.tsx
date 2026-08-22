"use client";

import { useEffect, useState, useTransition } from "react";
import { fmtEur, fmtBs, METODOS, type Metodo } from "@/lib/money";
import { cargarReporte, cargarZ } from "@/app/reportes/acciones";

const hoy = () => new Date().toISOString().slice(0, 10);
const haceDias = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function descargarCsv(nombre: string, filas: (string | number)[][]) {
  const csv = filas
    .map((f) =>
      f.map((v) => {
        const s = String(v ?? "");
        return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(";")
    ).join("\n");
  // BOM para que Excel en español respete los acentos
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PantallaReportes() {
  const [desde, setDesde] = useState(haceDias(7));
  const [hasta, setHasta] = useState(hoy());
  const [d, setD] = useState<any>(null);
  const [z, setZ] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pend, start] = useTransition();

  function cargar() {
    start(async () => {
      setErr(null); setZ(null);
      const r = await cargarReporte({ desde, hasta });
      if (r.ok) setD(r); else { setErr(r.error); setD(null); }
    });
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const R = d?.resumen;

  return (
    <div className="space-y-5">
      {/* ---- Rango ---- */}
      <section className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {[["Hoy", hoy()], ["7 días", haceDias(7)], ["30 días", haceDias(30)]].map(
            ([l, v]) => (
              <button key={l} className="btn-sec text-sm"
                onClick={() => { setDesde(v as string); setHasta(hoy()); }}>
                {l}
              </button>
            )
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="label">Desde</p>
            <input type="date" className="input" value={desde}
              onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <p className="label">Hasta</p>
            <input type="date" className="input" value={hasta}
              onChange={(e) => setHasta(e.target.value)} />
          </div>
          <button className="btn-acc" disabled={pend} onClick={cargar}>
            {pend ? "Cargando…" : "Ver"}
          </button>
        </div>
      </section>

      {err && <p className="text-sm font-semibold text-red-600">{err}</p>}

      {/* ---- KPIs ---- */}
      {R && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi t="Vendido" v={fmtEur(R.neto_eur)} s={`${R.tickets} tickets`} />
          <Kpi t="Ticket promedio" v={fmtEur(R.ticket_promedio_eur)} />
          <Kpi t="Desc. comercial" v={fmtEur(R.desc_manual_eur)} s="criterio humano" />
          <Kpi t="Desc. divisas" v={fmtEur(R.desc_divisas_eur)} s="regla automática" />
        </section>
      )}

      {R && (
        <p className="text-sm text-cafe-700">
          Bruto {fmtEur(R.bruto_eur)} · Clientes sin identificar{" "}
          <strong>{R.pct_genericos}%</strong> ({R.genericos} de {R.tickets})
        </p>
      )}

      {/* ---- Por día ---- */}
      {d && (
        <Bloque titulo="Por día"
          onCsv={() => descargarCsv(`icao_dias_${desde}_${hasta}.csv`,
            [["Día", "Tickets", "Neto EUR", "Descuentos EUR"],
             ...d.porDia.map((r: any) => [r.dia, r.tickets, r.neto_eur, r.desc_total_eur])])}>
          {!d.porDia.length
            ? <p className="text-sm text-cafe-700">Sin ventas en el rango.</p>
            : <Tabla cab={["Día", "Tickets", "Neto", "Descuentos"]}
                filas={d.porDia.map((r: any) => [r.dia, r.tickets, fmtEur(r.neto_eur), fmtEur(r.desc_total_eur)])} />}
        </Bloque>
      )}

      {/* ---- Métodos ---- */}
      {d && (
        <Bloque titulo="Por método de pago"
          onCsv={() => descargarCsv(`icao_metodos_${desde}_${hasta}.csv`,
            [["Método", "Moneda", "Operaciones", "Total EUR", "Total moneda"],
             ...d.metodos.map((r: any) => [METODOS[r.metodo as Metodo]?.label ?? r.metodo, r.moneda, r.n, r.total_eur, r.total_moneda])])}>
          {!d.metodos.length
            ? <p className="text-sm text-cafe-700">Sin cobros en el rango.</p>
            : <Tabla cab={["Método", "Ops", "Total €", "En su moneda"]}
            filas={d.metodos.map((r: any) => [
              METODOS[r.metodo as Metodo]?.label ?? r.metodo, r.n, fmtEur(r.total_eur),
              r.moneda === "BS" ? fmtBs(r.total_moneda) : r.moneda === "USD" ? `$${Number(r.total_moneda).toFixed(2)}` : fmtEur(r.total_moneda),
            ])} />}
        </Bloque>
      )}

      {/* ---- Descuentos ---- */}
      <Bloque titulo="Descuentos aplicados"
        onCsv={d ? () => descargarCsv(`icao_descuentos_${desde}_${hasta}.csv`,
          [["Ticket", "Fecha", "Cliente", "Motivo", "Descuento EUR", "Total EUR"],
           ...d.descuentos.map((r: any) => [r.correlativo, r.ts, r.cliente, r.motivo, r.descuento_eur, r.total_eur])]) : undefined}>
        {!d?.descuentos?.length
          ? <p className="text-sm text-cafe-700">Ningún descuento manual en el rango.</p>
          : <Tabla cab={["Ticket", "Cliente", "Motivo", "Desc."]}
              filas={d.descuentos.map((r: any) => [r.correlativo, r.cliente, r.motivo, fmtEur(r.descuento_eur)])} />}
      </Bloque>

      {/* ---- Turnos + Z ---- */}
      {!!d?.turnos?.length && (
        <Bloque titulo="Turnos del rango">
          <div className="space-y-2">
            {d.turnos.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between gap-2 border-b border-cafe-200 pb-2">
                <div className="text-sm min-w-0">
                  <p className="font-semibold">
                    Turno {t.id} · {t.abierto_por ?? "—"}
                    {t.estado !== "cerrado" && <span className="ml-2 text-xs text-amber-700">ABIERTO</span>}
                  </p>
                  <p className="text-xs text-cafe-700">
                    {new Date(t.apertura_ts).toLocaleString("es-VE")} · {t.tickets} tickets · {fmtEur(t.neto_eur)}
                  </p>
                </div>
                <button className="btn-sec text-xs shrink-0"
                  onClick={() => start(async () => {
                    const r = await cargarZ(t.id);
                    if (r.ok) setZ(r); else setErr(r.error);
                  })}>
                  Ver Z
                </button>
              </div>
            ))}
          </div>
        </Bloque>
      )}

      {z && <ReporteZ z={z} onCerrar={() => setZ(null)} />}
    </div>
  );
}

function Kpi({ t, v, s }: { t: string; v: string; s?: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs uppercase tracking-wide text-cafe-700">{t}</p>
      <p className="text-xl font-black text-cafe-800 tabular-nums">{v}</p>
      {s && <p className="text-xs text-cafe-700">{s}</p>}
    </div>
  );
}

function Bloque({ titulo, children, onCsv }: { titulo: string; children: any; onCsv?: () => void }) {
  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-black text-cafe-800">{titulo}</h2>
        {onCsv && <button onClick={onCsv} className="btn-sec text-xs">Descargar CSV</button>}
      </div>
      {children}
    </section>
  );
}

function Tabla({ cab, filas }: { cab: string[]; filas: any[][] }) {
  return (
    <div className="overflow-x-auto max-w-full">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-cafe-700 border-b border-cafe-200">
            {cab.map((c) => <th key={c} className="py-1 pr-3 font-semibold whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-b border-cafe-200 last:border-0">
              {f.map((v, j) => (
                <td key={j} className={`py-1 pr-3 ${j === 0 ? "" : "tabular-nums"}`}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReporteZ({ z, onCerrar }: { z: any; onCerrar: () => void }) {
  const c = z.cabecera;
  const totalDif = z.lineas.reduce((a: number, l: any) => a + Number(l.diferencia), 0);

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-start justify-center p-2 sm:p-6 overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-2xl p-5 space-y-3 print:shadow-none">
        <div className="flex items-center justify-between print:hidden">
          <h2 className="text-lg font-black">Reporte Z</h2>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="btn-sec text-sm">Imprimir / PDF</button>
            <button onClick={onCerrar} className="btn-sec text-sm">Cerrar</button>
          </div>
        </div>

        <div className="text-center border-b border-cafe-200 pb-3">
          <p className="font-black text-cafe-800">ICAO Buencafé</p>
          <p className="text-xs text-cafe-700">Paseo El Hatillo</p>
          <p className="mt-1 text-sm font-bold">Cierre de turno {c?.turno_id}</p>
          <p className="text-xs text-cafe-700">
            {c?.apertura_ts && new Date(c.apertura_ts).toLocaleString("es-VE")}
            {c?.cierre_ts ? " → " + new Date(c.cierre_ts).toLocaleString("es-VE") : " · SIN CERRAR"}
          </p>
          <p className="text-xs text-cafe-700">
            {c?.abierto_por} · Tasa {Number(c?.tasa_eur_bs).toFixed(2)} Bs/€
          </p>
        </div>

        <div className="flex justify-between text-sm">
          <span>{c?.tickets} tickets</span>
          <span className="font-black">{fmtEur(Number(c?.neto_eur ?? 0))}</span>
        </div>

        {!z.lineas.length ? (
          <p className="text-sm text-cafe-700 border-t border-cafe-200 pt-3">
            Este turno no tiene cierre de caja registrado.
          </p>
        ) : (
          <div className="border-t border-cafe-200 pt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-cafe-700">
                  <th className="py-1">Concepto</th>
                  <th className="py-1 text-right">Esperado</th>
                  <th className="py-1 text-right">Contado</th>
                  <th className="py-1 text-right">Dif.</th>
                </tr>
              </thead>
              <tbody>
                {z.lineas.map((l: any, i: number) => {
                  const dif = Number(l.diferencia);
                  return (
                    <tr key={i} className="border-t border-cafe-200">
                      <td className="py-1">{l.concepto}</td>
                      <td className="py-1 text-right tabular-nums">{Number(l.esperado).toFixed(2)}</td>
                      <td className="py-1 text-right tabular-nums">{Number(l.declarado).toFixed(2)}</td>
                      <td className={`py-1 text-right tabular-nums font-bold ${Math.abs(dif) < 0.01 ? "text-green-700" : "text-red-600"}`}>
                        {dif > 0 ? "+" : ""}{dif.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className={`mt-2 text-sm font-black ${Math.abs(totalDif) < 0.01 ? "text-green-700" : "text-red-600"}`}>
              {Math.abs(totalDif) < 0.01 ? "Cuadró ✓" : `Descuadre ${totalDif > 0 ? "+" : ""}${totalDif.toFixed(2)}`}
            </p>

            {z.lineas.filter((l: any) => l.nota).map((l: any, i: number) => (
              <p key={i} className="mt-1 text-xs text-cafe-700">
                <strong>{l.concepto}:</strong> {l.nota}
              </p>
            ))}
          </div>
        )}

        <div className="border-t border-cafe-200 pt-3 text-[10px] text-cafe-700">
          <p>Firma supervisor: ________________________</p>
          <p className="mt-2">Documento interno de control. No es documento fiscal.</p>
        </div>
      </div>
    </div>
  );
}
