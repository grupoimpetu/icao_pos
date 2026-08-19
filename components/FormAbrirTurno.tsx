"use client";
import { useState } from "react";

/** HANDOFF §7: si la API de tasa falla, el sistema NO adivina.
 *  Pide la tasa al supervisor y la marca en amarillo como 'manual'. */
export default function FormAbrirTurno({
  accion,
  sugerida,
}: {
  accion: (fd: FormData) => Promise<void>;
  sugerida: { valor: number; fuente: string } | null;
}) {
  const [tasa, setTasa] = useState(sugerida?.valor?.toString() ?? "");
  const manual = !sugerida || Number(tasa) !== sugerida.valor;

  return (
    <form action={accion} className="card p-6 space-y-5">
      <h2 className="font-bold text-lg">Abrir turno</h2>

      {sugerida ? (
        <p className="text-sm text-cafe-700">
          Tasa tomada de <strong>{sugerida.fuente}</strong>. Verifícala antes de abrir.
        </p>
      ) : (
        <p className="rounded-xl bg-yellow-100 text-yellow-900 p-3 text-sm font-semibold">
          No se pudo obtener la tasa BCV automáticamente. Introdúcela a mano —
          quedará registrada como <strong>tasa manual</strong>.
        </p>
      )}

      <div>
        <label className="label" htmlFor="tasa">Tasa EUR / Bs</label>
        <input
          id="tasa" name="tasa" type="number" step="0.0001" required inputMode="decimal"
          value={tasa} onChange={(e) => setTasa(e.target.value)}
          className="input text-2xl font-bold"
        />
        <input type="hidden" name="fuente" value={manual ? "manual" : sugerida!.fuente} />
        {manual && tasa && (
          <p className="mt-1 text-xs font-bold text-yellow-800">Se guardará como TASA MANUAL</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="fondo_bs">Fondo inicial Bs</label>
          <input id="fondo_bs" name="fondo_bs" type="number" step="0.01"
                 defaultValue={0} inputMode="decimal" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="fondo_usd">Fondo inicial USD</label>
          <input id="fondo_usd" name="fondo_usd" type="number" step="0.01"
                 defaultValue={0} inputMode="decimal" className="input" />
        </div>
      </div>

      <button className="btn-acc w-full text-lg" disabled={!tasa || Number(tasa) <= 0}>
        Abrir turno
      </button>
      <p className="text-xs text-cafe-700">
        La tasa queda congelada para todo el turno. Si el BCV cambia a media jornada,
        un supervisor puede re-snapshotearla — queda en el log de auditoría.
      </p>
    </form>
  );
}
