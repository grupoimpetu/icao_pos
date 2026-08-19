"use client";
import { useState } from "react";

type P = {
  id: number; nombre: string; categoria: string; precio_eur: number;
  codigo_saint: string | null; activo: boolean; solo_eventos: boolean; orden_display: number;
};

export default function TablaProductos({
  productos, categorias, guardar, desactivar,
}: {
  productos: P[];
  categorias: string[];
  guardar: (fd: FormData) => Promise<void>;
  desactivar: (fd: FormData) => Promise<void>;
}) {
  const [editando, setEditando] = useState<P | "nuevo" | null>(null);

  return (
    <>
      <button className="btn-acc" onClick={() => setEditando("nuevo")}>+ Nuevo producto</button>

      {editando && (
        <Editor
          p={editando === "nuevo" ? null : editando}
          categorias={categorias}
          guardar={guardar}
          cerrar={() => setEditando(null)}
        />
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cafe-800 text-white text-left">
            <tr>
              <th className="p-3">Producto</th>
              <th className="p-3">Categoría</th>
              <th className="p-3 text-right">Precio €</th>
              <th className="p-3">Estado</th>
              <th className="p-3">SAINT</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} className={`border-t border-cafe-200 ${!p.activo ? "opacity-45" : ""}`}>
                <td className="p-3 font-semibold">{p.nombre}</td>
                <td className="p-3 text-cafe-700">{p.categoria}</td>
                <td className="p-3 text-right font-bold tabular-nums">
                  {Number(p.precio_eur).toFixed(2)}
                </td>
                <td className="p-3">
                  {!p.activo && <Badge tono="gris">Inactivo</Badge>}
                  {p.solo_eventos && <Badge tono="ambar">Solo eventos</Badge>}
                  {p.activo && !p.solo_eventos && <Badge tono="verde">En venta</Badge>}
                </td>
                <td className="p-3 text-xs text-cafe-500">{p.codigo_saint}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button className="underline mr-3" onClick={() => setEditando(p)}>Editar</button>
                  {p.activo && (
                    <form action={desactivar} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <button className="underline text-red-600">Desactivar</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-cafe-700">
        Desactivar no borra: el histórico de ventas apunta a este producto. Todo cambio
        queda registrado en <code>audit_log</code>.
      </p>
    </>
  );
}

function Badge({ tono, children }: { tono: "verde" | "ambar" | "gris"; children: React.ReactNode }) {
  const c = {
    verde: "bg-green-100 text-green-800",
    ambar: "bg-yellow-100 text-yellow-900",
    gris:  "bg-cafe-200 text-cafe-700",
  }[tono];
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold mr-1 ${c}`}>{children}</span>;
}

function Editor({
  p, categorias, guardar, cerrar,
}: {
  p: P | null; categorias: string[];
  guardar: (fd: FormData) => Promise<void>; cerrar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 grid place-items-center p-4" onClick={cerrar}>
      <form
        action={async (fd) => { await guardar(fd); cerrar(); }}
        onClick={(e) => e.stopPropagation()}
        className="card p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="font-bold text-lg">{p ? "Editar producto" : "Nuevo producto"}</h2>
        {p && <input type="hidden" name="id" value={p.id} />}

        <div>
          <label className="label" htmlFor="nombre">Nombre</label>
          <input id="nombre" name="nombre" required defaultValue={p?.nombre} className="input" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="categoria">Categoría</label>
            <input id="categoria" name="categoria" required list="cats"
                   defaultValue={p?.categoria} className="input" />
            <datalist id="cats">
              {categorias.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="precio_eur">Precio EUR</label>
            <input id="precio_eur" name="precio_eur" type="number" step="0.01" min="0" required
                   inputMode="decimal" defaultValue={p?.precio_eur} className="input font-bold" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="codigo_saint">Código SAINT (opcional)</label>
            <input id="codigo_saint" name="codigo_saint" defaultValue={p?.codigo_saint ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="orden_display">Orden</label>
            <input id="orden_display" name="orden_display" type="number"
                   defaultValue={p?.orden_display ?? 0} className="input" />
          </div>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" name="activo" defaultChecked={p ? p.activo : true} className="w-5 h-5" />
            Activo
          </label>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" name="solo_eventos" defaultChecked={p?.solo_eventos ?? false} className="w-5 h-5" />
            Solo eventos
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <button className="btn-acc flex-1">Guardar</button>
          <button type="button" onClick={cerrar} className="btn-sec">Cancelar</button>
        </div>
      </form>
    </div>
  );
}
