export function kebabToPascalCase(str: string): string {
  if (!str) return '';

  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

export function camelCase(str: string): string {
  if (!str) return '';

  return str.charAt(0).toLowerCase() + str.slice(1).toLowerCase();
}

export function pascalCase(str: string): string {
  if (!str) return '';

  return str
    .split(/[\s-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

export function toPascalCaseSegment(segment: string): string {
  if (!segment) return '';

  if (/^[A-Z]/.test(segment) && /^[A-Za-z0-9]+$/.test(segment)) {
    return segment;
  }

  if (segment.includes('-')) {
    return kebabToPascalCase(segment);
  }

  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function formatToBrandTypeName(format: string, openApiType: string): string {
  const formatName = pascalCase(format);
  let baseType: string;

  switch (openApiType) {
    case 'string':
      baseType = 'String';
      break;
    case 'number':
    case 'integer':
      baseType = 'Number';
      break;
    case 'boolean':
      baseType = 'Boolean';
      break;
    default:
      baseType = openApiType.charAt(0).toUpperCase() + openApiType.slice(1);
  }

  return formatName + baseType;
}
