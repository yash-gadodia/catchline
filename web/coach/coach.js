(function (root) {
  'use strict';

  var ASSET_DIRS = { 'snatch-real': 'analysis' };
  var DEFAULT_SRC = '../../src/analysis/fixtures/snatch-mock.json';
  var DEFAULT_ASSETS = '../../assets';
  var STEP_MS = 700;

  var PHASES = {
    setup: 'Setup', first_pull: '1st pull', transition: 'Transition', second_pull: '2nd pull',
    turnover: 'Turnover', catch: 'Catch', recovery: 'Recovery', hang: 'Hang', arch: 'Arch',
    hollow: 'Hollow', hip_drive: 'Hip drive', support: 'Support', lockout: 'Lockout', tuck: 'Tuck',
    drive: 'Drive', press: 'Press'
  };
  var MOVEMENTS = {
    snatch: 'Snatch', clean: 'Clean', jerk: 'Jerk', kipping_pull_up: 'Kipping pull-up',
    bar_muscle_up: 'Bar muscle-up', kipping_hspu: 'Kipping HSPU'
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function fmt(n) {
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
  }

  function lowerFirst(s) {
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  function dateLabel(iso) {
    var d = new Date(iso);
    return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  }

  // A link carries either a bare Analysis or { athlete, sharedAt, includeCue, analysis }.
  function normalise(raw) {
    var env = raw && raw.analysis ? raw : { analysis: raw };
    var a = env.analysis;
    if (!a || a.version !== 1 || !Array.isArray(a.reps) || a.reps.length === 0) {
      throw new Error('Not a Catchline analysis');
    }
    return {
      athlete: env.athlete || 'Your athlete',
      sharedAt: env.sharedAt || null,
      includeCue: env.includeCue !== false,
      analysis: a
    };
  }

  function decodeHash(hash) {
    var m = /(?:^#|&)d=([^&]+)/.exec(hash || '');
    if (!m) return null;
    var b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    var text = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    var bytes = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function resolveImage(image, assetBase) {
    if (!image) return null;
    if (image.indexOf('asset:') !== 0) return image;
    var id = image.slice('asset:'.length);
    var set = id.split('/')[0];
    return assetBase + '/' + (ASSET_DIRS[set] || 'frames') + '/' + id + '.jpg';
  }

  function repByIndex(a, index) {
    for (var i = 0; i < a.reps.length; i++) if (a.reps[i].index === index) return a.reps[i];
    return a.reps[0];
  }

  function pointAt(path, frame) {
    if (path.length === 0) return null;
    if (frame <= path[0].frame) return { x: path[0].x, y: path[0].y };
    var last = path[path.length - 1];
    if (frame >= last.frame) return { x: last.x, y: last.y };
    for (var i = 1; i < path.length; i++) {
      var b = path[i];
      if (frame <= b.frame) {
        var p = path[i - 1];
        var t = (frame - p.frame) / (b.frame - p.frame);
        return { x: p.x + (b.x - p.x) * t, y: p.y + (b.y - p.y) * t };
      }
    }
    return { x: last.x, y: last.y };
  }

  function pathUpTo(path, frame) {
    var head = path.filter(function (p) { return p.frame < frame; });
    var end = pointAt(path, frame);
    if (!end || frame < path[0].frame) return head;
    return head.concat([{ frame: frame, x: end.x, y: end.y }]);
  }

  // Floor to the catch: the drop and stand-up retrace the same column.
  function liftEnd(rep) {
    for (var i = 0; i < rep.keyFrames.length; i++) if (rep.keyFrames[i].phase === 'catch') return rep.keyFrames[i].frame;
    return rep.endFrame;
  }

  function coverFit(src, box, focus) {
    var scale = Math.max(box.width / src.width, box.height / src.height);
    var w = src.width * scale;
    var h = src.height * scale;
    return { x: (box.width - w) * focus.x, y: (box.height - h) * focus.y, width: w, height: h };
  }

  function svgPath(points, fit) {
    return points
      .map(function (p, i) {
        return (i === 0 ? 'M' : 'L') + (fit.x + p.x * fit.width).toFixed(1) + ' ' + (fit.y + p.y * fit.height).toFixed(1);
      })
      .join(' ');
  }

  function keyframes(a) {
    var rep = repByIndex(a, a.cue ? a.cue.evidence.rep : a.bestRepIndex);
    var end = liftEnd(rep);
    return {
      rep: rep,
      frames: rep.keyFrames.filter(function (k) { return k.frame <= end; })
    };
  }

  function progressOf(rep, frame) {
    var span = rep.endFrame - rep.startFrame;
    return span <= 0 ? 0 : Math.min(1, Math.max(0, (frame - rep.startFrame) / span));
  }

  function cueLabel(cue) {
    return 'Catchline suggested · AI estimate · ' + lowerFirst(cue.confidenceText);
  }

  function measurementRows(a) {
    return a.measurements
      .filter(function (m) { return m.status !== 'not_seen' && m.id !== 'bar_speed'; })
      .map(function (m) {
        var v = fmt(m.value) + ' ' + m.unit;
        if (m.best != null) v += ' · best ' + fmt(m.best);
        return { id: m.id, label: m.label, value: v, cue: m.status === 'cue' };
      });
  }

  function title(a) {
    var parts = [MOVEMENTS[a.movement] || a.movement];
    if (a.loadKg != null) parts.push(fmt(a.loadKg) + ' kg');
    return parts.join(' · ');
  }

  var QUICK_CUES = ['Slow off the floor', 'Finish the pull', 'Stay over the bar longer', 'Sit back into the start'];
  var REFILM_REASONS = ['Film side-on', 'Whole bar in frame', 'Better light', 'Another set, same weight'];

  function buildPayload(kind, linkId, fields) {
    var text = (fields.text || '').trim();
    var coach = (fields.coachName || '').trim();
    if (!coach) return { ok: false, error: 'Add your name so they know who it is from.' };
    if (kind === 'override' && !text) return { ok: false, error: 'Write the cue you want them to try.' };
    if (kind === 'note' && !text) return { ok: false, error: 'Write a note first.' };
    if (kind === 'refilm' && !(fields.reasons && fields.reasons.length)) return { ok: false, error: 'Pick what to change.' };
    if (kind !== 'refilm' && text.length > 4000) return { ok: false, error: 'That is too long to send. Keep it under 4,000 characters.' };
    var body = { kind: kind, linkId: linkId, analysisId: fields.analysisId, coachName: coach };
    if (kind === 'refilm') body.reasons = fields.reasons.slice();
    else body.text = text;
    return { ok: true, body: body };
  }

  // TODO(phase-3): POST to the coach-link endpoint. Until then the page keeps
  // the submission in memory and logs it so the flow can be exercised.
  var sent = [];
  function submit(body) {
    sent.push(body);
    if (root.console) root.console.info('[coach stub] submit', body);
    return Promise.resolve({ ok: true });
  }

  var api = {
    normalise: normalise,
    decodeHash: decodeHash,
    resolveImage: resolveImage,
    pathUpTo: pathUpTo,
    pointAt: pointAt,
    coverFit: coverFit,
    svgPath: svgPath,
    keyframes: keyframes,
    progressOf: progressOf,
    cueLabel: cueLabel,
    measurementRows: measurementRows,
    title: title,
    dateLabel: dateLabel,
    phaseLabel: function (p) { return PHASES[p] || p; },
    buildPayload: buildPayload,
    submit: submit,
    sent: sent,
    QUICK_CUES: QUICK_CUES,
    REFILM_REASONS: REFILM_REASONS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CoachLink = api;

  if (typeof document === 'undefined') return;

  // ---- DOM ----

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  var SVG = 'http://www.w3.org/2000/svg';

  function load() {
    var params = new URLSearchParams(root.location.search);
    var assets = params.get('assets') || DEFAULT_ASSETS;
    var linkId = params.get('l') || '7f3a';
    var fromHash = null;
    try {
      fromHash = decodeHash(root.location.hash);
    } catch (e) {
      return showError();
    }
    var source = fromHash
      ? Promise.resolve(fromHash)
      : fetch(params.get('src') || DEFAULT_SRC).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        });
    source
      .then(function (raw) {
        var env = normalise(raw);
        if (params.get('name')) env.athlete = params.get('name');
        render(env, assets, linkId);
      })
      .catch(showError);
  }

  function showError(err) {
    if (err) root.console.error('[coach] could not show this lift', err);
    $('app').hidden = true;
    $('error').hidden = false;
  }

  function render(env, assets, linkId) {
    var a = env.analysis;
    document.title = 'Catchline · ' + env.athlete + "'s " + title(a).toLowerCase();
    $('shared-by').textContent = env.athlete;
    $('shared-at').textContent = env.sharedAt ? dateLabel(env.sharedAt) : '';
    $('lift-title').textContent = title(a);

    if (env.includeCue && a.cue) {
      $('cue-label').textContent = cueLabel(a.cue);
      $('cue-text').textContent = a.cue.text;
      $('cue-why').textContent = a.cue.why;
    } else {
      $('cue').hidden = true;
      $('override').textContent = 'Give a cue';
    }

    var list = $('measurements');
    measurementRows(a).forEach(function (r) {
      var row = el('div', 'row');
      row.appendChild(el('span', 'row-label', r.label));
      row.appendChild(el('span', 'row-value', r.value + (r.cue ? ' · the cue' : '')));
      list.appendChild(row);
    });

    player(a, assets);
    sheets(env, linkId);
    $('app').hidden = false;
  }

  function player(a, assets) {
    var kf = keyframes(a);
    var stage = $('stage');
    var imgs = kf.frames.map(function (k) {
      var img = el('img');
      img.alt = '';
      img.src = resolveImage(k.image, assets);
      stage.insertBefore(img, $('overlay'));
      return img;
    });
    var i = 0;
    var playing = true;
    var timer = null;
    var src = { width: a.video.width, height: a.video.height };

    function draw() {
      var box = { width: stage.clientWidth, height: stage.clientHeight };
      var fit = coverFit(src, box, { x: 0.5, y: 0.45 });
      var k = kf.frames[i];
      imgs.forEach(function (img, n) {
        img.style.opacity = n === i ? '1' : '0';
        img.style.left = fit.x + 'px';
        img.style.top = fit.y + 'px';
        img.style.width = fit.width + 'px';
        img.style.height = fit.height + 'px';
      });
      var svg = $('overlay');
      svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
      var pts = pathUpTo(kf.rep.path, k.frame);
      var d = svgPath(pts, fit);
      $('path-halo').setAttribute('d', d);
      $('path').setAttribute('d', d);
      var end = pts[pts.length - 1];
      var dot = $('dot');
      if (end) {
        dot.setAttribute('cx', (fit.x + end.x * fit.width).toFixed(1));
        dot.setAttribute('cy', (fit.y + end.y * fit.height).toFixed(1));
      }
      $('progress').style.width = Math.round(progressOf(kf.rep, k.frame) * 100) + '%';
      $('readout').textContent = '0.25× · ' + api.phaseLabel(k.phase).toLowerCase() + ' · ' + k.frame;
    }

    function tick() {
      i = (i + 1) % kf.frames.length;
      draw();
    }

    function setPlaying(p) {
      playing = p;
      if (timer) clearInterval(timer);
      timer = p ? setInterval(tick, STEP_MS) : null;
      $('play-state').textContent = p ? 'Tap to pause' : 'Tap to play';
    }

    stage.addEventListener('click', function () { setPlaying(!playing); });
    root.addEventListener('resize', draw);
    var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    draw();
    setPlaying(!reduce);
  }

  function sheets(env, linkId) {
    var a = env.analysis;
    var backdrop = $('backdrop');
    var name = '';

    function open(id) {
      backdrop.hidden = false;
      ['sheet-override', 'sheet-note', 'sheet-refilm', 'sheet-sent'].forEach(function (s) { $(s).hidden = s !== id; });
    }
    function close() { backdrop.hidden = true; }
    function sentMessage(text) {
      $('sent-text').textContent = text;
      open('sheet-sent');
    }

    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', close); });
    Array.prototype.forEach.call(document.querySelectorAll('.athlete'), function (n) { n.textContent = env.athlete; });

    $('override').addEventListener('click', function () { open('sheet-override'); $('override-text').focus(); });
    $('add-note').addEventListener('click', function () { open('sheet-note'); $('note-text').focus(); });
    $('refilm').addEventListener('click', function () { open('sheet-refilm'); });

    var quick = $('quick-cues');
    var chips = (a.cue ? ['Agree with the app'] : []).concat(QUICK_CUES.filter(function (q) { return !a.cue || q !== a.cue.text; }));
    chips.forEach(function (q) {
      var b = el('button', 'chip', q);
      b.type = 'button';
      b.addEventListener('click', function () {
        $('override-text').value = q === 'Agree with the app' ? a.cue.text : q;
      });
      quick.appendChild(b);
    });

    var reasons = [];
    var reasonBox = $('refilm-reasons');
    REFILM_REASONS.forEach(function (r) {
      var b = el('button', 'chip', r);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        var on = reasons.indexOf(r) === -1;
        reasons = on ? reasons.concat([r]) : reasons.filter(function (x) { return x !== r; });
        b.setAttribute('aria-pressed', String(on));
      });
      reasonBox.appendChild(b);
    });

    function wire(kind, formId, nameId, errorId, fields, done) {
      $(formId).addEventListener('submit', function (e) {
        e.preventDefault();
        name = $(nameId).value || name;
        var res = buildPayload(kind, linkId, Object.assign({ analysisId: a.id, coachName: name }, fields()));
        if (!res.ok) {
          $(errorId).textContent = res.error;
          return;
        }
        $(errorId).textContent = '';
        ['override-name', 'note-name', 'refilm-name'].forEach(function (id) { if (!$(id).value) $(id).value = name; });
        submit(res.body).then(function () { sentMessage(done(res.body)); });
      });
    }

    wire('override', 'sheet-override', 'override-name', 'override-error',
      function () { return { text: $('override-text').value }; },
      function () { return env.athlete + ' sees it as "From your coach" in place of the app\'s cue.'; });
    wire('note', 'sheet-note', 'note-name', 'note-error',
      function () { return { text: $('note-text').value }; },
      function () { return 'Your note is on ' + env.athlete + "'s lift."; });
    wire('refilm', 'sheet-refilm', 'refilm-name', 'refilm-error',
      function () { return { reasons: reasons }; },
      function () { return env.athlete + ' gets a request to film another set.'; });
  }

  document.addEventListener('DOMContentLoaded', load);
})(typeof window !== 'undefined' ? window : globalThis);
