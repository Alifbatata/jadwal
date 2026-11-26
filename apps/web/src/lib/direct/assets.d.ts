// L'adresse d'un fichier servi tel quel, jamais fondu dans la page en `data:` (`?no-inline`) : la
// politique de sécurité du contenu n'accepte un script que de la même origine. Les types de Vite
// déclarent `?url` et `?no-inline` chacun à part, pas les deux ensemble.
declare module '*?url&no-inline' {
	const address: string;
	export default address;
}
