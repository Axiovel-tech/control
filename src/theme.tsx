/**
 * @file Theme setup for Material-UI.
 *
 * The theme is built from the Axio design tokens in `~/design/tokens`. It
 * also publishes the tokens as CSS custom properties so the plain stylesheets
 * of the workbench and the map follow the selected colour scheme.
 */

import GlobalStyles from '@mui/material/GlobalStyles';
import {
  alpha,
  createTheme,
  ThemeProvider,
  type Theme,
  type ThemeOptions,
} from '@mui/material/styles';
import type React from 'react';
import { useMemo } from 'react';
import { connect } from 'react-redux';

import { Colors, ThemeType, useDarkMode } from '@skybrush/app-theme-mui';

import {
  type ColorScheme,
  cssVariablesFor,
  fonts,
  radius,
  schemes,
} from './design/tokens';
import type { RootState } from './store/reducers';

/**
 * Z indices that keep toast notifications above Material-UI overlays.
 * (react-toast-notifications sits at 1000 and is hard to customize.)
 */
const zIndex = {
  mobileStepper: 600,
  speedDial: 650,
  appBar: 700,
  drawer: 800,
  modal: 900,
  snackbar: 1000,
  tooltip: 1100,
};

const createAxioTheme = (scheme: ColorScheme): Theme => {
  const tokens = schemes[scheme];
  const isDark = scheme === 'dark';

  const baseOptions: ThemeOptions = {
    palette: {
      mode: scheme,
      primary: { main: tokens.primary, contrastText: tokens.onPrimary },
      secondary: { main: tokens.primary, contrastText: tokens.onPrimary },
      success: { main: Colors.success },
      background: { paper: tokens.surface, default: tokens.bg },
      text: {
        primary: tokens.ink,
        secondary: tokens.ink2,
        disabled: alpha(tokens.ink, 0.38),
      },
      divider: tokens.line,
      action: {
        hover: alpha(tokens.ink, 0.06),
        hoverOpacity: 0.06,
        selected: tokens.selected,
        selectedOpacity: 0.14,
      },
    },
    shape: { borderRadius: radius.control },
    typography: {
      fontFamily: fonts.sans,
      fontSize: 14,
      h1: { fontFamily: fonts.display, fontWeight: 600 },
      h2: { fontFamily: fonts.display, fontWeight: 600 },
      h3: { fontFamily: fonts.display, fontWeight: 600 },
      h4: { fontFamily: fonts.display, fontWeight: 600 },
      h5: { fontFamily: fonts.display, fontWeight: 600 },
      h6: { fontFamily: fonts.display, fontWeight: 600, fontSize: '1.05rem' },
      button: {
        fontWeight: 600,
        letterSpacing: '0.01em',
        textTransform: 'none',
      },
      overline: { fontWeight: 700, letterSpacing: '0.12em' },
    },
    zIndex,
  };

  const base = createTheme(baseOptions);
  const outline = `1px solid ${tokens.line}`;
  const overlayPaper = {
    backgroundColor: tokens.surfaceRaised,
    border: outline,
    boxShadow: isDark
      ? '0 24px 64px rgba(0, 0, 0, 0.55)'
      : '0 24px 64px rgba(22, 38, 46, 0.18)',
  };

  const components: ThemeOptions['components'] = {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: tokens.bg,
          fontSize: '0.875rem',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.43,
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: tokens.surfaceRaised,
          borderBottom: outline,
          color: tokens.ink,
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          '&:not(.MuiBackdrop-invisible)': {
            backdropFilter: 'blur(2px)',
            backgroundColor: isDark
              ? 'rgba(3, 6, 10, 0.66)'
              : 'rgba(22, 38, 46, 0.36)',
          },
        },
      },
    },
    // Buttons are neutral unless a colour is asked for: colour is kept for
    // the actions that deserve attention
    MuiButton: {
      defaultProps: { color: 'inherit', disableElevation: true },
      styleOverrides: {
        root: {
          variants: [
            {
              props: { variant: 'contained', color: 'inherit' },
              style: {
                backgroundColor: tokens.surfaceHover,
                border: outline,
                color: tokens.ink,
                '&:hover': { backgroundColor: alpha(tokens.ink, 0.14) },
              },
            },
            {
              props: { variant: 'outlined', color: 'inherit' },
              style: {
                borderColor: tokens.lineStrong,
                '&.Mui-disabled': {
                  border: `1px solid ${base.palette.action.disabledBackground}`,
                },
                '&:hover': {
                  backgroundColor: base.palette.action.hover,
                  borderColor: tokens.lineStrong,
                },
              },
            },
            {
              props: { variant: 'text', color: 'inherit' },
              style: {
                '&:hover': { backgroundColor: base.palette.action.hover },
              },
            },
          ],
        },
      },
    },
    MuiCheckbox: { defaultProps: { color: 'secondary' } },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: radius.control, fontWeight: 600 },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { ...overlayPaper, borderRadius: radius.overlay },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontFamily: fonts.display,
          fontSize: '1.05rem',
          fontWeight: 600,
        },
      },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: tokens.line } } },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: radius.control + 2 } },
    },
    // Lists take the colour of whatever they sit on (panel, dialog, menu)
    MuiList: { styleOverrides: { root: { background: 'transparent' } } },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            boxShadow: `inset 3px 0 0 ${tokens.primary}`,
          },
        },
      },
    },
    MuiListSubheader: {
      styleOverrides: {
        root: {
          backgroundColor: 'inherit',
          color: tokens.muted,
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
          lineHeight: '32px',
          textTransform: 'uppercase',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { ...overlayPaper, borderRadius: radius.control + 2 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: tokens.lineStrong },
      },
    },
    // MUI lightens papers as elevation grows, which tints a tokenized UI
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: tokens.line },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: { ...overlayPaper, borderRadius: radius.control + 2 },
      },
    },
    MuiRadio: { defaultProps: { color: 'secondary' } },
    MuiSwitch: { defaultProps: { color: 'secondary' } },
    MuiTab: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          minWidth: 80,
          // Keeps the prescribed width from being overridden by more
          // specific media queries
          [base.breakpoints.up('xs')]: { minWidth: 80 },
        },
      },
    },
    MuiTabs: {
      defaultProps: { indicatorColor: 'secondary', textColor: 'inherit' },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          '&.Mui-selected:disabled': { color: base.palette.action.disabled },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: isDark ? '#000' : tokens.ink,
          border: isDark ? outline : 'none',
          color: isDark ? tokens.ink : '#fff',
          fontSize: '0.75rem',
          fontWeight: 500,
        },
      },
    },
    // Captions map to a <div>, as the rest of the app expects
    MuiTypography: {
      defaultProps: {
        variantMapping: {
          h1: 'h1',
          h2: 'h2',
          h3: 'h3',
          h4: 'h4',
          h5: 'h5',
          h6: 'h6',
          subtitle1: 'h6',
          subtitle2: 'h6',
          body1: 'p',
          body2: 'p',
          caption: 'div',
          inherit: 'p',
        },
      },
    },
  };

  return createTheme({ ...baseOptions, components });
};

