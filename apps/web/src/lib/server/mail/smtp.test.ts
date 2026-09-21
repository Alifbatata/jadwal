// Le transport SMTP : les réglages qu'il pose, et ce qu'il fait d'un échec (ADR 0024).
//
// Deux façons de regarder. `createTransport` est remplacé pour lire les réglages tels que
// `nodemailer` les reçoit — c'est la seule manière de prouver qu'un port 587 exige bien STARTTLS.
// Le reste passe par un transporteur factice injecté, qui compte les tentatives.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transporter } from 'nodemailer';
import { createMailer } from './index.js';
import { describeSmtpFailure, isTemporary, SmtpMailer } from './smtp.js';
import type { OutgoingEmail } from './types.js';

const captured: Record<string, unknown>[] = [];

vi.mock('nodemailer', () => ({
	createTransport: (options: Record<string, unknown>) => {
		captured.push(options);
		return { sendMail: async () => ({}) } as unknown as Transporter;
	}
}));

const MESSAGE: OutgoingEmail = {
	to: 'responsable@example.test',
	subject: 'Votre lien de connexion à jadwal',
	text: 'https://jadwal.example.test/connexion?token=SECRET',
	html: '<a href="https://jadwal.example.test/connexion?token=SECRET">lien</a>'
};

/** Un transporteur qui échoue autant de fois qu'on le lui demande, puis réussit. */
function flakyTransporter(failures: Array<unknown>) {
	const calls: Array<Record<string, unknown>> = [];
	const transporter = {
		sendMail: async (options: Record<string, unknown>) => {
			calls.push(options);
			const failure = failures[calls.length - 1];
			if (failure) throw failure;
			return {};
		}
	} as unknown as Transporter;
	return { transporter, calls };
}

const temporaire = Object.assign(new Error('452 too many recipients'), {
	code: 'EENVELOPE',
	responseCode: 452,
	command: 'RCPT TO'
});
const definitif = Object.assign(new Error('550 mailbox unavailable'), {
	code: 'EENVELOPE',
	responseCode: 550,
	command: 'RCPT TO'
});
const reseau = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });

beforeEach(() => {
	captured.length = 0;
	vi.restoreAllMocks();
});

describe('les réglages posés sur nodemailer', () => {
	it('asks for STARTTLS on 587, and does not pretend the connection is already secure', () => {
		createMailer({
			MAIL_TRANSPORT: 'smtp',
			SMTP_HOST: 'mail.infomaniak.com',
			SMTP_PORT: '587',
			SMTP_USER: 'jadwal@example.test',
			SMTP_PASSWORD: 'secret',
			MAIL_FROM: 'jadwal@example.test'
		});
		expect(captured).toHaveLength(1);
		expect(captured[0]).toMatchObject({
			host: 'mail.infomaniak.com',
			port: 587,
			secure: false,
			requireTLS: true,
			auth: { user: 'jadwal@example.test', pass: 'secret' }
		});
	});

	it('speaks TLS from the first byte on 465, where STARTTLS has no meaning', () => {
		createMailer({
			MAIL_TRANSPORT: 'smtp',
			SMTP_HOST: 'mail.infomaniak.com',
			SMTP_PORT: '465',
			MAIL_FROM: 'jadwal@example.test'
		});
		expect(captured[0]).toMatchObject({ port: 465, secure: true, requireTLS: false });
	});

	it('bounds every wait, so a silent server never holds a request open', () => {
		createMailer({
			MAIL_TRANSPORT: 'smtp',
			SMTP_HOST: 'mail.example.test',
			SMTP_PORT: '587',
			MAIL_FROM: 'jadwal@example.test'
		});
		const options = captured[0] as Record<string, number>;
		for (const name of ['connectionTimeout', 'greetingTimeout', 'socketTimeout']) {
			expect(options[name], name).toBeGreaterThan(0);
		}
	});

	it('leaves out the credentials entirely when none are configured', () => {
		createMailer({
			MAIL_TRANSPORT: 'smtp',
			SMTP_HOST: 'mail.example.test',
			SMTP_PORT: '587',
			MAIL_FROM: 'jadwal@example.test'
		});
		expect(captured[0]).not.toHaveProperty('auth');
	});
});

