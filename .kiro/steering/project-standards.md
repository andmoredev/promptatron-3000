# Project Standards and Conventions

This document outlines the coding standards, patterns, and conventions used in the Bedrock LLM Analyzer project.

## Code Formatting Guidelines

- **DO NOT** apply automatic formatting to entire files unless explicitly requested
- **DO NOT** reformat existing code when making small changes
- **ONLY** format the specific lines or sections being modified
- Preserve existing indentation and formatting patterns in the codebase
- When making targeted changes, maintain the existing code style around the modification

## Technology Stack

- **Frontend Framework**: React 19 with Vite
- **Styling**: Tailwind CSS with custom color palette
- **AWS Integration**: AWS SDK v3 (Bedrock Runtime and Management clients)
- **State Management**: React hooks (useState, useEffect, custom hooks)
- **Build Tool**: Vite with React plugin
- **Package Manager**: npm

## Code Organization

### File Structure Patterns

- Components in `src/components/` with descriptive names
- Services in `src/services/` for external integrations
- Utilities in `src/utils/` for reusable helper functions
- Hooks in `src/hooks/` for custom React hooks
- Complex components get their own subdirectory (e.g., `RobotGraphic/`)

### Component Structure

- Use functional components with hooks
- PropTypes for type checking
- Default props when appropriate
- JSDoc comments for complex components
- Separate concerns: presentation vs logic

## Naming Conventions

### Files and Directories

- Components: PascalCase (e.g., `ModelSelector.jsx`)
- Services: camelCase (e.g., `bedrockService.js`)
- Utilities: camelCase (e.g., `formValidation.js`)
- CSS files: match component name (e.g., `RobotGraphic.css`)

### Variables and Functions

- camelCase for variables and functions
- Descriptive names that explain purpose
- Boolean variables prefixed with `is`, `has`, `can`, etc.
- Event handlers prefixed with `handle` (e.g., `handleRunTest`)

### Constants

- UPPER_SNAKE_CASE for constants
- Group related constants in objects when appropriate

## React Patterns

### State Management

- Use `useState` for component-level state
- Use `useEffect` for side effects and lifecycle events
- Custom hooks for reusable stateful logic
- Lift state up when multiple components need access

### Props and PropTypes

```javascript
ComponentName.propTypes = {
  requiredProp: PropTypes.string.isRequired,
  optionalProp: PropTypes.string,
  functionProp: PropTypes.func,
};

ComponentName.defaultProps = {
  optionalProp: "default value",
};
```

### Event Handling

- Use arrow functions for inline handlers when simple
- Extract complex handlers to separate functions
- Use descriptive handler names (e.g., `handleModelSelect`)

## Styling Guidelines

### Tailwind CSS Usage

- Use utility classes for styling
- Custom color palette defined in `tailwind.config.js`:
  - Primary: Green tones (#5c8c5a family)
  - Secondary: Light green tones (#9ecc8c family)
  - Tertiary: Very light green (#e6f3d5 family)

### CSS Classes

- Use semantic class names for custom CSS
- Component-specific styles in separate CSS files
- Animation classes for transitions and effects

### Responsive Design

- Mobile-first approach with Tailwind breakpoints
- Use responsive utilities (sm:, md:, lg:, xl:)
- Test on multiple screen sizes

## Error Handling

### Patterns

- Use try-catch blocks for async operations
- Centralized error handling utilities in `src/utils/errorHandling.js`
- User-friendly error messages
- Retry mechanisms for network operations

### Validation

- Form validation utilities in `src/utils/formValidation.js`
- Real-time validation feedback
- Clear validation error messages

## AWS Integration

### Bedrock Service

- Singleton service class in `src/services/bedrockService.js`
- Credential detection and validation
- Converse API for model interactions
- Proper error handling for AWS-specific errors

### Environment Variables

- Use `VITE_` prefix for client-side environment variables
- Store in `.env.local` for local development
- Never commit sensitive credentials

## Performance Considerations

### React Optimization

- Use `useCallback` and `useMemo` when appropriate
- Avoid unnecessary re-renders
- Lazy loading for large components when needed

### Bundle Optimization

- Vite handles most optimization automatically
- Use dynamic imports for code splitting when beneficial

## Accessibility

### Standards

- Use semantic HTML elements
- Provide `aria-label` and `aria-describedby` attributes
- Ensure keyboard navigation works
- Maintain color contrast ratios

### Testing

- Use `data-testid` attributes for testing
- Descriptive test IDs that explain component purpose

## Code Quality

### Comments and Documentation

- JSDoc comments for complex functions and components
- Inline comments for complex logic
- README files for major features

### Code Style

- Consistent indentation (2 spaces)
- Semicolons at end of statements
- Single quotes for strings
- Trailing commas in objects and arrays

## Development Workflow

### Local Development

- Use `npm run dev` for development server
- Use `./local-setup.sh` for AWS credential setup
- Hot reload enabled via Vite

### Build Process

- `npm run build` for production builds
- Vite handles bundling and optimization
- Environment variables injected at build time

## Important Notes

### Testing and Linting

- **DO NOT add testing frameworks** (Jest, Vitest, etc.) unless explicitly requested
- **DO NOT add linting tools** (ESLint, Prettier) unless explicitly requested
- Focus on functional implementation over testing infrastructure

### Dependencies

- Prefer built-in React features over external libraries
- Only add dependencies when necessary for core functionality
- Keep bundle size reasonable
