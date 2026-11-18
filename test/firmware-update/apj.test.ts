import { describe, expect, jest, test } from '@jest/globals';

import { parseApjData, parseApjFile } from '~/features/firmware-update/apj';

const encoder = new TextEncoder();

const makeApj = (overrides: Record<string, unknown> = {}): ArrayBuffer => {
  const document = {
    magic: 'APJFWv1',
    board_id: 1177,
    summary: 'AXIOLIGHT-REVB',
    version: '4.6.3',
    image_size: 3,
    image_maxsize: 1_703_936,
    git_identity: 'deadbeef',
    image: 'eJw=',
    ...overrides,
  };
  return encoder.encode(JSON.stringify(document)).buffer;
};

const expectCode = async (
  name: string,
  data: ArrayBuffer,
  code: string
): Promise<void> => {
  await expect(parseApjData(name, data)).rejects.toMatchObject({ code });
};

describe('APJ validation', () => {
  test('extracts exact metadata, digest, and original APJ bytes', async () => {
    const parsed = await parseApjData('arducopter.apj', makeApj());

    expect(parsed).toEqual({
      image:
        'eyJtYWdpYyI6IkFQSkZXdjEiLCJib2FyZF9pZCI6MTE3Nywic3VtbWFyeSI6IkFYSU9MSUdIVC1SRVZCIiwidmVyc2lvbiI6IjQuNi4zIiwiaW1hZ2Vfc2l6ZSI6MywiaW1hZ2VfbWF4c2l6ZSI6MTcwMzkzNiwiZ2l0X2lkZW50aXR5IjoiZGVhZGJlZWYiLCJpbWFnZSI6ImVKdz0ifQ==',
      metadata: {
        boardId: 1177,
        boardName: 'AXIOLIGHT-REVB',
        fileName: 'arducopter.apj',
        fileSize: 160,
        firmwareSize: 3,
        gitHash: 'deadbeef',
        sha256:
          'b3b32ca2a46ba9cc46532bf5f9d2b39cf24de2c28894924855e0674b5dd4412c',
        version: '4.6.3',
      },
    });
  });

  test('accepts a case-insensitive extension and image exactly at the limit', async () => {
    await expect(
      parseApjData(
        'ARDUCOPTER.APJ',
        makeApj({ image_size: 1_703_936, image_maxsize: 1_703_936 })
      )
    ).resolves.toMatchObject({
      metadata: { fileName: 'ARDUCOPTER.APJ', firmwareSize: 1_703_936 },
    });
  });

  test('reads the exact name and bytes from a selected file', async () => {
    const data = makeApj();
    const arrayBuffer = jest.fn(() => Promise.resolve(data));

    await expect(
      parseApjFile({ name: 'selected.apj', arrayBuffer })
    ).resolves.toMatchObject({ metadata: { fileName: 'selected.apj' } });
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  test('rejects a renamed non-APJ file before parsing it', async () => {
    await expectCode('firmware.bin', makeApj(), 'extension');
  });

  test('rejects empty and oversized files at the exact boundaries', async () => {
    await expectCode('firmware.apj', new ArrayBuffer(0), 'empty');
    await expectCode(
      'firmware.apj',
      new ArrayBuffer(3 * 1024 * 1024 + 1),
      'file_too_large'
    );
    await expectCode(
      'firmware.apj',
      new ArrayBuffer(3 * 1024 * 1024),
      'invalid_json'
    );
  });

  test.each(['{', 'null', '[]', '"firmware"', '1177'])(
    'rejects invalid JSON document %s',
    async (document) => {
      await expectCode(
        'firmware.apj',
        encoder.encode(document).buffer,
        'invalid_json'
      );
    }
  );

  test('rejects an invalid APJ magic', async () => {
    await expectCode(
      'firmware.apj',
      makeApj({ magic: 'APJFWv2' }),
      'invalid_magic'
    );
  });

  test('rejects an APJ for another flight-controller board', async () => {
    await expectCode('arducopter.apj', makeApj({ board_id: 9 }), 'wrong_board');
  });

  test.each([
    ['board_id', 0, 'invalid_board_id'],
    ['board_id', 1.5, 'invalid_board_id'],
    ['board_id', '1177', 'invalid_board_id'],
    ['image_size', 0, 'invalid_image_size'],
    ['image_size', 1.5, 'invalid_image_size'],
    ['image_size', '3', 'invalid_image_size'],
    ['image_maxsize', 0, 'invalid_image_maxsize'],
    ['image_maxsize', 1.5, 'invalid_image_maxsize'],
    ['image_maxsize', '1703936', 'invalid_image_maxsize'],
  ])('rejects invalid positive integer %s=%p', async (key, value, code) => {
    await expectCode('firmware.apj', makeApj({ [key]: value }), code);
  });

  test.each([
    ['image', '', 'missing_image'],
    ['image', '   ', 'missing_image'],
    ['image', 7, 'missing_image'],
    ['summary', '', 'missing_summary'],
    ['summary', '   ', 'missing_summary'],
    ['summary', 7, 'missing_summary'],
    ['git_identity', '', 'missing_git_identity'],
    ['git_identity', '   ', 'missing_git_identity'],
    ['git_identity', 7, 'missing_git_identity'],
    ['version', '', 'missing_version'],
    ['version', '   ', 'missing_version'],
    ['version', 7, 'missing_version'],
  ])('rejects missing text field %s=%p', async (key, value, code) => {
    await expectCode('firmware.apj', makeApj({ [key]: value }), code);
  });

  test('rejects an image larger than its APJ-declared flash limit', async () => {
    await expectCode(
      'arducopter.apj',
      makeApj({ image_size: 200, image_maxsize: 100 }),
      'image_too_large'
    );
  });
});
