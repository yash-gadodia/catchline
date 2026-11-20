import { forgetLiftName, kindIdOf, kindsOf, liftKind, ownKinds, rememberLiftShape, setLiftKind, useLiftNames } from './liftNames';
import * as compare from '../analysis/compare';
import { forgetLocalData } from '../you/account';

const lift = {} as compare.TrackedLift;

beforeEach(() => useLiftNames.setState({ shapes: {} }));

describe('lift names', () => {
  it('names a lift by the shape read from its bar path, once', () => {
    const shape = jest.spyOn(compare, 'liftShape').mockReturnValue('floor-overhead');
    rememberLiftShape('l1', lift);
    rememberLiftShape('l1', lift);
    expect(shape).toHaveBeenCalledTimes(1);
    expect(liftKind(useLiftNames.getState().shapes, 'l1')).toBe('Snatch');
    shape.mockReturnValue('floor-overhead-jerk');
    rememberLiftShape('l2', lift);
    expect(liftKind(useLiftNames.getState().shapes, 'l2')).toBe('Clean and jerk');
  });

  it('gives no name where the shape could be several lifts, or was not read', () => {
    jest.spyOn(compare, 'liftShape').mockReturnValue('rack-shoulders');
    rememberLiftShape('l1', lift);
    expect(liftKind(useLiftNames.getState().shapes, 'l1')).toBeNull();
    jest.spyOn(compare, 'liftShape').mockReturnValue(null);
    rememberLiftShape('l2', lift);
    expect(useLiftNames.getState().shapes.l2).toBeUndefined();
    expect(liftKind(useLiftNames.getState().shapes, 'nope')).toBeNull();
  });

  it('lists the kinds among the lifts, the most common first', () => {
    const shapes = { a: 'floor-shoulders', b: 'floor-overhead', c: 'floor-overhead', d: 'rack-shoulders' };
    expect(kindsOf(shapes, ['a', 'b', 'c', 'd', 'e'])).toEqual(['Snatch', 'Clean']);
  });

  it('forgets the name with the lift', () => {
    useLiftNames.setState({ shapes: { l1: 'floor-overhead', l2: 'floor-shoulders' } });
    forgetLiftName('l1');
    expect(useLiftNames.getState().shapes).toEqual({ l2: 'floor-shoulders' });
  });
});

describe('the kind a lifter picks', () => {
  beforeEach(() => useLiftNames.setState({ shapes: {}, chosen: {} }));

  it('wins over what the app read, and clearing it gives the read kind back', () => {
    useLiftNames.setState({ shapes: { a: 'floor-overhead' } });
    setLiftKind('a', 'butterflyPullUp');
    const n = () => useLiftNames.getState();
    expect(liftKind(n().shapes, 'a', n().chosen)).toBe('Butterfly pull-up');
    setLiftKind('a', null);
    expect(liftKind(n().shapes, 'a', n().chosen)).toBe('Snatch');
  });

  it("keeps the lifter's own words, and reads a listed kind typed out as that kind", () => {
    setLiftKind('a', '  Ring   dip ');
    setLiftKind('b', 'ring dip'.replace('r', 'R'));
    setLiftKind('c', 'deadlift');
    const { chosen, shapes } = useLiftNames.getState();
    expect(chosen).toEqual({ a: 'Ring dip', b: 'Ring dip', c: 'deadlift' });
    expect(ownKinds(chosen)).toEqual(['Ring dip']);
    expect(kindsOf(shapes, ['a', 'b', 'c'], chosen)).toEqual(['Ring dip', 'Deadlift']);
    expect(kindIdOf({ shapes, chosen }, 'zzz')).toBeNull();
  });

  it('goes when the lift is deleted', () => {
    setLiftKind('a', 'squat');
    forgetLiftName('a');
    expect(useLiftNames.getState().chosen).toEqual({});
  });

  it('forgets the kinds the lifter typed when the phone is erased, so the next account is not offered them (#243)', () => {
    setLiftKind('a', 'Zzmarker');
    setLiftKind('b', 'squat');
    forgetLocalData();
    expect(useLiftNames.getState().chosen).toEqual({});
    expect(ownKinds(useLiftNames.getState().chosen)).toEqual([]);
  });
});
