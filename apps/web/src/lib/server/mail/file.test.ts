// Le transport de développement : il écrit, il n'envoie pas, et il reste lisible quand plusieurs
// écritures se croisent.

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileMailer, lastEmail, readOutbox } from './file.js';
import { createMailer, mailTransport } from './index.js';
import { SmtpMailer } from './smtp.js';

let directory: string;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'jadwal-outbox-'));
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe('corbeille de sortie', () => {
	it('is empty before anything is sent, instead of failing', async () => {
		expect(await readOutbox(join(directory, 'jamais-cree'))).toEqual([]);
		expect(await lastEmail(directory)).toBeUndefined();
	});

	it('writes what it was given, and gives it back', async () => {
		const mailer = new FileMailer(directory);
		await mailer.send({
			to: 'responsable@example.test',
			subject: 'Votre lien de connexion',
			text: 'Ouvrez ce lien.',
			html: '<p>Ouvrez ce lien.</p>'
		});
		const mail = await lastEmail(directory);
		expect(mail?.to).toBe('responsable@example.test');
		expect(mail?.subject).toBe('Votre lien de connexion');
		expect(mail?.html).toBe('<p>Ouvrez ce lien.</p>');
		expect(Date.parse(mail?.sentAt ?? '')).not.toBeNaN();
	});

	it('keeps them in the order they were sent', async () => {
		const mailer = new FileMailer(directory);
		for (const subject of ['premier', 'deuxième', 'troisième']) {
			await mailer.send({ to: 'a@example.test', subject, text: subject, html: subject });
		}
		expect((await readOutbox(directory)).map((mail) => mail.subject)).toEqual([
			'premier',
			'deuxième',
			'troisième'
		]);
		expect((await lastEmail(directory))?.subject).toBe('troisième');
	});

	it('survives writes that cross each other, and leaves no temporary file behind', async () => {
		const mailer = new FileMailer(directory);
		await Promise.all(
			Array.from({ length: 40 }, (_, index) =>
				mailer.send({
					to: `personne${index}@example.test`,
					subject: `sujet ${index}`,
					// Une charge assez grosse pour qu'une écriture en append se déchire : c'est le cas
					// qui a fait écarter le fichier unique en lignes JSON.
					text: 'x'.repeat(600_000),
					html: '<p>x</p>'
				})
			)
		);
		const all = await readOutbox(directory);
		expect(all).toHaveLength(40);
		expect(new Set(all.map((mail) => mail.to)).size).toBe(40);
		const names = await readdir(directory);
		expect(names.filter((name) => name.endsWith('.tmp'))).toEqual([]);
	});

	it('names its files so that Windows accepts them', async () => {
		await new FileMailer(directory).send({
			to: 'a@example.test',
			subject: 'sujet',
			text: 'texte',
			html: 'html'
		});
		for (const name of await readdir(directory)) {
			// `:` et `*` sont illégaux dans un nom de fichier sous Windows ; l'horodatage ISO en
			// contient. Le tri lexicographique doit rester l'ordre chronologique malgré tout.
			expect(name, name).not.toMatch(/[:*?"<>|]/);
			expect(name, name).toMatch(/^\d{4}-\d{2}-\d{2}T[\d-]+Z_\d{6}_\d{8}_[0-9a-f]{8}\.json$/);
		}
	});
});

describe('choix du transport', () => {
	it('writes to a file when nothing is configured, instead of sending', () => {
		expect(mailTransport({})).toBe('file');
		expect(createMailer({})).toBeInstanceOf(FileMailer);
	});

	it('refuses a transport it does not know', () => {
		expect(() => mailTransport({ MAIL_TRANSPORT: 'sendmail' })).toThrow('MAIL_TRANSPORT');
	});

	it('names the missing variable instead of sending nowhere', () => {
		expect(() => createMailer({ MAIL_TRANSPORT: 'smtp' })).toThrow('SMTP_HOST');
		expect(() => createMailer({ MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'mail.example.test' })).toThrow(
			'SMTP_PORT'
		);
		expect(() =>
			createMailer({ MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'mail.example.test', SMTP_PORT: '587' })
		).toThrow('MAIL_FROM');
	});

	it('refuses a port that is not a port, instead of dialling nowhere', () => {
		expect(() =>
			createMailer({ MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'mail.example.test', SMTP_PORT: 'zut' })
		).toThrow('SMTP_PORT');
	});

	it('builds the SMTP transport once every variable is there', () => {
		const mailer = createMailer({
			MAIL_TRANSPORT: 'smtp',
			SMTP_HOST: 'mail.example.test',
			SMTP_PORT: '587',
			MAIL_FROM: 'jadwal@example.test'
		});
		expect(mailer).toBeInstanceOf(SmtpMailer);
	});
});
