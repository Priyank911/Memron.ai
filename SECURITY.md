# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in Memron.ai, please report it privately:

### Preferred Method
- Email: security@memron.ai (if available)
- Use GitHub's private vulnerability reporting feature

### What to Include
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity (critical issues prioritized)

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Best Practices

When using Memron.ai:

1. **Never commit secrets** - Use environment variables
2. **Rotate keys regularly** - Especially for production
3. **Use hardware wallets** - For production deployments
4. **Enable 2FA** - On all related accounts
5. **Keep dependencies updated** - Run `pnpm update` regularly

## Known Security Considerations

- This is early-stage software under active development
- Audit smart contracts before mainnet deployment
- Test encryption/decryption flows thoroughly
- Verify IPFS content addressing integrity

## Responsible Disclosure

We appreciate responsible disclosure and will:
- Acknowledge your contribution
- Keep you informed of our progress
- Credit you in our security acknowledgments (unless you prefer anonymity)

Thank you for helping keep Memron.ai secure!
