import BusinessCenter from '@mui/icons-material/BusinessCenter';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { GenericHeaderButton } from '@skybrush/mui-components';

import ToolboxMenu from './ToolboxMenu';

const ToolboxButton = () => {
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const { t } = useTranslation();

  const handleClick = (event: React.SyntheticEvent<HTMLElement>) => {
    setAnchorElement(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorElement(null);
  };

  return (
    <>
      <GenericHeaderButton
        aria-controls='toolbox-menu'
        aria-haspopup='true'
        data-testid='header.toolbox'
        tooltip={t('toolbox.tooltip')}
        onClick={handleClick}
      >
        <BusinessCenter />
      </GenericHeaderButton>
      <ToolboxMenu
        id='toolbox-menu'
        anchorEl={anchorElement}
        open={Boolean(anchorElement)}
        requestClose={handleClose}
        onClose={handleClose}
      />
    </>
  );
};

export default ToolboxButton;
