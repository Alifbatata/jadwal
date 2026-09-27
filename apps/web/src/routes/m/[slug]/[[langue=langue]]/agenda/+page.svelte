<script lang="ts">
	import {
		annonceNouvelOnglet,
		direction,
		LOCALE_DE_PARTAGE,
		NOM_DE_LANGUE,
		t,
		type Langue
	} from '$lib/i18n.js';
	import { lienAgenda, lienCours, lienVue } from '$lib/public/liens.js';
	import { lienGoogleAgenda, PARAMETRE_APPAREIL, TOUS_LES_CHOIX } from '$lib/public/abonnement.js';
	import Abonnement from '$lib/public/Abonnement.svelte';
	import Pied from '$lib/public/Pied.svelte';
	import { variablesAccent } from '$lib/couleur.js';

	let { data } = $props();
	const mots = $derived(t(data.langue));
	const dir = $derived(direction(data.langue));

	const adresse = $derived({
		slug: data.organisation.slug,
		langue: data.langue,
		langueParDefaut: data.organisation.defaultLanguage
	});

	const versLangue = (langue: Langue) => lienAgenda({ ...adresse, langue });
	/** Le choix complet, qui ne dépend plus de l'appareil. */
	const choixComplet = `?${PARAMETRE_APPAREIL}=${TOUS_LES_CHOIX}`;

	/**
	 * Le lien d'un seul cours, selon l'appareil : son flux `webcal:` sur un iPhone, Google Agenda sur
	 * Android, et sa page ailleurs, qui propose le choix complet pour ce cours seul.
	 */
	function lienDuCours(cours: { id: string; webcal: string }): string {
		if (data.appareil === 'apple') return cours.webcal;
		if (data.appareil === 'android') return lienGoogleAgenda(cours.webcal);
		return `${lienCours(adresse, cours.id)}${data.tousLesChoix ? choixComplet : ''}#agenda`;
	}

	const texteDesCours = $derived(
		data.appareil === 'apple'
			? mots.subscribeOneCourseText
			: data.appareil === 'android'
				? mots.subscribeOneCourseGoogle
				: mots.subscribeOneCourseChoice
	);
</script>

