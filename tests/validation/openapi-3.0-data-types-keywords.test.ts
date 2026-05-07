// Feature coverage: 3.0-#1 (string), 3.0-#2 (number), 3.0-#3 (integer), 3.0-#4 (boolean),
// 3.0-#5 (array), 3.0-#6 (object), 3.0-#7 (null via nullable),
// 3.0-#8 (allOf), 3.0-#9 (oneOf), 3.0-#10 (anyOf), 3.0-#11 (discriminator),
// 3.0-#12 (enum), 3.0-#13 (const), 3.0-#14 (default), 3.0-#15 (description),
// 3.0-#16 (readOnly), 3.0-#17 (writeOnly), 3.0-#18 (deprecated), 3.0-#19 (format),
// 3.0-#20 (additionalProperties), 3.0-#21 (required),
// 3.0-#22 (minItems), 3.0-#23 (maxItems), 3.0-#24 (minLength), 3.0-#25 (maxLength),
// 3.0-#26 (pattern), 3.0-#27 (minimum), 3.0-#28 (maximum),
// 3.0-#29 (exclusiveMinimum as boolean), 3.0-#30 (exclusiveMaximum as boolean)

/**
 * Validation Tests — OpenAPI 3.0 Data Types & Schema Keywords
 *
 * Tests every feature from the "Data Types" (3.0-#1-#7) and "Schema Keywords"
 * (3.0-#8-#30) sections of the feature enumeration.
 *
 * Key 3.0-specific differences from 3.1:
 * - `nullable: true` instead of `type: ["string", "null"]` (3.0-#7)
 * - `exclusiveMinimum: true` + `minimum: N` instead of `exclusiveMinimum: N` (3.0-#29)
 * - `exclusiveMaximum: true` + `maximum: N` instead of `exclusiveMaximum: N` (3.0-#30)
 * - `$ref` siblings stripped (not merged as in 3.1)
 * - `example` instead of `examples`
 *
 * Tier 1 (3.0-#1-#6, #8-#21): generateContracts + string matching on TypeScript output
 * Tier 2 (3.0-#22-#28): verify no crash + constraint NOT emitted in output
 * Tier 3 (3.0-#7, #29-#30): 3.0-specific normalization, verified via generation
 */
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { generateClient as generateClientStrings } from '../../src/generator/client-generator.js';
import { generateContracts } from '../../src/generator/contracts-generator.js';
import { RefResolver } from '../../src/parser/ref-resolver.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function generateFromYaml(yaml: string): string {
  const doc = parseYaml(yaml) as OpenAPIDocument;
  const resolver = new RefResolver(doc);
  return generateContracts(doc, resolver);
}

function generateClientFromYaml(yaml: string): { contracts: string; client: string } {
  const doc = parseYaml(yaml) as OpenAPIDocument;
  const config: GeneratorConfig = { input: 'test.yaml', outputDir: '/tmp/test' };
  return generateClientStrings(doc, config);
}

const BASE_SPEC = (schemasYaml: string) => `
openapi: "3.0.3"
info: { title: Test, version: "1.0.0" }
paths: {}
components:
  schemas:
${schemasYaml
  .split('\n')
  .map((l) => '    ' + l)
  .join('\n')}`;

// ── Data Types (3.0-#1-#6) — Tier 1, identical to 3.1 behavior ───────────

