import { redirect } from "next/navigation";
import { leerSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export default function Home() {
  redirect(leerSesion() ? "/turno" : "/login");
}
