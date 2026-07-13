# packlift

A [taze](https://github.com/antfu/taze)-like CLI for updating `composer.json` dependencies.

## Features

- 🔍 Check for outdated dependencies in `composer.json`
- 📊 Colored output: Major (red), Minor (cyan), Patch (green)
- ⏱️ Version age display (e.g., "2 d", "3 mo")
- 🎯 Respects `minimum-stability` and `prefer-stable`
- 🚫 Major updates hidden by default
- ✍️ Interactive selection mode
- ⚠️ Detects deprecated packages

## Installation

```bash
# Global install
npm install -g packlift

# Or use directly with npx/bunx/pnpx
npx packlift
bunx packlift
pnpx packlift
```

## Usage

```bash
# Check for updates
packlift

# Include major updates
packlift --major

# Write changes to composer.json
packlift -w

# Write + run composer update
packlift -i

# Interactive mode
packlift -I

# Dry run
packlift --dry-run

# Exclude packages
packlift --exclude vendor/package

# Exclude multiple packages
packlift --exclude vendor/package-a,vendor/package-b
```

## Options

| Flag                | Description                             |
| ------------------- | --------------------------------------- |
| `-w, --write`       | Write changes to `composer.json`        |
| `-i, --install`     | Write changes and run `composer update` |
| `-I, --interactive` | Select updates manually                 |
| `--major`           | Include major updates (default: false)  |
| `--minor`           | Include minor updates (default: true)   |
| `--patch`           | Include patch updates (default: true)   |
| `--exclude <pkgs>`  | Exclude packages (comma-separated, merged with `extra.packlift.exclude`) |
| `--dry-run`         | Preview changes without writing         |

## Persistent Excludes

For packages that should always be ignored, store them in `composer.json` under `extra.packlift.exclude`:

```json
{
  "extra": {
    "packlift": {
      "exclude": [
        "vendor/package-a",
        "vendor/package-b"
      ]
    }
  }
}
```

`packlift` merges this list with `--exclude`, so the flag remains useful for one-off runs while the file keeps repository-wide defaults.

## Composer Stability

packlift reads `minimum-stability` and `prefer-stable` from your `composer.json`:

```json
{
  "minimum-stability": "dev",
  "prefer-stable": true
}
```

## Version Constraints

All Composer version constraints are supported:

| Type       | Example               |
| ---------- | --------------------- |
| Exact      | `1.0.2`               |
| Caret      | `^1.2.3`              |
| Tilde      | `~1.2`                |
| Wildcard   | `1.0.*`               |
| Range      | `>=1.0 <2.0`          |
| Hyphenated | `1.0 - 2.0`           |
| Dev        | `dev-main`, `1.x-dev` |

## Development

```bash
# Install dependencies
bun install

# Run in development
bun run dev

# Run tests
bun test

# Build for publishing
bun run build
```

## License

MIT
