/**
 * @file The top view of the survey page: every online anchor of the cell as
 * a marker the operator drags to where it roughly stands, the declared X and
 * Y axes, the anchor that initiates the running step, and the fitted
 * positions drawn over the sketch.
 *
 * North is up and east right, in metres, like the positions view. The fit
 * arrives in the declared frame and is drawn with the turn and shift it was
 * calculated under, so it lands on the drawing it was made from and stays
 * there while the operator edits the sketch.
 *
 * Anchors that stand right above other anchors share a spot in a top view.
 * Each height group therefore has a marker of its own (a dot for the lowest,
 * a wider ring for each group above) and its own corner for the label.
 */

import { useTheme } from '@mui/material/styles';
import type React from 'react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  boundsOfPoints,
  getGridLines,
  getGridStep,
  type NePoint,
  scenePointFromClient,
  type SceneBounds,
} from '~/features/rtls/pos-view-utils';
import { type FrameTransform, fromFrame } from '~/features/rtls/survey-frame';
import { type RtlsSurvey } from '~/features/rtls/survey-messages';
import {
  planAxes,
  TIER_LABELS,
  tierOf,
  tierRadius,
} from '~/features/rtls/survey-plan';
import {
  planMarkers,
  roundCm,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  withAnchorMoved,
} from '~/features/rtls/survey-sketch';

import { type AnchorNamer, centimetres, groupColor } from './labels';

type SurveyPlanProps = {
  anchors: RtlsSurveyAnchor[];
  sketch: RtlsSurveySketch;
  survey?: RtlsSurvey;
  nameOf: AnchorNamer;
  /** How the held fit is drawn on the given sketch (`heldFitTransform`). */
  fitTransformOf: (sketch: RtlsSurveySketch) => FrameTransform;
  /** The plan is shown small: markers and labels are drawn larger in it. */
  dense?: boolean;
  onMove: (id: string, point: NePoint) => void;
};

