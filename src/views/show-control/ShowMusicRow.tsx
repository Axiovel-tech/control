import Stop from '@mui/icons-material/Stop';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { connect } from 'react-redux';

import { StatusLight, Tooltip } from '@skybrush/mui-components';

import { Status } from '~/components/semantics';
import {
  setShowMusicOffset,
  stopShowMusic,
} from '~/features/show-audio/actions';
import {
  getServerTrackOfLoadedShow,
  getShowAudioName,
  getShowAudioServerStatus,
  getShowAudioSyncState,
} from '~/features/show-audio/selectors';
import {
  type ShowAudioStatus,
  type ShowAudioSyncState,
  type ShowAudioTrack,
} from '~/features/show-audio/types';
import { applyOffsetDraft, canStopMusic } from '~/features/show-audio/utils';
import { hasLoadedShowFile } from '~/features/show/selectors';
import type { RootState } from '~/store/reducers';
import { formatDuration } from '~/utils/formatting';

type Props = Readonly<{
  hasShow: boolean;
  musicName?: string;
  server?: ShowAudioStatus;
  serverTrackOfShow?: ShowAudioTrack;
  sync: ShowAudioSyncState;
  onSetOffset: (offsetMs: number) => Promise<boolean>;
  onStop: () => void;
}>;

function describeStatus(
  { hasShow, musicName, server, serverTrackOfShow, sync }: Props,
  t: TFunction
): [Status, string] {
  switch (sync.status) {
    case 'checking':
      return [Status.WAITING, t('show.music.checking')];
    case 'uploading':
      return [
        Status.WAITING,
        t('show.music.uploading', {
          percent: Math.round(sync.progress * 100),
        }),
      ];
    case 'error':
      return [Status.ERROR, t('show.music.syncFailed', { error: sync.error })];
    default:
      break;
  }

  if (!server) {
    return [Status.OFF, t('show.music.unavailable')];
  }

  const mismatch =
    hasShow &&
    (musicName === undefined ? server.track !== null : !serverTrackOfShow);
  if (mismatch) {
    return [Status.ERROR, t('show.music.mismatch')];
  }

  switch (server.state) {
    case 'armed':
      return [Status.WARNING, t('show.music.armed')];
    case 'playing':
      return [Status.SUCCESS, t('show.music.playing')];
    case 'finished':
      return [Status.OFF, t('show.music.finished')];
    case 'stopped':
      return [Status.WARNING, t('show.music.stopped')];
    case 'error':
      return [
        Status.ERROR,
        t('show.music.playerError', { error: server.error ?? '' }),
      ];
    default:
      return server.track
        ? [Status.SUCCESS, t('show.music.ready')]
        : [Status.OFF, t('show.music.idle')];
  }
}

function describeTrack(
  { hasShow, musicName, server, serverTrackOfShow }: Props,
  t: TFunction
): string {
  const track = hasShow ? serverTrackOfShow : server?.track;
  if (track) {
    return t('show.music.track', {
      name: track.name,
      duration: formatDuration(track.duration),
    });
  }

  if (musicName !== undefined) {
    return musicName;
  }

  return hasShow ? t('show.music.noneInShow') : t('show.music.none');
}

type OffsetFieldProps = Readonly<{
  disabled: boolean;
  label: string;
  value: number;
  onCommit: (value: number) => Promise<boolean>;
}>;

const OffsetField = ({
  disabled,
  label,
  value,
  onCommit,
}: OffsetFieldProps) => {
  const [draft, setDraft] = useState(String(value));
  const confirmed = useRef(value);

  useEffect(() => {
    confirmed.current = value;
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    void applyOffsetDraft(draft, () => confirmed.current, onCommit).then(
      setDraft
    );
  };

  return (
    <TextField
      data-testid='show-control.music-offset'
      disabled={disabled}
      label={label}
      size='small'
      sx={{ width: 88 }}
      type='number'
      value={draft}
      variant='standard'
      slotProps={{
        input: {
          endAdornment: <InputAdornment position='end'>ms</InputAdornment>,
        },
      }}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
        }
      }}
    />
  );
};

/**
 * Compact row that shows the music of the loaded show and the state of the
 * music player of the server, with the playback offset and an abort button.
 */
const ShowMusicRow = (props: Props) => {
  const { server, onSetOffset, onStop } = props;
  const { t } = useTranslation();
  const [status, detail] = describeStatus(props, t);

  return (
    <ListItem
      data-testid='show-control.music'
      secondaryAction={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <OffsetField
            disabled={!server}
            label={t('show.music.offset')}
            value={server?.offsetMs ?? 0}
            onCommit={onSetOffset}
          />
          <Tooltip content={t('show.music.stop')}>
            <span>
              <IconButton
                aria-label={t('show.music.stop')}
                disabled={!canStopMusic(server)}
                edge='end'
                onClick={onStop}
              >
                <Stop />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      }
      sx={{ paddingRight: 20 }}
    >
      <StatusLight status={status} />
      <ListItemText primary={describeTrack(props, t)} secondary={detail} />
    </ListItem>
  );
};

export default connect(
  // mapStateToProps
  (state: RootState) => ({
    hasShow: hasLoadedShowFile(state),
    musicName: getShowAudioName(state),
    server: getShowAudioServerStatus(state),
    serverTrackOfShow: getServerTrackOfLoadedShow(state),
    sync: getShowAudioSyncState(state),
  }),
  // mapDispatchToProps
  {
    onSetOffset: setShowMusicOffset,
    onStop: stopShowMusic,
  }
)(ShowMusicRow);
