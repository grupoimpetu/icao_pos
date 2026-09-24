"use client";

import { useState, useTransition } from "react";
import { entregarPreorden, marcarPreorden } from "@/app/preordenes/acciones";

export type PreordenPOS = {
  id: number; codigo: string; franja: string; estado: string; metodo: string; total: number;
  nota: string | null; cliente: string; telefono: string | null; ticket: string | null;
  items: { nombre: string; cant: number }[];
};

const ESTADO: Record<string, string> = {
  pagada: "Pagado · por preparar", lista: "Listo", entregada: "Entregado", no_show: "No retiró",
};
const COLOR: Record<string, string> = {
  pagada: "bg-amber-100 text-amber-800", lista: "bg-green-100 text-green-800",
  entregada: "bg-gray-100 text-gray-600", no_show: "bg-red-100 text-red-700",
};

export default function PreordenesPanel({ pedidos, esHoy, hayTurno }: {
  pedidos: PreordenPOS[]; esHoy: boolean; hayTurno: boolean;
}) {
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);

  function entregar(p: PreordenPOS) {
    if (!confirm(`Entregar ${p.codigo} a ${p.cliente}?`)) return;
    start(async () => {
      const r = await entregarPreorden(p.id);
      setMsg(r.ok ? { ok: true, txt: `${p.codigo} entregado · ticket ${r.correlativo}` } : { ok: false, txt: r.error });
    });
  }
  function marcar(p: PreordenPOS, estado: "lista" | "no_show") {
    if (estado === "no_show" && !confirm(`Marcar ${p.codigo} como NO RETIRADO? No se reembolsa; se registra como venta sin puntos.`)) return;
    start(async () => {
      const r = await marcarPreorden(p.id, estado);
      setMsg(r.ok ? null : { ok: false, txt: r.error });
    });
  }

  if (!pedidos.length) return null;

  return (
    <section className="space-y-3">
      {msg && (
        <div className={`card p-3 text-sm font-semibold ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.txt}</div>
      )}
      {!hayTurno && esHoy && (
        <div className="card p-3 text-sm font-semibold text-red-600">Abre un turno para poder entregar.</div>
      )}
      {pedidos.map((p) => (
        <article key={p.id} className="card p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xl font-black">{p.codigo} · {p.franja}</p>
              <p className="text-sm text-cafe-700 truncate">{p.cliente}{p.telefono ? ` · ${p.telefono}` : ""}</p>
            </div>
            <span className={`text-xs font-bold rounded-full px-2 py-1 whitespace-nowrap ${COLOR[p.estado] ?? ""}`}>
              {ESTADO[p.estado] ?? p.estado}
            </span>
          </div>
          <ul className="text-base">
            {p.items.map((i, k) => <li key={k}><b>{i.cant}×</b> {i.nombre}</li>)}
          </ul>
          {p.nota && <p className="text-sm bg-cafe-100 rounded-lg p-2">📝 {p.nota}</p>}
          <p className="text-xs text-cafe-700">
            ${p.total.toFixed(2)} · pagado con {p.metodo === "wallet" ? "Wallet" : "tarjeta (Stripe)"}{p.ticket ? ` · ticket ${p.ticket}` : ""}
          </p>
          {(p.estado === "pagada" || p.estado === "lista") && (
            <div className="flex gap-2 pt-1">
              {p.estado === "pagada" && (
                <button className="btn-sec flex-1 min-h-[48px]" disabled={pend} onClick={() => marcar(p, "lista")}>Marcar listo</button>
              )}
              {esHoy && (
                <button className="btn-pri flex-1 min-h-[48px]" disabled={pend || !hayTurno} onClick={() => entregar(p)}>Entregar</button>
              )}
              {esHoy && (
                <button className="btn-sec min-h-[48px] px-3 text-red-600" disabled={pend} onClick={() => marcar(p, "no_show")}>No retiró</button>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
