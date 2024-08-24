import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

import base from "./base";

export default {
  content: base.content,
  presets: [base],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      boxShadow: {
        "hardrock": "0px 4px 0px",
        "hardrock-sm": "0px 2px 0px",
        "hardrock-lg": "0px 6px 0px",
      },
      colors: {
        // "amber-50": "#FFFBEB",
        "hotpink": "#FF508F",
        tahiti: "#3ab7bf",
        "bubble-gum": "#ff77e9",
        bermuda: "#78dcca",
        fancyorange: "#ff8c42",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
