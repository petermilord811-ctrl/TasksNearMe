# Backups and restoring

Use it when you set up the nightly backup, check that it runs, or need data back: after a mistake in the live data, or after losing the server.

**Status (2026-11-21):** the backup and restore tools are built and drilled (sweep, "Backups (2026-11-21)"). Nothing runs on the live server yet. The owner turns it on: the key pair, the R2 bucket, then the timer ("Turning it on" below). Until then, nothing backs up the live data.

## What a backup holds

| File | What | How |
|---|---|---|
| `db.dump.gpg` | The live database, `tasksnearme_preview` | `pg_dump` (custom format) inside the `tasksnearme-db` container, from a snapshot |
| `uploads.tar.gz.gpg` | Uploaded files: photos, receipts, ID images (`/srv/tasksnearme-preview/uploads`) | `tar`; files written during the backup may be left out |
| `config.tar.gz.gpg` | `preview.env` and the Caddyfile | `tar` |
| `manifest.json.gpg` | When, which release, Postgres versions, the last migration, and every table's row count in the dump's own snapshot | Checked again by every restore |
| `SHA256SUMS` | Checksums of the four encrypted files, written last | `sha256sum -c SHA256SUMS` checks a download by hand |

Every file except SHA256SUMS is encrypted to the owner's public key (gpg) as it streams, so no plaintext copy reaches a disk. Only the private key, which never comes to the server except for a restore, can open one.

Where, once it's on: a copy on the server in `/var/backups/tasksnearme` (the last 3 nights, for quick restores after a mistake), and an R2 bucket used only for backups (7 nightly and 4 weekly backups). Each backup is a folder: `daily/<UTC time>/`, `weekly/<UTC time>/`.

When: every night at 3:30 Gainesville time, give or take 10 minutes (`tasksnearme-backup.timer`). A night the server was off runs at the next boot.

Not in a backup:
- the dev and test databases that share the container;
- uploads kept in R2, if `FILE_STORAGE` ever moves there (that bucket would need its own copy);
- keys you can issue again: the GitHub deploy key and the Search Console key.

The code: `scripts/backup/` (`backup.ts`, `restore.ts`, `drill.ts`, `lib/`). The server files: `deploy/backup/`. Settings: `deploy/backup/backup.env.example`, one comment each.

## The key pair (owner)

Make it on your own computer, never on the server:

```
gpg --quick-generate-key "TasksNearMe backups" default default never      # asks for a passphrase: use a long one
gpg --armor --export "TasksNearMe backups" > backup-public-key.asc
gpg --armor --export-secret-keys "TasksNearMe backups" > backup-private-key.asc
```

- `backup-public-key.asc` goes to the server (below).
- Keep `backup-private-key.asc` and its passphrase in your password manager, plus a second copy away from your computer: printed, or on a USB key in a safe place. Without them, no backup can ever be opened.
- Keep `FIELD_ENCRYPTION_KEY` from `preview.env` in the password manager too (better: all of `preview.env`). A restored database's exact addresses, access notes, staff authenticator secrets and verification data can only be read with it. The backups carry `preview.env`, but a second copy costs nothing.

## Turning it on (owner)

