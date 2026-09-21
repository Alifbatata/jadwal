// Le seul JavaScript d'une page publique, et seulement quand elle est dans un cadre.
// Servi tel quel à tous les visiteurs : le raisonnement est dans l'ADR 0005 et dans l'en-tête de
// `src/routes/widget/embed.js/+server.ts`, pas ici.

// 1. Annoncer sa hauteur. La boîte de bordure de <html>, jamais `scrollHeight` : dans un cadre,
//    `scrollHeight` vaut au moins la hauteur imposée par le parent, donc il ne redescend jamais.
//    `'*'` est obligatoire — le domaine hôte est inconnu, et le défaut jetterait le message.
let derniere;
new ResizeObserver(([entree]) => {
	const hauteur = Math.ceil(entree.borderBoxSize[0].blockSize);
	if (hauteur === derniere) return;
	derniere = hauteur;
	parent.postMessage({ type: 'jadwal:height:1', height: hauteur }, '*');
}).observe(document.documentElement);

// 2. Naviguer par remplacement : une navigation ordinaire dans un cadre ajoute une entrée à
//    l'historique du site hôte, et trois clics y enferment le bouton « précédent ».
document.addEventListener('click', (evenement) => {
	if (evenement.defaultPrevented || evenement.button !== 0) return;
	if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
	const lien = evenement.target.closest?.('a[href]');
	if (!lien || lien.target) return;
	const url = new URL(lien.href, location.href);
	// Une autre origine, un `webcal:`, un `mailto:` : ce n'est pas à nous de nous en mêler.
	if (url.origin !== location.origin) return;
	// Une ancre de la même page : la laisser au navigateur, un remplacement rechargerait tout.
	if (url.hash && url.href.split('#')[0] === location.href.split('#')[0]) return;
	// Le mode intégré doit survivre : sans lui, la page suivante n'annoncerait plus sa hauteur.
	url.searchParams.set('embed', '1');
	evenement.preventDefault();
	location.replace(url.href);
});
