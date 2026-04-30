# Essor Documentation

This is the official documentation for [Essor](https://github.com/estjs/essor), a fine-grained reactive frontend framework.

## Development

The documentation site is built using `athen` (a static site generator).

To run the documentation site locally:

```bash
pnpm install
pnpm dev
```

To build the documentation site:

```bash
pnpm build
```

## Structure

- `athen.config.ts` - Site configuration (navigation, sidebar, themes)
- `en/` - English documentation
- `zh/` - Chinese documentation
- `public/` - Static assets like logos
