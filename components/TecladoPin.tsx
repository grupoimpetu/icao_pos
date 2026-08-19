"use client";
import { useState, useTransition } from "react";

/** Teclado numérico grande. Se opera con el pulgar, en tablet, con prisa. */
export default function TecladoPin({ accion }: { accion: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState("");
  const [pending, start] = useTransition();

  function pulsar(d: string) {
    if (pin.length >= 4 || pending) return;
    const nuevo = pin + d;
    setPin(nuevo);
    if (nuevo.length === 4) {
      start(async () => {
        await accion(nuevo);
        setPin("");
      });
    }
  }

  return (
    <div className="card p-6">
      <div className="flex justify-center gap-3 mb-6" aria-label="PIN de 4 dígitos">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-4 h-4 rounded-full border-2 border-cafe-500 ${
              pin.length > i ? "bg-cafe-800 border-cafe-800" : ""
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} onClick={() => pulsar(d)} disabled={pending}
                  className="btn-sec text-2xl h-16">{d}</button>
        ))}
        <button onClick={() => setPin("")} disabled={pending}
                className="btn-sec h-16 text-sm">Borrar</button>
        <button onClick={() => pulsar("0")} disabled={pending}
                className="btn-sec text-2xl h-16">0</button>
        <span />
      </div>

      {pending && <p className="mt-4 text-center text-sm text-cafe-700">Verificando…</p>}
    </div>
  );
}
