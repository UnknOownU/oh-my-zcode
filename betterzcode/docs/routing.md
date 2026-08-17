# Routing GLM — quel modèle pour quel rôle

> **Source de vérité de ce document** : mesures faites le 2026-08-17 sur le compte GLM Coding Plan de l'utilisateur
> (endpoint `https://api.z.ai/api/coding/paas/v4`), croisées avec la littérature 2024-2026.
> Tout chiffre marqué **[MESURÉ]** vient de nos propres runs (données brutes dans `exp/`).
> Tout chiffre marqué **[PUBLIÉ]** vient d'un papier ou d'un leaderboard, avec sa référence.

---

## 0. TL;DR — la matrice de routing

| Rôle | Modèle | Effort | Pourquoi (preuve) |
|---|---|---|---|
| **WORKER** (écrit le code) | `glm-5.3` | `max` | Meilleur modèle de la palette sur les benchmarks agentiques **[PUBLIÉ]** ; recommandation officielle Z.AI pour le code |
| **REVIEWER** (relit, ne code pas) | `glm-5.3` en **contexte frais** | `high` | **0 % de faux-OK et 6,2 % de faux-rejet contre 21-26 % pour tous les autres [MESURÉ]** ; 2,5× plus rapide |
| **QA** (exécute, prouve) | `glm-5.3` | `high` | ⚠️ **Changé après EXP-6** : sur de vrais patchs multi-fichiers, glm-4.7 rejette 78 % du code correct et n'identifie le vrai défaut que 11,8 % du temps **[MESURÉ]** (voir §3quater) |
| **Fallback QA / recon rapide** | `glm-5-turbo` | `low` | Le moins cher en tokens **[MESURÉ]** — mais **jamais en Reviewer** (voir §3) |
| **JAMAIS Reviewer** | `glm-5-turbo` | — | Seul modèle à approuver du code défectueux (3 % faux-OK) **[MESURÉ]** + pire reviewer sur 5 modèles dans arXiv 2606.15689 **[PUBLIÉ]** |

---

## 1. La palette réelle (et pourquoi elle n'est pas celle de la doc)

**[MESURÉ]** En interrogeant chaque ID puis en lisant le champ `model` de la réponse HTTP :

| ID demandé | Répond réellement | Statut |
|---|---|---|
| `glm-4.5` | `glm-4.5` | ✅ modèle réel |
| `glm-4.6` | `glm-4.6` | ✅ modèle réel |
| `glm-4.7` | `glm-4.7` | ✅ modèle réel |
| `glm-5-turbo` | `glm-5-turbo` | ✅ modèle réel |
| `glm-5.3` | `glm-5.3` | ✅ modèle réel |
| `glm-4.5-air` | `glm-4.7` | 🔀 alias |
| `glm-5` | `glm-5.3` | 🔀 alias |
| `glm-5.1` | `glm-5.3` | 🔀 alias |
| `glm-5.2` | `glm-5.3` | 🔀 alias |
| `glm-5.2-highspeed` | HTTP 429 / code 1311 | ⛔ existe, hors plan |
| `glm-5.3[1m]` | HTTP 400 / code 1214 | ⛔ convention ZCode, pas un ID API |
| `glm-4.7-flash` | HTTP 429 / code 1305 | ⛔ hors plan |

**Trois sources se contredisent, une seule dit vrai :**
- `GET /models` annonce **9 modèles** → faux (4 sont des alias)
- La doc officielle annonce **3 modèles** (5.3, 5-turbo, 4.7) → faux aussi (4.5 et 4.6 répondent bien en leur nom)
- **La mesure dit 5 modèles distincts** → c'est la seule vérité exploitable

⚠️ **Conséquence critique pour le plugin** : écrire `model: glm-5.2` dans un subagent ZCode ne donne PAS GLM-5.2, ça donne GLM-5.3. Toute config de routing qui « diversifie » avec 5.1/5.2 est une illusion : c'est le même modèle. La diversité réelle n'existe qu'entre **{4.5, 4.6, 4.7} × {5-turbo} × {5.3}**.

