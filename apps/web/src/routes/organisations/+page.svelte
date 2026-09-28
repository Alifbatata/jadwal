<script lang="ts">
	import { resolve } from '$app/paths';
	import { commonTexts } from '$lib/i18n/common.js';
	import { organisationsTexts } from '$lib/i18n/organisations.js';

	let { data, form } = $props();
	const text = $derived(organisationsTexts[data.language]);
	const roles = $derived(commonTexts[data.language].roles);
	/** Le départ qui attend une confirmation (étape 19). */
	const aConfirmer = $derived(form && 'aConfirmer' in form ? form.aConfirmer : null);
	/** Le refus fait à la seule personne responsable, avec le nom de l'organisation. */
	const seuleResponsable = $derived(
		form && 'organisation' in form && form.error === 'lastManager' ? form.organisation : null
	);
</script>

<svelte:head><title>{text.title} | jadwal</title></svelte:head>

<!-- Ce qui vient de lui arriver, sur l'écran où elle arrive, avant tout le reste : elle a quitté une
     organisation, ici ou depuis Membres (étape 19), ou depuis l'écran d'acceptation des conditions
     (étape 20). Comme l'encadré de la responsable devenue éditrice, dans la coquille. -->
{#if data.departed}
	<p id="avis-depart" class="avis" role="status">{text.left}</p>
{/if}

<h1>{text.title}</h1>

{#if seuleResponsable}
	<div id="refus-depart" class="refus" role="alert">
		<p>{text.errors.lastManager} <strong><bdi>{seuleResponsable}</bdi></strong></p>
		<p>{text.lastManagerWhat}</p>
	</div>
{:else if form?.error && form.error !== 'lastManager'}
	<p role="alert">{text.errors[form.error]}</p>
{/if}

<!-- Quitter une organisation ne se fait pas au premier envoi : l'écran nomme l'organisation, dit ce
     que le départ fera, et demande de confirmer, en haut, là où la page s'ouvre après l'envoi, avec
     ou sans JavaScript. « Rester dans l'organisation » est un lien, qui ramène à l'écran sans rien
     envoyer. -->
{#if aConfirmer}
	<div id="confirmer-depart" class="confirmer" role="alert">
		<p>{text.confirmLeave.intro} <strong><bdi>{aConfirmer.organisation}</bdi></strong></p>
		<p>{text.confirmLeave.what}</p>
		<div class="ligne">
			<form method="post" action="?/quitter">
				<input type="hidden" name="organizationId" value={aConfirmer.organizationId} />
				<input type="hidden" name="confirm" value="yes" />
				<button type="submit">{text.confirmLeave.button}</button>
			</form>
			<a href={resolve('/organisations')}>{text.confirmLeave.stay}</a>
		</div>
	</div>
{/if}

{#if data.memberships.length === 0 && data.invitations.length === 0}
	<p>{text.none}</p>
	{#if data.person}
		<!-- L'adresse du compte : c'est celle qu'il faut donner à qui invite. -->
		<p>{text.yourAddress} <strong><bdi>{data.person.email}</bdi></strong></p>
	{/if}
{/if}

{#if data.memberships.length > 0}
	<p>{text.chooseIntro}</p>
	<ul>
		{#each data.memberships as membership (membership.organizationId)}
			<li class="ligne">
				<form method="post" action="?/choisir">
					<input type="hidden" name="organizationId" value={membership.organizationId} />
					<button type="submit" id={`organisation-${membership.organizationId}`}
						><bdi>{membership.organizationName}</bdi></button
					>
					<span>{text.role(roles[membership.role])}</span>
				</form>
				<!-- Le bouton dit son geste ; l'organisation qu'il vise lui sert de description. -->
				<form method="post" action="?/quitter">
					<input type="hidden" name="organizationId" value={membership.organizationId} />
					<button
						type="submit"
						class="secondaire"
						aria-describedby={`organisation-${membership.organizationId}`}>{text.leave}</button
					>
				</form>
			</li>
		{/each}
	</ul>
	<p class="aide">{text.rolesHelp}</p>
{/if}

{#if data.invitations.length > 0}
	<h2>{text.invitationsTitle}</h2>
	<p>{text.invitationsIntro}</p>
	<ul>
		{#each data.invitations as invitation (invitation.id)}
			<li>
				<form method="post" action="?/accepter">
					<input type="hidden" name="invitationId" value={invitation.id} />
					<span class="invitation">
						<strong><bdi>{invitation.organisation}</bdi></strong>
						<span>{text.role(roles[invitation.role])}</span>
					</span>
					<button type="submit">{text.accept}</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}

<style>
	ul {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	form {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.ligne {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
	}
	.invitation {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
	}
	button {
		font: inherit;
		min-height: 44px;
		padding: 0.5rem 1rem;
	}
	span,
	.aide {
		color: #4a5560;
		font-size: 0.95rem;
	}
	.invitation strong {
		color: #1a1a1a;
	}
	.avis,
	.confirmer,
	.refus {
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-block: 0 1rem;
		max-width: 36rem;
	}
	/* Les couleurs de l'encadré de la coquille, pour que les deux se lisent de la même façon. */
	.avis {
		border: 2px solid #0f5c55;
		background: #f0fdfa;
	}
	.confirmer,
	.refus {
		border: 2px solid #b91c1c;
	}
	.confirmer p,
	.refus p {
		margin: 0.35rem 0;
	}
</style>
