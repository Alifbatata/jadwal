// Ce que dit l'écran de la passkey juste après l'enregistrement d'une passkey, selon la session
// (étape 18, reprise de la relecture du lot 3). La première passkey, enregistrée par une session sans
// pouvoirs, fait apparaître le bouton « Se connecter avec une passkey », et le message y renvoie. Une
// passkey de plus, pouvoirs actifs, n'en fait apparaître aucun : le message ne peut renvoyer à aucun
// bouton, et dit qu'elle servira à la prochaine connexion.

import { describe, expect, it } from 'vitest';
import { LANGUES } from '$lib/i18n.js';
import { passkeyTexts } from '$lib/i18n/super-admin-passkey.js';
import { afterRegistration, passkeyButtons } from './screen.js';

/** Le mot « bouton » dans chaque langue : un message qui le porte renvoie à un bouton de l'écran. */
const BOUTON = { fr: 'bouton', de: 'Schaltfläche', it: 'pulsante', en: 'button', ar: 'الزر' };

describe('the message said once a passkey is registered', () => {
	it('points to the sign-in button after the first passkey, and the screen then shows that button', () => {
		const avant = { hasSuperAdminPowers: false, amorcage: true };
		// Relues après l'enregistrement : une passkey existe, la session n'a toujours aucun pouvoir.
		const apres = { hasSuperAdminPowers: false, amorcage: false };
		expect(passkeyButtons(avant)).toEqual({ register: true, signIn: false });
		expect(passkeyButtons(apres)).toEqual({ register: false, signIn: true });
		const cle = afterRegistration(avant);
		expect(passkeyTexts.fr[cle]).toBe(
			'Passkey enregistrée. Utilisez le bouton ci-dessous pour vous connecter avec elle, sans quitter la page.'
		);
		for (const langue of LANGUES) {
			expect.soft(passkeyTexts[langue][cle], langue).toContain(BOUTON[langue]);
		}
	});

	it('points to no button after a further passkey with the powers active, since none is shown', () => {
		const session = { hasSuperAdminPowers: true, amorcage: false };
		expect(passkeyButtons(session)).toEqual({ register: true, signIn: false });
		const cle = afterRegistration(session);
		expect
			.soft(passkeyTexts.fr[cle])
			.toBe(
				'Passkey enregistrée. Vous pourrez vous connecter avec elle la prochaine fois. Vous n’avez rien d’autre à faire.'
			);
		for (const langue of LANGUES) {
			expect.soft(passkeyTexts[langue][cle], langue).not.toContain(BOUTON[langue]);
			expect.soft(passkeyTexts[langue][cle], langue).not.toBe(passkeyTexts[langue].registered);
		}
	});
});
