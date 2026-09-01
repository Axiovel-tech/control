import Build from '@mui/icons-material/Build';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';

import { DraggableDialog } from '@skybrush/mui-components';

import { isConnected } from '~/features/servers/selectors';
import { type AppDispatch } from '~/store/reducers';
import { formatData } from '~/utils/formatting';

import {
  cancelCurrentFirmwareUpdate,
  hideFirmwareUpdateDialog,
  prepareFirmwareArtifact,
  reconcileFirmwareUpdates,
  rejectFirmwareArtifact,
  runFirmwareUpdateSequence,
  startNewFirmwareUpdate,
} from './actions';
import { ApjValidationError, parseApjFile } from './apj';
import FirmwareRunList from './FirmwareRunList';
import FirmwareTargetList from './FirmwareTargetList';
import FirmwareUpdateConfirmation from './FirmwareUpdateConfirmation';
import {
  canCancelCurrentFirmwareUpdate,
  canStartFirmwareUpdate,
  getFirmwareUpdateState,
  getOrderedFirmwareRuns,
  getSelectedFirmwareTargets,
  isFirmwareUpdateDialogOpen,
} from './selectors';
import { setFirmwareTargetSelected, setFirmwareUpdateConfirmed } from './slice';
import type {
  FirmwareArtifactMetadata,
  FirmwareUpdateRun,
  FirmwareUpdateTarget,
} from './types';

type FilePickerProps = {
  error?: string;
  reading: boolean;
  onFile: (file: File) => void;
};

const FirmwareFilePicker = ({ error, onFile, reading }: FilePickerProps) => {
  const { t } = useTranslation();
  return (
    <>
      <Button
        component='label'
        disabled={reading}
        sx={{ width: '100%', minHeight: 96 }}
      >
        <input
          hidden
          type='file'
          accept='.apj,application/json'
          data-testid='flight-firmware-update.file'
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onFile(file);
            }
            event.target.value = '';
          }}
        />
        <Box sx={{ textAlign: 'center' }}>
          <Build sx={{ fontSize: 48 }} />
          <Typography>
            {reading
              ? t('flightFirmwareUpdate.file.reading')
              : t('flightFirmwareUpdate.file.select')}
          </Typography>
        </Box>
      </Button>
      {error ? (
        <Alert severity='error' sx={{ mt: 1 }}>
          {t(`flightFirmwareUpdate.file.error.${error}`)}
        </Alert>
      ) : null}
    </>
  );
};

const FirmwareArtifactSummary = ({
  artifact,
}: {
  artifact: FirmwareArtifactMetadata;
}) => {
  const { t } = useTranslation();
  return (
    <Paper variant='outlined' sx={{ mt: 2, p: 2 }}>
      <Typography variant='subtitle1'>{artifact.fileName}</Typography>
      <Typography variant='body2'>
        {t('flightFirmwareUpdate.file.summary', {
          board: artifact.boardName,
          boardId: artifact.boardId,
          version: artifact.version,
          hash: artifact.gitHash,
          size: formatData(artifact.fileSize),
        })}
      </Typography>
      <Typography variant='caption' sx={{ wordBreak: 'break-all' }}>
        {t('flightFirmwareUpdate.file.sha256', {
          sha256: artifact.sha256,
        })}
      </Typography>
    </Paper>
  );
};

type SelectionProps = {
  artifact?: FirmwareArtifactMetadata;
  confirmed: boolean;
  fileError?: string;
  loadingTargets: boolean;
  readingFile: boolean;
  selectedIds: string[];
  selectedTargets: FirmwareUpdateTarget[];
  targetError?: string;
  targets: FirmwareUpdateTarget[];
  onConfirmed: (confirmed: boolean) => void;
  onFile: (file: File) => void;
  onTargetSelected: (id: string, selected: boolean) => void;
};

const FirmwareSelection = (props: SelectionProps) => {
  const { t } = useTranslation();
  const { artifact, selectedTargets } = props;
  return (
    <>
      <Typography variant='body2' sx={{ mb: 2 }}>
        {t('flightFirmwareUpdate.introduction')}
      </Typography>
      <FirmwareFilePicker
        error={props.fileError}
        reading={props.readingFile}
        onFile={props.onFile}
      />
      {artifact ? (
        <>
          <FirmwareArtifactSummary artifact={artifact} />
          <Divider sx={{ my: 2 }} />
          <Typography variant='subtitle1'>
            {t('flightFirmwareUpdate.targets.title')}
          </Typography>
          <FirmwareTargetList
            error={props.targetError}
            loading={props.loadingTargets}
            selectedIds={props.selectedIds}
            targets={props.targets}
            onSelected={props.onTargetSelected}
          />
        </>
      ) : null}
      {artifact && selectedTargets.length > 0 ? (
        <FirmwareUpdateConfirmation
          artifact={artifact}
          confirmed={props.confirmed}
          targets={selectedTargets}
          onConfirmed={props.onConfirmed}
        />
      ) : null}
    </>
  );
};

