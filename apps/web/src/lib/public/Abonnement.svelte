<script lang="ts">
	// Ce que l'appareil du visiteur propose pour s'abonner à un flux, tout le programme ou un seul
	// cours (étape 18, retours E1 et E2). Le serveur a lu l'appareil ; ce bloc n'a qu'à rendre :
	//
	// - iPhone, iPad et Mac : le bouton `webcal:`, que l'application Calendrier ouvre elle-même ;
	// - Android : le bouton de Google Agenda, avec la demande d'abonnement prête ;
	// - ailleurs, ou quand le visiteur le demande : le choix entre Google Agenda, Outlook, une autre
	//   application, et l'adresse à copier, en texte sélectionnable puisque la page n'a aucun script.
	//
	// Google Agenda et Outlook s'ouvrent dans un nouvel onglet : ils refusent d'être encadrés, et la
	// page l'est souvent, dans le widget d'un site. Le lien le dit aux lecteurs d'écran, comme celui
	// des conditions (technique G201 des WCAG). Le lien `webcal:` reste dans l'onglet : c'est une
	// application qui le prend, pas une page.
	import { annonceNouvelOnglet, t, type Langue } from '$lib/i18n.js';
	import { lienGoogleAgenda, lienOutlook, type Appareil } from './abonnement.js';

	let {
		langue,
		appareil,
		webcal,
		https,
		nom,
		cours = false,
		tousLesChoix = null
	}: {
		langue: Langue;
		appareil: Appareil;
		/** L'adresse du flux en `webcal:` : celle qu'une application de calendrier ouvre. */
		webcal: string;
		/** La même adresse en `https:`, celle qu'on copie. */
		https: string;
		/** Le nom que prend le calendrier dans Outlook : celui que le flux porte déjà. */
		nom: string;
		/** Un seul cours : seule la phrase qui présente l'adresse change. */
		cours?: boolean;
		/** Le lien vers le choix complet, quand la page a choisi pour le visiteur ; `null` sinon. */
		tousLesChoix?: string | null;
	} = $props();

	const mots = $derived(t(langue));
	const google = $derived(lienGoogleAgenda(webcal));
	const outlook = $derived(lienOutlook(webcal, nom));
	const nouvelOnglet = $derived(annonceNouvelOnglet(langue));
</script>

<!-- Un seul bloc, sans autre `div` à l'intérieur : `data-appareil` dit ce que la page a proposé, et
     les tests d'accès le lisent. -->
<div class="abonnement" data-appareil={appareil}>
	{#if appareil === 'apple'}
		<p><a class="bouton" href={webcal}>{mots.subscribeButton}</a></p>
		<p class="aide">{mots.appleHelp}</p>
	{:else if appareil === 'android'}
		<p>
			<a class="bouton" href={google} target="_blank" rel="noopener"
				>{mots.addToGoogle}<span class="pour-lecteur">{nouvelOnglet}</span></a
			>
		</p>
		<!-- Le délai de Google dans un paragraphe à lui (retour E2) : il se voit, et un texte resté en
		     français s'y lirait seul au lieu de se fondre dans la phrase qui le précède. -->
		<p class="aide">{mots.googleHelp}</p>
		<p class="aide">{mots.googleDelay}</p>
	{:else}
		<p>{mots.chooseApp}</p>
		<ul class="choix">
			<li>
				<a href={google} target="_blank" rel="noopener"
					>{mots.choiceGoogle}<span class="pour-lecteur">{nouvelOnglet}</span></a
				>
				<p class="aide">{mots.choiceGoogleHelp}</p>
				<p class="aide">{mots.googleDelay}</p>
			</li>
			<li>
				<a href={outlook} target="_blank" rel="noopener"
					>{mots.choiceOutlook}<span class="pour-lecteur">{nouvelOnglet}</span></a
				>
				<p class="aide">{mots.choiceOutlookHelp}</p>
			</li>
			<li>
				<a href={webcal}>{mots.choiceOther}</a>
				<p class="aide">{mots.choiceOtherHelp}</p>
			</li>
			<li>
				<p class="titre">{mots.choiceCopy}</p>
				<p class="aide">{mots.choiceCopyHelp}</p>
				<p class="lien"><code dir="ltr">{https}</code></p>
			</li>
		</ul>
	{/if}
	{#if appareil !== 'autre'}
		<p class="adresse">{cours ? mots.courseFeedAddress : mots.subscribeAddress}</p>
		<!-- Une adresse se lit de gauche à droite, même sur une page arabe : sans `dir`, elle se
		     rangeait à droite, et sa ponctuation de fin changeait de côté. -->
		<p class="lien"><code dir="ltr">{https}</code></p>
	{/if}
	{#if tousLesChoix}
		<p><a class="autre" href={tousLesChoix}>{mots.otherDevice}</a></p>
	{/if}
</div>

<style>
	.bouton {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 1rem;
		border-radius: 0.375rem;
		background: var(--accent);
		color: var(--accent-texte);
		text-decoration: none;
		font-weight: 600;
	}
	.aide,
	.adresse {
		color: #555;
		font-size: 0.95rem;
		margin: 0.25rem 0 0.5rem;
	}
	.lien code {
		display: block;
		overflow-wrap: anywhere;
		background: #f6f6f6;
		padding: 0.5rem;
		border-radius: 0.375rem;
		font-size: 0.9rem;
		/* L'adresse se sélectionne d'un geste : un appui long sur un téléphone prend tout le bloc. */
		user-select: all;
	}
	ul.choix {
		margin: 0;
		padding: 0;
	}
	ul.choix li {
		list-style: none;
		border-bottom: 1px solid #eee;
		padding: 0.25rem 0;
	}
	ul.choix a,
	.autre {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: #0f5c55;
		font-weight: 600;
	}
	.autre {
		font-weight: 400;
	}
	.titre {
		font-weight: 600;
		margin: 0.5rem 0 0;
	}
	/* Hors de la vue, pas hors de l'arbre d'accessibilité : la même règle que le pied. */
	.pour-lecteur {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		border: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
