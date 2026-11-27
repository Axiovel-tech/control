import { useTheme } from '@mui/material/styles';
import { useSelector } from 'react-redux';

import { schemes } from '~/design/tokens';
import type { Layer } from '~/model/layers';
import { getFlatEarthCoordinateTransformer } from '~/selectors/map';
import type { RootState } from '~/store/reducers';

import { VenueGridLayer as VenueGridLayerPresentation } from './presentation';

type VenueGridLayerProps = {
  layer: Layer;
  zIndex?: number;
};

const DEFAULT_HALF_EXTENT = 30; /* meters */

/**
 * Metric grid of the venue, aligned with the show coordinate system.
 */
export const VenueGridLayer = ({ layer, zIndex }: VenueGridLayerProps) => {
  const coordinateSystem = useSelector(getFlatEarthCoordinateTransformer);
  const origin = useSelector((state: RootState) => state.map.origin);
  const theme = useTheme();
  const { halfExtent } = layer.parameters;

  if (!coordinateSystem) {
    return null;
  }

  return (
    <VenueGridLayerPresentation
      coordinateSystem={coordinateSystem}
      coordinateSystemKey={`${origin.position?.join(',')}/${origin.angle}/${origin.type}`}
      halfExtent={
        typeof halfExtent === 'number' && halfExtent > 0
          ? halfExtent
          : DEFAULT_HALF_EXTENT
      }
      ink={schemes[theme.palette.mode].ink}
      labelFont={theme.typography.fontFamily}
      zIndex={zIndex}
    />
  );
};
