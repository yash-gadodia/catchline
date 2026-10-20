import Foundation
import zlib

// cv/catchline_cv/trace.py's file format, written from Swift: json.dumps of enc(...) (numpy arrays as
// {"$nd": [dtype, shape, flat]}, tuples as {"$t": [...]}, NaN as the bare token NaN, floats in Python's
// repr) and gzip with mtime 0. Values are Swift [String: Any] / [Any] / Double / Int / String / Bool / NSNull.

func nd(_ shape: [Int], _ flat: [Double]) -> [String: Any] {
  ["$nd": ["float64", shape, flat] as [Any]]
}

func tup(_ items: [Any]) -> [String: Any] {
  ["$t": items]
}

// Python float.__repr__: shortest round trip, ".0" on integral values, "nan", "inf", "1e-05"
func pyFloat(_ d: Double) -> String {
  if d.isNaN { return "NaN" }
  if d.isInfinite { return d < 0 ? "-Infinity" : "Infinity" }
  var s = "\(d)"
  if let e = s.firstIndex(where: { $0 == "e" || $0 == "E" }) {
    // Swift 1e-05 matches; 1e+16 matches; a one-digit exponent (not produced by Swift) would not
    var mant = String(s[..<e]), exp = String(s[s.index(after: e)...])
    if mant.hasSuffix(".0") { mant.removeLast(2) }
    let sign = exp.hasPrefix("-") ? "-" : "+"
    exp = exp.trimmingCharacters(in: CharacterSet(charactersIn: "+-"))
    if exp.count < 2 { exp = "0" + exp }
    s = "\(mant)e\(sign)\(exp)"
  }
  return s
}

private func escape(_ s: String) -> String {
  var out = "\""
  for u in s.unicodeScalars {
    switch u {
    case "\"": out += "\\\""
    case "\\": out += "\\\\"
    case "\n": out += "\\n"
    case "\r": out += "\\r"
    case "\t": out += "\\t"
    default:
      if u.value < 0x20 || u.value > 0x7e { out += String(format: "\\u%04x", u.value) } else { out.unicodeScalars.append(u) }
    }
  }
  return out + "\""
}

// json.dumps(o, sort_keys=True) with the given separators (Python's default (", ", ": "), compact (",", ":"))
func pyJSON(_ o: Any, itemSep: String = ",", keySep: String = ":") -> String {
  switch o {
  case let d as [String: Any]:
    let body = d.keys.sorted().map { "\(escape($0))\(keySep)\(pyJSON(d[$0]!, itemSep: itemSep, keySep: keySep))" }
    return "{" + body.joined(separator: itemSep) + "}"
  case let a as [Any]:
    return "[" + a.map { pyJSON($0, itemSep: itemSep, keySep: keySep) }.joined(separator: itemSep) + "]"
  case let a as [Double]:
    return "[" + a.map(pyFloat).joined(separator: itemSep) + "]"
  case let a as [Int]:
    return "[" + a.map(String.init).joined(separator: itemSep) + "]"
  case let b as Bool:
    return b ? "true" : "false"
  case let i as Int:
    return String(i)
  case let d as Double:
    return pyFloat(d)
  case let f as Float:
    return pyFloat(Double(f))
  case let s as String:
    return escape(s)
  case is NSNull:
    return "null"
  default:
    return "null"
  }
}

// trace.py key(): the replay key of a plate dict
func traceKey(_ o: Any) -> String {
  pyJSON(o, itemSep: ", ", keySep: ": ")
}

enum GzipError: Error { case deflate(Int32) }

// gzip.compress(data, mtime=0)
func gzipped(_ data: Data) throws -> Data {
  var stream = z_stream()
  var rc = deflateInit2_(&stream, Z_DEFAULT_COMPRESSION, Z_DEFLATED, 15 + 16, 8, Z_DEFAULT_STRATEGY, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size))
  guard rc == Z_OK else { throw GzipError.deflate(rc) }
  defer { deflateEnd(&stream) }
  var out = Data(count: Int(deflateBound(&stream, uLong(data.count))))
  let n = out.count
  try data.withUnsafeBytes { (inp: UnsafeRawBufferPointer) in
    try out.withUnsafeMutableBytes { (outp: UnsafeMutableRawBufferPointer) in
      stream.next_in = UnsafeMutablePointer(mutating: inp.bindMemory(to: Bytef.self).baseAddress)
      stream.avail_in = uInt(data.count)
      stream.next_out = outp.bindMemory(to: Bytef.self).baseAddress
      stream.avail_out = uInt(n)
      rc = deflate(&stream, Z_FINISH)
      guard rc == Z_STREAM_END else { throw GzipError.deflate(rc) }
    }
  }
  out.count = Int(stream.total_out)
  return out
}

func writeTrace(_ trace: [String: Any], to url: URL) throws {
  try gzipped(Data(pyJSON(trace).utf8)).write(to: url, options: .atomic)
}
