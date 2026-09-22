<script lang="ts">
	// Voir `+page.server.ts` : cette page imite le site d'une organisation. Elle n'a ni l'en-tête de
	// l'espace des responsables, ni celui des pages publiques — c'est tout l'intérêt.
	let { data } = $props();
</script>

<svelte:head>
	<title>Essai d’intégration du widget</title>
	<!-- Le widget, chargé comme le ferait un site extérieur : adresse versionnée, empreinte
	     d'intégrité, et `crossorigin` — sans lequel l'empreinte ne dégraderait pas, elle bloquerait
	     le script à cent pour cent. -->
	<script src={data.script} integrity={data.integrity} crossorigin="anonymous"></script>
</svelte:head>

<div class="site">
	<header>
		<h1>Organisation d’essai</h1>
		<p>
			Cette page n’appartient pas à jadwal : elle fait semblant d’être le site d’une organisation,
			pour qu’on voie le widget dans les conditions où il servira. À vérifier de ses yeux avant
			chaque publication : la hauteur suit le contenu, il n’y a <strong
				>aucune barre de défilement</strong
			>
			à l’intérieur d’un cadre, et les deux widgets du bas ne se marchent pas dessus.
		</p>
		<p class="petit">
			Script : <code>{data.script}</code><br />
			Intégrité : <code>{data.integrity}</code>
		</p>
		{#if !data.org}
			<p class="alerte">
				Aucune organisation à afficher. Ajoutez <code>?org=&lt;identifiant&gt;</code> à l’adresse,
				ou posez <code>JADWAL_WIDGET_TEST_ORG</code> dans l’environnement.
			</p>
		{:else}
			<p class="petit">
				Organisation affichée : <code>{data.org}</code>
				{#if data.disponibles.length > 1}
					(également disponibles : {data.disponibles
						.filter((autre) => autre !== data.org)
						.join(', ')})
				{/if}
			</p>
		{/if}
	</header>

	<section id="essai-1">
		<h2>1. Le code tel qu’on le donne à une organisation</h2>
		<p>Deux lignes, rien d’autre. La vue Semaine, dans la langue de l’organisation.</p>
		<jadwal-widget org={data.org}>
			<a href="/m/{data.org}">Voir le programme des cours</a>
		</jadwal-widget>
	</section>

	<section id="essai-2">
		<h2>2. En allemand, sur la vue Tous les cours</h2>
		<p>
			La vue de départ et la langue sont des attributs. Déplier un cours change la hauteur : le
			cadre doit suivre, sans à-coup et sans barre.
		</p>
		<jadwal-widget org={data.org} lang="de" view="cours">
			<a href="/m/{data.org}/de?vue=cours">Kursprogramm ansehen</a>
		</jadwal-widget>
	</section>

	<section id="essai-3">
		<h2>3. En arabe, sur la vue Mois</h2>
		<p>Écriture de droite à gauche complète, chiffres latins, et une grille de sept colonnes.</p>
		<jadwal-widget org={data.org} lang="ar" view="mois" min-height="520">
			<a href="/m/{data.org}/ar?vue=mois">عرض برنامج الدروس</a>
		</jadwal-widget>
	</section>

	<section id="essai-4">
		<h2>4. Deux widgets côte à côte</h2>
		<p>
			Chacun ne répond qu’à son propre cadre : la hauteur de l’un ne doit jamais bouger quand
			l’autre change.
		</p>
		<div class="cote-a-cote">
			<jadwal-widget org={data.org} lang="fr" audience="kids">
				<a href="/m/{data.org}?public=kids">Programme des enfants</a>
			</jadwal-widget>
			<jadwal-widget org={data.org} lang="it">
				<a href="/m/{data.org}/it">Programma dei corsi</a>
			</jadwal-widget>
		</div>
	</section>

	<section id="essai-5">
		<h2>5. Des attributs absurdes</h2>
		<p>
			Une langue qui n’existe pas, une vue inventée, une hauteur négative. Le widget doit afficher
			le programme ordinaire, sans rien casser.
		</p>
		<jadwal-widget org={data.org} lang="klingon" view="tableau" audience="chats" min-height="-42">
			<a href="/m/{data.org}">Voir le programme des cours</a>
		</jadwal-widget>
	</section>

	<section id="essai-6">
		<h2>6. Sans organisation</h2>
		<p>
			L’attribut <code>org</code> manque. Aucun cadre n’est posé, et il ne reste que le pied : c’est la
			bonne réponse, et non un message d’erreur sur le site de quelqu’un d’autre.
		</p>
		<p>
			Le contenu de repli, lui, ne s’affiche pas ici, et c’est voulu. L’élément est
			<em>défini</em>, donc ses enfants ne sont plus rendus. Pour le voir, il faut couper JavaScript
			dans le navigateur : c’est exactement le cas qu’il couvre.
		</p>
		<jadwal-widget>
			<a href="/m/{data.org}">Voir le programme des cours</a>
		</jadwal-widget>
	</section>

	<footer>
		<p class="petit">
			Page d’essai servie par le projet. Elle porte <code>noindex</code> et n’est liée depuis nulle part.
		</p>
	</footer>
</div>

<style>
	.site {
		max-width: 52rem;
		margin: 0 auto;
		padding: 1rem;
		font-family: Georgia, 'Times New Roman', serif;
		line-height: 1.6;
		color: #22252a;
		background: #fdfcf8;
	}
	h1 {
		font-size: 1.8rem;
		margin: 0 0 0.5rem;
	}
	h2 {
		font-size: 1.15rem;
		margin: 2rem 0 0.25rem;
		border-bottom: 2px solid #c9b896;
		padding-bottom: 0.25rem;
	}
	.petit {
		font-size: 0.85rem;
		color: #555;
	}
	code {
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		overflow-wrap: anywhere;
	}
	.alerte {
		background: #fde68a;
		padding: 0.75rem;
		border-radius: 0.375rem;
	}
	.cote-a-cote {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.cote-a-cote :global(jadwal-widget) {
		flex: 1 1 18rem;
		min-width: 0;
	}
	footer {
		margin-top: 2rem;
		border-top: 1px solid #ddd;
		padding-top: 0.5rem;
	}
</style>
