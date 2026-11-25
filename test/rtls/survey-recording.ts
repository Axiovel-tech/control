/**
 * @file A recorded X-RTLS-SURVEY exchange, in the shapes the server's survey
 * run sends: the stand-in for that server. Bodies are as they travel, so the
 * tests go through the same mapping as the app. The cell is synthetic: four
 * anchors (system ids 101..104) on a 4 m by 3 m rectangle.
 */

type Body = { type: 'X-RTLS-SURVEY' } & Record<string, unknown>;

/** One message of the recording: the answer to a request, or a push. */
export type RecordedMessage =
  | { answerTo: 'status' | 'start' | 'cancel' | 'fit' | 'commit'; body: Body }
  | { pushed: true; body: Body };

const GROUP = [101, 102, 103, 104];

const NO_GATE = { blocked: [], warnings: [] };

const state = (members: Record<string, unknown>): Record<string, unknown> => ({
  reason: null,
  anchors: GROUP,
  step: 0,
  steps: 0,
  initiator: null,
  pairs: [],
  fit: null,
  gate: NO_GATE,
  commit: null,
  ...members,
});

/** The answer to a request, carrying a state object. */
export const answer = (
  action: 'status' | 'start' | 'cancel' | 'fit' | 'commit',
  result: string,
  survey: Record<string, unknown>,
  reason: string | null = null
): RecordedMessage => ({
  answerTo: action,
  body: { type: 'X-RTLS-SURVEY', action, result, reason, survey },
});

/** A pushed state object. */
export const push = (survey: Record<string, unknown>): RecordedMessage => ({
  pushed: true,
  body: { type: 'X-RTLS-SURVEY', survey },
});

const IDLE = state({ state: 'idle', anchors: [] });

const measuring = (step: number): Record<string, unknown> =>
  state({ state: 'measuring', step, steps: 4, initiator: GROUP[step - 1] });

const direction = (rangeM: number, share = 0.98) => ({
  rangeM,
  madM: 0.004,
  n: Math.round(share * 100),
  share,
});

const pair = (
  a: number,
  b: number,
  rangeM: number,
  fittedM: number,
  shareBa = 0.98
) => ({
  a,
  b,
  rangeM,
  ab: direction(rangeM + 0.004),
  ba: direction(rangeM - 0.004, shareBa),
  fittedM,
  residualM: Math.round((fittedM - rangeM) * 10000) / 10000,
});

const PAIRS = [
  pair(101, 102, 4.012, 4.0031),
  pair(101, 103, 2.991, 3.0022),
  pair(101, 104, 5.004, 5.0041),
  pair(102, 103, 4.93, 5.0037, 0.84),
  pair(102, 104, 3.006, 3.0022),
  pair(103, 104, 4.001, 4.0031),
];

const anchorFit = (
  x: number,
  y: number,
  extra: Record<string, unknown> = {}
) => ({
  x,
  y,
  z: 0,
  links: 3,
  residualRmsM: 0.0214,
  worstPairM: 0.0737,
  sigmaM: 0.031,
  ...extra,
});

const FIT = {
  rmsM: 0.0312,
  worstM: 0.0737,
  planar: true,
  anchors: {
    '101': anchorFit(0, 0, { movedM: 0 }),
    '102': anchorFit(4.0031, 0, { movedM: 0.012 }),
    '103': anchorFit(0.0018, 3.0022, { movedM: 0.154 }),
    // an anchor that stores no position carries no `movedM`
    '104': anchorFit(4.0029, 3.0019),
  },
  notes: ['anchors 103 and 104 are swapped against the placement'],
};

const LOW_SHARE = {
  code: 'low-share',
  device: 102,
  peer: 103,
  detail: 'valid share 0.84 of the ranges 102 measured while 103 initiated',
};

/** The state object of the fit with one warning. */
export const READY = state({
  state: 'ready',
  step: 4,
  steps: 4,
  pairs: PAIRS,
  fit: FIT,
  gate: { blocked: [], warnings: [LOW_SHARE] },
});

