import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// The Go server serves the production build from its ./static folder at /static/,
// so built asset URLs must be prefixed with that path. Override with BASE_URL=/x/ npm run build.
export default defineConfig(({ command }) => ({
  base: process.env.BASE_URL || (command === 'build' ? '/static/' : '/'),
  // Not the default 'assets': the server's static/assets/ (vinyl.webp cover fallback) must stay untouched.
  build: { assetsDir: 'app' },
  plugins: [svelte()],
}))
