export const ALIVE_MARKER = 'CTM Importer scaffold alive';

export type Surface = 'background' | 'content' | 'popup' | 'options';

export function aliveMessage(surface: Surface): string {
  return `[${ALIVE_MARKER}] ${surface}`;
}
