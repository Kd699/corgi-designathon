/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // The five brand tokens the V3Artboard runtime paints its chrome with. Copied
      // verbatim from the source project's config so the board renders identically.
      // (`grey-06` and `t-2` appear in the runtime but are undefined there too — they are
      // no-op classes, and defining them here would make this copy look different.)
      colors: {
        'primary-1': '#402AFF',
        'p1-50': '#EDEBFF',
        'grey-50': '#73727C',
        'grey-20': '#C7C7CC',
        'grey-12': '#D7D6DA',
        'grey-03': '#F8F8FB',
      },
    },
  },
  plugins: [],
};