/** A square standing on a corner, `half` from its centre to each corner. */
const diamond = (cx: number, cy: number, half: number): string =>
  `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;

const SurveyPlan = ({
  anchors,
  sketch,
  survey,
  nameOf,
  fitTransformOf,
  dense = false,
  onMove,
}: SurveyPlanProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  // the marker being dragged and where; the scene holds still meanwhile
  const [drag, setDrag] = useState<{
    id: string;
    point: NePoint;
    moved: boolean;
    bounds: SceneBounds;
  }>();

  const drawn =
    drag === undefined ? sketch : withAnchorMoved(sketch, drag.id, drag.point);
  const transform = fitTransformOf(drawn);
  const fit = survey?.fit;
  const found = Object.fromEntries(
    Object.entries(fit?.anchors ?? {}).map(([id, anchor]) => [
      id,
      fromFrame(transform, anchor),
    ])
  );
  // a committed fit is where the anchors are: the markers show it, and
  // nothing is drawn over them
  const fitted = survey?.state === 'committed' ? {} : found;
  const markers = planMarkers(drawn, anchors, found);
  const origin =
    sketch.origin === undefined ? undefined : markers[sketch.origin];
  const xAxis = sketch.xAxis === undefined ? undefined : markers[sketch.xAxis];
  const bounds =
    drag?.bounds ??
    boundsOfPoints(
      [
        ...Object.values(markers).map(({ point }) => point),
        ...Object.values(fitted),
      ],
      { margin: 1.5, minSpan: 6 }
    );
  if (bounds === undefined) {
    return null;
  }

  const width = bounds.maxEast - bounds.minEast;
  const height = bounds.maxNorth - bounds.minNorth;
  const unit = Math.max(width, height);
  const fontSize = unit * (dense ? 0.042 : 0.03);
  const radius = unit * (dense ? 0.018 : 0.014);
  const x = (east: number): number => east - bounds.minEast;
  const y = (north: number): number => bounds.maxNorth - north;
  const step = getGridStep(unit);
  const gridColor = theme.palette.divider;
  const labelColor = theme.palette.text.secondary;
  const axisColor = theme.palette.text.primary;
  const levelOf = (id: string): number => sketch.groupOf[id] ?? 0;
  const axes = planAxes(origin?.point, xAxis?.point, unit * 0.07, bounds);

  const pointAt = (event: React.PointerEvent): NePoint | undefined => {
    const box = svgRef.current?.getBoundingClientRect();
    const point =
      box === undefined
        ? undefined
        : scenePointFromClient(
            { x: event.clientX, y: event.clientY },
            box,
            bounds
          );
    return point === undefined
      ? undefined
      : { north: roundCm(point.north), east: roundCm(point.east) };
  };

  const dragHandlers = (id: string) => ({
    onPointerDown(event: React.PointerEvent<SVGGElement>) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ id, point: markers[id].point, moved: false, bounds });
    },
    onPointerMove(event: React.PointerEvent<SVGGElement>) {
      const point = drag?.id === id ? pointAt(event) : undefined;
      if (drag !== undefined && point !== undefined) {
        setDrag({ ...drag, point, moved: true });
      }
    },
    onPointerUp() {
      // a press without a move places nothing
      if (drag?.id === id && drag.moved) {
        onMove(id, drag.point);
      }
      setDrag(undefined);
    },
    onPointerCancel() {
      setDrag(undefined);
    },
  });

  const blocked = new Set(
    (survey?.gate.blocked ?? []).flatMap(({ device, peer }) => [device, peer])
  );
  const initiator =
    survey?.state === 'measuring' ? survey.initiator : undefined;

  /** A label in the corner its tier owns. */
  const label = (
    cx: number,
    cy: number,
    tier: number,
    color: string,
    text: string
  ) => {
    const { anchor, dx, dy } = TIER_LABELS[tier];
    return (
      <text
        x={cx + dx * radius}
        y={cy + dy * radius}
        textAnchor={anchor}
        fontSize={fontSize * 0.9}
        fill={color}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {text}
      </text>
    );
  };

  /** An arrow from the origin to `tip`, named at its head. */
  const arrow = (tip: NePoint, name: string, testId: string) => {
    // non-null: an arrow is drawn only with the axes
    const from = axes!.origin;
    const dx = x(tip.east) - x(from.east);
    const dy = y(tip.north) - y(from.north);
    const length = Math.hypot(dx, dy);
    if (length < radius) {
      // no room for it in the view
      return null;
    }
    const ux = dx / length;
    const uy = dy / length;
    const head = radius * 1.6;
    const tipX = x(tip.east);
    const tipY = y(tip.north);
    return (
      <g data-testid={testId}>
        <line
          x1={x(from.east)}
          y1={y(from.north)}
          x2={tipX - ux * head}
          y2={tipY - uy * head}
          stroke={axisColor}
          strokeWidth={unit * 0.003}
        />
        <polygon
          points={`${tipX},${tipY} ${tipX - ux * head - uy * head * 0.5},${
            tipY - uy * head + ux * head * 0.5
          } ${tipX - ux * head + uy * head * 0.5},${
            tipY - uy * head - ux * head * 0.5
          }`}
          fill={axisColor}
        />
        <text
          x={tipX + ux * radius * 2}
          y={tipY + uy * radius * 2 + fontSize * 0.35}
          textAnchor='middle'
          fontSize={fontSize}
          fontWeight='bold'
          fill={axisColor}
        >
          {name}
        </text>
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      data-testid='rtls-survey-plan'
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio='xMidYMid meet'
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
    >
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

      {/* the declared frame: X through the +x anchor, Y at a right angle */}
      {axes !== undefined && (
        <g data-testid='rtls-survey-axis'>
          {arrow(axes.xTip, t('rtlsSurvey.plan.x'), 'rtls-survey-axis-x')}
          {arrow(axes.yTip, t('rtlsSurvey.plan.y'), 'rtls-survey-axis-y')}
          <text
            x={x(axes.origin.east) - radius * 1.6}
            y={y(axes.origin.north) + radius * 3.4}
            textAnchor='end'
            fontSize={fontSize * 0.8}
            fill={axisColor}
          >
            {t('rtlsSurvey.plan.origin')}
          </text>
        </g>
      )}

      {/* the fit over the sketch: where each anchor was found */}
      {Object.entries(fitted).map(([id, point]) => {
        const marker = markers[id];
        const tier = tierOf(levelOf(id));
        const color = blocked.has(id)
          ? theme.palette.error.main
          : theme.palette.success.main;
        const moved = fit?.anchors[id]?.movedM;
        const cx = x(point.east);
        const cy = y(point.north);
        return (
          <g
            key={`fit${id}`}
            data-testid={`rtls-survey-fitted-${id}`}
            data-tier={tier}
            style={{ pointerEvents: 'none' }}
          >
            {marker !== undefined && (
              <line
                x1={x(marker.point.east)}
                y1={y(marker.point.north)}
                x2={cx}
                y2={cy}
                stroke={color}
                strokeWidth={unit * 0.003}
              />
            )}
            <polygon
              points={diamond(cx, cy, radius * tierRadius(tier) * 0.9)}
              fill={tier === 0 ? color : 'none'}
              stroke={color}
              strokeWidth={radius * 0.35}
            />
            {label(
              cx,
              cy,
              tier,
              color,
              moved === undefined
                ? nameOf(id)
                : t('rtlsSurvey.plan.moved', {
                    anchor: nameOf(id),
                    cm: centimetres(moved),
                  })
            )}
          </g>
        );
      })}

      {/* the sketch: one marker per online anchor, dragged to place it. The
       * lowest tier is drawn last, so that a dot under a ring can be taken */}
      {[...anchors]
        .sort((a, b) => levelOf(b.id) - levelOf(a.id))
        .map(({ id }) => {
          const { known, point } = markers[id];
          const out = sketch.excluded.includes(id);
          const tier = tierOf(levelOf(id));
          const color = out
            ? theme.palette.text.disabled
            : groupColor(levelOf(id));
          const cx = x(point.east);
          const cy = y(point.north);
          const size = radius * tierRadius(tier);
          // with the fit drawn, the fit names the anchor and the sketch
          // marker steps back
          const ghost = id in fitted;
          return (
            <g
              key={id}
              data-testid={`rtls-survey-anchor-${id}`}
              data-known={known}
              data-tier={tier}
              style={{ cursor: drag?.id === id ? 'grabbing' : 'grab' }}
              {...dragHandlers(id)}
            >
              {id === initiator && (
                <circle
                  data-testid='rtls-survey-initiator'
                  cx={cx}
                  cy={cy}
                  r={radius * 4.2}
                  fill='none'
                  stroke={theme.palette.warning.main}
                  strokeWidth={unit * 0.006}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {tier > 0 && (
                // a ring is thin to hit: this one, unseen, is taken with it
                <circle
                  cx={cx}
                  cy={cy}
                  r={size}
                  fill='none'
                  stroke='transparent'
                  strokeWidth={radius * 1.2}
                  pointerEvents='stroke'
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={size}
                fill={tier === 0 && known ? color : 'none'}
                opacity={ghost ? 0.4 : 1}
                stroke={color}
                strokeWidth={radius * (tier === 0 ? 0.3 : 0.5)}
                strokeDasharray={known ? undefined : `${radius * 0.6}`}
                pointerEvents={tier === 0 ? 'all' : 'stroke'}
              />
              {!ghost && label(cx, cy, tier, labelColor, nameOf(id))}
            </g>
          );
        })}
    </svg>
  );
};

export default SurveyPlan;
