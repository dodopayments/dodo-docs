# Contributing to Dodo Payments Documentation

Thank you for your interest in contributing to Dodo Payments documentation! We appreciate your help in making our documentation more comprehensive, accurate, and user-friendly.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Types of Contributions](#types-of-contributions)
- [Development Process](#development-process)
- [Style Guide](#style-guide)
- [Submitting Changes](#submitting-changes)
- [Review Process](#review-process)
- [Recognition](#recognition)

## Code of Conduct

### Our Pledge

We are committed to providing a friendly, safe, and welcoming environment for all contributors, regardless of experience level, gender identity and expression, sexual orientation, disability, personal appearance, body size, race, ethnicity, age, religion, or nationality.

### Expected Behavior

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members
- Use welcoming and inclusive language

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Personal attacks or trolling
- Publishing others' private information
- Any conduct which would be considered inappropriate in a professional setting

## 🚀 Getting Started

1. **Fork the Repository**
   ```bash
   # Navigate to https://github.com/dodopayments/dodo-docs
   # Click the "Fork" button in the top right
   ```

2. **Clone Your Fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/dodo-docs.git
   cd dodo-docs
   ```

3. **Set Up Development Environment**
   ```bash
   # Install Mintlify CLI
   npm i -g mintlify
   
   # Run local development server
   mintlify dev
   ```

4. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Types of Contributions

### Documentation Improvements

- **Content Updates**: Fix typos, improve clarity, update outdated information
- **New Guides**: Create tutorials for common use cases
- **Code Examples**: Add or improve code snippets
- **Diagrams**: Create visual aids to explain complex concepts
- **API Documentation**: Update endpoint descriptions, parameters, and responses
- **Integration Guides**: Document new framework adaptors or third-party integrations
- **Troubleshooting**: Add solutions for common issues


## Development Process

### File Structure

```
dodo-docs/
├── api-reference/      # API endpoint documentation
├── changelog/          # Version history and updates
├── developer-resources/# Integration guides and SDKs
├── features/          # Platform feature documentation
├── images/            # Screenshots and diagrams
├── integrations/      # Third-party integration guides
└── miscellaneous/     # FAQs, guides, and other resources
```

### Writing Documentation

1. **Create/Edit MDX Files**
   - Use `.mdx` extension for all documentation files
   - Place files in appropriate directories
   - Follow kebab-case naming: `payment-methods.mdx`

2. **Add Frontmatter**
   ```mdx
   ---
   title: "Your Page Title"
   description: "A brief description of the page content"
   icon: "credit-card"
   ---
   ```

3. **Update Navigation**
   - Edit `docs.json` to include your new page (if you have created one)
   - Maintain logical grouping and hierarchy

## Style Guide

### Writing Style

- **Be Clear and Concise**: Use simple language and short sentences
- **Use Active Voice**: "Click the button" instead of "The button should be clicked"
- **Be Consistent**: Use the same terminology throughout
- **Include Examples**: Show, don't just tell

### Formatting Guidelines


#### Code Blocks
````mdx
```javascript
// Use language-specific syntax highlighting
const apiKey = process.env.DODO_API_KEY;
```
````
Use `expandable` after the language tag, such as `javascript expandable`, if the code block exceeds 4 lines.

#### Images
```mdx
<Frame>
  <img src="/images/feature-name/step-1.png" alt="Descriptive alt text" />
</Frame>
```

### Component Usage Example

Dodo Payments uses Mintlify to maintain its documentation page. Please check the [Mintlify Documentation](https://mintlify.com/docs) for all available components.

#### Cards
```mdx
<Card title="Feature Title" icon="icon-name" href="/link">
  Brief description of the feature
</Card>
```

#### Callouts
```mdx
<Note>
  Important information that users should know
</Note>

<Warning>
  Critical information about potential issues
</Warning>

<Info>
  Additional helpful context
</Info>
```

#### Accordions
```mdx
<AccordionGroup>
  <Accordion title="Question 1">
    Answer to question 1
  </Accordion>
  <Accordion title="Question 2">
    Answer to question 2
  </Accordion>
</AccordionGroup>
```

## Submitting Changes

### Pre-submission Checklist

- [ ] Test your changes locally with `mintlify dev`
- [ ] Check for broken links and images with `mintlify broken-links`
- [ ] Verify code examples work correctly if you made any changes
- [ ] Update relevant navigation in `docs.json`
- [ ] Follow the style guide
- [ ] Write a clear commit message

### Licensing

By contributing to this repository, you agree that your contributions will be licensed under the GNU General Public License v3.0 (GPL-3.0), consistent with the repository's [LICENSE](LICENSE). Ensure that any content you submit is compatible with GPL-3.0 and that you have the right to contribute it.

### Commit Messages

Follow conventional commits format:
```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `docs`: Documentation changes
- `fix`: Corrections to existing content
- `feat`: New documentation or features
- `style`: Formatting changes
- `refactor`: Documentation restructuring

Examples:
```bash
docs(api): add webhook payload examples
fix(guide): correct authentication flow steps
feat(integration): add Stripe integration guide
```

### Pull Request Process

1. **Create Pull Request**
   - Use a clear, descriptive title
   - Fill out the PR template
   - Link related issues

2. **PR Description Template**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix (non-breaking change)
   - [ ] New documentation
   - [ ] Documentation update
   - [ ] Style/formatting update

   ## Testing
   - [ ] Tested locally with `mintlify dev`
   - [ ] Verified all links work
   - [ ] Checked responsive design

   ## Screenshots (if applicable)
   Add screenshots of visual changes

   ## Related Issues
   Closes #123
   ```

## Review Process

### What We Look For

1. **Accuracy**: Information is correct and up-to-date
2. **Clarity**: Content is easy to understand
3. **Completeness**: All necessary information is included
4. **Consistency**: Follows existing patterns and style
5. **Quality**: Well-written with proper grammar

### Review Timeline

- **Initial Review**: Within 2-3 business days
- **Feedback Response**: Please respond within 7 days
- **Merge Decision**: After all feedback is addressed

### After Merge

- Your changes will be automatically deployed
- You'll be added to our contributors list
- Consider joining our Discord to stay connected

## Recognition

We value all contributions and recognize our contributors through:

- **Contributors List**: Added to our README
- **Exclusive Merch**: Exceptional contributors may receive Dodo Payments merchandise as a token of our appreciation


## Getting Help

If you need assistance:

- **Discord**: Join our [Discord server](https://discord.gg/bYqAp4ayYh)
- **GitHub Issues**: Open an issue for bugs or suggestions
- **Email**: support@dodopayments.com for direct support



---

Thank you for contributing to Dodo Payments documentation! Your efforts help developers worldwide integrate payments more effectively.