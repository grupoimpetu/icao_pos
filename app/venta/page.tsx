import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion } from "@/lib/session";
import PantallaVenta from "@/components/PantallaVenta";

export const dynamic = "force-dynamic";

export default async function VentaPage() {
  const s = leerSesion();
  if (!s) redirect("/login");

  const db = supabaseAdmin();

  const { data: turno, error: eTurno } = await db
    .from("turnos").select("*").eq("estado", "abierto").maybeSingle();
  if (eTurno) console.error("[venta] turno:", eTurno.message);
  if (!turno) redirect("/turno?e=" + encodeURIComponent("Abre un turno antes de vender"));

  const { data: productos, error: eProd } = await db
    .from("productos")
    .select("id,nombre,categoria,precio_eur,solo_eventos")
    .eq("activo", true).eq("es_vendible", true)
    .order("categoria").order("orden_display");
  if (eProd) console.error("[venta] productos:", eProd.message);

  const { data: genericos } = await db
    .from("clientes")
    .select("id,nombre,tipo,descuento_default_pct")
    .eq("es_generico", true).eq("activo", true)
    .order("nombre");

  const { data: motivos } = await db
    .from("motivos_descuento").select("*").order("id");

  return (
    <PantallaVenta
      turno={{
        id: turno.id,
        tasaEurBs: Number(turno.tasa_eur_bs),
        tasaEurUsd: Number(turno.tasa_eur_usd_cash),
      }}
      empleado={{ id: s.empleadoId, nombre: s.nombre, rol: s.rol }}
      productos={(productos ?? []).map((p) => ({ ...p, precio_eur: Number(p.precio_eur) }))}
      genericos={genericos ?? []}
      motivos={(motivos ?? []).map((m) => ({ ...m, pct: m.pct === null ? null : Number(m.pct) }))}
    />
  );
}
