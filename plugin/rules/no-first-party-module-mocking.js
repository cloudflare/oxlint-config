import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const vitestSources = new Set(['vite-plus/test', 'vitest']);
const pathSources = new Set(['node:path', 'node:path/posix', 'path', 'path/posix']);
const urlSources = new Set(['node:url', 'url']);
const globalObjects = new Set(['global', 'globalThis', 'self', 'window']);
const moduleMockMethods = new Set(['doMock', 'mock']);
const aliasPrefixes = ['#', '@/', '~/'];
const sourceExtension = /\.[cm]?[jt]sx?$/;
const maxAliasDepth = 5;

const typeWrappers = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

function unwrap(node) {
  let current = node;
  while (current !== undefined && current !== null && typeWrappers.has(current.type)) {
    current = current.expression;
  }
  return current;
}

function resolveVariable(sourceCode, identifier) {
  let scope = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable;
    }
    scope = scope.upper;
  }
  return null;
}

function isUnbound(sourceCode, identifier) {
  const variable = resolveVariable(sourceCode, identifier);
  return variable === null || variable.defs.length === 0;
}

function staticPropertyName(member) {
  const { computed, property } = member;
  if (!computed && property.type === 'Identifier') {
    return property.name;
  }
  return computed ? staticString(property) : null;
}

function propertyKeyName(property) {
  if (!property.computed && property.key.type === 'Identifier') {
    return property.key.name;
  }
  return staticString(property.key);
}

function staticString(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

function isImportMeta(node, property) {
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'MetaProperty' &&
    node.object.meta.name === 'import' &&
    staticPropertyName(node) === property
  );
}

function isPathSpecifier(text) {
  return (
    text === '.' ||
    text === '..' ||
    text.startsWith('./') ||
    text.startsWith('../') ||
    text.startsWith('/') ||
    text.startsWith('file:') ||
    /^[A-Za-z]:[\\/]/.test(text)
  );
}

function matchesModule(specifier, entry) {
  return entry.endsWith('/')
    ? specifier.startsWith(entry)
    : specifier === entry || specifier.startsWith(`${entry}/`);
}

/** `**\/` entries match a path at any depth; other entries are anchored at the project root. */
function matchesEntry(candidate, entry, isPath) {
  if (!entry.startsWith('**/')) {
    return matchesModule(candidate, entry);
  }
  if (!isPath) {
    return false;
  }
  const rest = entry.slice(3);
  const segments = candidate.split('/');
  return segments.some((_, index) => matchesModule(segments.slice(index).join('/'), rest));
}

function normalizeEntries(entries) {
  return entries.map((entry) => entry.replace(/^\.?\/+/, '')).filter((entry) => entry !== '');
}

/** Classify a module specifier relative to the linted file and the project root. */
function classify(text, file) {
  if (!isPathSpecifier(text)) {
    return {
      candidates: [text],
      firstParty: aliasPrefixes.some((prefix) => text.startsWith(prefix)),
      isPath: false,
    };
  }
  let absolute;
  if (text.startsWith('file:')) {
    try {
      absolute = fileURLToPath(text);
    } catch {
      return { candidates: [], firstParty: true, isPath: true };
    }
  } else if (text.startsWith('.')) {
    absolute = resolve(dirname(file.filename), text);
  } else if (text.startsWith('/') && !text.startsWith(`${file.cwd}${sep}`)) {
    absolute = join(file.cwd, text);
  } else {
    absolute = text;
  }
  if (!isAbsolute(absolute)) {
    return { candidates: [], firstParty: true, isPath: true };
  }
  const trailingSlash = /[\\/]$/.test(text) ? '/' : '';
  const projectPath = `${relative(file.cwd, absolute).split(sep).join('/')}${trailingSlash}`;
  return {
    candidates: [projectPath, projectPath.replace(sourceExtension, '')],
    firstParty: !projectPath.split('/').includes('node_modules'),
    isPath: true,
  };
}

function isReported(text, file, { allow, deny }) {
  const { candidates, firstParty, isPath } = classify(text, file);
  const matches = (entry) => candidates.some((candidate) => matchesEntry(candidate, entry, isPath));
  if (allow.some(matches)) {
    return false;
  }
  return firstParty || deny.some(matches);
}

function importDefinitions(sourceCode, identifier, sources) {
  return (
    resolveVariable(sourceCode, identifier)?.defs.filter(
      (definition) =>
        definition.type === 'ImportBinding' &&
        definition.parent?.type === 'ImportDeclaration' &&
        sources(definition.parent.source.value),
    ) ?? []
  );
}

function importedName(specifier) {
  if (specifier.type === 'ImportSpecifier') {
    return specifier.imported.name ?? specifier.imported.value;
  }
  return null;
}

