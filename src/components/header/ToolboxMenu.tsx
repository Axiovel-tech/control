import Build from '@mui/icons-material/Build';
import HelpOutline from '@mui/icons-material/HelpOutline';
import Tune from '@mui/icons-material/Tune';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu, { type MenuProps } from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { connect } from 'react-redux';

import { showFirmwareUpdateDialog } from '~/features/firmware-update/actions';
import { showMapCachingDialog } from '~/features/map-caching/slice';
import { showParameterUploadDialog } from '~/features/parameters/actions';
import { JOB_TYPE as PARAMETER_UPLOAD_JOB_TYPE } from '~/features/parameters/constants';
import { isDeveloperModeEnabled } from '~/features/session/selectors';
import { getRunningUploadJobType } from '~/features/upload/selectors';
import MapCloudOff from '~/icons/MapCloudOff';
import type { RootState } from '~/store/reducers';

import { isHelpAvailable, showHelp } from '~/utils/help';
import ToolboxDevMenuItems from './ToolboxDevMenuItems';

type ToolboxMenuPresentationProps = Readonly<{
  devMode: boolean;
  firmwareUpdateRunning: boolean;
  runningUploadJobType?: string;
  requestClose: () => void;
  showFirmwareUpdateDialog: () => void;
  showMapCachingDialog: () => void;
  showParameterUploadDialog: () => void;
}> &
  MenuProps;

const ToolboxMenuPresentation = ({
  devMode,
  firmwareUpdateRunning,
  runningUploadJobType,
  showFirmwareUpdateDialog,
  showMapCachingDialog,
  showParameterUploadDialog,
  requestClose,
  ...rest
}: ToolboxMenuPresentationProps): React.JSX.Element => {
  const { t } = useTranslation();

  const createClickListener = (func: () => void) => (): void => {
    requestClose();
    func();
  };

  return (
    <Menu {...rest}>
      <MenuItem
        data-testid='toolbox.flight-firmware-update'
        onClick={createClickListener(showFirmwareUpdateDialog)}
      >
        <ListItemIcon>
          <Build />
        </ListItemIcon>
        <ListItemText
          primary={t('toolbox.firmwareUpdate')}
          secondary={firmwareUpdateRunning && t('toolbox.uploadInProgress')}
        />
      </MenuItem>
      <MenuItem onClick={createClickListener(showMapCachingDialog)}>
        <ListItemIcon>
          <MapCloudOff />
        </ListItemIcon>
        <ListItemText primary={t('toolbox.offlineMaps')} />
      </MenuItem>
      <MenuItem onClick={createClickListener(showParameterUploadDialog)}>
        <ListItemIcon>
          <Tune />
        </ListItemIcon>
        <ListItemText
          primary={t('toolbox.paramUpload')}
          secondary={
            runningUploadJobType === PARAMETER_UPLOAD_JOB_TYPE &&
            t('toolbox.uploadInProgress')
          }
        />
      </MenuItem>
      {isHelpAvailable && <Divider />}
      {isHelpAvailable && (
        <MenuItem onClick={createClickListener(showHelp)}>
          <ListItemIcon>
            <HelpOutline />
          </ListItemIcon>
          <ListItemText primary={t('help')} />
        </MenuItem>
      )}
      {devMode && (
        <ToolboxDevMenuItems createClickListener={createClickListener} />
      )}
    </Menu>
  );
};

export default connect(
  // mapStateToProps
  (state: RootState) => ({
    devMode: isDeveloperModeEnabled(state),
    firmwareUpdateRunning: state.firmwareUpdate.running,
    runningUploadJobType: getRunningUploadJobType(state),
  }),
  // mapDispatchToProps
  {
    showFirmwareUpdateDialog,
    showMapCachingDialog,
    showParameterUploadDialog,
  }
)(ToolboxMenuPresentation);
