# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-02-02

### Added

- Initial release
- Personality injection via `experimental.chat.system.transform` hook
- Mood state machine with configurable drift logic
- `/mood` command for status check and manual mood override
- `/personality` command suite:
  - `create` - Interactive personality creation through conversation
  - `edit` - Modify existing config (interactive or via `--field`/`--value` flags)
  - `show` - Display merged configuration
  - `reset` - Delete config file with `--confirm` flag
- `setMood` tool for programmatic mood control with duration options
- `savePersonality` tool for saving configurations via LLM
- Toast notifications on mood drift
- Session compaction support via `experimental.session.compacting`
- Config precedence: global (`~/.config/opencode/`) + project (`.opencode/`) with deep merge
- No-op mode when no config is present
- Custom mood definitions support
- Personality name support

### Technical

- TypeScript strict mode with `noUncheckedIndexedAccess`
- ESM module format
- Bun build pipeline with source maps
- GitHub Actions CI/CD for PR checks and npm publishing
