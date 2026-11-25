---
name: caesar-swift
description: "Use when writing, reviewing or migrating Swift: value types, protocols and generics, Swift 6 concurrency and data-race safety, actors and tasks, API design, ARC and retain cycles, performance, and testing with Swift Testing."
---

# Swift

## Model with values
Prefer `struct` and `enum` with associated values. Make illegal states unrepresentable: an enum with a case per state beats a struct of optionals. Use a class only for identity, shared mutable state, or Objective-C interop. Keep types small and immutable (`let`) unless mutation is the point.

## Protocols and generics
- `some Protocol` when one concrete type is returned or passed; `any Protocol` only when the type genuinely varies at run time (it costs an existential box).
- Constrain generics with the least protocol that works; use `where` clauses for relationships. Reach for protocol extensions for shared behaviour, not inheritance.
- Name for use at the call site: `remove(at:)`, `contains(_:)`. Methods read as phrases; mutating ones as verbs, non-mutating as nouns or `-ed/-ing` forms.

## Concurrency (Swift 6)
- Data-race safety is checked by the compiler. Types crossing isolation must be `Sendable`: value types of Sendable parts, actors, or classes that are `final` with immutable state.
- Annotate UI-facing types `@MainActor`. Everything else: state lives in an `actor` or is passed by value.
- Use `async let` for a fixed number of parallel calls, `TaskGroup` for a dynamic number. Structured concurrency (child tasks) before `Task { }`; an unstructured task needs an owner that cancels it.
- Check `Task.checkCancellation()` or `Task.isCancelled` in long loops. `await` marks a suspension point: state may change across it, so re-check invariants after.
- Do not block with semaphores or `DispatchQueue.sync` on async code. Bridge callbacks with `withCheckedThrowingContinuation` and resume exactly once.
- `nonisolated` for pure functions on an actor; mark `@concurrent` work that must leave the caller's actor.

## Memory
ARC counts references. A closure stored on `self` that captures `self` is a cycle: capture `[weak self]` (and guard) or restructure so the closure does not outlive the owner. Delegates are `weak`. `unowned` only when the lifetime is provably equal. Find leaks with the Memory Graph and Instruments, not by reading.

## Errors and optionals
Throw typed, meaningful errors and let them propagate; `try?` hides information, so use it only when absence is the whole story. No force unwraps except in tests or for compile-time constants. `guard` for early exit, `if let` for scoped use.

## Performance
Measure first (Instruments, `os_signpost`). Avoid work in `body` of SwiftUI views; keep view state granular (`@Observable`) so only what changed re-renders. Prefer value semantics with copy-on-write collections; `reserveCapacity` when size is known; avoid `Array.contains` in loops over large data (use a `Set`).

## Testing
Swift Testing: `@Test` functions, `#expect(a == b)`, `#require` for preconditions, parameterised tests with `arguments:`, `@Suite` for grouping, traits like `.tags` and `.timeLimit`. Test async code with `async` tests and confirmations for events. Exit tests cover `precondition` and `fatalError` paths. Tests are deterministic: inject clocks and randomness.

## Review checklist
Sendable crossings; retain cycles; force unwraps; blocking calls on the main actor; unowned tasks; public API naming; missing cancellation; tests for the failure path.
