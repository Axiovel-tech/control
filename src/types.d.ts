import type {} from '@mui/material/Dialog';

// Allow `data-testid` in `slotProps.paper` of MUI dialogs so stable E2E
// hooks can be placed on dialog papers (see `src/e2e/README.md`).
declare module '@mui/material/Dialog' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- module augmentation requires an interface
  interface DialogPaperSlotPropsOverrides {
    'data-testid'?: string;
  }
}
