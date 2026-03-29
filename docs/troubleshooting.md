# Troubleshooting

## Common Issues

| Symptom | Cause | Resolution |
|---------|-------|------------|
| `No adapter found for model: X` | Model name doesn't match any alias | Check `/v1/models` for available names. Add aliases in config. |
| `401 Invalid API key` | Wrong or missing auth header | Use `Authorization: Bearer <key>` or `X-API-Key: <key>` |
| `502 CLI exited with code 1` | CLI tool failed | Check stderr in debug logs. Verify CLI works manually. |
| `504 CLI adapter timed out` | CLI exceeded timeoutMs | Increase `adapters.<name>.timeoutMs`. Check CLI responsiveness. |
| `429 CLI error detected: RATE_LIMIT` | Upstream rate limit hit | Wait and retry. Reduce `maxConcurrent`. |
| `429 CLI error detected: QUOTA_EXCEEDED` | Upstream billing/quota issue | Check your subscription/billing for the CLI provider. |
| `401 CLI error detected: AUTH_FAILURE` | CLI not authenticated | Run the CLI manually to re-authenticate (e.g., `claude login`). |
| `502 CLI error detected: NETWORK_ERROR` | CLI can't reach upstream | Check network connectivity, DNS, proxies. |
| Empty response | CLI returned no stdout | Verify CLI works: `claude --print "hello"`. Check debug logs. |
| Connection refused on port 11434 | Server not running or wrong port | Check `pnpm start` output. Verify PORT config. |
| Health shows `"degraded"` | No CLIs available | Run `/health` to see which adapters failed. Install/auth CLIs. |
| Streaming stops mid-response | CLI process crashed | Check debug logs for exit code. May be OOM or signal. |

## Debug Logging

Enable verbose logs:

```bash
LOG_LEVEL=debug pnpm dev
```

Or in config.json:
```json
{ "logLevel": "debug" }
```

Debug logs include:
- Full request/response cycle timing
- Adapter resolution details
- CLI spawn arguments (verify what's actually being executed)

## CLI-Specific Issues

### Claude Code

| Issue | Fix |
|-------|-----|
| `command not found: claude` | Install: `npm install -g @anthropic-ai/claude-code` or set `CLAUDE_CLI_PATH` |
| Auth expired | Run `claude login` in terminal |
| `--print` flag not recognized | Update Claude Code: `npm update -g @anthropic-ai/claude-code` |

### Gemini CLI

| Issue | Fix |
|-------|-----|
| `command not found: gemini` | Install Gemini CLI. Set `GEMINI_CLI_PATH` if not in PATH. |
| Auth expired | Run `gemini auth login` |
| Wrong model used | Check `resolveGeminiModel()` mapping in docs/adapters.md |

### GitHub Copilot CLI

| Issue | Fix |
|-------|-----|
| `command not found: gh` | Install GitHub CLI: https://cli.github.com |
| Copilot extension not found | `gh extension install github/gh-copilot` |
| Interactive prompt hangs | Proxy sets `CI=1` env var. If still hanging, check gh version. |
| Wrong mode (explain vs suggest) | See `detectCopilotMode()` heuristic. Override via `extraArgs` in config. |

## Verifying CLI Tools Manually

Before troubleshooting the proxy, verify each CLI works in isolation:

```bash
# Claude
claude --version
claude --print "Say hello"

# Gemini
gemini --version
gemini -p "Say hello"

# Copilot
gh copilot --version
echo "explain git rebase" | gh copilot explain
```

## Still Stuck?

1. Set `LOG_LEVEL=debug` and reproduce the issue
2. Check the full stderr output in logs
3. Test the CLI command manually with the exact args from debug logs
4. Check `/health` endpoint for adapter status
