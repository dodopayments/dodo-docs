# Dodo Payments Documentation

<p align="center">
  <img src="./images/cover-images/readme-cover.png" alt="Dodo Payments documentation cover image"/>
</p>

<div align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-GPLv3-blue.svg" alt="License: GPLv3" />
  </a>
  <a href="https://docs.dodopayments.com">
    <img src="https://img.shields.io/badge/docs-live-brightgreen.svg" alt="Live Documentation" />
  </a>
  <a href="https://discord.gg/bYqAp4ayYh">
    <img src="https://img.shields.io/discord/1305511580854779984?label=Join%20Discord&logo=discord" alt="Join Discord" />
  </a>
</div>

## 🚀 Overview

Welcome to the official documentation repository for [Dodo Payments](https://dodopayments.com), a comprehensive Merchant of Record solution for global payment processing of digital products. This documentation is built with [Mintlify](https://mintlify.com) and covers everything from quick start guides to detailed API references.

## 📚 Documentation Site

Visit our live documentation at [docs.dodopayments.com](https://docs.dodopayments.com)

## 🏗️ Documentation Structure

Our documentation is organized into five main sections:

### 1. **Setup & Features** 
- Getting started guides
- Platform features (subscriptions, one-time payments, licensing, etc.)
- Security & compliance information
- Business verification and payout setup

### 2. **Developer Resources**
- Integration guides and tutorials
- Framework adaptors (Next.js, Nuxt, SvelteKit, etc.)
- SDKs and mobile integration
- Webhook implementation
- Testing tools

### 3. **API Reference**
- Complete API documentation
- Endpoint references for all resources
- Error codes and troubleshooting
- Code examples and best practices

### 4. **External Integrations**
- Third-party integrations (Zapier, Slack, Discord, etc.)
- CRM connections (HubSpot, Close)
- Email service providers
- Analytics platforms

### 5. **Changelog**
- Version history
- Feature updates
- Breaking changes
- Migration guides

## 🛠️ Development Setup

### Prerequisites

- Node.js 18.x or higher
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/dodopayments/dodo-docs.git
   cd dodo-docs
   ```

2. **Install the Mintlify CLI**
   ```bash
   npm i -g mintlify
   # or
   yarn global add mintlify
   ```

3. **Run the development server**
   ```bash
   mintlify dev
   ```

   The documentation will be available at `http://localhost:3000`

### Configuration

The documentation is configured through `docs.json` which includes:
- Navigation structure
- Theme customization
- SEO settings
- Integration configurations
- Redirect rules

## 📝 Contributing

Want to help improve our docs? Read our [contribution guidelines](./CONTRIBUTING.md) for details on how to get started.

- Fix typos, clarify explanations, or add examples
- Create new guides or update API docs
- Help with translations

All docs use MDX with frontmatter. Test changes locally with `mintlify dev` before submitting a pull request.

Thank you for contributing!

## 🔧 Troubleshooting

### Common Issues

**Mintlify dev isn't running**
- Run `mintlify install` to reinstall dependencies
- Ensure you're in the directory containing `docs.json`

**Page loads as 404**
- Check that your file is included in the navigation structure in `docs.json`
- Verify the file path matches the navigation entry

**Images not displaying**
- Ensure images are in the `/images` directory
- Use absolute paths starting with `/images/`

## 🚀 Deployment

Documentation is automatically deployed when changes are pushed to the main branch. The deployment process:

1. Push changes to the `main` branch
2. GitHub Actions trigger the build process
3. Mintlify deploys the updated documentation
4. Changes are live at [docs.dodopayments.com](https://docs.dodopayments.com)

## 📄 License

This documentation is licensed under the GNU General Public License v3.0 (GPL-3.0). See the [LICENSE](LICENSE) file for details.

## 🤝 Support

- **Documentation Issues**: Open an issue in this repository
- **Community**: Join our [Discord server](https://discord.gg/bYqAp4ayYh)
- **API Status**: Check [status.dodopayments.com](https://status.dodopayments.com)

## 🔗 Useful Links

- [Dodo Payments Dashboard](https://app.dodopayments.com)
- [API Reference](https://docs.dodopayments.com/api-reference/introduction)
- [Developer Blog](https://blog.dodopayments.com)
- [Changelog](https://docs.dodopayments.com/changelog/introduction)

---

<div align="center">
  Made with ❤️ by the Dodo Payments team
</div>
