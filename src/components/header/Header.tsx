import config from 'config';

import clsx from 'clsx';
import { connect } from 'react-redux';
import Shapeshifter from 'react-shapeshifter';

import UAVStatusSummary from '~/components/uavs/UAVStatusSummary';
import PerspectiveBar from '~/features/perspectives/PerspectiveBar';
import RtlsStatusHeaderButton from '~/features/rtls/RtlsStatusHeaderButton';
import SelectionGroupsHeaderButton from '~/features/selection/SelectionGroupsHeaderButton';
import { BROADCAST_MODE_TIMEOUT_LENGTH } from '~/features/settings/constants';
import { toggleSidebar } from '~/features/sidebar/actions';
import { isSidebarOpen } from '~/features/sidebar/selectors';
import BatteryStatusHeaderButton from '~/features/uavs/BatteryStatusHeaderButton';
import VelocitySummaryHeaderButton from '~/features/uavs/VelocitySummaryHeaderButton';
import { shouldSidebarBeShown } from '~/features/workbench/selectors';
import type { RootState } from '~/store/reducers';
import { hasFeature } from '~/utils/configuration';

import AlertButton from './AlertButton';
import AppSettingsButton from './AppSettingsButton';
import Brand from './Brand';
import BroadcastButton from './BroadcastButton';
import ConnectionStatusButton from './ConnectionStatusButton';
import FullScreenButton from './FullScreenButton';
import HeaderOverflowMenu from './HeaderOverflowMenu';
import HelpButton from './HelpButton';
import SafetyButton from './SafetyButton';
import ServerConnectionSettingsButton from './ServerConnectionSettingsButton';
import ToolboxButton from './ToolboxButton';

const componentRegistry: Record<string, React.ComponentType> = {
  'alert-button': AlertButton,
  'app-settings-button': AppSettingsButton,
  'battery-status-header-button': BatteryStatusHeaderButton,
  'broadcast-button': () => (
    <BroadcastButton timeoutLength={BROADCAST_MODE_TIMEOUT_LENGTH} />
  ),
  'connection-status-button': ConnectionStatusButton,
  'full-screen-button': FullScreenButton,
  'groups-button': SelectionGroupsHeaderButton,
  'help-button': () => (config.urls.help ? <HelpButton /> : null),
  'rtls-status-header-button': () =>
    hasFeature('rtls') && <RtlsStatusHeaderButton />,
  'safety-button': SafetyButton,
  'server-connection-settings-button': () => (
    <ServerConnectionSettingsButton
      hideTooltip={Boolean(config.optimizeUIForTouch.default)}
    />
  ),
  'toolbox-button': () => hasFeature('toolboxMenu') && <ToolboxButton />,
  'uav-status-summary': UAVStatusSummary,
  'velocity-summary-header-button': VelocitySummaryHeaderButton,
};

/**
 * How long a header widget survives as the window narrows: widgets with
 * priority 0 are always shown, the others move into the overflow menu at the
 * breakpoints defined in `assets/css/workbench.less`, highest number first.
 */
const priorities: Record<string, number> = {
  'app-settings-button': 1,
  'battery-status-header-button': 1,
  'rtls-status-header-button': 1,
  'broadcast-button': 2,
  'safety-button': 2,
  'server-connection-settings-button': 2,
  'toolbox-button': 2,
  'full-screen-button': 3,
  'groups-button': 3,
  'help-button': 3,
  'velocity-summary-header-button': 3,
};

const priorityOf = (component: string): number => priorities[component] ?? 0;

/**
 * Renders one group of header widgets. A group leaves the header when its
 * last widget does.
 */
const renderGroup = (group: string[], className?: string) => (
  <div
    key={group.join(',')}
    className={clsx('ax-header-group', className)}
    data-priority={Math.min(...group.map(priorityOf))}
  >
    {group.map((component) => {
      const Component = componentRegistry[component];
      return (
        <div
          key={component}
          className='ax-header-item'
          data-priority={priorityOf(component)}
        >
          <Component />
        </div>
      );
    })}
  </div>
);

type Props = {
  isSidebarOpen: boolean;
  showSidebar?: boolean;
  toggleSidebar: () => void;
};

/**
 * Presentation component for the header at the top edge of the main
 * window.
 *
 * The first group of `config.headerComponents` leads the header next to the
 * product name; the others are aligned to its end.
 */
const Header = ({ isSidebarOpen, showSidebar, toggleSidebar }: Props) => {
  const [leadingGroup, ...groups] = config.headerComponents;
  const collapsible = [leadingGroup, ...groups].filter(
    (group) => group !== undefined && group.some((c) => priorityOf(c) > 0)
  );

  return (
    <div id='header'>
      <div id='header-inner'>
        {showSidebar && (
          <div className='ax-header-nav-toggle' onClick={toggleSidebar}>
            <Shapeshifter
              color='currentColor'
              shape={isSidebarOpen ? 'close' : 'menu'}
            />
          </div>
        )}
        <Brand />

        {leadingGroup && renderGroup(leadingGroup, 'ax-header-lead')}
        <PerspectiveBar />
        {groups.map((group) => renderGroup(group))}

        <HeaderOverflowMenu>
          {collapsible.map((group) => renderGroup(group))}
        </HeaderOverflowMenu>
      </div>
    </div>
  );
};

export default connect(
  // mapStateToProps
  (state: RootState) => ({
    isSidebarOpen: isSidebarOpen(state),
    showSidebar: shouldSidebarBeShown(state),
  }),
  // mapDispatchToProps
  { toggleSidebar }
)(Header);
