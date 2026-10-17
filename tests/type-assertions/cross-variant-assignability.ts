// oxlint-disable no-underscore-dangle
// Compile-only type assertions for discriminator cross-variant assignability.
//
// Run: npx tsc --strict --noEmit --module nodenext --moduleResolution nodenext \
//       --ignoreConfig tests/type-assertions/cross-variant-assignability.ts
//
// Asserts the discriminator cross-variant semantics: every variant type —
// including a concrete base that joins its own union (#93) — is usable
// (not `never`), accepts a fully-populated object literal carrying its OWN
// discriminant literal, and rejects sibling / wrong-discriminant literals.
// This file compiles standalone — `genoc/runtime` is the only external module
// a fresh clone needs to resolve.
//
// Like tests/type-assertions/is-defined-error-types.ts, the shapes below are
// inline replicas of generator output (not imports of generated files), so the
// assertions survive without a generation step. They were transcribed verbatim
// from real generated contracts on the #93 concrete-base fix (base joins its
// union, children strip the discriminant via Omit):
//   node dist/cli/index.js tests/fixtures/dotnet-polymorphism-cross-variant.json --output-dir .tmp-qa/cross-variant
//   node dist/cli/index.js tests/fixtures/discriminator-spine-topologies.json --output-dir .tmp-qa/spine-topologies
// If the generator changes shape, regenerate and re-transcribe before trusting a green run.

type IsNever<T> = [T] extends [never] ? true : false;
type Accepts<T, U> = U extends T ? true : false;

// --- Replica of generated format-branded strings -----------------------------
type UuidString = string & { readonly __format?: 'uuid' };
type DateTimeString = string & { readonly __format?: 'date-time' };

// Shared values for branded props (keeps the sweep about variant usability,
// not about string-literal assignability to branded strings).
declare const anId: UuidString;

// ===========================================================================
// Fixture: dotnet-polymorphism-cross-variant.json
// Family BaseThing (prop `$type`): BaseThing / Partial / Full / Create
// Family BaseArtifact (prop `$type`): BaseArtifact / Bulletin
// ===========================================================================

type BaseThing = {
  id: UuidString;
} & { $type: 'BaseThing' };
type PartialThing = Omit<BaseThing, '$type'> & Record<string, unknown> & { $type: 'Partial' };
type UpdateThing = Omit<BaseThing, '$type'> & {
  name: string;
  description?: string;
  detectionDateTime?: DateTimeString;
  bulletin?: BulletinArtifact;
  affectedReleaseIds?: number[];
} & { $type: 'Full' };
type CreateThing = Omit<UpdateThing, '$type'> & Record<string, unknown> & { $type: 'Create' };
type BaseThingVariant = BaseThing | PartialThing | UpdateThing | CreateThing;

type BaseArtifact = {
  artifactId: string;
} & { $type: 'BaseArtifact' };
type BulletinArtifact = Omit<BaseArtifact, '$type'> & {
  url: string;
} & { $type: 'Bulletin' };
type BaseArtifactVariant = BaseArtifact | BulletinArtifact;

// --- BaseThing (concrete base joins its own union, #93) ----------------------
declare const baseThingIsNever: IsNever<BaseThing>;
const _baseThingNotNever: false = baseThingIsNever;
const baseThingOk: BaseThing = { $type: 'BaseThing', id: anId };
declare const baseThingRejectsPartial: Accepts<
  BaseThing,
  { $type: 'Partial'; id: UuidString; extra: string }
>;
const _baseThingRejectsPartial: false = baseThingRejectsPartial;

// --- PartialThing ------------------------------------------------------------
declare const partialIsNever: IsNever<PartialThing>;
const _partialNotNever: false = partialIsNever;
const partialOk: PartialThing = { $type: 'Partial', id: anId };
declare const partialRejectsFull: Accepts<PartialThing, { $type: 'Full'; id: UuidString }>;
const _partialRejectsFull: false = partialRejectsFull;
declare const partialRejectsCreate: Accepts<
  PartialThing,
  { $type: 'Create'; id: UuidString; name: string }
>;
const _partialRejectsCreate: false = partialRejectsCreate;