const written = (failed: number[] = []) =>
  Object.fromEntries(
    GROUP.map((id) => [
      String(id),
      failed.includes(id)
        ? { written: 'failed', detail: 'no answer' }
        : { written: 'changed', detail: '' },
    ])
  );

const COMMITTED = {
  ...READY,
  state: 'committed',
  commit: { surveyId: 12, results: written(), running: GROUP },
};

/** The survey a fresh server reports. */
export const STATUS_IDLE = answer('status', 'status', IDLE);

/** Start, four steps, the return, and a fit with one warning. */
export const RUN: RecordedMessage[] = [
  answer('start', 'started', measuring(1)),
  push(measuring(2)),
  push(measuring(3)),
  push(measuring(4)),
  push(state({ state: 'returning', step: 4, steps: 4 })),
  push(READY),
];

/** A commit without the acknowledgement: the warnings come back. */
export const COMMIT_WARNINGS = answer('commit', 'warnings', READY);

/** The acknowledged commit: written, then every anchor on the new ID. */
export const COMMIT: RecordedMessage[] = [
  push({ ...READY, state: 'committing' }),
  push({
    ...READY,
    state: 'committing',
    commit: { surveyId: 12, results: written(), running: [101, 102] },
  }),
  answer('commit', 'committed', COMMITTED),
  push(COMMITTED),
];

/** A commit that one anchor missed, back in `ready`. */
export const COMMIT_INCOMPLETE = answer(
  'commit',
  'incomplete',
  {
    ...READY,
    commit: {
      surveyId: 12,
      results: written([104]),
      running: [101, 102, 103],
    },
  },
  'Not every anchor took the survey'
);

/** A start the server refuses: nothing was written. */
export const START_REFUSED = answer(
  'start',
  'refused',
  IDLE,
  'Unlock the anchors first'
);

/** A run that an anchor ends in its second step. */
export const RUN_FAILED: RecordedMessage[] = [
  answer('start', 'started', measuring(1)),
  push(measuring(2)),
  push(state({ state: 'returning', step: 2, steps: 4 })),
  push(
    state({
      state: 'failed',
      reason: 'RTLS anchor A2 refused the survey step: locked',
    })
  ),
];

/** A cancel during the run: it returns, then is idle and says why. */
export const RUN_CANCELLED: RecordedMessage[] = [
  answer('start', 'started', measuring(1)),
  answer(
    'cancel',
    'cancelled',
    state({ state: 'returning', step: 1, steps: 4 })
  ),
  push(state({ state: 'idle', anchors: [], reason: 'cancelled' })),
];

/** A commit every anchor took, one of which never reports the new ID. */
export const COMMIT_UNCONFIRMED = answer(
  'commit',
  'incomplete',
  {
    ...READY,
    commit: { surveyId: 12, results: written(), running: [101, 102, 103] },
  },
  'Not every anchor took the survey'
);

const BLOCKED = state({
  state: 'ready',
  step: 4,
  steps: 4,
  // the missing pair is only in the gate
  pairs: PAIRS.slice(0, 5),
  fit: {
    ...FIT,
    anchors: {
      ...FIT.anchors,
      '104': anchorFit(4.0029, 3.0019, { links: 2, sigmaM: null }),
    },
    notes: [],
  },
  gate: {
    blocked: [
      {
        code: 'pair-missing',
        device: 103,
        peer: 104,
        detail: 'no usable range between 103 and 104',
      },
      {
        code: 'not-located',
        device: 104,
        peer: null,
        detail: 'the ranges leave 104 undetermined',
      },
    ],
    warnings: [],
  },
});

/** A fit the gate blocks, and the commit that is answered with it. */
export const RUN_BLOCKED: RecordedMessage[] = [
  answer('start', 'started', measuring(1)),
  push(BLOCKED),
];
export const COMMIT_BLOCKED = answer('commit', 'blocked', BLOCKED);

/** A refit of the held measurement: the same ranges, the warning gone. */
export const REFIT = answer('fit', 'fitted', {
  ...READY,
  fit: { ...FIT, notes: [] },
  gate: NO_GATE,
});
