# Raw files cloud storage

Raw upload files (PDF / DOCX / XLSX / images) live outside git — too
heavy + binary. They sync to a cloud bucket, and every fresh deploy
pulls them down automatically via rclone.

This doc covers:
1. One-time setup of an rclone remote (Drive default, R2 alt)
2. Initial seed (push current dev raw files to cloud)
3. Deploy flow (pull-on-bootstrap)

For the broader 3-way text replication design, see [`storage.md`](storage.md).

---

## Why rclone

- **Provider-agnostic**: Drive, R2, S3, Dropbox, OneDrive, B2, etc. — same script, swap remote.
- **Hash-verified sync**: matches files by checksum, not mtime. Safe across timezones.
- **Resumable + parallel**: handles 800 MB+ trees on flaky connections.
- **Single binary**: `brew install rclone` / `apt install rclone` / curl install.

---

## Option A — Google Drive (default, free 15 GB)

Recommended when raw corpus is < 15 GB and team already uses Workspace.

### A.1. Create a Drive folder
1. Open https://drive.google.com → **New → Folder** → name it `LocalLife Raw`.
2. Right-click the folder → **Share** with the Workspace group that needs access.
3. (Optional) Note the folder ID from URL `…/folders/<FOLDER_ID>` — useful if you scope rclone to just that folder.

### A.2. Configure rclone
On every machine that pushes or pulls (dev laptop + each server):

```bash
rclone config
```

Walk through:
```
n) New remote
name> locallife-raw
storage> drive
client_id>          # leave blank (uses rclone's default app, fine for personal)
client_secret>
scope> 1            # Full access (drive.readwrite)
service_account_file>
Edit advanced config? n
Use auto config? y                       # opens browser; sign in
Configure as Shared Drive? n             # (yes if you put it on a Shared Drive)
```

### A.3. Tell the repo where to sync
Add to `.env.local`:
```env
RCLONE_REMOTE=locallife-raw
RCLONE_PATH=raw                          # sub-folder name inside the remote
```

---

## Option B — Cloudflare R2 (recommended for prod, ~$0.015/GB/mo)

R2 has Object Lock + versioning — better for compliance + accidental
delete recovery. Use this when you want immutable backups in addition
to live sync.

### B.1. Create an R2 bucket
1. Cloudflare dashboard → **R2** → **Create bucket** → name `locallife-raw`.
2. **R2 → Manage R2 API Tokens → Create API Token** → permission **Object Read & Write**, scope to bucket. Save Access Key ID + Secret + Account ID.

### B.2. Configure rclone
```bash
rclone config
```
```
n) New remote
name> locallife-raw
storage> s3
provider> Cloudflare
env_auth> 1                              # use config
access_key_id>     <paste from token>
secret_access_key> <paste from token>
endpoint>          https://<ACCOUNT_ID>.r2.cloudflarestorage.com
region>            auto
```

### B.3. .env.local
```env
RCLONE_REMOTE=locallife-raw
RCLONE_PATH=locallife-raw                # bucket name as the path prefix
```

---

## Initial seed (one-time, from dev machine)

After rclone is configured, seed the cloud with your current local raw files:

```bash
# Make sure RAW_DIR points to your local data
grep RAW_DIR .env.local

./scripts/raw-sync.sh push
```

This uploads `$RAW_DIR/` → `${RCLONE_REMOTE}:${RCLONE_PATH}/` preserving
the `YYYY/MM/<ulid>.<ext>` structure. ~830 MB at typical home upload =
2-15 minutes depending on link.

Verify after upload:
```bash
./scripts/raw-sync.sh verify
```

(Optional) write a sha256 manifest you can commit to git for audit:
```bash
./scripts/raw-sync.sh manifest
# → $RAW_DIR/.manifest-sha256.txt
```

---

## Deploy flow on a fresh server

Once rclone is configured on the server with the SAME `RCLONE_REMOTE` name:

```bash
git clone https://github.com/huytdvn/locallife-asia.git
cd locallife-asia
cp .env.example .env.local
$EDITOR .env.local      # fill keys + set RAW_DIR=/mnt/locallife-raw
./scripts/deploy-bootstrap.sh
```

The bootstrap script handles:
1. `rclone sync` cloud → `$RAW_DIR` (auto pull)
2. Hash-verify integrity
3. `pnpm install`, `docker compose up`, schema, ingest venv

Re-running the bootstrap script is idempotent — use it for updates too.

---

## Ongoing sync (after first deploy)

The ingest pipeline already dual-writes locally + Google Drive when
files are uploaded through `/api/ingest/upload` (see
`apps/ingest/app/storage/raw.py:upload_to_drive`). For paths that
don't go through ingest (manual additions), run periodically:

```bash
# On dev machine: push new local files to cloud
./scripts/raw-sync.sh push

# On server: pull remote updates to local
./scripts/raw-sync.sh pull
```

Or schedule via cron on the server (every 15 min):
```cron
*/15 * * * * cd /srv/locallife && ./scripts/raw-sync.sh pull >> /var/log/raw-sync.log 2>&1
```

---

## Switching providers

Want to move from Drive to R2 (or vice versa)?

1. Set up the new remote in `rclone config` (e.g. name it `locallife-raw-r2`).
2. Migrate data: `rclone sync locallife-raw: locallife-raw-r2:`
3. Update `.env.local` `RCLONE_REMOTE=locallife-raw-r2`. No code change.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `rclone remote not configured` | Run `rclone config`, name MUST equal `$RCLONE_REMOTE` |
| Drive: "rate limit exceeded" | Add `--tpslimit 5` to commands, or move to R2 |
| Pull pulls 0 files | Check `RCLONE_PATH` matches what was pushed (`rclone ls REMOTE:`) |
| Hash mismatch on verify | Re-run `pull` with `--checksum` (already default) |
| Permission denied on $RAW_DIR | `sudo chown -R $USER /mnt/locallife-raw` then retry |
