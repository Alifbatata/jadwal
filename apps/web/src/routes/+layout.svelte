<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { variablesAccent } from '$lib/couleur.js';

	let { data, children } = $props();
	const organisation = $derived(data.organisation);
	const peutAdministrer = $derived(organisation?.role !== 'editor');
	/** La couleur de l'organisation, et le texte calculé qui va dessus (ADR 0031). */
	const accent = $derived(variablesAccent(organisation?.accentColor));
</script>

<!-- `svelte:head` ne peut pas vivre dans un bloc : la balise est donc unique, et c'est son contenu
     qui dépend du côté. Les pages publiques doivent être indexables ; l'espace des responsables,
     jamais. -->
<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	{#if !data.cotePublic}
		<meta name="robots" content="noindex" />
	{/if}
	{#if data.integre && !page.error}
		<!-- Le seul script d'une page publique, et seulement quand elle est dans un cadre. Jamais sur
		     une page d'erreur : elle n'a ni lien à suivre ni programme à mesurer, et le cadre garde
		     la hauteur minimale du widget.
		     Un fichier, jamais du code en ligne : sur une page `csr = false`, SvelteKit ne déclare
		     aucun nonce dans l'en-tête de politique de sécurité du contenu, donc un script en ligne
		     y serait bloqué avec ou sans nonce, tandis que `script-src 'self'` autorise un fichier
		     de la même origine (ADR 0005).

		     Le chemin rendu est **relatif** — `../widget/embed.js` depuis `/m/<slug>`,
		     `../../widget/embed.js` depuis `/m/<slug>/<langue>` : SvelteKit compte les segments pour
		     chaque page. C'est voulu et correct, mais cela se vérifie en résolvant l'adresse, pas en
		     comparant une chaîne — `tests/widget.test.ts` le fait sur les trois profondeurs. -->
		<script src={resolve('/widget/embed.js')} defer></script>
	{/if}
</svelte:head>

{#if data.cotePublic || data.nu}
	<!-- Une page publique porte son propre en-tête : elle ne passe pas par la coquille de l'espace
	     des responsables, qui n'a aucun sens dans l'iframe du site d'une organisation. La page d'essai
	     du widget se rend seule pour la même raison : elle doit ressembler au site d'une
	     organisation. -->
	{@render children?.()}
{:else}
	<div style={accent} class="coquille">
		{#if organisation?.asSuperAdmin}
			<!-- La bannière n'est pas décorative : elle empêche de modifier la mauvaise organisation
	     par inadvertance, ce qui est le risque propre aux pouvoirs de super-admin (ADR 0025). -->
			<p class="banniere" role="status">
				Vous travaillez dans <strong>{organisation.name}</strong> avec vos pouvoirs de super-admin.
				<a href={resolve('/super-admin')}>Changer d’organisation</a>
			</p>
		{/if}

		<header>
			<a class="marque" href={resolve('/')}>jadwal</a>
			<!-- Sans les conditions acceptées, pas de navigation : chacun de ses liens ramènerait à
			     l'écran d'acceptation (ADR 0044). La déconnexion, elle, reste. -->
			{#if organisation?.termsAccepted}
				<nav aria-label="Espace des responsables">
					<a href={resolve('/')}>À venir</a>
					<a href={resolve('/cours')}>Cours</a>
					{#if organisation.prayerModule}
						<a href={resolve('/vendredi')}>Vendredi</a>
					{/if}
					<a href={resolve('/partager')}>Partager</a>
					{#if peutAdministrer}
						<a href={resolve('/membres')}>Membres</a>
						{#if organisation.prayerModule}
							<a href={resolve('/prieres')}>Prières</a>
						{/if}
						<a href={resolve('/reglages')}>Réglages</a>
					{/if}
					<!-- Pour toute personne membre de plusieurs organisations, éditeurs compris, et
					     pour qui n'en a qu'une mais a une invitation qui court encore, qu'elle accepte
					     sur cet écran. Dans la navigation, donc absent de l'écran d'acceptation des
					     conditions, qui a son propre « Choisir une autre organisation ». -->
					{#if organisation.canSwitch}
						<a href={resolve('/organisations')}>Changer d’organisation</a>
					{/if}
				</nav>
			{/if}
			{#if data.person}
				<span class="compte">{data.person.email}</span>
				{#if data.person.isSuperAdmin}
					<a class="compte" href={resolve('/super-admin')}>Super-admin</a>
				{/if}
				<form method="post" action="/deconnexion?/ici">
					<button type="submit">Se déconnecter</button>
				</form>
			{/if}
		</header>

		<main>
			{@render children?.()}
		</main>

		<!-- Le pied commun de la coquille, connexion comprise : le texte que chacun accepte doit se
		     trouver depuis n'importe quelle page, avant même d'avoir un compte (ADR 0044). -->
		<footer>
			<a
				href={resolve('/conditions')}
				aria-current={page.url.pathname === '/conditions' ? 'page' : undefined}
			>
				Conditions d’utilisation
			</a>
		</footer>
	</div>
{/if}

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
		line-height: 1.5;
		color: #1a1a1a;
	}
	:global(h1) {
		font-size: 1.5rem;
	}
	:global(h2) {
		font-size: 1.15rem;
	}
	:global(a) {
		/* Une teinte fixe, jamais la couleur d'accent : celle-ci ne sert que de fond, et un lien
		   coloré sur fond blanc n'aurait aucun contraste garanti (ADR 0031). */
		color: #0f5c55;
	}

	/* La valeur de repli, pour les écrans qui n'ont aucune organisation en contexte — la connexion,
	   le choix d'organisation, le super-admin. Une page qui connaît son organisation la remplace. */
	:global(:root) {
		--accent: #0f766e;
		--accent-texte: #ffffff;
	}
	.coquille {
		display: contents;
	}

	/* Le mode intégré, et rien d'autre. Ces trois règles font que la hauteur mesurée par le script
	   d'annonce est la bonne :
	   - `overflow: hidden` retire la barre de défilement interne du cadre. L'attribut `scrolling`
	     ne conviendrait pas : il est non conforme, et `overflow` sur l'élément `iframe` ne fait
	     rien du tout — un cadre est un élément remplacé.
	   - `scrollbar-gutter: stable` empêche l'oscillation : sans elle, un cadre trop court fait
	     apparaître une barre, qui réduit la largeur, qui rallonge le texte, qui rallonge le cadre,
	     qui fait disparaître la barre.
	   - `display: flow-root` sur le corps empêche la marge basse du dernier bloc de s'effondrer à
	     travers `<body>` puis `<html>` : elle sortirait de la boîte mesurée, et serait rognée.
	   Règle absolue de ce mode, qui ne s'écrit pas en CSS : aucune hauteur en `vh` ni en
	   pourcentage. Elle dépendrait de la hauteur imposée par le parent, et la mesure boucherait. */
	:global(html:has([data-jadwal-embed])) {
		overflow: hidden;
		scrollbar-gutter: stable;
		background: #fff;
	}
	:global(body:has([data-jadwal-embed])) {
		display: flow-root;
	}
	header,
	main,
	footer,
	.banniere {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem;
	}
	footer {
		border-top: 1px solid #ddd;
		font-size: 0.9rem;
	}
	footer a {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		border-bottom: 1px solid #ddd;
	}
	.marque {
		font-weight: 700;
		text-decoration: none;
	}
	nav {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	nav a {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.compte {
		font-size: 0.9rem;
	}
	span.compte {
		margin-left: auto;
	}
	.banniere {
		background: #fef3c7;
		border-bottom: 2px solid #d97706;
		max-width: none;
	}
	header button {
		min-height: 44px;
		font: inherit;
		padding: 0 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
		background: #fff;
		cursor: pointer;
	}
</style>
