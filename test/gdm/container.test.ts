import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from '@jest/globals';
import JSZip from 'jszip';

import {
  createTrajectoryPlayer,
  validateShowSpecification,
} from '@skybrush/show-format';

import {
  computeShowHash,
  GdmLoadError,
  loadGdmContainer,
} from '~/features/show/gdm/container';
import { isGdmFile } from '~/features/show/gdm/load';
import {
  gdmToShowInfo,
  gdmToShowSpecification,
} from '~/features/show/gdm/preview';
import type {
  GdmCertificationJson,
  GdmContainer,
  GdmDroneJson,
  GdmManifest,
} from '~/features/show/gdm/types';
import { createGdmUploadForSlot } from '~/features/show/gdm/upload';

// Vendored from AxioStack contracts/gdm-vectors (see the README there)
const VECTORS = path.join(__dirname, '..', 'fixtures', 'gdm-vectors');
// The v1 conformance vector; provisional/ holds layouts v1 refuses (§4.11)
const VECTOR_NAMES = ['flat-single'] as const;
const PROVISIONAL_VECTORS = [
  'provisional/flat-rth',
  'provisional/maneuver-single',
] as const;

type Expected = {
  show_hash: string;
  gdmb: Record<string, { size: number; sha256: string }>;
  samples: Record<string, Array<{ t_us: number; p: number[] }>>;
};

const readVector = (name: string) => ({
  bytes: new Uint8Array(readFileSync(path.join(VECTORS, name, 'show.gdm'))),
  expected: JSON.parse(
    readFileSync(path.join(VECTORS, name, 'expected.json'), 'utf8')
  ) as Expected,
});

const sha256Hex = async (data: Uint8Array) =>
  Buffer.from(
    await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(data))
  ).toString('hex');

/** Unzips a vector, lets `mutate` change entries, and zips it again. */
async function rezip(
  bytes: Uint8Array,
  mutate: (entries: Map<string, Uint8Array>) => Promise<void> | void
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  const entries = new Map<string, Uint8Array>();
  for (const file of Object.values(zip.files)) {
    entries.set(file.name, await file.async('uint8array'));
  }

  await mutate(entries);

  const out = new JSZip();
  for (const [name, data] of entries) {
    // No directory entries: the spec forbids them (§3.1)
    out.file(name, data, { createFolders: false });
  }

  return out.generateAsync({ type: 'uint8array' });
}

const json = <T>(data: Uint8Array): T =>
  JSON.parse(new TextDecoder().decode(data)) as T;
const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));

/**
 * Rewrites the manifest so that its sizes, SHA-256s and show hash match the
 * (mutated) entries, as a careless or malicious writer could.
 */
async function resealManifest(entries: Map<string, Uint8Array>) {
  const manifest = json<GdmManifest>(entries.get('manifest.json')!);
  entries.delete('manifest.json');

  // Point certification.json at the new show hash too, so that only the
  // check under test fails (the .gdmb headers still carry the old one)
  const showHash = await computeShowHash(entries);
  const certification = json<GdmCertificationJson>(
    entries.get('certification.json')!
  );
  certification.show_hash = showHash;
  entries.set('certification.json', encode(certification));

  for (const entry of manifest.entries) {
    const data = entries.get(entry.path)!;
    entry.size = data.length;
    entry.sha256 = await sha256Hex(data);
  }

  manifest.show_hash = showHash;
  entries.set('manifest.json', encode(manifest));
}

const expectLoadError = async (bytes: Uint8Array, code: string) => {
  const promise = loadGdmContainer(bytes);
  await expect(promise).rejects.toBeInstanceOf(GdmLoadError);
  await expect(promise).rejects.toMatchObject({ code });
};

