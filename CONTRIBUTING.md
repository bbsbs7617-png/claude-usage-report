# Contributing to claude-usage-report

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/claude-usage-report.git
   cd claude-usage-report
   ```
3. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

1. Ensure you have **Node.js 18+** installed
2. Install the hook locally for testing:
   ```bash
   bash install.sh
   ```
3. The hook runs automatically after each Claude Code prompt — test your changes by using Claude Code normally

## Project Structure

```
├── usage-report.mjs   # Main hook script (zero dependencies)
├── install.sh         # Installation script
├── uninstall.sh       # Uninstallation script
├── package.json       # Project metadata and versioning
├── LICENSE            # MIT License
└── README.md          # Documentation
```

## Guidelines

### Code Style

- This project uses **zero external dependencies** — keep it that way
- Use only Node.js built-in modules (`fs`, `path`, `https`)
- Keep the script self-contained in a single file (`usage-report.mjs`)

### Making Changes

- Keep changes focused — one feature or fix per PR
- Update the README if your change affects user-facing behavior
- Test your changes with a live Claude Code session before submitting

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add per-model cost breakdown
fix: handle missing transcript gracefully
docs: clarify installation steps for manual setup
```

### What We're Looking For

- Bug fixes
- Accuracy improvements for cost estimation
- Better formatting or display of metrics
- Support for new Claude models or pricing tiers
- Documentation improvements

### What to Avoid

- Adding external dependencies
- Changes that break the single-file architecture
- Features that require additional configuration beyond what exists

## Submitting a Pull Request

1. Push your branch to your fork
2. Open a PR against the `main` branch
3. Describe what your change does and why
4. Include before/after screenshots of the usage report if the output format changed

## Reporting Issues

Open an issue at [github.com/abhiyankhanal/claude-usage-report/issues](https://github.com/abhiyankhanal/claude-usage-report/issues) with:

- What you expected to happen
- What actually happened
- Your Node.js version (`node --version`)
- Your OS

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
