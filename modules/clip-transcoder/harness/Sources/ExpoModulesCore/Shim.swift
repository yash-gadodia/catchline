// Just enough of ExpoModulesCore for the app's ClipTranscoderModule.swift to compile on macOS unchanged, so the
// harness runs the same probe and transcode code as the phone. Functions are kept by name for main.swift to call.
import Foundation

public protocol Record { init() }

@propertyWrapper public struct Field<T> {
  public var wrappedValue: T
  public init(wrappedValue: T) { self.wrappedValue = wrappedValue }
}

open class Exception: LocalizedError, @unchecked Sendable {
  public init() {}
  open var reason: String { "exception" }
  public var errorDescription: String? { reason }
}

open class GenericException<P>: Exception, @unchecked Sendable {
  public let param: P
  public init(_ param: P) { self.param = param }
}

public struct Definition {
  let name: String?
  let function: Any?
}

public final class ModuleDefinition {
  public private(set) var functions: [String: Any] = [:]
  init(_ parts: [Definition]) {
    for p in parts { if let n = p.name, let f = p.function { functions[n] = f } }
  }
}

@resultBuilder public enum ModuleDefinitionBuilder {
  public static func buildBlock(_ parts: Definition...) -> ModuleDefinition { ModuleDefinition(parts) }
}

public protocol AnyModule {
  @ModuleDefinitionBuilder func definition() -> ModuleDefinition
}

open class BaseModule {
  public var onEvent: (String, [String: Any?]) -> Void = { _, _ in }
  public init() {}
  public func sendEvent(_ name: String, _ body: [String: Any?] = [:]) { onEvent(name, body) }
}

public typealias Module = BaseModule & AnyModule

public func Name(_ name: String) -> Definition { Definition(name: nil, function: nil) }
public func Events(_ names: String...) -> Definition { Definition(name: nil, function: nil) }
public func AsyncFunction<A, R>(_ name: String, _ body: @escaping (A) async throws -> R) -> Definition {
  Definition(name: name, function: body)
}
public func AsyncFunction<A, B, R>(_ name: String, _ body: @escaping (A, B) async throws -> R) -> Definition {
  Definition(name: name, function: body)
}
