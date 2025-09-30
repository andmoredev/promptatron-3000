# Coding Principles & Best Practices

## Code Formatting Policy

**CRITICAL**: Do not apply automatic formatting or reformatting to entire files. Only format the specific lines being modified. Preserve existing code formatting and indentation patterns.

## Core Philosophy

### Follow Existing Patterns
- **Study the codebase first**: Before implementing new features, examine how similar functionality is already implemented
- **Maintain consistency**: Use the same patterns, naming conventions, and architectural approaches found in existing code
- **Don't reinvent**: If a pattern already exists for handling similar problems, use it rather than creating new approaches

### Write Simple Code
- **Clarity over cleverness**: Choose readable, straightforward solutions over complex or "clever" implementations
- **Avoid premature optimization**: Write clear code first, optimize only when performance issues are identified
- **Prefer explicit over implicit**: Make code intentions clear through explicit naming and structure
- **No magic**: Avoid obscure language features or complex abstractions that make code hard to understand

### Minimal Code Approach
- **Solve the business problem**: Focus on delivering the required functionality without unnecessary features
- **Delete before adding**: Look for opportunities to remove or simplify existing code when adding new features
- **Reuse existing utilities**: Leverage existing functions, components, and services rather than duplicating logic
- **Avoid over-engineering**: Don't build for hypothetical future requirements

### Solo Developer Maintainability
- **Easy to trace**: Code should be straightforward to follow from problem to solution
- **Clear ownership**: Each piece of functionality should have an obvious home in the codebase
- **Minimal cognitive load**: A single developer should be able to understand the entire system
- **Smart abstraction decisions**: Create new patterns only when existing ones would significantly complicate the code

## Implementation Guidelines

### Component Development
```javascript
// Good: Simple, focused component
function ModelSelector({ selectedModel, onModelSelect, validationError }) {
  return (
    <select
      value={selectedModel}
      onChange={(e) => onModelSelect(e.target.value)}
      className={validationError ? 'input-field-error' : 'input-field'}
    >
      {/* options */}
    </select>
  )
}

// Avoid: Over-engineered with unnecessary complexity
function ModelSelector({ config, handlers, state, theme, ...props }) {
  const { selectedModel } = useModelState(state)
  const { handleSelect } = useModelHandlers(handlers)
  // ... complex abstraction layers
}
```

### Service Layer Consistency
- Follow the singleton pattern established by `bedrockService`
- Use the same error handling patterns found in existing services
- Maintain consistent async/await usage throughout
- Follow the established initialization and validation patterns

### Utility Functions
- Keep functions pure and focused on single responsibilities
- Follow the naming patterns in existing utils (e.g., `validateForm`, `sanitizeInput`)
- Use the same parameter and return value structures as similar functions
- Maintain consistent error handling approaches

### State Management
- Use `useState` for local component state (existing pattern)
- Create custom hooks for complex state logic (follow `useHistory` pattern)
- Avoid introducing new state management libraries
- Keep state as close to where it's used as possible

## Code Quality Standards

### Consistency Checkers
Before implementing new code, ask:
1. **Pattern Check**: "How is this type of functionality handled elsewhere in the codebase?"
2. **Simplicity Check**: "Is this the simplest solution that solves the business problem?"
3. **Necessity Check**: "Does this code directly contribute to the required functionality?"
4. **Consistency Check**: "Does this follow the same patterns, naming, and structure as existing code?"
5. **Maintainability Check**: "Will a solo developer be able to easily understand and debug this in 6 months?"

### Dependency Management
- **Use existing dependencies**: Leverage packages already in the project (React, Tailwind, AWS SDK, etc.)
- **Avoid dependency bloat**: Don't add new packages for functionality that can be implemented simply
- **Standard functionality**: Use well-known packages for standard features (don't reinvent date parsing, HTTP clients, etc.)
- **Evaluate trade-offs**: Balance between "not invented here" syndrome and dependency management overhead

### Smart Decision Making
- **When to reuse**: If existing code can be extended or modified without significant complexity
- **When to create new**: If forcing existing patterns would make the code confusing or hard to maintain
- **Dependency decisions**: Add dependencies for complex, standard functionality; implement simple utilities in-house

### Error Handling
- Follow the established pattern in `errorHandling.js`
- Provide user-friendly error messages consistent with existing ones
- Use the same retry mechanisms and error recovery patterns
- Maintain consistent error logging and reporting

### Validation
- Use the existing validation utilities in `formValidation.js`
- Follow the same validation patterns and error message formats
- Extend existing validation rules rather than creating new systems
- Maintain consistency in validation timing and user feedback

### Styling
- Use existing Tailwind classes and component styles
- Follow the established CSS class naming conventions
- Extend existing theme colors and design tokens
- Maintain responsive design patterns used throughout the app

## Anti-Patterns to Avoid

### Don't Be Clever
- Avoid one-liners that sacrifice readability
- Don't use obscure JavaScript features for brevity
- Avoid complex functional programming chains when simple loops are clearer
- Don't create abstractions until you have multiple concrete use cases

### Don't Over-Engineer
- Avoid creating configuration systems for simple values
- Don't build generic solutions for specific problems
- Avoid adding dependencies for functionality that can be implemented simply
- Don't create elaborate type systems or validation schemas beyond what exists
- Don't abstract until you have at least 3 concrete use cases

### Don't Under-Engineer
- Don't reimplement standard functionality available in well-established packages
- Don't avoid dependencies when they solve complex problems reliably
- Don't force existing patterns when they would make new functionality unclear
- Don't sacrifice maintainability for the sake of consistency

### Don't Break Consistency
- Don't introduce new architectural patterns without strong justification
- Avoid mixing different coding styles within the same codebase
- Don't create new utility functions that duplicate existing functionality
- Avoid changing established naming conventions or file organization

## Code Review Checklist

When reviewing or writing code, ensure:
- [ ] Follows existing patterns in the codebase
- [ ] Solves the business problem with minimal code
- [ ] Uses simple, readable implementations
- [ ] Maintains consistency with existing code style
- [ ] Reuses existing utilities and components where possible
- [ ] Follows established error handling and validation patterns
- [ ] Uses the same naming conventions and file organization
- [ ] Doesn't introduce unnecessary complexity or abstractions
- [ ] Can be easily understood and debugged by a solo developer
- [ ] Makes smart decisions about when to create new patterns vs. extend existing ones
- [ ] Uses appropriate dependencies (existing ones when possible, well-known packages for standard functionality)

## Solo Developer Guidelines

### Debugging and Maintenance
- **Clear error messages**: Include enough context to quickly identify the problem source
- **Logical file organization**: Related functionality should be easy to locate
- **Minimal indirection**: Avoid deep abstraction layers that obscure the actual logic
- **Self-documenting code**: Variable and function names should clearly indicate their purpose

### When to Break Patterns
Break existing patterns when:
- Forcing the existing pattern would make the code significantly more complex
- The new functionality is fundamentally different from existing features
- Following the pattern would create maintenance burdens or confusion
- The existing pattern doesn't scale to the new requirements

### Dependency Decision Framework
1. **Check existing**: Can this be solved with packages already in the project?
2. **Evaluate complexity**: Is this standard functionality that's complex to implement correctly?
3. **Consider maintenance**: Will adding this dependency create more work than implementing it simply?
4. **Assess reliability**: Is this a well-maintained, widely-used package?