describe.each(VECTOR_NAMES)('golden vector %s', (name) => {
  const { bytes, expected } = readVector(name);

  test('loads, verifies the show hash and binds certification', async () => {
    const container = await loadGdmContainer(bytes);

    expect(container.showHash).toBe(expected.show_hash);
    expect(container.certification.status).toBe('pass');
    expect(container.drones.map((d) => d.id)).toEqual(['d01']);

    const [drone] = container.drones;
    expect(drone.certified).toBe(true);
    expect(drone.gdmb.length).toBe(expected.gdmb.d01.size);
    expect(await sha256Hex(drone.gdmb)).toBe(expected.gdmb.d01.sha256);
  });

  test('builds a valid, playable preview that follows the reference', async () => {
    const container = await loadGdmContainer(bytes);
    const spec = gdmToShowSpecification(container);
    expect(() => validateShowSpecification(spec)).not.toThrow();

    const { settings } = spec.swarm.drones[0];
    const drone = container.drones[0].json;
    expect(settings.home).toEqual(drone.home);
    expect(settings.trajectory.points[0]).toEqual([0, drone.start.p, []]);
    expect(settings.trajectory.takeoffTime).toBeUndefined();
    expect(settings.trajectory.points.at(-1)![0]).toBe(
      container.show.duration_us / 1e6
    );

    // Spec §6 reference positions; segments above cubic are approximated by
    // cubic pieces, which must stay well within a millimetre
    const player = createTrajectoryPlayer(settings.trajectory);
    const result = { x: 0, y: 0, z: 0 };
    for (const sample of expected.samples.d01) {
      player.getPositionAt(sample.t_us / 1e6, result);
      expect(Math.abs(result.x - sample.p[0])).toBeLessThan(1e-3);
      expect(Math.abs(result.y - sample.p[1])).toBeLessThan(1e-3);
      expect(Math.abs(result.z - sample.p[2])).toBeLessThan(1e-3);
    }
  });

  test('builds the upload payload of a certified slot', async () => {
    const container = await loadGdmContainer(bytes);
    const info = gdmToShowInfo(container);
    const config = { coordinateSystem: { type: 'nwu' } };

    const payload = createGdmUploadForSlot(info, 'uav-7', 0, config);

    expect(payload).toEqual({
      format: 'gdm',
      gdmb: Buffer.from(container.drones[0].gdmb).toString('base64'),
      showHash: expected.show_hash,
      config,
    });
    expect(() => createGdmUploadForSlot(info, 'uav-7', 1, config)).toThrow(
      /No .gdm drone/
    );
  });
});

describe('fail-closed container checks', () => {
  const { bytes } = readVector('flat-single');

  test('rejects an entry whose bytes differ from the manifest', async () => {
    const tampered = await rezip(bytes, (entries) => {
      const drone = json<GdmDroneJson>(entries.get('drones/d01.json')!);
      drone.home = [0.1, 0, 0];
      entries.set('drones/d01.json', encode(drone));
    });
    await expectLoadError(tampered, 'G_MANIFEST');
  });

  test('rejects a manifest whose show hash does not match', async () => {
    const tampered = await rezip(bytes, (entries) => {
      const manifest = json<GdmManifest>(entries.get('manifest.json')!);
      manifest.show_hash = '0'.repeat(64);
      entries.set('manifest.json', encode(manifest));
    });
    await expectLoadError(tampered, 'G_SHOW_HASH');
  });

  test('rejects a missing or an unlisted entry', async () => {
    const missing = await rezip(bytes, (entries) => {
      entries.delete('provenance.json');
    });
    await expectLoadError(missing, 'G_MANIFEST');

    const extra = await rezip(bytes, (entries) => {
      entries.set('notes.txt', encode('hello'));
    });
    await expectLoadError(extra, 'G_MANIFEST');
  });

  test('rejects a .gdmb from another show, even with a resealed manifest', async () => {
    const other = await JSZip.loadAsync(
      readVector('provisional/flat-rth').bytes
    );
    const otherGdmb = await other.file('drones/d01.gdmb')!.async('uint8array');
    const tampered = await rezip(bytes, async (entries) => {
      entries.set('drones/d01.gdmb', otherGdmb);
      await resealManifest(entries);
    });
    await expectLoadError(tampered, 'G_SHOW_HASH');
  });

  test('rejects unsafe entry names', async () => {
    const zip = new JSZip();
    zip.file('../manifest.json', '{}');
    await expectLoadError(
      await zip.generateAsync({ type: 'uint8array' }),
      'G_ZIP'
    );
  });

  test('rejects something that is not a ZIP archive', async () => {
    await expectLoadError(new Uint8Array([1, 2, 3, 4]), 'G_ZIP');
  });

  test('loads an uncertified show but refuses to upload it', async () => {
    const tampered = await rezip(bytes, async (entries) => {
      const certification = json<GdmCertificationJson>(
        entries.get('certification.json')!
      );
      certification.status = 'fail';
      certification.drones[0].status = 'fail';
      entries.set('certification.json', encode(certification));
      await resealManifest(entries);
    });

    const container = await loadGdmContainer(tampered);
    expect(container.certification.status).toBe('fail');
    expect(container.drones[0].certified).toBe(false);
    expect(() =>
      createGdmUploadForSlot(gdmToShowInfo(container), 'uav-1', 0, {})
    ).toThrow(/not certified/);
  });

  test('does not certify a .gdmb whose SHA-256 differs from certification.json', async () => {
    const tampered = await rezip(bytes, async (entries) => {
      const certification = json<GdmCertificationJson>(
        entries.get('certification.json')!
      );
      certification.drones[0].gdmb_sha256 = 'f'.repeat(64);
      entries.set('certification.json', encode(certification));
      await resealManifest(entries);
    });

    const container = await loadGdmContainer(tampered);
    expect(container.certification.status).toBe('pass');
    expect(container.drones[0].certified).toBe(false);
  });
});

