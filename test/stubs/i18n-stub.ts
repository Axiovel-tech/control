/**
 * Jest stand-in for `~/i18n`: the real module initializes i18next with a
 * top-level `await`, which the CommonJS transform the test suite runs under
 * cannot represent. Translation lookups just echo the key.
 */

type TranslateFn = (key: string) => string;

export const enabledLanguages: Array<{ code: string; label: string }> = [];

export type PreparedI18nKey = (t: TranslateFn) => string;

export const tt =
  (key: string): PreparedI18nKey =>
  (t: TranslateFn) =>
    t(key);

const i18n = {
  language: 'en',
  t: (key: string): string => key,
};

export default i18n;
