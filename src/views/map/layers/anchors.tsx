import { connect } from 'react-redux';

import { AnchorsLayer as AnchorsLayerPresentation } from '~/components/map/layers/anchors';
import { getRtlsAnchors } from '~/features/rtls/selectors';
import type { RootState } from '~/store/reducers';

export const AnchorsLayer = connect(
  // mapStateToProps
  (state: RootState) => ({
    anchors: getRtlsAnchors(state),
  }),
  // mapDispatchToProps
  null
)(AnchorsLayerPresentation);
