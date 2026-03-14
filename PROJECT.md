# PROJECT.md - Thynk Vision

## Project Overview

**Project Name:** Thynk (pending domain research)
**Project Type:** Knowledge Management / Project Planning / Compliance Documentation / Collaboration Platform
**Target:** Replace Obsidian, Notion, Confluence, and Asana with one batteries-included tool

---

## Vision Statement

> A blazing-fast, markdown-native knowledge management platform with batteries included -- notes, tables, databases, calendar, project planning, compliance documentation, and real-time collaboration built in. Browser-first with desktop and mobile apps. Local-first with cloud sync. Bring Your Own Key (BYOK) for AI. Free forever for small teams.

---

## Core Value Proposition

### vs Competitors

| Aspect             | Obsidian         | Notion             | Confluence    | Thynk                         |
| ------------------ | ---------------- | ------------------ | ------------- | ----------------------------- |
| Privacy            | Local-first      | Cloud-only         | Cloud-only    | Local-first + cloud option    |
| Speed              | Medium           | Slow (large DBs)   | Slow          | Blazing fast (Rust backend)   |
| Collaboration      | None native      | Excellent          | Good          | P2P real-time (WebRTC/STUN)   |
| Project Management | None             | Good               | Limited       | Native (boards, automations)  |
| Compliance/Audit   | None             | Limited            | Good          | Native (locking, audit trail) |
| AI                 | Plugin-dependent | Vendor-locked      | Vendor-locked | BYOK, no lock-in              |
| Data Portability   | Excellent (MD)   | Poor (proprietary) | Poor          | Excellent (MD + YAML)         |
| Learning Curve     | Steep            | Moderate           | Steep         | Progressive complexity        |

### Differentiation Strategy

1. **Speed First**: Blazing fast -- cold start < 1s, instant hot start, zero lag on any operation
2. **Markdown Native**: First-class Markdown citizen, not an afterthought
3. **Batteries Included**: Core features work out of the box -- no plugin hunting for basics
4. **Unified Platform**: Notes, project planning, compliance docs, and collaboration in one tool
5. **Powerful Data Layer**: Tables, databases, calendar/time-based views, automations built in
6. **Real-Time Collaboration**: P2P via WebRTC/STUN -- cursor presence, @mentions, page locking
7. **Progressive Complexity**: Start simple, reveal power features as users grow
8. **Local-First with Cloud Sync**: Your data stays yours, sync when you want

---

## Design Goals

### Performance Goals

- **Cold Start**: < 1 second (target: 500ms)
- **Hot Start**: < 100ms
- **Note Open**: < 50ms
- **Search (100K notes)**: < 100ms
- **Memory Idle**: < 150MB
- **Bundle Size**: < 30MB
- **Zero lag** on typing, scrolling, navigation

### UX Goals

- **Markdown Native**: Rich editing that feels native, not a web editor wrapped in Electron
- **Batteries Included**:
  - Tables (sortable, filterable, relational)
  - Database views (list, board/kanban, timeline)
  - Calendar integration (daily notes, time-based queries)
  - Tasks with due dates, reminders, and automations
  - Page locking for controlled documents
  - Audit trail for compliance
- **Collaboration**:
  - P2P real-time editing via WebRTC/STUN
  - Cursor presence and user awareness
  - @mentions for assignment and notification
  - Shared workspaces with permissions (view/edit/admin)
- **Beautiful Defaults**: Light/dark themes, clean typography, intuitive navigation

### Technical Goals

- **Server-Backed Architecture**: Rust backend handles file ops, search, sync
- **Open Formats**: Markdown files with YAML frontmatter, portable forever
- **Fast Indexing**: SQLite FTS5 for instant search across all notes
- **Efficient Sync**: Differential sync, conflict resolution between local and cloud

---

## Architecture

### Deployment Modes

| Mode                    | Description                           | Storage                       |
| ----------------------- | ------------------------------------- | ----------------------------- |
| **Browser + localhost** | Browser connects to local Rust server | Files on local filesystem     |
| **Browser + cloud**     | Browser connects to hosted instance   | Files on cloud (Notion-like)  |
| **Desktop (Tauri)**     | Native app with embedded Rust backend | Files local + synced to cloud |
| **Mobile (Tauri)**      | Native app with embedded Rust backend | Files local + synced to cloud |

### Confirmed Stack

| Component         | Technology                  | Rationale                                                          |
| ----------------- | --------------------------- | ------------------------------------------------------------------ |
| **Backend**       | Rust + Axum                 | High performance, shared crates with Tauri, type safety            |
| **Frontend**      | React + TypeScript + Vite   | Mature ecosystem, fast dev iteration                               |
| **Editor**        | TipTap (ProseMirror)        | Extensible, Yjs-compatible for collab, tables/blocks built-in      |
| **Database**      | SQLite                      | Fast, reliable, metadata + indexes + structured data + audit trail |
| **File Format**   | Markdown + YAML frontmatter | Open, portable, git-friendly                                       |
| **Search**        | SQLite FTS5                 | Full-text search, native in Rust, fast                             |
| **State Mgmt**    | Zustand                     | Lightweight, no boilerplate                                        |
| **Styling**       | Tailwind CSS                | Fast iteration, theming via CSS variables                          |
| **Desktop**       | Tauri 2.0                   | Wraps frontend, shares Rust backend crates                         |
| **Sync**          | Custom built-in             | Differential sync, we control the experience                       |
| **Collaboration** | Yjs + y-webrtc (STUN/P2P)   | CRDT-based, cursor presence, signaling server in Rust              |

