// oxlint-disable no-underscore-dangle
// Compile-only type assertions for discriminator cross-variant assignability.
//
// Run: npx tsc --strict --noEmit --module nodenext --moduleResolution nodenext \
//       --ignoreConfig tests/type-assertions/cross-variant-assignability.ts
//
// T13 SKELETON (plan task 1): asserts the NEW architecture's semantics —
// cross-variant types are usable (not `never`), accept a fully-populated
// object, and reject sibling literals. The shapes below are inline replicas
// of the target generator output for tests/fixtures/dotnet-polymorphism-cross-variant.json.
//
// TODO(Task 6): replace the replicas with imports from generated output
// (generate to .tmp-qa/cross-variant/ and import from its contracts.js),
// sweep EVERY variant in the cross-variant + spine-topologies fixtures, and
// add per-sibling negative assertions for each family.

type IsNever<T> = [T] extends [never] ? true : false;
type Accepts<T, U> = U extends T ? true : false;

// --- Expected generated shapes (replicas; see TODO above) -----------------
// Mirrors the .NET System.Text.Json fixture:
//   BaseThing (discriminator $type: Partial/Full/Create) <- UpdateThing ("Full")
//   <- CreateThing ("Create", extends the sibling variant via allOf)
type BaseThingReplica = { $type: string; id: string };
type UpdateThingReplica = BaseThingReplica & { name: string } & { $type: 'Full' };
type CreateThingReplica = Omit<UpdateThingReplica, '$type'> &
  Record<string, unknown> & {
    $type: 'Create';
  };
// --------------------------------------------------------------------------------

// Not never: the cross-variant intersection does not collapse.
declare const createIsNever: IsNever<CreateThingReplica>;
const _createNotNever: false = createIsNever;

// Positive assignability: parent props + own literal satisfy the child.
const createOk: CreateThingReplica = { id: 'e1', name: 'thing', $type: 'Create' };

// Negative: the parent's literal must NOT satisfy the child.
declare const fullLiteralRejected: Accepts<
  CreateThingReplica,
  { id: string; name: string; $type: 'Full' }
>;
const _fullLiteralRejected: false = fullLiteralRejected;

// Negative: a sibling's literal must NOT satisfy the child.
declare const partialLiteralRejected: Accepts<CreateThingReplica, { id: string; $type: 'Partial' }>;
const _partialLiteralRejected: false = partialLiteralRejected;

// The parent variant stays usable and keeps exactly its own literal.
declare const updateIsNever: IsNever<UpdateThingReplica>;
const _updateNotNever: false = updateIsNever;
const updateOk: UpdateThingReplica = { id: 'e2', name: 'upd', $type: 'Full' };
