/**
 * @file Design tokens of Axio Control.
 *
 * The palette follows the Axiovel "house lights" system: a dark register for
 * the show (house down) and a paper register for daylight work (house up).
 * The window chrome (header and navigation rail) stays dark in both, so the
 * controls an operator reaches for never move or change contrast when the
 * theme does.
 *
 * Signal colours (success, warning, error) are deliberately *not* defined
 * here: they come from `~/components/colors` and never follow the brand.
 */

export type ColorScheme = 'dark' | 'light';

export type SchemeTokens = Readonly<{
  /** Gutter behind the workbench panels */
  bg: string;
  /** Panel bodies */
  surface: string;
  /** Cards, menus, dialogs, inputs: anything lifted off a panel */
  surfaceRaised: string;
  /** Hovered rows and buttons */
  surfaceHover: string;
  /** Hairlines between regions */
  line: string;
  /** Borders of interactive elements */
  lineStrong: string;
  /** Primary text */
  ink: string;
  /** Secondary text */
  ink2: string;
  /** Captions, disabled hints */
  muted: string;
  /** Interactive colour: selection, focus, primary actions */
  primary: string;
  /** Text on top of the interactive colour */
  onPrimary: string;
  /** Softer companion of the interactive colour */
  primarySoft: string;
  /** Selected rows */
  selected: string;
}>;

export const schemes: Readonly<Record<ColorScheme, SchemeTokens>> = {
  dark: {
    bg: '#06090e',
    surface: '#0e1620',
    surfaceRaised: '#162333',
    surfaceHover: '#1c2c40',
    line: 'rgba(255, 255, 255, 0.10)',
    lineStrong: 'rgba(255, 255, 255, 0.18)',
    ink: '#eef3f7',
    ink2: '#b9c6d1',
    muted: '#7e8e9b',
    primary: '#6fe0f5',
    onPrimary: '#06090e',
    primarySoft: '#3a6f82',
    selected: 'rgba(111, 224, 245, 0.14)',
  },
  light: {
    bg: '#e2dbcf',
    surface: '#f7f4ee',
    surfaceRaised: '#ffffff',
    surfaceHover: '#ede8df',
    line: 'rgba(22, 38, 46, 0.14)',
    lineStrong: 'rgba(22, 38, 46, 0.28)',
    ink: '#16262e',
    ink2: '#3e525c',
    muted: '#5c6c75',
    primary: '#244c5a',
    onPrimary: '#ffffff',
    primarySoft: '#3a6f82',
    selected: 'rgba(36, 76, 90, 0.14)',
  },
};

/**
 * Returns the tokens of the colour scheme that a Material UI theme uses, for
 * component styles that need a surface the palette does not name.
 */
export const tokensOf = (theme: {
  palette: { mode: ColorScheme };
}): SchemeTokens => schemes[theme.palette.mode];

/** Window chrome: header and navigation rail. Dark in both schemes. */
export const chrome = {
  bg: '#0b121a',
  raised: '#162333',
  hover: 'rgba(255, 255, 255, 0.07)',
  line: 'rgba(255, 255, 255, 0.10)',
  ink: '#eef3f7',
  ink2: '#b9c6d1',
  muted: '#7e8e9b',
  active: '#6fe0f5',
} as const;

/** Brand colours. The accent is for the mark only, never for state. */
export const brand = {
  accent: '#ff4814',
  slate: '#244c5a',
} as const;

export const fonts = {
  sans: '"Manrope", "Fira Sans", system-ui, "Segoe UI", sans-serif',
  display: '"Sora", "Manrope", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "DejaVu Sans Mono", monospace',
} as const;

export const radius = {
  /** Buttons, inputs, chips, list rows */
  control: 6,
  /** Workbench panels */
  panel: 10,
  /** Dialogs and popovers */
  overlay: 12,
} as const;

export const layout = {
  headerHeight: 52,
  railWidth: 56,
  railOpenWidth: 208,
  /** Height of the tab strip of a workbench panel */
  panelHeaderHeight: 34,
  /** Gap between workbench panels */
  panelGap: 6,
  /**
   * Below this viewport width the workbench collapses into a single stack of
   * tabs and the navigation rail becomes an overlay.
   */
  compactBreakpoint: 900,
} as const;

const kebab = (key: string): string =>
  key.replaceAll(/[A-Z0-9]+/g, (m) => `-${m.toLowerCase()}`);

/**
 * Renders the tokens of a colour scheme as CSS custom properties so plain
 * stylesheets (workbench, map widgets) follow the same theme as the React
 * components.
 */
export const cssVariablesFor = (
  scheme: ColorScheme
): Record<string, string> => {
  const variables: Record<string, string> = {};

  for (const [key, value] of Object.entries(schemes[scheme])) {
    variables[`--ax-${kebab(key)}`] = value;
  }

  for (const [key, value] of Object.entries(chrome)) {
    variables[`--ax-chrome-${kebab(key)}`] = value;
  }

  variables['--ax-accent'] = brand.accent;
  variables['--ax-font-sans'] = fonts.sans;
  variables['--ax-font-display'] = fonts.display;
  variables['--ax-font-mono'] = fonts.mono;
  variables['--ax-radius-control'] = `${radius.control}px`;
  variables['--ax-radius-panel'] = `${radius.panel}px`;
  variables['--ax-radius-overlay'] = `${radius.overlay}px`;
  variables['--ax-header-height'] = `${layout.headerHeight}px`;
  variables['--ax-rail-width'] = `${layout.railWidth}px`;
  variables['--ax-rail-open-width'] = `${layout.railOpenWidth}px`;
  variables['--ax-panel-header-height'] = `${layout.panelHeaderHeight}px`;

  return variables;
};
