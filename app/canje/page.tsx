import { redirect } from "next/navigation";
import Link from "next/link";
import { leerSesion } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import CanjeScanner from "@/components/CanjeScanner";

export const dynamic = "force-dynamic";

export default async function CanjePage() {
  const s = leerSesion();
  if (!s) redirect("/login");

  const db = supabaseAdmin();
  const { data: turno } = await db
    .from("turnos").select("id,estado").eq("estado", "abierto").maybeSingle();
  if (!turno) redirect("/turno?e=" + encodeURIComponent("Abre un turno antes de canjear"));

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-cafe-800">Canjear puntos</h1>
          <p className="text-sm text-cafe-700">Escanea el QR de la app del cliente</p>
        </div>
        <Link href="/turno" className="btn-sec text-sm">Volver</Link>
      </header>

      <CanjeScanner />
    </main>
  );
}
