import { useUsage } from './usageStore';

beforeEach(() => useUsage.getState().reset());

test('a free lifter takes the server lifetime count, net of bonus credits', () => {
  useUsage.setState({ usage: { lifetime: 4, month: '', thisMonth: 0 } });

  useUsage.getState().adopt({ plan: 'free', period: 'lifetime', cap: 3, used: 3, bonus: 1, remaining: 1 }, new Date('2026-10-19T09:00:00Z'));

  expect(useUsage.getState().usage).toEqual({ lifetime: 2, month: '', thisMonth: 0 });
});

test('a monthly plan takes this month from the server and keeps the higher lifetime', () => {
  useUsage.setState({ usage: { lifetime: 12, month: '2026-09', thisMonth: 7 } });

  useUsage.getState().adopt({ plan: 'pull', period: 'month', cap: 1000, used: 5, bonus: 0, remaining: 995 }, new Date('2026-10-19T09:00:00Z'));

  expect(useUsage.getState().usage).toEqual({ lifetime: 12, month: '2026-10', thisMonth: 5 });
});