const globalStylesFor = (scheme: ColorScheme) => {
  const tokens = schemes[scheme];

  return {
    ':root': { ...cssVariablesFor(scheme), colorScheme: scheme },
    '*': {
      scrollbarColor: `${tokens.lineStrong} transparent`,
      scrollbarWidth: 'thin' as const,
    },
    '::-webkit-scrollbar': { height: 10, width: 10 },
    '::-webkit-scrollbar-track': { background: 'transparent' },
    '::-webkit-scrollbar-thumb': {
      backgroundClip: 'padding-box',
      backgroundColor: tokens.lineStrong,
      border: '2px solid transparent',
      borderRadius: 10,
    },
    '::-webkit-scrollbar-thumb:hover': { backgroundColor: tokens.muted },
    '::selection': { background: alpha(tokens.primary, 0.35) },
  };
};

type AxioThemeProviderProps = Readonly<{
  children?: React.ReactNode;
  type: ThemeType;
}>;

/**
 * Theme provider that follows the colour scheme chosen in the settings, or
 * the one of the operating system when the setting is "auto".
 */
const AxioThemeProvider = ({ children, type }: AxioThemeProviderProps) => {
  const osPrefersDark = useDarkMode();
  const scheme: ColorScheme =
    type === ThemeType.LIGHT || (type === ThemeType.AUTO && !osPrefersDark)
      ? 'light'
      : 'dark';
  const theme = useMemo(() => createAxioTheme(scheme), [scheme]);
  const globalStyles = useMemo(() => globalStylesFor(scheme), [scheme]);

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles styles={globalStyles} />
      {children}
    </ThemeProvider>
  );
};

export default connect(
  // mapStateToProps
  (state: RootState) => ({
    type: state.settings.display.theme,
  })
)(AxioThemeProvider);
