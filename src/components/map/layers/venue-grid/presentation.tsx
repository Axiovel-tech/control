import createColor from 'color';
import Collection from 'ol/Collection';
import OLFeature, { type FeatureLike } from 'ol/Feature';
import { LineString, Point } from 'ol/geom';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { useMemo } from 'react';

import { layer as olLayer, source } from '@collmot/ol-react';

import {
  type FlatEarthCoordinateSystem,
  mapViewCoordinateFromLonLat,
} from '~/utils/geography';

type VenueGridLayerProps = {
  /** Coordinate system that the grid is aligned with */
  coordinateSystem: FlatEarthCoordinateSystem;

  /** String that changes whenever the coordinate system does */
  coordinateSystemKey: string;

  /** Distance from the origin to the edge of the grid, in meters */
  halfExtent: number;

  /** Text colour of the current theme; the lines are tints of it */
  ink: string;

  /** Font family of the distance labels */
  labelFont?: string;

  zIndex?: number;
};

/** Distance between two major grid lines, in meters */
const MAJOR_STEP = 5;

/**
 * A grid line is only worth drawing while its neighbours are at least this
 * many pixels away.
 */
const MIN_LINE_SPACING_IN_PIXELS = 6;

/** Labels need more room than lines before they stop overlapping. */
const MIN_LABEL_SPACING_IN_PIXELS = 36;

type LineKind = 'minor' | 'major';

type Point2D = [number, number];

/**
 * Creates the features of the grid.
 *
 * The features deliberately carry no identifier: they are decoration, and
 * identified features are what the selection logic and the E2E map probe
 * treat as things the operator can act on.
 */
const createGridFeatures = (
  halfExtent: number,
  toMap: (point: Point2D) => number[]
): OLFeature[] => {
  const features: OLFeature[] = [];
  const limit = Math.floor(halfExtent);
  const line = (kind: LineKind, from: Point2D, to: Point2D) =>
    new OLFeature({ geometry: new LineString([toMap(from), toMap(to)]), kind });
  const label = (at: Point2D, text: string) =>
    new OLFeature({ geometry: new Point(toMap(at)), text });

  for (let offset = -limit; offset <= limit; offset++) {
    const isMajor = offset % MAJOR_STEP === 0;
    const kind: LineKind = isMajor ? 'major' : 'minor';

    features.push(
      line(kind, [offset, -limit], [offset, limit]),
      line(kind, [-limit, offset], [limit, offset])
    );

    if (isMajor && offset !== 0) {
      features.push(
        label([offset, 0], `${offset} m`),
        label([0, offset], `${offset} m`)
      );
    }
  }

  return features;
};

/**
 * Returns a style function that hides the lines and labels that would be too
 * dense at the current zoom level.
 *
 * @param metersPerMapUnit  ground distance covered by one unit of the map
 *        projection at the venue (Web Mercator stretches away from the equator)
 */
const createStyleFunction = (
  ink: string,
  labelFont: string,
  metersPerMapUnit: number
) => {
  const tint = (alpha: number) => createColor(ink).alpha(alpha).string();
  const styles: Record<LineKind, Style> = {
    minor: new Style({ stroke: new Stroke({ color: tint(0.09), width: 1 }) }),
    major: new Style({ stroke: new Stroke({ color: tint(0.24), width: 1 }) }),
  };
  const labelFill = new Fill({ color: tint(0.55) });
  const labelStyles = new Map<string, Style>();
  const labelStyleFor = (text: string): Style => {
    let style = labelStyles.get(text);

    if (!style) {
      style = new Style({
        text: new Text({
          fill: labelFill,
          font: `500 11px ${labelFont}`,
          offsetX: 4,
          offsetY: -3,
          text,
          textAlign: 'left',
          textBaseline: 'bottom',
        }),
      });
      labelStyles.set(text, style);
    }

    return style;
  };

  return (feature: FeatureLike, resolution: number): Style | undefined => {
    const pixelsPerMeter = 1 / (resolution * metersPerMapUnit);
    const text: unknown = feature.get('text');

    if (typeof text === 'string') {
      return pixelsPerMeter * MAJOR_STEP >= MIN_LABEL_SPACING_IN_PIXELS
        ? labelStyleFor(text)
        : undefined;
    }

    const kind: unknown = feature.get('kind');
    if (kind === 'major') {
      return pixelsPerMeter * MAJOR_STEP >= MIN_LINE_SPACING_IN_PIXELS
        ? styles.major
        : undefined;
    }

    return pixelsPerMeter >= MIN_LINE_SPACING_IN_PIXELS
      ? styles.minor
      : undefined;
  };
};

/**
 * Metric grid drawn in the flat Earth coordinate system of the show: thin
 * lines every meter, stronger ones every five meters, labelled along both
 * axes with the distance from the origin.
 */
export const VenueGridLayer = ({
  coordinateSystem,
  coordinateSystemKey,
  halfExtent,
  ink,
  labelFont = 'sans-serif',
  zIndex,
}: VenueGridLayerProps) => {
  const features = useMemo(
    () =>
      new Collection(
        createGridFeatures(halfExtent, (point) =>
          mapViewCoordinateFromLonLat(coordinateSystem.toLonLat(point))
        )
      ),
    [coordinateSystem, halfExtent]
  );
  const style = useMemo(() => {
    const [, latitude] = coordinateSystem.toLonLat([0, 0]);
    return createStyleFunction(
      ink,
      labelFont,
      Math.cos((latitude * Math.PI) / 180)
    );
  }, [coordinateSystem, ink, labelFont]);

  return (
    <olLayer.Vector
      updateWhileAnimating
      updateWhileInteracting
      style={style}
      zIndex={zIndex}
    >
      {/* The source takes its features at creation, hence the key */}
      <source.Vector
        key={`${coordinateSystemKey}/${halfExtent}`}
        features={features}
      />
    </olLayer.Vector>
  );
};
