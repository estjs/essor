/**
 * Core Context - Compilation context management
 */
import * as t from '@babel/types';
import type { NodePath } from '@babel/core';
import type {
  CompileContext,
  CompileMode,
  DeclarationRegistry,
  ImportRegistry,
  PluginOptions,
  TemplateRegistry,
  UIDGenerator,
} from './types';

export { emitArtifacts } from './emit';
export type { CompileContext } from './types';

const HYDRATE_IMPORT_REMAPS: Record<string, string> = {
  template: 'getRenderedElement',
  patchClass: 'patchClassHydrate',
  patchAttr: 'patchAttrHydrate',
  patchStyle: 'patchStyleHydrate',
};

// ===== Import Registry =====
class ImportRegistryImpl implements ImportRegistry {
  private imports = new Map<string, t.Identifier>();
  private mode: CompileMode;

  constructor(_programPath: NodePath<t.Program>, mode: CompileMode = 'client') {
    this.mode = mode;
  }

  get(name: string): t.Identifier {
    const importedName = this.mode === 'hydrate' ? (HYDRATE_IMPORT_REMAPS[name] ?? name) : name;
    if (this.imports.has(importedName)) {
      return this.imports.get(importedName)!;
    }

    // Generate identifier with $ suffix to match expected format: _signal$, _computed$, etc.
    const id = t.identifier(`_${importedName}$`);
    this.imports.set(importedName, id);
    return id;
  }

  has(name: string): boolean {
    const importedName = this.mode === 'hydrate' ? (HYDRATE_IMPORT_REMAPS[name] ?? name) : name;
    return this.imports.has(importedName);
  }

  getAll(): Map<string, t.Identifier> {
    return this.imports;
  }
}

// ===== Template Registry =====
class TemplateRegistryImpl implements TemplateRegistry {
  private templates: Array<{ id: t.Identifier; html: string; svg: boolean }> = [];
  private templateArrays: Array<{ id: string; parts: string[] }> = [];
  private htmlMap = new Map<string, t.Identifier>();
  private programPath: NodePath<t.Program>;
  private imports?: ImportRegistry;

  constructor(programPath: NodePath<t.Program>, imports?: ImportRegistry) {
    this.programPath = programPath;
    this.imports = imports;
  }

  register(html: string, isSVG: boolean): t.Identifier {
    this.imports?.get('template');
    if (this.htmlMap.has(html)) {
      return this.htmlMap.get(html)!;
    }

    const id = this.programPath.scope.generateUidIdentifier('t$');
    this.templates.push({ id, html, svg: isSVG });
    this.htmlMap.set(html, id);
    return id;
  }

  private partsMap = new Map<string, string>();

  add(parts: string[]): string {
    const key = parts.join('\0');
    if (this.partsMap.has(key)) {
      return this.partsMap.get(key)!;
    }
    const uid = this.programPath.scope.generateUidIdentifier('tmpl');
    // eslint-disable-next-line regexp/no-super-linear-backtracking
    const match = uid.name.match(/^(.+?)(\d+)$/);
    const id = match ? `${match[1]}$${match[2]}` : `${uid.name}$`;
    this.templateArrays.push({ id, parts });
    this.partsMap.set(key, id);
    return id;
  }

  getAll(): Array<{ id: t.Identifier; html: string; svg: boolean }> {
    return this.templates;
  }

  getAllArrays(): Array<{ id: string; parts: string[] }> {
    return this.templateArrays;
  }
}

// ===== UID Generator =====
class UIDGeneratorImpl implements UIDGenerator {
  private programPath: NodePath<t.Program>;

  constructor(programPath: NodePath<t.Program>) {
    this.programPath = programPath;
  }

  generate(base: string): t.Identifier {
    return this.programPath.scope.generateUidIdentifier(base);
  }
}

// ===== Declaration Registry =====
class DeclarationRegistryImpl implements DeclarationRegistry {
  private declarations: t.Statement[] = [];

  add(decl: t.Statement): void {
    this.declarations.push(decl);
  }

  getAll(): t.Statement[] {
    return this.declarations;
  }
}

// ===== Context Factory =====
export function createContext(
  programPath: NodePath<t.Program>,
  filename: string,
  options: PluginOptions,
): CompileContext {
  const mode: CompileMode = options.mode || 'client';

  const imports = new ImportRegistryImpl(programPath, mode);
  return {
    filename,
    mode,
    options,
    programPath,
    imports,
    templates: new TemplateRegistryImpl(programPath, imports),
    uids: new UIDGeneratorImpl(programPath),
    hoisted: new Map(),
    delegatedEvents: new Set(),
    declarations: new DeclarationRegistryImpl(),
  };
}