describe('OpenAPI 3.0 — Data Types (3.0-#1-#6)', () => {
  // 3.0-#1: string
  it('3.0-#1: maps string type to TypeScript string', () => {
    const result = generateFromYaml(BASE_SPEC('Status: { type: string }'));
    expect(result).toMatchSnapshot();
  });

  // 3.0-#2: number
  it('3.0-#2: maps number type to TypeScript number', () => {
    const result = generateFromYaml(BASE_SPEC('Price: { type: number }'));
    expect(result).toMatchSnapshot();
  });

  // 3.0-#3: integer
  it('3.0-#3: maps integer type to TypeScript number', () => {
    const result = generateFromYaml(BASE_SPEC('Count: { type: integer }'));
    expect(result).toMatchSnapshot();
  });

  // 3.0-#4: boolean
  it('3.0-#4: maps boolean type to TypeScript boolean', () => {
    const result = generateFromYaml(BASE_SPEC('Active: { type: boolean }'));
    expect(result).toMatchSnapshot();
  });

  // 3.0-#5: array
  it('3.0-#5: maps array with items to TypeScript T[]', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Tags:
        type: array
        items:
          type: string
    `)
    );
    expect(result).toMatchSnapshot();
  });

  // 3.0-#6: object
  it('3.0-#6: maps object with properties to TypeScript interface-like type', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      User:
        type: object
        properties:
          name: { type: string }
          age: { type: integer }
        required: [name]
    `)
    );
    expect(result).toMatchSnapshot();
  });
});

// ── Null via nullable (3.0-#7) — Tier 3, 3.0-specific ────────────────────
// 3.0 uses `nullable: true` instead of 3.1's `type: ["string", "null"]`.

describe('OpenAPI 3.0 — Null via nullable (3.0-#7)', () => {
  it('3.0-#7: nullable: true on string produces string | null', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      NullableName:
        type: string
        nullable: true
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#7: nullable: true on integer produces number | null', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      NullableInt:
        type: integer
        nullable: true
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#7: nullable: true on boolean produces boolean | null', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      NullableBool:
        type: boolean
        nullable: true
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#7: nullable: true on array produces T[] | null', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      NullableArray:
        type: array
        items:
          type: string
        nullable: true
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#7: nullable: true on object property produces property | null', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      User:
        type: object
        properties:
          name: { type: string }
          nickname: { type: string, nullable: true }
        required: [name, nickname]
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#7: nullable: true on enum produces enum | null', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      NullableStatus:
        type: string
        enum: [active, inactive]
        nullable: true
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#7: nullable: false produces regular type (no null)', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      NotNullable:
        type: string
        nullable: false
    `)
    );
    expect(result).toMatchSnapshot();
    expect(result).not.toContain('NotNullable = string | null');
  });

  it('3.0-#7: absent nullable produces regular type (no null)', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      RegularString:
        type: string
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#7: nullable inside allOf produces intersection | null', () => {
    const result = generateFromYaml(`
openapi: "3.0.3"
info: { title: Test, version: "1.0.0" }
paths: {}
components:
  schemas:
    Base:
      type: object
      properties:
        id: { type: string }
      required: [id]
    Extended:
      allOf:
        - $ref: "#/components/schemas/Base"
        - type: object
          properties:
            extra: { type: string }
      nullable: true
    `);
    expect(result).toMatchSnapshot();
  });

  it('3.0-#7: nullable inside oneOf produces union | null', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      NullableOneOf:
        oneOf:
          - type: string
          - type: number
        nullable: true
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#7: nullable without type produces unknown', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      NullableUntyped:
        nullable: true
    `)
    );
    expect(result).toMatchSnapshot();
  });
});

// ── Composition & Discriminator (3.0-#8-#11) — Inseparable Group, Tier 1 ─

