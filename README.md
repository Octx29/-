# React + Vite

## Grading regression tests

```sh
npm ci
npx playwright install chromium
npm test
```

The tests start Vite automatically and exercise the real grading screen in
Chromium. API responses are controlled by the tests, so no database or teacher
credentials are needed. They cover switching assignments while a roster loads,
out-of-order responses, switching classrooms, and failed roster loads. A separate
in-memory store checks that a stale roster cannot overwrite another assignment's
grades and that edits to the selected assignment still save correctly.

See [the bug reproduction and verification notes](docs/grading-race.md).

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
