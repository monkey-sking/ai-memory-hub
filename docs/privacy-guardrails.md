# Privacy Guardrails

Use these rules before committing, pushing, uploading, or exporting AMH data.

## Required Checks

- Do not put real private repository URLs, internal document URLs, local absolute paths, user names, organization names, credentials, or machine-specific identifiers in sample data, defaults, generated manifests, screenshots, or docs.
- Use placeholders such as `<owner>`, `<repo>`, `<project>`, `<feishu-folder-url>`, `<local-repo-path>`, and `%USERPROFILE%`.
- Backups are for full restore and may need to preserve real user data. Local backups and `backup run --no-push` should stay complete and must be protected as private data.
- Remote backup generated metadata must not include local absolute paths unless the operator explicitly chooses to upload complete plaintext private data.
- Remote backup defaults must not include `config.json`; configuration can contain local paths and remote URLs. Include it only by explicit operator choice.
- Before commit, push, upload, or plaintext remote backup, run a privacy scan for known local paths, private namespaces, internal URLs, and credential-shaped strings.
- Before any remote upload, remind the user that backup data may contain private information and verify the remote owner, access controls, retention policy, and recovery need.

## Suggested Scan

```bash
rg -n "C:\\\\{1,2}Users|D:\\\\{1,2}Project|my\\.feishu|github\\.com/<real-owner>|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{8,}[0-9A-Z][A-Za-z0-9_-]{8,}" .
```

Replace findings with placeholders unless the value is an intentional public project URL.
