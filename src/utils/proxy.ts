const SUPPORTED_PROXY_PROTOCOLS = new Set(['http:', 'https:']);

export type LoadOptions = { proxy?: string };

/** Security: never echo credentials — user:pass@ becomes ***@ in any echoed value. */
function redactCredentials(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl);
    if (url.username || url.password) {
      url.username = '***';
      url.password = '';
    }
    return url.toString();
  } catch {
    return proxyUrl;
  }
}

const MAX_CAUSE_DEPTH = 5;

/**
 * undici's fetch() nests the meaningful error up to 3 levels deep via `cause`
 * (e.g. "fetch failed" → "Request was cancelled." → "Proxy response (502) !== 200...").
 * Flatten the chain so the deepest message (proxy status, ECONNREFUSED, ...) is user-visible.
 */
function describeFetchError(err: unknown): string {
  const messages: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current instanceof Error; depth++) {
    if (!messages.includes(current.message)) {
      messages.push(current.message);
    }
    current = current.cause;
  }
  return messages.join(': ');
}

export function assertValidProxyUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `Invalid proxy URL "${redactCredentials(url)}": only http:// and https:// proxies are supported`
    );
  }
  if (!SUPPORTED_PROXY_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `Invalid proxy URL "${redactCredentials(url)}": only http:// and https:// proxies are supported (got scheme "${parsed.protocol.replace(/:$/, '')}:")`
    );
  }
}

export function hasProxyEnv(): boolean {
  return Boolean(
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy
  );
}

export async function fetchSpec(url: string, opts?: LoadOptions): Promise<Response> {
  if (opts?.proxy) {
    assertValidProxyUrl(opts.proxy);
    const redacted = redactCredentials(opts.proxy);
    try {
      const { fetch: undiciFetch, ProxyAgent } = await import('undici');
      return (await undiciFetch(url, {
        dispatcher: new ProxyAgent(opts.proxy),
      })) as unknown as Response;
    } catch (err) {
      throw new Error(
        `Failed to fetch spec from URL via proxy ${redacted}: ${describeFetchError(err)}`,
        {
          cause: err,
        }
      );
    }
  }

  if (hasProxyEnv()) {
    try {
      const { fetch: undiciFetch, EnvHttpProxyAgent } = await import('undici');
      return (await undiciFetch(url, {
        dispatcher: new EnvHttpProxyAgent(),
      })) as unknown as Response;
    } catch (err) {
      throw new Error(`Failed to fetch spec from URL via proxy env: ${describeFetchError(err)}`, {
        cause: err,
      });
    }
  }

  return fetch(url);
}
