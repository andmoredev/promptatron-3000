# Component Development Patterns

This document outlines specific patterns and conventions for developing React components in the Bedrock LLM Analyzer project.

## Component Architecture

### Functional Components with Hooks
Always use functional components with React hooks. Avoid class components.

```javascript
import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

const ComponentName = ({ prop1, prop2, onAction }) => {
  const [state, setState] = useState(initialValue)
  
  useEffect(() => {
    // Side effects here
  }, [dependencies])
  
  const handleEvent = () => {
    // Event handling logic
    onAction?.(data)
  }
  
  return (
    <div className="component-wrapper">
      {/* JSX content */}
    </div>
  )
}

ComponentName.propTypes = {
  prop1: PropTypes.string.isRequired,
  prop2: PropTypes.string,
  onAction: PropTypes.func
}

ComponentName.defaultProps = {
  prop2: 'default value'
}

export default ComponentName
```

## State Management Patterns

### Local State
Use `useState` for component-specific state:

```javascript
const [isLoading, setIsLoading] = useState(false)
const [error, setError] = useState(null)
const [data, setData] = useState([])
```

### Derived State
Compute derived values directly in render instead of storing in state:

```javascript
const isFormValid = selectedModel && systemPrompt.trim() && userPrompt.trim()
const completedFields = Object.values(validationStatus).filter(field => field.valid).length
```

### State Updates
Use functional updates when new state depends on previous state:

```javascript
setItems(prevItems => [...prevItems, newItem])
setCount(prevCount => prevCount + 1)
```

## Event Handling Patterns

### Handler Naming
- Prefix with `handle`: `handleSubmit`, `handleChange`, `handleClick`
- Be specific about the action: `handleModelSelect`, `handlePromptChange`

### Handler Implementation
```javascript
const handleFormSubmit = async (event) => {
  event.preventDefault()
  setIsLoading(true)
  setError(null)
  
  try {
    await submitForm(formData)
  } catch (err) {
    setError(err.message)
  } finally {
    setIsLoading(false)
  }
}
```

### Callback Props
Pass data through callback props, not just events:

```javascript
// Good
onModelSelect(modelId)
onDatasetChange({ type, option, content })

// Avoid
onModelSelect(event)
```

## Validation Patterns

### Real-time Validation
Implement validation that updates as user types:

```javascript
useEffect(() => {
  const validationResult = validateForm({
    selectedModel,
    systemPrompt,
    userPrompt,
    selectedDataset
  })
  setValidationErrors(validationResult.errors)
}, [selectedModel, systemPrompt, userPrompt, selectedDataset])
```

### Validation Display
Show validation errors with helpful guidance:

```javascript
{validationError && (
  <p className="mt-1 text-sm text-red-600">{validationError}</p>
)}

{/* Enhanced validation with tips */}
{validationErrors.systemPrompt && (
  <div className="mt-2 p-2 bg-blue-50 border-l-4 border-blue-400 rounded">
    <p className="text-xs text-blue-700">
      <strong>Tip:</strong> Try templates like "Data Analyst" to get started.
    </p>
  </div>
)}
```

## Loading and Error States

### Loading States
Always provide loading feedback for async operations:

```javascript
{isLoading ? (
  <LoadingSpinner size="sm" color="white" text="Processing..." inline />
) : (
  'Submit'
)}
```

### Error Handling
Display errors with dismissal options:

```javascript
{error && (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
    <div className="flex">
      <div className="flex-shrink-0">
        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
          {/* Error icon */}
        </svg>
      </div>
      <div className="ml-3 flex-1">
        <p className="text-sm text-red-800">{error}</p>
      </div>
      <div className="ml-3 flex-shrink-0">
        <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
          {/* Close icon */}
        </button>
      </div>
    </div>
  </div>
)}
```

## Styling Patterns

### Tailwind CSS Classes
Use utility classes with consistent patterns:

```javascript
// Card pattern
<div className="card">
  <div className="card-header">
    <h3 className="text-lg font-semibold text-gray-900">Title</h3>
  </div>
  <div className="card-body">
    {/* Content */}
  </div>
</div>

// Button patterns
<button className="btn-primary">Primary Action</button>
<button className="btn-secondary">Secondary Action</button>

// Input patterns
<input className="input-field" />
<textarea className="input-field resize-none h-32" />
```

### Conditional Styling
Use template literals for conditional classes:

```javascript
className={`px-4 py-2 rounded-md font-medium transition-colors duration-200 ${
  isActive 
    ? 'bg-primary-600 text-white' 
    : 'text-gray-600 hover:text-gray-900'
}`}
```

### Responsive Design
Apply responsive classes consistently:

```javascript
<div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
  <div className="space-y-6 animate-slide-up">
    {/* Left column */}
  </div>
  <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
    {/* Right column */}
  </div>
</div>
```

## Accessibility Patterns

### Semantic HTML
Use appropriate HTML elements:

```javascript
<button type="button" onClick={handleClick}>Action</button>
<label htmlFor="input-id">Label Text</label>
<input id="input-id" aria-describedby="help-text" />
<div id="help-text" className="text-sm text-gray-500">Help text</div>
```

### ARIA Attributes
Provide accessibility information:

```javascript
<div 
  role="img" 
  aria-label={effectiveAriaLabel}
  data-testid="robot-graphic"
>
  {/* Visual content */}
</div>

<button 
  aria-expanded={isExpanded}
  aria-controls="collapsible-content"
>
  {isExpanded ? 'Collapse' : 'Expand'}
</button>
```

## Performance Patterns

### Avoid Unnecessary Re-renders
Use `useCallback` for event handlers passed to child components:

```javascript
const handleItemSelect = useCallback((item) => {
  setSelectedItem(item)
}, [])
```

Use `useMemo` for expensive calculations:

```javascript
const expensiveValue = useMemo(() => {
  return performExpensiveCalculation(data)
}, [data])
```

### Efficient State Updates
Batch related state updates:

```javascript
// Good - single re-render
const handleReset = () => {
  setIsLoading(false)
  setError(null)
  setData([])
}

// Avoid - multiple re-renders
const handleReset = () => {
  setIsLoading(false)
  setTimeout(() => setError(null), 0)
  setTimeout(() => setData([]), 0)
}
```

## Component Composition

### Compound Components
Create flexible component APIs:

```javascript
<PromptEditor>
  <PromptEditor.SystemPrompt />
  <PromptEditor.UserPrompt />
  <PromptEditor.Preview />
</PromptEditor>
```

### Render Props Pattern
For complex reusable logic:

```javascript
<DataFetcher url="/api/data">
  {({ data, loading, error }) => (
    <div>
      {loading && <LoadingSpinner />}
      {error && <ErrorMessage error={error} />}
      {data && <DataDisplay data={data} />}
    </div>
  )}
</DataFetcher>
```

## Testing Considerations

### Test-Friendly Patterns
Add `data-testid` attributes for testing:

```javascript
<div data-testid="component-name" data-state={currentState}>
  <button data-testid="submit-button" onClick={handleSubmit}>
    Submit
  </button>
</div>
```

### Avoid Testing Implementation Details
Focus on user-facing behavior rather than internal state:

```javascript
// Good - test user interaction
expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()

// Avoid - test implementation details
expect(component.state.isSubmitting).toBe(false)
```

## Common Anti-Patterns to Avoid

### Don't Mutate State Directly
```javascript
// Wrong
items.push(newItem)
setItems(items)

// Correct
setItems([...items, newItem])
```

### Don't Use Array Index as Key
```javascript
// Wrong
{items.map((item, index) => <Item key={index} data={item} />)}

// Correct
{items.map(item => <Item key={item.id} data={item} />)}
```

### Don't Forget Cleanup
```javascript
useEffect(() => {
  const subscription = subscribe()
  
  return () => {
    subscription.unsubscribe()
  }
}, [])
```