// oxlint-disable no-underscore-dangle
// Compile-only type assertions for discriminator cross-variant assignability.
//
// Run: npx tsc --strict --noEmit --module nodenext --moduleResolution nodenext \
//       --ignoreConfig tests/type-assertions/cross-variant-assignability.ts
//
// Asserts the discriminator cross-variant semantics: every variant type is
// usable (not `never`), accepts a fully-populated object literal carrying the
// parent's props plus the variant's OWN discriminant literal, and rejects
// sibling / wrong-discriminant literals. This file compiles standalone —
// `genoc/runtime` is the only external module a fresh clone needs to resolve.
//
// Like tests/type-assertions/is-defined-error-types.ts, the shapes below are
// inline replicas of generator output (not imports of generated files), so the
// assertions survive without a generation step. They were transcribed verbatim
// from real generated contracts on fix/discriminator-cross-variant @ e278932:
//   node dist/cli/index.js tests/fixtures/dotnet-polymorphism-cross-variant.json --output-dir .tmp-qa/cross-variant
//   node dist/cli/index.js tests/fixtures/discriminator-spine-topologies.json --output-dir .tmp-qa/spine-topologies
// If the generator changes shape, regenerate and re-transcribe before trusting a green run.

type IsNever<T> = [T] extends [never] ? true : false;
type Accepts<T, U> = U extends T ? true : false;

// --- Replica of generated format-branded strings -----------------------------
type UuidString = string & { readonly __format?: 'uuid' };

// Shared values for branded props (keeps the sweep about variant usability,
// not about string-literal assignability to branded strings).
declare const anId: UuidString;

// ===========================================================================
// Fixture: dotnet-polymorphism-cross-variant.json
// Family BaseThing (prop `$type`): Partial / Full / Create
// Family BaseArtifact (prop `$type`): Bulletin
// ===========================================================================

type BaseThing = { $type: string; id: UuidString };
type PartialThing = BaseThing & Record<string, unknown> & { $type: 'Partial' };
type UpdateThing = BaseThing & {
  name: string;
  description?: string;
  bulletin?: BulletinArtifact;
} & { $type: 'Full' };
type CreateThing = Omit<UpdateThing, '$type'> & Record<string, unknown> & { $type: 'Create' };
type BaseThingVariant = PartialThing | UpdateThing | CreateThing;

type BaseArtifact = { $type: string; artifactId: string };
type BulletinArtifact = BaseArtifact & {
  url: string;
} & { $type: 'Bulletin' };
type BaseArtifactVariant = BulletinArtifact;

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
const variantAsPartial: BaseThingVariant = { $type: 'Partial', id: anId };
const variantAsUpdate: BaseThingVariant = { $type: 'Full', id: anId, name: 'u' };
const variantAsCreate: BaseThingVariant = { $type: 'Create', id: anId, name: 'c' };
declare const variantRejectsEmpty: Accepts<BaseThingVariant, Record<string, never>>;
const _variantRejectsEmpty: false = variantRejectsEmpty;

// --- BulletinArtifact (single-member family still gets its own variant) ------
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

type Chain0 = { chain: string };
type ChainMid = Chain0 & { level: number } & { chain: 'mid' };
type ChainLeaf = Omit<ChainMid, 'chain'> & { leafNote: string } & { chain: 'leaf' };
type Chain0Variant = ChainMid | ChainLeaf;

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

const chainVariantOk: Chain0Variant = { chain: 'leaf', level: 2, leafNote: 'l' };
declare const chainVariantIsNever: IsNever<Chain0Variant>;
const _chainVariantNotNever: false = chainVariantIsNever;
declare const chainVariantRejectsNoDiscriminant: Accepts<Chain0Variant, { level: number }>;
const _chainVariantRejectsNoDiscriminant: false = chainVariantRejectsNoDiscriminant;

type Loop0 = { loop: string };
type LoopAlpha = Loop0 & { alphaNote: string } & { loop: 'alpha' };
type LoopBeta = Loop0 & {
  betaNote: string;
  partner?: LoopAlpha;
} & { loop: 'beta' };
type Loop0Variant = LoopAlpha | LoopBeta;

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

declare const loopVariantIsNever: IsNever<Loop0Variant>;
const _loopVariantNotNever: false = loopVariantIsNever;
const loopVariantOk: Loop0Variant = { loop: 'alpha', alphaNote: 'a' };

type Multi0 = { mult: string };
type MultiLeft = Multi0 & { leftNote: string } & { mult: 'left' };
type MultiRight = Multi0 & Omit<MultiLeft, 'mult'> & { rightNote: string } & { mult: 'right' };
type Multi0Variant = MultiLeft | MultiRight;

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

declare const multiVariantIsNever: IsNever<Multi0Variant>;
const _multiVariantNotNever: false = multiVariantIsNever;
const multiVariantOk: Multi0Variant = { mult: 'right', leftNote: 'l', rightNote: 'r' };

type Const0 = { mode: string };
type ConstFast = Const0 & { speed: number } & { mode: 'fast' };
type Const0Variant = ConstFast;

// --- ConstFast (own-enum conflict: mapping key wins, own 'slow' dropped) -----
declare const constFastIsNever: IsNever<ConstFast>;
const _constFastNotNever: false = constFastIsNever;
const constFastOk: ConstFast = { mode: 'fast', speed: 42 };
declare const constFastRejectsOwnEnum: Accepts<ConstFast, { mode: 'slow'; speed: number }>;
const _constFastRejectsOwnEnum: false = constFastRejectsOwnEnum;

declare const constVariantIsNever: IsNever<Const0Variant>;
const _constVariantNotNever: false = constVariantIsNever;
const constVariantOk: Const0Variant = { mode: 'fast', speed: 42 };

type Uni0 = { uni: string };
type UniA1 = { aOne: string };
type UniA2 = { aTwo: string };
type UniMix = (UniA1 | UniA2) & { uni: 'mix' };
type UniPick = Uni0 & (UniA1 | UniA2) & { pickNote: string } & { uni: 'pick' };
type Uni0Variant = UniMix | UniPick;

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

declare const uniVariantIsNever: IsNever<Uni0Variant>;
const _uniVariantNotNever: false = uniVariantIsNever;
const uniVariantOk: Uni0Variant = { uni: 'mix', aOne: '1' };

type Self0 = { self: string };
type Self0Variant = SelfKid;
type SelfKid = Self0 & {
  parent: Self0Variant;
  kidNote?: string;
} & { self: 'kid' };

// --- SelfKid (base ref in a property widens: parent: Self0Variant) -----------
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