describe('OpenAPI 3.0 — Composition & Discriminator (3.0-#8-#11)', () => {
  const DISCRIMINATOR_SPEC = `
openapi: "3.0.3"
info: { title: Test, version: "1.0.0" }
paths: {}
components:
  schemas:
    Pet:
      type: object
      properties:
        petType:
          type: string
      required: [petType]
      discriminator:
        propertyName: petType
        mapping:
          cat: "#/components/schemas/Cat"
          dog: "#/components/schemas/Dog"
    Cat:
      allOf:
        - $ref: "#/components/schemas/Pet"
        - type: object
          properties:
            meow:
              type: boolean
    Dog:
      allOf:
        - $ref: "#/components/schemas/Pet"
        - type: object
          properties:
            bark:
              type: boolean
    PetVariant:
      oneOf:
        - $ref: "#/components/schemas/Cat"
        - $ref: "#/components/schemas/Dog"
      discriminator:
        propertyName: petType
        mapping:
          cat: "#/components/schemas/Cat"
          dog: "#/components/schemas/Dog"
    MixedUnion:
      anyOf:
        - type: string
        - type: number
  `;

  // 3.0-#8: allOf
  it('3.0-#8: generates intersection type (&) for allOf', () => {
    const result = generateFromYaml(DISCRIMINATOR_SPEC);
    expect(result).toMatchSnapshot();
  });

  // 3.0-#9: oneOf
  it('3.0-#9: generates union type (|) for oneOf without discriminator', () => {
    const result = generateFromYaml(`
openapi: "3.0.3"
info: { title: Test, version: "1.0.0" }
paths: {}
components:
  schemas:
    Cat: { type: object, properties: { meow: { type: boolean } } }
    Dog: { type: object, properties: { bark: { type: boolean } } }
    Pet:
      oneOf:
        - $ref: "#/components/schemas/Cat"
        - $ref: "#/components/schemas/Dog"
    `);
    expect(result).toMatchSnapshot();
  });

  // 3.0-#10: anyOf
  it('3.0-#10: generates union type (|) for anyOf', () => {
    const result = generateFromYaml(DISCRIMINATOR_SPEC);
    expect(result).toMatchSnapshot();
  });

  // 3.0-#11: discriminator
  it('3.0-#11: generates discriminated union with propertyName and mapping', () => {
    const result = generateFromYaml(DISCRIMINATOR_SPEC);
    expect(result).toMatchSnapshot();
  });
});

// ── Enum & Const (3.0-#12-#13) — Tier 1 ───────────────────────────────────

describe('OpenAPI 3.0 — Enum & Const (3.0-#12-#13)', () => {
  // 3.0-#12: enum
  it('3.0-#12: generates string literal union for string enum', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Status:
        type: string
        enum: [active, inactive, pending]
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#12: generates number literal union for number enum', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Priority:
        type: integer
        enum: [1, 2, 3]
    `)
    );
    expect(result).toMatchSnapshot();
  });

  // 3.0-#13: const
  it('3.0-#13: does not crash when const is present with type — type is emitted, const ignored', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      FixedVersion:
        type: string
        const: "1.0.0"
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#13: produces unknown for const without type', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      JustConst:
        const: "hello"
    `)
    );
    expect(result).toMatchSnapshot();
  });
});

// ── Default & Description (3.0-#14-#15) — Tier 1 ─────────────────────────

describe('OpenAPI 3.0 — Default & Description (3.0-#14-#15)', () => {
  // 3.0-#14: default
  it('3.0-#14: does not crash with default value — property is correctly typed', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Config:
        type: object
        properties:
          name: { type: string }
          timeout: { type: integer, default: 30 }
        required: [name]
    `)
    );
    expect(result).toMatchSnapshot();
  });

  // 3.0-#15: description
  it('3.0-#15: generates JSDoc comment from description on schema', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Product:
        type: object
        description: "A product in the catalog"
        properties:
          name: { type: string }
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#15: generates JSDoc comment from description on individual type alias', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Email:
        type: string
        description: "A valid email address"
    `)
    );
    expect(result).toMatchSnapshot();
  });
});

// ── ReadOnly & WriteOnly (3.0-#16-#17) — Inseparable Pair, Tier 1 ────────