**Pour débloquer les vrais 5.1/5.2** : il faut créditer l'API standard (`api.z.ai/api/paas/v4`, aujourd'hui en `1113 Insufficient balance`) — 5.2 et 5.1 y sont à 1,40 $/4,40 $ par M de tokens **[PUBLIÉ]**.

---

## 2. Le rôle REVIEWER — la décision la mieux étayée

**Protocole [MESURÉ]** : 53 tâches issues de **HumanEvalFix** (OctoPack, ICLR 2024) et **QuixBugs** (SPLASH 2017), labels reprouvés par exécution des tests officiels sur la machine (164/164 HumanEvalFix reproduits). Chaque modèle rend un verdict PASS/FAIL. Température 0, `max_tokens` 5000.

### 2.1 Sur code défectueux + correct (n=53, 33 défectueux / 20 corrects)

| Modèle | Accuracy | IC 95 % | Faux-OK | Faux-rejet | Bug identifié | Illisible | Latence | Tokens |
|---|---|---|---|---|---|---|---|---|
| glm-4.5 | 90,6 % | [79,7–95,9] | 0 % | 25,0 % | 75,8 % | 0 % | 56,9 s | 3616 |
| glm-4.6 | 90,6 % | [79,7–95,9] | 0 % | 25,0 % | 78,8 % | 0 % | 59,0 s | 3841 |
| glm-4.7 | 92,3 % | [81,8–97,0] | 0 % | 21,1 % | **78,8 %** | 0 % | 51,9 s | 3450 |
| glm-5-turbo | 90,6 % | [79,7–95,9] | **3,0 %** ⛔ | 15,0 % | 45,5 % | 1,9 % | 40,7 s | **1497** |
| **glm-5.3** | 90,6 % | [79,7–95,9] | **0 %** | **5,0 %** | 60,6 % | 7,5 % | **26,2 s** | 2270 |

### 2.2 Sur code exclusivement correct (n=53) — le test du sur-rejet

| Modèle | **Faux-rejet** | IC 95 % | Tokens de sortie/review | Latence |
|---|---|---|---|---|
| glm-4.5 | 26,4 % | [16,4–39,6] | 4591 | 76,9 s |
| glm-4.6 | 25,0 % | [15,2–38,2] | 4510 | 80,2 s |
| glm-5-turbo | 22,6 % | [13–36] | 1838 | 68,7 s |
| glm-4.7 | 21,4 % | [11,7–35,9] | 4137 | 70,7 s |
| **glm-5.3** | **6,2 %** | [2–17] | 2343 | **27,8 s** |

**Lecture :** l'accuracy ne discrimine rien (tous à 90-92 %, IC superposés). **Le discriminant est le mode d'échec.** La famille 4.x rejette du code correct **1 fois sur 4**. glm-5.3 : 1 fois sur 16. Facteur **3,5 à 4,3×**.

**Cohérent avec la littérature** : la sur-correction est le mode d'échec dominant des reviewers LLM (FNR jusqu'à 73,2 % avec des prompts riches, arXiv 2508.12358) **[PUBLIÉ]** — pas le rubber-stamping. Nos GLM confirment : **0 % de faux-OK partout sauf 5-turbo**, alors que la littérature mesure 31-44 % de faux-OK sur GPT-4o/Gemini (Cihan et al. 2025) **[PUBLIÉ]**. **Les GLM sont des reviewers conservateurs, pas complaisants.**

### 2.3 Validation croisée externe de l'exclusion de glm-5-turbo

| Source | Verdict sur GLM-5-Turbo en reviewer |
|---|---|
| **[MESURÉ]** nous | Seul modèle avec faux-OK (3 %), identification de bug la plus faible (45,5 %) |
| **[PUBLIÉ]** arXiv 2606.15689 (2026) | Dernier de 5 modèles : F1 0,310 (n=150), **F1 0,008 sur vrais PRs**, verbosité la plus haute (841 tokens), qualité la plus basse (2,37) |

Deux méthodologies indépendantes, même conclusion → **exclusion ferme du rôle Reviewer et QA-signature.**

---

