import { expect, test as base } from '@playwright/test';

import { ControlApp } from './control-app';

type ControlFixtures = {
  control: ControlApp;
  browserErrors: string[];
};

export const test = base.extend<ControlFixtures>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(message.text());
        }
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
    },
    { auto: true },
  ],

  control: async ({ page, request }, use) => {
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        await route.continue();
      } else {
        await route.abort('blockedbyclient');
      }
    });

    const control = new ControlApp(page, request);
    await control.reset();
    await control.open();
    await use(control);
  },
});

export { expect };
