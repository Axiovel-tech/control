/**
 * @file The tags panel's fleet-health pill and the popup it opens: every
 * drone in the color of its zone, one click away from its row.
 */

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { StatusPill } from '@skybrush/mui-components';

import {
  PopoverWithContainerFromContext as Popover,
  TooltipWithContainerFromContext as Tooltip,
} from '~/containerContext';
import { Status } from '~/components/semantics';
import {
  describeFleetHealth,
  getWorstFleetHealthMetric,
  summarizeFleetHealth,
} from '~/features/rtls/fleet-health';
import { getRtlsDeviceDisplayName } from '~/features/rtls/selectors';
import { type RtlsDevice, type RtlsDeviceStats } from '~/features/rtls/types';

/**
 * A drone's stats while its tag reports: an asleep or offline tag keeps its
 * last stats, which say nothing about the drone now, so it grades unknown.
 */
const currentStats = (
  device: RtlsDevice,
  stats: RtlsDeviceStats | undefined
): RtlsDeviceStats | undefined =>
  device.online && !device.sleeping ? stats : undefined;

type FleetHealthSummaryProps = {
  devices: RtlsDevice[];
  statsById: Record<string, RtlsDeviceStats | undefined>;
  /** Three anchors are enough to position: every surveyed one is planar. */
  planarSurvey?: boolean;
  /** Called with the device id of the drone picked in the popup. */
  onSelect: (id: string) => void;
};

const FleetHealthSummary = ({
  devices,
  statsById,
  planarSurvey = false,
  onSelect,
}: FleetHealthSummaryProps) => {
  const { t } = useTranslation();
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const summary = useMemo(
    () =>
      summarizeFleetHealth(
        devices.map((device) => currentStats(device, statsById[device.id])),
        planarSurvey
      ),
    [devices, planarSurvey, statsById]
  );
  // only computed while the popup is open
  const drones = useMemo(
    () =>
      anchorElement === null
        ? []
        : devices.map((device) => {
            const worst = getWorstFleetHealthMetric(
              describeFleetHealth(
                currentStats(device, statsById[device.id]),
                undefined,
                planarSurvey
              )
            );
            const name = getRtlsDeviceDisplayName(device);
            const absence = device.sleeping
              ? t('rtlsFleetHealth.popup.asleep')
              : device.online
                ? undefined
                : t('rtlsFleetHealth.popup.offline');
            return {
              id: device.id,
              // the drone's number, as on its row's drone pill; a tag on no
              // drone keeps its own name
              label:
                device.flightController?.systemId === undefined
                  ? name
                  : String(device.flightController.systemId),
              status: worst?.status ?? Status.OFF,
              tooltip: absence
                ? `${name} · ${absence}`
                : worst && worst.status !== Status.SUCCESS
                  ? `${name} · ${t(`rtlsFleetHealth.label.${worst.id}`)}`
                  : name,
            };
          }),
    [anchorElement, devices, planarSurvey, statsById, t]
  );

  return (
    <>
      <Tooltip
        content={t('rtlsFleetHealth.tooltip.summary')}
        disabled={anchorElement !== null}
      >
        <ButtonBase
          data-testid='rtls-tags-panel.health'
          sx={{ borderRadius: 1 }}
          onClick={(event) => setAnchorElement(event.currentTarget)}
        >
          <StatusPill inline status={summary.status}>
            {t(summary.text.key, summary.text.values)}
          </StatusPill>
        </ButtonBase>
      </Tooltip>
      <Popover
        open={anchorElement !== null}
        anchorEl={anchorElement}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        onClose={() => setAnchorElement(null)}
      >
        <Box
          data-testid='rtls-tags-panel.health-popup'
          sx={{ p: 1.5, maxWidth: 360 }}
        >
          <Typography variant='subtitle2' sx={{ mb: 1 }}>
            {t('rtlsFleetHealth.popup.title')}
          </Typography>
          {drones.length === 0 ? (
            <Typography variant='body2' color='textSecondary'>
              {t('rtlsFleetHealth.popup.empty')}
            </Typography>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
                gap: 0.5,
              }}
            >
              {drones.map(({ id, label, status, tooltip }) => (
                <Tooltip key={id} content={tooltip}>
                  <ButtonBase
                    data-testid={`rtls-tags-panel.health-drone-${id}`}
                    sx={{ borderRadius: 1 }}
                    onClick={() => {
                      setAnchorElement(null);
                      onSelect(id);
                    }}
                  >
                    <StatusPill inline status={status}>
                      {label}
                    </StatusPill>
                  </ButtonBase>
                </Tooltip>
              ))}
            </Box>
          )}
        </Box>
      </Popover>
    </>
  );
};

export default FleetHealthSummary;
