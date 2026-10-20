export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#18222d', paper: '#f6f5f1',
        olive: { 50: '#f1f6ed', 100: '#e4eddc', 500: '#4f7d43', 600: '#3f6b35', 700: '#2f5228' },
      },
      fontFamily: { sans: ['Figtree', 'system-ui', 'sans-serif'], display: ['"Bricolage Grotesque"', 'Figtree', 'sans-serif'] },
    },
  },
}