const FirmwareProgress = ({
  running,
  runs,
}: {
  running: boolean;
  runs: FirmwareUpdateRun[];
}) => {
  const { t } = useTranslation();
  return (
    <>
      <Alert severity='info' sx={{ mb: 2 }}>
        {running
          ? t('flightFirmwareUpdate.progress.running')
          : t('flightFirmwareUpdate.progress.finished')}
      </Alert>
      <FirmwareRunList runs={runs} />
    </>
  );
};

type FirmwareActionsProps = {
  canCancel: boolean;
  canStart: boolean;
  running: boolean;
  showProgress: boolean;
  onCancel: () => void;
  onClose: () => void;
  onNewUpdate: () => void;
  onStart: () => void;
};

const shouldShowNewUpdate = ({
  running,
  showProgress,
}: Pick<FirmwareActionsProps, 'running' | 'showProgress'>): boolean =>
  showProgress && !running;

const FirmwareActions = (props: FirmwareActionsProps) => {
  const { t } = useTranslation();
  return (
    <DialogActions>
      {shouldShowNewUpdate(props) ? (
        <Button onClick={props.onNewUpdate}>
          {t('flightFirmwareUpdate.action.newUpdate')}
        </Button>
      ) : null}
      {props.canCancel ? (
        <Button
          color='warning'
          data-testid='flight-firmware-update.cancel'
          onClick={props.onCancel}
        >
          {t('flightFirmwareUpdate.action.cancelBeforeCommit')}
        </Button>
      ) : null}
      <Box sx={{ flex: 1 }} />
      <Button onClick={props.onClose}>{t('general.action.close')}</Button>
      {!props.showProgress ? (
        <Button
          variant='contained'
          disabled={!props.canStart}
          data-testid='flight-firmware-update.start'
          onClick={props.onStart}
        >
          {t('flightFirmwareUpdate.action.start')}
        </Button>
      ) : null}
    </DialogActions>
  );
};

const useReconnectReconciliation = (
  connected: boolean,
  dispatch: AppDispatch,
  runCount: number
) => {
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnected.current && runCount > 0) {
      void dispatch(reconcileFirmwareUpdates());
    }
    wasConnected.current = connected;
  }, [connected, dispatch, runCount, wasConnected]);
};

const useFirmwareFileReader = (dispatch: AppDispatch) => {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();
  const read = useCallback(
    async (file: File) => {
      setReading(true);
      setError(undefined);
      try {
        dispatch(prepareFirmwareArtifact(await parseApjFile(file)));
      } catch (reason) {
        dispatch(rejectFirmwareArtifact());
        setError(
          reason instanceof ApjValidationError ? reason.code : 'read_failed'
        );
      } finally {
        setReading(false);
      }
    },
    [dispatch]
  );
  return { error, read, reading };
};

const FirmwareUpdateSetupDialog = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const open = useSelector(isFirmwareUpdateDialogOpen);
  const connected = useSelector(isConnected);
  const state = useSelector(getFirmwareUpdateState);
  const selectedTargets = useSelector(getSelectedFirmwareTargets);
  const runs = useSelector(getOrderedFirmwareRuns);
  const canStart = useSelector(canStartFirmwareUpdate);
  const canCancel = useSelector(canCancelCurrentFirmwareUpdate);
  const file = useFirmwareFileReader(dispatch);
  useReconnectReconciliation(connected, dispatch, state.order.length);

  const showProgress = state.running || runs.length > 0;
  const close = () => dispatch(hideFirmwareUpdateDialog());
  return (
    <DraggableDialog
      fullWidth
      open={open}
      maxWidth='md'
      slotProps={{
        paper: { 'data-testid': 'flight-firmware-update.dialog' },
      }}
      title={t('flightFirmwareUpdate.title')}
      onClose={close}
    >
      <DialogContent>
        {showProgress ? (
          <FirmwareProgress running={state.running} runs={runs} />
        ) : (
          <FirmwareSelection
            artifact={state.artifact}
            confirmed={state.confirmed}
            fileError={file.error}
            loadingTargets={state.loadingTargets}
            readingFile={file.reading}
            selectedIds={state.selectedIds}
            selectedTargets={selectedTargets}
            targetError={state.targetError}
            targets={state.targets}
            onConfirmed={(confirmed) =>
              dispatch(setFirmwareUpdateConfirmed(confirmed))
            }
            onFile={(selectedFile) => void file.read(selectedFile)}
            onTargetSelected={(id, selected) =>
              dispatch(setFirmwareTargetSelected({ id, selected }))
            }
          />
        )}
      </DialogContent>
      <FirmwareActions
        canCancel={canCancel}
        canStart={canStart}
        running={state.running}
        showProgress={showProgress}
        onCancel={() => void dispatch(cancelCurrentFirmwareUpdate())}
        onClose={close}
        onNewUpdate={() => dispatch(startNewFirmwareUpdate())}
        onStart={() => void dispatch(runFirmwareUpdateSequence())}
      />
    </DraggableDialog>
  );
};

export default FirmwareUpdateSetupDialog;
