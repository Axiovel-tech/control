/* global VERSION */

import Alarm from '@mui/icons-material/Alarm';
import Assignment from '@mui/icons-material/Assignment';
import Flight from '@mui/icons-material/Flight';
import FormatListBulleted from '@mui/icons-material/FormatListBulleted';
import Grain from '@mui/icons-material/Grain';
import Layers from '@mui/icons-material/Layers';
import Map from '@mui/icons-material/Map';
import Radar from '@mui/icons-material/Radar';
import SettingsInputAntenna from '@mui/icons-material/SettingsInputAntenna';
import Straighten from '@mui/icons-material/Straighten';
import ThreeDRotation from '@mui/icons-material/ThreeDRotation';
import TrackChanges from '@mui/icons-material/TrackChanges';
import WbSunny from '@mui/icons-material/WbSunny';
import clsx from 'clsx';
import PropTypes from 'prop-types';
import { Module, ModuleTray, Workbench } from 'react-flexible-workbench';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';

import LogStatusBadge from '~/components/badges/LogStatusBadge';
import ConnectingAirports from '~/icons/ConnectingAirports';
import { hasFeature } from '~/utils/configuration';

import { isSidebarOpen } from './selectors';

const hasRTLS = hasFeature('rtls');
const hasShowControl = hasFeature('showControl');

/**
 * The panels of the rail, grouped by what an operator is doing. The label of
 * an entry is also the title of its panel.
 */
const createGroups = (t) =>
  [
    {
      key: 'venue',
      title: t('sidebar.groups.venue'),
      modules: [
        { id: 'map', icon: <Map />, label: t('view.map'), component: 'map' },
        {
          id: 'threeDView',
          icon: <ThreeDRotation />,
          label: t('view.three-d-view'),
          component: 'three-d-view',
        },
        {
          id: 'layers',
          icon: <Layers />,
          label: t('view.layer-list'),
          component: 'layer-list',
        },
      ],
    },
    {
      key: 'fleet',
      title: t('sidebar.groups.fleet'),
      modules: [
        {
          id: 'uavList',
          icon: <ConnectingAirports />,
          label: t('view.uav-list'),
          component: 'uav-list',
        },
        {
          id: 'uavDetails',
          icon: <Flight />,
          label: t('view.uav-details'),
          component: 'uav-details',
        },
      ],
    },
    {
      key: 'positioning',
      title: t('sidebar.groups.positioning'),
      modules: hasRTLS
        ? [
            {
              id: 'rtlsTags',
              icon: <Radar />,
              label: t('view.rtls-tags'),
              component: 'rtls-tags',
            },
            {
              id: 'rtlsAnchors',
              icon: <SettingsInputAntenna />,
              label: t('view.rtls-anchors'),
              component: 'rtls-anchors',
            },
            {
              id: 'rtlsSurvey',
              icon: <Straighten />,
              label: t('view.rtls-survey'),
              component: 'rtls-survey',
            },
            {
              id: 'rtlsPositions',
              icon: <TrackChanges />,
              label: t('view.rtls-positions'),
              component: 'rtls-positions',
            },
          ]
        : [],
    },
    {
      key: 'show',
      title: t('sidebar.groups.show'),
      modules: [
        ...(hasShowControl
          ? [
              {
                id: 'show',
                icon: <Grain />,
                label: t('view.show-control'),
                component: 'show-control',
              },
              {
                id: 'lights',
                icon: <WbSunny />,
                label: t('view.light-control'),
                component: 'light-control',
              },
            ]
          : []),
        {
          id: 'clocks',
          icon: <Alarm />,
          label: t('view.lcd-clock-panel'),
          component: 'lcd-clock-panel',
        },
      ],
    },
    {
      key: 'records',
      title: t('sidebar.groups.records'),
      modules: [
        {
          id: 'notes',
          icon: <Assignment />,
          label: t('view.field-notes'),
          component: 'field-notes',
        },
        {
          id: 'log',
          badge: <LogStatusBadge />,
          icon: <FormatListBulleted />,
          label: t('view.log-panel'),
          component: 'log-panel',
        },
      ],
    },
  ].filter((group) => group.modules.length > 0);

/**
 * Heading of a group of modules. The module tray passes anything that is not
 * a module through untouched, so these can sit between the modules.
 */
const Heading = ({ children }) => (
  <div className='ax-rail-heading'>{children}</div>
);

Heading.propTypes = {
  children: PropTypes.node,
};

/**
 * Presentation component for the navigation rail at the left edge of the
 * main window: one entry per panel. An entry is lit while its panel is on
 * the workbench; clicking it closes the panel, and clicking or dragging an
 * unlit one brings its panel in.
 */
const Sidebar = ({ isOpen, t, workbench }) => {
  const groups = createGroups(t);

  // The tray only handles clicks on unlit entries, and its entries carry no
  // id in the DOM: a lit one is told apart by its place in the rail. In the
  // capture phase, so the entry is still as it was when it was clicked.
  const closePanelOfLitEntry = (event) => {
    const entry = event.target.closest('.wb-module-disabled');
    if (!entry) {
      return;
    }

    const entries = [...event.currentTarget.querySelectorAll('.wb-module')];
    const ids = groups.flatMap((group) => group.modules.map(({ id }) => id));
    const id = ids[entries.indexOf(entry)];
    if (id !== undefined) {
      // not while React is dispatching the click: closing a panel unmounts
      // its component
      setTimeout(() => workbench.findPanelById(id)?.remove(), 0);
    }
  };

  return (
    <div id='sidebar' className={clsx(isOpen && 'ax-rail-open')}>
      <div className='ax-rail-scroll' onClickCapture={closePanelOfLitEntry}>
        {/* Modules must be direct children of the tray (arrays are fine,
         * fragments are not): it does not recognize them otherwise */}
        <ModuleTray allowMultipleSelection vertical workbench={workbench}>
          {groups.map(({ key, modules, title }) => [
            <Heading key={`group-${key}`}>{title}</Heading>,
            ...modules.map(({ id, ...rest }) => (
              <Module key={id} id={id} {...rest} />
            )),
          ])}
        </ModuleTray>
      </div>
      {isOpen && <footer className='ax-rail-footer'>{VERSION}</footer>}
    </div>
  );
};

Sidebar.propTypes = {
  isOpen: PropTypes.bool,
  t: PropTypes.func,
  workbench: PropTypes.instanceOf(Workbench).isRequired,
};

/**
 * Navigation rail at the left edge of the main window.
 */
export default connect(
  // mapStateToProps
  (state, { workbench }) => ({
    isOpen: isSidebarOpen(state),
    workbench,
  })
)(withTranslation()(Sidebar));
