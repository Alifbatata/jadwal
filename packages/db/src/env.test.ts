// Paramètres de connexion : ce qui vient de l'environnement, ce qui a une valeur par défaut, et ce
// qui manque. Aucune base n'est nécessaire.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { connectionSettings, loadDotEnv, testDatabaseName } from './env.js';

const FULL: NodeJS.ProcessEnv = {
	POSTGRES_HOST: 'db.example.test',
	POSTGRES_PORT: '6543',
	POSTGRES_DB: 'jadwal_prod',
	POSTGRES_USER: 'proprietaire',
	POSTGRES_PASSWORD: 'secret-proprietaire',
	JADWAL_DB_OWNER_USER: 'proprio',
	JADWAL_DB_OWNER_PASSWORD: 'secret-proprio',
	JADWAL_DB_APP_USER: 'app',
	JADWAL_DB_APP_PASSWORD: 'secret-app',
	JADWAL_DB_SUPERADMIN_USER: 'admin',
	JADWAL_DB_SUPERADMIN_PASSWORD: 'secret-admin',
	JADWAL_DB_AUTH_USER: 'connexion',
	JADWAL_DB_AUTH_PASSWORD: 'secret-connexion'
};

describe('connectionSettings', () => {
	it('reads the server credentials from the environment', () => {
		// Le rôle du serveur est le seul à venir de POSTGRES_USER : il ne sert qu'à créer les rôles
		// et la base de test (ADR 0019).
		expect(connectionSettings('admin', {}, FULL)).toEqual({
			host: 'db.example.test',
			port: 6543,
			database: 'jadwal_prod',
			user: 'proprietaire',
			password: 'secret-proprietaire'
		});
	});

	it('reads the owner, which is not the server role', () => {
		expect(connectionSettings('owner', {}, FULL).user).toBe('proprio');
		expect(connectionSettings('owner', {}, FULL).password).toBe('secret-proprio');
		expect(connectionSettings('owner', {}, FULL).user).not.toBe(
			connectionSettings('admin', {}, FULL).user
		);
	});

	it('reads each application role with its own credentials', () => {
		expect(connectionSettings('app', {}, FULL).user).toBe('app');
		expect(connectionSettings('app', {}, FULL).password).toBe('secret-app');
		expect(connectionSettings('superadmin', {}, FULL).user).toBe('admin');
		expect(connectionSettings('superadmin', {}, FULL).password).toBe('secret-admin');
		expect(connectionSettings('auth', {}, FULL).user).toBe('connexion');
		expect(connectionSettings('auth', {}, FULL).password).toBe('secret-connexion');
	});

	it('falls back to the documented defaults for host, port, database and role names', () => {
		const minimal: NodeJS.ProcessEnv = {
			POSTGRES_USER: 'proprietaire',
			POSTGRES_PASSWORD: 'secret',
			JADWAL_DB_OWNER_PASSWORD: 'secret-proprio',
			JADWAL_DB_APP_PASSWORD: 'secret-app',
			JADWAL_DB_SUPERADMIN_PASSWORD: 'secret-admin',
			JADWAL_DB_AUTH_PASSWORD: 'secret-connexion'
		};
		expect(connectionSettings('admin', {}, minimal)).toEqual({
			host: '127.0.0.1',
			port: 5432,
			database: 'jadwal',
			user: 'proprietaire',
			password: 'secret'
		});
		expect(connectionSettings('owner', {}, minimal).user).toBe('jadwal_owner');
		expect(connectionSettings('app', {}, minimal).user).toBe('jadwal_app');
		expect(connectionSettings('superadmin', {}, minimal).user).toBe('jadwal_superadmin');
		expect(connectionSettings('auth', {}, minimal).user).toBe('jadwal_auth');
	});

	it('lets an override replace any field, the test database above all', () => {
		expect(connectionSettings('app', { database: 'jadwal_test' }, FULL).database).toBe(
			'jadwal_test'
		);
		expect(connectionSettings('admin', { host: 'autre', port: 1234 }, FULL)).toMatchObject({
			host: 'autre',
			port: 1234
		});
	});

	it('names the missing variable instead of connecting with nothing', () => {
		for (const [role, missing] of [
			['admin', 'POSTGRES_USER'],
			['admin', 'POSTGRES_PASSWORD'],
			['owner', 'JADWAL_DB_OWNER_PASSWORD'],
			['app', 'JADWAL_DB_APP_PASSWORD'],
			['superadmin', 'JADWAL_DB_SUPERADMIN_PASSWORD'],
			['auth', 'JADWAL_DB_AUTH_PASSWORD']
		] as const) {
			const env = { ...FULL, [missing]: undefined };
			expect(() => connectionSettings(role, {}, env), missing).toThrow(missing);
		}
		// Une valeur vide vaut une valeur absente : sinon la connexion échouerait plus loin.
		expect(() => connectionSettings('admin', {}, { ...FULL, POSTGRES_PASSWORD: '' })).toThrow(
			'POSTGRES_PASSWORD'
		);
	});

	it('refuses a port that is not a port', () => {
		for (const port of ['zéro', '0', '65536', '5432.5', '-1']) {
			expect(() => connectionSettings('admin', {}, { ...FULL, POSTGRES_PORT: port }), port).toThrow(
				'POSTGRES_PORT'
			);
		}
	});
});

describe('testDatabaseName', () => {
	it('defaults to jadwal_test and follows the environment', () => {
		expect(testDatabaseName({})).toBe('jadwal_test');
		expect(testDatabaseName({ JADWAL_TEST_DB: 'autre_base' })).toBe('autre_base');
	});
});

describe('loadDotEnv', () => {
	const directories: string[] = [];
	const names = ['JADWAL_TEST_ONLY_A', 'JADWAL_TEST_ONLY_B'];

	afterEach(() => {
		for (const name of names) delete process.env[name];
		for (const directory of directories.splice(0))
			rmSync(directory, { recursive: true, force: true });
	});

	function envFile(contents: string): string {
		const directory = mkdtempSync(join(tmpdir(), 'jadwal-env-'));
		directories.push(directory);
		const file = join(directory, '.env');
		writeFileSync(file, contents, 'utf8');
		return file;
	}

	it('reads the file into the environment', () => {
		expect(loadDotEnv(envFile('JADWAL_TEST_ONLY_A=depuis-le-fichier'))).toBe(true);
		expect(process.env['JADWAL_TEST_ONLY_A']).toBe('depuis-le-fichier');
	});

	it('leaves a variable already set in the environment alone', () => {
		process.env['JADWAL_TEST_ONLY_B'] = 'depuis-le-shell';
		loadDotEnv(envFile('JADWAL_TEST_ONLY_B=depuis-le-fichier'));
		// La CI passe ses valeurs sans fichier : le fichier ne doit jamais écraser l'environnement.
		expect(process.env['JADWAL_TEST_ONLY_B']).toBe('depuis-le-shell');
	});

	it('says no instead of throwing when there is no file', () => {
		const directory = mkdtempSync(join(tmpdir(), 'jadwal-env-'));
		directories.push(directory);
		expect(loadDotEnv(join(directory, '.env'))).toBe(false);
	});
});