describe('version policy and provisional layouts', () => {
  const { bytes } = readVector('flat-single');

  test.each(PROVISIONAL_VECTORS)(
    'refuses the provisional vector %s',
    async (name) => {
      await expectLoadError(readVector(name).bytes, 'G_PROVISIONAL');
    }
  );

  test('refuses a FLAT envelope', async () => {
    const tampered = await rezip(bytes, async (entries) => {
      const drone = json<GdmDroneJson>(entries.get('drones/d01.json')!);
      Object.assign(drone.segments[1], { envelope: { pos_m: 0.15 } });
      entries.set('drones/d01.json', encode(drone));
      await resealManifest(entries);
    });
    await expectLoadError(tampered, 'G_PROVISIONAL');
  });

  test('refuses a manifest newer than this reader', async () => {
    const tampered = await rezip(bytes, (entries) => {
      const manifest = json<GdmManifest>(entries.get('manifest.json')!);
      Object.assign(manifest, { version: 2 });
      entries.set('manifest.json', encode(manifest));
    });
    await expectLoadError(tampered, 'G_VERSION');
  });
});

describe('isGdmFile', () => {
  test('recognizes .gdm files by name', () => {
    expect(isGdmFile(new File([], 'Higher fable v2.gdm'))).toBe(true);
    expect(isGdmFile(new File([], 'SHOW.GDM'))).toBe(true);
    expect(isGdmFile(new File([], 'show.skyc'))).toBe(false);
    expect(isGdmFile('show.gdm')).toBe(false);
  });
});

describe('preview of a drone that takes off late', () => {
  // Both golden vectors take off at t = 0; real shows wait on the ground
  // first. `.skyc` keypoint times are relative to `takeoffTime`, so the
  // preview must not carry the informative `takeoff_us` over.
  const drone: GdmDroneJson = {
    version: 1,
    id: 'd01',
    home: [1, 2, 0],
    takeoff_us: 3_000_000,
    landing_us: 7_000_000,
    start: { p: [1, 2, 0], yaw: 0 },
    capabilities: [],
    segments: [
      {
        regime: 'flat',
        duration_us: 3_000_000,
        sigma: 1,
        x: [],
        y: [],
        z: [],
        yaw: [],
      },
      {
        regime: 'flat',
        duration_us: 2_000_000,
        sigma: 1,
        x: [],
        y: [],
        z: [0, 0, 1.5, 1.5, 1.5], // quintic rest to rest, P0 implicit
        yaw: [],
      },
      {
        regime: 'flat',
        duration_us: 4_000_000,
        sigma: 1,
        x: [],
        y: [],
        z: [1.5, 1.5, 0],
        yaw: [],
      },
    ],
  };
  const container = {
    show: {
      duration_us: 9_000_000,
      environment: 'indoor',
      drones: [{ id: 'd01' }],
    },
    drones: [
      { id: 'd01', json: drone, gdmb: new Uint8Array(), certified: true },
    ],
  } as unknown as GdmContainer;

  test('places every keypoint at its show time', () => {
    const spec = gdmToShowSpecification(container);
    const { trajectory } = spec.swarm.drones[0].settings;
    const player = createTrajectoryPlayer(trajectory);
    const result = { x: 0, y: 0, z: 0 };

    player.getPositionAt(2.9, result);
    expect(result).toEqual({ x: 1, y: 2, z: 0 });

    // Middle of the quintic climb: z = 0.75 by symmetry
    player.getPositionAt(4, result);
    expect(result.z).toBeCloseTo(0.75, 4);

    player.getPositionAt(5, result);
    expect(result.z).toBeCloseTo(1.5, 9);

    expect(trajectory.points.at(-1)![0]).toBe(9);
    expect(trajectory.points.at(-1)![1]).toEqual([1, 2, 0]);
  });
});
