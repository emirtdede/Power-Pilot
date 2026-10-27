## Summary

<!-- What changed, why, and which issue or work package does it implement? -->

## Related issues

Closes #

## Type of change

- [ ] Security fix
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / maintenance
- [ ] Documentation
- [ ] CI / release / packaging
- [ ] Breaking change

## Testing

<!-- List the exact commands you ran. Replace the result column. -->

| Command                  | Result                    |
| ------------------------ | ------------------------- |
| `npm test`               | Passed / Failed / Not run |
| `npm run test:security`  | Passed / Failed / Not run |
| `npm run release:check`  | Passed / Failed / Not run |
| `npm run test:e2e`       | Passed / Failed / Not run |

## Screenshots / recordings

<!-- Required for UI changes. Include before/after where useful. -->

## Release notes

<!-- One or two user-facing sentences. Write "None" for internal changes. -->

## Checklist

- [ ] I kept the change focused and did not include unrelated refactors.
- [ ] I added or updated tests for the behavior I changed.
- [ ] `npm test` passes locally.
- [ ] `npm run test:security` and `npm run release:check` pass locally.
- [ ] If UI text changed, `npm run locales:check` passes and all locales are updated.
- [ ] I updated documentation under `docs/` and its index links.
- [ ] I added a `CHANGELOG.md` entry for user-facing changes.
- [ ] I did not commit secrets, certificates, build output (`dist/`), coverage, or local design/store assets.
- [ ] I reviewed the security impact (IPC, local API, secrets, signing, updater) and documented it above.
