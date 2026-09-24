"use client";

import { useState, useTransition } from "react";
import { METODOS, fmtBs, esDivisa, type Metodo } from "@/lib/money";
import { buscarClientes } from "@/app/venta/acciones";
import { infoWallet, recargarWallet, resetPinWallet, ajustarWallet } from "@/app/wallet/acciones";

const METODOS_RECARGA: Metodo[] = ["efectivo_usd", "zelle", "binance", "efectivo_bs", "bs_pago_movil", "tdd", "tdc"];
const TIPO: Record<string, string> = { recarga: "Recarga", bono: "Bono", vuelto: "Vuelto", consumo: "Consumo", ajuste: "Ajuste", preorden: "Pre-order", reembolso: "Reembolso" };

export default function PantallaWallet({ turno, tasaEurUsd, bonoPct }: {
  turno: { id: number; tasaEurBs: number; tasaEurUsd: number } | null; tasaEurUsd: number; bonoPct: number;
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any[]>([]);
  const [info, setInfo] = useState<any>(null);
  const [modo, setModo] = useState<"nada" | "recarga" | "pin" | "ajuste">("nada");
  const [metodo, setMetodo] = useState<Metodo>("efectivo_usd");
  const [monto, setMonto] = useState("");
  const [ref, setRef] = useState("");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinSup, setPinSup] = useState("");
  const [nota, setNota] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const usd = (e: number) => `$${(e * tasaEurUsd).toFixed(2)}`;

  const cargar = (id: number) => start(async () => {
    setErr(null);
    const r = await infoWallet(id);
    if (r.ok) setInfo(r); else setErr(r.error);
  });
  const limpiarForm = () => { setModo("nada"); setMonto(""); setRef(""); setPin1(""); setPin2(""); setPinSup(""); setNota(""); };

  if (!info) {
    return (
      <section className="card p-4 space-y-3">
        <p className="label">Buscar cliente (nombre o teléfono)</p>
        <div className="flex gap-2">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="0414… o nombre" />
          <button className="btn-acc" disabled={pend || q.trim().length < 2}
            onClick={() => start(async () => { const r = await buscarClientes(q); if (r.ok) setRes(r.clientes); })}>Buscar</button>
        </div>
        {res.map((c: any) => (
          <button key={c.id} onClick={() => cargar(c.id)} className="w-full text-left p-3 border border-cafe-200 rounded-xl">
            <p className="font-bold">{c.nombre}</p><p className="text-xs text-cafe-700">{c.telefono ?? "sin teléfono"}</p>
          </button>
        ))}
        <p className="text-xs text-cafe-700">¿No existe? Créalo primero desde Vender → Cliente nuevo (con teléfono).</p>
        {err && <p className="text-sm font-semibold text-red-600">{err}</p>}
      </section>
    );
  }

  const montoN = Number(monto) || 0;
  const tasa = METODOS[metodo].moneda === "BS" ? (turno?.tasaEurBs ?? 1) : (turno?.tasaEurUsd ?? 1);
  const montoEur = montoN / tasa;
  const bono = esDivisa(metodo) ? montoEur * bonoPct / 100 : 0;
  const pinOk = /^[0-9]{4}$/.test(pin1) && pin1 === pin2;

  return (
    <section className="space-y-4">
      <div className="card p-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-black text-lg">{info.cliente.nombre}</p>
          <p className="text-xs text-cafe-700">{info.cliente.telefono ?? "sin teléfono"} · {info.tienePin ? (info.bloqueado ? "PIN BLOQUEADO 15 min" : "PIN activo") : "sin PIN (se crea en la 1ª recarga)"}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-cafe-700">Saldo</p>
          <p className="text-3xl font-black text-green-700">{usd(info.saldoEur)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button className="btn-acc" onClick={() => { limpiarForm(); setModo("recarga"); }} disabled={!turno}>Recargar</button>
        <button className="btn-sec" onClick={() => { limpiarForm(); setModo("pin"); }}>Resetear PIN</button>
        <button className="btn-sec" onClick={() => { limpiarForm(); setModo("ajuste"); }}>Ajuste</button>
      </div>
      {!turno && <p className="text-sm text-red-600">Abre un turno para recargar: el dinero entra a la caja.</p>}

      {modo === "recarga" && turno && (
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {METODOS_RECARGA.map((m) => (
              <button key={m} onClick={() => setMetodo(m)}
                className={`btn text-sm ${metodo === m ? "bg-cafe-800 text-white" : "bg-cafe-200"}`}>{METODOS[m].label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold w-8">{METODOS[metodo].moneda === "BS" ? "Bs" : "$"}</span>
            <input type="number" step="0.01" inputMode="decimal" className="input text-lg font-bold"
              value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Monto que entrega" />
          </div>
          {METODOS[metodo].refObligatoria && (
            <input className="input" placeholder="Referencia (obligatorio)" value={ref} onChange={(e) => setRef(e.target.value)} />
          )}
          {!info.tienePin && (
            <div className="rounded-xl bg-yellow-50 border border-yellow-300 p-3 space-y-2">
              <p className="text-sm font-bold">El cliente crea su PIN (4 dígitos). Pásale la tablet.</p>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="PIN" value={pin1} onChange={(e) => setPin1(e.target.value)} />
                <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="Repite PIN" value={pin2} onChange={(e) => setPin2(e.target.value)} />
              </div>
            </div>
          )}
          {montoN > 0 && (
            <p className="text-sm">
              Se acredita <strong>{usd(montoEur)}</strong>
              {bono > 0.004 && <> + bono <strong className="text-green-700">{usd(bono)}</strong> ({bonoPct}% por divisa)</>}
              {METODOS[metodo].moneda === "BS" && <> · cobra {fmtBs(montoN)}</>}
            </p>
          )}
          <button className="btn-acc w-full text-lg"
            disabled={pend || !(montoN > 0) || (!info.tienePin && !pinOk) || (METODOS[metodo].refObligatoria && !ref.trim())}
            onClick={() => start(async () => {
              setErr(null); setOk(null);
              const r = await recargarWallet({ clienteId: info.cliente.id, metodo, montoOriginal: montoN,
                referencia: ref || undefined, pinNuevo: info.tienePin ? undefined : pin1 });
              if (!r.ok) { setErr(r.error); return; }
              setOk(`Recarga lista ✓ ${usd(r.montoEur)}${r.bonoEur > 0 ? ` + bono ${usd(r.bonoEur)}` : ""}`);
              limpiarForm(); cargar(info.cliente.id);
            })}>{pend ? "Procesando…" : "Confirmar recarga"}</button>
        </div>
      )}

      {modo === "pin" && (
        <div className="card p-4 space-y-2">
          <p className="text-sm">El cliente elige un PIN nuevo. Autoriza un supervisor.</p>
          <div className="grid grid-cols-3 gap-2">
            <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="PIN nuevo" value={pin1} onChange={(e) => setPin1(e.target.value)} />
            <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="Repite" value={pin2} onChange={(e) => setPin2(e.target.value)} />
            <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="PIN supervisor" value={pinSup} onChange={(e) => setPinSup(e.target.value)} />
          </div>
          <button className="btn-acc w-full" disabled={pend || !pinOk || pinSup.length !== 4}
            onClick={() => start(async () => {
              setErr(null); setOk(null);
              const r = await resetPinWallet({ clienteId: info.cliente.id, pinNuevo: pin1, pinSupervisor: pinSup });
              if (r.ok) { setOk("PIN actualizado ✓"); limpiarForm(); cargar(info.cliente.id); } else setErr(r.error);
            })}>Guardar PIN</button>
        </div>
      )}

      {modo === "ajuste" && (
        <div className="card p-4 space-y-2">
          <p className="text-sm">Corrección manual. Negativo para restar. Queda auditada.</p>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="number" step="0.01" placeholder="$ (ej. -2.50)" value={monto} onChange={(e) => setMonto(e.target.value)} />
            <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="PIN supervisor" value={pinSup} onChange={(e) => setPinSup(e.target.value)} />
          </div>
          <input className="input" placeholder="Motivo (obligatorio)" value={nota} onChange={(e) => setNota(e.target.value)} />
          <button className="btn-acc w-full" disabled={pend || !montoN || !nota.trim() || pinSup.length !== 4}
            onClick={() => start(async () => {
              setErr(null); setOk(null);
              const r = await ajustarWallet({ clienteId: info.cliente.id, montoUsd: montoN, nota, pinSupervisor: pinSup });
              if (r.ok) { setOk("Ajuste registrado ✓"); limpiarForm(); cargar(info.cliente.id); } else setErr(r.error);
            })}>Registrar ajuste</button>
        </div>
      )}

      {err && <p className="card p-3 text-sm font-semibold text-red-600">{err}</p>}
      {ok && <p className="card p-3 text-sm font-semibold text-green-700">{ok}</p>}

      <section className="card">
        <h2 className="p-3 font-black bg-cafe-800 text-white rounded-t-2xl">Movimientos</h2>
        {info.movimientos.map((m: any) => (
          <div key={m.id} className="p-3 border-b border-cafe-200 last:border-0 flex justify-between text-sm gap-3">
            <div>
              <p className="font-semibold">{TIPO[m.tipo]}{m.metodo ? ` · ${METODOS[m.metodo as Metodo]?.label ?? m.metodo}` : ""}{m.tickets?.correlativo ? ` · ${m.tickets.correlativo}` : ""}</p>
              <p className="text-xs text-cafe-700">{new Date(m.ts).toLocaleString("es-VE", { timeZone: "America/Caracas" })}{m.nota ? ` · ${m.nota}` : ""}</p>
            </div>
            <p className={`font-bold tabular-nums ${Number(m.monto_eur) >= 0 ? "text-green-700" : "text-red-600"}`}>
              {Number(m.monto_eur) >= 0 ? "+" : "−"}{usd(Math.abs(Number(m.monto_eur)))}
            </p>
          </div>
        ))}
        {!info.movimientos.length && <p className="p-3 text-sm text-cafe-700">Sin movimientos todavía.</p>}
      </section>

      <button className="btn-sec w-full" onClick={() => { setInfo(null); setRes([]); setQ(""); setOk(null); limpiarForm(); }}>Otro cliente</button>
    </section>
  );
}
