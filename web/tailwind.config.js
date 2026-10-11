/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: 'var(--accent)',
        accent2: 'var(--accent-2)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 40px -12px var(--accent)',
        card: '0 18px 40px -24px rgba(0,0,0,.55)',
      },
      keyframes: {
        'ring-pulse': {
          '0%': { transform: 'scale(1)', opacity: '0.85' },
          '100%': { transform: 'scale(2.1)', opacity: '0' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'slide-up': {
          from: { transform: 'translateY(14px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'ring-pulse': 'ring-pulse 1.8s ease-out infinite',
        float: 'float 6s ease-in-out infinite',
        'slide-up': 'slide-up .28s ease-out both',
      },
    },
  },
  plugins: [],
}
