/**
 * @file The side view of the survey page, under the top view: the heights
 * the anchors stand at as rows, highest on top, and each anchor where it is
 * across the plan, seen from the plan's bottom edge. It shows what a top
 * view cannot: which anchors stand above which. Before a fit only the order
 * of the height groups is known and they are drawn as steps; with heights in
 * metres (a fit, or what the anchors store) they are drawn to scale.
 */

import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';

import { type NePoint } from '~/features/rtls/pos-view-utils';
import {
  type ElevationEntry,
  type ElevationRow,
  surveyElevation,
} from '~/features/rtls/survey-plan';
import { type RtlsSurveySketch } from '~/features/rtls/survey-sketch';

import { type AnchorNamer, groupColor, groupNames, metres } from './labels';

type SurveyElevationProps = {
  /** The anchors drawn, with their height above the origin's group if known. */
  entries: Array<{ id: string; point: NePoint; heightM?: number }>;
  sketch: RtlsSurveySketch;
  nameOf: AnchorNamer;
};

const SurveyElevation = ({ entries, sketch, nameOf }: SurveyElevationProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  if (entries.length === 0) {
    return null;
  }

  const easts = entries.map(({ point }) => point.east);
  const margin = 1.5;
  const span = Math.max(Math.max(...easts) - Math.min(...easts), 3);
  const centre = (Math.max(...easts) + Math.min(...easts)) / 2;
  // room at the left for the row names
  const gutter = span * 0.26;
  const width = span + 2 * margin + gutter;
  const minEast = centre - span / 2 - margin;
  const x = (east: number): number => gutter + east - minEast;
  const radius = width * 0.009;
  const fontSize = width * 0.022;

  const { marks, metric, rows } = surveyElevation(
    entries.map(
      ({ id, point, heightM }): ElevationEntry => ({
        id,
        east: point.east,
        level: sketch.groupOf[id] ?? 0,
        heightM,
      })
    ),
    radius * 3
  );
  const names = groupNames(sketch, t);
  const nameOfLevel = (level: number): string =>
    names[Math.min(level, names.length - 1)];

  // a strip just tall enough for its rows, each with its labels above it
  const top = fontSize * 2.4;
  const pitch = fontSize * 3;
  const height = top + pitch * (rows.length - 1) + fontSize * 0.9;
  const bottom = top + pitch * (rows.length - 1);
  const heights = rows.map(({ heightM }) => heightM ?? 0);
  const low = Math.min(...heights);
  const reach = Math.max(...heights) - low;
  // to scale between the lowest and the highest row, but never closer than
  // the labels need
  const rowY = (index: number): number => {
    if (rows.length === 1) {
      return bottom;
    }
    const even = index / (rows.length - 1);
    const scaled = metric && reach > 0 ? (heights[index] - low) / reach : even;
    const share = Math.min(
      Math.max(scaled, even - 0.5 / rows.length),
      even + 0.5 / rows.length
    );
    return bottom - share * (bottom - top);
  };
  const colorOf = ({ level }: ElevationRow): string =>
    level === undefined ? theme.palette.text.secondary : groupColor(level);
  const labelOf = ({ heightM, level }: ElevationRow): string =>
    level === undefined
      ? t('rtlsSurvey.elevation.height', { height: metres(heightM) })
      : heightM === undefined
        ? nameOfLevel(level)
        : t('rtlsSurvey.elevation.group', {
            group: nameOfLevel(level),
            height: metres(heightM),
          });

  return (
    <svg
      data-testid='rtls-survey-elevation'
      data-metric={metric}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio='xMidYMid meet'
      style={{ width: '100%', display: 'block', flex: 'none' }}
    >
      {rows.map((row, index) => (
        <g key={index} data-testid={`rtls-survey-elevation-row-${index}`}>
          <line
            x1={gutter * 0.95}
            y1={rowY(index)}
            x2={width}
            y2={rowY(index)}
            stroke={theme.palette.divider}
            strokeWidth={width * 0.0015}
            strokeDasharray={`${width * 0.008} ${width * 0.006}`}
          />
          <text
            x={gutter * 0.9}
            y={rowY(index) + fontSize * 0.35}
            textAnchor='end'
            fontSize={fontSize}
            fill={colorOf(row)}
          >
            {labelOf(row)}
          </text>
        </g>
      ))}
      {marks.map(({ east, ids, row }) => (
        <g key={ids.join('-')} data-testid={`rtls-survey-elevation-${ids[0]}`}>
          <circle
            cx={x(east)}
            cy={rowY(row)}
            r={radius}
            fill={colorOf(rows[row])}
          />
          <text
            x={x(east)}
            y={rowY(row) - radius * 1.8}
            textAnchor='middle'
            fontSize={fontSize}
            fill={theme.palette.text.secondary}
          >
            {ids.map(nameOf).join(', ')}
          </text>
        </g>
      ))}
    </svg>
  );
};

export default SurveyElevation;
