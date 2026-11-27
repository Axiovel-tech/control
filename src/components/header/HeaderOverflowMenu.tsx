import MoreHoriz from '@mui/icons-material/MoreHoriz';
import Popover from '@mui/material/Popover';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { GenericHeaderButton } from '@skybrush/mui-components';

type HeaderOverflowMenuProps = Readonly<{
  /**
   * The header groups, rendered a second time. The stylesheet shows in the
   * menu exactly the widgets that it hid from the header at the current
   * window width.
   */
  children: React.ReactNode;
}>;

/**
 * Button at the end of the header that gives access to the widgets that do
 * not fit in a narrow window.
 */
const HeaderOverflowMenu = ({ children }: HeaderOverflowMenuProps) => {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | undefined>();

  return (
    <div className='ax-header-group ax-header-overflow'>
      <GenericHeaderButton
        tooltip={t('header.more')}
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          setAnchor(event.currentTarget);
        }}
      >
        <MoreHoriz />
      </GenericHeaderButton>
      <Popover
        anchorEl={anchor}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        open={anchor !== undefined}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        onClose={() => {
          setAnchor(undefined);
        }}
      >
        <div className='ax-header-overflow-panel'>{children}</div>
      </Popover>
    </div>
  );
};

export default HeaderOverflowMenu;