1. **R2.** In Cloudflare, create a private bucket used for nothing else (for example `tasksnearme-backups`). Create an API token allowed **Object Read & Write** on that bucket only. Optional but recommended: bucket lock rules, so a stolen server key can't delete recent backups. Use `tasksnearme-preview/daily/` for 6 days and `tasksnearme-preview/weekly/` for 27 days, shorter than the backup's own pruning (7 nights, 4 weeks), which would otherwise be refused (it logs that and tries again the next night).
2. **Install**, from the repo on the server: `sudo bash deploy/backup/setup-backup.sh`. It builds `backup.cjs` and `restore.cjs` into `/usr/local/lib/tasksnearme-backup` (root-owned), installs the service and the timer without enabling them, and creates `/etc/tasksnearme-backup/backup.env` (root, 600) from the example.
3. **Settings.** Copy `backup-public-key.asc` to `/etc/tasksnearme-backup/backup-public-key.asc`. In `backup.env`, fill in `BACKUP_R2_ACCOUNT_ID`, `BACKUP_R2_BUCKET`, `BACKUP_R2_ACCESS_KEY_ID` and `BACKUP_R2_SECRET_ACCESS_KEY`. The rest has working values.
4. **One run by hand:** `sudo systemctl start tasksnearme-backup && journalctl -u tasksnearme-backup -n 30`. It ends with `backup <time>: done in … s`. The bucket now has `tasksnearme-preview/daily/<time>/` and `weekly/<time>/`, five files each.
5. **Every night:** `sudo systemctl enable --now tasksnearme-backup.timer`.
6. **A heartbeat** (recommended): a dead man's switch such as a Healthchecks.io check expecting a ping every 24 hours, its URL in `BACKUP_HEARTBEAT_URL`. The backup calls it only after a full success, so you hear when backups stop, which nothing else tells you.

After a change to `scripts/backup/`, run `setup-backup.sh` again: the server runs its installed copy, never a release, so a deploy can't change what runs as root.

## Checking backups

- The last run: `journalctl -u tasksnearme-backup -n 30`. The next one: `systemctl list-timers tasksnearme-backup.timer`.
- The backups: `sudo /usr/local/lib/tasksnearme-preview/node --env-file=/etc/tasksnearme-backup/backup.env /usr/local/lib/tasksnearme-backup/restore.cjs --from r2 --list`. `--from /var/backups/tasksnearme` lists the server's copy.
- Once a month, on your computer, check that the newest backup opens: from the repo, with the R2 settings in a local file, `node --env-file=backup.env node_modules/.bin/tsx scripts/backup/restore.ts --from r2 --gnupghome ~/.gnupg --verify-only`. It downloads the backup, checks SHA256SUMS, decrypts every file (gpg asks for the passphrase) and compares each with the manifest, restoring nothing.

A restore prints `ok:` for each check and `PROBLEM:` for anything that doesn't match, and exits non-zero then.

## Restoring

### A mistake in the data (the server is fine)

Restore next to the live database, look, then switch. `restore` never writes over the database a backup came from.

1. Bring the private key for the restore only, in memory: `install -m 600 /dev/null /dev/shm/key.asc`, paste it in, and delete it afterwards.
2. Restore the newest local backup (or `--from r2`, or `--backup daily/<time>`) under a new name:
   ```
   sudo env FIELD_ENCRYPTION_KEY=<from preview.env> /usr/local/lib/tasksnearme-preview/node \
     /usr/local/lib/tasksnearme-backup/restore.cjs --from /var/backups/tasksnearme \
     --private-key /dev/shm/key.asc --database tasksnearme_restored --check-field-key
   ```
   gpg asks for the passphrase. Then come the checks: SHA256SUMS, each file against the manifest, every table's rows, the last migration, and that `FIELD_ENCRYPTION_KEY` opens the restored addresses.
3. Look at what you need: `docker exec -it tasksnearme-db psql -U tnm -d tasksnearme_restored`.
4. Either copy the rows you need back into `tasksnearme_preview` by hand, or switch the whole database:
   ```
   sudo systemctl stop tasksnearme-preview
   docker exec tasksnearme-db psql -U tnm -d postgres -c 'ALTER DATABASE tasksnearme_preview RENAME TO tasksnearme_broken' \
     -c 'ALTER DATABASE tasksnearme_restored RENAME TO tasksnearme_preview'
   sudo systemctl start tasksnearme-preview
   ```
   Everything since the backup is lost by switching (up to a day): check payments and bookings made since then in Stripe and `/admin/payments`.
5. `rm /dev/shm/key.asc`. Drop `tasksnearme_broken` once you're sure.

### The server is lost

