/**
 * @file The two views of the survey page: the top view, in which the
 * operator places the anchors, and under it the side view of their heights.
 * Both show an anchor where the fit found it once there is one.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { type NePoint } from '~/features/rtls/pos-view-utils';
import {
  fromFrame,
  heldFitTransform,
  type RtlsSurveyRememberedFit,
} from '~/features/rtls/survey-frame';
import { type RtlsSurvey } from '~/features/rtls/survey-messages';
import {
  planMarkers,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
} from '~/features/rtls/survey-sketch';

import { type AnchorNamer } from './labels';
import SurveyElevation from './SurveyElevation';
import SurveyPlan from './SurveyPlan';

type SurveyViewsProps = {
  /** The online anchors of the cell. */
  anchors: RtlsSurveyAnchor[];
  sketch: RtlsSurveySketch;
  survey?: RtlsSurvey;
  /** The anchors the held survey measured, online or not. */
  measured: RtlsSurveyAnchor[];
  /** The request this client last had accepted, for where its fit is drawn. */
  fittedRequest?: RtlsSurveyRememberedFit;
  nameOf: AnchorNamer;
  /** The panel is narrow: the views take a fixed share of it and are drawn larger. */
  narrow: boolean;
  onMove: (id: string, point: NePoint) => void;
};

const SurveyViews = ({
  anchors,
  sketch,
  survey,
  measured,
  fittedRequest,
  nameOf,
  narrow,
  onMove,
}: SurveyViewsProps) => {
  const { t } = useTranslation();
  const fitTransformOf = (drawn: RtlsSurveySketch) =>
    heldFitTransform({
      sketch: drawn,
      group: measured,
      echo: survey?.basis,
      remembered: fittedRequest,
      committed: survey?.state === 'committed',
    });

  // the side view: each anchor where the top view has it, with its height
  // when one is known: the fit's, else the stored one of an anchor that is
  // shown where it stores itself
  const fit = survey?.fit;
  const transform = fitTransformOf(sketch);
  const found = Object.fromEntries(
    Object.entries(fit?.anchors ?? {}).map(([id, anchor]) => [
      id,
      fromFrame(transform, anchor),
    ])
  );
  const markers = planMarkers(sketch, anchors, found);
  const elevation = anchors
    .filter(({ id }) => !sketch.excluded.includes(id))
    .map(({ id, storedDown }) => {
      const fitted = fit?.anchors[id];
      const storedHeight =
        id in sketch.positions || storedDown === undefined
          ? undefined
          : -storedDown;
      return {
        id,
        point: found[id] ?? markers[id].point,
        heightM: fitted === undefined ? storedHeight : -fitted.z,
      };
    });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        p: 1,
        ...(narrow
          ? { flex: 'none' }
          : { flex: '1 1 50%', minWidth: 0, minHeight: 0 }),
      }}
    >
      <Box
        sx={
          narrow
            ? { height: 'min(62vw, 36vh)', minHeight: 200, flex: 'none' }
            : { flex: 1, minHeight: 0 }
        }
      >
        <SurveyPlan
          anchors={anchors}
          sketch={sketch}
          survey={survey}
          nameOf={nameOf}
          fitTransformOf={fitTransformOf}
          dense={narrow}
          onMove={onMove}
        />
      </Box>
      <Typography variant='caption' color='textSecondary'>
        {t('rtlsSurvey.plan.caption')}
      </Typography>
      <SurveyElevation entries={elevation} sketch={sketch} nameOf={nameOf} />
      <Typography variant='caption' color='textSecondary'>
        {t('rtlsSurvey.elevation.caption')}
      </Typography>
    </Box>
  );
};

export default SurveyViews;
