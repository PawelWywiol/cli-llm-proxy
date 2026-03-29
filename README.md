# cli-llm-proxy

OpenAI-compatible HTTP proxy that routes LLM requests to local CLI tools.

## Quick Start

```bash
pnpm install
cp config.example.json config.json   # Edit as needed
pnpm dev
```

## Supported CLIs

| CLI | Command | Status |
|-----|---------|--------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude --print` | Enabled by default |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini -p` | Opt-in |
| [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) | `gh copilot` | Opt-in |

## Documentation

- [Architecture](docs/architecture.md) - System overview and request flow
- [API Reference](docs/api-reference.md) - Endpoints, request/response formats
- [Configuration](docs/configuration.md) - config.json, environment variables
- [Adapters](docs/adapters.md) - Built-in adapters, adding new ones
- [Plugins](docs/plugins.md) - Plugin system, writing plugins
- [Security](docs/security.md) - Spawn safety, auth, hardening
- [Deployment](docs/deployment.md) - Dev, production, Docker, systemd, SDK examples
- [Extending](docs/extending.md) - New backends, plugins, storage, context
- [Troubleshooting](docs/troubleshooting.md) - Common issues and fixes

## License

MIT
