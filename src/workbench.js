/**
 * @file The main workbench object of the application that allows users
 * to arrange views in a flexible manner.
 *
 * This file contains a singleton instance of the workbench that is then
 * imported by the app. The app then binds the workbench to the central
 * workbench view and the sidebar.
 */

import loadable from '@loadable/component';
import debounce from 'lodash-es/debounce';
import React from 'react';
import { WorkbenchBuilder } from 'react-flexible-workbench';

import { BackgroundHint } from '@skybrush/mui-components';

import { layout } from './design/tokens';
import { makeDetachable } from './features/detachable-panels/DetachablePanel';
import { createPerspectiveBuilder } from './features/perspectives/utils';
import { enableLiveSplitterResizing } from './features/workbench/live-resize';
import {
  saveWorkbenchState,
  setWorkbenchHasHeaders,
  setWorkbenchIsFixed,
} from './features/workbench/slice';
import { injectFlockFromContext } from './flock';
import i18n from './i18n';
import store from './store';
import {
  getDefaultWorkbenchPerspectiveSpecification,
  hasFeature,
} from './utils/configuration';
import views from './views';

const FieldNotesPanel = loadable(
  () =>
    import(
      /* webpackChunkName: "field-notes" */ './views/field-notes/FieldNotesPanel'
    )
);

const MapView = loadable(
  () => import(/* webpackChunkName: "map" */ './views/map/MapView')
);

require('../assets/css/workbench.less');

/**
 * Dummy component that renders nothing.
 */
const Nothing = () => null;

/**
 * Fallback component to use in the workbench in case of errors.
 */
const FallbackComponent = () => (
  <BackgroundHint text='This component is not available in this version' />
);

/**
 * Helper function that returns the given value if and only if the given
 * feature is present in the configuration.
 */
const onlyWithFeature = (featureName, component) =>
  hasFeature(featureName) ? component : FallbackComponent;

/**
 * Registry that maps component types to be used in the top-level
 * GoldenLayout object to the corresponding React components.
 *
 * The React components will be created without any props. If you need the
 * components to have props, use a wrapper HOC.
 */
export const componentRegistry = {
  'field-notes': {
    component: FieldNotesPanel,
    label: 'Field notes',
  },
  'layer-list': {
    component: views.LayerList,
    label: 'Layers',
    detachable: true,
  },
  'light-control': {
    component: views.LightControlPanel,
    label: 'Light control',
    detachable: true,
    feature: 'showControl',
  },
  'lcd-clock-panel': {
    component: views.LCDClockPanel,
    label: 'Clocks',
    detachable: true,
  },
  'log-panel': {
    component: views.LogPanel,
    label: 'Event log',
    detachable: true,
  },
  map: {
    component: MapView,
    label: 'Map',
    detachable: true,
  },
  placeholder: {
    component: Nothing,
    label: 'Placeholder',
  },
  'rtls-tags': {
    component: views.RtlsTagsPanel,
    label: 'RTLS Tags',
    detachable: true,
    feature: 'rtls',
  },
  'rtls-anchors': {
    component: views.RtlsAnchorsPanel,
    label: 'RTLS Anchors',
    detachable: true,
    feature: 'rtls',
  },
  'rtls-positions': {
    // debug tool: registered so it can be opened from the sidebar, but
    // deliberately NOT part of the default perspective layout
    component: views.RtlsPositionsPanel,
    label: 'Debug Pos Estimates',
    detachable: true,
    feature: 'rtls',
  },
  'rtls-survey': {
    component: views.RtlsSurveyPanel,
    label: 'RTLS Survey',
    detachable: true,
    feature: 'rtls',
  },
  rtls: {
    // deprecated, kept for compatibility with persisted layouts that still
    // reference the old merged "RTLS Link" panel; renders the Tags panel
    component: views.RtlsTagsPanel,
    label: 'RTLS Tags',
    detachable: true,
    feature: 'rtls',
  },
  'rtls-device-list': {
    // deprecated, kept for compatibility with persisted layouts
    component: views.RtlsTagsPanel,
    label: 'RTLS Tags',
    detachable: true,
    feature: 'rtls',
  },
  'rtls-stats': {
    // deprecated, kept for compatibility with persisted layouts
    component: views.RtlsTagsPanel,
    label: 'RTLS Tags',
    detachable: true,
    feature: 'rtls',
  },
  'show-control': {
    component: views.ShowControlPanel,
    label: 'Show control',
    detachable: true,
    feature: 'showControl',
  },
  'three-d-view': {
    component: views.ThreeDTopLevelView,
    label: '3D View',
    feature: 'threeDView',
  },
  'uav-details': {
    component: views.UAVDetailsPanel,
    label: 'UAV',
    detachable: true,
  },
  'uav-list': {
    component: injectFlockFromContext(views.UAVList),
    label: 'UAVs',
    detachable: true,
  },
};

/**
 * Sizes of the workbench chrome; see the golden-layout `dimensions` option.
 */
const panelDimensions = {
  borderWidth: layout.panelGap,
  headerHeight: layout.panelHeaderHeight,
  minItemHeight: 96,
  minItemWidth: 200,
};

function constructDefaultWorkbench(store) {
  const workbenchBuilder = new WorkbenchBuilder();

  // Register all our supported components in the workbench builder
  for (const [name, entry] of Object.entries(componentRegistry)) {
    const featureModifier = (c) =>
      entry.feature ? onlyWithFeature(entry.feature, c) : c;
    const detachModifier = (c) =>
      entry.detachable ? makeDetachable(name, entry.label, c) : c;
    workbenchBuilder.registerComponent(
      name,
      featureModifier(detachModifier(entry.component))
    );
  }

  // Create the default perspective
  const workbench = workbenchBuilder.build();

  // The panel dimensions belong to the design, not to a saved layout: the
  // library neither stores them in the state it hands out nor offers a way to
  // set defaults, so they are added to every state on its way in.
  const restoreState = workbench.restoreState.bind(workbench);
  workbench.restoreState = (state) => {
    restoreState({ ...state, dimensions: panelDimensions });
  };

  const { isFixed, state } = createPerspectiveBuilder(
    componentRegistry,
    workbench
  )(getDefaultWorkbenchPerspectiveSpecification());

  workbench.restoreState(state);
  store.dispatch(setWorkbenchHasHeaders(state.settings.hasHeaders));
  store.dispatch(setWorkbenchIsFixed(isFixed));

  // Set a fallback component for cases when we cannot show a component
  workbench.fallback = FallbackComponent;

  // Wire the workbench to the store so the store is updated when
  // the workbench state changes
  workbench.on(
    'stateChanged',
    debounce(() => {
      store.dispatch(saveWorkbenchState(workbench));
    }, 1000)
  );

  return workbench;
}

// The panels follow a splitter while it is dragged; has to be in place before
// the first layout creates its splitters
enableLiveSplitterResizing();

const workbench = constructDefaultWorkbench(store);

const buildPerspective = createPerspectiveBuilder(componentRegistry, workbench);

/**
 * Returns the workbench state of one of the well-known layouts, ready to be
 * passed to `workbench.restoreState()`.
 *
 * @param {string} name  name of a layout in `features/perspectives/common`
 */
export const buildWorkbenchLayout = (name) => buildPerspective(name).state;

i18n.on('languageChanged', () => {
  workbench.forEach((view) => {
    if (view.isComponent) {
      /* i18next-extract-disable-next-line */
      view.setTitle(i18n.t(`view.${view.config.component}`));
    }
  });
});

/**
 * React context that exposes the workbench instance to components.
 */
export const Workbench = React.createContext(workbench);

export default workbench;
