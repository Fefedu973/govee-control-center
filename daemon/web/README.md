# Govee Smart Toggle console

React/Vite source for the daemon's configuration console.

The UI components in `src/components/ui` are generated from the current
shadcn/ui `b0` preset: Base UI primitives, Nova style, Neutral palette, Inter
variable font and Lucide icons.

```bash
npm ci
npm run dev
npm run build
```

The production build is written to `../public`. Vite's development server
proxies `/api` requests to `http://127.0.0.1:8799`.
