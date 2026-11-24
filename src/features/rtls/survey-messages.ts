/**
 * @file The X-RTLS-SURVEY message as Control reads it: the server's survey
 * state object (in every answer and notification) and the answers to this
 * client's requests. Untyped values are narrowed here; an absent or
 * malformed member reads as absent.
 */

import { isRecord, toNumber, toText } from './wire-values';

const SURVEY_PHASES = [
  'idle',
  'measuring',
  'returning',
  'ready',
  'committing',
  'committed',
  'failed',
] as const;

/** The server's `state`. */
export type RtlsSurveyPhase = (typeof SURVEY_PHASES)[number];

/** What one anchor of a pair measured while the other initiated. */
export type RtlsSurveyDirection = {
  rangeM?: number;
  madM?: number;
  /** Inlier samples. */
  n?: number;
  /** Valid share of the rounds, 0..1. */
  share?: number;
};

/** A pair with a usable range; a missing pair is only in the gate. */
export type RtlsSurveyPair = {
  a: string;
  b: string;
  rangeM?: number;
  /** The range `b` measured while `a` initiated; absent when unusable. */
  ab?: RtlsSurveyDirection;
  ba?: RtlsSurveyDirection;
  fittedM?: number;
  /** The fitted distance minus the range. */
  residualM?: number;
};

/** An anchor's fitted position in the declared frame (z down), metres. */
export type RtlsSurveyAnchorFit = {
  x: number;
  y: number;
  z: number;
  links?: number;
  residualRmsM?: number;
  worstPairM?: number;
  /** Predicted uncertainty; absent when the ranges leave it undetermined. */
  sigmaM?: number;
  /** Distance from the stored position; absent when the anchor stores none. */
  movedM?: number;
};

export type RtlsSurveyFit = {
  rmsM?: number;
  worstM?: number;
  planar: boolean;
  anchors: Record<string, RtlsSurveyAnchorFit>;
  /** The server's remarks, shown as they are. */
  notes: string[];
};

/** A block or a warning of the commit gate; `detail` is the server's text. */
export type RtlsSurveyGateEntry = {
  code: string;
  device?: string;
  peer?: string;
  detail: string;
};

export type RtlsSurveyGate = {
  blocked: RtlsSurveyGateEntry[];
  warnings: RtlsSurveyGateEntry[];
};

export type RtlsSurveyCommit = {
  surveyId?: number;
  /** Per anchor: `written` is `changed` or `failed`. */
  results: Record<string, { written: string; detail?: string }>;
  /** The anchors that already report the new survey ID. */
  running: string[];
};

/** The survey state object. */
export type RtlsSurvey = {
  state: RtlsSurveyPhase;
  /** Why it failed or was refused. */
  reason?: string;
  /** The group, system ids. */
  anchors: string[];
  step?: number;
  steps?: number;
  initiator?: string;
  pairs: RtlsSurveyPair[];
  fit?: RtlsSurveyFit;
  gate: RtlsSurveyGate;
  commit?: RtlsSurveyCommit;
};

export type RtlsSurveyAction = 'status' | 'start' | 'cancel' | 'fit' | 'commit';

const SURVEY_RESULTS = [
  'status',
  'started',
  'cancelled',
  'fitted',
  'committed',
  'warnings',
  'blocked',
  'incomplete',
  'refused',
] as const;

/**
 * The server's `result`; `unknown` for one this client does not know and
 * `error` when no answer came (a timeout, a NAK).
 */
export type RtlsSurveyResult =
  | (typeof SURVEY_RESULTS)[number]
  | 'unknown'
  | 'error';

/** An answer to a request of this client. */
export type RtlsSurveyAnswer = {
  action: RtlsSurveyAction;
  result: RtlsSurveyResult;
  reason?: string;
  survey?: RtlsSurvey;
};

/** What the last request came to. */
export type RtlsSurveyOutcome = Omit<RtlsSurveyAnswer, 'survey'>;

const toId = (value: unknown): string | undefined =>
  toNumber(value) === undefined ? undefined : String(value);

const toIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        const id = toId(entry);
        return id === undefined ? [] : [id];
      })
    : [];

const mapDirection = (value: unknown): RtlsSurveyDirection | undefined =>
  isRecord(value)
    ? {
        rangeM: toNumber(value.rangeM),
        madM: toNumber(value.madM),
        n: toNumber(value.n),
        share: toNumber(value.share),
      }
    : undefined;

