# Graph Report - .  (2026-07-21)

## Corpus Check
- 91 files · ~205,525 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 605 nodes · 964 edges · 64 communities (61 shown, 3 thin omitted)
- Extraction: 94% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 53 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Shared UI Utilities
- Company Seed Data & Backfills
- Firestore Read/Write Layer
- Admin-Edit Design Rationale
- Region Mapping & Editable Inputs
- Live Quote Refresh
- Firestore Storage Layer (Production)
- Company & Portfolio Admin (Production)
- Color Customization System (Production)
- Project Dependencies
- Session Memory & Resume Command
- Globe Camera Framing
- App Bootstrap (Production)
- Data Backfill & Global Search Init
- Week & Content Admin Actions (Production)
- Market/Company Rendering (Production)
- Company Chart Modal (Production)
- Week Seeding
- Globe Earth Texture
- Globe Starfield Background

## God Nodes (most connected - your core abstractions)
1. `renderPanelForCurrentSelection()` - 30 edges
2. `showToast()` - 21 edges
3. `Résumé du projet Makor Morning News` - 21 edges
4. `init()` - 17 edges
5. `buildEditableInput()` - 13 edges
6. `Plan: Panneau latéral + timeline (lecture seule)` - 13 edges
7. `ProjetSiteMakor Slash Command` - 12 edges
8. `Plan: Socle du globe` - 11 edges
9. `Plan: Mode édition — indices de marché éditables` - 11 edges
10. `refreshData()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Protocole d'écriture Firestore en production` --semantically_similar_to--> `Sauvegardes fiabilisées`  [INFERRED] [semantically similar]
  .claude/commands/ProjetSiteMakor.md → Resume_Projet_Makor_Morning_News_1.md
- `Architecture index.html monofichier` --references--> `webapp/index.html entry markup`  [EXTRACTED]
  Resume_Projet_Makor_Morning_News_1.md → webapp/index.html
- `Optimistic-update-with-rollback-on-failure pattern: update in-memory db and re-render immediately, write to Firestore in background, revert and toast on failure — reused by indices, companies, portfolio, news, weeks and IA & Fintech edit handlers` --semantically_similar_to--> `Rationale: deleting an entire week's curated content warrants a window.confirm() gate naming the week and document count — the first deliberate exception to this feature's established act-immediately-rely-on-rollback pattern, given the blast radius`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-07-19-admin-edit-indices.md → docs/superpowers/plans/2026-07-20-admin-delete-week.md
- `webapp/index.html entry markup` --references--> `Refonte Makor Morning News (globe 3D)`  [INFERRED]
  webapp/index.html → .claude/commands/ProjetSiteMakor.md
- `Protocole d'écriture Firestore en production` --conceptually_related_to--> `Backend Firestore`  [INFERRED]
  .claude/commands/ProjetSiteMakor.md → Resume_Projet_Makor_Morning_News_1.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Plans implementing the shared optimistic-update-with-rollback edit-mode pattern** — docs_superpowers_plans_2026_07_19_admin_edit_indices, docs_superpowers_plans_2026_07_20_admin_edit_companies, docs_superpowers_plans_2026_07_20_admin_edit_portfolio, docs_superpowers_plans_2026_07_20_admin_edit_news, docs_superpowers_plans_2026_07_20_admin_edit_weeks, docs_superpowers_plans_2026_07_21_ia_fintech_panel, concept_optimistic_update_rollback_pattern [INFERRED 0.85]
- **Week-scoped selector functions forming the shared data-access layer over mkg_data** — webapp_src_data_selectors, webapp_src_data_regionmatch, webapp_src_data_firestoreclient, firestore_mkg_data_collection [INFERRED 0.85]
- **Modules implementing globe region navigation (config, cycling, camera framing, three.js glue)** — webapp_src_globe_regions, webapp_src_globe_cycle, webapp_src_globe_camera, webapp_src_globe_globescene [EXTRACTED 1.00]
- **Firestore document persistence layer** — index_collectionforkey, index_firestoreset, index_firestoredelete, index_rawset, index_rawdelete [INFERRED 0.85]
- **Portfolio live quote refresh flow** — index_portfolioentrysymbol, index_refreshportfolioquotesonce, index_startportfolioautorefresh, index_backfillportfoliosymbols [INFERRED 0.80]
- **Production index.html and webapp/ redesign coexisting under one project** — claude_commands_projetsitemakor_globe_redesign_project, webapp_index, webapp_index [INFERRED 0.85]

## Communities (64 total, 3 thin omitted)

