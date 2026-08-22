import { redirect } from "next/navigation";
import Link from "next/link";
import { leerSesion, puede } from "@/lib/session";
import PantallaReportes from "@/components/PantallaReportes";

export const dynamic = "force-dynamic";

export default async function ReportesPage() {
  const s = leerSesion();
  if (!s) redirect("/login");
  if (!puede(s.rol, "supervisor")) redirect("/turno?e=Sin permisos");

  return (
    <main className="min-h-screen w-full overflow-x-hidden p-4 lg:p-8 max-w-5xl mx-auto space-y-5">
      <header className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <p className="text-xs uppercase tracking-wide text-cafe-700">Reportes</p>
          <h1 className="text-2xl font-black text-cafe-800">Ventas y cierres</h1>
        </div>
        <Link href="/turno" className="btn-sec text-sm">Volver</Link>
      </header>

      <PantallaReportes />
    </main>
  );
}
