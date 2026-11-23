# Repository guidance

- Keep the example screenshots in `assets/example` compressed as WebP and list their repository-relative paths in the root `screenshots.json`.
- Example screenshots are for repository documentation and previews only. Exclude `assets/example` from build archives and npm packages; keep the npm `files` allowlist limited to the assets needed at runtime.
- Do not edit `intro.md` unless explicitly requested by the user.
