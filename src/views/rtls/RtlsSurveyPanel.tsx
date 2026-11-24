/**
 * @file The "RTLS Survey" panel: the operator sketches where the anchors
 * stand, has the server range them against each other and fit their
 * positions, reads the fit and its commit gate, and commits it to the
 * anchors. The survey on screen is the server's state object
 * (X-RTLS-SURVEY); Control keeps only the sketch, per cell.
 */

import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { BackgroundHint } from '@skybrush/mui-components';

import { getRtlsAnchorLock } from '~/features/rtls/selectors';
import { openRtlsLockDialog } from '~/features/rtls/slice';
import {
  acknowledgeRtlsSurveyWarnings,
  setRtlsSurveySketch,
  surveyControls,
} from '~/features/rtls/survey';
import {
  cancelRtlsSurvey,
  commitRtlsSurvey,
  queryRtlsSurvey,
  refitRtlsSurvey,
  startRtlsSurvey,
  targetSignature,
} from '~/features/rtls/survey-actions';
import {
  areRtlsSurveyWarningsAcknowledged,
  getRtlsSurveyCells,
  getRtlsSurveyRefitGroup,
  getRtlsSurveyRefusalKey,
  getRtlsSurveySketch,
  getRtlsSurveyState,
} from '~/features/rtls/survey-selectors';
import {
  type RtlsSurveySketch,
  sketchHintKeys,
  sketchProblemKey,
  surveyGroup,
  surveyTarget,
  withAnchorMoved,
} from '~/features/rtls/survey-sketch';
import { isConnected } from '~/features/servers/selectors';
import { type AppDispatch, type RootState } from '~/store/reducers';

import { anchorNamer } from './survey/labels';
import SurveyAnchorList from './survey/SurveyAnchorList';
import SurveyCommit from './survey/SurveyCommit';
import SurveyGate from './survey/SurveyGate';
import SurveyPlan from './survey/SurveyPlan';
import SurveyResult from './survey/SurveyResult';
import SurveyRun from './survey/SurveyRun';

const RtlsSurveyPanel = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const connected = useSelector(isConnected);
  const cells = useSelector(getRtlsSurveyCells);
  const { survey, pending, outcome, available, fittedRequest } =
    useSelector(getRtlsSurveyState);
  const acknowledged = useSelector(areRtlsSurveyWarningsAcknowledged);
  const refusalKey = useSelector(getRtlsSurveyRefusalKey);
  const refitGroup = useSelector(getRtlsSurveyRefitGroup);
  const locked = useSelector(getRtlsAnchorLock)?.locked ?? false;

  const cellKeys = Object.keys(cells).sort();
  const [chosenCell, setChosenCell] = useState<string>();
  const cell =
    chosenCell !== undefined && cellKeys.includes(chosenCell)
      ? chosenCell
      : (cellKeys[0] ?? '');
  const anchors = useMemo(() => cells[cell] ?? [], [cells, cell]);
  const sketch = useSelector((state: RootState) =>
    getRtlsSurveySketch(state, cell)
  );

  // the survey the server holds, as the page opens and after a reconnect
  useEffect(() => {
    if (connected) {
      void dispatch(queryRtlsSurvey());
    }
  }, [connected, dispatch]);

  const nameOf = useMemo(() => anchorNamer(anchors, t), [anchors, t]);
  const group = surveyGroup(sketch, anchors);
  const refitTarget = surveyTarget(sketch, refitGroup);
  const controls = surveyControls({
    survey,
    pending,
    available,
    acknowledged,
    refusalKey,
    startProblemKey: sketchProblemKey(sketch, group),
    refitProblemKey: sketchProblemKey(sketch, refitGroup),
  });
  const sketchChanged =
    fittedRequest !== undefined &&
    refitTarget !== undefined &&
    targetSignature(refitTarget) !== fittedRequest;

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

  return (
    <Box
      data-testid='rtls-survey-panel'
      data-state={survey?.state}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignContent: 'flex-start',
        height: '100%',
        overflow: 'auto',
      }}
    >
      <Box
        sx={{
          flex: '1 1 360px',
          minWidth: 280,
          height: '100%',
          minHeight: 280,
          p: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <SurveyPlan
            anchors={anchors}
            sketch={sketch}
            survey={survey}
            nameOf={nameOf}
            onMove={(id, point) =>
              setSketch(withAnchorMoved(sketch, id, point))
            }
          />
        </Box>
        <Typography variant='caption' color='textSecondary'>
          {t('rtlsSurvey.plan.caption')}
        </Typography>
      </Box>

      <Box
        sx={{
          flex: '1 1 360px',
          minWidth: 300,
          maxHeight: '100%',
          overflow: 'auto',
          p: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
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
        <SurveyAnchorList
          anchors={anchors}
          sketch={sketch}
          onChange={setSketch}
        />
        <Divider />
        <SurveyRun
          survey={survey}
          controls={controls}
          outcome={outcome}
          hintKeys={sketchHintKeys(sketch, group)}
          sketchChanged={sketchChanged}
          nameOf={nameOf}
          onStart={() => void dispatch(startRtlsSurvey(cell))}
          onCancel={() => void dispatch(cancelRtlsSurvey())}
          onRefit={() => void dispatch(refitRtlsSurvey(cell))}
        />
        {survey !== undefined && (
          <>
            <SurveyResult survey={survey} nameOf={nameOf} />
            <SurveyGate
              gate={survey.gate}
              nameOf={nameOf}
              acknowledged={acknowledged}
              disabled={pending !== undefined}
              onAcknowledge={(value) =>
                dispatch(acknowledgeRtlsSurveyWarnings(value))
              }
            />
            <SurveyCommit
              survey={survey}
              controls={controls}
              locked={locked}
              nameOf={nameOf}
              onCommit={() => void dispatch(commitRtlsSurvey())}
              onLock={() => dispatch(openRtlsLockDialog())}
            />
          </>
        )}
      </Box>
    </Box>
  );
};

export default RtlsSurveyPanel;
