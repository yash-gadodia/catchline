import { forgetLiftName, kindsOf, liftKind, rememberLiftShape, useLiftNames } from './liftNames';
import * as compare from '../analysis/compare';

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
