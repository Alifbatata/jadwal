// Les deux courriels du service, dans les cinq langues (étape 18, retour D3).
//
// Le lien de connexion part dans la langue de l'écran d'où il est demandé, et l'invitation dans celle
// que la personne qui invite choisit, celle de son écran d'abord (étape 19). Aucun des deux ne dit si
// un compte existe (ADR 0017) : la langue vient de la requête ou du formulaire, jamais d'une lecture
// des comptes. Le parcours par HTTP, du formulaire au courriel
// écrit, est éprouvé dans `tests/espace-en-cinq-langues.test.ts`.

import { describe, expect, it } from 'vitest';
import { LANGUES, type Langue } from '$lib/i18n.js';
import { mailLanguage, withMailLanguage } from './language.js';
import { invitationEmail, magicLinkEmail } from './messages.js';

const URL_DU_LIEN = 'https://jadwal.example/api/auth/magic-link/verify?token=abc';
const ORIGINE = 'https://jadwal.example';
const ORGANISATION = 'Association <du lac>';

/** Le texte d'un courriel HTML, sans ses balises. */
function sansBalises(html: string): string {
	return html
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

describe('le lien de connexion', () => {
	it.each([
		['fr', 'Votre lien de connexion à jadwal'],
		['de', 'Ihr Anmeldelink für jadwal'],
		['it', 'Il tuo link di accesso a jadwal'],
		['en', 'Your sign-in link for jadwal'],
		['ar', 'رابط الدخول إلى jadwal']
	] as const)('is written in %s', (langue, sujet) => {
		const mail = magicLinkEmail('a@example.test', URL_DU_LIEN, langue);
		expect(mail.to).toBe('a@example.test');
		expect(mail.subject).toBe(sujet);
		// Le lien est la première adresse du texte brut : c'est celle qu'un client de messagerie rend
		// cliquable, et celle que les tests d'accès suivent.
		expect(mail.text.match(/https?:\/\/\S+/)?.[0]).toBe(URL_DU_LIEN);
		expect(mail.html).toContain(`href="${URL_DU_LIEN}"`);
		expect(mail.html).toContain(`<html lang="${langue}" dir="${langue === 'ar' ? 'rtl' : 'ltr'}">`);
	});

	it('says in each language that the link lasts fifteen minutes and serves once', () => {
		const phrases: Record<Langue, string> = {
			fr: 'Il est valable quinze minutes et ne peut servir qu’une fois.',
			de: 'Er ist fünfzehn Minuten gültig und kann nur einmal verwendet werden.',
			it: 'È valido quindici minuti e si può usare una sola volta.',
			en: 'It is valid for fifteen minutes and can only be used once.',
			ar: 'يبقى الرابط صالحًا 15 دقيقة، ولا يُستخدم إلا مرة واحدة.'
		};
		for (const langue of LANGUES) {
			const mail = magicLinkEmail('a@example.test', URL_DU_LIEN, langue);
			expect(mail.text, langue).toContain(phrases[langue]);
			expect(sansBalises(mail.html), langue).toContain(phrases[langue]);
		}
	});

	it('keeps no French in the four other languages, signature included', () => {
		const francais = magicLinkEmail('a@example.test', URL_DU_LIEN, 'fr');
		for (const langue of LANGUES.filter((l) => l !== 'fr')) {
			const mail = magicLinkEmail('a@example.test', URL_DU_LIEN, langue);
			for (const mot of ['Bonjour', 'lien', 'valable', 'ignorez', 'un service de Voltia']) {
				expect(francais.text, `fr : ${mot}`).toContain(mot);
				expect(mail.text, `${langue} : ${mot}`).not.toContain(mot);
				expect(mail.html, `${langue} : ${mot}`).not.toContain(mot);
			}
		}
	});

	it('is in the language of the request when none is given, and in French outside a request', () => {
		expect(mailLanguage()).toBe('fr');
		expect(magicLinkEmail('a@example.test', URL_DU_LIEN).subject).toBe(
			'Votre lien de connexion à jadwal'
		);
		const allemand = withMailLanguage('de', () => magicLinkEmail('a@example.test', URL_DU_LIEN));
		expect(allemand.subject).toBe('Ihr Anmeldelink für jadwal');
		// Et à travers une attente : le lien est écrit après des requêtes à la base.
		return withMailLanguage('ar', async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			expect(magicLinkEmail('a@example.test', URL_DU_LIEN).subject).toBe('رابط الدخول إلى jadwal');
		});
	});
});

describe('l’invitation', () => {
	it.each([
		['fr', `Invitation à rejoindre ${ORGANISATION} sur jadwal`],
		['de', `Einladung zu ${ORGANISATION} auf jadwal`],
		['it', `Invito a unirti a ${ORGANISATION} su jadwal`],
		['en', `Invitation to join ${ORGANISATION} on jadwal`],
		['ar', `دعوة للانضمام إلى ${ORGANISATION} على jadwal`]
	] as const)('is written in %s', (langue, sujet) => {
		const mail = invitationEmail('b@example.test', ORGANISATION, ORIGINE, langue);
		expect(mail.subject).toBe(sujet);
		expect(mail.text).toContain(`${ORIGINE}/connexion`);
		expect(mail.html).toContain(`href="${ORIGINE}/connexion"`);
		// Le nom vient d'une saisie : il est échappé dans le HTML, jamais recopié tel quel.
		expect(mail.html).toContain('Association &lt;du lac&gt;');
		expect(mail.html).not.toContain(ORGANISATION);
		expect(mail.html).toContain(`<html lang="${langue}" dir="${langue === 'ar' ? 'rtl' : 'ltr'}">`);
	});

	it('explains in each language how to accept, and that it lasts fourteen days', () => {
		const phrases: Record<Langue, string> = {
			fr: 'L’invitation est valable quatorze jours.',
			de: 'Die Einladung ist vierzehn Tage gültig.',
			it: 'L’invito è valido quattordici giorni.',
			en: 'The invitation is valid for fourteen days.',
			ar: 'تبقى الدعوة صالحة 14 يومًا.'
		};
		for (const langue of LANGUES) {
			const mail = invitationEmail('b@example.test', ORGANISATION, ORIGINE, langue);
			expect(mail.text, langue).toContain(phrases[langue]);
		}
	});

	it('keeps no French in the four other languages', () => {
		for (const langue of LANGUES.filter((l) => l !== 'fr')) {
			const mail = invitationEmail('b@example.test', ORGANISATION, ORIGINE, langue);
			for (const mot of ['Bonjour', 'invité', 'Connectez-vous', 'ignorez']) {
				expect(mail.text, `${langue} : ${mot}`).not.toContain(mot);
			}
		}
	});

	it('is in the language of the request when none is given', () => {
		const mail = withMailLanguage('it', () =>
			invitationEmail('b@example.test', ORGANISATION, ORIGINE)
		);
		expect(mail.subject).toBe(`Invito a unirti a ${ORGANISATION} su jadwal`);
	});
});