describe('ce que le transport fait d’un échec', () => {
	it('retries a temporary refusal, and lets the second attempt through', async () => {
		const { transporter, calls } = flakyTransporter([temporaire]);
		const attentes: number[] = [];
		const mailer = new SmtpMailer(
			{
				host: 'mail.example.test',
				port: 587,
				secure: false,
				from: 'jadwal@example.test',
				sleep: async (ms) => {
					attentes.push(ms);
				}
			},
			transporter
		);
		await mailer.send(MESSAGE);
		expect(calls).toHaveLength(2);
		expect(attentes).toEqual([500]);
	});

	it('waits longer each time, instead of hammering a server that is already struggling', async () => {
		const { transporter, calls } = flakyTransporter([temporaire, reseau]);
		const attentes: number[] = [];
		const mailer = new SmtpMailer(
			{
				host: 'mail.example.test',
				port: 587,
				secure: false,
				from: 'jadwal@example.test',
				sleep: async (ms) => {
					attentes.push(ms);
				}
			},
			transporter
		);
		await mailer.send(MESSAGE);
		expect(calls).toHaveLength(3);
		expect(attentes).toEqual([500, 1000]);
	});

	it('never retries a definitive refusal: the answer would be the same', async () => {
		const { transporter, calls } = flakyTransporter([definitif, definitif, definitif]);
		const mailer = new SmtpMailer(
			{
				host: 'mail.example.test',
				port: 587,
				secure: false,
				from: 'jadwal@example.test',
				sleep: async () => {}
			},
			transporter
		);
		await expect(mailer.send(MESSAGE)).rejects.toThrow('550');
		expect(calls).toHaveLength(1);
	});

	it('gives up after the last attempt instead of retrying for ever', async () => {
		const { transporter, calls } = flakyTransporter([temporaire, temporaire, temporaire]);
		const mailer = new SmtpMailer(
			{
				host: 'mail.example.test',
				port: 587,
				secure: false,
				from: 'jadwal@example.test',
				sleep: async () => {}
			},
			transporter
		);
		await expect(mailer.send(MESSAGE)).rejects.toThrow('452');
		expect(calls).toHaveLength(3);
	});

	it('writes what is needed to diagnose, and never the link itself', async () => {
		const traces: string[] = [];
		vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
			traces.push(args.map(String).join(' '));
		});
		const { transporter } = flakyTransporter([definitif]);
		const mailer = new SmtpMailer(
			{
				host: 'mail.example.test',
				port: 587,
				secure: false,
				from: 'jadwal@example.test',
				sleep: async () => {}
			},
			transporter
		);
		await expect(mailer.send(MESSAGE)).rejects.toThrow();
		const trace = traces.join('\n');
		expect(trace).toContain('responsable@example.test');
		expect(trace).toContain('550');
		expect(trace).toContain('définitif');
		// Ce que la trace ne doit jamais porter : un lien magique dans un fichier de traces vaut
		// un mot de passe en clair.
		expect(trace).not.toContain('SECRET');
		expect(trace).not.toContain('token=');
	});

	it('sends the address, the subject and both bodies, with the display name', async () => {
		const { transporter, calls } = flakyTransporter([]);
		const mailer = new SmtpMailer(
			{
				host: 'mail.example.test',
				port: 587,
				secure: false,
				from: 'jadwal@example.test',
				fromName: 'jadwal'
			},
			transporter
		);
		await mailer.send(MESSAGE);
		expect(calls[0]).toMatchObject({
			from: 'jadwal <jadwal@example.test>',
			to: MESSAGE.to,
			subject: MESSAGE.subject,
			text: MESSAGE.text,
			html: MESSAGE.html
		});
	});
});

describe('temporaire ou définitif', () => {
	it.each([
		[temporaire, true],
		[definitif, false],
		[reseau, true],
		[new Error('rien du tout'), true]
	])('reads %o as retryable=%s', (error, expected) => {
		expect(isTemporary(error)).toBe(expected);
	});

	it('says which of the two it is, in words', () => {
		expect(describeSmtpFailure(definitif, 'a@example.test')).toContain('définitif');
		expect(describeSmtpFailure(temporaire, 'a@example.test')).toContain('passager');
	});
});

describe('l’adresse de réponse', () => {
	it('pose un Reply-To quand il est configuré, et rien sinon', async () => {
		// La boîte d'envoi n'est pas lue. Sans cet en-tête, une personne qui répond à un lien de
		// connexion écrit dans le vide — et c'est la réaction la plus naturelle du monde (étape 9).
		const avec = flakyTransporter([]);
		await new SmtpMailer(
			{
				host: 'smtp.example.test',
				port: 587,
				secure: false,
				from: 'noreply@example.test',
				replyTo: 'contact@example.test'
			},
			avec.transporter
		).send(MESSAGE);
		expect(avec.calls[0]).toMatchObject({
			from: 'noreply@example.test',
			replyTo: 'contact@example.test'
		});

		const sans = flakyTransporter([]);
		await new SmtpMailer(
			{ host: 'smtp.example.test', port: 587, secure: false, from: 'noreply@example.test' },
			sans.transporter
		).send(MESSAGE);
		expect(sans.calls[0]).not.toHaveProperty('replyTo');
	});
});