### Cloud Hosting

- Per-workspace instances (not multi-tenant)
- Scale-to-zero, wake on first request (~10-50ms Rust cold start)
- Persistent volumes for SQLite + markdown files
- Gateway proxy maps workspace to instance

### AI Strategy

**BYOK (Bring Your Own Key)** -- No built-in AI service:

- User provides API key for OpenAI, Anthropic, OpenRouter, etc.
- Local Ollama support for offline AI
- Semantic search via embeddings (stored in SQLite)
- No vendor lock-in on AI features
- AI features optional, not required

### Sync Strategy

**Custom sync, not third-party:**

- Built-in sync service (we control the experience)
- Markdown files = git-compatible for free
- Differential sync between local and cloud
- CRDT-based conflict resolution for collaborative editing

### Auth Strategy

- Self-hosted JWT/session auth in Rust backend
- OAuth providers (GitHub, Google) as login methods
- No dependency on external auth services
- Privacy-first: no third-party tracking

---

## Non-Goals

| Non-Goal                           | Reason                                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| **Plugin Ecosystem (initial)**     | Batteries included means core features work without plugins |
| **WYSIWYG Editor**                 | Markdown native, not a rich text editor pretending          |
| **Social/Community Features**      | Privacy-first, no social network elements                   |
| **Free Forever (No Monetization)** | Sustainable business required for long-term support         |
| **Obsidian Compatibility**         | Clean break, own format priorities                          |

### Deferred

| Feature            | Reason                                         |
| ------------------ | ---------------------------------------------- |
| **Plugin System**  | Wait until core is stable and feature-complete |
| **Public API**     | After plugin architecture is defined           |
| **Publishing/Web** | Focus on private knowledge management first    |

---

## Target Users

### Primary Personas

#### Knowledge Worker

- Role: Consultant, researcher, writer, developer
- Needs: Capture ideas quickly, connect notes, find later
- Pain: Obsidian is too complex, Notion is too cloud-dependent
- Value: Professional organization, meeting notes, project knowledge

#### Technical Lead / Engineering Manager

- Role: Software developer, technical lead, engineering manager
- Needs: Code snippets, documentation, system design, project tracking
- Pain: Knowledge spread across Obsidian + Jira + Confluence + Notion
- Value: One tool for notes, project planning, and documentation

#### Compliance / Operations

- Role: IT manager, compliance officer, operations lead
- Needs: ITSM docs, ISO documentation, DR plans, audit trails
- Pain: Confluence is slow and expensive, audit features are clunky
- Value: Page locking, controlled documents, audit trail, automations

### Secondary Personas

- **Student**: Study notes, research papers, flashcards
- **Creative**: Visual note-taking, mind mapping
- **Team Lead**: Collaborative knowledge management

---

## Goals

### Business Goals

- Build sustainable, user-supported business model
- Reach critical mass of active users
- Achieve meaningful MRR

### Product Goals

- Superior onboarding (50%+ complete tutorial)
- Fast performance (sub-second cold start, instant hot)
- Reliable sync (99.9% uptime for cloud sync)
- Strong community

### Technical Goals

- Clean architecture supporting future features
- Test coverage >80%
- Performance benchmarks for core operations
- Security audit before cloud sync launch

---

## Constraints

### Hard Constraints

- **Local-first option**: Must work offline when using desktop/mobile, data accessible locally
- **Open formats**: Never lock users into proprietary formats
- **Privacy**: No telemetry without explicit consent
- **Cross-platform ready**: Architecture must support desktop and mobile via Tauri

### Soft Constraints

- AI features should be optional (BYOK)
- Keep infrastructure costs minimal (scale-to-zero)

---

## Monetization Model

### Pricing Philosophy

**Free until we have users.** Ship first, monetize later.

- **Free forever for small teams** -- personal use and small teams
- **Paid plans later** -- payment integration when user base grows
- **Focus on product, not pricing** -- don't let monetization slow shipping

### License

**FSL (Functional Source License)** -- Source available, but restrictions on commercial use:

- Users can view and modify source
- Cannot resell or create competing products
- Encourages contribution while protecting commercial interests

---

## Success Metrics

### User Metrics

- Daily Active Users (DAU)
- Monthly Active Users (MAU)
- Retention: D7, D30, D90
- Feature adoption rates

### Business Metrics

- Monthly Recurring Revenue (MRR)
- Customer Acquisition Cost (CAC)
- Lifetime Value (LTV)
- Churn rate

### Product Metrics

- Time to first note created
- Feature usage depth
- Support ticket volume

---

## Key Risks

| Risk                                 | Likelihood | Impact | Mitigation                            |
| ------------------------------------ | ---------- | ------ | ------------------------------------- |
| Tauri mobile not ready               | Medium     | High   | Browser mode covers all platforms     |
| Competitors release similar features | Medium     | Medium | Focus on UX and speed differentiation |
| User acquisition slow                | Medium     | High   | Strong onboarding, content marketing  |
| Sync reliability issues              | Low        | High   | Start simple, extensive testing       |
| WebRTC P2P connectivity issues       | Medium     | Medium | TURN server fallback                  |

---

_Document Version: 2.0_
_Status: Active_
