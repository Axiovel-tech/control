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
import { useEffect, useRef, useState } from 'react';
import { useSelector, useStore } from 'react-redux';

import { BackgroundHint } from '@skybrush/mui-components';

import {
  POS_DEBUG_DEFAULT_RATE_HZ,
  posStreamController,
} from '~/features/rtls/pos-actions';
import { type PosStreamFailure } from '~/features/rtls/pos-stream-guard';
import {
  appendToTrail,
  boundsContain,
  computeSceneBounds,
  getGridLines,
  getGridStep,
  getPosEstimateAgeMs,
  getPosStaleness,
  hasPlottableAnchor,
  hasPlottablePosition,
  PosStaleness,
  type SceneBounds,
  type TrailPoint,
} from '~/features/rtls/pos-view-utils';
import {
  getOnlineRtlsTags,
  getRtlsAnchors,
  getRtlsPositionsById,
  getRtlsStatsById,
} from '~/features/rtls/selectors';
import { type RtlsAnchor, type RtlsPosEstimate } from '~/features/rtls/types';
import { showError } from '~/features/snackbar/actions';
import { type RootState } from '~/store/reducers';

/** Distinct colors assigned to tags, keyed stably by system id. */
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

/**
 * Returns the display color of a tag. Derived from the system id (not the
 * position of the tag in the current estimate map) so a tag keeps its color
 * when other tags start/stop streaming mid-session.
 */
const colorForTag = (id: string): string =>
  TAG_COLORS[Math.abs(Number.parseInt(id, 10) || 0) % TAG_COLORS.length];

/**
 * Sampling / repaint period (ms). The estimate stream is deliberately NOT
 * subscribed through useSelector: the server sends one notification per
 * device (up to 10 Hz each), so a direct subscription would re-render the
 * whole plot per message — quadratic with tag count. Instead the store is
 * sampled on this tick, which bounds the panel to at most 10 renders/s no
 * matter how many tags stream, and drives the staleness fading between
 * updates. It matches the server's per-device broadcast cap, so no trail
 * points are lost.
 */
const SAMPLE_INTERVAL_MS = 100;

