# Design Decisions

## No Vertical Layout Shift

Editor elements must never change vertical height based on cursor/focus state. When the cursor enters or leaves a code block, heading, blockquote, or any other element, the surrounding content must not jump.

This means:

- Code blocks have the same height whether focused or not
- Heading decorations (showing `##`) must not add/remove vertical space
- Blockquote markers must not change line count
- Any focus-dependent UI (language tags, toolbars) must overlay or use reserved space, not push content down

Violations of this rule are always bugs, regardless of phase.

---

## Cloud Auth & RBAC (Enterprise Readiness)

When using the cloud-hosted version, the cloud is authoritative. This affects locking, access control, and local file handling:

### Locking & Conflict Resolution

- **Cloud is authoritative**: If a document is locked by a team member in the cloud, local edits must be blocked/reverted
- **Optimistic locking with force-revert**: Local changes to locked documents are rejected; UI shows locked state immediately
- **Revert local on lock**: If cloud marks a document as locked while user is editing, local changes are discarded and file reverts to cloud version

### Access Control (RBAC)

- **Cloud blocks unauthorized access**: API returns 403 for documents user doesn't have permission to read
- **File ignore on access denied**: If a file appears locally but user has no cloud access, Thynk ignores it, deletes it, and shows "Access Denied" in UI
- **Audit trail**: All access and mutations logged for enterprise compliance

### Enterprise Admin Controls

- **Disable local storage option**: Admins can disable local filesystem storage entirely for employees
- **Enforced cloud sync**: All data stored only in cloud, no local cache
- **Policy enforcement**: Server rejects any mutation on documents user doesn't have write access to

### Implementation Requirements

- Auth layer must verify permissions before file operations
- Lock state synchronized from cloud in real-time (WebSocket)
- Local file operations check against cloud permissions first
- Graceful degradation: local-only mode when offline (read-only if locked in cloud)

### Future: Admin Dashboard

- View lock status across all documents and users
- Force-unlock capability for admins
- Audit logs viewer
- User management (invite, revoke access)
- Team/workspace management

---

## Local-First vs Cloud-Authoritative Modes

| Aspect         | Local-First (Current) | Cloud-Authoritative (Enterprise) |
| -------------- | --------------------- | -------------------------------- |
| Data store     | Local filesystem      | Cloud database                   |
| Auth           | N/A                   | Required                         |
| Locking        | Advisory only         | Enforced                         |
| Access control | File permissions      | RBAC via API                     |
| Offline mode   | Full read/write       | Read-only for locked docs        |
