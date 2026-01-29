---
phase: 06-advanced-features-polish
plan: 04
subsystem: cli
tags: [inquirer, wizard, setup, claude-desktop, config-generator]

# Dependency graph
requires:
  - phase: 06-03
    provides: CLI foundation with Commander.js routing
  - phase: 02-02
    provides: OIDC flow for browser authentication
  - phase: 01-02
    provides: JMAPClient for connection testing
provides:
  - Interactive setup wizard via `npx mcp-twake-mail setup`
  - JMAP URL and auth method prompting
  - OIDC browser flow trigger during setup
  - JMAP connection testing
  - Claude Desktop config JSON generation
  - Config file writing with merge support
affects: [06-05, 06-06]

# Tech tracking
tech-stack:
  added: [@inquirer/prompts]
  patterns: [dynamic-import-for-commands, wizard-flow, config-merging]

key-files:
  created:
    - src/cli/prompts/setup-wizard.ts
    - src/cli/commands/setup.ts
  modified:
    - src/cli/index.ts
    - package.json

key-decisions:
  - "@inquirer/prompts for modern TypeScript CLI prompts"
  - "Dynamic import for setup command to keep MCP server lightweight"
  - "Merge with existing Claude Desktop config (not overwrite)"
  - "Platform-aware config path detection (macOS/Windows/Linux)"

patterns-established:
  - "CLI command handlers in src/cli/commands/"
  - "CLI prompt functions in src/cli/prompts/"
  - "Dynamic imports for command modules"

# Metrics
duration: 2min
completed: 2026-01-29
---

# Phase 6 Plan 4: Setup Wizard Summary

**Interactive CLI wizard using @inquirer/prompts for JMAP configuration with OIDC browser flow and Claude Desktop config generation**

## Performance

- **Duration:** 1 min 47 sec
- **Started:** 2026-01-29T19:49:40Z
- **Completed:** 2026-01-29T19:51:27Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Installed @inquirer/prompts and created prompt functions for JMAP URL, auth method, credentials
- Implemented setup command handler with full wizard flow including connection testing
- Wired setup command to CLI router with dynamic import

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Inquirer and Create Prompt Functions** - `7ca2793` (feat)
2. **Task 2: Implement Setup Command Handler** - `8919ce4` (feat)
3. **Task 3: Wire Setup Command to CLI** - `a4602c8` (feat)

## Files Created/Modified
- `src/cli/prompts/setup-wizard.ts` - Interactive prompt functions (7 exports)
- `src/cli/commands/setup.ts` - Setup wizard command handler with runSetup()
- `src/cli/index.ts` - Updated setup command to use dynamic import
- `package.json` - Added @inquirer/prompts dependency

## Decisions Made
- @inquirer/prompts chosen for modern TypeScript-first CLI experience
- Dynamic import pattern keeps MCP server startup lightweight
- Config merging preserves existing Claude Desktop mcpServers entries
- Platform detection for config path (macOS Library, Windows AppData, Linux .config)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Setup wizard fully functional via `npx mcp-twake-mail setup`
- Ready for 06-05 (Auth Command) and 06-06 (Check Command)
- All 290 tests passing

---
*Phase: 06-advanced-features-polish*
*Plan: 04*
*Completed: 2026-01-29*
