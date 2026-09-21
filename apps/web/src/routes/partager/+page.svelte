<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Partager | {data.organisation.name}</title></svelte:head>

<h1>Partager</h1>

<section aria-labelledby="lien-titre">
	<h2 id="lien-titre">Le lien de la mosquée</h2>
	<p class="details">
		À mettre partout : bio Instagram, groupe WhatsApp, fiche Mawaqit, affiche. Il ne change jamais.
	</p>
	<input type="text" readonly value={data.lienPublic} aria-label="Lien public" />
</section>

<section aria-labelledby="semaine-titre">
	<h2 id="semaine-titre">Le programme de la semaine</h2>
	<p class="details">À copier dans WhatsApp. Seuls les cours publiés y figurent.</p>
	<textarea readonly rows="10" aria-label="Programme de la semaine">{data.messageSemaine}</textarea>
</section>

<section aria-labelledby="qr-titre">
	<h2 id="qr-titre">QR code</h2>
	<p class="details">À imprimer, à afficher, à coller sur une annonce.</p>
	<div class="qr">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- le SVG vient de `qrSvg`, jamais d'une saisie -->
		{@html data.qr}
	</div>
	<p>
		<a
			class="bouton"
			download={`jadwal-${data.organisation.slug}.svg`}
			href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.qr)}`}
		>
			Télécharger le QR code
		</a>
	</p>
</section>

<section aria-labelledby="code-titre">
	<h2 id="code-titre">Le code à coller sur votre site</h2>
	<p class="details">
		Le programme s’affiche dans un cadre, avec sa propre mise en forme : il ne prend pas les
		couleurs ni les polices de votre site. La marche à suivre pas à pas est dans
		<code>docs/INTEGRATION.md</code>.
	</p>
	<textarea readonly rows="4" aria-label="Code à coller">{data.codeEmbarque}</textarea>

	<h3>Si votre site exige une empreinte d’intégrité</h3>
	<p class="details">
		Ce code fige la version du widget. Il faudra le remplacer à chaque publication : revenez le
		copier ici, il est toujours à jour.
	</p>
	<textarea readonly rows="6" aria-label="Code à coller, version verrouillée"
		>{data.codeVerrouille}</textarea
	>

	<h3>Si votre site refuse les scripts extérieurs</h3>
	<p class="details">
		Ce cadre-là fonctionne sans aucun script, mais sa hauteur est fixe : le programme défile à
		l’intérieur. Changez le nombre si vous voulez un cadre plus grand.
	</p>
	<textarea readonly rows="3" aria-label="Cadre à coller à la main">{data.codeCadre}</textarea>
</section>

<style>
	textarea,
	input[type='text'] {
		width: 100%;
		font: inherit;
		min-height: 44px;
		padding: 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
	}
	.details {
		color: #555;
		font-size: 0.95rem;
	}
	h3 {
		font-size: 1rem;
		margin: 1.25rem 0 0.25rem;
	}
	code {
		font-family: ui-monospace, monospace;
		font-size: 0.9em;
	}
	.qr {
		max-width: 14rem;
	}
	.qr :global(svg) {
		width: 100%;
		height: auto;
	}
	.bouton {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0 0.75rem;
		border-radius: 0.375rem;
		background: var(--accent);
		color: var(--accent-texte);
		text-decoration: none;
	}
</style>
