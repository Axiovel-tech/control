import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';

import { Status } from '@skybrush/app-theme-mui';
import {
  LabeledStatusLight,
  type LabeledStatusLightProps,
} from '@skybrush/mui-components';

import { getStatusForHealth } from './health-status';
import {
  getOverallRtlsHealth,
  getRtlsAnchorHealth,
  getRtlsTagHealth,
} from './selectors';
import { RtlsHealth } from './stats-utils';

const HEALTH_KEYS: Record<RtlsHealth, string> = {
  [RtlsHealth.OK]: 'ok',
  [RtlsHealth.WARNING]: 'warning',
  [RtlsHealth.ERROR]: 'error',
  [RtlsHealth.UNKNOWN]: 'unknown',
};

type Props = Omit<LabeledStatusLightProps, 'children' | 'status'> & {
  scope?: 'all' | 'anchors' | 'tags';
};

/**
 * A status light for all devices or one role. The global error label remains
 * neutral because the worst signal may be either anchor liveness or a tag fix.
 */
const OverallRtlsStatusLight = ({ scope = 'all', ...props }: Props) => {
  const { t } = useTranslation();
  const selector =
    scope === 'anchors'
      ? getRtlsAnchorHealth
      : scope === 'tags'
        ? getRtlsTagHealth
        : getOverallRtlsHealth;
  const health = useSelector(selector);

  return (
    <LabeledStatusLight
      status={getStatusForHealth(health) ?? Status.OFF}
      {...props}
    >
      {t(`rtlsHealth.${scope}.${HEALTH_KEYS[health]}`)}
    </LabeledStatusLight>
  );
};

export default OverallRtlsStatusLight;
