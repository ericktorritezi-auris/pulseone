import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'p-primary-dark': '#0F172A',
        'p-primary': '#2563EB',
        'p-secondary': '#0EA5E9',
        'p-success': '#10B981',
        'p-warning': '#F59E0B',
        'p-neutral': '#64748B',
        'p-bg': '#F8FAFC',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
