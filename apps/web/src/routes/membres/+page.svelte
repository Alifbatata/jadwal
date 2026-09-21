<script lang="ts">
	import { resolve } from '$app/paths';
	let { data, form } = $props();
	const roleLabel: Record<string, string> = { org_admin: 'responsable', editor: 'éditeur' };
	const estResponsable = $derived(data.role === 'org_admin');
</script>

<h1>{data.organisation.nom}</h1>
<p><a href={resolve('/organisations')}>Changer d’organisation</a></p>

{#if form?.erreur}
	<p role="alert">{form.erreur}</p>
{:else if form?.invitee}
	<p role="status">{form.message}</p>
{/if}

<h2>Membres</h2>
<ul>
	{#each data.membres as membre (membre.id)}
		<li>
			<span>{membre.email}</span>
			<span>{roleLabel[membre.role]}</span>
			{#if estResponsable}
				<form method="post" action="?/role">
					<input type="hidden" name="membershipId" value={membre.id} />
					<input
						type="hidden"
						name="role"
						value={membre.role === 'org_admin' ? 'editor' : 'org_admin'}
					/>
					<button type="submit">
						{membre.role === 'org_admin' ? 'Passer éditeur' : 'Passer responsable'}
					</button>
				</form>
				<form method="post" action="?/retirer">
					<input type="hidden" name="membershipId" value={membre.id} />
					<button type="submit">Retirer</button>
				</form>
			{/if}
		</li>
	{/each}
</ul>

{#if estResponsable}
	<h2>Invitations en attente</h2>
	{#if data.invitations.length === 0}
		<p>Aucune invitation en attente.</p>
	{:else}
		<ul>
			{#each data.invitations as invitation (invitation.id)}
				<li>
					<span>{invitation.email}</span>
					<span>{roleLabel[invitation.role]}</span>
					<form method="post" action="?/annuler">
						<input type="hidden" name="invitationId" value={invitation.id} />
						<button type="submit">Annuler</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}

	<h2>Inviter</h2>
	<p>
		La personne recevra un message l’invitant à se connecter. Rien n’apparaît ici avant qu’elle
		n’accepte, et son nom n’est visible qu’à ce moment.
	</p>
	<form method="post" action="?/inviter">
		<label for="email">Adresse électronique</label>
		<input id="email" name="email" type="email" required />
		<label for="role">Rôle</label>
		<select id="role" name="role">
			<option value="editor">Éditeur</option>
			<option value="org_admin">Responsable</option>
		</select>
		<button type="submit">Envoyer l’invitation</button>
	</form>
{/if}

<style>
	ul {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	li {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
		border-bottom: 1px solid #eee;
		padding-bottom: 0.5rem;
	}
	form[action='?/inviter'] {
		display: grid;
		gap: 0.5rem;
		max-width: 22rem;
	}
	input,
	select,
	button {
		font: inherit;
		padding: 0.4rem;
	}
</style>
