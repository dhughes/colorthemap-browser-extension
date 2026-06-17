// Build-time env vars Vite inlines via import.meta.env. Declared here because
// the project's tsconfig doesn't pull in "vite/client" (which would also drag
// in unrelated DOM/client typings).
interface ImportMetaEnv {
  readonly VITE_CTM_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