Target: the site back within 2 hours, losing at most the day since the last nightly backup. The database restore itself takes seconds (drill below); the time goes into the new server and the deploy.

1. A new Ubuntu VPS. DNS stays at Cloudflare until step 7.
2. Install Docker, Caddy, gpg and Node 26, and clone the repo (`npm ci`).
3. Start Postgres with PostGIS (`postgis/postgis:17-3.5`, the live image) on loopback, with a superuser password that's not the one in the repo's `docker-compose.yml`.
4. Restore from R2: put the `BACKUP_R2_*` settings in a file, then
   ```
   sudo node --env-file=backup.env node_modules/.bin/tsx scripts/backup/restore.ts --from r2 \
     --private-key /dev/shm/key.asc --database tasksnearme_preview --pg-container <container> --pg-user <superuser> \
     --uploads-to /srv/tasksnearme-preview/uploads --config-to /root/restored-config
   ```
   It creates the `tnm_preview` role without a password if it's missing.
5. Settings: copy `/root/restored-config/srv/tasksnearme-preview/preview.env` and the Caddyfile into place. Give `tnm_preview` the password in preview.env's `DATABASE_URL` (`ALTER ROLE tnm_preview PASSWORD '…'`). Then `chown -R tnm-preview:tnm-preview /srv/tasksnearme-preview/uploads`.
6. `sudo bash deploy/preview/setup-vps.sh <deploy key> <node binary>` (deploy/preview/README.md), update the `PREVIEW_SSH_*` secrets on GitHub, and ship `main`.
7. Point the `tasksnearme.com` A record at the new server; Caddy gets certificates by itself.
8. Check: `/api/health` answers 200, you can sign in, and a booking's page opens with its address. Then turn the backup on again (above).

### Only some uploaded files

Restore into an empty folder with `--uploads-to /tmp/uploads-back` and no `--database`, then copy back what's missing (owner `tnm-preview`).

## The drill

`npx tsx scripts/backup/drill.ts --database tasksnearme_e2e --uploads .data/uploads --field-key-from .env` backs a database up the way the nightly job does, restores it into a throwaway Postgres container the way a new server would, checks everything, and times each step. It touches nothing live: the key pair is made for the drill, and the container and folder go at the end (`--keep` keeps them). Run it after changing `scripts/backup/`, and every three months.

On 2026-11-21 (this VPS):

| Database | Rows | Dump | Backup | Fresh Postgres | Restore and checks |
|---|---|---|---|---|---|
| `tasksnearme_e2e` | 319 in 94 tables | 0.25 MB | 1.4 s | 3.4 s | 2.0 s (the database 0.9 s) |
| Live-sized: migrations, sample data and the demo marketplace (619 people, 1,233 tasks) | 17,922 | 0.80 MB | 1.6 s | 4.8 s | 2.1 s (1.1 s) |

Both restores passed every check: all tables' row counts, the last migration, `FIELD_ENCRYPTION_KEY` opening a restored address, the 212 uploaded files byte for byte, and the settings file.

## Limits

- **A day of data at most.** Nightly backups mean a restore loses what happened since 3:30 am. At this size an hourly database-only backup would cost about 1 MB an hour, if a day becomes too much once real money flows. Point-in-time recovery (WAL archiving) comes with managed Postgres (blueprint 07, "Hosting"; backlog B-002).
- **About 5 GiB per file.** One upload to R2 holds up to about 5 GiB. Today's files are far below; the uploads archive would need multipart uploads past that.
- **The live database shares the dev container** (sweep J-B3): the dev databases' load, restarts and connection limit are its too. Until it moves to its own container, these backups are its only copy anywhere else.
- **gpg's agent and long paths:** run by hand, keep `--homedir` short (under `/tmp`). From a long folder path, gpg fails with a misleading "Bad secret key", and it can say the same right after importing a key until its agent restarts (`gpgconf --homedir <dir> --kill gpg-agent`). The scripts handle both.
