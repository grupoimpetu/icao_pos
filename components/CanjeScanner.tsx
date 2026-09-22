"use client";

import { useEffect, useRef, useState } from "react";
import { previewCanje, confirmarCanje, type RecompensaVista } from "@/app/canje/acciones";

type Preview = {
  cliente: { id: number; nombre: string };
  saldo: number;
  recompensas: RecompensaVista[];
};

// Respaldo de lector QR por CDN (solo si el navegador no trae BarcodeDetector).
// Carga por <script>, NO por import: así no toca el bundler ni package.json.
function cargarJsQR(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.jsQR) return resolve(w.jsQR);
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    sc.async = true;
    sc.onload = () => resolve((window as any).jsQR);
    sc.onerror = () => reject(new Error("No se pudo cargar el lector de QR"));
    document.head.appendChild(sc);
  });
}

export default function CanjeScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const jsqrRef = useRef<any>(null);
  const busyRef = useRef(false);

  const [fase, setFase] = useState<"scan" | "preview" | "hecho">("scan");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] =
    useState<{ recompensa: string; puntosRestantes: number; cupon: string | null } | null>(null);

  function detener() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function iniciarCamara() {
    setError(null);
    busyRef.current = false;
    try {
      if ("BarcodeDetector" in window && !detectorRef.current) {
        try {
          detectorRef.current = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        } catch {
          detectorRef.current = null;
        }
      }
      if (!detectorRef.current && !jsqrRef.current) {
        jsqrRef.current = await cargarJsQR();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      v.setAttribute("playsinline", "true");
      await v.play();
      rafRef.current = requestAnimationFrame(escanear);
    } catch (e: any) {
      setError("No se pudo abrir la cámara. Revisa los permisos del navegador. " + (e?.message ?? ""));
    }
  }

  async function escanear() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || busyRef.current) {
      rafRef.current = requestAnimationFrame(escanear);
      return;
    }
    if (v.readyState === v.HAVE_ENOUGH_DATA) {
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (w && h) {
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, w, h);
          let raw: string | null = null;
          try {
            if (detectorRef.current) {
              const codes = await detectorRef.current.detect(c);
              raw = codes?.[0]?.rawValue ?? null;
            } else if (jsqrRef.current) {
              const img = ctx.getImageData(0, 0, w, h);
              const r = jsqrRef.current(img.data, w, h);
              raw = r?.data ?? null;
            }
          } catch {
            /* frame sin QR legible: seguir */
          }
          if (raw && raw.startsWith("ICAO|W|")) {
            busyRef.current = true;
            await onToken(raw);
            return;
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(escanear);
  }

  async function onToken(t: string) {
    setToken(t);
    const res = await previewCanje(t);
    if (!res.ok) {
      setError(res.error);
      busyRef.current = false;
      rafRef.current = requestAnimationFrame(escanear);
      return;
    }
    detener();
    setError(null);
    setPreview({ cliente: res.cliente, saldo: res.saldo, recompensas: res.recompensas });
    setFase("preview");
  }

  async function elegir(r: RecompensaVista) {
    if (!r.alcanza || procesando) return;
    setProcesando(true);
    setError(null);
    const res = await confirmarCanje(token, r.id);
    setProcesando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResultado({ recompensa: res.recompensa, puntosRestantes: res.puntosRestantes, cupon: res.cupon });
    setFase("hecho");
  }

  function reiniciar() {
    setPreview(null);
    setResultado(null);
    setToken("");
    setError(null);
    setFase("scan");
    iniciarCamara();
  }

  useEffect(() => {
    iniciarCamara();
    return () => detener();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {error && (
        <p className="card p-3 text-sm font-semibold text-red-600">{error}</p>
      )}

      {fase === "scan" && (
        <section className="card p-4 space-y-3">
          <div className="relative overflow-hidden rounded-xl bg-black aspect-square grid place-items-center">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/80" />
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <p className="text-sm text-cafe-700 text-center">
            Apunta al QR que muestra el cliente en su app. Se detecta solo.
          </p>
        </section>
      )}

      {fase === "preview" && preview && (
        <section className="card p-4 space-y-4">
          <div className="flex items-baseline justify-between">
            <div className="min-w-0">
              <p className="label">Cliente</p>
              <h2 className="text-xl font-black truncate">{preview.cliente.nombre}</h2>
            </div>
            <div className="text-right">
              <p className="label">Puntos</p>
              <p className="text-2xl font-black tabular-nums">{preview.saldo}</p>
            </div>
          </div>

          <div className="space-y-2">
            {preview.recompensas.map((r) => (
              <button
                key={r.id}
                onClick={() => elegir(r)}
                disabled={!r.alcanza || procesando}
                className={
                  "w-full text-left rounded-xl p-3 border transition " +
                  (r.alcanza
                    ? "border-cafe-800 bg-cafe-50 hover:bg-cafe-100"
                    : "border-cafe-200 bg-cafe-100 opacity-60 cursor-not-allowed")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold truncate">
                      Nv{r.nivel} · {r.nombre}
                    </p>
                    <p className="text-xs text-cafe-700">
                      {r.puntos_costo} pts{r.tipo === "clase_gratis" ? " · genera cupón" : ""}
                    </p>
                  </div>
                  <span className="text-sm font-black whitespace-nowrap">
                    {r.alcanza ? "Canjear" : `faltan ${r.puntos_costo - preview.saldo}`}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <button onClick={reiniciar} className="btn-sec w-full">Cancelar / escanear otro</button>
        </section>
      )}

      {fase === "hecho" && resultado && (
        <section className="card p-6 space-y-4 text-center">
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-black">Canje realizado</h2>
          <p className="text-cafe-800 font-semibold">{resultado.recompensa}</p>

          {resultado.cupon && (
            <div className="rounded-xl bg-yellow-100 text-yellow-900 p-4">
              <p className="label">Cupón de clase gratis</p>
              <p className="text-2xl font-black tracking-widest">{resultado.cupon}</p>
              <p className="text-xs mt-1">El cliente lo presenta en recepción IMPETU (vence en 60 días).</p>
            </div>
          )}

          <p className="text-sm text-cafe-700">
            Puntos restantes del cliente: <b className="tabular-nums">{resultado.puntosRestantes}</b>
          </p>
          <button onClick={reiniciar} className="btn-acc w-full">Escanear otro</button>
        </section>
      )}
    </div>
  );
}