<svelte:head>
	<title>{mots.subscribeTitle} | {data.organisation.name}</title>
	<meta name="description" content={mots.subscribeIntro(data.organisation.name)} />
	<meta property="og:title" content={mots.subscribeTitle} />
	<meta property="og:description" content={mots.subscribeIntro(data.organisation.name)} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={data.organisation.name} />
	<!-- Une langue et un pays, et chaque autre langue publiée (27.09.2026). -->
	<meta property="og:locale" content={LOCALE_DE_PARTAGE[data.langue]} />
	{#each data.langues.filter((autre) => autre !== data.langue) as autre (autre)}
		<meta property="og:locale:alternate" content={LOCALE_DE_PARTAGE[autre]} />
	{/each}
	<meta property="og:url" content={data.canonical} />
	<link rel="canonical" href={data.canonical} />
	{#each data.alternates as autre (autre.hreflang)}
		<link rel="alternate" hreflang={autre.hreflang} href={autre.href} />
	{/each}
</svelte:head>

<div
	{dir}
	lang={data.langue}
	class="page"
	style={variablesAccent(data.organisation.accentColor)}
	data-jadwal-embed={data.integre ? '' : undefined}
>
	<header>
		<h1>{mots.subscribeTitle}</h1>
		<p class="fil"><a href={lienVue(adresse)}>{data.organisation.name}</a></p>
		{#if data.langues.length > 1}
			<nav class="langues" aria-label={mots.languagesLabel}>
				{#each data.langues as autre (autre)}
					<a
						href={versLangue(autre)}
						hreflang={autre}
						aria-current={autre === data.langue ? 'true' : undefined}
					>
						{NOM_DE_LANGUE[autre]}
					</a>
				{/each}
			</nav>
		{/if}
	</header>

	<!-- Le contenu principal, entre l'en-tête et le pied : sans lui, axe relevait chaque section. -->
	<main>
		<p>{mots.subscribeIntro(data.organisation.name)}</p>

		<section>
			<h2>{mots.subscribeWholeTitle}</h2>
			<!-- Ce que l'appareil sait ouvrir d'abord, puis, quand la page a choisi pour le visiteur, le
			     lien vers le choix complet (étape 18, retour E1). -->
			<Abonnement
				langue={data.langue}
				appareil={data.appareil}
				webcal={data.webcal}
				https={data.https}
				nom={data.organisation.name}
				adresse={data.canonical}
				tousLesChoix={data.appareil === 'autre' ? null : `${lienAgenda(adresse)}${choixComplet}`}
			/>
		</section>

		{#if data.cours.length > 0}
			<section>
				<h2>{mots.subscribeOneCourseTitle}</h2>
				<p>{texteDesCours}</p>
				<ul class="cours">
					{#each data.cours as cours (cours.id)}
						<li>
							{#if data.appareil === 'android'}
								<a href={lienDuCours(cours)} target="_blank" rel="noopener"
									>{cours.title}<span class="pour-lecteur">{annonceNouvelOnglet(data.langue)}</span
									></a
								>
							{:else}
								<a href={lienDuCours(cours)}>{cours.title}</a>
							{/if}
							<!-- Sur un téléphone, la page du cours, à son bloc d'abonnement, juste sous le nom :
							     sur Android, l'issue si Google Agenda ne propose rien (relecture du lot 4) ; sur
							     un iPhone, l'adresse du cours et les autres choix, le même lien (décision du chef
							     de projet, 27.09.2026). Ailleurs, le nom mène déjà à cette page. Son nom se lit
							     avec celui du cours, dans le même élément de liste. -->
							{#if data.appareil === 'android' || data.appareil === 'apple'}
								<a class="page-du-cours" href={`${lienCours(adresse, cours.id)}#agenda`}
									>{mots.coursePage}</a
								>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Les étapes à suivre à la main, pour quand le bouton ne fait rien : une application qui ne
		     connaît pas `webcal:`, un appareil mal reconnu, un compte de travail. Le délai d'Outlook y
		     est dit aussi (retour E2) ; celui de Google n'y est plus, son aide n'en donnant aucun
		     (27.09.2026). À sa place, une fois, après le délai d'Outlook : la page du programme pour un
		     changement de dernière minute, que tout appareil lit ici, un iPhone compris (reprise 1).
		     L'introduction parle d'un bouton là où il y en a un, et des liens sur le choix complet, qui
		     n'a qu'eux (relecture du lot 3). -->
		<section id="a-la-main">
			<h2>{mots.manualTitle}</h2>
			<p>{data.appareil === 'autre' ? mots.manualIntroChoice : mots.manualIntro}</p>
			<h3>{mots.onIphone}</h3>
			<p>{mots.iphoneText}</p>
			<h3>{mots.onAndroid}</h3>
			<p>{mots.androidText}</p>
			<h3>{mots.onOutlook}</h3>
			<p>{mots.outlookText}</p>
			<p>{mots.outlookDelay}</p>
			<p>{mots.lastMinute}</p>
		</section>
	</main>

	<Pied langue={data.langue} lienAgenda={lienAgenda(adresse)} integre={data.integre} />
</div>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem;
		font-family: system-ui, sans-serif;
		line-height: 1.5;
		color: #1a1a1a;
	}
	h1 {
		font-size: 1.4rem;
		margin: 0;
	}
	h2 {
		font-size: 1.1rem;
		margin-bottom: 0.25rem;
	}
	h3 {
		font-size: 1rem;
		margin: 1rem 0 0.25rem;
	}
	.fil {
		margin: 0.25rem 0;
		font-size: 0.9rem;
	}
	.fil a,
	.langues a {
		color: #0f5c55;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.langues {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		font-size: 0.95rem;
	}
	ul.cours {
		margin: 0;
		padding: 0;
	}
	ul.cours li {
		list-style: none;
		border-bottom: 1px solid #eee;
	}
	ul.cours a {
		display: flex;
		align-items: center;
		min-height: 44px;
		color: #0f5c55;
	}
	/* Sur un téléphone, le second lien d'un cours, sous son nom : plus discret, et toujours à 44 px. */
	ul.cours a.page-du-cours {
		font-size: 0.9rem;
	}
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
