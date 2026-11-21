# Security Policy

Power Pilot is a Windows desktop application with a local API, OS-level power
actions, and signed release artifacts. We take reports about these surfaces
seriously.

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

Only the latest 1.0.x release receives security fixes. Upgrade to the latest
Microsoft Store or NSIS build before reporting an issue that may already have
been fixed.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

Use one of these private channels:

1. Email: <security@vellium.dev> (https://vellium.dev/en/legal/security-disclosure) with `SECURITY` in the subject line. This is the
   primary reporting channel.
2. If the repository Security tab offers **Report a vulnerability**, you may
   use GitHub private vulnerability reporting instead.

Please include:

- affected version and installation type (Microsoft Store/MSIX or NSIS);
- Windows version and build number;
- a clear description of the impact and the attack surface;
- minimal reproduction steps or a proof of concept;
- relevant logs or screenshots with secrets and personal data removed;
- whether you want to be credited in the advisory.

## Response targets

| Stage                   | Target                              |
| ----------------------- | ----------------------------------- |
| Acknowledgement         | 2 business days                     |
| Initial assessment      | 5 business days                     |
| Fix or mitigation plan  | 10 business days for critical/high  |

These are targets, not contractual SLAs. We will keep you informed if a
reproduction or fix takes longer.

## Scope

In scope:

- Electron main process, preload bridge, renderer isolation, and IPC allowlists;
- local REST API, TLS/mTLS configuration, authentication, and SSRF protections;
- secret storage (DPAPI/safeStorage), PIN handling, and audit-chain integrity;
- webhook signing, update/installer integrity, code signing, and release metadata;
- Windows power actions and any path that can trigger them without authorization.

Out of scope:

- vulnerabilities in unsupported Windows versions or third-party services;
- physical access or an attacker who already has administrator/root privileges;
- social engineering and spam;
- reports that require disabling documented security controls.

The security design is documented in
[`docs/architecture/LOCAL_API_SECURITY.md`](../docs/architecture/LOCAL_API_SECURITY.md)
and [`docs/release/RELEASE_SIGNING.md`](../docs/release/RELEASE_SIGNING.md).

## Safe harbor

We will not pursue legal action against researchers who act in good faith,
avoid privacy violations and service disruption, and give us reasonable time
to fix the issue before public disclosure. Do not access, modify, or exfiltrate
data that does not belong to you.

## Disclosure

We prefer coordinated disclosure. We will agree on a disclosure date with the
reporter and publish a GitHub security advisory when a fix is available. No bug
bounty is currently offered.
