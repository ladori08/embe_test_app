/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        background: '#FAF7F2',
        ink: '#2F251C',
        accent: '#F49A57',
        cream: '#FFFDF9',
        border: '#E7DDD1',
        muted: '#8D7761'
      },
      fontFamily: {
        script: ['"Brush Script MT"', '"Segoe Script"', 'cursive'],
        body: ['Nunito', 'Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 8px 24px rgba(47, 37, 28, 0.08)'
      }
    }
  },
  plugins: []
};
