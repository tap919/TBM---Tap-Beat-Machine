# TBM Tap Beat Machine — Release Checklist

## Pre-Release Gates

### Static Analysis
- [ ] `npm run lint` — 0 errors (warnings allowed, reviewed)
- [ ] `tsc --noEmit` — 0 errors
- [ ] `npm audit` — 0 critical, 0 high vulnerabilities

### Client Tests
- [ ] `npm test` — all tests pass
- [ ] Coverage meets threshold (no regression below current)
- [ ] No flaky tests (3 consecutive runs pass)

### Server Tests
- [ ] `npm run test:server` — all tests pass
- [ ] API routes validated: health, settings, stems, export, music

### E2E Tests
- [ ] `npm run test:e2e` — all tests pass
- [ ] Critical user journeys: beat creation, save/load, export

### Build
- [ ] `npm run build` — production build succeeds
- [ ] Bundle size within 5% of baseline (dist/index.js ~300KB gzip ~90KB)

## Release Scope Verification

| Feature | Unit | Integration | E2E | Manual |
|---------|------|-------------|-----|--------|
| Sampler/pad engine | ✅ | ✅ | ✅ | — |
| Step sequencer | ✅ | ✅ | ✅ | — |
| Piano roll | — | — | — | ⬜ |
| Song editor | ✅ | ⬜ | ✅ | — |
| Mixer | ✅ | ⬜ | ✅ | — |
| FX routing | ✅ | — | — | ⬜ |
| Mod matrix | ✅ | — | — | — |
| Macro controls | ✅ | — | — | — |
| Save/load | ✅ | ✅ | ✅ | — |
| Auto-save | — | ⬜ | — | ⬜ |
| Export/bounce | — | ⬜ | ⬜ | — |
| Stem separation | ✅ | ✅ | — | ⬜ |
| MIDI | — | ⬜ | — | ⬜ |
| Drum machine | — | ⬜ | ✅ | — |
| Hat sequencer | — | — | — | ⬜ |
| Vinyl/scratch | — | — | — | ⬜ |
| Undo/redo | ✅ | ⬜ | — | — |

## Post-Release

- [ ] Tag release (`git tag vX.Y.Z && git push origin vX.Y.Z`)
- [ ] Update CHANGELOG.md
- [ ] Verify GitHub Actions CI passes on the tag
