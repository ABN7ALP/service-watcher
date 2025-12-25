/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // ✅ تفعيل الوضع الداكن بناءً على فئة 'dark'
  content: ["./public/**/*.{html,js}"],
  theme: {
    extend: {
      fontFamily: {
        'cairo': ['Cairo', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
