# Project Structure & Architecture

## Directory Organization

```
bedrock-llm-analyzer/
├── src/
│   ├── components/          # React UI components
│   ├── hooks/              # Custom React hooks
│   ├── services/           # Business logic & API services
│   ├── utils/              # Utility functions & helpers
│   ├── App.jsx             # Main application component
│   ├── main.jsx            # React entry point
│   └── index.css           # Global styles & Tailwind
├── public/
│   └── scenarios/          # Scenario files with datasets organized by use case
├── .kiro/                  # Kiro IDE configuration
└── [config files]         # Build & tool configuration
```

## Architecture Patterns

### Component Structure
- **Functional Components**: All components use React hooks
- **Single Responsibility**: Each component has one clear purpose
- **Prop Validation**: Use PropTypes for type checking
- **Error Boundaries**: Wrap components for graceful error handling

### State Management
- **Local State**: useState for component-specific state
- **Custom Hooks**: Encapsulate complex state logic (e.g., `useHistory`)
- **Service Layer**: Business logic separated from UI components
- **No Global State**: Avoid Redux/Context for this application size

### Service Layer Pattern
- **Singleton Services**: Single instances for AWS, file operations
- **Error Handling**: Centralized error handling with user-friendly messages
- **Async/Await**: Modern promise handling throughout
- **Retry Logic**: Built-in retry mechanisms for network operations

## Key Components

### Core UI Components
- `ModelSelector`: AWS Bedrock model selection dropdown
- `DatasetSelector`: Two-level dataset selection (type → file)
- `PromptEditor`: Dual prompt system (system + user prompts)
- `TestResults`: Formatted display of AI model responses
- `History`: Test history with search, filter, and comparison
- `Comparison`: Side-by-side test result comparison

### Utility Components
- `ErrorBoundary`: React error boundary for crash recovery
- `LoadingSpinner`: Consistent loading indicators
- `ProgressBar`: Progress tracking for long operations
- `ThemeProvider`: Centralized theme management
- `BrowserCompatibility`: Feature detection and warnings

## File Naming Conventions

- **Components**: PascalCase (e.g., `ModelSelector.jsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useHistory.js`)
- **Services**: camelCase with `Service` suffix (e.g., `bedrockService.js`)
- **Utils**: camelCase descriptive names (e.g., `formValidation.js`)
- **Constants**: UPPER_SNAKE_CASE when applicable

## Import/Export Patterns

```javascript
// Named exports for utilities
export { validateForm, sanitizeInput }

// Default exports for components
export default ModelSelector

// Service singletons
export const bedrockService = new BedrockService()

// Barrel exports in index.js files
export * from './bedrockService.js'
```

## CSS Architecture

### Tailwind CSS Structure
- **Global Styles**: `src/index.css` with Tailwind directives
- **Component Classes**: Defined in `@layer components`
- **Utility Classes**: Custom utilities in `@layer utilities`
- **CSS Variables**: Theme colors defined as CSS custom properties

### Class Naming
- **Semantic Classes**: `.btn-primary`, `.card`, `.input-field`
- **State Classes**: `.input-field-error`, `.validation-error-text`
- **Animation Classes**: `.animate-fade-in`, `.animate-slide-up`

## Data Flow Patterns

### Props Down, Events Up
- Parent components pass data via props
- Child components communicate via callback functions
- No prop drilling beyond 2-3 levels

### Service Integration
- Components call services directly (no middleware)
- Services handle all external API communication
- Error handling at service level with user-friendly messages

### Form Handling
- Controlled components for all form inputs
- Real-time validation with immediate feedback
- Centralized validation logic in utils

## Testing Structure

```
src/utils/__tests__/        # Unit tests for utilities
├── formValidation.test.js
├── errorHandling.test.js
└── validation.test.js
```

### Testing Patterns
- **Vitest**: Primary testing framework
- **Unit Tests**: Focus on utility functions and services
- **Integration Tests**: Test component interactions
- **Manual Testing**: `manualIntegrationTest.js` for AWS services

## Configuration Management

### Environment Variables
- **Development**: `.env.local` for local AWS credentials
- **Build Time**: `VITE_*` prefix for client-side variables
- **Runtime**: No runtime configuration changes

### Feature Flags
- Use environment variables for optional features
- Graceful degradation when features unavailable
- Clear error messages for missing configuration
