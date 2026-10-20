import Foundation

// cv/catchline_cv/lifter.py select_lifter, step for step, on PoseCoreMLCore's per-frame people.
// Output per frame: the lifter's 26 keypoints (NaN where not picked or a head point), scores (0) and box (NaN).

private let L_SHO = 5, R_SHO = 6, L_WRI = 9, R_WRI = 10, L_HIP = 11, R_HIP = 12
private let BODY = Array(5 ..< 17)
private let MAX_SHIFT = 0.15, WRIST_SHIFT = 0.1, HIP_SHIFT = 0.1, LOST_BAR = 15

struct LifterTrack {
  var kpts: [[Point]]   // n x 26
  var scores: [[Double]]  // n x 26
  var boxes: [Box]      // n x 4
}

private func pt(_ p: PosePerson, _ j: Int) -> Point { Point(Double(p.kpts[j * 2]), Double(p.kpts[j * 2 + 1])) }

private func finite(_ p: Point) -> Bool { p.x.isFinite && p.y.isFinite }

private func dist(_ a: Point, _ b: Point) -> Double { ((a - b) * (a - b)).sum().squareRoot() }

private func iouD(_ a: [Float], _ b: [Float]) -> Double {
  let x1 = Double(max(a[0], b[0])), y1 = Double(max(a[1], b[1]))
  let x2 = Double(min(a[2], b[2])), y2 = Double(min(a[3], b[3]))
  let inter = max(0, x2 - x1) * max(0, y2 - y1)
  let area = { (r: [Float]) in Double(r[2] - r[0]) * Double(r[3] - r[1]) }
  return inter / (area(a) + area(b) - inter + 1e-9)
}

