/**
 * @file The top-down plan of the survey page: every online anchor of the cell
 * as a marker the operator drags to where it roughly stands, the declared
 * frame (origin and +x), the anchor that initiates the running step, and the
 * fitted positions drawn over the sketch.
 *
 * North is up and east right, in metres, like the positions view. The fit
 * arrives in the declared frame and is drawn with the turn and shift it was
 * calculated under, so it lands on the drawing it was made from and stays
 * there while the operator edits the sketch.
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
  planMarkers,
  roundCm,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  withAnchorMoved,
} from '~/features/rtls/survey-sketch';

import { type AnchorNamer, centimetres } from './labels';

type SurveyPlanProps = {
  anchors: RtlsSurveyAnchor[];
  sketch: RtlsSurveySketch;
  survey?: RtlsSurvey;
  nameOf: AnchorNamer;
  /** How the held fit is drawn on the given sketch (`heldFitTransform`). */
  fitTransformOf: (sketch: RtlsSurveySketch) => FrameTransform;
  onMove: (id: string, point: NePoint) => void;
};

/** Marker colours per height group, lowest first; later groups reuse the last. */
const GROUP_COLORS = ['#2196f3', '#9c27b0', '#00bcd4', '#795548'];

const SurveyPlan = ({
  anchors,
  sketch,
  survey,
  nameOf,
  fitTransformOf,
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
  const markers = planMarkers(drawn, anchors);
  const transform = fitTransformOf(drawn);
  const fit = survey?.fit;
  const fitted = Object.fromEntries(
    Object.entries(fit?.anchors ?? {}).map(([id, anchor]) => [
      id,
      fromFrame(transform, anchor),
    ])
  );
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
  const fontSize = unit * 0.03;
  const radius = unit * 0.016;
  const x = (east: number): number => east - bounds.minEast;
  const y = (north: number): number => bounds.maxNorth - north;
  const step = getGridStep(unit);
  const gridColor = theme.palette.divider;
  const labelColor = theme.palette.text.secondary;

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

  const origin =
    sketch.origin === undefined ? undefined : markers[sketch.origin];
  const xAxis = sketch.xAxis === undefined ? undefined : markers[sketch.xAxis];
  const blocked = new Set(
    (survey?.gate.blocked ?? []).flatMap(({ device, peer }) => [device, peer])
  );
  const initiator =
    survey?.state === 'measuring' ? survey.initiator : undefined;

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

      {/* the declared frame: from the origin anchor towards the +x anchor */}
      {origin !== undefined && xAxis !== undefined && (
        <g data-testid='rtls-survey-axis'>
          <line
            x1={x(origin.point.east)}
            y1={y(origin.point.north)}
            x2={x(xAxis.point.east)}
            y2={y(xAxis.point.north)}
            stroke={theme.palette.primary.main}
            strokeWidth={unit * 0.004}
            strokeDasharray={`${unit * 0.015} ${unit * 0.01}`}
          />
          <text
            x={x((origin.point.east + xAxis.point.east) / 2) + fontSize * 0.4}
            y={y((origin.point.north + xAxis.point.north) / 2)}
            fontSize={fontSize * 0.9}
            fill={theme.palette.primary.main}
          >
            {t('rtlsSurvey.plan.xAxis')}
          </text>
        </g>
      )}

      {/* the fit over the sketch: where each anchor was found */}
      {Object.entries(fitted).map(([id, point]) => {
        const marker = markers[id];
        const color = blocked.has(id)
          ? theme.palette.error.main
          : theme.palette.success.main;
        const moved = fit?.anchors[id]?.movedM;
        const size = radius * 1.6;
        return (
          <g key={`fit${id}`} data-testid={`rtls-survey-fitted-${id}`}>
            {marker !== undefined && (
              <line
                x1={x(marker.point.east)}
                y1={y(marker.point.north)}
                x2={x(point.east)}
                y2={y(point.north)}
                stroke={color}
                strokeWidth={unit * 0.003}
              />
            )}
            <rect
              x={x(point.east) - size / 2}
              y={y(point.north) - size / 2}
              width={size}
              height={size}
              fill={color}
              transform={`rotate(45 ${x(point.east)} ${y(point.north)})`}
            />
            <text
              x={x(point.east) + size}
              y={y(point.north) + size * 1.4}
              fontSize={fontSize * 0.8}
              fill={color}
            >
              {moved === undefined
                ? nameOf(id)
                : t('rtlsSurvey.plan.moved', {
                    anchor: nameOf(id),
                    cm: centimetres(moved),
                  })}
            </text>
          </g>
        );
      })}

      {/* the sketch: one marker per online anchor, dragged to place it */}
      {anchors.map(({ id }) => {
        const { known, point } = markers[id];
        const out = sketch.excluded.includes(id);
        const color = out
          ? theme.palette.text.disabled
          : GROUP_COLORS[
              Math.min(sketch.groupOf[id] ?? 0, GROUP_COLORS.length - 1)
            ];
        const cx = x(point.east);
        const cy = y(point.north);
        return (
          <g
            key={id}
            data-testid={`rtls-survey-anchor-${id}`}
            data-known={known}
            style={{ cursor: drag?.id === id ? 'grabbing' : 'grab' }}
            {...dragHandlers(id)}
          >
            {id === initiator && (
              <circle
                data-testid='rtls-survey-initiator'
                cx={cx}
                cy={cy}
                r={radius * 2.2}
                fill='none'
                stroke={theme.palette.warning.main}
                strokeWidth={unit * 0.006}
              />
            )}
            {id === sketch.origin && (
              <circle
                cx={cx}
                cy={cy}
                r={radius * 1.6}
                fill='none'
                stroke={theme.palette.primary.main}
                strokeWidth={unit * 0.004}
              />
            )}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill={known ? color : 'transparent'}
              fillOpacity={fit === undefined ? 1 : 0.45}
              stroke={color}
              strokeWidth={unit * 0.004}
              strokeDasharray={known ? undefined : `${unit * 0.008}`}
            />
            <text
              x={cx + radius * 1.6}
              y={cy - radius * 1.2}
              fontSize={fontSize}
              fill={labelColor}
              style={{ userSelect: 'none' }}
            >
              {nameOf(id)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default SurveyPlan;
