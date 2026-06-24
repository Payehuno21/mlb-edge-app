# MLB Edge

App de análisis de apuestas MLB. Lee datos en vivo desde el pipeline de
GitHub Actions en `mlb-edge-data` (data.json), sin proxies ni restricciones
de red, porque corre como un sitio web normal.

## Deploy en Vercel (recomendado, gratis)

1. Sube esta carpeta completa a un nuevo repositorio de GitHub (puede llamarse
   `mlb-edge-app`, por ejemplo). Igual que hiciste con `mlb-edge-data`:
   "Add file" → "Upload files" → arrastra todo el contenido de esta carpeta
   (manteniendo `src/` como subcarpeta).
2. Ve a [vercel.com](https://vercel.com) → crea cuenta gratis con tu cuenta
   de GitHub (botón "Continue with GitHub").
3. Click en "Add New..." → "Project".
4. Selecciona el repositorio `mlb-edge-app` que acabas de subir.
5. Vercel detecta automáticamente que es un proyecto Vite — no cambies nada,
   solo da click en "Deploy".
6. Espera ~1 minuto. Te da una URL pública tipo
   `https://mlb-edge-app.vercel.app` — ábrela desde cualquier dispositivo.

Cada vez que subas un cambio al repo de GitHub, Vercel vuelve a desplegar
solo, automáticamente.

## Desarrollo local (opcional, si tienes Node.js instalado)

```bash
npm install
npm run dev
```

## Estructura

- `src/MLBEdge.jsx` — toda la lógica y UI de la app.
- `DATA_JSON_URL` dentro de ese archivo ya apunta a tu repo de datos
  (`Payehuno21/mlb-edge-data`). Si alguna vez cambias de repo de datos,
  edita esa constante.
