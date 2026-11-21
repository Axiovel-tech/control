import { describe, expect, test } from '@jest/globals';
import i18next from 'i18next';

import en from '../../src/i18n/en.json';

describe('lock text with dates and server text', () => {
  test('is not HTML-escaped (React escapes it)', async () => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: 'en', resources: { en: { translation: en } } });

    expect(
      i18n.t('rtlsAnchorLock.dialog.lockedSince', { time: '11/21/2026' })
    ).toBe('The anchors are locked since 11/21/2026.');
    expect(
      i18n.t('rtlsAnchorLock.break', {
        time: '14:02',
        text: 'RTLS anchor A2 "rebooted"',
      })
    ).toBe('14:02 · RTLS anchor A2 "rebooted"');
    expect(
      i18n.t('rtlsAnchorLock.preflight.authorizationRefused', {
        reason: 'the anchors are not locked; lock them in Control',
      })
    ).toBe(
      'The server refuses a new authorization: the anchors are not locked; lock them in Control'
    );
    expect(i18n.t('rtlsOta.species.mismatch.anchor')).toBe(
      'This is an anchor image but the device is a tag: the device would not rejoin WiFi'
    );
  });
});
