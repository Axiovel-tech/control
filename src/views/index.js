/**
 * @file File that re-exports all the individual views implemented in
 * other files in this folder.
 */

import ClockDisplayList from './clocks';
import LayerList from './layers';
import LCDClockPanel from './lcd-clock';
import LightControlPanel from './light-control';
import LogPanel from './log';
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
  LayerList,
  LCDClockPanel,
  LightControlPanel,
  LogPanel,
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