function isNamespaceOrDefault(definition) {
  return (
    definition.node.type === 'ImportNamespaceSpecifier' ||
    definition.node.type === 'ImportDefaultSpecifier'
  );
}

function isImportedFunction(sourceCode, callee, sources, name) {
  if (callee.type === 'Identifier') {
    return importDefinitions(sourceCode, callee, (source) => sources.has(source)).some(
      (definition) => importedName(definition.node) === name,
    );
  }
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    staticPropertyName(callee) === name &&
    importDefinitions(sourceCode, callee.object, (source) => sources.has(source)).some(
      isNamespaceOrDefault,
    )
  );
}

function declarator(sourceCode, identifier) {
  const variable = resolveVariable(sourceCode, identifier);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === 'Variable' && definition.node.type === 'VariableDeclarator'
    ? definition
    : null;
}

/** Find where a destructured binding such as `const { mock } = vi` came from. */
function destructuredFrom(sourceCode, identifier) {
  const definition = declarator(sourceCode, identifier);
  if (definition?.node.id.type !== 'ObjectPattern' || definition.node.init === null) {
    return null;
  }
  const property = definition.node.id.properties.find(
    (candidate) =>
      candidate.type === 'Property' &&
      (candidate.value.type === 'Identifier'
        ? candidate.value.name === identifier.name
        : candidate.value.type === 'AssignmentPattern' &&
          candidate.value.left.type === 'Identifier' &&
          candidate.value.left.name === identifier.name),
  );
  const key = property === undefined ? null : propertyKeyName(property);
  return key === null ? null : { key, object: definition.node.init };
}

/** `vi` may come from Vitest itself or be re-exported by a first-party test helper. */
function isViSource(context, lists, source) {
  if (vitestSources.has(source)) {
    return true;
  }
  const { candidates, firstParty, isPath } = classify(source, context);
  return (
    firstParty ||
    lists.deny.some((entry) =>
      candidates.some((candidate) => matchesEntry(candidate, entry, isPath)),
    )
  );
}

function isVi(context, wrapped, lists, depth = 0) {
  const node = unwrap(wrapped);
  if (depth > maxAliasDepth || node === undefined || node === null) {
    return false;
  }
  const { sourceCode } = context;
  const viSource = (source) => isViSource(context, lists, source);
  if (node.type === 'Identifier') {
    if (isUnbound(sourceCode, node)) {
      return node.name === 'vi';
    }
    if (
      importDefinitions(sourceCode, node, viSource).some(
        (definition) => importedName(definition.node) === 'vi',
      )
    ) {
      return true;
    }
    const definition = declarator(sourceCode, node);
    if (definition?.node.id.type === 'Identifier') {
      if (definition.node.init !== null) {
        return isVi(context, definition.node.init, lists, depth + 1);
      }
      return node.name === 'vi' && definition.parent?.declare === true;
    }
    const destructured = destructuredFrom(sourceCode, node);
    return destructured?.key === 'vi' && isViNamespace(context, destructured.object, lists);
  }
  if (node.type === 'MemberExpression' && staticPropertyName(node) === 'vi') {
    return isViNamespace(context, node.object, lists);
  }
  return false;
}

function isViNamespace(context, wrapped, lists) {
  const node = unwrap(wrapped);
  if (node?.type !== 'Identifier') {
    return false;
  }
  const { sourceCode } = context;
  if (globalObjects.has(node.name) && isUnbound(sourceCode, node)) {
    return true;
  }
  return importDefinitions(sourceCode, node, (source) => isViSource(context, lists, source)).some(
    (definition) => definition.node.type === 'ImportNamespaceSpecifier',
  );
}

function isModuleMockCallee(context, wrapped, lists) {
  const callee = unwrap(wrapped);
  if (callee.type === 'MemberExpression') {
    return moduleMockMethods.has(staticPropertyName(callee)) && isVi(context, callee.object, lists);
  }
  if (callee.type !== 'Identifier') {
    return false;
  }
  const destructured = destructuredFrom(context.sourceCode, callee);
  if (destructured !== null) {
    return moduleMockMethods.has(destructured.key) && isVi(context, destructured.object, lists);
  }
  const init = unwrap(declarator(context.sourceCode, callee)?.node.init);
  return (
    init?.type === 'MemberExpression' &&
    moduleMockMethods.has(staticPropertyName(init)) &&
    isVi(context, init.object, lists)
  );
}