// --- UpdateThing -------------------------------------------------------------
declare const updateIsNever: IsNever<UpdateThing>;
const _updateNotNever: false = updateIsNever;
const updateOk: UpdateThing = { $type: 'Full', id: anId, name: 'upd' };
declare const updateRejectsPartial: Accepts<UpdateThing, { $type: 'Partial'; id: UuidString }>;
const _updateRejectsPartial: false = updateRejectsPartial;
declare const updateRejectsCreate: Accepts<
  UpdateThing,
  { $type: 'Create'; id: UuidString; name: string }
>;
const _updateRejectsCreate: false = updateRejectsCreate;

// --- CreateThing (same-family cross-variant inheritance via Omit) ------------
declare const createIsNever: IsNever<CreateThing>;
const _createNotNever: false = createIsNever;
const createOk: CreateThing = { $type: 'Create', id: anId, name: 'thing' };
declare const createRejectsFull: Accepts<
  CreateThing,
  { id: UuidString; name: string; $type: 'Full' }
>;
const _createRejectsFull: false = createRejectsFull;
declare const createRejectsPartial: Accepts<CreateThing, { id: UuidString; $type: 'Partial' }>;
const _createRejectsPartial: false = createRejectsPartial;

// --- BaseThingVariant union (always emitted, collision-safe name) ------------
declare const baseThingVariantIsNever: IsNever<BaseThingVariant>;
const _baseThingVariantNotNever: false = baseThingVariantIsNever;
const variantAsBase: BaseThingVariant = { $type: 'BaseThing', id: anId };
const variantAsPartial: BaseThingVariant = { $type: 'Partial', id: anId };
const variantAsUpdate: BaseThingVariant = { $type: 'Full', id: anId, name: 'u' };
const variantAsCreate: BaseThingVariant = { $type: 'Create', id: anId, name: 'c' };
declare const variantRejectsEmpty: Accepts<BaseThingVariant, Record<string, never>>;
const _variantRejectsEmpty: false = variantRejectsEmpty;

// --- BulletinArtifact (mapped variant still Omit-strips the base literal) ----
declare const bulletinIsNever: IsNever<BulletinArtifact>;
const _bulletinNotNever: false = bulletinIsNever;
const bulletinOk: BulletinArtifact = { $type: 'Bulletin', artifactId: 'a1', url: 'https://x' };
declare const bulletinRejectsWrongLiteral: Accepts<
  BulletinArtifact,
  { $type: 'Partial'; artifactId: string; url: string }
>;
const _bulletinRejectsWrongLiteral: false = bulletinRejectsWrongLiteral;

// --- BaseArtifactVariant union -----------------------------------------------
declare const baseArtifactVariantIsNever: IsNever<BaseArtifactVariant>;
const _baseArtifactVariantNotNever: false = baseArtifactVariantIsNever;
const artifactVariantAsBase: BaseArtifactVariant = { $type: 'BaseArtifact', artifactId: 'a1' };
const artifactVariantOk: BaseArtifactVariant = {
  $type: 'Bulletin',
  artifactId: 'a1',
  url: 'https://x',
};

// ===========================================================================
// Fixture: discriminator-spine-topologies.json
// Families: Chain0(chain) / Loop0(loop) / Multi0(mult) / Const0(mode) /
//           Uni0(uni) / Self0(self)
// ===========================================================================

type Chain0 = {} & { chain: 'Chain0' };
type ChainMid = Omit<Chain0, 'chain'> & { level: number } & { chain: 'mid' };
type ChainLeaf = Omit<ChainMid, 'chain'> & { leafNote: string } & { chain: 'leaf' };
type Chain0Variant = Chain0 | ChainMid | ChainLeaf;

// --- ChainMid / ChainLeaf (grandchild chain: Omit through the middle) --------
declare const chainMidIsNever: IsNever<ChainMid>;
const _chainMidNotNever: false = chainMidIsNever;
const chainMidOk: ChainMid = { chain: 'mid', level: 1 };
declare const chainMidRejectsLeaf: Accepts<
  ChainMid,
  { chain: 'leaf'; level: number; leafNote: string }
>;
const _chainMidRejectsLeaf: false = chainMidRejectsLeaf;

