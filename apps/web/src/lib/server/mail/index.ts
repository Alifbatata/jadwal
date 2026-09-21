// Choix du transport, à partir de l'environnement. Le défaut est `file` : une configuration
// oubliée écrit un fichier, elle n'expédie jamais.

import { FileMailer } from './file.js';
import { SmtpMailer } from './smtp.js';
import { MAIL_TRANSPORTS, type Mailer, type MailTransport } from './types.js';

export { FileMailer, lastEmail, readOutbox, type RecordedEmail } from './file.js';
export { describeSmtpFailure, isTemporary, SmtpMailer, type SmtpMailerOptions } from './smtp.js';
export { MAIL_TRANSPORTS, type Mailer, type MailTransport, type OutgoingEmail } from './types.js';

function required(name: string, value: string | undefined): string {
	if (value === undefined || value === '') {
		throw new Error(`Missing environment variable ${name} (see .env.example)`);
	}
	return value;
}

export function mailTransport(env: NodeJS.ProcessEnv = process.env): MailTransport {
	const value = env['MAIL_TRANSPORT'] ?? 'file';
	if (!(MAIL_TRANSPORTS as readonly string[]).includes(value)) {
		throw new Error(`MAIL_TRANSPORT must be one of ${MAIL_TRANSPORTS.join(', ')}, got ${value}`);
	}
	return value as MailTransport;
}

/**
 * Le port décide du chiffrement, et c'est le seul réglage qu'on peut se tromper sans le voir :
 * 465 parle TLS d'emblée, 587 commence en clair et bascule par STARTTLS. Poser `secure` à l'envers
 * fait échouer la connexion, jamais partir un message en clair.
 */
function isImplicitTls(port: number): boolean {
	return port === 465;
}

export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
	if (mailTransport(env) === 'file') {
		return new FileMailer(env['MAIL_OUTBOX_DIR'] ?? '.courriels');
	}
	const host = required('SMTP_HOST', env['SMTP_HOST']);
	const port = Number(required('SMTP_PORT', env['SMTP_PORT']));
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		throw new Error(`SMTP_PORT must be a port number, got ${env['SMTP_PORT']}`);
	}
	return new SmtpMailer({
		host,
		port,
		secure: isImplicitTls(port),
		user: env['SMTP_USER'],
		password: env['SMTP_PASSWORD'],
		from: required('MAIL_FROM', env['MAIL_FROM']),
		fromName: env['MAIL_FROM_NAME'],
		replyTo: env['MAIL_REPLY_TO']
	});
}
