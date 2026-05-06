export function isUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://');
}

export function resolveUrl(base: string, ref: string): string {
  if (ref.startsWith('#')) {
    return base + ref;
  }
  if (ref.startsWith('/')) {
    return ref;
  }
  return base + ref;
}

export function parseJsonPointer(pointer: string): string[] {
  if (pointer === '') {
    return [];
  }

  const segments = pointer.split('/').slice(1);
  return segments.map((segment) => {
    return segment.replace(/~1/g, '/').replace(/~0/g, '~');
  });
}

export function pathSegments(path: string): string[] {
  return path.split(/[/:]/).filter((segment) => segment.length > 0);
}

export function getPathSegmentsWithParamInfo(
  path: string
): Array<{ segment: string; isParam: boolean }> {
  const segments = path.split(/[/:]/).filter((segment) => segment.length > 0);
  return segments.map((segment) => ({
    segment,
    isParam: segment.startsWith('{') && segment.endsWith('}'),
  }));
}

export function isPathParam(segment: string): boolean {
  return segment.startsWith('{') && segment.endsWith('}');
}

export function extractParamName(segment: string): string {
  if (!isPathParam(segment)) {
    throw new Error(`Segment is not a path parameter: ${segment}`);
  }
  return segment.slice(1, -1);
}
