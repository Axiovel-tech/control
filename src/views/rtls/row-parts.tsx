/**
 * @file Layout pieces shared by the tag and the anchor rows of the RTLS role
 * panels: a header-line figure and the expandable detail lines.
 */

import ExpandMore from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';

/** A figure on a row's header line: its name, with the value below it. */
export const HeaderStat = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      minWidth: 52,
      whiteSpace: 'nowrap',
    }}
  >
    <Typography
      variant='caption'
      color='textSecondary'
      sx={{ lineHeight: 1.2 }}
    >
      {label}
    </Typography>
    <Typography variant='body2' sx={{ lineHeight: 1.2 }}>
      {value}
    </Typography>
  </Box>
);

export type DetailLine = { key: string; name: React.ReactNode; value: string };

/**
 * A row's detail lines: each value beside its name, the values in one column
 * that starts `leadWidth` px in, under the header line's figures.
 */
export const DetailLines = ({
  leadWidth,
  lines,
}: {
  leadWidth: number;
  lines: DetailLine[];
}) => (
  <Box
    sx={{
      display: 'grid',
      // same gap as the header line's, so the values line up with its figures
      gridTemplateColumns: `${leadWidth}px 1fr`,
      columnGap: 1,
      '& > div': { py: 0.5 },
    }}
  >
    {lines.map(({ key, name, value }) => (
      <React.Fragment key={key}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{name}</Box>
        <Box sx={{ color: 'text.secondary' }}>{value}</Box>
      </React.Fragment>
    ))}
  </Box>
);

/** The "show more" / "show less" toggle under a row's header line. */
export const ShowMoreButton = ({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <Button
      data-testid='rtls-device-show-more'
      size='small'
      color='inherit'
      endIcon={
        <ExpandMore
          sx={{
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 150ms',
          }}
        />
      }
      sx={{ color: 'text.secondary', textTransform: 'none', py: 0 }}
      onClick={onClick}
    >
      {t(expanded ? 'rtlsTagDetails.showLess' : 'rtlsTagDetails.showMore')}
    </Button>
  );
};