## 3. Le protocole de prompt (commit-first) — testé, effet réel mais modeste

**[MESURÉ]** sur le bench local (26 tâches), naive vs commit-first (critères d'acceptation énoncés AVANT de voir le code + spec répétée en fin de prompt) :

| Modèle | Accuracy naive → commit-first | Faux-rejet naive → commit-first |
|---|---|---|
| glm-4.5 | 96,2 % → **100 %** | 9,1 % → **0 %** |
| glm-4.7 | 92,3 % → **100 %** | 9,1 % → **0 %** |
| glm-4.6 | 96,2 % → 96,2 % | 9,1 % → 9,1 % |
| glm-5-turbo | 96,2 % → 96,2 % | 9,1 % → 9,1 % |
| glm-5.3 | 100 % → 92,3 % | 0 % → 0 % (mais 7,7 % de verdicts illisibles) |

**Conclusion honnête** : le commit-first **supprime les faux-rejets sur 4.5 et 4.7** (9,1 → 0 %), n'a pas d'effet sur 4.6/5-turbo, et **dégrade 5.3 par non-respect du format de sortie** (verdict noyé dans une réponse longue). Les écarts sont dans le bruit de mesure (±12,5 pp mesuré sur n=26).

➡️ **Décision plugin** : commit-first activé pour les rôles tournant sur 4.x ; pour 5.3, on garde la structure mais on **verrouille le format de sortie** (le verdict doit être la dernière ligne, seul sur sa ligne) car c'est sa faiblesse mesurée (7,5-10,4 % d'illisibles).

---

## 3bis. Le niveau de thinking — mesuré, et contre-intuitif

> ⚠️ **Ce tableau a été mesuré avec un budget de sortie bridé (bug de plafond à 2500 tokens).** Il est conservé pour la traçabilité, mais **ses conclusions sur `max` sont fausses** : les 22,2 % de « verdicts illisibles » étaient des réponses **coupées avant la ligne de verdict**, pas un défaut du modèle. Après correction (EXP-4, budget 131072), `high` **et** `max` montent tous deux à 97,8 % d'accuracy avec 0 % de faux-OK et 0 % d'illisible. Voir la décision corrigée en fin de section.

**[MESURÉ]** glm-5.3 sur 45 tâches du bench standard, même prompt, seul `reasoning_effort` varie :

| Effort | Accuracy | IC 95 % | **Faux-OK** | **Faux-rejet** | **Verdicts illisibles** | Latence | Points/review |
|---|---|---|---|---|---|---|---|
| `low` | **91,1 %** | [79,3–96,5] | **6,7 %** ⛔ | 13,3 % | **0 %** | **5,6 s** | **0,77** |
| **`high`** | 86,7 % | [73,8–93,7] | **0 %** ✅ | **0 %** ✅ | 13,3 % | 18,5 s | 3,62 |
| `max` | 75,6 % | [61,3–85,8] | 3,3 % | 0 % | **22,2 %** ⚠️ | 19,1 s | 3,66 |

### Trois enseignements

1. **`max` est le pire des trois.** Accuracy la plus basse, 22,2 % de verdicts illisibles, coût le plus élevé. Mécanisme identifié : plus le modèle réfléchit, plus il rédige long, et plus la ligne de verdict finale se noie. **La recommandation officielle Z.AI (`max` pour le code) est inadaptée à un rôle qui doit rendre un verdict structuré** — elle vaut pour la génération de code, pas pour le jugement.

2. **`low` est un piège de vitesse.** Il est 3,3× plus rapide et 4,7× moins cher, avec 0 % d'illisibles… mais **6,7 % de faux-OK** : il laisse passer du code cassé. Sur un premier échantillon de n=16 il affichait 0 % de faux-OK — c'était de la chance d'échantillonnage. **Leçon méthodologique : ne jamais conclure sur n=16.**

