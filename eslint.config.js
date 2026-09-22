import path from 'node:path';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

// Configuration unique pour tout le monorepo (ESLint 10, flat config).
const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath, { gitignoreResolution: true }),
	{
		// Les versions publiées du widget sont du code déjà construit et minifié, servi tel quel à
		// jamais avec son empreinte d'intégrité (ADR 0005). Le corriger n'aurait aucun sens : le
		// corrigé ne serait plus ce que les organisations reçoivent, et son empreinte ne vaudrait plus.
		// De même pour les jeux de référence copiés tels quels depuis adhan-js.
		ignores: ['packages/widget/published/**', 'packages/core/src/prayer/reference/**']
	},
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint déconseille no-undef sur un projet TypeScript.
			// https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		// @jadwal/core : l'entrée principale reste sans dépendance à l'exécution. Seule `ics/` peut
		// importer ical-generator et le fournisseur de VTIMEZONE (ADR 0003) ; seule `prayer/` peut
		// importer adhan (ADR 0004). Une dépendance qui remonterait dans l'entrée principale la
		// ferait cesser d'être pure, et c'est la règle qui l'empêche.
		files: ['packages/core/src/**/*.ts'],
		ignores: ['packages/core/src/ics/**', 'packages/core/src/prayer/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{ name: 'ical-generator', message: 'Réservé à packages/core/src/ics.' },
						{ name: 'timezones-ical-library', message: 'Réservé à packages/core/src/ics.' },
						{ name: 'adhan', message: 'Réservé à packages/core/src/prayer.' }
					],
					patterns: [
						{ group: ['**/ics/**', '**/ics'], message: 'Réservé à packages/core/src/ics.' },
						{ group: ['**/prayer/**'], message: 'Réservé à packages/core/src/prayer.' }
					]
				}
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Les pages publiques construisent toutes leurs adresses dans `$lib/public/liens.ts`, qui
		// appelle bien `resolve`. La règle, elle, cherche l'appel dans l'attribut lui-même et ne
		// voit pas à travers une fonction : elle est donc désactivée ici, et seulement ici. La
		// vérification qu'elle apporte est faite à sa place par ce fichier unique, plus une route
		// inexistante y échouerait au typage — `resolve` est typé sur les routes du projet.
		files: ['apps/web/src/routes/m/**/*.svelte', 'apps/web/src/lib/public/*.svelte'],
		rules: { 'svelte/no-navigation-without-resolve': 'off' }
	},
	{
		// La page d'essai du widget imite le site d'une organisation : ses liens sont ceux qu'un
		// responsable colle à la main, écrits tels quels. Les faire passer par `resolve` en ferait
		// des liens du projet, et l'essai cesserait de ressembler à ce qu'il doit imiter.
		files: ['apps/web/src/routes/widget/**/*.svelte'],
		rules: { 'svelte/no-navigation-without-resolve': 'off' }
	}
);
