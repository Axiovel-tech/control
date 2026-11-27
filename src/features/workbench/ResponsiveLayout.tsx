import useMediaQuery from '@mui/material/useMediaQuery';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';

import { layout } from '~/design/tokens';
import { setSidebarOpen } from '~/features/sidebar/slice';
import { useAppDispatch } from '~/store/hooks';
import type { RootState } from '~/store/reducers';
import workbench, { buildWorkbenchLayout } from '~/workbench';

import {
  enterCompactLayout,
  leaveCompactLayout,
  type WorkbenchLayoutMode,
} from './slice';

const COMPACT_QUERY = `(max-width: ${layout.compactBreakpoint - 1}px)`;

/**
 * Keeps the workbench usable on a narrow window.
 *
 * Panels side by side stop working well below a certain width, so the
 * workbench then switches to a single stack of tabs. The arrangement the user
 * had before is set aside in the store and comes back untouched as soon as
 * the window is wide enough again, also across restarts.
 */
const ResponsiveLayout = () => {
  const dispatch = useAppDispatch();
  const isNarrow = useMediaQuery(COMPACT_QUERY, { noSsr: true });
  const mode = useSelector((state: RootState) => state.workbench.layoutMode);
  const regularState = useSelector(
    (state: RootState) => state.workbench.regularState
  );
  const savedState = useSelector((state: RootState) => state.workbench.state);

  useEffect(() => {
    const wanted: WorkbenchLayoutMode = isNarrow ? 'compact' : 'regular';
    if (wanted === mode) {
      return;
    }

    if (wanted === 'compact') {
      dispatch(
        enterCompactLayout(
          workbench.isRendered ? workbench.getState() : savedState
        )
      );
      // The rail floats over the panels in compact mode; start with it closed
      dispatch(setSidebarOpen(false));
      workbench.restoreState(buildWorkbenchLayout('compact'));
    } else {
      workbench.restoreState(regularState ?? buildWorkbenchLayout('default'));
      dispatch(leaveCompactLayout());
    }
    // `regularState` and `savedState` are read at the moment of the switch
    // only; they must not trigger one
  }, [dispatch, isNarrow, mode]);

  return null;
};

export default ResponsiveLayout;
