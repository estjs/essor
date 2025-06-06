import { beforeEach, describe, expect, it } from 'vitest';
import { types as t } from '@babel/core';
import {
  addImport,
  clearImport,
  createImport,
  createImportIdentifiers,
  importedSets,
} from '../src/import';
import { addTemplateMaps, hasTemplateMaps, templateMaps } from '../src/jsx/context';
import { setupTestEnvironment, withTestContext } from './test-utils';

beforeEach(() => {
  setupTestEnvironment();
  templateMaps.length = 0; // Clear template maps
});

describe('import and Program Transformation', () => {
  describe('createImportIdentifiers', () => {
    it('should create unique identifiers for all USED_IMPORTS', () => {
      withTestContext('', 'client', {}, ({ path }) => {
        const identifiers = createImportIdentifiers(path);
        expect(Object.keys(identifiers).length).toBeGreaterThan(0);
        for (const key in identifiers) {
          expect(identifiers[key].type).toBe('Identifier');
          expect(identifiers[key].name).toMatch(/^_.*$/); // Verify naming convention
        }
      });
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
      withTestContext('const a = 1;', 'client', {}, ({ path }) => {
        // Setup for test
        const identifiers = createImportIdentifiers(path);
        addImport('signal');
        addImport('computed');

        // Create import
        createImport(path, identifiers, 'essor');

        // Verify import was added
        const body = path.node.body;
        expect(body.length).toBeGreaterThan(0);
        const firstNode = body[0];

        expect(firstNode.type).toBe('ImportDeclaration');
        if (t.isImportDeclaration(firstNode)) {
          expect(firstNode.source.value).toBe('essor');
          expect(firstNode.specifiers.length).toBe(2); // signal, computed

          // Check specifiers
          const signalSpecifier = firstNode.specifiers.find(
            s => t.isImportSpecifier(s) && s.local.name.includes('signal'),
          );
          expect(signalSpecifier).not.toBeUndefined();
        }
      });
    });

    it('should correctly map import names in SSG mode', () => {
      withTestContext('const a = 1;', 'ssg', {}, ({ path }) => {
        // Setup for test
        const identifiers = createImportIdentifiers(path);
        addImport('createComponent'); // Has mapping in SSG_IMPORTS_MAPS
        addImport('signal'); // No mapping

        // Create import
        createImport(path, identifiers, 'essor');

        // Verify import was added
        const body = path.node.body;
        expect(body.length).toBeGreaterThan(0);
        const firstNode = body[0];

        expect(firstNode.type).toBe('ImportDeclaration');
        if (t.isImportDeclaration(firstNode)) {
          expect(firstNode.source.value).toBe('essor');
          expect(firstNode.specifiers.length).toBe(2);

          // Verify createComponent is mapped to createSSGComponent
          const componentSpecifier = firstNode.specifiers.find(
            s =>
              t.isImportSpecifier(s) &&
              s.local.name.includes('createComponent') &&
              t.isIdentifier(s.imported) &&
              s.imported.name === 'createSSGComponent',
          );
          expect(componentSpecifier).not.toBeUndefined();

          // Verify signal is not mapped
          const signalSpecifier = firstNode.specifiers.find(
            s =>
              t.isImportSpecifier(s) &&
              s.local.name.includes('signal') &&
              t.isIdentifier(s.imported) &&
              s.imported.name === 'signal',
          );
          expect(signalSpecifier).not.toBeUndefined();
        }
      });
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
      const tmpl2 = { id: t.identifier('_tmpl$2'), template: '<span></span>' };

      addTemplateMaps(tmpl1);
      addTemplateMaps(tmpl2);

      expect(hasTemplateMaps('<div></div>')).toBe(tmpl1);
      expect(hasTemplateMaps('<span></span>')).toBe(tmpl2);
      expect(hasTemplateMaps('<p></p>')).toBe(undefined);
    });
  });
});
