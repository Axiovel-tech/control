import { describe, expect, jest, test } from '@jest/globals';

// `~/error-handling` transitively pulls in the snackbar/MUI/logging chain
// (which loads native-ESM `color` packages that babel-jest does not transform),
// so it is stubbed here with a thin `errorToString`. The message helpers only
// use it to format error text.
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown, prefix?: string): string => {
    const base = error instanceof Error ? error.message : String(error);
    return prefix ? `${prefix}: ${base}` : base;
  },
}));

import {
  fitRtlsGeometry,
  getRtlsParameter,
  queryRtlsParameterList,
  sendRtlsSleep,
  setRtlsParameter,
  startRtlsOta,
} from '~/features/rtls/messages';
import type MessageHub from '~/flockwave/messages';

/** Builds a hub whose sendMessage returns the given body, capturing requests. */
const makeHub = (body: Record<string, unknown>) => {
  const sent: unknown[] = [];
  const hub = {
    sendMessage: jest.fn((request: unknown) => {
      sent.push(request);
      return Promise.resolve({ body });
    }),
  };

  return {
    hub: hub as unknown as MessageHub,
    sent,
    sendMessage: hub.sendMessage,
  };
};

describe('rtls messages', () => {
  test('strict and refined fits use the same explicit capture', async () => {
    const response = {
      type: 'X-RTLS-GEO',
      op: 'fit',
      mode: 'strict',
      cell: 'default',
      summary: {
        captureId: 42,
        version: 1,
        validMask: 0xfe,
        ageMs: 50,
        maxSkewMs: 350,
        sources: [],
        ranges: [],
      },
      strict: {},
      refined: null,
      selectedModel: null,
      applyGeometry: null,
    };
    const { hub, sent } = makeHub(response);

    await fitRtlsGeometry(hub, { mode: 'strict', cell: 'bench-4' });
    await fitRtlsGeometry(hub, {
      mode: 'refined',
      cell: 'bench-4',
      captureId: response.summary.captureId,
    });

    expect(sent).toEqual([
      {
        type: 'X-RTLS-GEO',
        op: 'fit',
        mode: 'strict',
        cell: 'bench-4',
      },
      {
        type: 'X-RTLS-GEO',
        op: 'fit',
        mode: 'refined',
        cell: 'bench-4',
        captureId: 42,
      },
    ]);
  });

  test('a strict fit response passes the server field names through verbatim', async () => {
    // the exact server response shape; the client must not rename anything
    const response = {
      type: 'X-RTLS-GEO',
      op: 'fit',
      mode: 'strict',
      cell: 'default',
      summary: {
        captureId: 42,
        version: 1,
        validMask: 0xfe,
        ageMs: 50,
        maxSkewMs: 350,
        sources: [
          {
            anchorIndex: 1,
            anchorMac: 0x1a2b,
            systemId: 10,
            sequence: 42,
            timeBootMs: 123_456,
            ageMs: 50,
          },
        ],
        ranges: [
          {
            anchorIndex: 1,
            peerMac: 0x1a2b,
            distanceM: 14.1,
            madM: 0.02,
            count: 240,
          },
        ],
      },
      strict: {
        model: 'strict',
        accepted: true,
        parameters: { lengthM: 14.1, widthM: 9.8, heightM: 2.5 },
        anchors: [
          { index: 0, xM: 0, yM: 0, zM: 0 },
          { index: 1, xM: 14.1, yM: 0, zM: 0 },
        ],
        rmsM: 0.031,
        weightedObjective: 0.42,
        residuals: [
          {
            anchorIndex: 1,
            peerMac: 0x1a2b,
            measuredM: 14.1,
            predictedM: 14.13,
            residualM: -0.03,
            madM: 0.02,
            count: 240,
            weight: 1,
          },
        ],
        reasons: [],
        warnings: ['height is close to its lower bound'],
      },
      refined: null,
      selectedModel: 'strict',
      applyGeometry: { UWB_AN1_X: 14.1 },
    };
    const { hub } = makeHub(response);

    const parsed = await fitRtlsGeometry(hub, {
      mode: 'strict',
      cell: 'default',
    });

    // the body (with its exact server field names — lengthM/widthM/heightM,
    // xM/yM/zM, weight, applyGeometry) is returned verbatim; the strong
    // field-name contract lives in the RtlsCalibrationResponse type (tsc)
    expect(parsed).toEqual(response);
  });

  test('a refined fit response carries its parameters and the comparison', async () => {
    const refined = {
      model: 'refined',
      accepted: true,
      parameters: {
        bottomLengthM: 14.1,
        bottomWidthM: 9.8,
        topLengthM: 14.05,
        topWidthM: 9.75,
        heightM: 2.5,
        angleDeg: 0.4,
      },
      anchors: [{ index: 0, xM: 0, yM: 0, zM: 0 }],
      rmsM: 0.02,
      weightedObjective: 0.3,
      residuals: [],
      reasons: [],
      warnings: [],
    };
    const { hub } = makeHub({
      type: 'X-RTLS-GEO',
      op: 'fit',
      mode: 'refined',
      cell: 'default',
      summary: {
        captureId: 42,
        version: 1,
        validMask: 0xfe,
        ageMs: 50,
        maxSkewMs: 350,
        sources: [],
        ranges: [],
      },
      strict: { model: 'strict', accepted: true, rmsM: 0.031 },
      refined,
      selectedModel: 'refined',
      applyGeometry: { UWB_AN1_X: 14.05 },
      comparison: {
        rmsImprovementM: 0.011,
        noiseFloorM: 0.004,
        meaningfulImprovement: true,
      },
    });

    const parsed = await fitRtlsGeometry(hub, {
      mode: 'refined',
      cell: 'default',
      captureId: 42,
    });

    expect(parsed.refined).toEqual(refined);
    expect(parsed.selectedModel).toBe('refined');
    expect(parsed.comparison).toEqual({
      rmsImprovementM: 0.011,
      noiseFloorM: 0.004,
      meaningfulImprovement: true,
    });
  });

  test('a rejected fit surfaces the actionable ACK-NAK reason', async () => {
    const { hub } = makeHub({
      type: 'ACK-NAK',
      reason: 'no fresh rolling TWR summary arrived within 3.0 seconds',
    });
    await expect(
      fitRtlsGeometry(hub, { mode: 'strict', cell: 'default' })
    ).rejects.toThrow(
      /no fresh rolling TWR summary arrived within 3\.0 seconds/
    );
  });

  test('queryRtlsParameterList sorts by index then name', async () => {
    const { hub } = makeHub({
      type: 'X-RTLS-PARAM-LIST',
      count: 3,
      params: {
        GAMMA: { value: 3, type: 'uint8', index: 2 },
        ALPHA: { value: 1, type: 'uint8', index: 0 },
        BETA: { value: 2, type: 'uint8', index: 1 },
      },
    });
    const params = await queryRtlsParameterList(hub, '7');
    expect(params.map((p) => p.name)).toEqual(['ALPHA', 'BETA', 'GAMMA']);
  });

  describe('getRtlsParameter', () => {
    test('returns the value reported by the device', async () => {
      const { hub, sent } = makeHub({
        type: 'X-RTLS-PARAM-GET',
        id: '7',
        name: 'POS_DBG_HZ',
        value: 10,
        paramType: 'uint8',
      });
      const value = await getRtlsParameter(hub, '7', 'POS_DBG_HZ');
      expect(value).toBe(10);
      expect(sent[0]).toEqual({
        type: 'X-RTLS-PARAM-GET',
        id: '7',
        name: 'POS_DBG_HZ',
      });
    });

    test('throws a descriptive error on an ACK-NAK', async () => {
      const { hub } = makeHub({ type: 'ACK-NAK', reason: 'No such device' });
      await expect(getRtlsParameter(hub, '9', 'POS_DBG_HZ')).rejects.toThrow(
        /No such device/
      );
    });
  });

  describe('setRtlsParameter', () => {
    test('returns accepted:true on an accepted set', async () => {
      const { hub, sendMessage } = makeHub({
        type: 'X-RTLS-PARAM-SET',
        id: '7',
        name: 'GAIN',
        value: 5,
        paramType: 'uint16',
        result: 'ok',
        accepted: true,
      });
      const result = await setRtlsParameter(hub, '7', 'GAIN', 5, 'uint16');
      expect(result).toEqual({
        name: 'GAIN',
        value: 5,
        paramType: 'uint16',
        result: 'ok',
        accepted: true,
      });
      // paramType is forwarded in the request.
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'X-RTLS-PARAM-SET',
        id: '7',
        name: 'GAIN',
        value: 5,
        paramType: 'uint16',
      });
    });

    test('a device rejection (accepted:false) resolves normally, does not throw', async () => {
      const { hub } = makeHub({
        type: 'X-RTLS-PARAM-SET',
        id: '7',
        name: 'GAIN',
        value: 5,
        accepted: false,
        result: 'out of range',
      });
      const result = await setRtlsParameter(hub, '7', 'GAIN', 5);
      expect(result.accepted).toBe(false);
      expect(result.result).toBe('out of range');
    });

    test('a malformed response throws', async () => {
      const { hub } = makeHub({ type: 'ACK-NAK', reason: 'bad request' });
      await expect(setRtlsParameter(hub, '7', 'GAIN', 5)).rejects.toThrow();
    });
  });

  test('startRtlsOta forwards the image and returns the job', async () => {
    const { hub, sent } = makeHub({
      type: 'X-RTLS-OTA',
      id: '7',
      job: { id: 'job-1', status: 'pending', image: 'fw.bin' },
    });
    const job = await startRtlsOta(hub, '7', 'fw.bin');
    expect(job).toMatchObject({ id: 'job-1', status: 'pending' });
    expect(sent[0]).toMatchObject({
      type: 'X-RTLS-OTA',
      id: '7',
      image: 'fw.bin',
    });
  });
});

