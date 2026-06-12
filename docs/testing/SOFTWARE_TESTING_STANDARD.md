# TBM Tap Beat Machine — Software Testing Standard

## 1. Test Structure Convention

### File Placement
- Unit tests live alongside source: `src/**/*.test.ts`
- Integration tests: `src/**/*.test.ts` with describe blocks scoped to feature
- E2E tests: `e2e/` directory
- Server tests: `server/routes/*.test.ts`

### Naming
- File: `{module}.test.ts` (e.g., `sequencer.test.ts`, `TBMAudioEngine.test.ts`)
- Describe: `"Module name — sub-area"` (e.g., `"TBMAudioEngine — sample export/restore"`)
- It: `"behavior under condition"` (e.g., `"exports empty samples when no samples loaded"`)

## 2. Test Pattern Requirements

Every test should cover:

1. **Happy path** — expected inputs, expected outputs
2. **Failure path** — invalid inputs, missing dependencies, error states
3. **Lifecycle/cleanup** — dispose, unmount, cancel, reset
4. **Persistence/regression** — round-trip, reload, migration

### Example

```typescript
describe("Feature X", () => {
  it("happy path: works with valid input", () => { ... });
  it("failure path: handles invalid input gracefully", () => { ... });
  it("lifecycle: cleans up on dispose/unmount", () => { ... });
  it("persistence: survives save/load round-trip", () => { ... });
});
```

## 3. Mock Strategy

### AudioContext
- Always mock `AudioContext` in unit tests (use `src/test/setup.ts` patterns)
- Never use real AudioContext in automated tests
- Mock `createGain`, `createBufferSource`, `createAnalyser`, etc.

### localStorage
- Use real localStorage mock with actual storage (key-value store)
- Reset in `beforeEach`

### fetch
- Use `vi.fn()` and `vi.stubGlobal('fetch', mock)` for API tests
- Reset in `afterEach` with `vi.restoreAllMocks()`

### AudioParam
- Polyfill in `beforeAll` when testing modMatrix or similar: `(globalThis as any).AudioParam = class { value = 0 }`

## 4. Assertion Style

- Use `toBe()` for primitives, `toEqual()` for objects/arrays
- Use `toBeCloseTo()` for floating point comparisons
- Use `toMatchObject()` for partial object matching
- Use `toThrow()` for error assertions
- Use `toHaveBeenCalledWith()` for spy/mock call verification
- Use `toBeGreaterThan()` / `toBeLessThan()` for ranges

## 5. Test Isolation

- Every `describe` block has `beforeEach` for fresh state
- Mock reset in `afterEach` with `vi.clearAllMocks()`
- No shared mutable state between tests
- No test order dependencies

## 6. Coverage Targets

| Area | Current | Target |
|------|---------|--------|
| Engine (`src/engine/`) | ~85% | 90% |
| Hooks (`src/hooks/`) | ~60% | 80% |
| State persistence | ~90% | 95% |
| Audio library (`src/lib/audio/`) | ~70% | 85% |
| Components (`src/components/`) | ~5% | 30% (25%) |
| Server routes | ~90% | 95% |
| E2E journeys | 9 tests | 15 tests (50%) |

## 7. Playwright E2E Conventions

- Use `getByRole()` and `getByText()` as primary selectors
- Avoid CSS class-based selectors (brittle across refactors)
- Use `waitForSelector` with state checks (visible/hidden/attached)
- Collect console errors in each test and assert no critical errors
- Screenshot on failure (automatic with Playwright config)
- Use `webServer` in playwright.config.ts for dev server auto-start

## 8. Regression Test Policy

- Every bug fix must include a failing test that passes after the fix
- Regression tests are added to the existing test file for that module
- A new entry is added to `docs/testing/REGRESSION_LOG.md`
- The test must cover the exact bug scenario, not a generic version

## 9. Performance Test Guidelines

- Startup time: measured from page load to first interactive
- Playback latency: trigger → AudioContext scheduling callback
- Export duration: project of known complexity → completion
- Memory: heap snapshot before/after 1hr editing session
- All measurements averaged over 3 runs

## 10. Security Test Checklist

| Test | Method |
|------|--------|
| SSRF via project import | Validate dataUri scheme guard |
| Path traversal in file routes | Attempt `../../../etc/passwd` |
| Oversized JSON body | Send 10MB payload, expect 413/400 |
| Oversized stem upload | Send >500MB file, expect rejection |
| Invalid file type | Upload .exe as stem, expect rejection |
| Corrupt project file | Parse garbage JSON, expect graceful error |
| XSS in project metadata | Inject `<script>` in song name, verify not executed |
