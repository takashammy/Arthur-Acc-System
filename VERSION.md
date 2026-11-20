# Version 1.0

This tag is the Arthur practice system as it stood on 21 November 2026.
Clone it and install the locked dependencies to rebuild the same application.

```
npm ci
npm run build
npm run dev
```

`npm ci` uses package-lock.json, so the dependency tree matches this release.
`npm run build` produces the production bundle. With no DATABASE_URL, migrations
are applied by the built-in database when the app starts, not during the build.
Auth is off (`VITE_AUTH_ENABLED=false` in `.grok/app-env.json`).
The dev server listens on port 8080.

Not included: node_modules, the build output, or a hosted database.
English invoice reading uses the Tesseract files in `public/tesseract`.