/** Cached per-tag trail geometry (see `trailPointsFor`). */
type TrailGeomCache = {
  stamp: number;
  length: number;
  bounds: SceneBounds;
  points: string;
};

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
  const store = useStore<RootState>();
  const theme = useTheme();
  const onlineTags = useSelector(getOnlineRtlsTags);
  const anchors = useSelector(getRtlsAnchors);
  const statsById = useSelector(getRtlsStatsById);

  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const [positionsById, setPositionsById] = useState<
    Record<string, RtlsPosEstimate>
  >(() => getRtlsPositionsById(store.getState()));
  const [sharedIds, setSharedIds] = useState<string[]>([]);
  const trailsRef = useRef<Record<string, TrailPoint[]>>({});
  const trailGeomRef = useRef<Record<string, TrailGeomCache>>({});
  const lastSampledRef = useRef<Record<string, RtlsPosEstimate> | null>(null);
  const boundsCacheRef = useRef<{
    anchors: RtlsAnchor[];
    bounds: SceneBounds | undefined;
  }>({ anchors: [], bounds: undefined });
  //: generation token of this panel instance in the stream controller; the
  //: controller serializes this generation's operations behind the previous
  //: instance's teardown
  const generationRef = useRef<number>(0);

  // Register with the stream controller for the lifetime of the panel;
  // teardown pays the stream-ownership debt (POS_DBG_HZ=0 on every device
  // this panel enabled), serialized after any in-flight enable. A killed
  // browser/tab cannot run this; recovery is the Devices tab (the
  // controller's release-failure toast names the remedy, too).
  useEffect(() => {
    const generation = posStreamController.acquire();
    generationRef.current = generation;
    return () => {
      void posStreamController.release(generation);
    };
  }, []);

  // Sample the estimate stream (and advance the staleness clock) at a
  // bounded rate. When no new data arrived, the clock only advances while
  // an estimate still has fading left to do — a fully-stale (or empty)
  // scene stops re-rendering entirely until the next notification.
  useEffect(() => {
    const timer = setInterval(() => {
      const next = getRtlsPositionsById(store.getState());
      if (next !== lastSampledRef.current) {
        lastSampledRef.current = next;
        setPositionsById(next);
        setNow(Date.now());
        return;
      }

      setNow((previous) =>
        Object.values(next).some(
          (estimate) =>
            getPosStaleness(estimate, previous) !== PosStaleness.GONE
        )
          ? Date.now()
          : previous
      );
    }, SAMPLE_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [store]);

  // Accumulate a short trail per tag from the sampled stream; drop trails
  // (and their cached geometry) of tags whose estimates were pruned.
  useEffect(() => {
    const trails = trailsRef.current;
    for (const [id, estimate] of Object.entries(positionsById)) {
      trails[id] ??= [];
      appendToTrail(trails[id], estimate);
    }

    for (const id of Object.keys(trails)) {
      if (!(id in positionsById)) {
        delete trails[id];
        delete trailGeomRef.current[id];
      }
    }
  }, [positionsById]);

  const estimates = Object.values(positionsById);

  // Scene bounds are cached and recomputed only when the anchor set changes
  // or an estimate leaves the current frame: a cheap O(n) containment check
  // per render instead of a full recompute, which also keeps the frame from
  // jittering while tags move inside it.
  let bounds = boundsCacheRef.current.bounds;
  if (
    boundsCacheRef.current.anchors !== anchors ||
    bounds === undefined ||
    !boundsContain(bounds, estimates)
  ) {
    bounds = computeSceneBounds(anchors, estimates);
    boundsCacheRef.current = { anchors, bounds };
  }

  const reportFailures = (verb: string, failed: PosStreamFailure[]): void => {
    if (failed.length > 0) {
      showError(
        `Failed to ${verb} the position debug stream on tag(s) ` +
          `${failed.map(({ id }) => id).join(', ')}; ` +
          `set POS_DBG_HZ from the Devices tab if this persists`
      );
    }
  };

  const toggleStream = async (enabled: boolean): Promise<void> => {
    setBusy(true);
    try {
      const generation = generationRef.current;
      if (enabled) {
        const outcome = await posStreamController.enable(
          generation,
          onlineTags.map(({ id }) => id),
          POS_DEBUG_DEFAULT_RATE_HZ
        );
        if (!outcome.ran) {
          return; // this panel instance was torn down mid-request
        }

        setSharedIds(outcome.shared);
        reportFailures('enable', outcome.failed);
      } else {
        // Disables only the streams this panel owns; a stream that was
        // already running when we arrived belongs to whoever started it.
        const outcome = await posStreamController.disable(generation);
        setSharedIds([]);
        reportFailures('disable', outcome.failed);
      }
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
    const scene = bounds;
    const x = (east: number): number => east - scene.minEast;
    const y = (north: number): number => scene.maxNorth - north;
    const step = getGridStep(unit);

    // Memoized per-tag polyline geometry: rebuilt only when the trail
    // gained a sample or the (cached, identity-stable) bounds changed, not
    // on every staleness repaint.
    const trailPointsFor = (id: string, trail: TrailPoint[]): string => {
      const stamp = trail.at(-1)?.receivedAt ?? 0;
      const cached = trailGeomRef.current[id];
      if (
        cached &&
        cached.stamp === stamp &&
        cached.length === trail.length &&
        cached.bounds === scene
      ) {
        return cached.points;
      }

      const points = trail.map((p) => `${x(p.east)},${y(p.north)}`).join(' ');
      trailGeomRef.current[id] = {
        stamp,
        length: trail.length,
        bounds: scene,
        points,
      };
      return points;
    };

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
        {Object.entries(positionsById).map(([id, estimate]) => {
          if (!hasPlottablePosition(estimate)) {
            return null;
          }

          const color = colorForTag(id);
          const opacity = OPACITY_BY_STALENESS[getPosStaleness(estimate, now)];
          const trail = trailsRef.current[id] ?? [];
          const cx = x(estimate.east);
          const cy = y(estimate.north);
          return (
            <g key={id} opacity={opacity}>
              {trail.length > 1 && (
                <polyline
                  points={trailPointsFor(id, trail)}
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
          Enable starts the stream (POS_DBG_HZ) on every online tag not already
          streaming ({onlineTags.length} online); Disable stops only the streams
          this panel started.
          {sharedIds.length > 0 &&
            ` ${sharedIds.length} stream(s) were already on and stay ` +
              `under their owner's control.`}{' '}
          Top-down view, north up; grid in metres.
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0 }}>{plot}</Box>

      {estimates.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2 }}>
          {Object.entries(positionsById).map(([id, estimate]) => {
            const stats = statsById[id];
            const ageMs = getPosEstimateAgeMs(estimate, now);
            return (
              <Typography
                key={id}
                variant='caption'
                style={{ color: colorForTag(id) }}
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
