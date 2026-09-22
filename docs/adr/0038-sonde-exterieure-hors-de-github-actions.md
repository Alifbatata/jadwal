# 0038 — La sonde sort de GitHub Actions, et c'est le silence qui alerte

- **Statut** : acceptée
- **Date** : 2026-09-21
- **Modifie** : [ADR 0036](0036-taches-periodiques-et-veille.md), qui confiait la sonde extérieure à
  GitHub Actions.

## Le problème

La veille qui tourne sur le serveur sait tout, sauf une chose : si le serveur est injoignable, elle
est injoignable avec lui. L'ADR 0036 avait donc confié cette question à un travail programmé de
GitHub Actions, qui interrogeait `/healthz` toutes les quinze minutes.

Deux défauts, et le premier est rédhibitoire.

1. **Les machines de GitHub n'ont pas d'IPv6 sortant.** Le service publie un enregistrement `AAAA`,
   et la moitié de sa surface publique n'était donc jamais éprouvée depuis l'extérieur. Un serveur
   qui répond en IPv4 et se tait en IPv6 — un pare-feu asymétrique, une règle oubliée, un conteneur
   publié sur une seule pile — passait inaperçu. L'ADR 0036 le disait déjà, et s'en remettait à la
   veille interne : c'est-à-dire à quelqu'un qui n'est pas dehors.
2. **Les minutes ne sont pas gratuites, et les exécutions programmées sont « au mieux ».** Une sonde
   toutes les quinze minutes consomme un quota qui sert par ailleurs à construire et à publier
   l'image ; et un retard de plusieurs minutes est normal, ce qui oblige à rendre l'alerte molle pour
   éviter le faux positif — donc à la rendre lente.

S'ajoute une raison qui n'est pas technique : l'alerte partait par SMTP depuis un workflow, ce qui
demandait de confier des identifiants de messagerie à la forge qui héberge le code public. Les trois
secrets n'ont jamais été posés ; l'alerte n'aurait donc jamais pu partir.

## La décision

Deux mécanismes, et le second est le plus important.

### 1. Une sonde, sur le serveur, comme les autres tâches

`jadwal-sonde@4.timer` et `jadwal-sonde@6.timer`, toutes les cinq minutes, interrogent
`/healthz` **par le nom public de l'instance** — donc par le DNS, par le serveur web de l'hôte et par
TLS. `curl -4` et `curl -6` séparément, dix secondes au plus, trois essais sur environ une minute.
Succès : un battement de cœur ; échec : `/fail` avec l'erreur de `curl`, et rien d'autre.

Une pile par unité, parce que deux piles tombent séparément et que c'est justement la panne qu'on
veut voir. Une instance qui ne publie pas d'`AAAA` coupe la seconde (`jadwal_sonde_ipv6: false`) :
sans cela sa sonde échouerait toutes les cinq minutes pour une adresse qui n'existe pas, et elle
apprendrait à ignorer ses alertes.

La sonde ne sort **jamais** en erreur, et son unité ne porte pas de `OnFailure=`. Sinon une panne
enverrait un courriel toutes les cinq minutes, en plus de l'alerte de la supervision : deux canaux
pour la même nouvelle, dont un qu'on apprendrait très vite à filtrer.

### 2. Un service de battements de cœur, dehors, qui alerte sur le silence

Chaque tâche périodique — la sonde comprise — signale sa réussite à un service de supervision
extérieur. **C'est lui qui alerte quand un battement attendu n'arrive pas.** Le renversement est
tout l'intérêt : ce n'est plus à celui qui tombe de prévenir qu'il est tombé.

Le même service reçoit un battement trimestriel du test de déchiffrement complet, qu'aucune machine
ne peut produire toute seule puisqu'il exige la clé privée de l'exploitant.

## Ce que la sonde ne voit pas, et il faut l'écrire

**Elle tourne sur le serveur qu'elle interroge.** Son trafic ressort rarement de la machine : le
noyau reconnaît sa propre adresse publique et boucle en interne. Un blocage qui ne toucherait que les
visiteurs — une règle de pare-feu en entrée, un routage cassé chez l'hébergeur, un peering mort — ne
se verra donc **pas** par cette sonde. Elle dira « ça va » pendant que personne n'arrive.

Ce qui couvre l'autre moitié, ce n'est pas elle : c'est le **silence**. Serveur éteint, réseau coupé,
machine saisie, disque plein au point que plus rien ne s'exécute — les battements cessent d'arriver,
et le service de supervision, qui est dehors, alerte. La sonde dit « ça va » ; c'est son absence qui
dit le reste.

Ce partage est assumé et il a une limite nette : **entre les deux, il reste un angle mort** — un
serveur en parfait état de marche, joignable par lui-même, mais coupé du monde par un tiers. Le
couvrir demanderait une machine ailleurs, donc une machine de plus à tenir, et ce n'est pas un coût
que ce projet paie aujourd'hui. Qui l'exige installe la même sonde ailleurs : elle ne demande qu'un
`curl` et l'adresse de battement.

## Ce qu'un battement transporte

**Un code de sortie et un court message technique, rien d'autre.** Jamais un cours, jamais une
adresse électronique, jamais un identifiant d'organisation. En cas d'échec, la sonde envoie l'erreur
de `curl` — « `couldn't` connect to host », un code HTTP — et le nom de la tâche. Ce que le service de
supervision apprend de plus que le public, c'est qu'un service existe et qu'il va bien ou mal.

**Et il est facultatif.** Sans adresse de battement dans le fichier d'environnement, les tâches
tournent exactement pareil et le disent dans leur journal : une instance qui s'auto-héberge n'a pas à
ouvrir un compte chez un tiers pour faire tourner jadwal.

## Pourquoi pas la veille interne seule

Parce qu'elle tombe avec le serveur, et que c'est précisément le cas qu'on veut couvrir. Les deux se
complètent : la veille interne voit ce que l'extérieur ne peut pas voir — disque, certificat, tâches
muettes, verrous de conservation — et l'extérieur voit ce que l'intérieur ne peut pas voir :
l'absence.

## Ce qui reste hors de ce dépôt

Les adresses de battement sont des jetons — qui les connaît peut faire croire que la tâche va bien.
Elles vivent dans le coffre chiffré, et le playbook les écrit dans le fichier d'environnement du
serveur. Ce dépôt ne décrit que la forme : une sonde par pile, cinq minutes, dix minutes de marge, et
un service qui alerte sur le silence.

## Ce que l'on perd

- **Une dépendance de plus**, et elle est dans le chemin de l'alerte. Si le service de supervision
  tombe, personne ne prévient. C'est accepté : il est plus simple et plus surveillé que ce qu'il
  surveille, et son silence se remarque.
- **L'angle mort décrit plus haut** : un serveur sain mais coupé du monde par un tiers reste
  invisible tant qu'il continue de battre.
