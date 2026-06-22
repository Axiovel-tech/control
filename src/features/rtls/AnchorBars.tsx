import Box from '@mui/material/Box';

import { Colors } from '@skybrush/app-theme-mui';

import { decodeAnchorMask } from './stats-utils';

type Props = {
  /** Bitmask of anchors that contributed to the most recent fix. */
  anchorMask?: number;
  /** Number of anchors seen, used to determine how many bars to show. */
  anchorsSeen?: number;
};

/**
 * Renders a compact row of per-anchor presence bars derived from an anchor
 * bitmask. A lit (green) bar means that anchor contributed to the last fix.
 */
const AnchorBars = ({ anchorMask, anchorsSeen }: Props) => {
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
          title={`Anchor ${index}: ${present ? 'present' : 'missing'}`}
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
