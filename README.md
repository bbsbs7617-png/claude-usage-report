# claude-usage-report

A Claude Code stop hook that displays a usage summary after each prompt cycle.

```
────────────────────────────────────────────────────────
  SESSION USAGE REPORT
────────────────────────────────────────────────────────
  Duration:  1m 0s

  Token Usage
  Input:            141   Cache Write: 241.5k
  Output:         21.0k   Cache Read:  1.5M
  Requests:          47   Cache Hit:   86%
  Est. Cost:   $ 0.5711   Session:     $8.4136

  Context Window
  Total:  [#######..................] 27.7% (55.4k / 1M)
  Added:  +5.2k (+2.6%)

  Rate Utilized
  5-Hour:   [####.....................] 15.2% (resets in 3h 12m)
  Weekly:   [##.......................] 8.1%  (resets in 5d 2h)
────────────────────────────────────────────────────────
```

## Features

- **Per-prompt metrics** -- duration and cost reflect the last prompt cycle, not the full session
- **Token breakdown** -- input, output, cache write, cache read with cache hit rate
- **Cost estimation** -- per-prompt and session totals based on published Anthropic pricing
- **Context window** -- current fill percentage and how much was added in the last prompt
- **Rate limits** -- 5-hour and weekly utilization with reset countdowns (requires Claude login)
- **Enable/disable** -- toggle on and off without modifying settings
- **Zero dependencies** -- pure Node.js, reads Claude Code's own transcript data

## Requirements

- Node.js 18+
- Claude Code CLI (authenticated via `claude login`)

## Installation

```bash
git clone https://github.com/abhiyankhanal/claude-usage-report.git
cd claude-usage-report
bash install.sh
```

The install script will:
1. Copy `usage-report.mjs` to `~/.claude/hooks/`
2. Register the stop hook in `~/.claude/settings.json` (or print instructions if settings already exist)
3. Install the `claude-usage-report` CLI to `~/.local/bin/`

### Manual installation

If you prefer to install manually:

1. Copy the hook script:
   ```bash
   cp usage-report.mjs ~/.claude/hooks/usage-report.mjs
   ```

2. Add to `~/.claude/settings.json` under `hooks.Stop`:
   ```json
   {
     "hooks": {
       "Stop": [
         {
           "matcher": "",
           "hooks": [
             {
               "type": "command",
               "command": "node ~/.claude/hooks/usage-report.mjs",
               "timeout": 10
             }
           ]
         }
       ]
     }
   }
   ```

## Usage

Once installed, the usage report appears automatically after each Claude Code response.

### Enable / Disable

```bash
claude-usage-report disable   # Turn off the report
claude-usage-report enable    # Turn it back on
claude-usage-report status    # Check current state
```

Or directly with node:

```bash
node ~/.claude/hooks/usage-report.mjs disable
node ~/.claude/hooks/usage-report.mjs enable
node ~/.claude/hooks/usage-report.mjs status
```

### What each metric means

| Metric | Description |
|--------|-------------|
| **Duration** | Wall-clock time of the last prompt (user message to final response) |
| **Input / Output** | Session-total input and output tokens |
| **Cache Write / Read** | Tokens written to and read from the prompt cache |
| **Cache Hit** | `cache_read / (cache_read + cache_write)` -- higher is better |
| **Est. Cost** | Estimated dollar cost of the last prompt cycle |
| **Session** | Estimated dollar cost of the entire session |
| **Context Total** | How full the 1M context window is |
| **Context Added** | How much context grew compared to the previous prompt |
| **Rate Utilized** | Your 5-hour and weekly rate limit consumption |

### Rate limits

Rate limit data comes from the Anthropic OAuth usage API. If you see "Usage API unavailable", ensure you're logged in:

```bash
claude login
```

The plugin caches rate data for up to 30 minutes to avoid hitting the API on every prompt.

## Uninstall

```bash
cd claude-usage-report
bash uninstall.sh
```

Then remove the Stop hook entry from `~/.claude/settings.json`.

## License

MIT
