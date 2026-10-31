// Les textes nouveaux de l'étape 22, relus dans les cinq langues : la page de demande d'accès, la
// console du super-admin (demandes, personne responsable, invitation) et le courriel « aucun
// compte ». Chaque correction, à sa place, et l'ancienne forme absente.

import { describe, expect, it } from 'vitest';
import { noAccountEmail } from '../server/mail/messages.js';
import { accessRequestTexts } from './access-request.js';
import { superAdminTexts } from './super-admin.js';

const ORIGIN = 'https://jadwal.example.org';

/** Tous les textes d'un objet de textes, fonctions comprises, appelées avec un nombre. */
function allTexts(value: unknown): string[] {
	if (typeof value === 'string') return [value];
	if (typeof value === 'function') return [String(value(14))];
	if (value && typeof value === 'object') return Object.values(value).flatMap(allTexts);
	return [];
}

describe('French reviewed (step 22)', () => {
	it('R1: on creation, the invitation leaves for this address, with no double « à »', () => {
		expect(superAdminTexts.fr.confirm.invite).toBe(
			'À la création, l’invitation de personne responsable partira à cette adresse :'
		);
	});

	it('R2: the invitation is sent to the person, it does not « leave to » them', () => {
		expect(superAdminTexts.fr.manager.intro).toContain(
			'l’invitation lui est envoyée dès la création de l’organisation'
		);
		expect(superAdminTexts.fr.manager.intro).not.toContain('lui part');
	});
});

describe('German reviewed (step 22)', () => {
	it('R1: the form sends nothing to the address, and « oder » takes no comma', () => {
		const privacy = accessRequestTexts.de.privacy;
		expect(privacy).toContain(
			'Über dieses Formular geht nichts an die angegebene Adresse: Die einzige E-Mail dorthin ist die Einladung, wenn der Antrag angenommen wird.'
		);
		expect(privacy).toContain('90 Tage nach der Antwort gelöscht oder nach 12 Monaten');
		expect(privacy).not.toContain('schreibt der angegebenen Adresse');
	});

	it('R2: the console calls it « Antrag », as the form does', () => {
		expect(superAdminTexts.de.requests.title).toBe('Zugangsanträge');
		expect(allTexts(superAdminTexts.de).filter((text) => text.includes('Anfrage'))).toEqual([]);
	});

	it('R3: the invitation is one « als verantwortliche Person », not one from that person', () => {
		expect(superAdminTexts.de.confirm.invite).toBe(
			'Bei der Erstellung geht die Einladung als verantwortliche Person an:'
		);
	});
});

describe('Italian reviewed (step 22)', () => {
	it('R1: the invitation is sent to the address, it does not leave towards it', () => {
		expect(accessRequestTexts.it.emailHint).toBe(
			'L’invito verrà inviato a questo indirizzo. Esempio: nome.cognome@example.org'
		);
	});

	it('R2: on creation, the invitation as person in charge will be sent to', () => {
		expect(superAdminTexts.it.confirm.invite).toBe(
			'Alla creazione, l’invito come persona responsabile verrà inviato a:'
		);
	});

	it('R3: the invitation is sent (viene inviato), it does not leave for a person', () => {
		const { createHelp, fromRequestWhat } = superAdminTexts.it.requests;
		expect(createHelp).toContain('e l’invito viene inviato alla persona che l’ha fatta');
		expect(fromRequestWhat).toContain('e l’invito viene inviato all’indirizzo');
		expect(`${createHelp} ${fromRequestWhat}`).not.toContain('l’invito parte');
	});
});

describe('English reviewed (step 22)', () => {
	it('R1: the person who runs the service reviews the request, not the form', () => {
		expect(accessRequestTexts.en.intro).toContain(
			'and the person who runs the service will review your request.'
		);
	});

	it('R2: the only email the address receives is the invitation', () => {
		expect(accessRequestTexts.en.privacy).toContain(
			'This form sends nothing to the address given: the only email it will receive is the invitation, if the request is accepted.'
		);
	});

	it('R3: the question is asked as a question', () => {
		expect(accessRequestTexts.en.elsewhere.question).toBe(
			'Is your organisation not using jadwal yet?'
		);
	});

	it('R4: accepting makes the person a manager, the name of the role', () => {
		const { help, validity } = superAdminTexts.en.invite;
		expect(help).toContain('By accepting it, the person becomes a manager of the organisation');
		expect(validity(14)).toBe(
			'It is valid for 14 days. By accepting it, this person becomes a manager of the organisation.'
		);
		expect(`${help} ${validity(14)}`).not.toContain('becomes in charge');
	});

	it('R5: the screen says the invitation was sent, as in the other languages', () => {
		expect(superAdminTexts.en.invite.sentTo).toBe(
			'An invitation for the person in charge has been sent to:'
		);
	});

	it('R6: the person in charge sends an invitation to this address', () => {
		expect(noAccountEmail('a@example.org', ORIGIN, 'en').text).toContain(
			'ask the person in charge to send an invitation to this address.'
		);
	});
});

describe('Arabic reviewed (step 22)', () => {
	it('R1: the person who runs the service studies the request, not the form', () => {
		expect(accessRequestTexts.ar.intro).toBe(
			'jadwal مجاني للمؤسسات التي تريد أن تنشر برنامج دروسها وأنشطتها. يُفتح الوصول بناءً على طلب: املأ هذا النموذج، وسيدرس الشخص الذي يدير الخدمة طلبك.'
		);
	});

	it('R2: the activities are those of your organisation, in the singular of the reader', () => {
		expect(accessRequestTexts.ar.messageHint).toBe(
			'ما تريد إضافته: أنشطة مؤسستك، أو سؤال. 1000 حرف على الأكثر.'
		);
	});

	it('R3: the form sends nothing to the address', () => {
		expect(accessRequestTexts.ar.privacy).toContain(
			'لا يرسل هذا النموذج شيئًا إلى العنوان المذكور'
		);
		expect(accessRequestTexts.ar.privacy).not.toContain('لا يكتب');
	});

	it('R4: the question begins with its particle', () => {
		expect(accessRequestTexts.ar.elsewhere.question).toBe('ألا تستخدم مؤسستك jadwal بعد؟');
	});

	it('R5: the person in charge sends an invitation to this address', () => {
		expect(noAccountEmail('a@example.org', ORIGIN, 'ar').text).toContain(
			'فاطلب من المسؤول عنها أن يرسل دعوة إلى هذا العنوان.'
		);
	});
});
