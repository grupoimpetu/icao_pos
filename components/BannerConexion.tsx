"use client";
import { useEffect, useState } from "react";

/** HANDOFF §9: v1 es online-only. El barista tiene que saber de INMEDIATO
 *  que se cayó la conexión, antes de seguir cobrando. */
export default function BannerConexion() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;
  return (
    <div className="sticky top-0 z-50 bg-red-600 text-white text-center py-2 font-bold text-sm">
      SIN CONEXIÓN — no cierres caja ni cobres hasta que vuelva
    </div>
  );
}
