// Which message namespaces each route's client components use (completion plan 5.7: per-page message catalogs).
//
// A client component reads its copy from the nearest NextIntlClientProvider, and the messages given to that
// provider travel with the page (HTML and RSC payload). Giving every page the whole catalog cost about 76 KB per
// page, so each route file gets only the namespaces that its client components ask for. This follows the imports
// from a route file (a page or a layout) and collects `useTranslations('…')` from every module that runs on the
// client: a `'use client'` module, and everything it imports. Server components read the full catalog on the
// server (src/i18n/request.ts) and need nothing here.
//
//   node scripts/client-messages.mjs          writes src/i18n/client-namespaces.generated.ts
//   node scripts/client-messages.mjs --check  fails if that file is out of date (src/i18n/client-messages.test.ts
//                                             checks the same in npm run check)
//
// Every page and layout gets its namespaces through `withClientMessages('<route file>', Page)` (the root layout:
// `<ClientMessages route="[locale]/layout.tsx">`), from src/i18n/client-messages.tsx.
//
// A namespace that isn't a string literal must be listed in DYNAMIC (the file, and every value it can take), or
// this fails: a guessed list would leave copy missing in production.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
export const OUTPUT = 'src/i18n/client-namespaces.generated.ts';

/** Modules whose namespace comes from a prop: every value the prop can take. */
export const DYNAMIC = {
  'src/ui/components/forms/pricing-fields.tsx': ['invites', 'availability', 'clients.form'],
};

const SOURCE = /\.(tsx?|mts|mjs|jsx?)$/;

function resolveImport(from, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(root, 'src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(from), specifier);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.mjs`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (SOURCE.test(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const FUNCTION_KINDS = new Set([ts.SyntaxKind.ArrowFunction, ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.FunctionExpression, ts.SyntaxKind.MethodDeclaration]);
const TRANSLATOR_METHODS = new Set(['rich', 'markup', 'raw', 'has']);
const DEPENDENCY_HOOKS = new Set(['useCallback', 'useMemo', 'useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useImperativeHandle']);

/** The part of a namespace a key reaches: a literal key whole, a template up to its last dot before `${`; else null. */
function keyOf(argument) {
  if (!argument) return null;
  if (ts.isStringLiteralLike(argument)) return argument.text || null;
  if (ts.isTemplateExpression(argument)) {
    const head = argument.head.text;
    const end = head.lastIndexOf('.');
    return end > 0 ? head.slice(0, end) : null;
  }
  return null;
}

function declares(fn, name) {
  let found = false;
  const look = (node) => {
    if (found) return;
    if ((ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node)) && ts.isIdentifier(node.name) && node.name.text === name) found = true;
    else ts.forEachChild(node, look);
  };
  fn.parameters?.forEach(look);
  if (fn.body) look(fn.body);
  return found;
}

/**
 * The keys a `const t = useTranslations('ns')` is called with, so a page gets `ns.key` rather than all of `ns`
 * (the people components read a few keys of "verification", which also holds the whole ID flow). Null when the
 * translator is used any other way (passed on, called with a computed key, not bound to a name): then the page
 * gets the whole namespace.
 */
function keysUsed(call) {
  const declaration = call.parent;
  if (!declaration || !ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name) || declaration.initializer !== call) return null;
  const name = declaration.name.text;
  let scope = declaration.parent;
  while (scope && !FUNCTION_KINDS.has(scope.kind) && !ts.isSourceFile(scope)) scope = scope.parent;
  const keys = new Set();
  let escaped = false;
  const visit = (node) => {
    if (escaped) return;
    if (node !== scope && FUNCTION_KINDS.has(node.kind) && declares(node, name)) return;
    if (ts.isIdentifier(node) && node.text === name && node !== declaration.name) {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.name === node) return;
      if ((ts.isPropertyAssignment(parent) || ts.isJsxAttribute(parent) || ts.isPropertySignature(parent)) && parent.name === node) return;
      let key;
      if (ts.isCallExpression(parent) && parent.expression === node) key = keyOf(parent.arguments[0]);
      else if (ts.isPropertyAccessExpression(parent) && parent.expression === node && TRANSLATOR_METHODS.has(parent.name.text) && ts.isCallExpression(parent.parent) && parent.parent.expression === parent) key = keyOf(parent.parent.arguments[0]);
      else if (ts.isArrayLiteralExpression(parent) && ts.isCallExpression(parent.parent) && ts.isIdentifier(parent.parent.expression) && DEPENDENCY_HOOKS.has(parent.parent.expression.text)) return;
      else key = null;
      if (key === null) escaped = true;
      else keys.add(key);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return escaped ? null : keys;
}

const parsed = new Map();
const ALL = '*';

/**
 * A module's directive, translation namespaces, and what it pulls in: `imports` (its own import declarations,
 * with the names taken, or ALL), `reexports` (`export { a as b } from`, followed only when `b` is wanted, which
 * keeps a barrel like `@/ui/screens/public` from pulling in every screen) and `stars` (`export * from`).
 */
function parse(file) {
  if (parsed.has(file)) return parsed.get(file);
  const relative = path.relative(root, file);
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let directive = null;
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === 'use client' || statement.expression.text === 'use server') directive = statement.expression.text;
  }
  const imports = [];
  const reexports = [];
  const stars = [];
  const namespaces = new Set();
  const problems = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveImport(file, node.moduleSpecifier.text);
      const clause = node.importClause;
      if (target && !clause?.isTypeOnly) {
        const names = new Set();
        let all = false;
        if (clause?.name) names.add('default');
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) all = true;
        if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) if (!element.isTypeOnly) names.add((element.propertyName ?? element.name).text);
        // A side-effect import (`import './x'`) still runs the module: an empty set means its body only.
        if (all || names.size > 0 || !clause) imports.push({ file: target, names: all ? ALL : names });
      }
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveImport(file, node.moduleSpecifier.text);
      if (target) {
        const clause = node.exportClause;
        if (!clause) stars.push(target);
        else if (ts.isNamespaceExport(clause)) reexports.push({ file: target, exported: clause.name.text, imported: ALL });
        else for (const element of clause.elements) if (!element.isTypeOnly) reexports.push({ file: target, exported: element.name.text, imported: (element.propertyName ?? element.name).text });
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        const target = resolveImport(file, node.arguments[0].text);
        if (target) imports.push({ file: target, names: ALL });
      }
      if (ts.isIdentifier(callee) && callee.text === 'useTranslations') {
        const [argument] = node.arguments;
        if (!argument) namespaces.add(ALL);
        else if (ts.isStringLiteralLike(argument)) {
          const keys = keysUsed(node);
          if (keys === null) namespaces.add(argument.text);
          else keys.forEach((key) => namespaces.add(`${argument.text}.${key}`));
        }
        else if (DYNAMIC[relative]) DYNAMIC[relative].forEach((namespace) => namespaces.add(namespace));
        else problems.push(`${relative}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: useTranslations with a namespace that isn't a string literal (list it in DYNAMIC in scripts/client-messages.mjs)`);
      }
      if (ts.isIdentifier(callee) && callee.text === 'useMessages') namespaces.add(ALL);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const result = { directive, imports, reexports, stars, namespaces: [...namespaces], problems };
  parsed.set(file, result);
  return result;
}

