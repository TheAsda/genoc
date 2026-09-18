# Configuration

## CLI reference

| Argument                 | Default         | Description                                                                                                                                             |
| ------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<spec>` (positional)    | (optional)      | Path or URL to an OpenAPI 3.0 or 3.1 spec (JSON or YAML); optional when a config file supplies `input`; see [Configuration files](#configuration-files) |
| `--output-dir`, `-o`     | (optional)      | Output directory for generated files; required when no config file supplies `outputDir`                                                                 |
| `--method-name-strategy` | `path-based`    | Method naming strategy                                                                                                                                  |
| `--spec-version`         | auto-detect     | Override version detection (`"3.0"` or `"3.1"`)                                                                                                         |
| `--strict-version`       | `true`          | Warn if `--spec-version` mismatches detected version; a config file value applies when the flag is omitted                                              |
| `--runtime-import-path`  | `genoc/runtime` | Module specifier generated code imports runtime classes from                                                                                            |
| `--proxy`                | (none)          | HTTP or HTTPS proxy URL for fetching specs from URLs; overrides the `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` environment variables                   |
| `--config`               | (none)          | Path to a config file (`.genocrc.yml` or `.genocrc.json`); skips config discovery                                                                       |
| `--project`              | (none)          | Run only the named client from a multi-client config; omit to run all clients                                                                           |

## Configuration files

`genoc` reads `.genocrc.yml` or `.genocrc.json` (`.yaml` is not recognized).
Without `--config`, it looks in the current directory, then upward, stopping at
the git repository root; when both files exist, `.genocrc.yml` wins.
`--config <path>` loads exactly that file.

Keys mirror the CLI flags in camelCase (`--method-name-strategy` →
`methodNameStrategy`); `input` stands in for the `<spec>` positional. Precedence
is CLI flag > config file > default, but passing `--method-name-strategy
path-based` (its default) is indistinguishable from omitting the flag, so the
config wins in that case. An explicit `--strict-version` or `--no-strict-version`
flag always beats the file's `strictVersion`.

### Single client

```yaml
# .genocrc.yml
input: ./openapi/petstore.yaml
outputDir: ./src/api/petstore
methodNameStrategy: operationId-with-fallback # optional; keys mirror CLI flags
```

### Multiple clients

```yaml
# .genocrc.yml
clients:
  petstore:
    input: ./openapi/petstore.yaml
    outputDir: ./src/api/petstore
  billing:
    input: ./openapi/billing.json
    outputDir: ./src/api/billing
    methodNameStrategy: operationId # per-client overrides allowed
```

Every client entry requires `input` and `outputDir`; the remaining keys are
optional. `--project <name>` generates a single client; all run by default.
`--output-dir` alongside `--project` overrides that target's `outputDir`. A
`<spec>` positional with a `clients` config is an error; use `--project`
instead. The same keys work in `.genocrc.json`.

Relative paths resolve against the config file's directory, not the working
directory. Unknown keys are rejected with the offending key path named. Clients
run sequentially; a failure doesn't stop the rest. Failures are aggregated, and
the process exits with code `1` (files already written are kept).

## Method naming strategies

- **`path-based`** (default): the HTTP method and path segments in PascalCase.
  `GET /pets` → `getPets`, `GET /api/v1/products` → `getApiV1Products`

- **`operationId`**: use the `operationId` field from the spec.
  `GET /pets` → `findPets` (if `operationId` is `"findPets"`)

- **`operationId-with-fallback`**: use `operationId` if present, otherwise
  fall back to path-based naming.

## Proxy support

```bash
genoc https://api.example.com/openapi.yaml --output-dir ./src/api \
  --proxy http://user:pass@proxy.example.com:8080
```

- Credentials are supported in the proxy URL (`user:pass@host:port`).
- Without `--proxy`, the `HTTP_PROXY` and `HTTPS_PROXY` environment variables
  (either casing) are respected, with `NO_PROXY` exclusions; an explicit
  `--proxy` flag overrides them entirely.
- SOCKS proxies and `ALL_PROXY` are not supported.