3. **`high` est le seul niveau à 0 % de faux-OK ET 0 % de faux-rejet.** Sa seule faiblesse (13,3 % d'illisibles) est **réparable par le prompt** — un budget de 400 mots et une contrainte de dernière ligne. Un faux-OK, lui, n'est pas réparable.

### Décision

| Rôle | Effort | Raison |
|---|---|---|
| **Reviewer / QA** (portent un verdict) | **`high`** | à budget non bridé, `high` et `max` sont à égalité (97,8 %, 0 % faux-OK) ; **EXP-6 départage sur du vrai code** : `max` y expire dans 72 % des cas et coûte 28,67 points/review |
| **Worker** (produit du code) | **`max`** | le problème de format ne le concerne pas : il rend du code, pas un verdict |
| **Tri / reconnaissance rapide** | `low` | 4,7× moins cher, 3,3× plus rapide — **interdit de signature** |

**Comparaison inter-modèles à effort par défaut** (n=16, même tâche) :

| Configuration | Accuracy | Faux-OK | Latence | Points |
|---|---|---|---|---|
| glm-5.3 @low | 100 % | 0 % | 5,5 s | 0,84 |
| glm-5-turbo (défaut) | 100 % | 0 % | 18,7 s | 1,78 |
| glm-5-turbo **nothink** | 93,8 % | **6,2 %** ⛔ | 3,1 s | 0,25 |
| glm-4.7 (défaut) | 100 % | 0 % | **44,2 s** | **4,82** |

➡️ **glm-4.7 coûte 5,7× plus cher et est 8× plus lent que glm-5.3@low à accuracy égale.** Il reste en QA pour sa qualité d'identification de défaut (78,8 %) et ses 0 % d'illisibles, mais c'est un choix assumé de fiabilité descriptive, pas d'efficacité.
➡️ **`glm-5-turbo` sans thinking reproduit exactement le piège de `low`** : rapide, quasi gratuit, et il tamponne (6,2 % de faux-OK).

---

## 3ter. EXP-5 — le duel QA : glm-5.3 contre glm-4.7 sur **tous** les modes

**[MESURÉ]** 2 modèles × 8 modes de réflexion × 24 tâches (HumanEvalFix + QuixBugs), budget de sortie non contraint.

| Configuration | Accuracy | Faux-OK | Faux-rejet | **Défaut identifié** | Latence | Points |
|---|---|---|---|---|---|---|
| **glm-4.7 nothink** | **100 %** | 0 % | 0 % | **79,2 %** 🏆 | **6,4 s** | **0,42** 🏆 |
| glm-4.7 @minimal | 100 % | 0 % | 0 % | 75,0 % | 37,9 s | 3,85 |
| glm-4.7 @max | 100 % | 0 % | 0 % | 75,0 % | 38,5 s | 3,95 |
| glm-4.7 @high | 100 % | 0 % | 0 % | 70,8 % | 38,7 s | 3,87 |
| glm-5.3 @xhigh | 100 % | 0 % | 0 % | 54,2 % | 15,9 s | 3,25 |
| glm-5.3 @max | 100 % | 0 % | 0 % | 45,8 % | 19,5 s | 4,17 |
| glm-5.3 @medium | 100 % | 0 % | 0 % | 41,7 % | 7,2 s | 1,33 |
| glm-5.3 nothink | 100 % | 0 % | 0 % | 37,5 % | 5,0 s | 0,65 |
| glm-5.3 @minimal | 91,7 % | **8,3 %** ⛔ | 0 % | 45,8 % | 4,9 s | 0,65 |
| glm-5.3 @low | 95,8 % | **4,2 %** ⛔ | 0 % | 29,2 % | 5,0 s | 0,62 |

### Trois conclusions

1. **glm-4.7 domine glm-5.3 sur l'identification du défaut dans TOUS ses modes.** Son pire mode (54,2 % @low) égale le meilleur mode de glm-5.3 (54,2 % @xhigh). Écart au meilleur réglage de chacun : **+41,7 points**. Pour un rôle QA dont la mission est d'**expliquer ce qui casse**, c'est décisif.

2. **Le thinking est un pur coût sur cette tâche.** glm-4.7 fait 100 % avec ou sans — mais sans, il est **6× plus rapide et 9,4× moins cher**, et il identifie *mieux* le défaut (79,2 % vs 75,0 %). Le raisonnement interne se substitue au rapport explicite au lieu de l'enrichir.

3. **Les modes bas de glm-5.3 sont dangereux** : `@minimal` produit 8,3 % de faux-OK, `@low` 4,2 %. glm-4.7 n'en produit dans **aucun** de ses 8 modes.

### Réserve méthodologique

n=24 et **toutes les configurations saturent à 100 %** d'accuracy (IC [86,2–100] partout). L'accuracy ne discrimine donc rien ici. Ce qui discrimine, ce sont **l'identification du défaut, la latence et le coût** — trois métriques aux écarts massifs (jusqu'à ×9,4) et non ambigus.

