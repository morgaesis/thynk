# Questions - Status

All priority questions have been resolved. See PROJECT.md and STATE.md for decisions.

## Resolved

| #   | Question      | Decision                                              |
| --- | ------------- | ----------------------------------------------------- |
| 1   | User focus    | Individuals first, collab in Phase 4                  |
| 2   | AI priority   | Included in release (Phase 3), BYOK model             |
| 3   | Mobile timing | Phase 4, browser mode covers all platforms until then |
| 4   | Sync approach | Custom built-in, differential sync                    |
| 5   | Plugin system | Deferred, batteries included first                    |
| 6   | File format   | Standard Markdown + YAML frontmatter                  |
| 7   | Pricing model | Free until users, free for small teams, paid later    |
| 8   | Open source   | FSL (Functional Source License)                       |

## Open

| #   | Question                          | Impact               |
| --- | --------------------------------- | -------------------- |
| 1   | Domain name                       | Branding, marketing  |
| 2   | Free tier team size limit         | Pricing              |
| 3   | Admin dashboard for lock/audit UI | Enterprise readiness |
| 4   | Disable local storage UX          | Enterprise policy    |

---

## Enterprise RBAC Requirements

For public cloud and enterprise deployments:

1. **Authentication**: OAuth2/OIDC integration (Phase 4)
2. **Authorization**: Role-based access control (owner, editor, viewer)
3. **Locking**: Advisory (local) → Enforced (cloud)
4. **Audit**: All mutations logged with user, timestamp, document ID
5. **Data residency**: Enterprise may require specific region

---

Updated: 2026-03-21
