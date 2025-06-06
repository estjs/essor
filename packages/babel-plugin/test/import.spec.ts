import { beforeEach, describe, expect, it } from 'vitest';
import { NodePath, types as t } from '@babel/core';
import {
  addImport,
  clearImport,
  createImport,
  createImportIdentifiers,
  importedSets,
} from '../src/import';
import { RENDER_MODE } from '../src/constants';
import { addTemplateMaps, hasTemplateMaps, resetContext, templateMaps } from '../src/jsx/context';
import { getProgramPath } from './test-utils';

// Helper function: Get the path of a Program node
// const getProgramPath = (code: string, options?: any) => {
//   let programPath: any = null;
//   transformSync(code, {
//     plugins: [
//       () => ({
//         visitor: {
//           Program(path: any) {
//             programPath = path;
//             path.stop();
//           },
//         },
//       }),
//       [essorPlugin, { mode: 'client', ...options }],
//     ],
//     filename: 'test.tsx',
//     parserOpts: {
//       plugins: ['jsx', 'typescript'],
//     },
//     babelrc: false,
//     configFile: false,
//   });
//   return programPath;
// };

beforeEach(() => {
  clearImport();
  resetContext();
  templateMaps.length = 0; // Clear template maps
});

describe('import and Program Transformation', () => {
  describe('createImportIdentifiers', () => {
    it('should create unique identifiers for all USED_IMPORTS', () => {
      const programPath = getProgramPath('') as unknown as NodePath<t.Program>;
      const identifiers = createImportIdentifiers(programPath);
      expect(Object.keys(identifiers).length).toBeGreaterThan(0);
      for (const key in identifiers) {
        expect(identifiers[key].type).toBe('Identifier');
        expect(identifiers[key].name).toMatch(/^_.*$/); // Verify naming convention
      }
    });
  });

  describe('addImport / clearImport / importedSets', () => {
    it('should correctly add and clear import names', () => {
      expect(importedSets.size).toBe(0);
      addImport('signal');
      expect(importedSets.has('signal')).toBe(true);
      addImport('computed');
      expect(importedSets.has('computed')).toBe(true);
      expect(importedSets.size).toBe(2);
      clearImport();
      expect(importedSets.size).toBe(0);
    });
  });

  describe('createImport', () => {
    it('should insert import declaration at the beginning of the Program', () => {
      const code = 'const a = 1;';
      const programPath = getProgramPath(code) as unknown as NodePath<t.Program>;
      const identifiers = createImportIdentifiers(programPath);

      addImport('signal');
      addImport('computed');

      createImport(programPath, identifiers, 'essor');

      const firstNode = programPath.node.body[0];
      expect(firstNode.type).toBe('ImportDeclaration');
      expect(firstNode.source.value).toBe('essor');
      expect(firstNode.specifiers.length).toBe(2); // signal, computed
      expect((firstNode.specifiers[0] as t.ImportSpecifier).local.name).toMatch(/_signal$/);
    });

    it('should correctly map import names in SSG mode', () => {
      const code = 'const a = 1;';
      const programPath = getProgramPath(code, {
        mode: RENDER_MODE.SSG,
      }) as unknown as NodePath<t.Program>;
      const identifiers = createImportIdentifiers(programPath);

      addImport('createComponent'); // Has mapping in SSG_IMPORTS_MAPS
      addImport('signal'); // No mapping

      createImport(programPath, identifiers, 'essor');

      const firstNode = programPath.node.body[0];
      expect(firstNode.type).toBe('ImportDeclaration');
      expect(firstNode.source.value).toBe('essor');
      expect(firstNode.specifiers.length).toBe(2);

      // Verify createComponent is mapped to createSSGComponent
      const createComponentSpecifier = firstNode.specifiers.find((s: any) =>
        s.local.name.includes('createComponent$'),
      );
      expect(((createComponentSpecifier as t.ImportSpecifier).imported as t.Identifier).name).toBe(
        'createSSGComponent',
      );

      // Verify signal is not mapped
      const signalSpecifier = firstNode.specifiers.find((s: any) =>
        s.local.name.includes('signal$'),
      );
      expect(((signalSpecifier as t.ImportSpecifier).imported as t.Identifier).name).toBe('signal');
    });
  });

  describe('templateMaps and related functions', () => {
    it('addTemplateMaps should add template information', () => {
      addTemplateMaps({ id: t.identifier('_tmpl$1'), template: '<div></div>' });
      expect(templateMaps.length).toBe(1);
      expect(templateMaps[0].template).toBe('<div></div>');
    });

    it('hasTemplateMaps should find existing templates', () => {
      const tmpl1 = { id: t.identifier('_tmpl$1'), template: '<div></div>' };
      const tmpl2 = { id: t.identifier('_tmpl$2'), template: '<p></p>' };
      addTemplateMaps(tmpl1);
      addTemplateMaps(tmpl2);

      expect(hasTemplateMaps('<div></div>')).toBe(tmpl1);
      expect(hasTemplateMaps('<span></span>')).toBeUndefined();
    });

    it('transformProgram.exit should insert template declaration', () => {
      const code = 'const MyComponent = () => <div>Hello</div>;';
      const programPath = getProgramPath(code) as unknown as NodePath<t.Program>; // Simulate enter phase
      // Simulate processTemplate phase adding template
      addTemplateMaps({ id: t.identifier('_tmpl$0'), template: '<div data-idx="0-1">Hello</div>' });

      // Manually call exit phase
      programPath.state.imports = createImportIdentifiers(programPath);
      programPath.state.opts = { mode: RENDER_MODE.CLIENT };
      programPath.state.hmrEnabled = false;
      programPath.state.filename = 'test.tsx';

      const originalBodyLength = programPath.node.body.length;
      programPath.scope.crawl(); // Recrawl scope to ensure all identifiers are available

      programPath.visitors.Program.exit(programPath, programPath.state);

      expect(programPath.node.body.length).toBeGreaterThan(originalBodyLength);
      const insertedNode = programPath.node.body[0]; // Should be at the beginning
      expect(insertedNode.type).toBe('VariableDeclaration');
      expect(insertedNode.declarations[0].id.name).toBe('_tmpl$0');
      expect(
        ((insertedNode.declarations[0].init as t.CallExpression).callee as t.Identifier).name,
      ).toMatch(/_tmpl$/);
      expect(
        ((insertedNode.declarations[0].init as t.CallExpression).arguments[0] as t.StringLiteral)
          .value,
      ).toBe('<div data-idx="0-1">Hello</div>');
    });

    it('transformProgram.exit should insert array-form template declaration in SSG mode', () => {
      const code = 'const MyComponent = () => <div>Hello</div>;';
      const programPath = getProgramPath(code, {
        mode: RENDER_MODE.SSG,
      }) as unknown as NodePath<t.Program>;
      addTemplateMaps({
        id: t.identifier('_tmpl$0'),
        template: ['<div data-idx="0-1">Hello', '</div>'],
      });

      programPath.state.imports = createImportIdentifiers(programPath);
      programPath.state.opts = { mode: RENDER_MODE.SSG };
      programPath.state.hmrEnabled = false;
      programPath.state.filename = 'test.tsx';
      programPath.scope.crawl();

      programPath.visitors.Program.exit(programPath, programPath.state);

      const insertedNode = programPath.node.body[0];
      expect(insertedNode.type).toBe('VariableDeclaration');
      expect(insertedNode.declarations[0].id.name).toBe('_tmpl$0');
      expect((insertedNode.declarations[0].init as t.ArrayExpression).elements.length).toBe(2);
      expect(
        ((insertedNode.declarations[0].init as t.ArrayExpression).elements[0] as t.StringLiteral)
          .value,
      ).toBe('<div data-idx="0-1">Hello');
    });
  });
});
