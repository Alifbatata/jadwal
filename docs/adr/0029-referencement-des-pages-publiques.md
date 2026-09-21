# ADR 0029 : Référencement des pages publiques

## Contexte

L'ADR 0027 dit que les pages publiques sont « la seule partie du service qui ne porte pas
`noindex` ». C'était vrai et c'était tout : il n'y avait ni `robots.txt`, ni plan de site, ni
adresse canonique, et les liens entre versions linguistiques n'existaient que sous la forme d'un
attribut `hreflang` sur les liens du sélecteur de langue — qui n'est **pas** une annotation de
version linguistique.

Une mosquée qui met son programme en ligne veut qu'on le trouve en cherchant son nom. Le reste du
service — l'espace des responsables, l'API, les flux — n'a rien à faire dans un index.

## Décision

### Un `robots.txt`, un seul groupe, deux règles

```
User-agent: *
Allow: /m/
Allow: /sitemap
Disallow: /

Sitemap: <origine>/sitemap.xml
```

La règle retenue est la plus spécifique, c'est-à-dire la plus longue en octets, et non la première
ni la dernière : l'ordre des lignes n'a aucune importance, on écrit donc l'ordre le plus lisible.
`/m/madretsch/fr` tombe sous `Allow: /m/`, `/reglages` sous `Disallow: /`.

**Un seul groupe `User-agent: *`.** Ajouter un groupe nommé serait un piège : un robot ne retient
que le groupe le plus spécifique qui le désigne et ignore alors toutes les règles du groupe général.

**Les plans de site sont explicitement autorisés.** Une adresse interdite d'exploration n'est jamais
lue, donc la ligne `Sitemap` ne servirait à rien.

**Une seule règle `Allow: /m/`, jamais une ligne par organisation.** La limite d'analyse est de
500 kibioctets et ce qui suit est ignoré en silence : à quelques centaines d'organisations, la fin
du fichier disparaîtrait sans prévenir.

### Le chemin de l'espace des responsables n'est pas dissimulé

`Disallow: /` le nomme, et c'est très bien. La dissimulation ne protège rien : ce qui protège cet
espace, c'est qu'il exige une session, et il porte déjà sa balise `noindex`. Cacher un chemin dans
un `robots.txt` ne fait qu'indiquer où regarder à qui lit le fichier — ce que tout le monde fait.

### Un index de plans de site, et un plan par organisation

`/sitemap.xml` liste `/sitemap-<identifiant>.xml`, un par organisation active. Ce n'est pas
obligatoire tant qu'on tient sous cinquante mille adresses ; c'est tout de même la bonne forme dès
maintenant, parce qu'un moteur ne reprend alors que l'organisation qui a changé.

**Les deux fichiers vivent à la racine.** La portée d'un plan de site est son répertoire parent :
un plan rangé dans `/plans/` ne pourrait déclarer aucune adresse de `/m/`. C'est un piège classique,
et il est silencieux.

Chaque plan porte, pour chaque langue activée : la vue Semaine, la page d'abonnement, et une page
par cours publié. Un brouillon n'y figure pas — non par filtrage, mais parce que le rôle public ne
le voit pas (ADR 0026).

**La date de dernière modification est celle des données servies**, pas l'heure de la requête. Un
plan qui se dirait modifié à chaque lecture ferait réexplorer pour rien, et un moteur cesse vite de
le croire.

### Les versions linguistiques dans la page, pas dans le plan

Les trois façons d'annoncer les versions linguistiques — la page, un en-tête HTTP, le plan de site —
sont équivalentes, et les cumuler n'apporte rien. Nous choisissons **la page** : les balises se
génèrent là où la langue et l'organisation sont déjà connues. Le plan de site les porte aussi, parce
qu'il ne coûte rien de plus une fois la fonction écrite et qu'il aide un moteur à découvrir une
langue qu'aucun lien ne mène.

**La réciprocité est structurelle** : une seule fonction produit la liste des alternatives, et les
quatre pages s'en servent. Si deux versions ne se citent pas l'une l'autre, le groupe entier est
ignoré ; une garantie par construction vaut mieux qu'une garantie surveillée.

### L'adresse canonique, et un choix assumé

Chaque page se canonicalise **dans sa propre langue**, jamais vers le français.

Pour la langue par défaut d'une organisation, l'adresse canonique est l'adresse **courte**
`/m/<identifiant>`, et `/m/<identifiant>/<langue par défaut>` s'y rabat. La recommandation habituelle
est l'inverse — canonicaliser vers l'adresse explicite. Nous faisons le contraire parce que
l'adresse courte est celle que la mosquée met dans sa bio, dans son groupe WhatsApp et sur son
affiche : c'est elle qui doit porter le référencement. `x-default` désigne la même adresse.

**Les filtres ne créent pas d'adresse de plus** : `?public=kids`, `?mois=`, `?jour=` réarrangent le
même programme. L'adresse canonique d'une vue est cette vue sans ses filtres.

### Ce qui n'est pas une page sort de l'index par un en-tête

Une balise `meta` ne vit que dans du HTML. L'API en JSON, les flux `.ics` et les fichiers du widget
portent donc `X-Robots-Tag: noindex`, posé une fois pour toutes dans la fabrique d'en-têtes des
réponses publiques. Ils restent **explorables**, et c'est nécessaire : une adresse interdite
d'exploration ne peut porter aucune consigne d'indexation, puisque le robot ne la lit jamais.

### Une page affichée dans un cadre reste indexée pour elle-même

La recommandation officielle pour qu'une sous-page ne soit indexée que comme partie de la page hôte
est `noindex` accompagné de `indexifembedded`. **Nous ne l'appliquons pas** : `/m/<identifiant>` est
précisément la page que nous voulons voir indexée. Et `indexifembedded` n'existe que chez un moteur ;
un autre ne verrait que le `noindex` et la ferait disparaître entièrement.

## Conséquences

- Une mosquée se trouve en cherchant son nom, dans les quatre langues, avec une adresse par langue
  partageable telle quelle.
- Le contenu affiché dans le cadre du widget est attribué à notre domaine, pas à celui de la
  mosquée. C'est le coût assumé de l'ADR 0005 révisé, et le lien visible du pied du widget est ce
  qui le compense.
- Aucun « ping » n'est envoyé à un moteur après une modification : le point de notification des
  plans de site a été supprimé, et une requête vers l'ancien répond `404`. L'annonce se fait par la
  ligne `Sitemap` du `robots.txt`, plus une soumission manuelle en console de webmestre — qui reste
  une action manuelle en attente.
- Avec quatre langues, chaque page logique produit quatre entrées portant chacune cinq annotations.
  C'est la taille du fichier, et non le nombre d'adresses, qui bornera l'index en premier.

## Statut

Accepté, 2026-09-21. Étape 6 de la feuille de route. Complète l'ADR 0027 (pages publiques) et
l'ADR 0007 (langues).