---

## 3quater. EXP-6 — l'épreuve de vérité : de vrais patchs, de vrais dépôts

Les sections précédentes reposent toutes sur des **fonctions isolées** (HumanEvalFix, QuixBugs). C'est la limite n°3 de cette étude. EXP-6 la lève.

**Protocole [MESURÉ]** : **SWE-bench Verified** (500 instances validées par des humains, issues de vrais dépôts : Django, SymPy, scikit-learn…). Le patch de référence (`gold`) est présenté tel quel, ou **amputé d'un morceau entier** (un fichier complet, ou un hunk si le patch est mono-fichier). Le reviewer doit dire PASS sur le patch complet et FAIL sur l'amputé. Un **juge indépendant** (`glm-4.6` sans réflexion) vérifie ensuite si la review a nommé **le morceau réellement manquant** — cette métrique remplace le comptage de mots-clés, biaisé par la verbosité (r = +0,604).

> ⚠️ **SWE-bench Lite est inutilisable ici** : ses 300 instances sont *filtrées pour être mono-fichier* par construction. Sur 300, **0 patch multi-fichiers**. D'où le passage à Verified.

### Résultat (n=18 patchs corrects + 18 amputés, 2 à 4 morceaux par patch)

| Configuration | Appels réussis | Accuracy | **Faux-OK** | **Faux-rejet** | **Défaut identifié** *(juge)* | Latence | Points |
|---|---|---|---|---|---|---|---|
| **glm-4.7 sans réflexion** | **36/36** | 55,6 % | 11,1 % | **77,8 %** ⛔ | **11,8 %** ⛔ | 16,7 s | 1,72 |
| glm-5.3 effort max | **10/36** ⚠️ | 70,0 % | 50,0 % | 16,7 % | 50,0 % | 148,6 s | 28,67 |

### Ce que ça renverse

1. **glm-4.7 sans réflexion est une machine à rejeter.** Il rend **FAIL sur 34 de ses 36 verdicts (94 %)**. Sa « détection » de 89 % sur les patchs amputés n'est donc pas de la compétence — c'est un biais : rejeter systématiquement attrape mécaniquement tous les cassés. Le juge indépendant le confirme : il ne nomme le morceau réellement manquant que **11,8 %** du temps. **Il rejette pour de mauvaises raisons.**

2. **L'ordre s'inverse par rapport à EXP-5.** Sur fonction isolée, glm-4.7 identifiait le défaut à 79,2 % contre 45,8 % pour glm-5.3. Sur du vrai code multi-fichiers : **11,8 % contre 50,0 %**. La supériorité de glm-4.7 en description **ne généralise pas** à du code réel.

3. **Cet écart était annoncé par les benchmarks publics** — que nos mesures sur fonctions isolées contredisaient : Terminal-Bench 41 % (4.7) contre 56,2 % (5.3), SWE-bench Verified 73,8 % contre 77,8 % **[PUBLIÉ]**. **Sur des tâches réalistes, les benchmarks publics avaient raison et notre micro-bench avait tort.**

4. **glm-5.3 @max est opérationnellement impraticable sur ce format** : **72 % de ses appels dépassent 240 s** (latence mesurée 66 s / 165 s / 236 s) et il coûte **28,67 points par review**, soit 17× glm-4.7. Ses métriques ci-dessus reposent sur n=10 et **ne sont pas concluantes** — elles sont indiquées pour transparence, pas comme preuve.

