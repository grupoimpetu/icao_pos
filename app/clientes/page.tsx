import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion, puede } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: { q?: string; e?: string; solo?: string };
}) {
  const s = leerSesion();
  if (!s) redirect("/login");
  if (!puede(s.rol, "admin")) redirect("/turno?e=Solo el admin administra clientes");

  const db = supabaseAdmin();

  const { data: pctSocio } = await db
    .from("motivos_descuento").select("pct").eq("motivo", "Socio ICAO").maybeSingle();
  const PCT = Number(pctSocio?.pct ?? 5);

  let q = db.from("clientes")
    .select("id,nombre,alumno,telefono,tipo,descuento_default_pct,es_generico,activo")
    .eq("activo", true).order("tipo").order("nombre").limit(60);
  if (searchParams.solo === "socios") q = q.eq("tipo", "socio_icao");
  else if (searchParams.q) q = q.ilike("nombre", `%${searchParams.q}%`);
  else q = q.eq("tipo", "socio_icao");   // por defecto solo socios: son los que importan
  const { data: clientes } = await q;

  const { count: totalSocios } = await db
    .from("clientes").select("id", { count: "exact", head: true }).eq("tipo", "socio_icao");

  async function alternarSocio(fd: FormData) {
    "use server";
    const ses = leerSesion();
    if (!puede(ses?.rol, "admin")) redirect("/turno?e=Sin permisos");
    const id = Number(fd.get("id"));
    const activar = fd.get("activar") === "1";

    const { error } = await supabaseAdmin().rpc("aplicar_socio_icao", {
      p_cliente_id: id, p_activar: activar,
    });
    if (error) {
      console.error("[clientes] aplicar_socio_icao:", error.message);
      redirect("/clientes?e=" + encodeURIComponent(error.message));
    }
    revalidatePath("/clientes");
  }

  return (
    <main className="max-w-4xl mx-auto p-4 lg:p-6 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-cafe-800">Clientes</h1>
          <p className="text-sm text-cafe-700">
            <strong>{totalSocios ?? 0}</strong> socios ICAO ({PCT}% de descuento)
          </p>
        </div>
        <Link href="/turno" className="btn-sec text-sm">Volver</Link>
      </header>

      <div className="card p-4 text-sm space-y-1">
        <p className="font-bold">Ser cliente de IMPETU no da descuento.</p>
        <p className="text-cafe-700">
          El {PCT}% es solo para <strong>socios de ICAO</strong>. Marca aquí, uno por uno,
          a quien corresponda. Todo lo demás cobra precio de lista.
        </p>
      </div>

      {searchParams.e && (
        <p className="card p-4 text-sm font-semibold text-red-600">{searchParams.e}</p>
      )}

      <form className="card p-4 flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="label" htmlFor="q">Buscar para marcar como socio</label>
          <input id="q" name="q" defaultValue={searchParams.q} className="input"
                 placeholder="Nombre del cliente…" />
        </div>
        <button className="btn-pri">Buscar</button>
        <Link href="/clientes" className="btn-sec">Ver solo socios</Link>
      </form>

      <div className="card divide-y divide-cafe-200">
        {!clientes?.length && (
          <p className="p-6 text-sm text-cafe-700 text-center">
            {searchParams.q ? "Sin resultados." : "Todavía no hay socios ICAO marcados."}
          </p>
        )}
        {clientes?.map((c) => {
          const esSocio = c.tipo === "socio_icao";
          return (
            <div key={c.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">
                  {c.nombre}
                  {c.es_generico && <span className="ml-2 text-xs text-cafe-700">(genérico)</span>}
                </p>
                <p className="text-xs text-cafe-700 truncate">
                  {c.alumno ? `Alumna: ${c.alumno}` : c.telefono ?? "—"}
                  {esSocio && ` · SOCIO ICAO ${c.descuento_default_pct}%`}
                </p>
              </div>
              {!c.es_generico && (
                <form action={alternarSocio}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="activar" value={esSocio ? "0" : "1"} />
                  <button className={esSocio ? "btn-sec text-sm" : "btn-acc text-sm"}>
                    {esSocio ? "Quitar socio" : `Hacer socio ${PCT}%`}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-cafe-700">
        Cada cambio queda registrado en el log de auditoría con fecha y responsable.
      </p>
    </main>
  );
}
