import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion, puede } from "@/lib/session";
import TablaProductos from "@/components/TablaProductos";

export const dynamic = "force-dynamic";

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: { q?: string; cat?: string; e?: string };
}) {
  const s = leerSesion();
  if (!s) redirect("/login");
  if (!puede(s.rol, "supervisor")) redirect("/turno?e=Sin permisos para el catálogo");

  const db = supabaseAdmin();
  let query = db.from("productos").select("*").order("categoria").order("orden_display");
  if (searchParams.q) query = query.ilike("nombre", `%${searchParams.q}%`);
  if (searchParams.cat) query = query.eq("categoria", searchParams.cat);
  const { data: productos } = await query;

  const { data: todas } = await db.from("productos").select("categoria");
  const categorias = [...new Set((todas ?? []).map((r) => r.categoria))].sort();

  // ---------- CRUD (HANDOFF §4: requisito explícito del owner) ----------
  async function guardar(fd: FormData) {
    "use server";
    const ses = leerSesion();
    if (!puede(ses?.rol, "supervisor")) redirect("/turno?e=Sin permisos");

    const id = fd.get("id") ? Number(fd.get("id")) : null;
    const fila = {
      nombre: String(fd.get("nombre")).trim(),
      categoria: String(fd.get("categoria")).trim(),
      precio_eur: Number(fd.get("precio_eur")),
      codigo_saint: (String(fd.get("codigo_saint") || "").trim() || null) as string | null,
      activo: fd.get("activo") === "on",
      solo_eventos: fd.get("solo_eventos") === "on",
      orden_display: Number(fd.get("orden_display") || 0),
    };
    if (!fila.nombre || !fila.categoria || !(fila.precio_eur >= 0)) {
      redirect("/productos?e=" + encodeURIComponent("Nombre, categoría y precio son obligatorios"));
    }

    const db2 = supabaseAdmin();
    const { error } = id
      ? await db2.from("productos").update(fila).eq("id", id)
      : await db2.from("productos").insert(fila);
    if (error) redirect("/productos?e=" + encodeURIComponent(error.message));
    revalidatePath("/productos");
  }

  /** "Borrar" = desactivar. El histórico de ventas apunta a este id;
   *  un delete real rompería tickets viejos. */
  async function desactivar(fd: FormData) {
    "use server";
    const ses = leerSesion();
    if (!puede(ses?.rol, "supervisor")) redirect("/turno?e=Sin permisos");
    await supabaseAdmin().from("productos")
      .update({ activo: false }).eq("id", Number(fd.get("id")));
    revalidatePath("/productos");
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-cafe-800">Catálogo</h1>
          <p className="text-sm text-cafe-700">
            {productos?.length ?? 0} productos · precios en EUR
          </p>
        </div>
        <Link href="/turno" className="btn-sec text-sm">Volver</Link>
      </header>

      {searchParams.e && (
        <p className="card p-4 text-sm font-semibold text-red-600">{searchParams.e}</p>
      )}

      <form className="card p-4 flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="label" htmlFor="q">Buscar</label>
          <input id="q" name="q" defaultValue={searchParams.q} className="input"
                 placeholder="Nombre del producto…" />
        </div>
        <div className="min-w-[200px]">
          <label className="label" htmlFor="cat">Categoría</label>
          <select id="cat" name="cat" defaultValue={searchParams.cat} className="input">
            <option value="">Todas</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button className="btn-pri">Filtrar</button>
      </form>

      <TablaProductos
        productos={productos ?? []}
        categorias={categorias}
        guardar={guardar}
        desactivar={desactivar}
      />
    </main>
  );
}
