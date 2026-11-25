/**
 * @file The "RTLS Survey" panel: the operator sketches where the anchors
 * stand, has the server range them against each other and fit their
 * positions, reads the fit and its commit gate, and commits it to the
 * anchors. The survey on screen is the server's state object
 * (X-RTLS-SURVEY); Control keeps only the sketch, per cell.
 *
 * The run, the fit's summary, the gate and the commit stay at the top of the
 * panel at any size: what the operator presses and what answers it are never
 * under a table. Below them the views and the anchor list sit side by side,
 * or one above the other in a panel too narrow for both.
 */

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { BackgroundHint } from '@skybrush/mui-components';

import { getRtlsAnchorLock } from '~/features/rtls/selectors';
import { openRtlsLockDialog } from '~/features/rtls/slice';
import {
  acknowledgeRtlsSurveyWarnings,
  setRtlsSurveySketch,
  statusQueryDelayMs,
  warningsSignature,
} from '~/features/rtls/survey';
import {
  cancelRtlsSurvey,
  commitRtlsSurvey,
  queryRtlsSurvey,
  refitRtlsSurvey,
  startRtlsSurvey,
} from '~/features/rtls/survey-actions';
import {
  getRtlsSurveyCells,
  getRtlsSurveyPage,
  getRtlsSurveyState,
} from '~/features/rtls/survey-selectors';
import {
  type RtlsSurveySketch,
  withAnchorMoved,
} from '~/features/rtls/survey-sketch';
import { isConnected } from '~/features/servers/selectors';
import { type AppDispatch, type RootState } from '~/store/reducers';

import { anchorNamer } from './survey/labels';
import SurveyAnchorList from './survey/SurveyAnchorList';
import SurveyCommit from './survey/SurveyCommit';
import SurveyGate from './survey/SurveyGate';
import SurveyResult from './survey/SurveyResult';
import SurveyRun from './survey/SurveyRun';
import SurveyStored from './survey/SurveyStored';
import SurveyViews from './survey/SurveyViews';

/**
 * The panel width under which the views and the list no longer fit side by
 * side, px: about what the workbench gives a panel opened from the sidebar.
 */
const NARROW_PANEL_PX = 820;

/** Whether an element is narrower than `limit`; `false` until it is measured. */
const useNarrow = (limit: number) => {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) => {
      setNarrow(entry.contentRect.width < limit);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [limit]);
  return { ref, narrow };
};

const RtlsSurveyPanel = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const connected = useSelector(isConnected);
  const cells = useSelector(getRtlsSurveyCells);
  const { fittedRequest, outcome, pending, statusFailures } =
    useSelector(getRtlsSurveyState);
  const locked = useSelector(getRtlsAnchorLock)?.locked ?? false;
  const { ref, narrow } = useNarrow(NARROW_PANEL_PX);

  const cellKeys = Object.keys(cells).sort();
  const [chosenCell, setChosenCell] = useState<string>();
  const cell =
    chosenCell !== undefined && cellKeys.includes(chosenCell)
      ? chosenCell
      : (cellKeys[0] ?? '');
  const page = useSelector((state: RootState) =>
    getRtlsSurveyPage(state, cell)
  );
  const { anchors, controls, measured, sketch, survey } = page;

  // the survey the server holds: as the page opens, after a reconnect, and
  // again after a status request that got no answer
  useEffect(() => {
    if (!connected) {
      return undefined;
    }
    const timer = setTimeout(
      () => void dispatch(queryRtlsSurvey()),
      statusQueryDelayMs(statusFailures)
    );
    return () => {
      clearTimeout(timer);
    };
  }, [connected, dispatch, statusFailures]);

  const nameOf = useMemo(
    () => anchorNamer([...anchors, ...measured], t),
    [anchors, measured, t]
  );

  const setSketch = (next: RtlsSurveySketch) =>
    dispatch(setRtlsSurveySketch({ cell, sketch: next }));

  if (anchors.length === 0) {
    return (
      <BackgroundHint
        header={t('rtlsSurvey.noAnchors.header')}
        text={t('rtlsSurvey.noAnchors.text')}
      />
    );
  }

  const details = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 1,
        ...(narrow
          ? { flex: 'none' }
          : { flex: '1 1 50%', minWidth: 0, overflow: 'auto' }),
      }}
    >
      <SurveyAnchorList
        anchors={anchors}
        sketch={sketch}
        leftOut={page.leftOut}
        restored={page.sketchRestored}
        groupFixed={page.groupFixed}
        onChange={setSketch}
      />
      <Divider />
      {survey?.fit === undefined ? (
        <SurveyStored anchors={page.stored} nameOf={nameOf} />
      ) : (
        <SurveyResult
          // a new fit decides anew whether its pair table opens
          key={`${survey.fit.rmsM}-${survey.fit.worstM}`}
          survey={survey}
          nameOf={nameOf}
        />
      )}
    </Box>
  );

  return (
    <Box
      ref={ref}
      data-testid='rtls-survey-panel'
      data-state={survey?.state}
      data-layout={narrow ? 'narrow' : 'wide'}
      sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <Box
        data-testid='rtls-survey-header'
        sx={{
          flex: 'none',
          maxHeight: '60%',
          overflow: 'auto',
          p: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {cellKeys.length > 1 && (
          <TextField
            select
            size='small'
            label={t('rtlsSurvey.cell')}
            value={cell}
            onChange={(event) => setChosenCell(event.target.value)}
          >
            {cellKeys.map((key) => (
              <MenuItem key={key} value={key}>
                {key}
              </MenuItem>
            ))}
          </TextField>
        )}
        {page.heldElsewhere && (
          <Alert severity='info' data-testid='rtls-survey-elsewhere'>
            {t('rtlsSurvey.heldElsewhere')}
          </Alert>
        )}
        <SurveyRun
          survey={survey}
          controls={controls}
          outcome={outcome}
          leftOut={page.leftOut}
          hintKeys={page.hintKeys}
          sketchChanged={page.sketchChanged}
          nameOf={nameOf}
          onStart={() => void dispatch(startRtlsSurvey(cell))}
          onCancel={() => void dispatch(cancelRtlsSurvey(cell))}
          onRefit={() => void dispatch(refitRtlsSurvey(cell))}
        />
        {survey !== undefined && (
          <>
            <SurveyGate
              survey={survey}
              nameOf={nameOf}
              acknowledged={page.acknowledged}
              disabled={pending !== undefined}
              onAcknowledge={(value) =>
                dispatch(
                  acknowledgeRtlsSurveyWarnings(
                    value ? warningsSignature(survey) : undefined
                  )
                )
              }
            />
            <SurveyCommit
              survey={survey}
              controls={controls}
              offline={page.offline}
              locked={locked}
              nameOf={nameOf}
              onCommit={() => void dispatch(commitRtlsSurvey(cell))}
              onLock={() => dispatch(openRtlsLockDialog())}
            />
          </>
        )}
      </Box>
      <Box
        data-testid='rtls-survey-body'
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          ...(narrow
            ? { flexDirection: 'column', overflow: 'auto' }
            : { flexDirection: 'row' }),
        }}
      >
        <SurveyViews
          anchors={anchors}
          sketch={sketch}
          survey={survey}
          measured={measured}
          fittedRequest={fittedRequest}
          nameOf={nameOf}
          narrow={narrow}
          onMove={(id, point) => setSketch(withAnchorMoved(sketch, id, point))}
        />
        {details}
      </Box>
    </Box>
  );
};

export default RtlsSurveyPanel;
