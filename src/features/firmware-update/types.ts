export const AXIOLIGHT_BOARD_ID = 1177;

export type FirmwareArtifactMetadata = {
  boardId: number;
  boardName: string;
  fileName: string;
  fileSize: number;
  firmwareSize: number;
  gitHash: string;
  sha256: string;
  version: string;
};

export type PreparedFirmwareArtifact = {
  image: string;
  metadata: FirmwareArtifactMetadata;
};

export type FirmwareSafetyFacts = {
  connected?: boolean;
  disarmed?: boolean;
  onGround?: boolean;
  powerSufficient?: boolean;
};

export type FirmwareUpdateError = {
  code: string;
  detail?: string;
};

export type FirmwareUpdateTarget = {
  compatible: boolean;
  currentHash?: string;
  currentVersion?: string;
  error?: FirmwareUpdateError;
  id: string;
  label?: string;
  safety: FirmwareSafetyFacts;
};

export const SERVER_PHASES = [
  'validating',
  'staging',
  'committing',
  'rebooting',
  'reconnecting',
  'verifyingInstalled',
  'complete',
] as const;

export type FirmwareServerPhase = (typeof SERVER_PHASES)[number];
export type FirmwareJobStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'indeterminate';

export type FirmwareUpdateJob = {
  bytesTotal?: number;
  bytesTransferred?: number;
  cancellable: boolean;
  committed: boolean;
  error?: FirmwareUpdateError;
  expectedHash?: string;
  expectedVersion?: string;
  id: string;
  observedHash?: string;
  observedVersion?: string;
  operationId: string;
  phase: FirmwareServerPhase;
  status: FirmwareJobStatus;
};

export type FirmwareRunPhase = FirmwareServerPhase | 'queued';

export type FirmwareUpdateRun = Omit<
  FirmwareUpdateJob,
  'operationId' | 'phase'
> & {
  operationId?: string;
  phase: FirmwareRunPhase;
};
