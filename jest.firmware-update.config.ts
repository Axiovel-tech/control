import type { Config } from 'jest';

import base from './jest.config';

const config: Config = {
  ...base,
  collectCoverage: false,
  testMatch: ['<rootDir>/test/firmware-update/**/*.[jt]s?(x)'],
};

export default config;
