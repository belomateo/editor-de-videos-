import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#101114',
        panel: '#17181d',
        line: '#24262e',
        amber: '#FFC857',
        mute: '#8b8e98',
      },
    },
  },
  plugins: [],
};
export default config;