### Community 0 - "Shared UI Utilities"
Cohesion: 0.06
Nodes (63): showToast(), generateId(), loadAllWithRetry(), getPortfolioEntriesForRegion(), getPortfolioRegion(), PORTFOLIO_REGION_BY_GLOBE_REGION, DB, normalizeRegionLabel() (+55 more)

### Community 1 - "Company Seed Data & Backfills"
Cohesion: 0.03
Nodes (55): ENTREPRISES_0105, ENTREPRISES_0408, ENTREPRISES_0812, ENTREPRISES_1304, ENTREPRISES_1822, ENTREPRISES_2004, ENTREPRISES_2529, FINTECH_0105 (+47 more)

### Community 2 - "Firestore Read/Write Layer"
Cohesion: 0.05
Nodes (28): Protocole d'écriture Firestore en production, collectionForKey(), firestoreDelete(), firestoreSet(), rawSetAwaited(), render(), renderContent(), startPortfolioAutoRefresh() (+20 more)

### Community 3 - "Admin-Edit Design Rationale"
Cohesion: 0.07
Nodes (36): Rationale: deleting an entire week's curated content warrants a window.confirm() gate naming the week and document count — the first deliberate exception to this feature's established act-immediately-rely-on-rollback pattern, given the blast radius, Rationale: market indices chosen as the first editable section because they are the smallest, most self-contained data shape, proving the Firestore write path end-to-end before riskier sections since every plan writes to the live production database, Injectable-dependency testing pattern: fetch/html2pdf/writeFn/setInterval passed as overridable parameters (defaulting to the real implementation) so I/O-heavy code stays unit-testable — reused across firestoreClient, quoteClient, portfolioLiveRefresh and pdfExport, Rationale: updateLiveQuotes merges fresh live-quote overrides into currentPortfolioEntries but skips re-rendering while currentIsEditing is true, reproducing production's refreshDataUnlessEditing protection against wiping an in-progress, uncommitted keystroke, Rationale: split admin/edit UI one data section per plan (indices, companies, portfolio, news, weeks, IA & Fintech) rather than one large edit-mode plan, since every write targets the same live production Firestore database used weekly by interns, Optimistic-update-with-rollback-on-failure pattern: update in-memory db and re-render immediately, write to Firestore in background, revert and toast on failure — reused by indices, companies, portfolio, news, weeks and IA & Fintech edit handlers, Rationale: webapp's side panel is already a single-column vertical list, so the PDF export skips production's CSS-Grid-to-flex-row rebuilding surgery required for html2pdf's page-break detection — a meaningfully simpler port, not a straight one, Design decision: IA & Fintech content has no per-item region field in production, so webapp shows the same week-scoped list identically in every region's panel rather than inventing a region field — mirrors portfolio's own not-week-scoped exception (+28 more)

### Community 4 - "Region Mapping & Editable Inputs"
Cohesion: 0.08
Nodes (31): Portfolio region ids differ from the globe's canonical region ids (asie, brics-uk, europe, amerique-du-nord-canada) and must be translated via PORTFOLIO_REGION_BY_GLOBE_REGION, returning empty results rather than throwing for unmapped ids, Region label normalization: free-text Firestore group/region labels (accent/case-insensitive substring match) mapped to the globe's 4 canonical region ids, Plan: Entreprises + comparateur (lecture seule), Plan: Suivi de portefeuille (lecture seule, sans cotations en direct), buildEditableInput(), buildBulletsList(), buildStatsGrid(), renderCompanies() (+23 more)

### Community 5 - "Live Quote Refresh"
Cohesion: 0.12
Nodes (20): Plan: Graphique entreprise (📈, lecture seule), Plan: Actualisation en direct DEPUIS/YTD du portefeuille, External Yahoo/Apps Script quote API (script.google.com/macros/.../exec, quoteHistory and quoteSince actions), webapp/src/data/dateUtils.js — ddmmToISOThisYear, ddmmToISOThisYear(), fetchPortfolioLiveQuotes(), isFiniteNumber(), portfolioEntrySymbol() (+12 more)

### Community 6 - "Firestore Storage Layer (Production)"
Cohesion: 0.12
Nodes (28): collectionForKey(), DB, deleteItemLocal(), fetchRawKey(), fetchRawPrefix(), fetchRemoteKeys(), firebaseConfig, firestoreDelete() (+20 more)

### Community 7 - "Company & Portfolio Admin (Production)"
Cohesion: 0.14
Nodes (25): migratePortfolioSection(), addCompanyInline(), addPortfolioEntryInline(), COMPANY_TICKERS, companyNamesForWeek(), confirmDeletePortfolioEntry(), confirmDeletePortfolioRegion(), DEFAULT_PORTFOLIO_REGIONS (+17 more)

