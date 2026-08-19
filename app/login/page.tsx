import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { crearSesion, leerSesion } from "@/lib/session";
import TecladoPin from "@/components/TecladoPin";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { e?: string } }) {
  if (leerSesion()) redirect("/turno");

  async function entrar(pin: string) {
    "use server";
    const ip = headers().get("x-forwarded-for")?.split(",")[0] ?? "local";
    const db = supabaseAdmin();

    const { data: bloqueado, error: eBloq } = await db.rpc("pin_bloqueado", { p_ip: ip });
    if (eBloq) console.error("[login] pin_bloqueado:", eBloq.message);
    if (bloqueado) redirect("/login?e=" + encodeURIComponent("Demasiados intentos. Espera 10 minutos."));

    const { data, error } = await db.rpc("verificar_pin", { p_pin: pin });

    // Un fallo de base NO se puede mostrar como "PIN incorrecto": son problemas
    // distintos y confundirlos hace imposible dar soporte en caja.
    if (error) {
      console.error("[login] verificar_pin:", error.message);
      redirect("/login?e=" + encodeURIComponent("Error de conexión con la base. Avisa al administrador."));
    }

    const emp = data?.[0];
    await db.from("intentos_pin").insert({ ip, exitoso: !!emp });
    if (!emp) redirect("/login?e=" + encodeURIComponent("PIN incorrecto"));

    crearSesion({ empleadoId: emp.id, nombre: emp.nombre, rol: emp.rol });
    redirect("/turno");
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight text-cafe-800">ICAO</h1>
          <p className="text-sm text-cafe-700">Paseo El Hatillo · Punto de venta</p>
        </div>
        {searchParams.e && (
          <p className="mb-4 text-center text-sm font-semibold text-red-600">{searchParams.e}</p>
        )}
        <TecladoPin accion={entrar} />
      </div>
    </main>
  );
}
