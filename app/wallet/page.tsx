import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion } from "@/lib/session";
import { kpisWallet } from "@/app/wallet/acciones";
import PantallaWallet from "@/components/PantallaWallet";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const s = leerSesion();
  if (!s) redirect("/login");
  const db = supabaseAdmin();
  const { data: turno } = await db.from("turnos")
    .select("id,tasa_eur_bs,tasa_eur_usd_cash").eq("estado", "abierto").maybeSingle();
  const { data: cfg } = await db.from("config").select("valor").eq("clave", "wallet_bono_divisa_pct").maybeSingle();
  const { data: cfgUsd } = await db.from("config").select("valor").eq("clave", "tasa_eur_usd_cash").maybeSingle();
  const k = await kpisWallet();
  const tasaUsd = Number(turno?.tasa_eur_usd_cash ?? cfgUsd?.valor ?? 1);
  const usd = (eurN: number) => `$${(eurN * tasaUsd).toFixed(2)}`;

  return (
    <main className="max-w-3xl mx-auto p-4 lg:p-6 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-cafe-800">Wallet ICAO</h1>
          <p className="text-sm text-cafe-700">Saldo precargado del cliente. Teléfono + PIN.</p>
        </div>
        <Link href="/turno" className="btn-sec text-sm">Volver</Link>
      </header>

      {k && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="card p-3"><p className="text-xs text-cafe-700">ICAO debe (saldo total)</p><p className="text-xl font-black text-orange-700">{usd(k.pasivoEur)}</p><p className="text-[10px] text-cafe-700">{k.clientes} cliente(s)</p></div>
          <div className="card p-3"><p className="text-xs text-cafe-700">Recargas 30 días</p><p className="text-xl font-black">{usd(k.recargas30)}</p></div>
          <div className="card p-3"><p className="text-xs text-cafe-700">Consumos 30 días</p><p className="text-xl font-black">{usd(k.consumos30)}</p></div>
          <div className="card p-3"><p className="text-xs text-cafe-700">Bonos + vueltos 30 d</p><p className="text-xl font-black">{usd(k.bonos30 + k.vueltos30)}</p></div>
        </section>
      )}

      <PantallaWallet
        turno={turno ? { id: turno.id, tasaEurBs: Number(turno.tasa_eur_bs), tasaEurUsd: Number(turno.tasa_eur_usd_cash) } : null}
        tasaEurUsd={tasaUsd}
        bonoPct={Number(cfg?.valor ?? 0)}
      />
    </main>
  );
}
