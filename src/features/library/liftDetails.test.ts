import { addLiftTag, cleanTag, detailsOf, forgetLiftDetails, matchesSearch, removeLiftTag, setLiftDetails, tagSuggestions, useLiftDetails, TAGS_MAX } from './liftDetails';
import { forgetLiftName, useLiftNames } from './liftNames';
import { forgetLocalData } from '../you/account';

beforeEach(() => {
  useLiftDetails.setState({ details: {} });
  useLiftNames.setState({ shapes: {} });
});

describe('lift details', () => {
  it('keeps a name, tags and a note per lift, and nothing for a lift with none', () => {
    expect(detailsOf(useLiftDetails.getState().details, 'l1')).toEqual({ name: '', tags: [], note: '' });
    setLiftDetails('l1', { name: 'Opener' });
    setLiftDetails('l1', { note: 'Felt fast' });
    expect(useLiftDetails.getState().details).toEqual({ l1: { name: 'Opener', tags: [], note: 'Felt fast' } });
    setLiftDetails('l1', { name: '', note: '  ' });
    expect(useLiftDetails.getState().details).toEqual({});
  });

  it('cleans a tag and adds it once, whatever its capitals', () => {
    expect(cleanTag(' #Heavy   single ')).toBe('Heavy single');
    expect(cleanTag('# ')).toBeNull();
    expect(cleanTag('a'.repeat(30))).toBe('a'.repeat(24));
    expect(addLiftTag('l1', '#PR')).toBe(true);
    expect(addLiftTag('l1', 'pr')).toBe(false);
    expect(addLiftTag('l1', '  ')).toBe(false);
    expect(addLiftTag('l1', 'comp prep')).toBe(true);
    expect(useLiftDetails.getState().details.l1.tags).toEqual(['PR', 'comp prep']);
    removeLiftTag('l1', 'PR');
    expect(useLiftDetails.getState().details.l1.tags).toEqual(['comp prep']);
    removeLiftTag('l1', 'comp prep');
    expect(useLiftDetails.getState().details).toEqual({});
  });

  it(`stops at ${TAGS_MAX} tags on one lift`, () => {
    for (let i = 0; i < TAGS_MAX; i++) expect(addLiftTag('l1', `t${i}`)).toBe(true);
    expect(addLiftTag('l1', 'one more')).toBe(false);
    expect(useLiftDetails.getState().details.l1.tags).toHaveLength(8);
  });

  it('suggests tags from other lifts, most used first, without the ones this lift has', () => {
    useLiftDetails.setState({
      details: {
        a: { name: '', tags: ['pr', 'heavy'], note: '' },
        b: { name: '', tags: ['heavy', 'comp'], note: '' },
        c: { name: '', tags: ['Heavy', 'belt'], note: '' },
        me: { name: '', tags: ['PR', 'solo'], note: '' },
      },
    });
    expect(tagSuggestions(useLiftDetails.getState().details, 'me')).toEqual(['heavy', 'belt', 'comp']);
    expect(tagSuggestions(useLiftDetails.getState().details, 'me', 'be')).toEqual(['belt']);
    expect(tagSuggestions(useLiftDetails.getState().details, 'new')).toEqual(['heavy', 'pr', 'belt', 'comp', 'solo']);
    expect(tagSuggestions({}, 'me')).toEqual([]);
  });

  it('matches a search when every word is somewhere in the fields', () => {
    const fields = ['Opener', 'Snatch', 'pr', 'comp prep', 'Felt fast off the floor', '62.5 kg', null, undefined];
    expect(matchesSearch('', fields)).toBe(true);
    expect(matchesSearch('  ', fields)).toBe(true);
    expect(matchesSearch('snatch', fields)).toBe(true);
    expect(matchesSearch('OPEN 62.5', fields)).toBe(true);
    expect(matchesSearch('fast floor comp', fields)).toBe(true);
    expect(matchesSearch('snatch 70', fields)).toBe(false);
    expect(matchesSearch('jerk', fields)).toBe(false);
  });

  it('goes with the lift when it is deleted', () => {
    useLiftNames.setState({ shapes: { l1: 'floor-overhead', l2: 'floor-shoulders' } });
    setLiftDetails('l1', { name: 'Opener', tags: ['pr'], note: 'n' });
    setLiftDetails('l2', { name: 'Second' });
    forgetLiftName('l1');
    expect(useLiftDetails.getState().details).toEqual({ l2: { name: 'Second', tags: [], note: '' } });
    expect(useLiftNames.getState().shapes).toEqual({ l2: 'floor-shoulders' });
    forgetLiftDetails('l2');
    expect(useLiftDetails.getState().details).toEqual({});
  });

  it('goes when the lifter erases what this phone holds', () => {
    setLiftDetails('l1', { name: 'Opener', tags: ['pr'], note: 'n' });
    forgetLocalData();
    expect(useLiftDetails.getState().details).toEqual({});
  });
});
