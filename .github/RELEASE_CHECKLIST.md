---
name: 🚀 Release Checklist
about: Checklist for creating a new release
title: 'Release v0.X.0'
labels: release
assignees: ''
---

## Pre-Release Checklist

- [ ] All planned features merged to `main`
- [ ] All tests passing (`pnpm test`)
- [ ] Documentation updated
- [ ] CHANGELOG.md updated with release notes
- [ ] Version bumped in all package.json files
- [ ] Migration scripts tested (if applicable)
- [ ] Performance benchmarks run
- [ ] Security audit completed

## Release Process

- [ ] Create release branch: `git checkout -b release/v0.X.0`
- [ ] Update CHANGELOG.md with final release date
- [ ] Update package versions: `pnpm changeset version`
- [ ] Commit changes: `git commit -m "chore: release v0.X.0"`
- [ ] Tag release: `git tag -a v0.X.0 -m "Release v0.X.0"`
- [ ] Push to GitHub: `git push origin v0.X.0`
- [ ] Create GitHub release with notes from CHANGELOG.md
- [ ] Publish packages: `pnpm changeset publish`
- [ ] Merge release branch to `main`

## Post-Release

- [ ] Verify installation from npm registry
- [ ] Update documentation site
- [ ] Announce on Discord, Twitter
- [ ] Close related issues and PRs
- [ ] Create milestone for next version
- [ ] Update project board

## Rollback Plan (if needed)

If critical issues are discovered:

1. Unpublish from npm (within 72 hours only)
2. Delete GitHub tag: `git tag -d v0.X.0 && git push origin :refs/tags/v0.X.0`
3. Revert commits on main
4. Communicate issue to users
5. Prepare hotfix release
