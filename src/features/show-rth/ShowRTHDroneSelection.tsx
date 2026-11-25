import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import {
  toggleShowRTHSelection,
  type ShowRTHRow,
  type ShowRTHSelection,
} from './selection';

type Props = {
  disabled?: boolean;
  onChange: (selection: ShowRTHSelection) => void;
  rows: ShowRTHRow[];
  selection: ShowRTHSelection;
};

const ShowRTHDroneSelection = ({
  disabled = false,
  onChange,
  rows,
  selection,
}: Props) => {
  const { t } = useTranslation();
  const { returnAll, selected } = selection;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <FormControlLabel
        control={
          <Switch
            checked={returnAll}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...selection, returnAll: event.target.checked })
            }
          />
        }
        label={t('showRTHDialog.returnAll')}
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          maxHeight: 320,
          overflowY: 'auto',
        }}
      >
        {rows.map(({ id, hasPlan }) => (
          <FormControlLabel
            key={id}
            control={
              <Checkbox
                checked={hasPlan && (returnAll || selected.includes(id))}
                disabled={disabled || returnAll || !hasPlan}
                size='small'
                onChange={() =>
                  onChange({
                    ...selection,
                    selected: toggleShowRTHSelection(selected, id),
                  })
                }
              />
            }
            label={
              hasPlan ? (
                id
              ) : (
                <Typography variant='body2' color='textSecondary'>
                  {t('showRTHDialog.noPlan', { id })}
                </Typography>
              )
            }
          />
        ))}
      </Box>
    </Box>
  );
};

export default ShowRTHDroneSelection;
