import ts from 'typescript';

const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  esModuleInterop: true,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  skipLibCheck: true,
};

let sharedHost: ts.CompilerHost | undefined;

/**
 * Shared compiler host with a source-file cache. Default libs and the
 * `genoc/runtime` d.ts are parsed once per vitest worker and reused across
 * checks, so a steady-state check costs ~10ms instead of a ~600ms
 * `tsc` subprocess (which re-parses everything on every spawn).
 *
 * The cache assumes a file path is never rewritten with different content —
 * call sites must write into fresh `mkdtemp` directories.
 */
function getSharedHost(): ts.CompilerHost {
  if (sharedHost === undefined) {
    const base = ts.createCompilerHost(COMPILER_OPTIONS, false);
    const sourceFiles = new Map<string, ts.SourceFile | undefined>();
    const getSourceFile: ts.CompilerHost['getSourceFile'] = (
      fileName,
      languageVersionOrOptions,
      onError,
      shouldCreate
    ) => {
      if (!sourceFiles.has(fileName)) {
        sourceFiles.set(
          fileName,
          base.getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreate)
        );
      }
      return sourceFiles.get(fileName);
    };
    sharedHost = {
      ...base,
      getSourceFile,
      // Route every file lookup through the cached getSourceFile above.
      getSourceFileByPath: undefined,
    };
  }
  return sharedHost;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  let location = '';
  if (diagnostic.file !== undefined && diagnostic.start !== undefined) {
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    location = `${diagnostic.file.fileName}:${line + 1}:${character + 1} - `;
  }
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  return `${location}error TS${diagnostic.code}: ${message}`;
}

/**
 * Type-check generated output in process with the same flags the previous
 * `tsc --strict --noEmit --esModuleInterop --module NodeNext
 * --moduleResolution NodeNext --target ES2022 --skipLibCheck` spawns used.
 * Throws with formatted diagnostics when the files do not compile.
 */
export function expectFilesCompile(entryFiles: string[]): void {
  const program = ts.createProgram(entryFiles, COMPILER_OPTIONS, getSharedHost());
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const details = errors.map(formatDiagnostic).join('\n');
    throw new Error(`Type-check failed for ${entryFiles.join(', ')}:\n${details}`);
  }
}
