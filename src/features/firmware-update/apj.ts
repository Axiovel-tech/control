import { Base64 } from 'js-base64';

import {
  AXIOLIGHT_BOARD_ID,
  type FirmwareArtifactMetadata,
  type PreparedFirmwareArtifact,
} from './types';

const MAX_APJ_FILE_SIZE = 3 * 1024 * 1024;
const APJ_MAGIC = 'APJFWv1';

type ApjDocument = Record<string, unknown>;

export class ApjValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ApjValidationError';
  }
}

const requiredString = (document: ApjDocument, key: string): string => {
  const value = document[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApjValidationError(`missing_${key}`);
  }

  return value;
};

const requiredPositiveInteger = (
  document: ApjDocument,
  key: string
): number => {
  const value = document[key];
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new ApjValidationError(`invalid_${key}`);
  }

  return Number(value);
};

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');

const parseDocument = (data: ArrayBuffer): ApjDocument => {
  let parsed: unknown;
  // Stryker disable BlockStatement: an empty catch reaches the identical invalid-document guard below.
  try {
    parsed = JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new ApjValidationError('invalid_json');
  }
  // Stryker restore BlockStatement

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ApjValidationError('invalid_json');
  }

  return parsed as ApjDocument;
};

const validateDocument = (
  document: ApjDocument,
  fileName: string,
  fileSize: number,
  sha256: string
): FirmwareArtifactMetadata => {
  if (document.magic !== APJ_MAGIC) {
    throw new ApjValidationError('invalid_magic');
  }

  const boardId = requiredPositiveInteger(document, 'board_id');
  if (boardId !== AXIOLIGHT_BOARD_ID) {
    throw new ApjValidationError('wrong_board');
  }

  const firmwareSize = requiredPositiveInteger(document, 'image_size');
  const maximumSize = requiredPositiveInteger(document, 'image_maxsize');
  if (firmwareSize > maximumSize) {
    throw new ApjValidationError('image_too_large');
  }

  requiredString(document, 'image');
  return {
    boardId,
    boardName: requiredString(document, 'summary'),
    fileName,
    fileSize,
    firmwareSize,
    gitHash: requiredString(document, 'git_identity'),
    sha256,
    version: requiredString(document, 'version'),
  };
};

export const parseApjData = async (
  fileName: string,
  data: ArrayBuffer
): Promise<PreparedFirmwareArtifact> => {
  if (!fileName.toLowerCase().endsWith('.apj')) {
    throw new ApjValidationError('extension');
  }

  if (data.byteLength === 0) {
    throw new ApjValidationError('empty');
  }

  if (data.byteLength > MAX_APJ_FILE_SIZE) {
    throw new ApjValidationError('file_too_large');
  }

  const sha256 = toHex(await crypto.subtle.digest('SHA-256', data));
  const document = parseDocument(data);
  return {
    image: Base64.fromUint8Array(new Uint8Array(data)),
    metadata: validateDocument(document, fileName, data.byteLength, sha256),
  };
};

export const parseApjFile = async (
  file: Pick<File, 'name' | 'arrayBuffer'>
): Promise<PreparedFirmwareArtifact> =>
  parseApjData(file.name, await file.arrayBuffer());
