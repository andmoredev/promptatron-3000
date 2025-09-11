# Technology Stack & Build System

## Core Technologies

- **React 19**: Latest React with modern features and concurrent rendering
- **Vite**: Fast build tool and development server with HMR
- **Tailwind CSS**: Utility-first CSS framework for responsive design
- **AWS SDK v3**: JavaScript SDK for Bedrock integration (`@aws-sdk/client-bedrock`, `@aws-sdk/client-bedrock-runtime`)

## Key Dependencies

### UI & Rendering
- `react-markdown`: Markdown rendering with syntax highlighting
- `react-syntax-highlighter`: Code syntax highlighting
- `rehype-raw`: HTML support in markdown
- `remark-gfm`: GitHub Flavored Markdown support

### Testing & Development
- `vitest`: Fast unit testing framework
- `jsdom`: DOM environment for testing
- `@vitest/ui`: Visual test runner interface

## Build Commands

```bash
# Development
npm run dev              # Start development server on port 3000
npm run dev:local        # Run local AWS setup + dev server

# Production
npm run build            # Build for production
npm run preview          # Preview production build

# Testing
npm run test             # Run tests in watch mode
npm run test:run         # Run tests once

# AWS Setup
npm run setup-local      # Configure AWS SSO credentials
./local-setup.sh         # Direct script execution (Linux/Mac)
```

## Development Server Configuration

- **Port**: 3000 (auto-opens browser)
- **HMR**: Enabled for fast development
- **Global Polyfills**: `global` mapped to `globalThis` for AWS SDK compatibility
- **Optimized Dependencies**: AWS SDK modules pre-bundled for faster startup

## AWS Configuration

### Environment Variables (Required)
```bash
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=your_key
VITE_AWS_SECRET_ACCESS_KEY=your_secret
VITE_AWS_SESSION_TOKEN=your_token  # For temporary/SSO credentials
```

### Setup Process
1. Run `./local-setup.sh` to extract SSO credentials
2. Creates `.env.local` with `VITE_AWS_*` variables
3. Application reads environment variables for AWS authentication

## Build System Features

- **ES Modules**: Full ESM support with `"type": "module"`
- **Tree Shaking**: Automatic dead code elimination
- **Code Splitting**: Automatic chunking for optimal loading
- **Asset Optimization**: Image and static asset processing
- **TypeScript Ready**: Configured for TypeScript if needed

## Browser Compatibility

- Modern browsers with ES2020+ support
- Automatic compatibility checking on startup
- Graceful degradation for unsupported features
