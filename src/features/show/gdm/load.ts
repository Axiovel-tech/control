import type { ShowSpecification } from '@skybrush/show-format';

import { loadGdmContainer } from './container';
import { gdmToShowInfo, gdmToShowSpecification } from './preview';
import type { GdmShowInfo } from './types';

type NamedBlob = Blob & { name?: string };

/**
 * Returns whether the given file should be read as a `.gdm` show container,
 * judging by its name.
 */
export const isGdmFile = (file: unknown): file is NamedBlob =>
  file instanceof Blob &&
  typeof (file as NamedBlob).name === 'string' &&
  (file as NamedBlob).name!.toLowerCase().endsWith('.gdm');

const titleFromFileName = (name?: string): string | undefined =>
  name ? name.replace(/\.gdm$/i, '') : undefined;

/**
 * Loads a `.gdm` show from a file: checks the container, then builds the
 * `.skyc`-shaped preview specification and the information the upload needs.
 */
export async function loadGdmShowFromFile(
  file: NamedBlob
): Promise<{ spec: ShowSpecification; gdm: GdmShowInfo }> {
  const container = await loadGdmContainer(
    new Uint8Array(await file.arrayBuffer())
  );
  return {
    spec: gdmToShowSpecification(container, titleFromFileName(file.name)),
    gdm: gdmToShowInfo(container),
  };
}
