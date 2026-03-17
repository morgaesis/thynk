# Thynk TODO List

## Critical Bugs

### Editor & Document Handling

- [ ] **Document locking not working** - Locking a document doesn't actually lock it; locked state doesn't persist on refresh
- [ ] **Newlines truncated** - Making multiple newlines and refreshing truncates them into one newline
- [ ] **Content loss on refresh** - Content typed quickly or images added disappear on refresh; need auto-save buffer
- [ ] **404 on note refresh** - Opening a note and refreshing gives 404 (e.g., `/notes/my-cool%20note%20%F0%9F%93%9D.md`), but note still appears in UI

### WebSocket & Connectivity

- [ ] **WebSocket connection failures** - Errors connecting to:
  - `wss://y-webrtc-signaling-eu.herokuapp.com/`
  - `wss://signaling.yjs.dev/`
  - Need to self-host STUN/TURN/signal server as part of docker-compose
  - This is NOT a heroku app - fully self-hosted

### Routing & Navigation

- [ ] **History back/forth** - Should work when moving between notes and settings

## Features

### Editor Behavior (Like Obsidian + Notion)

- [ ] **Wiki-style link creation** - Clicking `[[my-note]]` should create the new note if nonexistent
- [ ] **Obsidian-like editing** - Editor should behave/feel like Obsidian with additional slash-commands from Notion
- [ ] **Cursor context display** - When moving cursor, decompose the line/block to source/markdown format (like Obsidian); make this a settings toggle
- [ ] **Code blocks** - Weird styling with different box around code; missing copy-to-clipboard button; should show language (style/bash/python) if present
- [ ] **Todo items** - Support common states: `- [ ] TODO`, `- [/] DOING`, `- [x] DONE`, etc.

### Multi-Tenancy & Collaboration

- [ ] **Multi-tenant/workspace** - Multiple users should work in own workspace simultaneously
- [ ] **User signup** - Allow users to signup at will
- [ ] **Workspace invitations** - Invite by username OR email to collaborate
- [ ] **Server-side auth** - Data separation controlled via server/API auth
- [ ] **User activity** - Clicking "Last edited by user" shows no recent activity; should show activity

### Storage & Sync

- [ ] **Cloud storage** - Store notes in cloud storage (bucket) as well as disk
- [ ] **Image/document uploads** - Upload to both disk and bucket, count towards cloud storage quota
- [ ] **Configurable storage** - Server config/env var to enable/disable local-only, cloud-only, or both
- [ ] **Auto-save buffer** - Never lose typed content; maintain buffer before save

### Document Versioning

- [ ] **Version history** - Implement document versioning

### UI/UX

- [ ] **Settings modal** - Should be modal overlay, not separate page; should scroll internally
- [ ] **Calendar modal** - Close on: clicking close, clicking outside, hitting ESC
- [ ] **Notifications** - Move to bell icon that expands on click, not full line in navbar
- [ ] **Navbar customization** - User can enable/disable: graph, template, calendar, backlinks, etc.
- [ ] **Theme selector** - Allow custom theming with CSS; theme selector in settings

### Backlinks & Mentions

- [ ] **Clarify difference** - "Unlinked mentions" vs "backlinks" seem the same; clarify or merge
- [ ] **Fix display** - Backlinks shows backslashes in link display; should not show them
- [ ] **Graph edges** - Graph missing links/edges between linked notes

### Import/Export

- [ ] **Timestamp in export** - `thynk-export.zip` should contain date/timestamp in filename
- [ ] **Import folder directly** - Allow importing actual folder, not require zipping first (if possible)

### Voice & Dictation

- [ ] **Offline dictation** - Mic dictation fails offline; hover says browser-local but requires internet

### Clipboard

- [ ] **Ctrl+V paste** - "Just work" for pasting images and documents

## Infrastructure

### CI/CD

- [ ] **Desktop builds** - Publish builds for Windows and Linux (arm and x86) in CI

### Deployment

- [ ] **Self-hosted signaling** - Deploy STUN/TURN/signal server as part of docker-compose

### Model Discovery

- [ ] **Auto-discover models** - When user enters API key, query model list from provider; do not maintain hardcoded list