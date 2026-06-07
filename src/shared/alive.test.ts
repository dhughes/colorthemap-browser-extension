import { describe, expect, it } from 'vitest';
import { ALIVE_MARKER, aliveMessage } from './alive';

describe('aliveMessage', () => {
  it('includes the shared marker so each surface logs a consistent prefix', () => {
    expect(aliveMessage('background')).toBe(`[${ALIVE_MARKER}] background`);
    expect(aliveMessage('content')).toBe(`[${ALIVE_MARKER}] content`);
    expect(aliveMessage('popup')).toBe(`[${ALIVE_MARKER}] popup`);
    expect(aliveMessage('options')).toBe(`[${ALIVE_MARKER}] options`);
  });
});
