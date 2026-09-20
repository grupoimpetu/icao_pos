"use client";

import { useState, useTransition } from "react";
import { marcarVueltoPagado, anularVuelto } from "@/app/vueltos/acciones";

export default function AccionVuelto({ id, telefono, montoBs }: { id: number; telefono: string; montoBs: string }) {
  const [ref, setRef] = useState("");
  const [nota, setNota] = useState("");
  const [modo, setModo] = useState<"pagar" | "anular">("pagar");
  const [err, setErr] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [pend, start] = useTransition();

  if (hecho) {
    const tel = telefono.replace(/\D/g, "").replace(/^0/, "58");
    const msg = encodeURIComponent(`ICAO Buencafé: te enviamos tu vuelto de ${montoBs} por Pago Móvil. Referencia ${hecho}. ¡Gracias por tu visita!`);
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-green-700">Marcado como pagado ✓</p>
        <a className="btn-sec text-xs" target="_blank" rel="noreferrer" href={`https://wa.me/${tel}?text=${msg}`}>Avisar al cliente</a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {modo === "pagar" ? (
        <div className="flex gap-2">
          <input className="input" inputMode="numeric" placeholder="Referencia del Pago Móvil"
            value={ref} onChange={(e) => setRef(e.target.value)} />
          <button className="btn-acc text-sm whitespace-nowrap" disabled={pend || !ref.trim()}
            onClick={() => start(async () => {
              setErr(null);
              const r = await marcarVueltoPagado(id, ref);
              if (r.ok) setHecho(ref.trim()); else setErr(r.error);
            })}>Marcar pagado</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input className="input" placeholder="¿Por qué se anula? (obligatorio)"
            value={nota} onChange={(e) => setNota(e.target.value)} />
          <button className="btn-sec text-sm whitespace-nowrap text-red-600" disabled={pend || !nota.trim()}
            onClick={() => start(async () => {
              setErr(null);
              if (!confirm("¿Anular este vuelto? No se puede deshacer.")) return;
              const r = await anularVuelto(id, nota);
              if (!r.ok) setErr(r.error);
            })}>Anular</button>
        </div>
      )}
      <button className="text-xs underline text-cafe-700" onClick={() => setModo(modo === "pagar" ? "anular" : "pagar")}>
        {modo === "pagar" ? "Anular este vuelto" : "Volver a marcar pagado"}
      </button>
      {err && <p className="text-sm font-semibold text-red-600">{err}</p>}
    </div>
  );
}
