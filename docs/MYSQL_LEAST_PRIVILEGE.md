# MySQL least-privilege account plan (documentation only)

No account creation or `GRANT` statement has been executed by this change. Have the database owner/DBA review this plan against the deployment environment before use.

## Runtime account

Create a dedicated account (example placeholder: `sahms_runtime`), not `root`. Grant only the DML needed by the deployed application on the eight existing business tables and the new `audittrail_*` tables. Typical starting point is `SELECT`, `INSERT`, `UPDATE`, and only the `DELETE` permissions genuinely required by current application behavior. Do not grant `CREATE`, `ALTER`, `DROP`, `GRANT OPTION`, or global privileges to the runtime account. The app must not be able to alter the existing business schema.

## Migration account

Use a separate, temporary deployment account with only the schema privileges needed to create/upgrade the app-owned `audittrail` tables and framework tables. Review each migration before applying it. Never use the migration account as the application runtime account, and revoke/disable it after deployment.

## Operational controls

- Store credentials in a deployment secret manager or an ignored local `.env`; never commit them.
- Restrict network access to the database host and require TLS where supported.
- Rotate credentials and monitor failed logins/privilege changes.
- Verify grants with the DBA before deployment; do not run grant statements copied from this document blindly.
