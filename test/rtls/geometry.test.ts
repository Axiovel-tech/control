import { describe, expect, test } from '@jest/globals';

import { Status } from '~/components/semantics';
import {
  describeGeometryAgreement,
  describeGeometryFit,
  describeGeometryState,
  geometryPillFor,
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
  RtlsGeometryReason,
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
    ).toEqual({
      text: {
        key: 'rtlsGeometry.pill.okDeviation',
        values: { deviation: '0.4' },
      },
      status: Status.SUCCESS,
    });
    expect(
      geometryPillFor(undefined, { status: 'deviates', maxDeviationM: 0.05 })
    ).toEqual({
      text: {
        key: 'rtlsGeometry.pill.deviatesDeviation',
        values: { deviation: '5.0' },
      },
      status: Status.ERROR,
    });
    expect(
      geometryPillFor(undefined, { status: 'drifted', driftM: 0.05 })
    ).toEqual({
      text: { key: 'rtlsGeometry.pill.driftedDrift', values: { drift: '5.0' } },
      status: Status.ERROR,
    });
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
    ).toEqual({
      text: { key: 'rtlsGeometry.pill.calibrating' },
      status: Status.WARNING,
    });
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

  test('describes every firmware state and the telemetry line', () => {
    expect(describeGeometryState(RtlsGeometryState.MANUAL).key).toBe(
      'rtlsGeometry.state.manual'
    );
    expect(describeGeometryState(undefined).key).toBe(
      'rtlsGeometry.state.none'
    );
    expect(describeGeometryFit({ id: '1' })).toBeUndefined();
    expect(
      describeGeometryFit({
        id: '1',
        geometryState: RtlsGeometryState.CALIBRATED,
        geometryResidualM: -0.075,
        geometryDriftM: 0.002,
      })
    ).toEqual({
      key: 'rtlsGeometry.fit.calibrated',
      values: { residual: '-7.5' },
    });
    expect(
      describeGeometryFit({
        id: '1',
        geometryState: RtlsGeometryState.CALIBRATED,
        geometryResidualM: -0.075,
        geometryDriftM: 0.03,
      })
    ).toEqual({
      key: 'rtlsGeometry.fit.calibratedDrift',
      values: { residual: '-7.5', drift: '3.0' },
    });
    expect(
      describeGeometryFit({ id: '1', geometryState: RtlsGeometryState.WAITING })
    ).toEqual({ key: 'rtlsGeometry.state.waiting' });
    // a rejected fit names the tag's reason (two anchors swapped on the
    // bench, 2026-09-04: the diagonal disagreed with the sides by metres)
    expect(
      describeGeometryFit({
        id: '1',
        geometryState: RtlsGeometryState.FAILED,
        geometryReason: RtlsGeometryReason.NOT_RECTANGLE,
        geometryResidualM: -5.83,
      })
    ).toEqual({ key: 'rtlsGeometry.rejected.notRectangle' });
    expect(
      describeGeometryFit({ id: '1', geometryState: RtlsGeometryState.FAILED })
    ).toEqual({ key: 'rtlsGeometry.rejected.none' });
    // an absent metric is unknown, not a perfect zero
    expect(
      describeGeometryFit({
        id: '1',
        geometryState: RtlsGeometryState.CALIBRATED,
        geometryResidualM: -0.075,
      })
    ).toEqual({ key: 'rtlsGeometry.fit.calibratedPending' });
  });
});

