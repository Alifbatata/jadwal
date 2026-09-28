<script lang="ts">
	import { resolve } from '$app/paths';
	import Texte from '$lib/conditions/Texte.svelte';
	import { organisationsTexts } from '$lib/i18n/organisations.js';
	import { termsTexts } from '$lib/i18n/terms.js';

	let { data, form } = $props();
	const text = $derived(termsTexts[data.language]);
	/** Les phrases du départ, celles de « Vos organisations » (étape 20). */
	const depart = $derived(organisationsTexts[data.language]);
	/**
	 * Le début de la phrase, jusqu'au nom : il porte lui-même ce qui l'en sépare, une espace, ou
	 * l'« d’ » du français collé au nom (`deDevant`). Rien ne s'écrit donc entre les deux.
	 */
	const avantLeNom = $derived(text.acceptIntro.before(data.organisation));
	/** Le départ qui attend une confirmation. */
	const aConfirmer = $derived(form && 'aConfirmer' in form ? form.aConfirmer : null);
	/** Le refus fait à la seule personne responsable, avec le nom de l'organisation. */
	const seuleResponsable = $derived(
		form && 'organisation' in form && form.error === 'lastManager' ? form.organisation : null
	);
</script>

<svelte:head><title>{text.title} | jadwal</title></svelte:head>

<h1>{text.title}</h1>

<!-- Ne pas accepter, et partir (étape 20) : le refus et la demande de confirmation viennent en haut,
     après le titre et avant le texte, parce que la page, longue, s'ouvre en haut après l'envoi. La
     seule personne responsable lit ce qu'elle doit faire d'ici. « Rester dans l'organisation »
     ramène à cet écran, sans rien envoyer. Au même endroit, un envoi qui nommait une autre
     organisation que celle de la session : l'écran est maintenant celui de la session, et le dit. -->
{#if form?.error === 'sessionChanged'}
	<div id="organisation-changee" class="refus" role="alert">
		<p>{text.sessionChanged.what}</p>
		<p>{text.sessionChanged.now} <strong><bdi>{data.organisation}</bdi></strong></p>
	</div>
{:else if seuleResponsable}
	<div id="refus-depart" class="refus" role="alert">
		<p>{depart.errors.lastManager} <strong><bdi>{seuleResponsable}</bdi></strong></p>
		<p>{text.lastManagerWhat}</p>
	</div>
{:else if form?.error === 'notMember'}
	<div id="refus-depart" class="refus" role="alert">
		<p>{depart.errors.notMember}</p>
	</div>
{/if}
{#if aConfirmer}
	<div id="confirmer-depart" class="confirmer" role="alert">
		<p>{depart.confirmLeave.intro} <strong><bdi>{aConfirmer.organisation}</bdi></strong></p>
		<p>{depart.confirmLeave.what}</p>
		<div class="ligne">
			<form method="post" action="?/quitter">
				<input type="hidden" name="organizationId" value={aConfirmer.organizationId} />
				<input type="hidden" name="confirm" value="yes" />
				<button type="submit" class="danger">{depart.confirmLeave.button}</button>
			</form>
			<a href={resolve('/conditions/accepter')}>{depart.confirmLeave.stay}</a>
		</div>
	</div>
{/if}

<p class="raison">
	{avantLeNom}<strong><bdi>{data.organisation}</bdi></strong>{text.acceptIntro.after}
</p>
<p class="version">{text.version(data.date)}</p>
<p class="version encore">{text.askedAgain}</p>
<!-- Avant le texte, et non sous le bouton : qui voulait entrer dans une autre organisation n'a pas à
     parcourir tout le document pour le trouver. -->
{#if data.autreOrganisation}
	<p><a href={resolve('/organisations')}>{text.otherOrganisation}</a></p>
{/if}

<!-- Le texte reste en français dans toutes les langues (retour D4), et le dit d'abord dans une autre. -->
{#if text.onlyInFrench}
	<p class="francais-seulement">{text.onlyInFrench}</p>
{/if}
<div lang="fr" dir="ltr">
	<Texte html={data.html} />
</div>

<div class="accord">
	<!-- L'organisation que l'écran nomme : l'accord ne vaut que pour elle, et le serveur la compare
	     à celle de la session. -->
	<form method="post" action="?/accepter">
		<input type="hidden" name="organizationId" value={data.organizationId} />
		<button type="submit">{text.accept}</button>
	</form>
	<p>{text.closedUntil(data.organisation)}</p>
	<!-- Un bouton secondaire, sous celui qui accepte : le premier envoi ne fait rien partir, il demande
	     une confirmation en haut de la page. Il nomme la même organisation. -->
	<form method="post" action="?/quitter">
		<input type="hidden" name="organizationId" value={data.organizationId} />
		<button type="submit" class="secondaire">{text.leave}</button>
	</form>
</div>

<style>
	.raison {
		font-size: 1.05rem;
	}
	.version {
		color: #4a5560;
		font-size: 0.95rem;
	}
	.encore {
		margin-bottom: 1.5rem;
	}
	.francais-seulement {
		padding: 0.75rem 1rem;
		background: #eef6f5;
		border-block-end: 2px solid var(--accent);
		font-weight: 600;
	}
	.accord {
		margin-top: 2rem;
		padding-top: 1.25rem;
		border-top: 1px solid #c8ced4;
	}
	button {
		min-height: 44px;
		font: inherit;
		font-weight: 600;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--accent-texte);
		cursor: pointer;
	}
	/* Le départ ne ressemble pas à l'accord : un bouton blanc sous l'accord, un bouton rouge pour la
	   confirmation, comme les autres suppressions de l'espace. */
	button.secondaire {
		font-weight: 400;
		border-color: #888;
		background: #fff;
		color: #1a1a1a;
	}
	button.danger {
		border-color: #b91c1c;
		background: #b91c1c;
		color: #fff;
	}
	.accord p {
		color: #4a5560;
		font-size: 0.95rem;
	}
	.confirmer,
	.refus {
		border: 2px solid #b91c1c;
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-block: 0 1rem;
		max-width: 36rem;
	}
	.confirmer p,
	.refus p {
		margin: 0.35rem 0;
	}
	.ligne {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
	}
</style>