### Décision

- **glm-4.7 est retiré de tout rôle portant un verdict sur du code multi-fichiers.**
- **Le QA passe sur `glm-5.3` @high** — le seul effort mesuré à 0 % de faux-OK *et* 0 % de faux-rejet (EXP-4, n=45), et un compromis latence/coût tenable face au `max` qui expire.
- **Prévoir un timeout d'au moins 900 s** côté client pour tout verdict sur un patch réaliste : 240 s est insuffisant (mesuré).

### Réserve honnête

Le défaut injecté est **une amputation** (un morceau retiré), pas un bug sémantique subtil. C'est un défaut *détectable par lecture structurelle*, ce qui **avantage** un reviewer attentif. Que glm-4.7 échoue sur ce cas facile est d'autant plus parlant ; mais on ne peut pas en déduire le comportement sur un bug logique fin. Et n=10 côté glm-5.3 interdit toute conclusion chiffrée sur ce modèle.

---

## 4. Coût réel par rôle (points du Coding Plan)

Multiplicateurs officiels **[PUBLIÉ]** (`points = (in×M_in + cached×M_cached + out×M_out)/10 000`) :

| Modèle | M_in | M_cached | M_out |
|---|---|---|---|
| glm-5.3 | 6,9 | 1,7 | 24 |
| glm-5-turbo | 5,7 | 1,5 | 21 |
| glm-4.7 | 4,6 | 1,2 | 16 |

**[MESURÉ]** tokens réels par review (prompt ≈ 290 tokens) :

| Modèle | Tokens sortie/review | **Points/review** | Latence |
|---|---|---|---|
| glm-4.5 | 4591 | ~7,5 | 76,9 s |
| glm-4.6 | 4510 | ~7,4 | 80,2 s |
| glm-4.7 | 4137 | **~6,8** | 70,7 s |
| glm-5-turbo | 1838 | ~4,0 | 68,7 s |
| glm-5.3 | 2343 | ~5,8 | **27,8 s** |

⚠️ **Le vrai poste de coût, c'est la verbosité** : les 4.x crachent ~4500 tokens de sortie pour un prompt de 290 (**ratio ×15**). Sur un multiplicateur output de 16-24, c'est là que partent les points.

**Leviers de réduction mesurables :**
1. **Plafonner `max_tokens`** des rôles Reviewer à ~1200 → coupe la verbosité 4.x d'environ 70 %
2. **Off-peak** : ×0,5 sur tout, hors 14h-18h UTC+8 en semaine **[PUBLIÉ]**
3. **Cache de prompt** : multiplicateur cached 3,5 à 4× plus bas que l'input → **garder les system prompts des agents strictement identiques d'un appel à l'autre** (recommandation officielle Z.AI : les différences de formatage cassent le cache)
4. **Router par confiance** : ne déclencher le Reviewer complet que sur les artefacts à faible confiance

---

## 5. Ce que dit la littérature sur GLM en position de juge (et ce qu'elle ne dit pas)

| Benchmark | GLM présent ? | Résultat |
|---|---|---|
| **IF-RewardBench** (2603.04738, 2026) | ✅ GLM-4.6, GLM-4.5-Air | GLM-4.6 : 0,270 vs Gemini-3-Flash 0,513, GPT-5-mini 0,456 → **juge faible-à-moyen** |
| **WebDevJudge** (2510.18560) | ✅ GLM-4.5 | pairwise 68,65 vs GPT-4.1 70,34, humain 84,56 → mid-pack |
| **CodeCriticBench** (2502.16614) | ✅ GLM-4-Plus | 61,55 % vs GPT-4o 68,06 / Claude-3.5 68,79 |
| **AACR-Bench** (2601.19494, 2026) | ✅ GLM-4.7 | F1 16,03 sans contexte (meilleur non-Claude), recall 27,57 %, précision 11,30 % |
| **arXiv 2606.15689** (2026) | ✅ GLM-5-Turbo | dernier de 5, F1 0,008 sur vrais PRs |
| ProcessBench, CriticBench, JudgeBench, RewardBench/2, RM-Bench, JETTS | ❌ **aucun GLM** | zones grises comblées par nos mesures |
| **Sycophancie** (SycEval, SYCON, ELEPHANT, Beacon...) | ❌ **aucun GLM** | **zone grise totale** — non mesurée ici non plus |

