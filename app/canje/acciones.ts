"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { leerSesion } from "@/lib/session";

export type RecompensaVista = {
  id: number;
  nivel: number;
  nombre: string;
  tipo: string;
  puntos_costo: number;
  valor_eur: number;
  alcanza: boolean;
};

/** Valida el QR del cliente y devuelve su saldo de puntos + la escalera,
 *  marcando cuáles alcanza. El token dura 90s (lo valida wallet_qr_validate). */
export async function previewCanje(token: string) {
  const s = leerSesion();
  if (!s) return { ok: false as const, error: "Sesión expirada" };
  if (!token || !token.startsWith("ICAO|W|"))
    return { ok: false as const, error: "Ese QR no es de la Wallet ICAO" };

  const db = supabaseAdmin();

  const { data: val, error: eV } = await db.rpc("wallet_qr_validate", { p_token: token });
  const v = val?.[0];
  if (eV || !v?.valido)
    return { ok: false as const, error: "QR inválido o vencido. Pídele al cliente que lo refresque." };

  const clienteId = Number(v.cliente_id);

  const [{ data: saldoData }, { data: recs, error: eR }] = await Promise.all([
    db.rpc("saldo_puntos", { p_cliente: clienteId }),
    db.from("recompensas")
      .select("id,nivel,nombre,tipo,puntos_costo,valor_eur")
      .eq("activo", true).order("nivel"),
  ]);
  if (eR) return { ok: false as const, error: "No se pudieron leer las recompensas" };

  const saldo = Number(saldoData ?? 0);
  const recompensas: RecompensaVista[] = (recs ?? []).map((r: any) => ({
    id: Number(r.id),
    nivel: Number(r.nivel),
    nombre: r.nombre,
    tipo: r.tipo,
    puntos_costo: Number(r.puntos_costo),
    valor_eur: Number(r.valor_eur),
    alcanza: saldo >= Number(r.puntos_costo),
  }));

  return {
    ok: true as const,
    cliente: { id: clienteId, nombre: v.nombre ?? "Cliente" },
    saldo,
    recompensas,
  };
}

/** Redime la recompensa contra el mismo token (se re-valida server-side). */
export async function confirmarCanje(token: string, recompensaId: number) {
  const s = leerSesion();
  if (!s) return { ok: false as const, error: "Sesión expirada" };

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("redimir_recompensa", {
    p_token: token,
    p_recompensa_id: recompensaId,
    p_empleado: s.nombre ?? String(s.empleadoId),
  });
  if (error) return { ok: false as const, error: error.message };

  const r = data?.[0];
  return {
    ok: true as const,
    recompensa: r?.recompensa ?? "",
    puntosCosto: Number(r?.puntos_costo ?? 0),
    puntosRestantes: Number(r?.puntos_restantes ?? 0),
    cupon: (r?.cupon_codigo ?? null) as string | null,
  };
}
