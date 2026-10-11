/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const { TextDecoder, TextEncoder } = require('util');
const mock = require('../../src/analysis/fixtures/snatch-mock.json');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function encode(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

let coach;
const $ = (id) => document.getElementById(id);
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeAll(async () => {
  global.TextDecoder = global.TextDecoder || TextDecoder;
  global.TextEncoder = global.TextEncoder || TextEncoder;
  jest.spyOn(console, 'info').mockImplementation(() => {});
  document.documentElement.innerHTML = html.replace(/<script src="coach.js"><\/script>/, '');
  const env = { athlete: 'Alex', sharedAt: '2026-10-11T08:00:00.000Z', includeCue: true, analysis: mock };
  window.history.replaceState(null, '', `/web/coach/?l=7f3a#d=${encode(env)}`);
  jest.useFakeTimers();
  coach = require('./coach');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush();
});

afterAll(() => {
  jest.useRealTimers();
});

describe('coach link page', () => {
  it('renders the shared lift from the link payload', () => {
    expect($('app').hidden).toBe(false);
    expect($('error').hidden).toBe(true);
    expect($('shared-by').textContent).toBe('Alex');
    expect($('shared-at').textContent).toBe('Sun 11 Oct');
    expect($('cue-label').textContent).toBe('Catchline suggested · AI estimate · clear on all 3 reps');
    expect($('cue-text').textContent).toBe('Stay over the bar longer');
    expect(document.querySelectorAll('#measurements .row')).toHaveLength(6);
    expect(document.querySelectorAll('#stage img')).toHaveLength(6);
    expect($('readout').textContent).toBe('0.25× · setup · 388');
  });

  it('steps the slow-mo key frames and pauses on tap', () => {
    jest.advanceTimersByTime(700);
    expect($('readout').textContent).toBe('0.25× · 1st pull · 412');
    $('stage').click();
    expect($('play-state').textContent).toBe('Tap to play');
    jest.advanceTimersByTime(2100);
    expect($('readout').textContent).toBe('0.25× · 1st pull · 412');
  });

  it('overrides the cue and confirms what the athlete sees', async () => {
    $('override').click();
    expect($('backdrop').hidden).toBe(false);
    expect($('sheet-override').hidden).toBe(false);
    $('sheet-override').querySelector('button[type=submit]').click();
    expect($('override-error').textContent).toBe('Add your name so they know who it is from.');
    const agree = Array.from(document.querySelectorAll('#quick-cues .chip')).find((b) => b.textContent === 'Agree with the app');
    agree.click();
    expect($('override-text').value).toBe('Stay over the bar longer');
    $('override-text').value = 'Sit back into the start, chest up.';
    $('override-name').value = 'Coach Dani';
    $('sheet-override').querySelector('button[type=submit]').click();
    await flush();
    expect(coach.sent[coach.sent.length - 1]).toEqual({
      kind: 'override',
      linkId: '7f3a',
      analysisId: 'snatch-mock',
      coachName: 'Coach Dani',
      text: 'Sit back into the start, chest up.',
    });
    expect($('sheet-sent').hidden).toBe(false);
    expect($('sent-text').textContent).toBe('Alex sees it as "From your coach" in place of the app\'s cue.');
  });

  it('asks for a refilm with the coach name remembered', async () => {
    document.querySelector('[data-close]').click();
    expect($('backdrop').hidden).toBe(true);
    $('refilm').click();
    expect($('refilm-name').value).toBe('Coach Dani');
    Array.from(document.querySelectorAll('#refilm-reasons .chip')).find((b) => b.textContent === 'Film side-on').click();
    $('sheet-refilm').querySelector('button[type=submit]').click();
    await flush();
    expect(coach.sent[coach.sent.length - 1]).toEqual({
      kind: 'refilm',
      linkId: '7f3a',
      analysisId: 'snatch-mock',
      coachName: 'Coach Dani',
      reasons: ['Film side-on'],
    });
    expect($('sent-text').textContent).toBe('Alex gets a request to film another set.');
  });
});
