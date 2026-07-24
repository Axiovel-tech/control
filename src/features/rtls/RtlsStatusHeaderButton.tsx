/**
 * @file Header button surfacing the overall RTLS system health: a radar icon
 * with a badge colored by the worst device health, and a hover mini-list with
 * the per-role summary. The RTLS saga keeps `state.rtls` fresh whenever the
 * server is connected, so this works with no RTLS panel open.
 */

import Radar from '@mui/icons-material/Radar';
import { useSelector } from 'react-redux';

import { colorForStatus } from '@skybrush/app-theme-mui';
import {
  GenericHeaderButton,
  LazyTooltip,
  SidebarBadge,
} from '@skybrush/mui-components';

import { Status } from '~/components/semantics';
import { isConnected } from '~/features/servers/selectors';

import { getStatusForHealth } from './health-status';
import RtlsStatusMiniList from './RtlsStatusMiniList';
import { getOverallRtlsHealth } from './selectors';

const BADGE_OFFSET = [24, 8];

const RtlsStatusHeaderButton = () => {
  const connected = useSelector(isConnected);
  const health = useSelector(getOverallRtlsHealth);
  const status = getStatusForHealth(health);
  // No badge while there is nothing to say: disconnected, or no RTLS data at
  // all (deployments without the RTLS extension keep a quiet header).
  const badgeColor =
    connected && status !== undefined && status !== Status.OFF
      ? colorForStatus(status)
      : undefined;

  return (
    <LazyTooltip interactive content={<RtlsStatusMiniList />}>
      <GenericHeaderButton disabled={!connected}>
        <Radar />
        <SidebarBadge
          anchor='topLeft'
          color={badgeColor}
          offset={BADGE_OFFSET}
          visible={Boolean(badgeColor)}
        />
      </GenericHeaderButton>
    </LazyTooltip>
  );
};

export default RtlsStatusHeaderButton;
