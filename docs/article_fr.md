# FlowState — Gestion d'État externe pour workflows stateless

## Introduction

Pourquoi les moteurs de workflow stateless montrent leurs limites dès qu’on introduit des LLM et de la génération de contenu multi-étapes.

Les moteurs de workflow comme n8n sont volontairement **stateless**.

C’est en général une excellente décision de conception :  
les workflows sont plus simples à comprendre, les échecs sont isolés, et l’exécution reste prévisible.

Mais dès que l’on commence à construire des automatisations non triviales — en particulier celles impliquant des LLM, de la génération de contenu en plusieurs étapes ou des processus itératifs — ce choix devient rapidement source de friction.

On finit par se battre contre l’outil :

- les boucles deviennent fragiles  
- les nœuds de merge se multiplient  
- l’état est dupliqué dans les items  
- des opérations simples comme “ajouter du texte étape par étape” deviennent des acrobaties de graphe  

FlowState est un petit service que j’ai construit pour résoudre exactement ce problème.

Il externalise l’état dans une API HTTP simple, permettant aux moteurs de workflow stateless de rester stateless — tout en rendant possibles des mutations d’état structurées et incrémentales au cours d’une même exécution.

---

## Le problème des workflows stateless

Les moteurs de workflow comme n8n sont stateless par conception — et pour de bonnes raisons.

Chaque nœud reçoit une entrée, produit une sortie, puis le moteur passe à l’étape suivante.  
Il n’y a pas de mémoire partagée, pas de couplage implicite entre les étapes, et aucun état transporté de manière invisible dans le temps.

Ce modèle fonctionne très bien pour :

- les transformations de données  
- les pipelines fan-in / fan-out  
- les workflows de type ETL  
- les automatisations événementielles  

Mais il commence à montrer ses limites dès que les workflows deviennent **itératifs** ou **stateful par nature**.

---

### Quand le stateless devient une friction

Dans des automatisations réelles, on a souvent besoin de :

- construire un document progressivement  
- accumuler des résultats étape par étape  
- suivre une progression ou un index  
- préserver un contexte entre plusieurs appels LLM  
- reprendre une exécution après un échec  

Dans un moteur stateless, rien de tout cela n’existe nativement.

On est alors obligé de **simuler l’état** via les mécanismes du workflow :

- boucler sur des items uniquement pour transporter des données  
- utiliser des nœuds de merge pour recomposer des résultats partiels  
- gérer manuellement l’ordre et les index  
- dupliquer le contexte à chaque étape  
- maintenir des graphes fragiles qui cassent au moindre changement  

Le workflow fonctionne encore — mais le modèle mental se dégrade rapidement.

Des intentions simples (“ajouter ce paragraphe”, “incrémenter l’étape”, “se souvenir de cette décision”) deviennent implicites, dispersées sur plusieurs nœuds, et difficiles à raisonner.

---

### Les LLM aggravent le problème

Les workflows basés sur des LLM amplifient cette friction.

Ils sont généralement :

- séquentiels  
- dépendants du contexte  
- probabilistes  
- parfois longs à exécuter  

On ne veut presque jamais un appel LLM monolithique.

À la place, on veut :

- générer un plan  
- développer les sections une par une  
- affiner le contenu itérativement  
- conserver les résultats intermédiaires  
- reprendre après un échec partiel  

Essayer de faire cela dans un moteur stateless mène souvent à :

- des boucles profondément imbriquées  
- une explosion du nombre d’items  
- une logique de merge complexe  
- des exécutions difficiles à déboguer  

À ce stade, le graphe ne reflète plus l’intention métier — il reflète le contournement.

---

### L’abstraction manquante

Le problème n’est pas que les moteurs stateless soient mal conçus.

Le problème est que **l’état est une abstraction manquante**, repoussée dans le graphe lui-même.

Ce qu’il manque, c’est un endroit simple et explicite où un workflow peut dire :

#### « Cette exécution a un état.  
Je veux le lire, le modifier, et continuer. »

Sans transformer le moteur en base de données.  
Sans introduire de couplage caché.  
Sans casser le modèle stateless.

C’est exactement ce vide que FlowState vient combler.

---

## Ce que je ne voulais pas construire

Avant d’expliquer ce qu’est FlowState, il est important de préciser ce qu’il **n’est volontairement pas**.

Il existe déjà d’excellents outils pour la persistance, la messagerie et l’orchestration.  
FlowState existe précisément parce qu’aucun d’entre eux ne correspondait à ce besoin très spécifique.

### ❌ Pas une base de données

FlowState n’essaie pas d’être une base de données.

Il n’y a :

- ni schéma  
- ni index  
- ni requêtes  
- ni garanties de durabilité  

L’état vit en mémoire et peut disparaître à tout moment.

C’est intentionnel.

Si vous avez besoin de persistance longue durée ou de cohérence forte, une vraie base de données est le bon outil.

---

### ❌ Pas une file ou un système d’événements

FlowState ne planifie rien, ne déclenche rien et n’orchestre rien.

Il n’y a :

