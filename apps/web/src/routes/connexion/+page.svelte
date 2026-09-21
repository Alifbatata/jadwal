<script lang="ts">
	let { form } = $props();
</script>

<h1>Se connecter</h1>

{#if form?.envoye}
	<p role="status">{form.message}</p>
	<p>Vous pouvez fermer cette page.</p>
{:else}
	<p>
		Saisissez votre adresse électronique. Vous recevrez un lien de connexion : il n’y a pas de mot
		de passe.
	</p>
	<form method="post">
		<label for="email">Adresse électronique</label>
		<input id="email" name="email" type="email" autocomplete="email" required />
		{#if form?.erreur}
			<p role="alert">{form.erreur}</p>
		{/if}
		<button type="submit">Recevoir un lien</button>
	</form>
{/if}

<style>
	form {
		display: grid;
		gap: 0.5rem;
		max-width: 22rem;
	}
	input,
	button {
		font: inherit;
		padding: 0.5rem;
	}
</style>
