# Admin Account Recovery

This procedure is for an existing, active Admin who has lost access. It does not create a second Admin and does not bypass database access controls.

## Preconditions

- You have SSH or console access to the production host.
- You can confirm the target environment, database host, and database name from the deployment runbook.
- You have a recent database backup or snapshot.
- The API environment file is mode `600` and readable only by the service account.
- You are not sharing the terminal, screen, or clipboard with anyone.

## Procedure

1. **Confirm the target.** Check the production environment without printing secrets:
   ```bash
   cd /path/to/campus-kabar/backend
   node -e "const e=require('./src/config/env'); console.log({nodeEnv:e.nodeEnv, dbHost:e.db.host, dbName:e.db.database, site:e.publicSiteUrl})"
   ```
   Stop if the host or database is not the intended production target.

2. **Take a backup.** Use the database provider's snapshot mechanism or your normal MySQL backup command. Do not continue without a recoverable backup.

3. **Run the recovery command interactively.** The script hides password input, requires typing `RESET`, validates the new password, hashes it with bcrypt cost 12, and revokes every active refresh token for the account:
   ```bash
   npm run reset-admin-password
   ```
   Enter the Admin email and the new password twice. Do not pass a password on the command line; it would be stored in shell history.

4. **Verify the reset.** Confirm an old session can no longer refresh and that the Admin can log in with the new password. The script reports the number of revoked sessions.

5. **Rotate related credentials.** If the account was compromised, rotate the Admin password, review Cloudinary and database credentials, review recent content/staff changes, and invalidate any other exposed secrets. Rotating `JWT_ACCESS_SECRET` immediately invalidates outstanding access tokens; also revoke refresh tokens in the database (or reset the affected accounts) to terminate sessions completely.

6. **Record the event.** Note the date, operator, account, reason, backup reference, and actions taken in the incident or operations log. Do not record the password.

## If no Admin exists

Use the first-admin bootstrap only when the database genuinely has no Admin:

```bash
npm run create-admin
```

The command is interactive, refuses to run when any Admin already exists, and serializes concurrent executions through the `system_locks` table. Run migrations first; the bootstrap fails clearly if the lock row is missing.

## Safety rules

- Never edit `password_hash` directly in MySQL.
- Never email, chat, or ticket a plaintext password.
- Never use a command-line flag or environment variable for the new password.
- Never disable `COOKIE_SECURE`, TLS, or rate limiting to make recovery easier.
- Restore from backup rather than guessing if the account or database state is unclear.
- Treat access to the recovery terminal as equivalent to Admin access.

## Why this is safe

- The script only updates an existing `admin` row with `is_active = 1`.
- The update is transactional and locks the user row.
- All refresh tokens for that user are revoked in the same transaction.
- Password hashing uses bcrypt cost 12 and enforces 12 characters / 72 UTF-8 bytes.
- The plaintext password is never written to disk, logs, shell history, or the database.
