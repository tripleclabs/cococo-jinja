//
//  NSNumberJSONScalar.swift
//  CococoJinja
//
//  Copyright Triple C Labs GmbH
//
//  Duplicated from PulseApp/Core/NSNumberJSONScalar.swift during the CococoJinja extraction.
//  WorkflowKit extraction. The same logic exists in PulseApp; consolidate
//  into a shared package (PlatformCore or similar) in a future cleanup.
//

import Foundation

/// Distinguishes whether an `NSNumber` produced by JSON or YAML parsing
/// represents an actual boolean literal (`true` / `false`) or a numeric value
/// (integer / double).
///
/// **Why this exists.** Swift's `as? Bool` succeeds for *any* numeric
/// `NSNumber` — `NSNumber(value: 0) as? Bool` returns `Optional(false)` —
/// because NSNumber bridges to Bool through `boolValue`. Any `switch` over
/// `Any` that puts `case let b as Bool` before `case let n as NSNumber`
/// silently classifies integer 0/1 as a boolean, breaking parameter binding.
///
/// **How to use.** Match `case let n as NSNumber` *before* `case let b as Bool`
/// and call ``isBoolean(_:)`` to disambiguate. Use ``isFloatType(_:)`` to
/// split integer-valued doubles from genuine fractional values.
///
/// **Portability.** Both Darwin and swift-corelibs-foundation tag boolean
/// literals from `JSONSerialization` / `Yams` with `objCType` `"c"` (signed
/// char) or `"B"` (C++ bool); integers come through as `"q"` / `"i"`,
/// doubles as `"f"` / `"d"`.
enum NSNumberJSONScalar {
    /// True when `number` originated as a JSON / YAML boolean literal.
    static func isBoolean(_ number: NSNumber) -> Bool {
        let tag = String(cString: number.objCType)
        return tag == "c" || tag == "B"
    }

    /// True when `number` carries a fractional component — i.e. it was a
    /// genuine JSON / YAML float, not an integer rendered as a double.
    /// Returns false for whole-numbered doubles like `100.0`; those round-trip
    /// safely as `Int` and most callers prefer the integer classification.
    static func isFloatType(_ number: NSNumber) -> Bool {
        let doubleVal = number.doubleValue
        let intVal = number.intValue
        return doubleVal != Double(intVal)
    }
}
