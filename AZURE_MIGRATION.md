# Azure Migration — GGRC Casita Invoices

Moves the app from Netlify to **Azure Static Web Apps** with three environments
(**dev / staging / prod**) under the **GGRC** subscription. Netlify stays live
and untouched (it builds from `main`) until we confirm Azure is ready.

## Architecture

| Piece      | Netlify (today)                     | Azure (target)                                  |
|------------|-------------------------------------|-------------------------------------------------|
| Frontend   | Vite SPA on Netlify CDN             | Static Web Apps CDN (`app_location: /`, `dist`) |
| API        | `netlify/functions/*` (Fetch style) | `api/*` — Azure Functions v4 (managed API)      |
| Database   | External SQL Server                 | **Same external SQL Server** (shared, all envs) |
| CI/CD      | Netlify auto-deploy from `main`     | GitHub Actions → SWA, one branch per env        |

Branch → environment mapping:

| Branch    | Environment | Static Web App      | GitHub secret            |
|-----------|-------------|---------------------|--------------------------|
| `dev`     | dev         | `swa-ggrc-dev`      | `AZURE_SWA_TOKEN_DEV`     |
| `staging` | staging     | `swa-ggrc-staging`  | `AZURE_SWA_TOKEN_STAGING` |
| `main`    | prod        | `swa-ggrc-prod`     | `AZURE_SWA_TOKEN_PROD`    |

> The database connection strings are set as **Static Web App application
> settings** (per environment), never committed to the repo.

---

## One-time prerequisites

### 1. Install the Azure CLI (Windows)
```powershell
winget install --exact --id Microsoft.AzureCLI
# then open a NEW terminal so `az` is on PATH
az version
```

### 2. Log in (device code — works with MFA)
```powershell
az login --use-device-code
```
Pick the account `admin@techmedhub.onmicrosoft.com` in the browser prompt.

### 3. Select the GGRC subscription
```powershell
az account list --output table
az account set --subscription "GGRC"
az account show --output table   # confirm it shows GGRC
```

---

## Provision an environment

Do **dev first**, validate, then repeat for staging and prod by changing `$ENV`.

```powershell
$ENV   = "dev"                      # dev | staging | prod
$LOC   = "eastus2"                  # a Static Web Apps region
$RG    = "rg-ggrc-$ENV"
$SWA   = "swa-ggrc-$ENV"

# Resource group
az group create --name $RG --location $LOC

# Static Web App (free tier for dev/staging; use Standard for prod if you want SLA/custom domains)
az staticwebapp create --name $SWA --resource-group $RG --location $LOC --sku Free
```

### Set the database connection (application settings)
Replace the placeholders — do **not** paste real secrets into any file:
```powershell
az staticwebapp appsettings set --name $SWA --resource-group $RG --setting-names `
  DB_SERVER=<db-host-or-ip> `
  DB_PORT=1433 `
  DB_USER=<db-user> `
  DB_PASSWORD=<db-password> `
  DB_DATABASE=GGRC
```

### Wire up CI/CD (deployment token → GitHub secret)
```powershell
# Get the SWA deployment token
$TOKEN = az staticwebapp secrets list --name $SWA --resource-group $RG --query "properties.apiKey" -o tsv

# Store it as the matching GitHub Actions secret (requires: gh auth login)
$SECRET = "AZURE_SWA_TOKEN_" + $ENV.ToUpper()
gh secret set $SECRET --body $TOKEN --repo billwfi/ggrc-casita-invioices
```

### Deploy
```powershell
# dev deploys from the `dev` branch (workflow: .github/workflows/azure-swa-dev.yml)
git push origin dev
# watch the run:
gh run watch --repo billwfi/ggrc-casita-invioices
```

### Get the environment URL
```powershell
az staticwebapp show --name $SWA --resource-group $RG --query "defaultHostname" -o tsv
```

---

## Validate (per environment)
1. Open `https://<defaultHostname>` — the SPA loads.
2. `https://<defaultHostname>/api/lots` returns JSON (API + DB reachable).
3. Reports → General Revenue for June 2026 returns 885 rows (same DB as Netlify).

---

## Promote to staging & prod
- staging: add `.github/workflows/azure-swa-staging.yml` (branch `staging`), repeat provisioning with `$ENV="staging"`.
- prod: add `.github/workflows/azure-swa-prod.yml` (branch `main`), repeat with `$ENV="prod"`, and use `--sku Standard` if you need custom domains / SLA.

## Cutover (only when prod is confirmed)
1. Point the production DNS/custom domain at `swa-ggrc-prod`.
2. Verify.
3. Decommission the Netlify site.

Until then, **Netlify remains the source of truth** and keeps serving production.