declare const chainLeafIsNever: IsNever<ChainLeaf>;
const _chainLeafNotNever: false = chainLeafIsNever;
const chainLeafOk: ChainLeaf = { chain: 'leaf', level: 2, leafNote: 'l' };
declare const chainLeafRejectsMid: Accepts<ChainLeaf, { chain: 'mid'; level: number }>;
const _chainLeafRejectsMid: false = chainLeafRejectsMid;

const chainVariantAsBase: Chain0Variant = { chain: 'Chain0' };
const chainVariantOk: Chain0Variant = { chain: 'leaf', level: 2, leafNote: 'l' };
declare const chainVariantIsNever: IsNever<Chain0Variant>;
const _chainVariantNotNever: false = chainVariantIsNever;
declare const chainVariantRejectsNoDiscriminant: Accepts<Chain0Variant, { level: number }>;
const _chainVariantRejectsNoDiscriminant: false = chainVariantRejectsNoDiscriminant;

type Loop0 = {} & { loop: 'Loop0' };
type LoopAlpha = Omit<Loop0, 'loop'> & { alphaNote: string } & { loop: 'alpha' };
type LoopBeta = Omit<Loop0, 'loop'> & {
  betaNote: string;
  partner?: LoopAlpha;
} & { loop: 'beta' };
type Loop0Variant = Loop0 | LoopAlpha | LoopBeta;

// --- LoopAlpha / LoopBeta (property-ref back-edge stays a bare name) ---------
declare const loopAlphaIsNever: IsNever<LoopAlpha>;
const _loopAlphaNotNever: false = loopAlphaIsNever;
const loopAlphaOk: LoopAlpha = { loop: 'alpha', alphaNote: 'a' };
declare const loopAlphaRejectsBeta: Accepts<LoopAlpha, { loop: 'beta'; betaNote: string }>;
const _loopAlphaRejectsBeta: false = loopAlphaRejectsBeta;

declare const loopAlphaValue: LoopAlpha;
declare const loopBetaIsNever: IsNever<LoopBeta>;
const _loopBetaNotNever: false = loopBetaIsNever;
const loopBetaOk: LoopBeta = { loop: 'beta', betaNote: 'b', partner: loopAlphaValue };
const loopBetaOkMinimal: LoopBeta = { loop: 'beta', betaNote: 'b' };
declare const loopBetaRejectsAlpha: Accepts<LoopBeta, { loop: 'alpha'; alphaNote: string }>;
const _loopBetaRejectsAlpha: false = loopBetaRejectsAlpha;

const loopVariantAsBase: Loop0Variant = { loop: 'Loop0' };
declare const loopVariantIsNever: IsNever<Loop0Variant>;
const _loopVariantNotNever: false = loopVariantIsNever;
const loopVariantOk: Loop0Variant = { loop: 'alpha', alphaNote: 'a' };

type Multi0 = {} & { mult: 'Multi0' };
type MultiLeft = Omit<Multi0, 'mult'> & { leftNote: string } & { mult: 'left' };
type MultiRight = Omit<Multi0, 'mult'> &
  Omit<MultiLeft, 'mult'> & { rightNote: string } & {
    mult: 'right';
  };
type Multi0Variant = Multi0 | MultiLeft | MultiRight;

// --- MultiLeft / MultiRight (multi-parent: base + same-family sibling) -------
declare const multiLeftIsNever: IsNever<MultiLeft>;
const _multiLeftNotNever: false = multiLeftIsNever;
const multiLeftOk: MultiLeft = { mult: 'left', leftNote: 'l' };
declare const multiLeftRejectsRight: Accepts<
  MultiLeft,
  { mult: 'right'; leftNote: string; rightNote: string }
>;
const _multiLeftRejectsRight: false = multiLeftRejectsRight;

declare const multiRightIsNever: IsNever<MultiRight>;
const _multiRightNotNever: false = multiRightIsNever;
const multiRightOk: MultiRight = { mult: 'right', leftNote: 'l', rightNote: 'r' };
declare const multiRightRejectsLeft: Accepts<MultiRight, { mult: 'left'; leftNote: string }>;
const _multiRightRejectsLeft: false = multiRightRejectsLeft;

