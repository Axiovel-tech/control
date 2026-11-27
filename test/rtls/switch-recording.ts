/**
 * @file Recorded server messages of a cell whose anchors own the geometry,
 * in the shapes of axio-server#74 (slice SV-3): X-RTLS-INF with `anchors[]`
 * and `survey`, X-RTLS-STATS with the survey stats of anchors and tags, and
 * an X-RTLS-VERIFY answer with the rules `survey`, `frame` and `anchors`.
 *
 * The cell: six anchors, 201 (A0) to 206 (A5). 201, 202, 205 and 206 are on
 * survey 12; 203 was added later and stores no position; 204 is still on
 * survey 11. Two tags: 42 follows survey 12 on the four anchors that are on
 * it, which is enough to position, and leaves the other two out; 43 is
 * asleep.
 */

export const INFORMATION = {
  type: 'X-RTLS-INF',
  status: {
    '42': { online: true, role: 'tag', name: 'RTLS tag 42', cell: 'default' },
    '43': {
      online: true,
      role: 'tag',
      name: 'RTLS tag 43',
      cell: 'default',
      sleeping: true,
    },
    '201': { online: true, role: 'anchor-initiator', name: 'RTLS anchor A0' },
    '202': { online: true, role: 'anchor-responder', name: 'RTLS anchor A1' },
    '203': { online: true, role: 'anchor-responder', name: 'RTLS anchor A2' },
    '204': { online: true, role: 'anchor-responder', name: 'RTLS anchor A3' },
    '205': { online: true, role: 'anchor-responder', name: 'RTLS anchor A4' },
    '206': { online: true, role: 'anchor-responder', name: 'RTLS anchor A5' },
  },
  anchors: [
    {
      id: 'rtls::default::anchor_0',
      cell: 'default',
      index: 0,
      mac: 1,
      position: { lat: 41.39, lon: 2.15, amsl: 10.0 },
      ned: { north: 0.0, east: 0.0, down: 0.0 },
      surveyId: 12,
      planar: false,
      active: true,
      systemId: 201,
    },
    {
      id: 'rtls::default::anchor_1',
      cell: 'default',
      index: 1,
      mac: 2,
      position: { lat: 41.3900359, lon: 2.15, amsl: 10.0 },
      ned: { north: 4.0, east: 0.0, down: 0.0 },
      surveyId: 12,
      planar: false,
      active: true,
      systemId: 202,
    },
    {
      id: 'rtls::default::anchor_2',
      cell: 'default',
      index: 2,
      mac: 3,
      position: null,
      ned: null,
      surveyId: null,
      planar: false,
      active: true,
      systemId: 203,
    },
    {
      id: 'rtls::default::anchor_3',
      cell: 'default',
      index: 3,
      mac: 4,
      position: { lat: 41.3900359, lon: 2.1500359, amsl: 12.5 },
      ned: { north: 4.0, east: 3.0, down: -2.5 },
      surveyId: 11,
      planar: false,
      active: true,
      systemId: 204,
    },
    {
      id: 'rtls::default::anchor_4',
      cell: 'default',
      index: 4,
      mac: 5,
      position: { lat: 41.39, lon: 2.1500359, amsl: 10.0 },
      ned: { north: 0.0, east: 3.0, down: 0.0 },
      surveyId: 12,
      planar: false,
      active: true,
      systemId: 205,
    },
    {
      id: 'rtls::default::anchor_5',
      cell: 'default',
      index: 5,
      mac: 6,
      position: { lat: 41.39, lon: 2.15, amsl: 12.5 },
      ned: { north: 0.0, east: 0.0, down: -2.5 },
      surveyId: 12,
      planar: false,
      active: true,
      systemId: 206,
    },
  ],
  survey: {
    id: 12,
    anchors: 4,
    notSurveyed: [203],
    otherSurvey: [204],
    rangeDeviation: [202],
    rangeDanger: [],
    excluding: {
      '42': [
        { mac: 3, systemId: 203, state: 'no-position' },
        { mac: 4, systemId: 204, state: 'other-survey' },
      ],
    },
  },
};

