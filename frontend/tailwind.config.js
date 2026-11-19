/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        fintech: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          900: '#14532d'
        },
        navy: {
          800: '#0f172a',
          900: '#020617'
        }
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-up': {
          from: { opacity: '0', transform: 'translate3d(0, 14px, 0)' },
          to: { opacity: '1', transform: 'none' }
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translate3d(0, -100%, 0)' },
          to: { opacity: '1', transform: 'none' }
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translate3d(0, 100%, 0)' },
          to: { opacity: '1', transform: 'none' }
        },
        'sheet-up': {
          from: { opacity: '0', transform: 'translate3d(0, 40px, 0) scale(0.98)' },
          to: { opacity: '1', transform: 'none' }
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.6)' },
          '70%': { opacity: '1', transform: 'scale(1.06)' },
          '100%': { opacity: '1', transform: 'none' }
        }
      },
      animation: {
        'fade-in': 'fade-in 220ms ease-out both',
        'fade-up': 'fade-up 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-down': 'slide-down 480ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up': 'slide-up 480ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'sheet-up': 'sheet-up 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'pop-in': 'pop-in 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both'
      }
    }
  },
  plugins: []
};