/** Evaluate `path.resolve`, `path.join`, `new URL(..., import.meta.url)`, and `fileURLToPath`. */
function staticPath(context, wrapped) {
  const node = unwrap(wrapped);
  const text = staticString(node);
  if (text !== null) {
    return text;
  }
  if (node.type === 'Identifier' && isUnbound(context.sourceCode, node)) {
    if (node.name === '__dirname') {
      return dirname(context.filename);
    }
    return node.name === '__filename' ? context.filename : null;
  }
  if (isImportMeta(node, 'dirname')) {
    return dirname(context.filename);
  }
  if (isImportMeta(node, 'filename')) {
    return context.filename;
  }
  if (node.type === 'MemberExpression' && ['href', 'pathname'].includes(staticPropertyName(node))) {
    return staticUrlPath(node.object, context);
  }
  if (node.type !== 'CallExpression') {
    return null;
  }
  if (isImportMeta(node.callee, 'resolve')) {
    const specifier = node.arguments.length === 1 ? staticString(node.arguments[0]) : null;
    return specifier !== null && specifier.startsWith('.')
      ? resolve(dirname(context.filename), specifier)
      : specifier;
  }
  if (isImportedFunction(context.sourceCode, node.callee, urlSources, 'fileURLToPath')) {
    return node.arguments.length === 1 ? staticPath(context, node.arguments[0]) : null;
  }
  const method = ['join', 'resolve'].find((name) =>
    isImportedFunction(context.sourceCode, node.callee, pathSources, name),
  );
  if (method === undefined) {
    return null;
  }
  const parts = node.arguments.map((argument) => staticPath(context, argument));
  if (parts.includes(null)) {
    return null;
  }
  return method === 'resolve' ? resolve(context.cwd, ...parts) : join(...parts);
}

function staticUrlPath(node, context) {
  if (
    node.type !== 'NewExpression' ||
    node.callee.type !== 'Identifier' ||
    node.callee.name !== 'URL' ||
    !isUnbound(context.sourceCode, node.callee) ||
    node.arguments.length !== 2 ||
    !isImportMeta(node.arguments[1], 'url')
  ) {
    return null;
  }
  const text = staticString(node.arguments[0]);
  if (text === null) {
    return null;
  }
  try {
    const url = new URL(text, pathToFileURL(context.filename));
    return url.protocol === 'file:' ? fileURLToPath(url) : null;
  } catch {
    return null;
  }
}

/** Return the statically known specifier, or its static prefix for template literals. */
function mockedSpecifier(context, wrapped) {
  const argument = unwrap(wrapped);
  if (argument === undefined) {
    return null;
  }
  if (argument.type === 'ImportExpression') {
    return mockedSpecifier(context, argument.source);
  }
  if (argument.type === 'TemplateLiteral' && argument.expressions.length > 0) {
    const prefix = argument.quasis[0]?.value.cooked ?? '';
    return prefix === '' ? null : prefix;
  }
  const text = staticString(argument);
  if (text !== null) {
    return text;
  }
  const evaluated = staticPath(context, argument);
  return evaluated !== null && isAbsolute(evaluated) ? pathToFileURL(evaluated).href : evaluated;
}

/** Ban Vitest module mocks of first-party code in favor of real dependency seams. */
export const noFirstPartyModuleMockingRule = {
  createOnce(context) {
    let lists = { allow: [], deny: [] };
    return {
      before() {
        if (!/\bvi\b/.test(context.sourceCode.text)) {
          return false;
        }
        const { allow = [], deny = [] } = context.options[0] ?? {};
        lists = { allow: normalizeEntries(allow), deny: normalizeEntries(deny) };
      },
      CallExpression(node) {
        if (!isModuleMockCallee(context, node.callee, lists)) {
          return;
        }
        const argument = unwrap(node.arguments[0]);
        const specifier = mockedSpecifier(context, argument);
        if (specifier !== null && isReported(specifier, context, lists)) {
          const display = argument.type === 'ImportExpression' ? argument.source : argument;
          context.report({
            data: { specifier: staticString(display) ?? context.sourceCode.getText(display) },
            messageId: 'firstPartyModuleMock',
            node,
          });
        }
      },
    };
  },
  meta: {
    defaultOptions: [{ allow: [], deny: [] }],
    docs: {
      description:
        'Disallow Vitest module mocks of first-party code; replace dependencies through real interfaces instead.',
    },
    messages: {
      firstPartyModuleMock:
        "Don't mock module '{{specifier}}'. Pass the dependency in through a real interface, service layer, or faithful test implementation instead.",
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          allow: { items: { minLength: 1, type: 'string' }, type: 'array', uniqueItems: true },
          deny: { items: { minLength: 1, type: 'string' }, type: 'array', uniqueItems: true },
        },
        type: 'object',
      },
    ],
    type: 'problem',
  },
};
