# Installed Plugin Compact Layout Design

## Goal

The installed plugin area should not span the full content width. It should read as a short, compact item while preserving the existing list interaction zones.

## Design

- Apply the compact layout only when the plugin is installed.
- Keep the section left aligned with a maximum width of 520px.
- Keep the plugin name, description, installed status, and gear action unchanged.
- At viewport widths below 520px, let the section use the full available width.
- Do not change the uninstalled list, plugin detail page, or installation and removal behavior.

## Verification

- The installed section receives the compact modifier class.
- The uninstalled section does not receive the compact modifier class.
- Existing plugin interaction tests continue to pass.