**Calibration [PUBLIÉ]** : arXiv 2505.14489 compare GLM-Z1-0414 (raisonneur) à GLM-4-0414 → les modèles à raisonnement expriment mieux leur confiance (33/36 configurations). Cohérent avec notre choix d'un 5.3 en Reviewer.

**Nuance agentique importante [PUBLIÉ]** : sur τ²-bench telecom, **GLM-4.6 SANS reasoning (76,9 %) bat GLM-4.6 AVEC reasoning (70,5 %)**. Le thinking n'est pas systématiquement bénéfique — d'où le réglage d'effort par rôle plutôt qu'un `max` global.

---

## 6. Chaînes de fallback

```
WORKER    : glm-5.3 (max)      → glm-4.7 (high)     → glm-4.6 (high)
REVIEWER  : glm-5.3 (high)     → glm-4.6 (high, +commit-first)  → glm-4.5
QA        : glm-5.3 (high)     → glm-4.6 (high)     → glm-5-turbo (low, sans droit de signature)
```

**Règles dures :**
- `glm-5-turbo` ne signe jamais un verdict de conformité (faux-OK mesuré)
- **`glm-4.7` ne porte jamais un verdict sur du code multi-fichiers** (78 % de faux-rejet mesuré, §3quater) — il reste excellent en Worker et en explication de fonction isolée
- Si un rôle de verdict tourne sur 4.x → activer commit-first (supprime ses faux-rejets sur fonction isolée)
- Si un rôle de verdict tourne sur 5.3 → verrouiller le format du verdict (sa faiblesse mesurée)
- Ne jamais router un rôle vers `glm-5.2`/`glm-5.1`/`glm-5`/`glm-4.5-air` : ce sont des alias, la diversité serait fictive

⚠️ **Les trois rôles tournent sur glm-5.3.** La diversité de modèles a été *testée* (EXP-5 puis EXP-6) et **rejetée par les mesures** : le seul candidat crédible pour diversifier (glm-4.7) s'effondre sur du vrai code. La diversité réelle du pipeline vient donc du **contexte frais** et des **efforts distincts**, pas du modèle.

---

## 7. Limites de cette étude (honnêteté méthodologique)

1. **n=53 par modèle** : les IC restent larges. Les écarts d'accuracy (90,6 vs 92,3 %) ne sont **pas** significatifs ; seuls les écarts de faux-rejet (6,2 % vs 21-26 %) et de latence/coût le sont.
2. **Bruit de mesure établi à ±12,5 pp** sur n=26 (mesuré accidentellement en interrogeant 4 alias du même modèle) → tout écart inférieur à ~25 pp sur cette taille est du bruit.
3. ~~**Bugs Python d'algorithmique** : la généralisation à un vrai dépôt reste à établir.~~ → **Levée en partie par EXP-6** (SWE-bench Verified, vrais dépôts, patchs multi-fichiers), qui a **invalidé la conclusion QA tirée des fonctions isolées**. Restent non couverts : bugs de concurrence, d'I/O et de sécurité.
   ➡️ **Leçon méthodologique majeure de cette étude** : un micro-benchmark sur fonctions isolées peut produire un classement **inversé** par rapport au code réel. Nos EXP-1 à EXP-5 désignaient glm-4.7 comme meilleur QA ; EXP-6 l'a disqualifié. Ne jamais router un rôle de production sur la seule foi d'un bench de fonctions isolées.
4. **Une seule exécution par cellule** (pas de répétitions) — la variance intra-modèle n'est pas mesurée sur le bench standard.
5. **Non testé faute de budget** : EIR (taux d'introduction d'erreur en révision), review croisée worker→reviewer, sycophancie sous pression de l'auteur.
6. **Températures à 0** : les résultats peuvent différer en usage réel (ZCode ne fixe pas la température).
