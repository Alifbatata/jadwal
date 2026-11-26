<script lang="ts">
	// L'onglet Infos de la page publique (étape 24, ADR 0052, docs/maquettes/public-infos.md) : ce
	// que l'organisation dit d'elle. L'annonce, l'adresse, le contact, l'accès ; un bloc dont le champ
	// est vide n'est pas affiché.
	//
	// Tout ce qui a été saisi est du texte brut. Les trois liens du contact sont construits ici, et le
	// site n'en devient un que s'il commence par `http://` ou `https://` (`lienSite`). La page ne
	// charge aucune carte : « Ouvrir dans une carte » est un lien que le visiteur choisit de suivre.
	import { annonceNouvelOnglet, direction, isLangue, t, type Langue } from '#lib/i18n.js';
	import Annonce from './Annonce.svelte';
	import { lienSite, type InfosPubliques } from './infos.js';

	let {
		langue,
		langueDuTexte,
		infos,
		carte
	}: {
		langue: Langue;
		/** La langue par défaut de l'organisation : celle dans laquelle ses textes sont marqués. */
		langueDuTexte: string;
		infos: InfosPubliques;
		/** Où mène « Ouvrir dans une carte », selon l'appareil ; rien sans adresse. */
		carte: { href: string; ailleurs: boolean } | null;
	} = $props();

	const mots = $derived(t(langue));
	const sens = $derived(isLangue(langueDuTexte) ? direction(langueDuTexte) : 'auto');
	const nouvelOnglet = $derived(annonceNouvelOnglet(langue));
	const site = $derived(infos.website ? lienSite(infos.website) : null);
	/** Un numéro tel qu'un téléphone le compose : ses chiffres, et le « + » du début. */
	const aComposer = $derived((infos.contactPhone ?? '').replace(/(?!^\+)[^0-9]/g, ''));
	const avecContact = $derived(
		infos.contactPhone !== null || infos.contactEmail !== null || infos.website !== null
	);
</script>

{#if infos.announcement}
	<Annonce {langue} {langueDuTexte} texte={infos.announcement} />
{/if}

{#if infos.address}
	<section aria-labelledby="infos-adresse">
		<h2 id="infos-adresse">{mots.infoAddress}</h2>
		<p class="saisi" lang={langueDuTexte} dir={sens}>{infos.address}</p>
		{#if carte}
			<p class="suite">
				{#if carte.ailleurs}
					<a href={carte.href} target="_blank" rel="noopener noreferrer"
						>{mots.infoOpenMap}<span class="pour-lecteur">{nouvelOnglet}</span></a
					>
				{:else}
					<a href={carte.href}>{mots.infoOpenMap}</a>
				{/if}
			</p>
		{/if}
	</section>
{/if}

{#if avecContact}
	<section aria-labelledby="infos-contact">
		<h2 id="infos-contact">{mots.infoContact}</h2>
		<dl>
			{#if infos.contactPhone}
				<dt>{mots.infoPhone}</dt>
				<dd><a href={`tel:${aComposer}`} dir="ltr">{infos.contactPhone}</a></dd>
			{/if}
			{#if infos.contactEmail}
				<dt>{mots.infoEmail}</dt>
				<dd><a href={`mailto:${infos.contactEmail}`} dir="ltr">{infos.contactEmail}</a></dd>
			{/if}
			{#if infos.website}
				<dt>{mots.infoWebsite}</dt>
				<dd>
					{#if site}
						<a href={site} target="_blank" rel="noopener noreferrer" dir="ltr"
							>{infos.website}<span class="pour-lecteur">{nouvelOnglet}</span></a
						>
					{:else}
						<span dir="ltr">{infos.website}</span>
					{/if}
				</dd>
			{/if}
		</dl>
	</section>
{/if}

{#if infos.accessNote}
	<section aria-labelledby="infos-acces">
		<h2 id="infos-acces">{mots.infoAccess}</h2>
		<p class="saisi" lang={langueDuTexte} dir={sens}>{infos.accessNote}</p>
	</section>
{/if}

<style>
	h2 {
		font-size: 1.1rem;
		margin: 1.25rem 0 0.25rem;
	}
	/* Les retours à la ligne de la saisie sont gardés ; un mot trop long ne pousse pas la page. */
	.saisi {
		margin: 0;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.suite {
		margin: 0.25rem 0 0;
	}
	a {
		color: #0f5c55;
		overflow-wrap: anywhere;
	}
	.suite a,
	dd a {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	dl {
		margin: 0;
	}
	dt {
		font-weight: 600;
		font-size: 0.85rem;
		color: #555;
		margin-top: 0.35rem;
	}
	dd {
		margin: 0;
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
