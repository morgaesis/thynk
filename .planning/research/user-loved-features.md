# UX Research: What Users Love

## Notion - Most Loved Features

### Organization & Flexibility

- **All-in-one "second brain"**: Notes, databases, tasks, wikis, AI in one workspace
- **Database views**: Tables, Kanban boards, calendars, galleries from same data
- **AI-powered tools**: Meeting transcription, Q&A over workspace content
- **Meeting Notes**: Type `/meet` for real-time transcription, summaries, action items
- **Templates & block-based editing**: Pre-built workflows, movable blocks

### UX Highlights

- **Minimalist, distraction-free editor**: Start typing, everything else fades
- **Customizable covers, icons, colors**: Personal style expression
- **Everything in one searchable workspace**: Notes link to tasks, AI queries past content
- **Cross-platform and collaborative**: Real-time editing, inline comments
- **Inline page links**: `[[double bracket]]` navigation

---

## Obsidian - Most Loved Features

### Core Philosophy

- **Local Markdown files (vaults)**: Plain-text .md files you control, portable forever
- **No vendor lock-in**: Works even if Obsidian disappears
- **Future-proof**: Data readable in any text editor

### Knowledge Management

- **Bidirectional linking**: `[[double brackets]]` to connect notes, build personal wiki
- **Graph view**: Interactive visualization of note connections
- **Daily notes**: Auto-generated dated pages for journaling/logging
- **Plugin ecosystem**: Thousands of community plugins (Canvas, PDF annotation, spaced repetition)

### UX Highlights

- **Live preview editing**: Edit Markdown and see rendered results in same pane
- **Flexible workspaces**: Split panes/tabs, drag between windows
- **Offline speed and privacy**: Blazing-fast on local files
- **Snapshot recovery**: Built-in versioning to restore accidental changes

---

## Apple Notes - Most Loved Features

### Organization

- **Smart Folders**: Automatically sort notes by hashtags, no manual organization needed
- **Nested folders**: Up to 5 levels deep with sensible defaults
- **Checklists**: Completed items auto-move to bottom

### Search & Accessibility

- **Built-in OCR search**: Find terms in handwritten notes, images, attachments
- **Permanent search bar**: Always accessible at bottom of Folders view (iOS 26)

### Unique Productivity

- **Password/biometric protection**: Face ID/Touch ID for sensitive notes
- **Data detection**: Recognizes phone numbers, addresses, dates, emails
- **Instant add from other apps**: Sharesheet integration

### Ecosystem

- **Seamless Apple sync**: Notes across all devices including Apple Watch
- **Collaborative sharing**: Fine-grained permission controls

---

## Compiled UX Principles for Thynk

### From All Three Apps

1. **Instant note creation** - Apple Notes: tap and start typing immediately
2. **Focus mode** - Notion: distraction-free, everything fades until you need it
3. **Bidirectional linking** - Obsidian's wiki-links, Notion's page links
4. **Local-first** - Obsidian's vault philosophy, data always accessible
5. **Search everywhere** - Apple Notes' OCR + full-text, Notion's workspace search
6. **Smooth typing** - No lag, no jank, immediate feedback
7. **Visual graph** - Obsidian's graph view for knowledge visualization
8. **Daily notes** - Obsidian/Notion daily note workflow
9. **Keyboard-first** - Shortcuts for everything power users need
10. **Auto-save with confidence** - User never thinks about saving

### Thynk-Specific Opportunities

- **Speed advantage**: Rust backend should feel faster than all three
- **No cloud lock-in**: Combine Obsidian's local-first with Notion's collaboration
- **AI without vendor lock**: BYOK approach is differentiated
- **Progressive complexity**: Start simple like Apple Notes, reveal power like Obsidian

---

## Key UX Friction Points to Fix

Based on user feedback:

1. **Save feels jank** - Auto-save should be invisible, instant, reliable
2. **New note UX** - Should create instantly, focus title for immediate rename
3. **Click outside to close** - Calendar and settings modals should dismiss cleanly
4. **AI behind flag** - Model selection not ready for production, hide it
