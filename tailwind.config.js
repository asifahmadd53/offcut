/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        card: 'var(--card)',
        foreground: 'var(--foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        faint: 'var(--faint)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        'border-stronger': 'var(--border-stronger)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        control: 'var(--control)',
        ring: 'var(--ring)',
        brand: {
          DEFAULT: 'var(--brand)',
          hover: 'var(--brand-hover)',
          fg: 'var(--brand-fg)',
          tint: 'var(--brand-tint)',
          ink: 'var(--brand-ink)',
        },
        'on-dark-primary': {
          DEFAULT: 'var(--on-dark-primary)',
          foreground: 'var(--on-dark-primary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--fill-accent)',
          bg: 'var(--accent-bg)',
          border: 'var(--accent-border)',
          text: 'var(--accent-text)',
        },
        success: {
          bg: 'var(--success-bg)',
          border: 'var(--success-border)',
          text: 'var(--success-text)',
        },
        warning: {
          bg: 'var(--warning-bg)',
          border: 'var(--warning-border)',
          text: 'var(--warning-text)',
        },
        danger: {
          bg: 'var(--danger-bg)',
          border: 'var(--danger-border)',
          text: 'var(--danger-text)',
        },
      },
      borderWidth: { hair: '0.5px' },
      borderRadius: {
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
        card: '20px',
        'card-sm': '18px',
        btn: '16px',
        'btn-hero': '18px',
        field: '14px',
        sheet: '24px',
      },
      boxShadow: {
        elevated: '0 1px 2px rgba(27,26,23,.06), 0 8px 24px rgba(27,26,23,.06)',
      },
      fontFamily: {
        sans: [
          'Inter Variable',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