- ni workers  
- ni retries  
- ni acknowledgements  
- ni backpressure  

Les moteurs de workflow font déjà très bien ce travail.

FlowState ne fait qu’une chose : stocker de l’état.

---

### ❌ Pas un moteur de workflow

FlowState ne décide jamais de la suite des opérations.

Il n’y a :

- ni conditions  
- ni branchements  
- ni boucles  
- ni logique de contrôle  

Toute l’orchestration reste dans le moteur de workflow (n8n, Temporal, Airflow, ou du code).

FlowState est volontairement passif.

---

### ❌ Pas une couche de persistance

L’état n’est pas garanti après un redémarrage.

Il n’y a :

- ni réplication  
- ni snapshots  
- ni mécanisme de récupération  

Cela rend FlowState simple, rapide et prévisible — mais impropre comme source de vérité.

---

### ❌ Pas un produit avec interface

Il n’y a :

- ni dashboard  
- ni visualisation  
- ni éditeur  
- ni interface d’administration  

FlowState est un outil API-first, conçu pour être invisible.

Si vous ne remarquez pas FlowState en construisant votre workflow, c’est qu’il fait correctement son travail.

---

### Pourquoi ces contraintes sont importantes

En limitant volontairement son périmètre, FlowState reste :

- petit  
- compréhensible  
- auditable  
- difficile à détourner  
- facile à remplacer  

FlowState n’est pas une infrastructure fondationnelle.

C’est un **outil de support** — quelque chose sur lequel on peut s’appuyer sans bâtir tout son système autour.

---

## L’idée centrale

L’idée derrière FlowState est volontairement simple :

#### Externaliser l’état mutable dans un service explicite, et garder le moteur de workflow stateless.

Au lieu de forcer un moteur stateless à simuler de la mémoire, FlowState rend l’état explicite.

Chaque exécution de workflow est associée à **un état unique**, identifié par un `runId`.

Cet état vit en dehors du moteur et est accessible uniquement via une petite API HTTP.

Le workflow devient alors une suite d’étapes pures :

- lire l’état  
- calculer  
- écrire l’état  
- continuer  

Sans merges implicites.  
Sans accumulation cachée.  
Sans explosion d’items.

---

### Une exécution, un état

FlowState ne modélise ni workflows, ni étapes, ni graphes.

Il ne connaît qu’une seule chose :

#### Une exécution possède un état.

Cet état :

- est créé explicitement  
- modifié explicitement  
- lu explicitement  
- détruit explicitement  

Les transitions d’état deviennent visibles, auditables et faciles à comprendre.

---

### L’état comme entrée / sortie de première classe

Dans un workflow basé sur FlowState :

- l’état n’est pas caché dans les items  
- il n’est pas passé implicitement entre les nœuds  
- il n’est pas reconstruit via des merges  

Il devient :

- une entrée d’étape  
- une sortie d’étape  

Ce modèle correspond à la manière dont on raisonne déjà sur des processus multi-étapes — sans forcer le moteur à simuler de la mémoire.

---

### Les moteurs stateless restent stateless

FlowState ne combat pas la conception de n8n.

Il l’embrasse.

Le moteur reste :

- redémarrable  
- parallélisable  
- prévisible  

Toute la mutabilité est repoussée vers les bords — exactement là où elle doit être.

---

### Pourquoi cela fonctionne particulièrement bien avec les LLM

Les workflows LLM exposent fortement les limites du stateless :

- génération incrémentale de texte  
- retries  
- échecs partiels  
- chaînes longues  
- accumulation de contexte  

En externalisant l’état :

- chaque appel LLM peut ajouter ou modifier du contenu de manière sûre  
- les retries ne dupliquent pas le résultat  
- le progrès partiel est conservé  
- les sorties longues sont construites progressivement  

FlowState n’essaie pas d’être intelligent sur le contenu.

Il garantit simplement des mutations d’état déterministes.

---

### Une petite idée, volontairement

La décision de conception la plus importante de FlowState est ce qu’il refuse de faire.

Il ne :

- déduit pas l’intention  
- fusionne pas automatiquement  
- masque pas les conflits  
- gère pas les workflows  
- persiste pas les données indéfiniment  

En restant petit, FlowState devient :

- facile à faire confiance  
- facile à déboguer  
- facile à remplacer  

La contrainte est la fonctionnalité.

---

## Un exemple concret avec n8n

Prenons un cas très courant :  
#### générer un article long, étape par étape, avec un LLM.

### L’approche classique

Sans état externe, le workflow finit souvent par contenir :

- une boucle pour parcourir les sections  
- des nœuds de merge pour recomposer le texte  
- de la gestion d’items pour préserver l’ordre  
- une logique défensive pour éviter les doublons  

Chaque appel LLM produit un fragment, mais n8n n’a aucun endroit naturel pour les accumuler.

Cela fonctionne — jusqu’à ce que ça casse.

Les retries dupliquent le contenu.  
Les échecs partiels réinitialisent l’avancement.  
Le graphe devient plus complexe que la logique métier.

