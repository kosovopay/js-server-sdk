# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

This SDK handles payment credentials and webhook signing secrets, so we take
reports seriously and respond quickly.

Report privately via GitHub's
[**Security Advisories**](https://github.com/kosovopay/js-server-sdk/security/advisories/new)
("Report a vulnerability"). If you can't use GitHub, email
**security@kosovo.sh** instead.

Please include:

- a description of the issue and its impact,
- steps to reproduce (a minimal proof of concept if possible),
- affected versions.

We aim to acknowledge reports within **2 business days** and to ship a fix or
mitigation for confirmed issues as fast as is responsibly possible. We'll credit
you in the release notes unless you'd prefer to stay anonymous.

## Supported versions

Only the latest published `0.x` release receives security fixes while the SDK is
pre-1.0.

## Good practices for users

- Keep your secret key (`sk_live_…`) server-side; never ship it to a browser.
- Always verify webhook signatures with `pay.webhooks.constructEvent` over the
  **raw** request body — never the re-serialized JSON.
- Pin `apiVersion` so behaviour can't shift under you.
