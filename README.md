# PILARK Composites — Full Website

Static, responsive website built from the PILAR Company Profile 2026 and PILAR Catalog 2026 materials.

## Local preview

Open `index.html` directly, or run:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Cloudflare Pages + GitHub

This project has no build step. Connect the GitHub repository to Cloudflare Pages and use:

- Production branch: `main`
- Build command: `exit 0`
- Build output directory: `/` (repository root)

The site is static HTML/CSS/JS and is ready for Pages deployment.

## Notes

- `assets/PILAR Catalog 2026-web.pdf` is a web-optimized copy of the 2026 catalog to stay below Cloudflare Pages' single-asset size limit.
- The page images are rendered from the supplied 2026 PDFs for the catalog viewer and product imagery.
- Replace the contact links with final company contact details if needed before production.
