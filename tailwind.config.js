/** @type {import('tailwindcss').Config} */
module.exports = {
  // Class-based dark mode: `dark:` variants only activate inside a parent
  // carrying the `dark` class. Currently scoped to the IPL Arena subtree via
  // <IPLThemeScope> — no other surface in the app ships `dark:` variants, so
  // enabling this has zero visual impact outside IPL.
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      keyframes: {
        'blink-cursor': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'blink-cursor': 'blink-cursor 0.8s step-end infinite',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
