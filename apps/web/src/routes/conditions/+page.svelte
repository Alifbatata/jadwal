<script lang="ts">
	import Texte from '$lib/conditions/Texte.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Conditions d’utilisation | jadwal</title></svelte:head>

<Texte html={data.html} />
