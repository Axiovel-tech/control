/**
 * @file Baseline values for the configuration options of the application.
 */

import { type Config } from 'config';

import { LayerType } from '~/model/layers';
import { type Latitude, type Longitude } from '~/utils/geography';

const axiovelIcon =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj4KICA8cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcng9Ijk2IiBmaWxsPSIjMjQ0QzVBIi8+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDQuNSw0Ny41KSBzY2FsZSgxLjk4NikiPgogICAgPHBvbHlnb24gcG9pbnRzPSIzMSwzMyA4MCw5OSAxMDYsMTU1IDEzMiwxMDAgMTgxLDM0IDE2OSw4NyAxMzQsMTE3IDEwNywxNzcgNzksMTE3IDQzLDg2IiBmaWxsPSIjRkZGRkZGIi8+CiAgICAKICA8L2c+Cjwvc3ZnPgo=';

const baseline: Config = {
  branding: {
    splashIcon: {
      srcSet: {
        default: axiovelIcon,
        twoX: axiovelIcon,
      },
      width: 96,
      height: 96,
    },
    splashTitle: 'axio control',
  },

  ephemeral: false,

  examples: {
    shows: [],
  },

  features: {
    loadShowFromCloud: false,
    missionEditor: false,
    safetySettings: false,
  },

  headerComponents: [
    ['uav-status-summary'],
    ['groups-button'],
    [
      'battery-status-header-button',
      'distance-summary-header-button',
      'altitude-summary-header-button',
      'velocity-summary-header-button',
    ],
    [
      'rtk-status-header-button',
      'rtls-status-header-button',
      'weather-header-button',
    ],
    ['connection-status-button'],
    [
      'server-connection-settings-button',
      'safety-button',
      'authentication-button',
    ],
    [
      'broadcast-button',
      'toolbox-button',
      'app-settings-button',
      'alert-button',
      'session-expiry-box',
    ],
  ],

  language: {
    default: 'en',
    enabled: new Set(['de', 'en', 'fr', 'hu', 'it', 'ja', 'pl', 'zh-Hans']),
    fallback: 'en',
  },

  map: {
    drawingTools: [
      ['select', 'zoom'],
      [
        'add-marker',
        'draw-path',
        'draw-circle',
        'draw-rectangle',
        'draw-polygon',
        'cut-hole',
        'edit-feature',
      ],
    ],

    features: {
      onCreate() {
        /* do nothing */
      },
    },

    layers: [
      { id: 'base', type: LayerType.BASE, label: 'Base map' },
      { id: 'graticule', type: LayerType.GRATICULE, label: 'Graticule' },
      { id: 'beacons', type: LayerType.BEACONS, label: 'Beacons' },
      { id: 'features', type: LayerType.FEATURES, label: 'Features' },
      { id: 'home', type: LayerType.MISSION_INFO, label: 'Mission info' },
      { id: 'uavs', type: LayerType.UAVS, label: 'UAVs' },
    ],

    locations: [
      {
        id: 'budapest',
        name: 'Budapest',
        center: { lon: 19, lat: 47.5 },
        rotation: 0,
        zoom: 11,
        notes: 'The capital of Hungary',
      },
      {
        id: 'elte',
        name: 'ELTE Garden',
        center: { lon: 19.0622 as Longitude, lat: 47.4733 as Latitude },
        rotation: 348,
        zoom: 17,
        notes: '',
      },
    ],

    origin: {
      position: [19.0622 as Longitude, 47.4733 as Latitude],
      angle: '0',
    },

    tileProviders: {
      bingMaps: false,
      googleMaps: false,
    },

    view: {
      position: [19 as Longitude, 47.5 as Latitude],
      angle: '0',
      zoom: 11,
    },
  },

  optimizeForSingleUAV: {
    default: false,
    force: false,
  },

  optimizeUIForTouch: {
    default: null,
    force: false,
  },

  perspectives: ['default'],

  ribbon: {
    label: null,
    position: 'bottomRight',
  },

  server: {
    connectAutomatically: true,
    preventAutodetection: false,
    preventManualSetup: false,
    hostName: 'localhost',
    port: null,
    isSecure: null,
    warnClockSkew: true,
  },

  session: {
    maxLengthInSeconds: null,
  },

  toastPlacement: 'top-center',

  urls: {
    help: 'https://github.com/Axiovel-tech/control',
    exit: null,
  },
};

export default baseline;
