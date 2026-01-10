# Chronalog

A Git-backed changelog system for Next.js. Manage your changelog entries with a beautiful admin interface. Git-backed, no database, own your data.

## Features

- **Git-backed**: All changes are automatically committed to your Git repository. Full version control for your changelog.
- **MDX Support**: Write changelog entries in MDX format. Rich content with markdown support and custom components.
- **Customisable**: Configure folder paths, route paths, and commit message formats to match your workflow.
- **Quick Setup**: Get started in minutes. No database setup, no complex configuration. Just install and go.
- **No Database**: Everything is file-based. Your changelog entries are stored as MDX files in your repository.
- **TypeScript**: Fully typed with TypeScript. Get autocomplete and type safety throughout your changelog system.

## Requirements

- Next.js 14.0.0 or higher
- React 18.0.0 or higher
- Tailwind CSS 4.0.0 or higher
- Git (for auto-commit functionality)

## Installation

Install Chronalog in your Next.js project using pnpm:

```bash
pnpm add chronalog
```

## Getting Started

### Initialisation

Run the init command to scaffold the necessary files and directories:

```bash
pnpm chronalog init
```

This will create:

- Admin page at `/app/(cms)/chronalog/page.tsx`
- Settings page at `/app/(cms)/chronalog/settings/page.tsx`
- API routes for saving, listing, and fetching changelog entries
- GitHub OAuth authentication routes
- Configuration file at `changelog.config.ts`
- Changelog directory at `chronalog/changelog`

### GitHub OAuth Setup

Chronalog uses GitHub OAuth for authentication. Set up your GitHub OAuth app:

1. Create a GitHub OAuth App at [https://github.com/settings/developers](https://github.com/settings/developers)
2. Set the Authorization callback URL to: `http://localhost:3000/api/changelog/auth/callback`
3. Add the following to your `.env.local` file:

```env
CHRONALOG_GITHUB_ID=your_client_id
CHRONALOG_GITHUB_SECRET=your_client_secret
```

## Changelog Entry Schema

Changelog entries are stored as MDX files with YAML frontmatter. Here's the complete schema:

### Required Fields

- `title` (string) - The title of the changelog entry
- `date` (string) - ISO datetime format: YYYY-MM-DDTHH:mm:ss.sssZ
- `body` (string) - The main content/body of the changelog entry (MDX/HTML)

### Optional Fields

- `version` (string) - Version number (e.g., "1.0.0")
- `tags` (string[]) - Array of tags for categorisation
- `features` (string[]) - Array of feature descriptions
- `bugfixes` (string[]) - Array of bug fix descriptions

### Example Entry

```mdx
---
title: Version 1.0.0 Release
date: 2024-01-15T14:30:00.000Z
version: 1.0.0
tags:
  - "release"
  - "feature"
features:
  - "Added user authentication system"
  - "Implemented dark mode"
bugfixes:
  - "Fixed login redirect issue"
---

This release includes major new features and important bug fixes.

## Highlights

- Complete authentication overhaul
- Improved performance across the board
- Better user experience

## License

MIT
