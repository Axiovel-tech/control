import { expect, type APIRequestContext, type Page } from '@playwright/test';

export type FixtureRequest = {
  at: string;
  body: {
    type?: string;
    [key: string]: unknown;
  };
};

const isFixtureRequest = (value: unknown): value is FixtureRequest => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { at, body } = value as Record<string, unknown>;
  return (
    typeof at === 'string' &&
    typeof body === 'object' &&
    body !== null &&
    (!('type' in body) || typeof body.type === 'string')
  );
};

export class ControlApp {
  readonly page: Page;
  readonly request: APIRequestContext;
  readonly fixtureUrl: string;

  constructor(
    page: Page,
    request: APIRequestContext,
    fixtureUrl = 'http://127.0.0.1:15000'
  ) {
    this.page = page;
    this.request = request;
    this.fixtureUrl = fixtureUrl;
  }

  async reset(): Promise<void> {
    const response = await this.request.post(
      `${this.fixtureUrl}/__fixture/reset`
    );
    expect(response.ok()).toBe(true);
  }

  async open(): Promise<void> {
    await this.page.goto('/');
    await expect(this.page.locator('#root')).toBeVisible();
    await expect
      .poll(async () =>
        (await this.fixtureRequests()).some(
          ({ body }) => body.type === 'X-RTLS-INF'
        )
      )
      .toBe(true);
  }

  async openRtlsTags(): Promise<void> {
    await this.page
      .locator('#sidebar')
      .getByText('RTLS Tags', { exact: true })
      .click();
    await expect(this.page.getByTestId('rtls-tags-panel')).toBeVisible();
  }

  device(id: string) {
    return this.page.getByTestId(`rtls-device-${id}`);
  }

  async openParameters(id: string): Promise<void> {
    await this.device(id).getByTestId('rtls-device-parameters').click();
    await expect(
      this.page.getByRole('heading', {
        name: `Parameters of device ${id}`,
      })
    ).toBeVisible();
  }

  async fixtureRequests(): Promise<FixtureRequest[]> {
    const response = await this.request.get(
      `${this.fixtureUrl}/__fixture/requests`
    );
    expect(response.ok()).toBe(true);
    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.every(isFixtureRequest)) {
      throw new Error('Fixture server returned an invalid request log');
    }
    return data;
  }
}