const multiVariantAsBase: Multi0Variant = { mult: 'Multi0' };
declare const multiVariantIsNever: IsNever<Multi0Variant>;
const _multiVariantNotNever: false = multiVariantIsNever;
const multiVariantOk: Multi0Variant = { mult: 'right', leftNote: 'l', rightNote: 'r' };

type Const0 = {} & { mode: 'Const0' };
type ConstFast = Omit<Const0, 'mode'> & { speed: number } & { mode: 'fast' };
type Const0Variant = Const0 | ConstFast;

// --- ConstFast (own-enum conflict: mapping key wins, own 'slow' dropped) -----
declare const constFastIsNever: IsNever<ConstFast>;
const _constFastNotNever: false = constFastIsNever;
const constFastOk: ConstFast = { mode: 'fast', speed: 42 };
declare const constFastRejectsOwnEnum: Accepts<ConstFast, { mode: 'slow'; speed: number }>;
const _constFastRejectsOwnEnum: false = constFastRejectsOwnEnum;

const constVariantAsBase: Const0Variant = { mode: 'Const0' };
declare const constVariantIsNever: IsNever<Const0Variant>;
const _constVariantNotNever: false = constVariantIsNever;
const constVariantOk: Const0Variant = { mode: 'fast', speed: 42 };

type Uni0 = {} & { uni: 'Uni0' };
type UniA1 = { aOne: string };
type UniA2 = { aTwo: string };
type UniMix = (UniA1 | UniA2) & { uni: 'mix' };
type UniPick = Omit<Uni0, 'uni'> & (UniA1 | UniA2) & { pickNote: string } & { uni: 'pick' };
type Uni0Variant = Uni0 | UniMix | UniPick;

// --- UniMix / UniPick (oneOf-union spine target: literal appends to union) ---
declare const uniMixIsNever: IsNever<UniMix>;
const _uniMixNotNever: false = uniMixIsNever;
const uniMixOkA1: UniMix = { uni: 'mix', aOne: '1' };
const uniMixOkA2: UniMix = { uni: 'mix', aTwo: '2' };
declare const uniMixRejectsPick: Accepts<UniMix, { uni: 'pick'; aOne: string }>;
const _uniMixRejectsPick: false = uniMixRejectsPick;

declare const uniPickIsNever: IsNever<UniPick>;
const _uniPickNotNever: false = uniPickIsNever;
const uniPickOkA1: UniPick = { uni: 'pick', aOne: '1', pickNote: 'p' };
const uniPickOkA2: UniPick = { uni: 'pick', aTwo: '2', pickNote: 'p' };
declare const uniPickRejectsMix: Accepts<UniPick, { uni: 'mix'; aOne: string }>;
const _uniPickRejectsMix: false = uniPickRejectsMix;

const uniVariantAsBase: Uni0Variant = { uni: 'Uni0' };
declare const uniVariantIsNever: IsNever<Uni0Variant>;
const _uniVariantNotNever: false = uniVariantIsNever;
const uniVariantOk: Uni0Variant = { uni: 'mix', aOne: '1' };

type Self0 = {} & { self: 'Self0' };
type SelfKid = Omit<Self0, 'self'> & {
  parent: Self0Variant;
  kidNote?: string;
} & { self: 'kid' };
type Self0Variant = Self0 | SelfKid;

// --- SelfKid (base ref in a property widens: parent: Self0Variant) -----------
const selfVariantAsBase: Self0Variant = { self: 'Self0' };
declare const selfVariantValue: Self0Variant;
declare const selfKidIsNever: IsNever<SelfKid>;
const _selfKidNotNever: false = selfKidIsNever;
const selfKidOk: SelfKid = { self: 'kid', parent: selfVariantValue };
declare const selfKidRejectsMissingParent: Accepts<SelfKid, { self: 'kid'; kidNote: string }>;
const _selfKidRejectsMissingParent: false = selfKidRejectsMissingParent;
declare const selfKidRejectsWrongLiteral: Accepts<SelfKid, { self: 'other'; parent: Self0Variant }>;
const _selfKidRejectsWrongLiteral: false = selfKidRejectsWrongLiteral;

declare const selfVariantIsNever: IsNever<Self0Variant>;
const _selfVariantNotNever: false = selfVariantIsNever;