---

### La même chose avec FlowState

Avec FlowState, le workflow devient linéaire.

#### Étape 1 — Créer l’état

```json
POST /state
{
  "context": {
    "engine": "n8n",
    "executionId": "{{ $execution.id }}",
    "workflowId": "{{ $workflow.id }}",
    "topic": "AI consciousness",
    "language": "en"
  },
  "onConflict": "resume"
}
```

FlowState retourne un runId, réutilisé dans tout le workflow.

#### Étape 2 — Générer une section
```json
POST /state/{runId}/append
{
  "path": "sections",
  "value": {
    "type": "markdown",
    "content": "# Introduction\nAI is evolving...",
    "createdAt": 1700000012345
  }
}
```
Un append explicite.
Pas de merge. Pas de boucle.


#### Étape 3 — Retry sans peur
En cas de retry :

les sections existantes restent intactes
  - le contenu n’est ajouté qu’une seule fois
  - l’ordre est préservé

#### Étape 4 — Finalisation

```json
PATCH /state/{runId}
{
  "output": {
    "markdown": "{{ assembled_markdown }}",
    "publishedUrl": "https://example.com/article"
  },
  "meta": {
    "status": "success"
  }
}
```

### Qu’est-ce qui a changé ?

Le graphe du workflow est devenu :

- plus court  
- plus lisible  
- plus facile à déboguer  

La complexité a été déplacée là où elle doit être :

#### Dans des mutations d’état explicites, pas dans des acrobaties de contrôle de flux.

---

## Limitations et compromis

FlowState est volontairement contraint.

Il résout **un seul problème** :

#### Partager un état mutable entre les étapes d’une exécution unique de workflow.

Tout le reste est soit hors périmètre, soit évité volontairement.

---

### Aucune garantie de persistance

FlowState est un service **en mémoire**.

Si le processus redémarre, l’état est perdu.

C’est un compromis assumé, pas un bug.

---

### Pas de coordination globale

L’état est **limité à une exécution**.

Il n’y a pas :

- de synchronisation entre plusieurs runs  
- de coordination entre workflows  
- de verrouillage global  

---

### Pas de contrôle de concurrence intégré

FlowState ne tente pas de gérer la concurrence de manière générale.

Les conflits sont traités uniquement lors de la création de l’état
(`resume` / `replace`), pas au niveau des champs ou des opérations.

Cela convient à :

- des workflows déterministes  
- des graphes d’exécution maîtrisés  
- des mutations de type append  

Ce n’est pas adapté à un état fortement concurrent.

---

### Pas de langage de requête

L’API reste minimale.

Vous pouvez :

- lire l’état complet  
- modifier des chemins connus  

Vous ne pouvez pas :

- exécuter des requêtes complexes  
- filtrer ou agréger des données  

---

### Gestion explicite du cycle de vie

L’état a une durée de vie finie.

FlowState fournit :

- une expiration par TTL  

Il ne fournit pas :

- d’archivage  
- de sauvegarde  
- de mécanisme de récupération  

Une fois expiré, un run est définitivement perdu.

---

### Résumé des compromis

En acceptant ces limites, FlowState reste :

- simple  
- compréhensible  
- auditable  
- difficile à détourner  
- facile à remplacer  

FlowState n’est pas une infrastructure fondationnelle.

C’est un **outil de support** — quelque chose sur lequel on peut s’appuyer
sans bâtir tout son système autour.

---

## Pourquoi je partage ceci

FlowState est né d’un besoin personnel.

Je ne cherchais pas à créer un produit ou une plateforme.
Je voulais simplement réduire la friction dans mes propres workflows.

Ce qui m’a surpris, ce n’est pas que ça fonctionne —
c’est la fréquence à laquelle j’y ai eu recours une fois l’outil disponible.

---

### Ce que j’ai appris

- Les systèmes stateless sont excellents… jusqu’à ce qu’on ait besoin de mutabilité contrôlée  
- Externaliser l’état peut simplifier les workflows au lieu de les compliquer  
- Les contraintes sont une fonctionnalité, pas une limitation  
- Les petits outils aux frontières nettes vieillissent mieux  

---

### Pourquoi cela peut aider d’autres personnes

Si vous :

- utilisez n8n ou d’autres orchestrateurs stateless  
- construisez des workflows fortement basés sur des LLM  
- en avez assez des boucles fragiles et des nœuds de merge  
- cherchez quelque chose de léger et auto-hébergé  

Alors FlowState peut vous faire gagner du temps —
ou au minimum vous proposer une autre façon de penser l’état.

---

## Et ensuite (peut-être)

FlowState est volontairement petit, et je souhaite qu’il le reste.

Quelques pistes possibles — à considérer avec prudence :

- authentification / contrôle d’accès  
- meilleure observabilité  
- persistance optionnelle  
- typage et validation plus stricts  

Rien de tout cela n’est une promesse.

Si FlowState cesse d’être utile, il doit être facile à remplacer.

Ce ne serait pas un échec — ce serait la conception qui fonctionne comme prévu.