describe('geometry agreement summary', () => {
  test('unchecked and empty fleets', () => {
    expect(describeGeometryAgreement(undefined)).toMatchObject({
      key: 'rtlsGeometry.summary.unchecked',
      status: Status.OFF,
    });
    expect(describeGeometryAgreement(agreement({}, false))).toMatchObject({
      key: 'rtlsGeometry.summary.noTags',
      status: Status.OFF,
      problems: 0,
    });
  });

  test('a consistent fleet reports the largest deviation', () => {
    expect(
      describeGeometryAgreement(
        agreement({
          '42': { status: 'agree', maxDeviationM: 0.001 },
          '43': { status: 'agree', maxDeviationM: 0.004 },
        })
      )
    ).toEqual({
      key: 'rtlsGeometry.summary.consistent',
      values: { count: 2, deviation: '0.4' },
      status: Status.SUCCESS,
      problems: 0,
    });
  });

  test('deviating, drifted and uncalibrated tags are counted as problems', () => {
    expect(
      describeGeometryAgreement(
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
      key: 'rtlsGeometry.summary.deviating',
      values: { count: 1 },
      status: Status.ERROR,
      problems: 2,
    });
    expect(
      describeGeometryAgreement(
        agreement(
          {
            '42': { status: 'agree', maxDeviationM: 0.001 },
            '43': { status: 'drifted', driftM: 0.05 },
          },
          false
        )
      )
    ).toMatchObject({
      key: 'rtlsGeometry.summary.drifted',
      values: { count: 1 },
      status: Status.ERROR,
      problems: 1,
    });
    expect(
      describeGeometryAgreement(
        agreement(
          {
            '42': { status: 'agree', maxDeviationM: 0.001 },
            '44': { status: 'stale' },
          },
          false
        )
      )
    ).toMatchObject({
      key: 'rtlsGeometry.summary.notCalibrated',
      status: Status.WARNING,
    });
  });

  test('manual tags never count as problems', () => {
    expect(
      describeGeometryAgreement(
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
      describeGeometryAgreement(
        agreement({ '43': { status: 'manual' } }, false)
      )
    ).toMatchObject({ key: 'rtlsGeometry.summary.manualOnly', problems: 0 });
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
    // a device of unknown role resolving as a tag is the same tag set
    // (unknown roles count as tags, as in getRtlsTagDevices)
    state = reducer(
      reducer(
        state,
        setRtlsDevicesFromStatus({
          '42': { role: 'tag', online: true },
          '43': { online: true },
        })
      ),
      rtlsGeometryCheckSucceeded(verdict)
    );
    state = reducer(
      state,
      setRtlsDevicesFromStatus({
        '42': { role: 'tag', online: true },
        '43': { role: 'tag', online: true },
      })
    );
    expect(getRtlsGeometryCheck(stateWith(state))).toEqual(verdict);
    state = reducer(
      reducer(
        state,
        setRtlsDevicesFromStatus({ '42': { role: 'tag', online: true } })
      ),
      rtlsGeometryCheckSucceeded(verdict)
    );
    // an anchor joined: anchors are not graded, the certification stands
    state = reducer(
      state,
      setRtlsDevicesFromStatus({
        '42': { role: 'tag', online: true },
        '101': { role: 'anchor-initiator', online: true },
      })
    );
    expect(getRtlsGeometryCheck(stateWith(state))).toEqual(verdict);
    // a tag joined: the certification is void
    state = reducer(
      state,
      setRtlsDevicesFromStatus({
        '42': { role: 'tag', online: true },
        '43': { role: 'tag', online: true },
        '101': { role: 'anchor-initiator', online: true },
      })
    );
    expect(getRtlsGeometryCheck(stateWith(state))).toBeUndefined();

    // a tag rebooted (uptime went backwards): it refits at boot, the
    // verdict is void and the panel's re-check trigger moves
    state = reducer(
      reducer(
        state,
        setRtlsDevicesFromStatus({
          '42': { role: 'tag', online: true, uptimeMs: 500000 },
          '43': { role: 'tag', online: true, uptimeMs: 500000 },
          '101': { role: 'anchor-initiator', online: true },
        })
      ),
      rtlsGeometryCheckSucceeded(verdict)
    );
    const invalidationsBefore = state.geometry.invalidations;
    state = reducer(
      state,
      setRtlsDevicesFromStatus({
        '42': { role: 'tag', online: true, uptimeMs: 3000 },
        '43': { role: 'tag', online: true, uptimeMs: 501000 },
        '101': { role: 'anchor-initiator', online: true },
      })
    );
    expect(getRtlsGeometryCheck(stateWith(state))).toBeUndefined();
    expect(state.geometry.invalidations).toBe(invalidationsBefore + 1);

    state = reducer(
      reducer(state, rtlsGeometryCheckSucceeded(verdict)),
      clearRtlsDevices()
    );
    expect(getRtlsGeometryCheck(stateWith(state))).toBeUndefined();
    expect(getRtlsGeometryProblemCount(stateWith(state))).toBe(0);

    // without a cached verdict (a check in flight) the generation still
    // moves, so the in-flight answer is dropped rather than shown
    state = reducer(
      state,
      setRtlsDevicesFromStatus({
        '42': { role: 'tag', online: true, uptimeMs: 9000 },
      })
    );
    const generation = state.geometry.invalidations;
    state = reducer(
      state,
      setRtlsDevicesFromStatus({
        '42': { role: 'tag', online: true, uptimeMs: 1000 },
      })
    );
    expect(state.geometry.lastCheck).toBeUndefined();
    expect(state.geometry.invalidations).toBe(generation + 1);
  });
});
