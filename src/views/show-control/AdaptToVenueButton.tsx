import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { connect } from 'react-redux';

import { StatusLight, Tooltip } from '@skybrush/mui-components';

import PrerequisiteList from '~/components/PrerequisiteList';
import { Status } from '~/components/semantics';
import { estimateShowCoordinateSystemFromActiveUAVs } from '~/features/auto-fit/actions';
import { canEstimateShowCoordinateSystemFromActiveUAVs } from '~/features/auto-fit/selectors';
import {
  hasLoadedShowFile,
  isEstimatingShowCoordinateSystem,
  isShowOutdoor,
} from '~/features/show/selectors';
import { getSetupStageStatuses } from '~/features/show/stages';
import { getActiveUAVIds } from '~/features/uavs/selectors';
import {
  useConstPrerequisites,
  type Prerequisite,
} from '~/hooks/useConstPrerequisites';
import { tt } from '~/i18n';
import type { RootState } from '~/store/reducers';
import { type Nullable } from '~/utils/types';

const PREREQUISITES: readonly Prerequisite[] = Object.freeze([
  {
    selector: hasLoadedShowFile,
    message: tt('show.adaptToVenue.prerequisites.loaded'),
  },
  {
    selector: isShowOutdoor,
    message: tt('show.adaptToVenue.prerequisites.outdoor'),
  },
  {
    selector: (state: RootState) => getActiveUAVIds(state).length > 0,
    message: tt('show.adaptToVenue.prerequisites.drones'),
  },
]);

type Props = Readonly<{
  canEstimate: boolean;
  estimating: boolean;
  onAdaptToVenue: () => void;
  status: Status;
}>;

/**
 * Button that fits the show coordinate system (origin and orientation) to the
 * current positions of the connected drones with a single click.
 */
const AdaptToVenueButton = (props: Props) => {
  const { canEstimate, estimating, onAdaptToVenue, status } = props;

  const { t } = useTranslation();

  // NOTE: Using a `ref` here broke when rearranging the GoldenLayout panels
  //       in `ShowConfiguratorButton`, hence the state-based trigger target.
  const [tooltipTriggerTarget, setTooltipTriggerTarget] =
    useState<Nullable<HTMLElement>>();

  const { prerequisites, prerequisitesFulfilled } =
    useConstPrerequisites(PREREQUISITES);

  const disabled = !canEstimate || !prerequisitesFulfilled || estimating;
  const tooltipVisible = !prerequisitesFulfilled;

  return (
    <ListItem disablePadding ref={setTooltipTriggerTarget}>
      <ListItemButton disabled={disabled} onClick={onAdaptToVenue}>
        <StatusLight
          status={estimating ? Status.WAITING : disabled ? Status.OFF : status}
        />
        <ListItemText
          primary={
            <Tooltip
              content={<PrerequisiteList prerequisites={prerequisites} />}
              disabled={!tooltipVisible}
              maxWidth={500}
              placement='left'
              triggerTarget={tooltipTriggerTarget}
            >
              <span>{t('show.adaptToVenue.button')}</span>
            </Tooltip>
          }
          secondary={
            estimating
              ? t('show.adaptToVenue.inProgress')
              : t('show.adaptToVenue.description')
          }
        />
      </ListItemButton>
    </ListItem>
  );
};

const ConnectedAdaptToVenueButton = connect(
  // mapStateToProps
  (state: RootState) => ({
    canEstimate: canEstimateShowCoordinateSystemFromActiveUAVs(state),
    estimating: isEstimatingShowCoordinateSystem(state),
    status: getSetupStageStatuses(state).adaptToVenue,
  }),
  // mapDispatchToProps
  {
    onAdaptToVenue: estimateShowCoordinateSystemFromActiveUAVs,
  }
)(AdaptToVenueButton);

export default ConnectedAdaptToVenueButton;
