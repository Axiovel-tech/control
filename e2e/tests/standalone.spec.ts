import { expect, test } from '../support/fixtures';

test('renders deterministic RTLS inventory without browser errors', async ({
  control,
  browserErrors,
}) => {
  await control.openRtlsTags();

  await expect(control.device('199')).toContainText('tag-alpha');
  await expect(control.device('199')).toContainText('drone drone-1');
  await expect(control.device('199')).toContainText('20.0 Hz');
  expect(browserErrors).toEqual([]);
});

test('opens parameters through the real client message path', async ({
  control,
}) => {
  await control.openRtlsTags();
  await control.openParameters('199');

  await expect(
    control.page.getByText('UWB_ROLE', { exact: true })
  ).toBeVisible();
  await expect(
    control.page.getByRole('row', { name: /WIFI_SSID/ }).getByRole('textbox')
  ).toHaveValue('fixture-network');

  await expect
    .poll(async () =>
      (await control.fixtureRequests()).filter(
        ({ body }) => body.type === 'X-RTLS-PARAM-LIST' && body.id === '199'
      )
    )
    .toHaveLength(1);
});
