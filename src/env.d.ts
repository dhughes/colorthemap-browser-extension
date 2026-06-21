// Build-time env vars Vite inlines via import.meta.env. Declared here because
// the project's tsconfig doesn't pull in "vite/client" (which would also drag
// in unrelated DOM/client typings).
interface ImportMetaEnv {
  readonly VITE_CTM_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Vite `?raw` imports: the file's contents as a string. Used to inline the
// design-system CSS into a content-script shadow root.
declare module "*.css?raw" {
  const content: string;
  export default content;
}
