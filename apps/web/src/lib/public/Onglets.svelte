<script lang="ts">
	// La navigation principale de la page publique (étape 24, ADR 0052 et 0053,
	// docs/maquettes/public-aujourdhui.md) : Aujourd'hui, Programme, Prières, Infos. Des liens, sans
	// script, comme tout le côté public.
	//
	// Elle n'entre jamais dans le cadre du widget, qui encadre un programme et non une application :
	// c'est l'appelant qui ne la rend pas en mode intégré, et `tests/aujourdhui.test.ts` le garde.
	//
	// Un onglet ne garde ni le filtre par public ni le mois : ils n'ont de sens que dans le programme.
	import { t, type Langue } from '#lib/i18n.js';
	import { lienVue, type Adresse } from './liens.js';

	export type Onglet = 'aujourdhui' | 'programme' | 'prieres' | 'infos';

	let {
		adresse,
		langue,
		courant,
		exact = true,
		avecPrieres = false,
		avecInfos = false
	}: {
		adresse: Adresse;
		langue: Langue;
		/** L'onglet où l'on est. */
		courant: Onglet;
		/**
		 * L'onglet mène-t-il à cette page même ? `Programme` ouvre la vue Semaine : sur « Tous les
		 * cours », « Mois », la page d'un cours ou l'abonnement, il est marqué sans se dire la page
		 * courante (`aria-current="true"`).
		 */
		exact?: boolean;
		/** L'onglet des prières, seulement si le module de l'organisation est allumé (ADR 0042). */
		avecPrieres?: boolean;
		/** L'onglet des infos, seulement si l'organisation en a saisi au moins une. */
		avecInfos?: boolean;
	} = $props();

	const mots = $derived(t(langue));
	const onglets = $derived<[Onglet, string, string][]>([
		['aujourdhui', mots.tabs.today, lienVue(adresse, { vue: 'aujourdhui' })],
		['programme', mots.tabs.programme, lienVue(adresse)],
		...(avecPrieres
			? [
					['prieres', mots.tabs.prayers, lienVue(adresse, { vue: 'prieres' })] as [
						Onglet,
						string,
						string
					]
				]
			: []),
		...(avecInfos
			? [['infos', mots.tabs.info, lienVue(adresse, { vue: 'infos' })] as [Onglet, string, string]]
			: [])
	]);
</script>

<nav class="onglets" aria-label={mots.tabsLabel}>
	{#each onglets as [cle, libelle, href] (cle)}
		<a {href} aria-current={courant === cle ? (exact ? 'page' : 'true') : undefined}>{libelle}</a>
	{/each}
</nav>

<style>
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		margin-bottom: 0.5rem;
	}
	a {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		color: #0f5c55;
		font-weight: 600;
	}
	/* L'onglet courant prend le fond d'accent ; la graisse et `aria-current` restent : la couleur
	   n'est jamais le seul indicateur d'un état (WCAG 1.4.1, ADR 0031). */
	a[aria-current] {
		font-weight: 700;
		text-decoration: none;
		background: var(--accent);
		color: var(--accent-texte);
		border-radius: 0.375rem;
		padding: 0 0.6rem;
	}

	/* Sur un téléphone, la navigation tient en bas de l'écran, à portée du pouce, comme dans une
	   application (étape 24, ADR 0053). Du CSS seul : la page publique n'a pas de script. La barre
	   reste dans l'en-tête pour qui lit la page dans l'ordre, clavier ou lecteur d'écran ; seule sa
	   place à l'écran change. Elle n'est jamais rendue dans le cadre du widget, où une barre fixe
	   suivrait la hauteur du cadre et non celle de l'écran. */
	@media (max-width: 40rem) {
		nav {
			position: fixed;
			inset-inline: 0;
			bottom: 0;
			z-index: 10;
			flex-wrap: nowrap;
			gap: 0.25rem;
			margin: 0;
			/* L'encoche et la barre de gestes d'un téléphone : la barre monte d'autant. */
			padding: 0.25rem 0.25rem calc(0.25rem + env(safe-area-inset-bottom, 0px));
			background: #fff;
			border-top: 1px solid #ddd;
		}
		/* Des onglets de même largeur, quel que soit leur libellé : « Gebetszeiten » ne pousse pas
		   « Heute ». Un libellé trop long passe sur deux lignes au lieu de déborder. */
		a {
			flex: 1 1 0;
			min-width: 0;
			min-height: 48px;
			justify-content: center;
			text-align: center;
			text-decoration: none;
			font-size: 0.85rem;
			line-height: 1.15;
			padding: 0 0.2rem;
			overflow-wrap: anywhere;
		}
		a[aria-current] {
			padding: 0 0.2rem;
		}
		/* Le bas de la page ne passe pas sous la barre, et un élément qui prend le focus au clavier
		   n'est pas caché derrière elle (WCAG 2.4.11). */
		:global(html:has(nav.onglets)) {
			scroll-padding-bottom: 4.5rem;
		}
		:global(body:has(nav.onglets)) {
			padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px));
		}
	}

	/* À l'impression, une barre fixe se répéterait sur chaque feuille : elle reprend sa place. */
	@media print {
		nav {
			position: static;
			border: 0;
			padding: 0;
		}
	}
</style>
