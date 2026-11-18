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
  batteryVoltage?: number;
  connected?: boolean;
  disarmed?: boolean;
  minimumBatteryVoltage?: number;
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
  /** Condition the operator must accept before the server starts the update. */
  warning?: FirmwareUpdateError;
};

export const LOW_BATTERY_WARNING = 'batteryLow';

export const hasLowBatteryWarning = (target: FirmwareUpdateTarget): boolean =>
  target.warning?.code === LOW_BATTERY_WARNING;

export const formatVoltage = (
  value: number | undefined,
  unknown: string
): string => (value === undefined ? unknown : value.toFixed(2));

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
