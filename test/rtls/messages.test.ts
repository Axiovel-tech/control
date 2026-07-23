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
  test('strict and refined fits use the same explicit summary generation', async () => {
    const response = {
      type: 'X-RTLS-GEO',
      op: 'fit',
      mode: 'strict',
      summary: {
        systemId: 10,
        sequence: 42,
        timeBootMs: 1000,
        validMask: 0xfe,
        ageMs: 50,
        ranges: [],
      },
      strict: {},
      refined: null,
      selectedModel: null,
      applyGeometry: null,
    };
    const { hub, sent } = makeHub(response);

    await fitRtlsGeometry(hub, { mode: 'strict' });
    await fitRtlsGeometry(hub, {
      mode: 'refined',
      summarySequence: response.summary.sequence,
    });

    expect(sent).toEqual([
      { type: 'X-RTLS-GEO', op: 'fit', mode: 'strict' },
      {
        type: 'X-RTLS-GEO',
        op: 'fit',
        mode: 'refined',
        summarySequence: 42,
      },
    ]);
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
