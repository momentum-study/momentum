// Re-export the project version from package.json so both stay in sync.
// Vite's `define` makes `__APP_VERSION__` available at build time.
// The semantic version is bumped by `npm run release:patch|minor|major`
// (see SPEC §13).
declare const __APP_VERSION__: string
export const VERSION: string = __APP_VERSION__
