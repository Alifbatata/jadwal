<script lang="ts">
	import { commonTexts } from '$lib/i18n/common.js';
	import { organisationsTexts } from '$lib/i18n/organisations.js';

	let { data, form } = $props();
	const text = $derived(organisationsTexts[data.language]);
	const roles = $derived(commonTexts[data.language].roles);
</script>

<svelte:head><title>{text.title} | jadwal</title></svelte:head>

<h1>{text.title}</h1>

{#if form?.error}
	<p role="alert">{text.errors[form.error]}</p>
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
			<li>
				<form method="post" action="?/choisir">
					<input type="hidden" name="organizationId" value={membership.organizationId} />
					<button type="submit"><bdi>{membership.organizationName}</bdi></button>
					<span>{text.role(roles[membership.role])}</span>
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
</style>
