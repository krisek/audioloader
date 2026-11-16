/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,js,ts}'],
  // Colours are CSS variables (see app.css); themes switch via data-theme on <html>.
  darkMode: 'class',
  theme: {
    // Standard responsive breakpoints (explicit so they are documented here).
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // Surfaces (darkest -> lightest)
        surface: {
          950: 'rgb(var(--s950) / <alpha-value>)',
          900: 'rgb(var(--s900) / <alpha-value>)',
          800: 'rgb(var(--s800) / <alpha-value>)',
          700: 'rgb(var(--s700) / <alpha-value>)',
          600: 'rgb(var(--s600) / <alpha-value>)',
        },
        // Text
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        },
        // Accent (music-player green/teal)
        accent: {
          300: 'rgb(var(--a300) / <alpha-value>)',
          400: 'rgb(var(--a400) / <alpha-value>)',
          500: '#10b981',
          600: '#059669',
        },
        danger: 'rgb(var(--danger) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      spacing: {
        // Minimum comfortable touch target (used by player controls later).
        touch: '3rem',
      },
    },
  },
  plugins: [],
}
