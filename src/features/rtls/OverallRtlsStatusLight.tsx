import { useSelector } from 'react-redux';

import { Status } from '@skybrush/app-theme-mui';
import {
  LabeledStatusLight,
  type LabeledStatusLightProps,
} from '@skybrush/mui-components';

import { getStatusForHealth } from './health-status';
import { getOverallRtlsHealth } from './selectors';
import { RtlsHealth } from './stats-utils';

const HEALTH_LABELS: Record<RtlsHealth, string> = {
  [RtlsHealth.OK]: 'RTLS healthy',
  [RtlsHealth.WARNING]: 'RTLS degraded',
  [RtlsHealth.ERROR]: 'RTLS fix lost',
  [RtlsHealth.UNKNOWN]: 'No RTLS data',
};

type Props = Omit<LabeledStatusLightProps, 'children' | 'status'>;

/**
 * A single status light summarising the overall health of all RTLS devices.
 */
const OverallRtlsStatusLight = (props: Props) => {
  const health = useSelector(getOverallRtlsHealth);

  return (
    <LabeledStatusLight
      status={getStatusForHealth(health) ?? Status.OFF}
      {...props}
    >
      {HEALTH_LABELS[health]}
    </LabeledStatusLight>
  );
};

export default OverallRtlsStatusLight;
