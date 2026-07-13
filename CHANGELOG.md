# Changelog

All notable changes to Packlift will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Keep future changes and upcoming improvements here.

## [1.0.0] - 2026-07-13

### Added

- Inspect outdated Composer dependencies from `composer.json`.
- Classify available updates as major, minor, or patch releases.
- Respect Composer stability settings and PHP compatibility requirements.
- Display release age and deprecated package warnings.
- Support interactive package selection.
- Support dry runs, persistent excludes, and writing selected updates back to `composer.json`.
- Optionally run `composer update` after writing changes.

### Changed

- Introduce the Packlift CLI and package as the first stable release.
- Use `extra.packlift.exclude` for persistent package exclusions.
- Use Packlift-specific cache directories and `PACKLIFT_CACHE_DIR` for cache overrides.

[Unreleased]: https://github.com/poshtive/packlift/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/poshtive/packlift/releases/tag/v1.0.0
