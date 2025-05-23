/*
 * This file is not used for any compilation purpose, it is only used
 * for Tailwind Intellisense & Autocompletion in the source files
 */
import type { Config } from "tailwindcss";

import baseConfig from "@laundryroom/tailwind-config/web";

export default {
  content: ["./src/**/*.tsx"],
  presets: [baseConfig],
  theme: {
    boxShadow: {
      hardrock: "0px 4px 0px",
      "hardrock-sm": "0px 2px 0px",
      "hardrock-lg": "0px 6px 0px",
    },
  },
} satisfies Config;
