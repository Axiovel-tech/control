import { RegularShape, Style, Text } from 'ol/style';
import React from 'react';

import { Feature, geom, layer, source } from '@collmot/ol-react';

import type { RtlsAnchor } from '~/features/rtls/types';
import { anchorIdToGlobalId } from '~/model/identifiers';
import { mapViewCoordinateFromLonLat } from '~/utils/geography';
import { fill, shadowVeryThinOutline } from '~/utils/styles';

// === Helper functions ===

// Anchors are fixed infrastructure: a distinct diamond marker (rotated square)
// sets them apart from drones/tags and beacons.
const createAnchorStyle = (label: string): Style[] => [
  new Style({
    image: new RegularShape({
      points: 4,
      radius: 7,
      angle: Math.PI / 4,
      fill: fill([0, 150, 136]),
      stroke: shadowVeryThinOutline,
    }),
  }),
  new Style({
    text: new Text({
      font: '12px sans-serif',
      offsetY: 16,
      placement: 'point',
      text: label,
      textAlign: 'center',
    }),
  }),
];

// === A single feature representing an RTLS anchor ===

type AnchorFeatureProps = {
  value: RtlsAnchor;
};

const AnchorFeature = React.memo(function AnchorFeature({
  value,
}: AnchorFeatureProps) {
  const { index, lat, lon } = value;
  return (
    <Feature
      id={anchorIdToGlobalId(String(index))}
      style={createAnchorStyle(`A${index}`)}
    >
      <geom.Point coordinates={mapViewCoordinateFromLonLat([lon, lat])} />
    </Feature>
  );
});

// === Anchors layer ===

type AnchorsLayerProps = {
  anchors: RtlsAnchor[];
  zIndex?: number;
};

export const AnchorsLayer = ({ anchors, zIndex }: AnchorsLayerProps) => (
  <layer.Vector updateWhileAnimating updateWhileInteracting zIndex={zIndex}>
    <source.Vector>
      {anchors.map((anchor) => (
        <AnchorFeature key={anchor.index} value={anchor} />
      ))}
    </source.Vector>
  </layer.Vector>
);
