import Box from '@mui/material/Box';

import { Colors } from '@skybrush/app-theme-mui';

import { decodeAnchorMask } from './stats-utils';

type Props = {
  /** Bitmask of the table rows that contributed to the most recent fix. */
  anchorMask?: number;
  /** Number of anchors seen, used to determine how many bars to show. */
  anchorsSeen?: number;
  /** The anchor in each row of the tag's own table, where it names one. */
  names?: ReadonlyArray<string | undefined>;
};

/**
 * Renders a compact row of presence bars, one per row of the tag's anchor
 * table. A lit (green) bar means that row's anchor contributed to the last
 * fix.
 */
const AnchorBars = ({ anchorMask, anchorsSeen, names }: Props) => {
  const count =
    anchorsSeen !== undefined && anchorsSeen > 0 ? anchorsSeen : undefined;
  const bars = decodeAnchorMask(anchorMask, count);

  if (bars.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
      {bars.map((present, index) => (
        <Box
          key={index}
          title={`${names?.[index] ?? `Row ${index}`}: ${present ? 'present' : 'missing'}`}
          sx={{
            width: 6,
            height: 14,
            borderRadius: '1px',
            backgroundColor: present ? Colors.success : Colors.off,
          }}
        />
      ))}
    </Box>
  );
};

export default AnchorBars;