/** The same cell with every anchor committed and every tag on all of them. */
export const INFORMATION_CLEAN = {
  ...INFORMATION,
  survey: {
    id: 12,
    anchors: 6,
    notSurveyed: [],
    otherSurvey: [],
    rangeDeviation: [],
    rangeDanger: [],
    excluding: {},
  },
};

/** A cell that was never surveyed. */
export const INFORMATION_BLANK = {
  ...INFORMATION,
  survey: {
    id: null,
    anchors: 0,
    notSurveyed: [201, 202, 203, 204, 205, 206],
    otherSurvey: [],
    rangeDeviation: [],
    rangeDanger: [],
    excluding: {},
  },
};

export const STATS = {
  type: 'X-RTLS-STATS',
  stats: {
    '42': {
      solveRateHz: 82.7,
      solvePct: 100,
      anchorsSeen: 4,
      fixAgeMs: 12,
      anchorMask: 15,
      nlosMask: 2,
      outvotedMask: 0,
      residualRmsM: 0.024,
      surveyId: 12,
      anchorsUsed: 4,
      anchorsExcluded: 2,
      surveyDriftM: 0.0312,
      // the show clock is valid in a cell with no survey: it says nothing
      // of whether the tag positions
      clockSyncOk: true,
      anchorTable: [
        // the tag's rows are in the order it heard the anchors, not in slots
        { row: 0, mac: 2, state: 'in-use', systemId: 202 },
        { row: 1, mac: 1, state: 'in-use', systemId: 201 },
        { row: 2, mac: 5, state: 'in-use', systemId: 205 },
        { row: 3, mac: 6, state: 'in-use', systemId: 206 },
        { row: null, mac: 3, state: 'no-position', systemId: 203 },
        { row: null, mac: 4, state: 'other-survey', systemId: 204 },
      ],
    },
    '201': {
      powerState: 'operating',
      rangingRateHz: 83,
      uwbStatus: 1,
      surveyId: 12,
    },
    '202': {
      powerState: 'operating',
      rangingRateHz: 83,
      uwbStatus: 1,
      surveyId: 12,
      rangeDeviationM: -0.1234,
    },
    '203': {
      powerState: 'operating',
      rangingRateHz: 83,
      uwbStatus: 1,
      surveyId: null,
    },
    '204': {
      powerState: 'operating',
      rangingRateHz: 83,
      uwbStatus: 1,
      surveyId: 11,
      rangeDeviationM: 0.012,
    },
    '205': {
      powerState: 'operating',
      rangingRateHz: 83,
      uwbStatus: 1,
      surveyId: 12,
    },
    '206': {
      powerState: 'operating',
      rangingRateHz: 83,
      uwbStatus: 1,
      surveyId: 12,
    },
  },
};

/** Tag 42 once it hears no anchor with a position: the show clock still runs. */
export const STATS_TAG_NO_SURVEY = {
  type: 'X-RTLS-STATS',
  stats: {
    '42': {
      solveRateHz: 0,
      solvePct: 0,
      surveyId: null,
      anchorsUsed: 0,
      anchorsExcluded: 4,
      surveyDriftM: 0,
      clockSyncOk: true,
      anchorTable: [
        { row: null, mac: 1, state: 'no-position', systemId: 201 },
        { row: null, mac: 9, state: 'no-position', systemId: null },
      ],
    },
  },
};

export const VERIFY = {
  type: 'X-RTLS-VERIFY',
  inDepth: false,
  passed: false,
  rules: [
    {
      id: 'survey',
      label: 'Anchor survey',
      severity: 'error',
      status: 'fail',
      detail:
        'RTLS anchor A2 is not surveyed; RTLS anchor A3 is on survey 11, the cell on 12; tag 42 leaves out 2 anchor(s): anchor 203 (no-position), anchor 204 (other-survey)',
    },
    {
      id: 'frame',
      label: 'Cell frame',
      severity: 'error',
      status: 'pass',
      detail: 'the tags of each cell hold one origin and yaw',
    },
    {
      id: 'anchors',
      label: 'Anchor positions',
      severity: 'warning',
      status: 'fail',
      detail:
        'RTLS anchor A1 is 12 cm closer to its initiator than when surveyed',
    },
    {
      id: 'firmware',
      label: 'Firmware',
      severity: 'error',
      status: 'pass',
      detail: 'every device runs 1.4.0',
    },
  ],
};
