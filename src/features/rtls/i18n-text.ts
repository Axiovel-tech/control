/**
 * @file A translatable text. The pure helpers of this feature return these
 * rather than strings, so components translate them with `t(key, values)`
 * and the strings live in the resources (see AGENTS.md, I18n).
 */

/** An i18n resource key and its interpolation values. */
export type I18nText = {
  key: string;
  values?: Record<string, number | string>;
};
