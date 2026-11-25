import { describe, expect, test } from '@jest/globals';

import { handleRtlsSurveyMessage, residualLevel } from '~/features/rtls/survey';
import {
  mapRtlsSurvey,
  mapRtlsSurveyAnswer,
  surveyOfBody,
} from '~/features/rtls/survey-messages';
import { type AppDispatch } from '~/store/reducers';

import { READY, RUN } from './survey-recording';
import {
  createSurveyTestStore as createStore,
  play,
} from './survey-test-store';

describe('the wire mapping', () => {
  test('a body without a known state replaces nothing', () => {
    expect(mapRtlsSurvey(undefined)).toBeUndefined();
    expect(mapRtlsSurvey({ state: 'dancing' })).toBeUndefined();
    const store = createStore();
    play(store, RUN);
    handleRtlsSurveyMessage(
      { type: 'X-RTLS-SURVEY', survey: { state: 'dancing' } },
      store.dispatch as AppDispatch
    );
    expect(store.getState().rtlsSurvey.survey?.state).toBe('ready');
  });

  test('the state object is read from `survey`, or bare', () => {
    expect(surveyOfBody({ survey: { state: 'idle' } })?.state).toBe('idle');
    expect(
      surveyOfBody({ type: 'X-RTLS-SURVEY', state: 'measuring', step: 2 })
    ).toMatchObject({ state: 'measuring', step: 2 });
  });

  test('absent members read as empty; a direction left out stays out', () => {
    const survey = mapRtlsSurvey({
      state: 'ready',
      pairs: [{ a: 1, b: 2, rangeM: 3, ab: null, ba: { n: 40, share: 0.6 } }],
    });
    expect(survey).toMatchObject({
      anchors: [],
      gate: { blocked: [], warnings: [] },
    });
    expect(survey?.fit).toBeUndefined();
    expect(survey?.commit).toBeUndefined();
    expect(survey?.pairs[0].ab).toBeUndefined();
    expect(survey?.pairs[0].ba).toMatchObject({ n: 40, share: 0.6 });
  });

  test('an answer with a result this client does not know is `unknown`', () => {
    expect(
      mapRtlsSurveyAnswer('fit', { type: 'X-RTLS-SURVEY', result: 'mended' })
    ).toMatchObject({ action: 'fit', result: 'unknown' });
  });

  test("residuals are coloured at the commit warnings' bounds", () => {
    expect(residualLevel(undefined)).toBe('ok');
    expect(residualLevel(0.05)).toBe('ok');
    expect(residualLevel(-0.051)).toBe('warning');
    expect(residualLevel(0.1)).toBe('warning');
    expect(residualLevel(-0.101)).toBe('error');
  });

  test('the frame and placement the fit used are read when echoed', () => {
    expect(mapRtlsSurvey(READY)?.basis).toBeUndefined();
    expect(
      mapRtlsSurvey({
        ...READY,
        frame: { preset: 'two-tiers' },
        placement: null,
      })?.basis
    ).toEqual({ frame: { preset: 'two-tiers' }, placement: undefined });
    expect(
      mapRtlsSurvey({
        ...READY,
        frame: {
          // a server that filled the preset in and kept its tag
          preset: 'two-tiers',
          origin: 101,
          xAxis: 102,
          heightGroups: [[101, 102, 103, 104]],
          upper: [],
          yPositive: 103,
        },
        placement: { '101': { x: 0, y: 0, z: 0 }, '104': { x: 'far' } },
      })?.basis
    ).toEqual({
      frame: {
        origin: 101,
        xAxis: 102,
        heightGroups: [[101, 102, 103, 104]],
        upper: [],
        yPositive: 103,
      },
      placement: { '101': { x: 0, y: 0 } },
    });
  });
});
