# Account Font Persistence And Preview Design

## Goal

Allow signed-in members to save built-in fonts to their account and show useful font previews in member settings and admin font management.

## Scope

- Preserve the existing numeric `selected_font_id` relationship for uploaded fonts.
- Add nullable `selected_builtin_font_key` for built-in font choices.
- Allow exactly one uploaded or built-in font preference at a time.
- Validate built-in keys against the server-owned allowlist.
- Show the same built-in and active uploaded fonts in member settings.
- Show a live preview for the selected member font and every admin-uploaded font, including inactive fonts.
- Do not add font deletion or storage cleanup behavior.

## Data Flow

The profile API accepts `selectedFontId` and `selectedBuiltinFontKey`. Selecting one clears the other. Member responses return both values. The frontend converts the two fields into one select value: uploaded fonts use their numeric ID and built-in fonts use their existing `b:*` key.

## Error Handling

The backend rejects requests that provide both fields, unknown built-in keys, or inactive uploaded fonts. Existing members remain valid because both fields are nullable.

## Verification

- Backend service tests cover built-in persistence, mutual exclusion, and invalid keys.
- Playwright smoke tests cover saving a built-in key, rendering member preview, and rendering inactive admin font previews.
- Run backend tests, frontend lint, frontend smoke, and build checks before merge.