### Community 8 - "Color Customization System (Production)"
Cohesion: 0.10
Nodes (15): applyColor(), closeColorPopup(), COLOR_PALETTE, colorDotHTML(), colorStyleAttr(), DEFAULT_GROUP_COLORS, fetchQuote(), formatMarketValue() (+7 more)

### Community 9 - "Project Dependencies"
Cohesion: 0.08
Nodes (23): firebase, globe.gl, html2pdf.js, jsdom, vite, vitest, dependencies, firebase (+15 more)

### Community 10 - "Session Memory & Resume Command"
Cohesion: 0.13
Nodes (19): ProjetSiteMakor Slash Command, Règle : mot de passe admin jamais en clair, Refonte Makor Morning News (globe 3D), Mémoire : feedback-admin-edit-scope, Mémoire : project-globe-redesign-status, Mémoire : feedback-globe-redesign-workflow, Mémoire : feedback-read-only-quotes, Règle : une section admin à la fois (+11 more)

### Community 11 - "Globe Camera Framing"
Cohesion: 0.17
Nodes (16): Rationale: BRICS+UK groups 6 non-contiguous countries so the camera must frame a wide bounds view of all 6 markers at once, never a single-point zoom or sequential fly-by, Camera framing geometry: haversine distance + centroid used to compute a single-point vs bounds point-of-view for globe.gl, Rationale: use globe.gl (three.js wrapper) for a photorealistic Earth on a dark starfield, chosen because it natively provides camera fly-to and multi-point framing plus real satellite textures, Fixed-order region cycle: Asie → BRICS+UK → Europe → Amérique du Nord → (retour à Asie), driven by nextRegionId/prevRegionId/regionPosition, Plan: Socle du globe, cameraForRegion(), centroid(), haversineDistanceKm() (+8 more)

### Community 12 - "App Bootstrap (Production)"
Cohesion: 0.14
Nodes (16): init(), CATEGORIES, CATEGORY_LABELS, state, addContentItemInline(), escapeAttr(), escapeHtml(), fetchChunkWithRetry() (+8 more)

### Community 13 - "Data Backfill & Global Search Init"
Cohesion: 0.10
Nodes (4): init(), initGlobalSearch(), loadAllFromServer(), Barre de recherche globale

### Community 14 - "Week & Content Admin Actions (Production)"
Cohesion: 0.22
Nodes (18): addWeekInline(), buildSearchIndex(), commitActiveEdit(), confirmDeleteContent(), confirmDeleteMarket(), deleteWeek(), duplicateWeekInline(), goToSearchResult() (+10 more)

### Community 15 - "Market/Company Rendering (Production)"
Cohesion: 0.19
Nodes (12): addMarketRowInline(), companyChartIconHTML(), companyHasRealCreatedAt(), companyPresentationDateISO(), companyRegionColorKey(), companySymbol(), DEFAULT_COMPANY_REGION_COLORS, getCompanyRegionColors() (+4 more)

### Community 16 - "Company Chart Modal (Production)"
Cohesion: 0.60
Nodes (3): chartLineSVG(), fetchQuoteHistory(), openCompanyChartModal()

## Ambiguous Edges - Review These
- `Plan: Gestion des semaines (mode édition)` → `Plan: Export PDF (lecture seule)`  [AMBIGUOUS]
  docs/superpowers/plans/2026-07-20-pdf-export.md · relation: references

## Knowledge Gaps
- **127 isolated node(s):** `CATEGORY_LABELS`, `state`, `SEED_MARKET`, `SEED_NEWS`, `SEED_ENTREPRISES` (+122 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Plan: Gestion des semaines (mode édition)` and `Plan: Export PDF (lecture seule)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `Résumé du projet Makor Morning News` connect `Firestore Read/Write Layer` to `Session Memory & Resume Command`, `Data Backfill & Global Search Init`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `CATEGORIES` connect `App Bootstrap (Production)` to `Week & Content Admin Actions (Production)`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `migratePortfolioSection()` connect `Company & Portfolio Admin (Production)` to `Company Seed Data & Backfills`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `renderPanelForCurrentSelection()` (e.g. with `handleWeekAdd()` and `handleWeekDelete()`) actually correct?**
  _`renderPanelForCurrentSelection()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `CATEGORY_LABELS`, `state`, `SEED_MARKET` to the rest of the system?**
  _127 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Shared UI Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.06442058496853018 - nodes in this community are weakly interconnected._