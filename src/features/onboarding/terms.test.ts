import { readFileSync } from 'fs';
import { join } from 'path';

// #251: the terms a new user accepts on the welcome screen describe the app in front of them (4.0)
const terms = readFileSync(join(__dirname, '../../../docs/legal/terms.html'), 'utf8');

describe('docs/legal/terms.html', () => {
  it('no longer describes the 3.x app', () => {
    for (const old of ['one technique cue', 'first three videos', 'deleted from our servers after analysis', 'Pull plan', 'send a lift to a coach']) {
      expect(terms).not.toContain(old);
    }
  });

  it('describes tracking on the phone, the weekly free video, Pro, the founding lifetime and the invite reward', () => {
    expect(terms).toContain('The tracking runs entirely on your phone.');
    expect(terms).toContain('The app never uploads your video');
    expect(terms).toContain('The free plan tracks 1 video a week.');
    expect(terms).toContain('Catchline Pro tracks unlimited videos.');
    expect(terms).toContain('The founding lifetime is a one-time purchase');
    expect(terms).toContain('you both get a month of Catchline Pro');
    expect(terms).toContain('Catchline is not coaching and not medical advice.');
  });

  it('keeps the operator, governing law and contact as they were', () => {
    expect(terms).toContain('Operator: Yash Gadodia, Singapore.');
    expect(terms).toContain('These terms are governed by the laws of Singapore, and the courts of Singapore have exclusive jurisdiction over any dispute, unless the consumer law where you live gives you rights that override this.');
    expect(terms).toContain('<p>Yash Gadodia, Singapore<br><a href="mailto:pirsquare.yash+catchline@gmail.com">pirsquare.yash+catchline@gmail.com</a></p>');
  });
});
