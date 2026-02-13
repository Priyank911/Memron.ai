# Vercel Project Configuration

This file helps Vercel understand the monorepo structure.

## Important Settings for Vercel Dashboard

When deploying this project on Vercel, use these settings:

### Build & Development Settings
- **Framework Preset:** Next.js
- **Root Directory:** `apps/landing`
- **Build Command:** `pnpm run build` (auto-detected)
- **Output Directory:** `.next` (auto-detected)
- **Install Command:** `pnpm install` (auto-detected)

### Environment
- **Node.js Version:** 20.x

## Notes
- Vercel will automatically detect pnpm from the workspace
- The root `vercel.json` is minimal to allow auto-detection
- All TypeScript dependencies are now in this package's devDependencies
