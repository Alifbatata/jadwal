// La mesure de charge (étape 9).
//
// Ce qu'elle dit, et ce qu'elle ne dit pas. Elle donne la médiane, le p90 et le p99 du temps de
// réponse, le débit, et le point où ça casse. Elle est faite **en local**, contre l'image de
// production et la base de développement : les ordres de grandeur valent, les valeurs absolues non.
// Mesurer sous charge une instance en service reviendrait à dégrader le service rendu — et ce qui
// tournerait à côté — pour obtenir un chiffre.
//
// Usage :
//   node infra/charge/mesurer.mjs --base http://127.0.0.1:5199 --parallele 20 --secondes 20
//   node infra/charge/mesurer.mjs --base … --escalier 1,5,10,20,50,100

const BASE = valeur('base', 'http://127.0.0.1:5199');
const SECONDES = Number(valeur('secondes', '15'));
const ESCALIER = valeur('escalier', '');
const PARALLELE = Number(valeur('parallele', '20'));
const ORGANISATIONS = Number(valeur('organisations', '20'));
/**
 * Nombre de visiteurs distincts simulés. La limitation de débit publique est de cent vingt requêtes
 * par minute **et par adresse** : tirer toute la charge depuis une seule adresse mesurerait le
 * limiteur, pas le service. Chaque client virtuel porte donc son adresse, et la mesure passe par le
 * même chemin qu'en production — l'instance doit être lancée avec `ADDRESS_HEADER=x-forwarded-for`.
 */
const ADRESSES = Number(valeur('adresses', '250'));

function adresse(tirage) {
	const n = tirage % ADRESSES;
	return `203.0.${Math.floor(n / 256)}.${n % 256}`;
}

function valeur(nom, defaut) {
	const index = process.argv.indexOf(`--${nom}`);
	return index >= 0 ? (process.argv[index + 1] ?? defaut) : defaut;
}

/**
 * Les trois chemins qui comptent, dans la proportion où ils sont vraiment demandés : la page
 * publique domine, le flux agenda est relevé par les agendas, l'API sert le widget.
 */
function chemin(tirage) {
	const org = `charge-${(tirage % ORGANISATIONS) + 1}`;
	const reste = tirage % 10;
	if (reste < 6) return `/m/${org}`;
	if (reste < 8) return `/m/${org}/agenda.ics`;
	return `/api/v1/organisations/${org}/schedule`;
}

function centile(triees, part) {
	if (triees.length === 0) return 0;
	const rang = Math.min(triees.length - 1, Math.floor(part * triees.length));
	return triees[rang];
}

/** Une salve : `parallele` clients qui bouclent pendant `secondes`. */
async function salve(parallele, secondes) {
	const durees = [];
	let erreurs = 0;
	let codes = new Map();
	const fin = Date.now() + secondes * 1000;
	let tirage = 0;

	async function client(depart) {
		let local = depart;
		while (Date.now() < fin) {
			const url = `${BASE}${chemin(local)}`;
			local += 7; // premier avec 10 : chaque client parcourt les trois chemins
			const debut = performance.now();
			try {
				const reponse = await fetch(url, {
					headers: {
						// Un agent de navigateur : sinon le compteur de vues prend tout pour un robot et
						// la mesure ne passerait pas par le même code.
						'user-agent':
							'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36',
						// Le générateur joue le rôle de Caddy : il ajoute l'adresse du visiteur en
						// dernier, comme un mandataire le ferait.
						'x-forwarded-for': adresse(local)
					}
				});
				await reponse.arrayBuffer();
				durees.push(performance.now() - debut);
				codes.set(reponse.status, (codes.get(reponse.status) ?? 0) + 1);
				if (reponse.status >= 500) erreurs += 1;
			} catch {
				erreurs += 1;
				durees.push(performance.now() - debut);
			}
		}
	}

	const debutSalve = Date.now();
	await Promise.all(Array.from({ length: parallele }, () => client(tirage++)));
	const secondesReelles = (Date.now() - debutSalve) / 1000;
	const triees = durees.slice().sort((a, b) => a - b);
	return {
		parallele,
		requetes: durees.length,
		debit: durees.length / secondesReelles,
		p50: centile(triees, 0.5),
		p90: centile(triees, 0.9),
		p99: centile(triees, 0.99),
		max: triees.at(-1) ?? 0,
		erreurs,
		codes: [...codes.entries()]
			.sort()
			.map(([code, combien]) => `${code}×${combien}`)
			.join(' ')
	};
}

function ligne(resultat) {
	const nombre = (valeur) => valeur.toFixed(0).padStart(5);
	return (
		`${String(resultat.parallele).padStart(4)} | ${String(resultat.requetes).padStart(6)} | ` +
		`${resultat.debit.toFixed(1).padStart(7)} | ${nombre(resultat.p50)} | ${nombre(resultat.p90)} | ` +
		`${nombre(resultat.p99)} | ${nombre(resultat.max)} | ${String(resultat.erreurs).padStart(7)} | ` +
		resultat.codes
	);
}

process.stdout.write(`base : ${BASE}\n`);
process.stdout.write('  //  | requêtes |  req/s  |  p50 |  p90 |  p99 |  max | erreurs | codes\n');

if (ESCALIER) {
	for (const marche of ESCALIER.split(',').map(Number)) {
		process.stdout.write(`${ligne(await salve(marche, SECONDES))}\n`);
	}
} else {
	process.stdout.write(`${ligne(await salve(PARALLELE, SECONDES))}\n`);
}
