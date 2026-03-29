# Security

## Process Spawning

All CLI processes are spawned with `shell: false` (src/utils/process.ts). This is critical:

- **With `shell: true`**: User-controlled prompt text would be interpreted by the shell, enabling injection (e.g., `; rm -rf /`)
- **With `shell: false`**: Arguments are passed directly to `execve`, no shell interpretation occurs

The proxy passes the full prompt as a single argument to the CLI. Without shell interpretation, special characters are harmless.

## Authentication

When `server.apiKey` is configured (via config.json or `PROXY_API_KEY` env var), all endpoints except `/health` require authentication.

Supported methods:
- `Authorization: Bearer <key>` header
- `X-API-Key: <key>` header

If `apiKey` is empty string, auth is disabled entirely. **Always set an API key in production.**

## Timeout and Output Limits

| Control | Default | Config Key |
|---------|---------|------------|
| CLI execution timeout | 120s | `adapters.<name>.timeoutMs` |
| Max stdout/stderr captured | 1MB | `maxOutputChars` |
| SIGTERM -> SIGKILL escalation | 3s | Hardcoded |

Timeouts prevent runaway CLI processes from consuming resources indefinitely. Output caps prevent memory exhaustion from verbose CLIs.

## Binding Address

Default bind: `127.0.0.1` (localhost only).

- **`127.0.0.1`** - Only local connections. Safe for single-machine use.
- **`0.0.0.0`** - All interfaces. **Only use behind a reverse proxy with TLS.**

If exposing to a network:
1. Set a strong API key
2. Use a reverse proxy (nginx, Caddy) with TLS termination
3. Restrict network access via firewall rules

## Concurrency Limits

Per-adapter semaphores (default: 2 concurrent) prevent overwhelming CLI tools. This also limits resource consumption from concurrent requests.

## systemd Hardening

The provided `cli-llm-proxy.service` unit includes:

```ini
NoNewPrivileges=true        # Prevent privilege escalation
ProtectSystem=strict        # Read-only filesystem except allowed paths
ProtectHome=read-only       # Read-only home (CLIs may need config files)
PrivateTmp=true             # Isolated /tmp
ProtectKernelTunables=true  # No sysctl modification
ProtectKernelModules=true   # No kernel module loading
ProtectControlGroups=true   # No cgroup modification
RestrictNamespaces=true     # No new namespaces
RestrictSUIDSGID=true       # No setuid/setgid
```

## Recommendations

1. **Always set `PROXY_API_KEY`** in production
2. **Never bind to `0.0.0.0`** without TLS and a reverse proxy
3. **Use systemd hardening** on Linux deployments
4. **Keep CLIs updated** - they handle their own auth to upstream APIs
5. **Monitor `/health`** - alerts on CLI unavailability
6. **Review `extraArgs`** - don't pass untrusted values
