import { describe, expect, test } from '@jest/globals';

import { Status } from '~/components/semantics';
import {
  describeGeometryState,
  geometryPillFor,
  summarizeGeometryAgreement,
} from '~/features/rtls/geometry-utils';
import {
  getRtlsGeometryCheck,
  getRtlsGeometryProblemCount,
  isRtlsGeometryBusy,
} from '~/features/rtls/selectors';
import reducer, {
  clearRtlsDevices,
  rtlsGeometryCheckFailed,
  rtlsGeometryCheckStarted,
  rtlsGeometryCheckSucceeded,
  setRtlsDevicesFromStatus,
} from '~/features/rtls/slice';
import {
  type RtlsGeometryAgreement,
  RtlsGeometryState,
} from '~/features/rtls/types';
import type { RootState } from '~/store/reducers';

const agreement = (
  devices: RtlsGeometryAgreement['devices'],
  consistent = true
): RtlsGeometryAgreement => ({
  tolerance: 0.02,
  reference: [8.587, 9.224, 12.528, 3.975, 9.435, 9.979, 13.233],
  consistent,
  devices,
  receivedAt: 1,
});

const stateWith = (rtls: unknown): RootState => ({ rtls }) as RootState;

describe('geometry pill', () => {
  test('grades from the agreement verdict when one exists', () => {
    expect(
      geometryPillFor(undefined, { status: 'agree', maxDeviationM: 0.004 })
    ).toEqual({ label: 'geometry ok (0.4 cm)', status: Status.SUCCESS });
    expect(
      geometryPillFor(undefined, { status: 'deviates', maxDeviationM: 0.05 })
    ).toEqual({ label: 'geometry deviates (5.0 cm)', status: Status.ERROR });
    expect(geometryPillFor(undefined, { status: 'manual' }).status).toBe(
      Status.INFO
    );
    expect(geometryPillFor(undefined, { status: 'stale' }).status).toBe(
      Status.WARNING
    );
  });

  test('falls back to the live fit state from the stats', () => {
    expect(
      geometryPillFor(
        { id: '1', geometryState: RtlsGeometryState.CALIBRATING },
        undefined
      )
    ).toEqual({ label: 'geometry calibrating', status: Status.WARNING });
    expect(
      geometryPillFor(
        { id: '1', geometryState: RtlsGeometryState.CALIBRATED },
        undefined
      ).status
    ).toBe(Status.INFO);
    expect(
      geometryPillFor(
        { id: '1', geometryState: RtlsGeometryState.FAILED },
        undefined
      ).status
    ).toBe(Status.ERROR);
    // no telemetry, no pill (anchors, old firmware)
    expect(geometryPillFor({ id: '1' }, undefined)).toEqual({});
    expect(geometryPillFor(undefined, undefined)).toEqual({});
  });

  test('describes every firmware state', () => {
    expect(describeGeometryState(RtlsGeometryState.MANUAL)).toBe(
      'manual table'
    );
    expect(describeGeometryState(RtlsGeometryState.CALIBRATED)).toBe(
      'calibrated'
    );
    expect(describeGeometryState(undefined)).toBe('no geometry');
  });
});

describe('geometry agreement summary', () => {
  test('unchecked and empty fleets', () => {
    expect(summarizeGeometryAgreement(undefined)).toMatchObject({
      label: 'geometry unchecked',
      status: Status.OFF,
    });
    expect(summarizeGeometryAgreement(agreement({}, false))).toMatchObject({
      status: Status.OFF,
      problems: 0,
    });
  });

  test('a consistent fleet reports the largest deviation', () => {
    const summary = summarizeGeometryAgreement(
      agreement({
        '42': { status: 'agree', maxDeviationM: 0.001 },
        '43': { status: 'agree', maxDeviationM: 0.004 },
      })
    );
    expect(summary).toEqual({
      label: 'geometry consistent (2 agree, max 0.4 cm)',
      status: Status.SUCCESS,
      problems: 0,
    });
  });

  test('deviating and uncalibrated tags are counted as problems', () => {
    expect(
      summarizeGeometryAgreement(
        agreement(
          {
            '42': { status: 'agree', maxDeviationM: 0.001 },
            '43': { status: 'deviates', maxDeviationM: 0.05 },
            '44': { status: 'calibrating' },
          },
          false
        )
      )
    ).toEqual({
      label: 'geometry: 1 deviating',
      status: Status.ERROR,
      problems: 2,
    });
    expect(
      summarizeGeometryAgreement(
        agreement(
          {
            '42': { status: 'agree', maxDeviationM: 0.001 },
            '44': { status: 'stale' },
          },
          false
        )
      )
    ).toMatchObject({
      label: 'geometry: 1 not calibrated',
      status: Status.WARNING,
    });
  });

  test('manual tags never count as problems', () => {
    expect(
      summarizeGeometryAgreement(
        agreement(
          {
            '42': { status: 'agree', maxDeviationM: 0.001 },
            '43': { status: 'manual' },
          },
          true
        )
      ).problems
    ).toBe(0);
    expect(
      summarizeGeometryAgreement(
        agreement({ '43': { status: 'manual' } }, false)
      )
    ).toMatchObject({ label: 'geometry: 1 manual', problems: 0 });
  });
});

describe('geometry slice + selectors', () => {
  test('check lifecycle stores the verdict and clears the busy flag', () => {
    let state = reducer(undefined, rtlsGeometryCheckStarted());
    expect(isRtlsGeometryBusy(stateWith(state))).toBe(true);
    state = reducer(state, rtlsGeometryCheckFailed());
    expect(isRtlsGeometryBusy(stateWith(state))).toBe(false);
    expect(getRtlsGeometryCheck(stateWith(state))).toBeUndefined();

    const verdict = agreement({
      '42': { status: 'agree', maxDeviationM: 0.001 },
      '43': { status: 'deviates', maxDeviationM: 0.05 },
      '44': { status: 'manual' },
    });
    state = reducer(
      reducer(state, rtlsGeometryCheckStarted()),
      rtlsGeometryCheckSucceeded(verdict)
    );
    expect(isRtlsGeometryBusy(stateWith(state))).toBe(false);
    expect(getRtlsGeometryCheck(stateWith(state))).toEqual(verdict);
    expect(getRtlsGeometryProblemCount(stateWith(state))).toBe(1);
  });

  test('the verdict is voided when the tag set changes or the fleet is cleared', () => {
    const verdict = agreement({ '42': { status: 'agree' } });
    let state = reducer(
      reducer(
        undefined,
        setRtlsDevicesFromStatus({ '42': { role: 'tag', online: true } })
      ),
      rtlsGeometryCheckSucceeded(verdict)
    );
    expect(getRtlsGeometryCheck(stateWith(state))).toEqual(verdict);
    // same ID set: the certification survives a status refresh
    state = reducer(
      state,
      setRtlsDevicesFromStatus({ '42': { role: 'tag', online: true } })
    );
    expect(getRtlsGeometryCheck(stateWith(state))).toEqual(verdict);
    // a tag joined: the certification is void
    state = reducer(
      state,
      setRtlsDevicesFromStatus({
        '42': { role: 'tag', online: true },
        '43': { role: 'tag', online: true },
      })
    );
    expect(getRtlsGeometryCheck(stateWith(state))).toBeUndefined();

    state = reducer(
      reducer(state, rtlsGeometryCheckSucceeded(verdict)),
      clearRtlsDevices()
    );
    expect(getRtlsGeometryCheck(stateWith(state))).toBeUndefined();
    expect(getRtlsGeometryProblemCount(stateWith(state))).toBe(0);
  });
});
