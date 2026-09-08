---
name: deployment-config-review
description: Review project deployment configuration for consistency across config files, documentation, and actual setup
source: auto-skill
extracted_at: '2026-09-07T19:40:49.544Z'
---

# Deployment Configuration Review

When reviewing a project for deployment to a specific platform (Railway, Heroku, Vercel, etc.), follow this systematic approach to find inconsistencies and conflicts.

## Why

Deployment configurations often have:
- Multiple config files that conflict (e.g., Procfile vs nixpacks.toml)
- Documentation that doesn't match actual config
- Duplicate files in wrong locations
- Settings that differ between UI instructions and config files

These issues cause deployment failures or unpredictable behavior.

## How to apply

### 1. Discover all configuration files

Search for platform-specific configs:
```bash
# Railway
railway.json, nixpacks.toml, Procfile

# Heroku  
Procfile, runtime.txt, apt.txt

# Vercel
vercel.json, now.json

# General
Dockerfile, docker-compose.yml, .env*
```

Check both root and subdirectories (e.g., `server/`, `app/`).

### 2. Read and compare configs

For each config file found:
- What build mechanism does it specify? (Nixpacks, Docker, Procfile)
- What root directory does it use?
- What start command does it define?
- Are there duplicates in different locations?

### 3. Check documentation

Compare deployment docs against actual configs:
- Do instructions match config file values?
- Are there contradictions (e.g., "leave empty" vs explicit value)?
- Are deleted/added files reflected in docs?

### 4. Identify conflicts

Common issues:
- **Multiple build mechanisms**: Procfile + Nixpacks + Dockerfile (platform may prioritize unexpectedly)
- **Duplicate configs**: `railway.json` in both root and `server/`
- **Path mismatches**: Docs say one path, config specifies another
- **Start command conflicts**: UI instruction vs config file

### 5. Fix systematically

1. Remove duplicate/redundant config files
2. Keep single source of truth (prefer platform-native format)
3. Update documentation to match actual config
4. Update checklists with new validation steps

### 6. Verify with git

After fixes:
```bash
git status          # See what changed
git diff --cached   # Review before commit
```

## Example findings (Railway)

| Issue | Fix |
|-------|-----|
| `server/Procfile` exists but using Nixpacks | Delete Procfile |
| `server/railway.json` duplicates root config | Delete duplicate |
| Docs say "Root Directory: empty" but config has `rootDirectory: "server"` | Clarify docs: "leave empty — will be overridden" |
| Start command differs in docs vs config | Align to config value |