/** The namespaces used on the client by everything a route file renders, and the problems found on the way. */
export function clientNamespaces(entry) {
  const found = new Set();
  const problems = new Set();
  /** `${file}|${client}` → the names already followed (ALL, or a set) and whether its body was read. */
  const state = new Map();
  const queue = [{ file: path.resolve(root, entry), client: false, names: ALL }];
  while (queue.length) {
    const { file, client: inClient, names } = queue.pop();
    const info = parse(file);
    // A Server Action module runs on the server even when a client component imports it.
    if (info.directive === 'use server') continue;
    const client = inClient || info.directive === 'use client';
    const key = `${file}|${client}`;
    const seen = state.get(key) ?? { names: new Set(), body: false };
    state.set(key, seen);
    if (!seen.body) {
      seen.body = true;
      if (client) {
        info.namespaces.forEach((namespace) => found.add(namespace));
        info.problems.forEach((problem) => problems.add(problem));
      }
      for (const imported of info.imports) queue.push({ file: imported.file, client, names: imported.names });
    }
    if (seen.names === ALL) continue;
    const wanted = names === ALL ? ALL : new Set([...names].filter((name) => !seen.names.has(name)));
    if (wanted !== ALL && wanted.size === 0) continue;
    if (wanted === ALL) seen.names = ALL;
    else wanted.forEach((name) => seen.names.add(name));
    for (const reexport of info.reexports) {
      if (wanted === ALL || wanted.has(reexport.exported)) queue.push({ file: reexport.file, client, names: reexport.imported === ALL ? ALL : new Set([reexport.imported]) });
    }
    for (const star of info.stars) queue.push({ file: star, client, names: wanted });
  }
  return { namespaces: minimal([...found]), problems: [...problems] };
}

/** Sorted, without a namespace that another one in the list already contains ("forms" covers "forms.fieldErrors"). */
export function minimal(namespaces) {
  if (namespaces.includes('*')) return ['*'];
  const sorted = [...new Set(namespaces)].sort();
  return sorted.filter((namespace) => !sorted.some((other) => other !== namespace && namespace.startsWith(`${other}.`)));
}

function routeFiles(dir = path.join(root, 'src/app')) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...routeFiles(full));
    else if (/^(page|layout|template|error|loading|not-found|default)\.tsx$/.test(entry.name)) files.push(full);
  }
  return files;
}

/** route file (relative to src/app) → the namespaces its client components use. */
export function generate() {
  const routes = {};
  const problems = new Set();
  for (const file of routeFiles().sort()) {
    const result = clientNamespaces(path.relative(root, file));
    routes[path.relative(path.join(root, 'src/app'), file)] = result.namespaces;
    result.problems.forEach((problem) => problems.add(problem));
  }
  return { routes, problems: [...problems] };
}

/** The generated module's text. */
export function serialize(routes) {
  const lines = Object.entries(routes).map(([route, namespaces]) => `  ${JSON.stringify(route)}: [${namespaces.map((namespace) => JSON.stringify(namespace)).join(', ')}],`);
  return [
    '// Generated by scripts/client-messages.mjs from the imports of each route file: do not edit. Run',
    '// `node scripts/client-messages.mjs` after changing which client components a page uses.',
    '/** Route file (relative to src/app) → the message namespaces its client components use; "*" is all of them. */',
    'export const CLIENT_NAMESPACES = {',
    ...lines,
    '} as const satisfies Record<string, readonly string[]>;',
    '',
    'export type ClientRoute = keyof typeof CLIENT_NAMESPACES;',
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { routes, problems } = generate();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const target = path.join(root, OUTPUT);
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (current !== serialize(routes)) {
      console.error(`${OUTPUT} is out of date: run node scripts/client-messages.mjs`);
      process.exit(1);
    }
  } else {
    fs.writeFileSync(target, serialize(routes));
    console.log(`${OUTPUT}: ${Object.keys(routes).length} route files`);
  }
}
