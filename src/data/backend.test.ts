import { recordConsent } from '../lib/api';
import { useOnboarding } from '../features/onboarding/store';
import { resetConsentSync, syncConsent } from './backend';

jest.mock('../lib/api', () => ({ ensureSession: jest.fn(async () => undefined), recordConsent: jest.fn(async () => undefined) }));

it('records only the upload consent, never a training consent', async () => {
  resetConsentSync();
  useOnboarding.getState().acceptConsent(new Date('2026-10-23T09:00:00Z'));
  await syncConsent();
  expect((recordConsent as jest.Mock).mock.calls).toEqual([['upload_privacy', '1', true]]);
});
