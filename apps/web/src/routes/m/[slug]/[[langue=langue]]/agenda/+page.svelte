<script lang="ts">
	import { direction, NOM_DE_LANGUE, t, type Langue } from '$lib/i18n.js';
	import { lienAgenda, lienVue } from '$lib/public/liens.js';
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
</script>

<svelte:head>
	<title>{mots.subscribeTitle} | {data.organisation.name}</title>
	<meta name="description" content={mots.subscribeIntro(data.organisation.name)} />
	<meta property="og:title" content={mots.subscribeTitle} />
	<meta property="og:description" content={mots.subscribeIntro(data.organisation.name)} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={data.organisation.name} />
	<meta property="og:locale" content={data.langue} />
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
			<nav class="langues" aria-label="Langues">
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
			<p><a class="bouton" href={data.webcal}>{mots.subscribeButton}</a></p>
			<p class="adresse">{mots.subscribeAddress}</p>
			<p class="lien"><code>{data.https}</code></p>
		</section>

		{#if data.cours.length > 0}
			<section>
				<h2>{mots.subscribeOneCourseTitle}</h2>
				<p>{mots.subscribeOneCourseText}</p>
				<ul class="cours">
					{#each data.cours as cours (cours.id)}
						<li><a href={cours.webcal}>{cours.title}</a></li>
					{/each}
				</ul>
			</section>
		{/if}

		<section>
			<h2>{mots.onIphone}</h2>
			<p>{mots.iphoneText}</p>
		</section>
		<section>
			<h2>{mots.onAndroid}</h2>
			<p>{mots.androidText}</p>
		</section>
		<section>
			<h2>{mots.onOutlook}</h2>
			<p>{mots.outlookText}</p>
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
	.adresse {
		margin-bottom: 0.25rem;
		color: #555;
		font-size: 0.95rem;
	}
	.lien code {
		display: block;
		overflow-wrap: anywhere;
		background: #f6f6f6;
		padding: 0.5rem;
		border-radius: 0.375rem;
		font-size: 0.9rem;
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
</style>
