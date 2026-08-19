"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { METODOS, METODOS_CAJA, fmtEur, fmtBs, eur, convertir, type Metodo } from "@/lib/money";
import { buscarClientes, crearCliente, cobrarTicket } from "@/app/venta/acciones";

type Producto = { id: number; nombre: string; categoria: string; precio_eur: number; solo_eventos: boolean };
type Cliente = { id: number; nombre: string; alumno?: string | null; telefono?: string | null; zona?: string | null; tipo: string; descuento_default_pct: number };
type Motivo = { id: number; motivo: string; pct: number | null; autoriza: string };
type Linea = { producto_id: number; nombre: string; precio_unit_eur: number; cant: number };

const CLAVE_BORRADOR = "icao_pos_ticket";

/** Orden del grid: lo que más se vende, primero (café solo y nevera). */
const PRIORIDAD = ["CAFÉ CALIENTE", "NEVERA", "CAFÉ FRÍO", "MATCHA & TÉS", "FRAPPÉS & CAO"];

export default function PantallaVenta({
  turno, empleado, productos, genericos, motivos,
}: {
  turno: { id: number; tasaEurBs: number; tasaEurUsd: number };
  empleado: { id: number; nombre: string; rol: string };
  productos: Producto[];
  genericos: Cliente[];
  motivos: Motivo[];
}) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cat, setCat] = useState<string>(PRIORIDAD[0]);
  const [busca, setBusca] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const [recibo, setRecibo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const categorias = useMemo(() => {
    const set = [...new Set(productos.map((p) => p.categoria))];
    return [...PRIORIDAD.filter((c) => set.includes(c)),
            ...set.filter((c) => !PRIORIDAD.includes(c)).sort()];
  }, [productos]);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q) return productos.filter((p) => p.nombre.toLowerCase().includes(q)).slice(0, 60);
    return productos.filter((p) => p.categoria === cat);
  }, [productos, cat, busca]);

  const subtotal = eur(lineas.reduce((a, l) => a + l.precio_unit_eur * l.cant, 0));
  const pctAuto = cliente?.descuento_default_pct ?? 0;

  /* Borrador en localStorage: si se cae el navegador, el ticket no se pierde. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLAVE_BORRADOR);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.turnoId === turno.id) { setLineas(d.lineas ?? []); setCliente(d.cliente ?? null); }
      }
    } catch {}
  }, [turno.id]);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ turnoId: turno.id, lineas, cliente }));
    } catch {}
  }, [lineas, cliente, turno.id]);

  function agregar(p: Producto) {
    setError(null);
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.producto_id === p.id);
      if (i >= 0) { const c = [...ls]; c[i] = { ...c[i], cant: c[i].cant + 1 }; return c; }
      return [...ls, { producto_id: p.id, nombre: p.nombre, precio_unit_eur: p.precio_eur, cant: 1 }];
    });
  }
  const cambiar = (id: number, d: number) =>
    setLineas((ls) => ls.map((l) => l.producto_id === id ? { ...l, cant: l.cant + d } : l).filter((l) => l.cant > 0));

  function limpiar() { setLineas([]); setCliente(null); setRecibo(null); setError(null); }

  if (recibo) return <Recibo r={recibo} onNuevo={limpiar} />;

  return (
    <main className="min-h-screen w-full overflow-x-hidden flex flex-col lg:flex-row">
      {/* ---------- IZQUIERDA: catálogo ---------- */}
      <section className="flex-1 min-w-0 p-4 lg:p-6 space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-cafe-700">{empleado.rol}</p>
            <h1 className="text-xl font-black text-cafe-800">{empleado.nombre}</h1>
          </div>
          <div className="text-right text-xs text-cafe-700">
            <div>Tasa {turno.tasaEurBs.toFixed(2)} Bs/€</div>
            <Link href="/cuentas" className="underline mr-3">Cuentas abiertas</Link>
            <Link href="/turno" className="underline">Turno</Link>
          </div>
        </header>

        <input
          value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar producto…" className="input"
        />

        {!busca && (
          <div className="flex gap-2 overflow-x-auto pb-1 max-w-full">
            {categorias.map((c) => (
              <button key={c} onClick={() => setCat(c)}
                className={`btn whitespace-nowrap text-sm ${c === cat ? "bg-cafe-800 text-white" : "bg-cafe-200 text-cafe-900"}`}>
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {visibles.map((p) => (
            <button key={p.id} onClick={() => agregar(p)}
              className="card p-3 text-left active:scale-[.98] transition min-h-[88px] flex flex-col justify-between">
              <span className="font-semibold text-sm leading-tight">{p.nombre}</span>
              <span className="mt-2 font-black text-cafe-800">{fmtEur(p.precio_eur)}</span>
            </button>
          ))}
          {!visibles.length && <p className="text-sm text-cafe-700 col-span-full">Sin resultados.</p>}
        </div>
      </section>

      {/* ---------- DERECHA: ticket ---------- */}
      <aside className="w-full lg:w-[420px] lg:shrink-0 bg-white border-l border-cafe-200 p-4 lg:p-6 flex flex-col gap-4">
        <SelectorCliente cliente={cliente} genericos={genericos} onPick={setCliente} />

        <div className="flex-1 overflow-y-auto min-h-[120px]">
          {!lineas.length && <p className="text-sm text-cafe-700">Toca un producto para empezar.</p>}
          {lineas.map((l) => (
            <div key={l.producto_id} className="flex items-center gap-2 py-2 border-b border-cafe-200">
              <div className="flex-1">
                <p className="font-semibold text-sm leading-tight">{l.nombre}</p>
                <p className="text-xs text-cafe-700">{fmtEur(l.precio_unit_eur)} c/u</p>
              </div>
              <button onClick={() => cambiar(l.producto_id, -1)} className="btn-sec w-10 px-0">−</button>
              <span className="w-7 text-center font-bold tabular-nums">{l.cant}</span>
              <button onClick={() => cambiar(l.producto_id, 1)} className="btn-sec w-10 px-0">+</button>
              <span className="w-20 text-right font-bold tabular-nums">{fmtEur(l.precio_unit_eur * l.cant)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-cafe-200 pt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span><span className="tabular-nums">{fmtEur(subtotal)}</span>
          </div>
          {pctAuto > 0 && (
            <div className="flex justify-between text-sm text-green-700">
              <span>{cliente?.tipo === "socio_icao" ? `Socio ICAO −${pctAuto}%` : `Descuento −${pctAuto}%`}</span>
              <span className="tabular-nums">−{fmtEur(subtotal * pctAuto / 100)}</span>
            </div>
          )}
          <div className="flex justify-between text-2xl font-black">
            <span>Total</span>
            <span className="tabular-nums">{fmtEur(subtotal * (1 - pctAuto / 100))}</span>
          </div>
          <p className="text-right text-sm text-cafe-700">
            {fmtBs(Math.ceil(subtotal * (1 - pctAuto / 100) * turno.tasaEurBs))}
          </p>
        </div>

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

        <button className="btn-acc w-full text-lg"
          disabled={!lineas.length || !cliente}
          onClick={() => { setError(null); setCobrando(true); }}>
          Cobrar
        </button>
        {!cliente && !!lineas.length && (
          <p className="text-xs text-center text-cafe-700">Selecciona el cliente para poder cobrar</p>
        )}
        {!!lineas.length && (
          <button onClick={limpiar} className="text-xs underline text-cafe-700">Vaciar ticket</button>
        )}
      </aside>

      {cobrando && cliente && (
        <ModalCobro
          turno={turno} cliente={cliente} lineas={lineas} motivos={motivos}
          rolEmpleado={empleado.rol}
          onCerrar={() => setCobrando(false)}
          onListo={(r) => { setCobrando(false); setRecibo(r); setLineas([]); setCliente(null); }}
          onError={(m) => { setCobrando(false); setError(m); }}
        />
      )}
    </main>
  );
}

/* ================= Cliente ================= */

function SelectorCliente({
  cliente, genericos, onPick,
}: { cliente: Cliente | null; genericos: Cliente[]; onPick: (c: Cliente | null) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Cliente[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [pend, start] = useTransition();

  useEffect(() => {
    if (!abierto || q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(() => {
      start(async () => {
        const r = await buscarClientes(q);
        if (r.ok) setRes(r.clientes as Cliente[]);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q, abierto]);

  if (cliente && !abierto) {
    return (
      <div className="card p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold truncate">{cliente.nombre}</p>
          <p className="text-xs text-cafe-700 truncate">
            {cliente.alumno ? `Alumna: ${cliente.alumno}` : cliente.tipo}{cliente.zona ? ` · ${cliente.zona}` : ""}
            {cliente.descuento_default_pct > 0 && ` · ${cliente.descuento_default_pct}%`}
          </p>
        </div>
        <button onClick={() => { setAbierto(true); onPick(null); }} className="btn-sec text-xs">Cambiar</button>
      </div>
    );
  }

  return (
    <div className="card p-3 space-y-3">
      <p className="label">Cliente (obligatorio)</p>

      <div className="flex flex-wrap gap-2">
        {genericos.map((g) => (
          <button key={g.id} onClick={() => { onPick(g); setAbierto(false); setQ(""); }}
            className="btn-pri text-sm">{g.nombre}</button>
        ))}
      </div>

      <input value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
        placeholder="Buscar por representante o alumna…" className="input" />

      {pend && <p className="text-xs text-cafe-700">Buscando…</p>}

      {res.map((c) => (
        <button key={c.id} onClick={() => { onPick(c); setAbierto(false); setQ(""); }}
          className="w-full text-left p-2 rounded-lg hover:bg-cafe-50 border border-cafe-200">
          <span className="font-semibold text-sm">{c.nombre}</span>
          {c.alumno && <span className="block text-xs text-cafe-700">Alumna: {c.alumno}</span>}
        </button>
      ))}

      {q.trim().length >= 2 && !res.length && !pend && (
        <p className="text-xs text-cafe-700">Sin resultados.</p>
      )}

      {!nuevo ? (
        <button onClick={() => setNuevo(true)} className="text-xs underline text-cafe-700">
          + Cliente nuevo
        </button>
      ) : (
        <FormClienteNuevo
          inicial={q}
          onCreado={(c) => { onPick(c); setNuevo(false); setAbierto(false); setQ(""); }}
          onCancel={() => setNuevo(false)}
        />
      )}
    </div>
  );
}

function FormClienteNuevo({
  inicial, onCreado, onCancel,
}: { inicial: string; onCreado: (c: Cliente) => void; onCancel: () => void }) {
  const [f, setF] = useState({ nombre: inicial, telefono: "", alumno: "", zona: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pend, start] = useTransition();

  return (
    <div className="space-y-2 border-t border-cafe-200 pt-3">
      <input className="input" placeholder="Nombre y apellido" value={f.nombre}
        onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      <input className="input" placeholder="Teléfono (para el ticket)" inputMode="tel"
        value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
      <input className="input" placeholder="Alumna (opcional)" value={f.alumno}
        onChange={(e) => setF({ ...f, alumno: e.target.value })} />
      <input className="input" placeholder="Zona de residencia (ej. El Hatillo)" value={f.zona}
        onChange={(e) => setF({ ...f, zona: e.target.value })} />
      {err && <p className="text-xs text-red-600 font-semibold">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-acc flex-1" disabled={pend || !f.nombre.trim()}
          onClick={() => start(async () => {
            const r = await crearCliente(f);
            if (r.ok && r.cliente) onCreado(r.cliente as Cliente); else setErr(r.ok ? "Error" : r.error);
          })}>
          {pend ? "Guardando…" : "Crear y usar"}
        </button>
        <button className="btn-sec" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

/* ================= Cobro ================= */

function ModalCobro({
  turno, cliente, lineas, motivos, rolEmpleado, onCerrar, onListo, onError,
}: {
  turno: { id: number; tasaEurBs: number; tasaEurUsd: number };
  cliente: Cliente; lineas: Linea[]; motivos: Motivo[]; rolEmpleado: string;
  onCerrar: () => void; onListo: (r: any) => void; onError: (m: string) => void;
}) {
  const subtotal = eur(lineas.reduce((a, l) => a + l.precio_unit_eur * l.cant, 0));
  // El 5% de socio ICAO va EMBEBIDO en la ficha del cliente: se aplica solo.
  // NO se ofrece como botón, para que nadie pueda regalárselo a quien quiera.
  const motivoSocio = motivos.find((m) => m.autoriza === "auto") ?? null;
  const motivosManuales = motivos.filter((m) => m.autoriza !== "auto");
  const esSocio = cliente.tipo === "socio_icao" && cliente.descuento_default_pct > 0;
  const [motivo, setMotivo] = useState<Motivo | null>(esSocio ? motivoSocio : null);
  const hayManual = !!motivo && motivo.autoriza !== "auto";
  const [pctLibre, setPctLibre] = useState(0);
  const [pin, setPin] = useState("");
  const [pagos, setPagos] = useState<{ metodo: Metodo; montoEur: number; referencia: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pend, start] = useTransition();

  const pct = motivo ? (motivo.pct ?? pctLibre) : 0;
  const total = eur(subtotal * (1 - pct / 100));
  const pagado = eur(pagos.reduce((a, p) => a + p.montoEur, 0));
  const falta = eur(total - pagado);
  const requierePin = !!motivo && ["supervisor", "admin"].includes(motivo.autoriza)
    && !["supervisor", "admin"].includes(rolEmpleado);

  function addPago(metodo: Metodo) {
    setPagos((ps) => [...ps, { metodo, montoEur: Math.max(0, falta), referencia: "" }]);
  }

  async function ejecutar(dejarAbierto: boolean) {
    setErr(null);
    const r = await cobrarTicket({
      turnoId: turno.id, clienteId: cliente.id,
      lineas: lineas.map((l) => ({ producto_id: l.producto_id, cant: l.cant, precio_unit_eur: l.precio_unit_eur })),
      pagos: dejarAbierto ? [] : pagos.map((p) => ({ metodo: p.metodo, montoEur: p.montoEur, referencia: p.referencia || undefined })),
      descuentoPct: pct, motivoDescuento: motivo?.motivo ?? null,
      pinAutorizacion: pin || undefined, dejarAbierto,
    });
    if (r.ok) onListo(r.ticket); else setErr(r.error);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl p-5 space-y-4 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Cobrar · {cliente.nombre}</h2>
          <button onClick={onCerrar} className="btn-sec text-sm">Volver</button>
        </div>

        <div>
          <p className="label">Descuento</p>
          {esSocio && (
            <p className="mb-2 text-sm font-semibold text-green-700">
              Socio ICAO −{cliente.descuento_default_pct}% · viene en la ficha del cliente,
              se aplica solo
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setMotivo(esSocio ? motivoSocio : null)}
              className={`btn text-sm ${!hayManual ? "bg-cafe-800 text-white" : "bg-cafe-200"}`}>
              {esSocio ? "Solo socio ICAO" : "Sin descuento"}
            </button>
            {motivosManuales.map((m) => (
              <button key={m.id} onClick={() => setMotivo(m)}
                className={`btn text-sm ${motivo?.id === m.id ? "bg-cafe-800 text-white" : "bg-cafe-200"}`}>
                {m.motivo}{m.pct !== null ? ` ${m.pct}%` : ""}
              </button>
            ))}
          </div>
          {motivo?.pct === null && (
            <input type="number" min={0} max={100} className="input mt-2" placeholder="% de ajuste"
              value={pctLibre || ""} onChange={(e) => setPctLibre(Number(e.target.value))} />
          )}
          {requierePin && (
            <input className="input mt-2" inputMode="numeric" maxLength={4} placeholder={`PIN de ${motivo!.autoriza}`}
              value={pin} onChange={(e) => setPin(e.target.value)} />
          )}
        </div>

        <div className="rounded-xl bg-cafe-50 p-3">
          <div className="flex justify-between text-sm"><span>Subtotal</span><span>{fmtEur(subtotal)}</span></div>
          {pct > 0 && (
            <div className="flex justify-between text-sm text-green-700">
              <span>Descuento {pct}%</span><span>−{fmtEur(subtotal * pct / 100)}</span>
            </div>
          )}
          <div className="flex justify-between text-2xl font-black"><span>Total</span><span>{fmtEur(total)}</span></div>
          <p className="text-right text-sm text-cafe-700">{fmtBs(Math.ceil(total * turno.tasaEurBs))}</p>
        </div>

        <div>
          <p className="label">Método de pago</p>
          <div className="grid grid-cols-2 gap-2">
            {METODOS_CAJA.map((m) => (
              <button key={m} onClick={() => addPago(m)} className="btn-sec text-sm">{METODOS[m].label}</button>
            ))}
          </div>
        </div>

        {pagos.map((p, i) => {
          const conv = convertir(p.montoEur, p.metodo, turno.tasaEurBs, turno.tasaEurUsd);
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
                <input className="input" placeholder="Referencia / lote (obligatorio)" value={p.referencia}
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
          onClick={() => start(() => ejecutar(false))}>
          {pend ? "Procesando…" : `Confirmar ${fmtEur(total)}`}
        </button>

        <button className="w-full text-xs underline text-cafe-700" disabled={pend}
          onClick={() => { if (confirm("¿Dejar esta cuenta abierta? Solo para casos excepcionales.")) start(() => ejecutar(true)); }}>
          Dejar cuenta abierta (excepcional)
        </button>
      </div>
    </div>
  );
}

/* ================= Recibo ================= */

function Recibo({ r, onNuevo }: { r: any; onNuevo: () => void }) {
  const texto = encodeURIComponent(
    `ICAO Buencafé · Paseo El Hatillo\n` +
    `Comprobante ${r.correlativo}\n\n` +
    r.lineas.map((l: any) => `${l.cant}x ${l.nombre} — €${(l.precio * l.cant).toFixed(2)}`).join("\n") +
    (r.descuentoEur > 0 ? `\nDescuento −€${r.descuentoEur.toFixed(2)}` : "") +
    `\n\nTOTAL €${r.total.toFixed(2)} (Bs ${Math.ceil(r.total * r.tasaBs).toLocaleString("es-VE")})\n\n` +
    `Comprobante interno de control, no es factura fiscal.`
  );
  const wa = r.telefono ? `https://wa.me/${r.telefono.replace(/\D/g, "")}?text=${texto}` : null;

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="card p-6 w-full max-w-sm space-y-4 text-center">
        <p className={`text-4xl ${r.abierto ? "" : "text-green-600"}`}>{r.abierto ? "⏳" : "✓"}</p>
        <h1 className="text-xl font-black">{r.abierto ? "Cuenta abierta" : "Cobrado"}</h1>
        <p className="text-sm text-cafe-700">{r.correlativo} · {r.cliente}</p>
        <p className="text-3xl font-black">{fmtEur(r.total)}</p>
        <p className="text-sm text-cafe-700">{fmtBs(Math.ceil(r.total * r.tasaBs))}</p>

        <div className="text-left text-sm border-t border-cafe-200 pt-3">
          {r.lineas.map((l: any, i: number) => (
            <div key={i} className="flex justify-between">
              <span>{l.cant}× {l.nombre}</span>
              <span className="tabular-nums">{fmtEur(l.precio * l.cant)}</span>
            </div>
          ))}
        </div>

        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="btn-sec w-full grid place-items-center">
            Enviar por WhatsApp
          </a>
        )}
        <button onClick={onNuevo} className="btn-acc w-full text-lg">Nueva venta</button>
        <p className="text-[10px] text-cafe-700">Comprobante interno de control. No es factura fiscal.</p>
      </div>
    </main>
  );
}
