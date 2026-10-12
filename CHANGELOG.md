# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-12

### Added

- Per-model reasoning-effort editor in the Models settings page's provider
  cards, registered into the `settings.models.provider-card` extension seat
  (keyed by settings namespace) rather than editing that page.
- Three model states mirroring the adapter's semantics: inherit (unset),
  non-reasoning (`false`), and declared levels.
- Editable wire spelling per level, so a gateway with its own vocabulary can be
  sent a different string than the level name the picker shows.
- Automatic addressing: `models[i].reasoningEfforts` for a route that lists its
  models, `modelOverrides.<id>.reasoningEfforts` for a catalog-backed route.
- Pre-write validation of the adapter's own rules (an `off`-only declaration and
  an empty non-`off` wire value are refused before any request).
- Revision-fenced writes with an explicit conflict message.
- `verify.mjs`, which re-implements the Host activation checks and the
  distribution's seed-word rule for browser bundles.
- CI workflow running `verify.mjs` on every push and pull request.

### Fixed

- Read the `settings` Remote through `RemoteResult`, its actual wire shape. The
  first release read the declared payload directly, so every field resolved to
  `undefined` and the editor reported a namespace mismatch for a namespace that
  was in fact registered.
