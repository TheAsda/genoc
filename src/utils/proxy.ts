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
        `Failed to fetch spec from URL via proxy ${redacted}: ${(err as Error).message}`,
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
      throw new Error(`Failed to fetch spec from URL via proxy env: ${(err as Error).message}`, {
        cause: err,
      });
    }
  }

  return fetch(url);
}
