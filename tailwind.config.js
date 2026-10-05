export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1f2a37',
        sand: '#f7f4ef',
        olive: { 50: '#f2f6ef', 100: '#e1ebd9', 500: '#5b7f4a', 600: '#4a6b3b', 700: '#3b5530' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
}
