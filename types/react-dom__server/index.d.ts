/**
 * Minimal declaration for `react-dom/server` — the project does not ship
 * `@types/react-dom`, and the test suite only needs static markup rendering.
 */
declare module 'react-dom/server' {
  import { type ReactNode } from 'react';

  export function renderToStaticMarkup(node: ReactNode): string;
  export function renderToString(node: ReactNode): string;
}