private func median(_ v: [Double]) -> Double {
  let s = v.sorted()
  let n = s.count
  return n % 2 == 1 ? s[n / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

// median distance the body joints moved, in box heights (inf when fewer than 4 joints are finite)
private func shift(_ k0: PosePerson, _ k1: PosePerson, _ h: Double) -> Double {
  var d: [Double] = []
  for j in BODY {
    let v = dist(pt(k1, j), pt(k0, j))
    if v.isFinite { d.append(v) }
  }
  return d.count >= 4 ? median(d) / h : .infinity
}

private func handsUp(_ k: PosePerson) -> Bool {
  let sho = (pt(k, L_SHO) + pt(k, R_SHO)) / 2, hip = (pt(k, L_HIP) + pt(k, R_HIP)) / 2
  let wri = (pt(k, L_WRI) + pt(k, R_WRI)) / 2
  let t = dist(sho, hip)
  return t.isFinite && wri.y.isFinite && wri.y < sho.y - 0.3 * t
}

// the wrist with the smaller y (np.nanargmin: a NaN wrist loses to a finite one)
private func topWrist(_ k: PosePerson) -> Point {
  let l = pt(k, L_WRI), r = pt(k, R_WRI)
  if l.y.isNaN { return r }
  if r.y.isNaN { return l }
  return l.y <= r.y ? l : r
}

private func meanScore(_ p: PosePerson) -> Double {
  p.scores.reduce(0.0) { $0 + Double($1) } / 26
}

// The chain's running state: the last matched person, the bar wrist it is holding (hanging only)
// and how many frames since the last match.
struct LifterState {
  var prev: PosePerson
  var bar: Point?
  var gap = 0

  init(seed: PosePerson, hanging: Bool) {
    prev = seed
    bar = hanging && handsUp(seed) ? topWrist(seed) : nil
  }
}

// select_lifter's seed: the posed person with the largest box height x mean score; when hanging,
// hands-up people first (strict: only them, nil when none). Unposed people never seed.
func seedLifter(_ people: [[PosePerson]], hanging: Bool, strict: Bool = false) -> (frame: Int, index: Int)? {
  var seed: (Int, Int)?
  var best = -1.0
  for pref in (hanging ? (strict ? [true] : [true, false]) : [false]) {
    for (f, ps) in people.enumerated() {
      for (i, p) in ps.enumerated() where p.posed {
        if pref && !handsUp(p) { continue }
        let score = Double(p.box[3] - p.box[1]) * meanScore(p)
        if score > best { best = score; seed = (f, i) }
      }
    }
    if seed != nil { break }
  }
  return seed
}

// One step of select_lifter's chain over a frame's people: the cheapest candidate by box IoU, joint
// shift, hip shift and (hanging) the bar wrist, or nil when nobody qualifies (the gap grows).
@discardableResult
func lifterStep(_ st: inout LifterState, _ people: [PosePerson], hanging: Bool) -> PosePerson? {
  st.gap += 1
  let prev = st.prev
  let h = Double(prev.box[3] - prev.box[1])
  let g = Double(min(st.gap, 3))
  var cands: [(cost: Double, p: PosePerson, wb: Point?)] = []
  for p in people {
    let o = iouD(prev.box, p.box)
    var sh = shift(prev, p, h)
    if o < 0.3 || sh > MAX_SHIFT * g { continue }
    let hp = dist((pt(p, L_HIP) + pt(p, R_HIP)) / 2, (pt(prev, L_HIP) + pt(prev, R_HIP)) / 2) / h
    if hp > HIP_SHIFT * g { continue }
    var wb: Point?
    if let b = st.bar, st.gap <= LOST_BAR {
      let dl = dist(pt(p, L_WRI), b), dr = dist(pt(p, R_WRI), b)
      // np.nanmin(d, initial=inf): NaN ignored
      var dmin = Double.infinity, which = -1
      if dl.isFinite && dl < dmin { dmin = dl; which = 0 }
      if dr.isFinite && dr < dmin { dmin = dr; which = 1 }
      if !(dmin <= WRIST_SHIFT * g * h) { continue }
      wb = which == 0 ? pt(p, L_WRI) : pt(p, R_WRI)
      sh += dmin / h
    }
    let cost = (1 - o) + abs(log(Double(p.box[3] - p.box[1]) / h)) + 4 * sh
    cands.append((cost, p, wb))
  }
  guard let c = cands.min(by: { $0.cost < $1.cost }) else { return nil }
  st.prev = c.p
  st.gap = 0
  if hanging { st.bar = c.wb ?? (handsUp(c.p) ? topWrist(c.p) : nil) }
  return c.p
}

// Which detections to pose while the clip streams: everyone until a seed is found in the first
// `seedFrames` posed frames (hanging: until a hands-up person appears), then only the boxes that
// overlap the lifter's last box by IoU >= 0.3 (the chain's own first filter, so the chain sees every
// person it could have picked). Unposed people stay in the frame's list as boxes.
struct LifterFollower {
  let hanging: Bool
  let seedFrames: Int
  private(set) var state: LifterState?
  private var window: [[PosePerson]] = []

  init(hanging: Bool, seedFrames: Int) {
    self.hanging = hanging
    self.seedFrames = max(1, seedFrames)
  }

  var seeded: Bool { state != nil }

  func candidates(_ boxes: [[Float]]) -> [Int] {
    guard let st = state else { return Array(boxes.indices) }
    return boxes.indices.filter { iouD(st.prev.box, boxes[$0]) >= 0.3 }
  }

  mutating func observe(_ people: [PosePerson]) {
    if state != nil { lifterStep(&state!, people, hanging: hanging); return }
    window.append(people)
    guard window.count >= seedFrames, let (sf, si) = seedLifter(window, hanging: hanging, strict: hanging) else { return }
    var st = LifterState(seed: window[sf][si], hanging: hanging)
    for f in sf ..< window.count { lifterStep(&st, window[f], hanging: hanging) }
    state = st
    window = []
  }
}

func selectLifter(_ people: [[PosePerson]], hanging: Bool) -> LifterTrack {
  let n = people.count
  var track = LifterTrack(kpts: Array(repeating: Array(repeating: Point(.nan, .nan), count: 26), count: n),
                          scores: Array(repeating: Array(repeating: 0, count: 26), count: n),
                          boxes: Array(repeating: [.nan, .nan, .nan, .nan], count: n))
  guard let (sf, si) = seedLifter(people, hanging: hanging) else { return track }
  for direction in [Array(sf ..< n), Array((0 ..< sf).reversed())] {
    var st = LifterState(seed: people[sf][si], hanging: hanging)
    for f in direction {
      guard let p = lifterStep(&st, people[f], hanging: hanging) else { continue }
      track.kpts[f] = (0 ..< 26).map { pt(p, $0) }
      track.scores[f] = p.scores.map { Double($0) }
      track.boxes[f] = p.box.map { Double($0) }
    }
  }
  return track
}
