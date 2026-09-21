// Les courriels que le service envoie. Texte et HTML, en français, sans image ni pièce jointe.
//
// Aucun message ne dit jamais si un compte existe : le lien de connexion est le même pour une
// adresse connue et pour une adresse inconnue (ADR 0017).

import type { OutgoingEmail } from './types.js';

/** Échappe ce qui irait dans du HTML. Les valeurs viennent d'une saisie, jamais de nous. */
function escape(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/** Le pied de tous les messages : qui écrit, et à qui répondre (étape 9). */
export const SIGNATURE = 'jadwal, un service de Voltia';

function layout(title: string, body: string): string {
	return [
		'<!doctype html>',
		'<html lang="fr"><head><meta charset="utf-8">',
		`<title>${escape(title)}</title></head>`,
		'<body style="font-family:system-ui,sans-serif;line-height:1.5">',
		body,
		`<hr><p style="color:#555;font-size:0.9em">${escape(SIGNATURE)}</p>`,
		'</body></html>'
	].join('');
}

/** Le même pied, en texte brut. Séparé par la ligne que les clients de messagerie reconnaissent. */
function signer(texte: string): string {
	return `${texte}

-- 
${SIGNATURE}`;
}

export function magicLinkEmail(to: string, url: string): OutgoingEmail {
	const subject = 'Votre lien de connexion à jadwal';
	const text = [
		'Bonjour,',
		'',
		'Voici votre lien de connexion :',
		url,
		'',
		'Il est valable quinze minutes et ne peut servir qu’une fois.',
		'Si vous n’avez rien demandé, ignorez ce message : personne n’a accès à votre compte.'
	].join('\n');
	const html = layout(
		subject,
		[
			'<p>Bonjour,</p>',
			`<p><a href="${escape(url)}">Se connecter à jadwal</a></p>`,
			'<p>Ce lien est valable quinze minutes et ne peut servir qu’une fois.</p>',
			'<p>Si vous n’avez rien demandé, ignorez ce message : personne n’a accès à votre compte.</p>'
		].join('')
	);
	return { to, subject, text: signer(text), html };
}

export function invitationEmail(to: string, organisation: string, origin: string): OutgoingEmail {
	const subject = `Invitation à rejoindre ${organisation} sur jadwal`;
	const text = [
		'Bonjour,',
		'',
		`Vous êtes invité à rejoindre ${organisation} sur jadwal, le service qui publie le`,
		'programme des cours.',
		'',
		`Connectez-vous avec cette adresse pour accepter : ${origin}/connexion`,
		'',
		'Tant que vous n’avez pas accepté, rien n’est partagé et votre nom n’apparaît nulle part.',
		'Si cette invitation ne vous concerne pas, ignorez ce message.'
	].join('\n');
	const html = layout(
		subject,
		[
			'<p>Bonjour,</p>',
			`<p>Vous êtes invité à rejoindre <strong>${escape(organisation)}</strong> sur jadwal,`,
			' le service qui publie le programme des cours.</p>',
			`<p><a href="${escape(origin)}/connexion">Se connecter pour accepter</a></p>`,
			'<p>Tant que vous n’avez pas accepté, rien n’est partagé et votre nom n’apparaît nulle part.</p>',
			'<p>Si cette invitation ne vous concerne pas, ignorez ce message.</p>'
		].join('')
	);
	return { to, subject, text: signer(text), html };
}