describe('OpenAPI 3.0 — ReadOnly & WriteOnly (3.0-#16-#17)', () => {
  const READ_WRITE_SPEC = `
openapi: "3.0.3"
info: { title: Test, version: "1.0.0" }
paths:
  /items:
    post:
      operationId: createItem
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                id:
                  type: string
                  readOnly: true
                password:
                  type: string
                  writeOnly: true
              required: [name, id, password]
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema:
                type: object
                properties:
                  name:
                    type: string
                  id:
                    type: string
                    readOnly: true
                  password:
                    type: string
                    writeOnly: true
                required: [name, id]
  `;

  // 3.0-#16: readOnly
  it('3.0-#16: excludes readOnly properties from request body type', () => {
    const { contracts, client } = generateClientFromYaml(READ_WRITE_SPEC);
    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    expect(contracts).not.toMatch(/PostItemsBody = \{[^}]*id[^}]*\}/s);
  });

  it('3.0-#16: includes readOnly properties in response type', () => {
    const { contracts, client } = generateClientFromYaml(READ_WRITE_SPEC);
    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.0-#17: writeOnly
  it('3.0-#17: excludes writeOnly properties from response type', () => {
    const { contracts, client } = generateClientFromYaml(READ_WRITE_SPEC);
    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    expect(contracts).not.toMatch(/PostItemsResponse.*=.*\{[^}]*password/s);
  });

  it('3.0-#17: includes writeOnly properties in request body type', () => {
    const { contracts, client } = generateClientFromYaml(READ_WRITE_SPEC);
    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });
});

// ── Deprecated (3.0-#18) — Tier 1 ─────────────────────────────────────────

describe('OpenAPI 3.0 — Deprecated (3.0-#18)', () => {
  it('3.0-#18: includes @deprecated JSDoc for deprecated operations', () => {
    const { contracts, client } = generateClientFromYaml(`
openapi: "3.0.3"
info: { title: Test, version: "1.0.0" }
paths:
  /old:
    get:
      operationId: oldEndpoint
      deprecated: true
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: string
    `);
    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.0-#18: does not crash for schema with deprecated flag', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      LegacyType:
        type: string
        deprecated: true
    `)
    );
    expect(result).toMatchSnapshot();
  });
});

// ── Format (3.0-#19) — Tier 1 ─────────────────────────────────────────────

describe('OpenAPI 3.0 — Format (3.0-#19)', () => {
  it('3.0-#19: generates branded type for date-time format on string', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      CreatedAt:
        type: string
        format: date-time
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#19: generates branded type for uuid format on string', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      UserId:
        type: string
        format: uuid
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#19: generates plain string for binary format (no branding)', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      FileData:
        type: string
        format: binary
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#19: generates plain string for byte format (no branding)', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Encoded:
        type: string
        format: byte
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#19: generates branded type for numeric format', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Score:
        type: integer
        format: int32
    `)
    );
    expect(result).toMatchSnapshot();
  });
});

// ── AdditionalProperties & Required (3.0-#20-#21) — Tier 1 ───────────────

describe('OpenAPI 3.0 — AdditionalProperties & Required (3.0-#20-#21)', () => {
  // 3.0-#20: additionalProperties
  it('3.0-#20: generates index signature for additionalProperties with type', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      StringMap:
        type: object
        additionalProperties: { type: string }
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#20: generates [key: string]: unknown for additionalProperties: true', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      FreeForm:
        type: object
        properties:
          name: { type: string }
        additionalProperties: true
    `)
    );
    expect(result).toMatchSnapshot();
  });

  // 3.0-#21: required
  it('3.0-#21: marks required properties without ?, optional properties with ?', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Profile:
        type: object
        properties:
          username: { type: string }
          email: { type: string }
          bio: { type: string }
        required: [username, email]
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#21: all properties optional when required is absent', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Flexible:
        type: object
        properties:
          a: { type: string }
          b: { type: integer }
    `)
    );
    expect(result).toMatchSnapshot();
  });
});

// ── Validation Constraints (3.0-#22-#28) — Tier 2 ─────────────────────────
// Test strategy: no crash + constraint NOT in TypeScript output + base type IS correct.

