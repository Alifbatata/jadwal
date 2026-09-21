<script lang="ts">
	let { data, form } = $props();
	const roleLabel = { org_admin: 'responsable', editor: 'éditeur' } as const;
</script>

<h1>Vos organisations</h1>

{#if form?.erreur}
	<p role="alert">{form.erreur}</p>
{/if}

{#if data.memberships.length === 0 && data.invitations.length === 0}
	<p>
		Votre compte n’est rattaché à aucune organisation. Si vous attendez une invitation, demandez à
		la personne responsable de vous l’envoyer à cette adresse.
	</p>
{/if}

{#if data.memberships.length > 0}
	<ul>
		{#each data.memberships as membership (membership.organizationId)}
			<li>
				<form method="post" action="?/choisir">
					<input type="hidden" name="organizationId" value={membership.organizationId} />
					<button type="submit">{membership.organizationName}</button>
					<span>{roleLabel[membership.role]}</span>
				</form>
			</li>
		{/each}
	</ul>
{/if}

{#if data.invitations.length > 0}
	<h2>Invitations reçues</h2>
	<ul>
		{#each data.invitations as invitation (invitation.id)}
			<li>
				<form method="post" action="?/accepter">
					<input type="hidden" name="invitationId" value={invitation.id} />
					<span>{invitation.organisation} ({roleLabel[invitation.role]})</span>
					<button type="submit">Accepter</button>
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
		gap: 0.75rem;
	}
	button {
		font: inherit;
		padding: 0.5rem 1rem;
	}
	span {
		color: #555;
		font-size: 0.9rem;
	}
</style>
