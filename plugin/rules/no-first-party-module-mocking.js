import { dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const vitestSources = new Set(['vite-plus/test', 'vitest']);
const vitestNames = new Set(['vi', 'vitest']);
const pathSources = new Set(['node:path', 'node:path/posix', 'path', 'path/posix']);
const urlSources = new Set(['node:url', 'url']);
const globalObjects = new Set(['global', 'globalThis', 'self', 'window']);
const moduleMockMethods = new Set(['doMock', 'mock']);
const aliasPrefixes = ['#', '@/', '~/'];
const sourceExtension = /\.[cm]?[jt]sx?$/;

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

// Scope lookup adapted from dmmulroy/anti-slop. See ../LICENSE-anti-slop.
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
    const isAlias = aliasPrefixes.some((prefix) => text.startsWith(prefix));
    const normalized = isAlias ? posix.normalize(text) : text;
    return {
      candidates: isAlias ? [normalized, normalized.replace(sourceExtension, '')] : [text],
      firstParty: isAlias,
      isPath: isAlias,
    };
  }
  let absolute;
  if (text.startsWith('file:')) {
    try {
      absolute = fileURLToPath(text);
    } catch {
      return { candidates: [], firstParty: false, isPath: true };
    }
  } else if (text.startsWith('.')) {
    absolute = resolve(dirname(file.filename), text);
  } else if (text.startsWith('/') && !text.startsWith(`${file.cwd}${sep}`)) {
    absolute = join(file.cwd, text);
  } else {
    absolute = text;
  }
  const trailingSlash = /[\\/]$/.test(text) ? '/' : '';
  const normalized = isAbsolute(absolute)
    ? relative(file.cwd, absolute).split(sep).join('/')
    : win32.normalize(absolute).split('\\').join('/');
  const projectPath = normalized + trailingSlash;
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

function isValueImport(definition, sources) {
  return (
    definition.type === 'ImportBinding' &&
    definition.parent?.type === 'ImportDeclaration' &&
    definition.parent.importKind !== 'type' &&
    definition.node.importKind !== 'type' &&
    sources.has(definition.parent.source.value)
  );
}

function importDefinitions(sourceCode, identifier, sources) {
  return (
    resolveVariable(sourceCode, identifier)?.defs.filter((definition) =>
      isValueImport(definition, sources),
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
    return importDefinitions(sourceCode, callee, sources).some(
      (definition) => importedName(definition.node) === name,
    );
  }
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    staticPropertyName(callee) === name &&
    importDefinitions(sourceCode, callee.object, sources).some(isNamespaceOrDefault)
  );
}

/** The property that initialized this local in an object destructuring pattern. */
function destructuredKey(pattern, name) {
  const property = pattern.properties.find((candidate) => {
    if (candidate.type !== 'Property') {
      return false;
    }
    const local =
      candidate.value.type === 'AssignmentPattern' ? candidate.value.left : candidate.value;
    return local.type === 'Identifier' && local.name === name;
  });
  return property === undefined ? null : propertyKeyName(property);
}

function isViSource(context, source, vitestModules) {
  if (vitestModules.length === 0) {
    return vitestSources.has(source);
  }
  if (!isPathSpecifier(source)) {
    return vitestSources.has(source) || vitestModules.includes(source);
  }
  const { candidates } = classify(source, context);
  return candidates.some((candidate) => vitestModules.includes(`./${candidate}`));
}

// Walk the call backwards: mock/doMock belongs to the API, and vi/vitest belongs to its namespace.
function propertyOwner(expected, key) {
  if (expected === 'method' && moduleMockMethods.has(key)) {
    return 'api';
  }
  return expected === 'api' && vitestNames.has(key) ? 'namespace' : null;
}

function isModuleMockCallee(context, callee, { sources, vitestGlobals }) {
  const seen = new Set();
  let expected = 'method';
  let node = unwrap(callee);
  while (node && expected !== null) {
    if (node.type === 'MemberExpression') {
      expected = propertyOwner(expected, staticPropertyName(node));
      node = unwrap(node.object);
      continue;
    }
    if (node.type !== 'Identifier') {
      return false;
    }
    const variable = resolveVariable(context.sourceCode, node);
    if (!variable || variable.defs.length === 0) {
      return (
        vitestGlobals &&
        ((expected === 'api' && vitestNames.has(node.name)) ||
          (expected === 'namespace' && globalObjects.has(node.name)))
      );
    }
    if (variable.defs.length !== 1 || seen.has(variable)) {
      return false;
    }
    seen.add(variable);
    const [definition] = variable.defs;
    if (isValueImport(definition, sources)) {
      return (
        (expected === 'namespace' && definition.node.type === 'ImportNamespaceSpecifier') ||
        (expected === 'api' && vitestNames.has(importedName(definition.node)))
      );
    }
    if (
      definition.type !== 'Variable' ||
      definition.node.type !== 'VariableDeclarator' ||
      variable.references.some((ref) => ref.isWrite() && !ref.init)
    ) {
      return false;
    }
    const { id, init } = definition.node;
    if (id.type === 'ObjectPattern') {
      expected = propertyOwner(expected, destructuredKey(id, node.name));
    } else if (id.type !== 'Identifier') {
      return false;
    }
    node = unwrap(init);
  }
  return false;
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
  if (node.type === 'MemberExpression') {
    const property = staticPropertyName(node);
    if (property === 'href' || property === 'pathname') {
      return staticFileUrl(node.object, context)?.[property] ?? null;
    }
  }
  if (node.type !== 'CallExpression') {
    return null;
  }
  if (isImportMeta(node.callee, 'resolve')) {
    const specifier = node.arguments.length === 1 ? staticString(node.arguments[0]) : null;
    return specifier !== null && (specifier.startsWith('./') || specifier.startsWith('../'))
      ? new URL(specifier, pathToFileURL(context.filename)).href
      : specifier;
  }
  if (isImportedFunction(context.sourceCode, node.callee, urlSources, 'fileURLToPath')) {
    if (node.arguments.length !== 1) {
      return null;
    }
    const input = unwrap(node.arguments[0]);
    const url = staticFileUrl(input, context) ?? staticPath(context, input);
    if (url === null) {
      return null;
    }
    try {
      return fileURLToPath(url);
    } catch {
      return null;
    }
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

function staticFileUrl(node, context) {
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
    return url.protocol === 'file:' && url.hostname === '' ? url : null;
  } catch {
    return null;
  }
}

/** Only a complete module specifier can be checked against both allow and deny. */
function mockedSpecifier(context, wrapped) {
  const argument = unwrap(wrapped);
  if (argument === undefined) {
    return null;
  }
  if (argument.type === 'ImportExpression') {
    return mockedSpecifier(context, argument.source);
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
    let lists;
    return {
      before() {
        const {
          allow = [],
          deny = [],
          vitestGlobals = false,
          vitestModules = [],
        } = context.options[0] ?? {};
        const sources = new Set();
        for (const statement of context.sourceCode.ast.body) {
          if (
            statement.type === 'ImportDeclaration' &&
            isViSource(context, statement.source.value, vitestModules)
          ) {
            sources.add(statement.source.value);
          }
        }
        if (!vitestGlobals && sources.size === 0) {
          return false;
        }
        lists = {
          allow: normalizeEntries(allow),
          deny: normalizeEntries(deny),
          sources,
          vitestGlobals,
        };
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
          vitestGlobals: { type: 'boolean' },
          vitestModules: {
            items: { minLength: 1, type: 'string' },
            type: 'array',
            uniqueItems: true,
          },
        },
        type: 'object',
      },
    ],
    type: 'problem',
  },
};
