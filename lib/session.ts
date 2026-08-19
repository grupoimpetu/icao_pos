import { cookies } from "next/headers";
import crypto from "crypto";

export type Sesion = { empleadoId: number; nombre: string; rol: "barista" | "supervisor" | "admin" };
const COOKIE = "icao_pos_sesion";
const secret = () => process.env.CRON_SECRET || "dev-secret-cambiar";

function firmar(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function crearSesion(s: Sesion) {
  const payload = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + 12 * 3600 * 1000 })).toString("base64url");
  cookies().set(COOKIE, `${payload}.${firmar(payload)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600,
  });
}

export function leerSesion(): Sesion | null {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || firmar(payload) !== sig) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (d.exp < Date.now()) return null;
    return { empleadoId: d.empleadoId, nombre: d.nombre, rol: d.rol };
  } catch { return null; }
}

export function cerrarSesion() { cookies().delete(COOKIE); }

/** Jerarquía de roles: admin > supervisor > barista */
export function puede(rol: Sesion["rol"] | undefined, minimo: Sesion["rol"]) {
  const n = { barista: 1, supervisor: 2, admin: 3 };
  return !!rol && n[rol] >= n[minimo];
}
