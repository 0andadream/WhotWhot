/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Existing landing/play CSS owns the design system; don't reset it.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      transitionTimingFunction: {
        "whot-out": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      boxShadow: {
        "whot-glow": "0 0 24px rgba(196, 30, 58, 0.45)",
        "whot-card": "0 12px 32px rgba(0, 0, 0, 0.55)",
        "whot-card-lift": "0 18px 40px rgba(0, 0, 0, 0.65)",
      },
    },
  },
  plugins: [],
};
