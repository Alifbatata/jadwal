// Le seul JavaScript d'une page publique hors cadre (ADR 0054). Servi tel quel à tous les
// visiteurs par `src/routes/m/hors-reseau.js/+server.ts`, où le raisonnement est écrit.
//
// Il demande au navigateur d'installer le travailleur de service qui garde la dernière page vue,
// pour les pages publiques et elles seules. Les deux adresses se calculent depuis celle de ce
// fichier : aucune n'est écrite en dur. Un navigateur qui refuse (navigation privée, travailleur en
// module inconnu) laisse la page comme elle était : elle se lit entièrement sans ce fichier.
//
// Jamais dans un cadre : la page qu'une organisation encadre à la main sur son site porte ce
// script, mais elle n'est pas une application, et rien ne s'y installe.
const ici = document.currentScript && document.currentScript.src;
if (ici && window.top === window.self && 'serviceWorker' in navigator) {
	navigator.serviceWorker
		.register(new URL('../service-worker.js', ici), {
			scope: new URL('./', ici).href,
			type: 'module'
		})
		.catch(() => {});
}
