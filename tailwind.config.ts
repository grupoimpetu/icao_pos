import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cafe:  { 900: "#241609", 800: "#3B2314", 700: "#5A3A22", 500: "#8B5E3C", 200: "#E3D3C2", 50: "#FAF6F1" },
        acento:{ DEFAULT: "#C9852B", dark: "#A96C1C" },
      },
      fontFamily: { sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
