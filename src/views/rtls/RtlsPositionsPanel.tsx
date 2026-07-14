/**
 * @file "Debug Pos Estimates" panel: a live top-down view of the RTLS
 * position solves of all connected tags in the anchor cell's NED frame
 * (rtls-link-zephyr#14).
 *
 * Intended as a pre-flight sanity check of solve quality: the anchors are
 * plotted from the configured cell geometry, and each tag streaming its
 * `POS_DBG_HZ` debug emit shows up as a moving dot with a short trail and a
 * sigma circle. Solver teleports and edge instability that the aggregate
 * health stats hide are immediately visible here. The stream is off by
 * default; the toolbar button toggles it on every online tag.
 */

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { BackgroundHint } from '@skybrush/mui-components';

import { setPosDebugStreamEnabled } from '~/features/rtls/pos-actions';
import {
  appendToTrail,
  computeSceneBounds,
  getGridLines,
  getGridStep,
  getPosEstimateAgeMs,
  getPosStaleness,
  hasPlottableAnchor,
  hasPlottablePosition,
  PosStaleness,
  type TrailPoint,
} from '~/features/rtls/pos-view-utils';
import {
  getRtlsAnchors,
  getRtlsDevicesInOrder,
  getRtlsPositionsById,
  getRtlsStatsById,
} from '~/features/rtls/selectors';
import { classifyRole, RtlsRole } from '~/features/rtls/stats-utils';
import { type AppDispatch } from '~/store/reducers';

/** Distinct colors assigned to tags round-robin by display order. */
const TAG_COLORS = [
  '#2196f3',
  '#e91e63',
  '#4caf50',
  '#ff9800',
  '#9c27b0',
  '#00bcd4',
  '#cddc39',
  '#795548',
];

/** Repaint period (ms); drives staleness fading between store updates. */
const REPAINT_INTERVAL_MS = 250;

const OPACITY_BY_STALENESS: Record<PosStaleness, number> = {
  [PosStaleness.LIVE]: 1,
  [PosStaleness.STALE]: 0.4,
  [PosStaleness.GONE]: 0.15,
};

const formatMeters = (value: number | undefined, digits = 2): string =>
  value === undefined ? '—' : value.toFixed(digits);

const formatAge = (ageMs: number | undefined): string => {
  if (ageMs === undefined) {
    return '—';
  }

  return ageMs < 1000
    ? `${Math.round(ageMs)} ms`
    : `${(ageMs / 1000).toFixed(1)} s`;
};

