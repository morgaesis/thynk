# Design Decisions

## No Vertical Layout Shift

Editor elements must never change vertical height based on cursor/focus state. When the cursor enters or leaves a code block, heading, blockquote, or any other element, the surrounding content must not jump.

This means:

- Code blocks have the same height whether focused or not
- Heading decorations (showing `##`) must not add/remove vertical space
- Blockquote markers must not change line count
- Any focus-dependent UI (language tags, toolbars) must overlay or use reserved space, not push content down

Violations of this rule are always bugs, regardless of phase.
