import { foundingState, getFoundingSeats, localSeats, remoteSeats, seatsLeftLabel, setSeatsSource } from './seats';
import { OFFERING, packageIdFor, periodFromProductId } from './products';
import { foundingSeats } from '../../lib/api';

jest.mock('../../lib/api', () => ({ ...jest.requireActual('../../lib/api'), foundingSeats: jest.fn() }));
const mockFoundingSeats = foundingSeats as jest.Mock;

describe('founding seats', () => {
  afterEach(() => setSeatsSource(localSeats));

  it('with the backend on, reads the founding_seats RPC', async () => {
    mockFoundingSeats.mockResolvedValueOnce({ taken: 12, cap: 500 });
    expect(await getFoundingSeats()).toEqual({ total: 500, remaining: 488 });
  });

  it('never reports fewer than 0 seats left', async () => {
    mockFoundingSeats.mockResolvedValueOnce({ taken: 503, cap: 500 });
    expect(await remoteSeats.getFoundingSeats()).toEqual({ total: 500, remaining: 0 });
  });

  it('the local stub (fixture mode) reports 137 of 500', async () => {
    setSeatsSource(localSeats);
    expect(await getFoundingSeats()).toEqual({ total: 500, remaining: 137 });
  });

  it('reads through the swappable source', async () => {
    setSeatsSource({ getFoundingSeats: async () => ({ total: 500, remaining: 41 }) });
    expect(await getFoundingSeats()).toEqual({ total: 500, remaining: 41 });
  });

  it('is low under 10% and sold out at 0', () => {
    expect(foundingState({ total: 500, remaining: 137 })).toBe('open');
    expect(foundingState({ total: 500, remaining: 50 })).toBe('open');
    expect(foundingState({ total: 500, remaining: 49 })).toBe('low');
    expect(foundingState({ total: 500, remaining: 1 })).toBe('low');
    expect(foundingState({ total: 500, remaining: 0 })).toBe('soldOut');
  });

  it('labels the seats left', () => {
    expect(seatsLeftLabel({ total: 500, remaining: 137 })).toBe('137 of 500 left');
  });
});

describe('products', () => {
  it('Catchline Pro is the Pull packages of the default offering; Founding is its own', () => {
    expect(OFFERING).toBe('default');
    expect(packageIdFor({ kind: 'pro', period: 'monthly' })).toBe('pull_monthly');
    expect(packageIdFor({ kind: 'pro', period: 'annual' })).toBe('pull_annual');
    expect(packageIdFor({ kind: 'founding' })).toBe('founding');
  });

  it('period from product id', () => {
    expect(periodFromProductId('catchline_pull_annual')).toBe('annual');
    expect(periodFromProductId('catchline_pull:monthly')).toBe('monthly');
    expect(periodFromProductId('catchline_hook_monthly')).toBe('monthly');
    expect(periodFromProductId('catchline_founding_lifetime')).toBeNull();
  });
});