const RtlsPositionsPanel = (): React.JSX.Element => {
  const dispatch = useDispatch<AppDispatch>();
  const theme = useTheme();
  const devices = useSelector(getRtlsDevicesInOrder);
  const positionsById = useSelector(getRtlsPositionsById);
  const anchors = useSelector(getRtlsAnchors);
  const statsById = useSelector(getRtlsStatsById);

  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const trailsRef = useRef<Record<string, TrailPoint[]>>({});

  // Periodic repaint so staleness fading progresses even when the stream
  // stops (which is exactly when the fading matters).
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, REPAINT_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);

  // Accumulate a short trail per tag from the estimate stream; drop trails
  // of tags whose estimates were pruned.
  useEffect(() => {
    const trails = trailsRef.current;
    for (const [id, estimate] of Object.entries(positionsById)) {
      trails[id] ??= [];
      appendToTrail(trails[id], estimate);
    }

    for (const id of Object.keys(trails)) {
      if (!(id in positionsById)) {
        delete trails[id];
      }
    }
  }, [positionsById]);

  const onlineTags = useMemo(
    () =>
      devices.filter(
        (device) => device.online && classifyRole(device.role) === RtlsRole.TAG
      ),
    [devices]
  );

  const estimates = Object.values(positionsById);
  const bounds = computeSceneBounds(anchors, estimates);

  const toggleStream = async (enabled: boolean): Promise<void> => {
    setBusy(true);
    try {
      await dispatch(setPosDebugStreamEnabled(enabled));
    } finally {
      setBusy(false);
    }
  };

  const gridColor = theme.palette.divider;
  const labelColor = theme.palette.text.secondary;

  let plot: React.JSX.Element;
  if (!bounds) {
    plot = (
      <BackgroundHint
        header='No position estimates yet'
        text={
          onlineTags.length > 0
            ? 'Enable the debug stream to plot the live position solves of the connected tags.'
            : 'No online tags. Estimates appear here once a tag with a nonzero POS_DBG_HZ parameter is connected.'
        }
      />
    );
  } else {
    const width = bounds.maxEast - bounds.minEast;
    const height = bounds.maxNorth - bounds.minNorth;
    const unit = Math.max(width, height);
    const fontSize = unit * 0.03;
    const dotRadius = unit * 0.012;
    const x = (east: number): number => east - bounds.minEast;
    const y = (north: number): number => bounds.maxNorth - north;
    const step = getGridStep(unit);

    plot = (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio='xMidYMid meet'
        style={{ width: '100%', height: '100%' }}
      >
        {/* grid */}
        {getGridLines(bounds.minEast, bounds.maxEast, step).map((east) => (
          <g key={`e${east}`}>
            <line
              x1={x(east)}
              y1={0}
              x2={x(east)}
              y2={height}
              stroke={gridColor}
              strokeWidth={unit * 0.002}
            />
            <text
              x={x(east) + fontSize * 0.2}
              y={height - fontSize * 0.3}
              fontSize={fontSize * 0.8}
              fill={labelColor}
            >
              {east}
            </text>
          </g>
        ))}
        {getGridLines(bounds.minNorth, bounds.maxNorth, step).map((north) => (
          <g key={`n${north}`}>
            <line
              x1={0}
              y1={y(north)}
              x2={width}
              y2={y(north)}
              stroke={gridColor}
              strokeWidth={unit * 0.002}
            />
            <text
              x={fontSize * 0.3}
              y={y(north) - fontSize * 0.2}
              fontSize={fontSize * 0.8}
              fill={labelColor}
            >
              {north}
            </text>
          </g>
        ))}

        {/* anchors, from the configured cell geometry */}
        {anchors.filter(hasPlottableAnchor).map((anchor) => {
          const size = dotRadius * 2.2;
          const cx = x(anchor.ned.east);
          const cy = y(anchor.ned.north);
          const color = anchor.active
            ? theme.palette.success.main
            : theme.palette.text.disabled;
          return (
            <g key={anchor.id}>
              <rect
                x={cx - size / 2}
                y={cy - size / 2}
                width={size}
                height={size}
                fill={color}
              />
              <text
                x={cx + size}
                y={cy + size / 2}
                fontSize={fontSize}
                fill={labelColor}
              >
                {anchor.index === undefined ? anchor.id : `A${anchor.index}`}
              </text>
            </g>
          );
        })}

        {/* tags: trail + sigma circle + dot + label */}
        {Object.entries(positionsById).map(([id, estimate], index) => {
          if (!hasPlottablePosition(estimate)) {
            return null;
          }

          const color = TAG_COLORS[index % TAG_COLORS.length];
          const opacity = OPACITY_BY_STALENESS[getPosStaleness(estimate, now)];
          const trail = trailsRef.current[id] ?? [];
          const cx = x(estimate.east);
          const cy = y(estimate.north);
          return (
            <g key={id} opacity={opacity}>
              {trail.length > 1 && (
                <polyline
                  points={trail
                    .map((p) => `${x(p.east)},${y(p.north)}`)
                    .join(' ')}
                  fill='none'
                  stroke={color}
                  strokeWidth={unit * 0.004}
                  strokeOpacity={0.5}
                />
              )}
              {estimate.sigma !== undefined && estimate.sigma > 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={estimate.sigma}
                  fill={color}
                  fillOpacity={0.08}
                  stroke={color}
                  strokeOpacity={0.4}
                  strokeWidth={unit * 0.002}
                />
              )}
              <circle cx={cx} cy={cy} r={dotRadius} fill={color} />
              <text
                x={cx + dotRadius * 1.8}
                y={cy - dotRadius * 1.2}
                fontSize={fontSize}
                fill={color}
              >
                {id}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        p: 1,
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          size='small'
          variant='outlined'
          disabled={busy || onlineTags.length === 0}
          onClick={() => {
            void toggleStream(true);
          }}
        >
          Enable stream
        </Button>
        <Button
          size='small'
          disabled={busy || onlineTags.length === 0}
          onClick={() => {
            void toggleStream(false);
          }}
        >
          Disable
        </Button>
        <Typography variant='caption' color='textSecondary'>
          Sets POS_DBG_HZ on every online tag ({onlineTags.length} online).
          Top-down view, north up; grid in metres.
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0 }}>{plot}</Box>

      {estimates.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2 }}>
          {Object.entries(positionsById).map(([id, estimate], index) => {
            const stats = statsById[id];
            const ageMs = getPosEstimateAgeMs(estimate, now);
            return (
              <Typography
                key={id}
                variant='caption'
                style={{ color: TAG_COLORS[index % TAG_COLORS.length] }}
              >
                {`#${id} N ${formatMeters(estimate.north)} E ${formatMeters(
                  estimate.east
                )} D ${formatMeters(estimate.down)} σ ${formatMeters(
                  estimate.sigma
                )} · ${formatAge(ageMs)}${
                  stats?.solveRateHz === undefined
                    ? ''
                    : ` · ${stats.solveRateHz.toFixed(1)} Hz solve`
                }`}
              </Typography>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default RtlsPositionsPanel;
