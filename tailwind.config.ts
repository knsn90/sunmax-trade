import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(0 0% 88%)',
        input: 'hsl(0 0% 88%)',
        ring: 'hsl(var(--brand-500) / 1)',
        background: 'hsl(220 30% 97%)',
        foreground: 'hsl(0 0% 8%)',
        primary: {
          DEFAULT: 'hsl(var(--brand-500) / 1)',
          foreground: 'hsl(0 0% 100%)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--brand-500) / 1)',
          foreground: 'hsl(0 0% 100%)',
        },
        destructive: {
          DEFAULT: 'hsl(0 84% 60%)',
          foreground: 'hsl(0 0% 100%)',
        },
        muted: {
          DEFAULT: 'hsl(0 0% 94%)',
          foreground: 'hsl(0 0% 44%)',
        },
        accent: {
          DEFAULT: 'hsl(0 0% 94%)',
          foreground: 'hsl(0 0% 8%)',
        },
        card: {
          DEFAULT: 'hsl(0 0% 100%)',
          foreground: 'hsl(0 0% 8%)',
        },
        // ── MD3 / Google Stitch design tokens ──────────────────────────
        'md-primary':           '#b70011',
        'md-primary-container': '#dc2626',
        'md-on-primary':        '#ffffff',
        'md-on-primary-container': '#fff6f5',
        'md-secondary':         '#575e70',
        'md-on-secondary':      '#ffffff',
        'md-secondary-container': '#d9dff5',
        'md-tertiary':          '#525a64',
        'md-on-tertiary':       '#ffffff',
        'md-tertiary-container':'#6b727d',
        'md-surface':           '#f7f9fc',
        'md-surface-dim':       '#d8dadd',
        'md-surface-bright':    '#f7f9fc',
        'md-surface-container-lowest': '#ffffff',
        'md-surface-container-low':    '#f2f4f7',
        'md-surface-container':        '#eceef1',
        'md-surface-container-high':   '#e6e8eb',
        'md-surface-container-highest':'#e0e3e6',
        'md-on-surface':        '#191c1e',
        'md-on-surface-variant':'#5c403c',
        'md-outline':           '#916f6b',
        'md-outline-variant':   '#e6bdb8',
        'md-error':             '#ba1a1a',
        'md-error-container':   '#ffdad6',
        // ────────────────────────────────────────────────────────────────
        brand: {
          50:  'hsl(var(--brand-50) / <alpha-value>)',
          100: 'hsl(var(--brand-100) / <alpha-value>)',
          200: 'hsl(var(--brand-200) / <alpha-value>)',
          300: 'hsl(var(--brand-300) / <alpha-value>)',
          400: 'hsl(var(--brand-400) / <alpha-value>)',
          500: 'hsl(var(--brand-500) / <alpha-value>)',
          600: 'hsl(var(--brand-600) / <alpha-value>)',
          700: 'hsl(var(--brand-700) / <alpha-value>)',
          800: 'hsl(var(--brand-800) / <alpha-value>)',
          900: 'hsl(var(--brand-900) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        manrope: ['Manrope', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
      },
      borderRadius: {
        lg: '0.5rem',
        md: 'calc(0.5rem - 2px)',
        sm: 'calc(0.5rem - 4px)',
      },
    },
  },
  plugins: [],
} satisfies Config;
