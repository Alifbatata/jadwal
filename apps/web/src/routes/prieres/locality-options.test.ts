// La liste où l'on choisit sa localité, avec JavaScript : ce qu'elle montre après chaque recherche.
//
// La relecture du lot 3 l'a vu dans Chrome : une localité choisie, puis une nouvelle recherche qui ne
// la rendait plus, et plus aucune case n'était cochée. L'écran disait encore « Localité choisie »,
// mais le formulaire ne l'envoyait plus ; le calcul partait des deux nombres cachés, et l'écran qui
// revenait ouvrait « Hors de Suisse » sans nommer la localité.

import { describe, expect, it } from 'vitest';
import { localityKey, localityOptions, pinnedLocality } from './locality-options.js';

const BIENNE = { postcode: '2502', name: 'Biel/Bienne', canton: 'BE' };
const LUGANO = { postcode: '6900', name: 'Lugano', canton: 'TI' };
const MASSAGNO = { postcode: '6900', name: 'Massagno', canton: 'TI' };

describe('localityOptions', () => {
	it('shows what the search found, the chosen locality once when it is among them', () => {
		expect(localityOptions([BIENNE, LUGANO], BIENNE)).toEqual([BIENNE, LUGANO]);
		expect(localityOptions([LUGANO, MASSAGNO], null)).toEqual([LUGANO, MASSAGNO]);
	});

	it('keeps the chosen locality first when a new search leaves it out, so that it is still sent', () => {
		expect(localityOptions([LUGANO, MASSAGNO], BIENNE)).toEqual([BIENNE, LUGANO, MASSAGNO]);
	});

	it('keeps it too when the new search finds nothing, or is too short', () => {
		expect(localityOptions([], BIENNE)).toEqual([BIENNE]);
	});

	it('shows the chosen locality alone before any search, and nothing without one', () => {
		expect(localityOptions(null, BIENNE)).toEqual([BIENNE]);
		expect(localityOptions(null, null)).toEqual([]);
	});

	it('compares localities by postcode and name, as the form sends them', () => {
		expect(localityKey(BIENNE)).toBe('2502|Biel/Bienne');
		// Une autre copie de la même localité, rendue par une autre recherche, n'est pas doublée.
		expect(localityOptions([{ ...BIENNE }, LUGANO], BIENNE)).toHaveLength(2);
	});
});

describe('pinnedLocality', () => {
	// « Büe » ne rend que Büetigen, et Bienne, enregistrée, reste en tête : l'écran doit dire
	// pourquoi elle est là, sans quoi on lit « 1 localité trouvée. » au-dessus de deux localités.
	it('names the locality kept first although the search leaves it out', () => {
		expect(pinnedLocality([LUGANO, MASSAGNO], BIENNE)).toBe(BIENNE);
		expect(pinnedLocality([], BIENNE)).toBe(BIENNE);
	});

	it('names none when the search returns it, or when there is no search', () => {
		expect(pinnedLocality([{ ...BIENNE }, LUGANO], BIENNE)).toBeNull();
		// Sans recherche, la liste ne montre qu'elle : il n'y a rien à expliquer.
		expect(pinnedLocality(null, BIENNE)).toBeNull();
		expect(pinnedLocality([LUGANO], null)).toBeNull();
	});
});
