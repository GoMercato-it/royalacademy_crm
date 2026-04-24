export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  safelist: ['hidden'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--navbar-inverse-bg)',
        accent: 'var(--link-color)',
        'text-primary': 'var(--text-color)',
        'text-muted': 'var(--text-muted-color)',
        panel: 'var(--panel-bg)',
        'panel-border': 'var(--panel-default-border)',
      },
      fontFamily: {
        sans: ['var(--font-family-base)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