describe('OpenAPI 3.0 — Validation Constraints, Tier 2 (3.0-#22-#28)', () => {
  // 3.0-#22: minItems
  it('3.0-#22: minItems does not crash and is not emitted in output', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      TagList:
        type: array
        items: { type: string }
        minItems: 1
    `)
    );
    expect(result).toMatchSnapshot();
    expect(result).not.toContain('minItems');
  });

  // 3.0-#23: maxItems
  it('3.0-#23: maxItems does not crash and is not emitted in output', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      LimitedList:
        type: array
        items: { type: integer }
        maxItems: 10
    `)
    );
    expect(result).toMatchSnapshot();
    expect(result).not.toContain('maxItems');
  });

  // 3.0-#24: minLength
  it('3.0-#24: minLength does not crash and is not emitted in output', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Username:
        type: string
        minLength: 3
    `)
    );
    expect(result).toMatchSnapshot();
    expect(result).not.toContain('minLength');
  });

  // 3.0-#25: maxLength
  it('3.0-#25: maxLength does not crash and is not emitted in output', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      ShortName:
        type: string
        maxLength: 50
    `)
    );
    expect(result).toMatchSnapshot();
    expect(result).not.toContain('maxLength');
  });

  // 3.0-#26: pattern
  it('3.0-#26: pattern does not crash and is not emitted in output', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Email:
        type: string
        pattern: '^[a-zA-Z0-9]+@[a-zA-Z0-9]+\\.[a-zA-Z]{2,}$'
    `)
    );
    expect(result).toMatchSnapshot();
    expect(result).not.toContain('pattern');
  });

  // 3.0-#27: minimum
  it('3.0-#27: minimum does not crash and is not emitted in output', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Age:
        type: integer
        minimum: 0
    `)
    );
    expect(result).toMatchSnapshot();
    expect(result).not.toContain('minimum');
  });

  // 3.0-#28: maximum
  it('3.0-#28: maximum does not crash and is not emitted in output', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Percentage:
        type: integer
        maximum: 100
    `)
    );
    expect(result).toMatchSnapshot();
    expect(result).not.toContain('maximum');
  });

  it('3.0-#22-#28: multiple constraints together do not crash', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      BoundedString:
        type: string
        minLength: 1
        maxLength: 255
        pattern: "^[a-z]+$"
    `)
    );
    expect(result).toMatchSnapshot();
    expect(result).not.toContain('minLength');
    expect(result).not.toContain('maxLength');
    expect(result).not.toContain('pattern');
  });
});

// ── Exclusive Bounds (3.0-#29-#30) — Tier 3, 3.0-specific ────────────────
// 3.0 uses boolean exclusiveMinimum/Maximum + minimum/maximum.
// Normalized to numeric values matching 3.1 behavior.