const mapPairs = (value: unknown): RtlsSurveyPair[] =>
  Array.isArray(value)
    ? value.flatMap((raw) => {
        const a = isRecord(raw) ? toId(raw.a) : undefined;
        const b = isRecord(raw) ? toId(raw.b) : undefined;
        if (!isRecord(raw) || a === undefined || b === undefined) {
          return [];
        }
        return [
          {
            a,
            b,
            rangeM: toNumber(raw.rangeM),
            ab: mapDirection(raw.ab),
            ba: mapDirection(raw.ba),
            fittedM: toNumber(raw.fittedM),
            residualM: toNumber(raw.residualM),
          },
        ];
      })
    : [];

const mapAnchorFit = (value: unknown): RtlsSurveyAnchorFit | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const x = toNumber(value.x);
  const y = toNumber(value.y);
  const z = toNumber(value.z);
  if (x === undefined || y === undefined || z === undefined) {
    return undefined;
  }
  return {
    x,
    y,
    z,
    links: toNumber(value.links),
    residualRmsM: toNumber(value.residualRmsM),
    worstPairM: toNumber(value.worstPairM),
    sigmaM: toNumber(value.sigmaM),
    movedM: toNumber(value.movedM),
  };
};

const mapFit = (value: unknown): RtlsSurveyFit | undefined => {
  if (!isRecord(value) || !isRecord(value.anchors)) {
    return undefined;
  }
  const anchors: Record<string, RtlsSurveyAnchorFit> = {};
  for (const [id, raw] of Object.entries(value.anchors)) {
    const fit = mapAnchorFit(raw);
    if (fit !== undefined) {
      anchors[id] = fit;
    }
  }
  return {
    rmsM: toNumber(value.rmsM),
    worstM: toNumber(value.worstM),
    planar: value.planar === true,
    anchors,
    notes: Array.isArray(value.notes)
      ? value.notes.flatMap((note) => toText(note) ?? [])
      : [],
  };
};

const mapGateEntries = (value: unknown): RtlsSurveyGateEntry[] =>
  Array.isArray(value)
    ? value.flatMap((raw) =>
        isRecord(raw)
          ? [
              {
                code: toText(raw.code) ?? 'unknown',
                device: toId(raw.device),
                peer: toId(raw.peer),
                detail: toText(raw.detail) ?? '',
              },
            ]
          : []
      )
    : [];

const mapCommit = (value: unknown): RtlsSurveyCommit | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const results: RtlsSurveyCommit['results'] = {};
  if (isRecord(value.results)) {
    for (const [id, raw] of Object.entries(value.results)) {
      if (isRecord(raw)) {
        results[id] = {
          written: toText(raw.written) ?? 'unknown',
          detail: toText(raw.detail),
        };
      }
    }
  }
  return {
    surveyId: toNumber(value.surveyId),
    results,
    running: toIds(value.running),
  };
};

/**
 * Maps the survey state object; `undefined` for anything without a known
 * `state`, which then replaces nothing.
 */
export function mapRtlsSurvey(value: unknown): RtlsSurvey | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const state = SURVEY_PHASES.find((phase) => phase === value.state);
  if (state === undefined) {
    return undefined;
  }
  const gate = isRecord(value.gate) ? value.gate : {};
  return {
    state,
    reason: toText(value.reason),
    anchors: toIds(value.anchors),
    step: toNumber(value.step),
    steps: toNumber(value.steps),
    initiator: toId(value.initiator),
    pairs: mapPairs(value.pairs),
    fit: mapFit(value.fit),
    gate: {
      blocked: mapGateEntries(gate.blocked),
      warnings: mapGateEntries(gate.warnings),
    },
    commit: mapCommit(value.commit),
  };
}

/**
 * The state object of an X-RTLS-SURVEY body: its `survey` member, as in an
 * answer, or the body itself when the server pushes the object bare.
 */
export const surveyOfBody = (body: unknown): RtlsSurvey | undefined =>
  isRecord(body) ? mapRtlsSurvey(body.survey ?? body) : undefined;

/** Maps the answer to `action`. */
export const mapRtlsSurveyAnswer = (
  action: RtlsSurveyAction,
  body: Record<string, unknown>
): RtlsSurveyAnswer => ({
  action,
  result: SURVEY_RESULTS.find((result) => result === body.result) ?? 'unknown',
  reason: toText(body.reason),
  survey: mapRtlsSurvey(body.survey),
});