describe('sendRtlsSleep', () => {
  test('sends numeric ids and returns the per-device result map', async () => {
    const { hub, sendMessage, sent } = makeHub({
      type: 'X-RTLS-SLEEP',
      sleeping: true,
      result: {
        '7': { requested: true, accepted: true, sleeping: true },
        '8': {
          requested: true,
          accepted: false,
          sleeping: false,
          detail: 'refused by device (arming gate)',
        },
      },
    });

    const result = await sendRtlsSleep(hub, ['7', '8'], true);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sent[0]).toEqual({
      type: 'X-RTLS-SLEEP',
      ids: [7, 8],
      sleeping: true,
    });
    expect(result['7'].accepted).toBe(true);
    expect(result['8'].accepted).toBe(false);
    expect(result['8'].detail).toMatch(/arming gate/);
  });

  test('drops non-numeric ids and rejects when none remain', async () => {
    const { hub } = makeHub({ type: 'X-RTLS-SLEEP', result: {} });
    for (const bad of ['bogus', '', ' ', '0x10', '1e2', '-3']) {
      await expect(sendRtlsSleep(hub, [bad], true)).rejects.toThrow(
        /No valid RTLS device ids/
      );
    }
  });

  test('reports invalid ids and server-omitted devices as failures', async () => {
    const { hub, sent } = makeHub({
      type: 'X-RTLS-SLEEP',
      sleeping: true,
      result: { '7': { requested: true, accepted: true, sleeping: true } },
    });

    const result = await sendRtlsSleep(hub, ['7', '8', 'bogus'], true);

    // only the parseable ids go on the wire
    expect((sent[0] as { ids: number[] }).ids).toEqual([7, 8]);
    expect(result['7'].accepted).toBe(true);
    // the server said nothing about 8 -> failure, not silent success
    expect(result['8'].accepted).toBe(false);
    expect(result['8'].detail).toMatch(/no response/);
    // the dropped id is reported too
    expect(result['bogus'].accepted).toBe(false);
    expect(result['bogus'].detail).toMatch(/invalid device id/);
  });

  test('an empty result map marks every device as unconfirmed', async () => {
    const { hub } = makeHub({ type: 'X-RTLS-SLEEP', sleeping: true });
    const result = await sendRtlsSleep(hub, ['7'], true);
    expect(result['7'].accepted).toBe(false);
  });

  test('throws a descriptive error on an ACK-NAK response', async () => {
    const { hub } = makeHub({ type: 'ACK-NAK', reason: 'nope' });
    await expect(sendRtlsSleep(hub, ['7'], false)).rejects.toThrow(
      /X-RTLS-SLEEP/
    );
  });
});