describe('OpenAPI 3.0 — Exclusive Bounds, Tier 3 (3.0-#29-#30)', () => {
  // 3.0-#29: exclusiveMinimum as boolean
  it('3.0-#29: exclusiveMinimum: true + minimum: N produces correct type', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      ExclusiveMin:
        type: number
        minimum: 5
        exclusiveMinimum: true
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#29: exclusiveMinimum: false does not affect type', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      NonExclusive:
        type: number
        minimum: 0
        exclusiveMinimum: false
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#29: exclusiveMinimum without minimum does not crash', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      NoMin:
        type: number
        exclusiveMinimum: true
    `)
    );
    expect(result).toMatchSnapshot();
  });

  // 3.0-#30: exclusiveMaximum as boolean
  it('3.0-#30: exclusiveMaximum: true + maximum: N produces correct type', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      ExclusiveMax:
        type: integer
        maximum: 100
        exclusiveMaximum: true
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#30: exclusiveMaximum: false does not affect type', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      NonExclusiveMax:
        type: integer
        maximum: 100
        exclusiveMaximum: false
    `)
    );
    expect(result).toMatchSnapshot();
  });

  // Both exclusive bounds together
  it('3.0-#29-#30: both exclusive bounds produce correct type', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      BothBounded:
        type: number
        minimum: 0
        exclusiveMinimum: true
        maximum: 100
        exclusiveMaximum: true
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#29-#30: exclusive bounds with nullable produce correct type', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      NullableBounded:
        type: integer
        minimum: 1
        exclusiveMinimum: true
        maximum: 10
        exclusiveMaximum: true
        nullable: true
    `)
    );
    expect(result).toMatchSnapshot();
  });

  it('3.0-#29-#30: exclusive bounds on object property produce correct type', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Config:
        type: object
        properties:
          priority:
            type: integer
            minimum: 0
            exclusiveMinimum: true
            maximum: 10
            exclusiveMaximum: true
        required: [priority]
    `)
    );
    expect(result).toMatchSnapshot();
  });

  // Cross-version equivalence: 3.0 boolean produces same output as 3.1 numeric
  it('3.0-#29-#30: 3.0 boolean exclusive bounds produce same type as 3.1 numeric', () => {
    const result30 = generateFromYaml(
      BASE_SPEC(`
      Bounded:
        type: integer
        minimum: 1
        exclusiveMinimum: true
        maximum: 100
        exclusiveMaximum: true
    `)
    );

    const result31 = generateFromYaml(`
openapi: "3.1.0"
info: { title: Test, version: "1.0.0" }
paths: {}
components:
  schemas:
    Bounded:
      type: integer
      exclusiveMinimum: 1
      exclusiveMaximum: 100
    `);

    // Both should produce the same TypeScript type
    expect(result30).toContain('export type Bounded = number;');
    expect(result31).toContain('export type Bounded = number;');
    expect(result30).toMatchSnapshot();
    expect(result31).toMatchSnapshot();
  });
});

// ── $ref Siblings Stripped (3.0-specific behavior) ────────────────────────
// In 3.0, sibling properties alongside $ref are stripped (not merged as in 3.1).
// RefResolver defaults to preserveRefSiblings: false.

describe('OpenAPI 3.0 — $ref siblings stripped', () => {
  it('$ref siblings are stripped in 3.0: description on ref is ignored', () => {
    const result = generateFromYaml(`
openapi: "3.0.3"
info: { title: Test, version: "1.0.0" }
paths: {}
components:
  schemas:
    Target:
      type: object
      description: "Original target description"
      properties:
        value: { type: string }
    RefWithSibling:
      $ref: "#/components/schemas/Target"
      description: "This sibling should be ignored in 3.0"
    `);
    expect(result).toMatchSnapshot();
    expect(result).not.toContain('This sibling should be ignored in 3.0');
  });

  it('3.1 preserves $ref siblings when preserveRefSiblings is enabled', () => {
    // Verify 3.1 behavior is different — siblings are merged
    const doc: OpenAPIDocument = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Target: {
            type: 'object' as const,
            description: 'Original target description',
            properties: { value: { type: 'string' as const } },
          },
          RefWithSibling: {
            $ref: '#/components/schemas/Target',
            description: 'Override from sibling',
          } as unknown as Record<string, unknown>,
        },
      },
    };
    const resolver = new RefResolver(doc, undefined, {
      preserveRefSiblings: true,
    });
    const result = generateContracts(doc, resolver);
    expect(result).toMatchSnapshot();
  });
});

// ── Example keyword (3.0-specific) ────────────────────────────────────────
// 3.0 uses `example` (singular), normalized to `examples: [value]`.

describe('OpenAPI 3.0 — example keyword', () => {
  it('3.0 example does not crash and is not emitted in output', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Color:
        type: string
        example: red
    `)
    );
    expect(result).toMatchSnapshot();
    expect(result).not.toContain("'red'");
  });

  it('3.0 example on object does not crash', () => {
    const result = generateFromYaml(
      BASE_SPEC(`
      Product:
        type: object
        properties:
          name: { type: string }
          price: { type: number }
        example:
          name: Widget
          price: 9.99
    `)
    );
    expect(result).toMatchSnapshot();
  });
});
