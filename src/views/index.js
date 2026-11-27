/**
 * @file File that re-exports all the individual views implemented in
 * other files in this folder.
 */

import ClockDisplayList from './clocks';
import ConnectionList from './connections';
import FeaturePanel from './features';
import LayerList from './layers';
import LCDClockPanel from './lcd-clock';
import LightControlPanel from './light-control';
import LogPanel from './log';
import MessagesPanelView from './messages';
import {
  RtlsAnchorsPanel,
  RtlsPositionsPanel,
  RtlsSurveyPanel,
  RtlsTagsPanel,
} from './rtls';
import ShowControlPanel from './show-control';
import ThreeDTopLevelView from './three-d';
import UAVDetailsPanel from './uav-details';
import UAVList from './uavs';

/* MapView not included as it is loaded lazily */

const views = {
  ClockDisplayList,
  ConnectionList,
  FeaturePanel,
  LayerList,
  LCDClockPanel,
  LightControlPanel,
  LogPanel,
  MessagesPanelView,
  RtlsAnchorsPanel,
  RtlsPositionsPanel,
  RtlsSurveyPanel,
  RtlsTagsPanel,
  ShowControlPanel,
  UAVDetailsPanel,
  UAVList,
  ThreeDTopLevelView,
};

export default views;
