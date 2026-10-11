// Web checkout on the ad-funnel paywall is off unless EXPO_PUBLIC_WEB_CHECKOUT=1 and a
// checkout URL is set. Local to the paywall so it ships without the shared flags table.
let override: boolean | null = null;

export const WEB_CHECKOUT_URL = process.env.EXPO_PUBLIC_WEB_CHECKOUT_URL ?? '';

export function webCheckoutEnabled(): boolean {
  if (override !== null) return override;
  return process.env.EXPO_PUBLIC_WEB_CHECKOUT === '1' && WEB_CHECKOUT_URL !== '';
}

export function setWebCheckoutOverride(value: boolean | null): void {
  override = value;
}
