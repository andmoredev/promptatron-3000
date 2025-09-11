# UI/UX Design Patterns

This document outlines the user interface and user experience patterns used in the Bedrock LLM Analyzer project.

## Design System

### Color Palette
The project uses a nature-inspired green color scheme defined in `tailwind.config.js`:

```javascript
colors: {
  primary: {
    50: '#f0f9f0',   // Very light green
    500: '#5c8c5a',  // Main brand green
    600: '#5c8c5a',  // Interactive green
    700: '#4a7348'   // Dark green
  },
  secondary: {
    100: '#e6f3d5',  // Light background green
    500: '#9ecc8c',  // Medium green
    700: '#739965'   // Darker green
  },
  tertiary: {
    50: '#e6f3d5',   // Background tint
    500: '#e6f3d5'   // Light accent
  }
}
```

### Typography Scale
Use Tailwind's typography utilities consistently:

- **Headings**: `text-3xl md:text-4xl font-bold` for main titles
- **Subheadings**: `text-lg font-semibold` for section headers
- **Body text**: `text-base` for regular content
- **Small text**: `text-sm` for secondary information
- **Micro text**: `text-xs` for metadata and hints

### Spacing System
Follow consistent spacing patterns:

- **Component spacing**: `space-y-6` for vertical component gaps
- **Section spacing**: `mb-6 lg:mb-8` for section margins
- **Card padding**: `p-4` for card content
- **Button padding**: `px-4 py-2` for standard buttons, `px-8 py-3` for primary actions

## Layout Patterns

### Container Structure
Use consistent container patterns:

```javascript
<div className="min-h-screen bg-gradient-to-br from-tertiary-50 to-secondary-100">
  <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
    {/* Content */}
  </div>
</div>
```

### Grid Layouts
Implement responsive grid systems:

```javascript
{/* Two-column layout */}
<div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
  <div className="space-y-6">
    {/* Left column */}
  </div>
  <div>
    {/* Right column */}
  </div>
</div>

{/* Card grid */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => (
    <div key={item.id} className="card">
      {/* Card content */}
    </div>
  ))}
</div>
```

### Responsive Design
Apply mobile-first responsive design:

```javascript
{/* Navigation tabs */}
<div className="flex flex-wrap sm:flex-nowrap">
  <button className="px-4 sm:px-6 py-2 text-sm sm:text-base">
    Tab Label
  </button>
</div>

{/* Content areas */}
<div className="max-w-4xl mx-auto mb-6 animate-fade-in">
  <div className="px-4 sm:px-6 lg:px-8">
    {/* Content */}
  </div>
</div>
```

## Component Patterns

### Card Components
Standardized card styling:

```javascript
<div className="card">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-semibold text-gray-900">Card Title</h3>
    <div className="flex space-x-2">
      {/* Action buttons */}
    </div>
  </div>
  <div className="space-y-4">
    {/* Card content */}
  </div>
</div>
```

### Button Variants
Consistent button styling patterns:

```javascript
{/* Primary button */}
<button className="btn-primary">
  Primary Action
</button>

{/* Secondary button */}
<button className="btn-secondary">
  Secondary Action
</button>

{/* Danger button */}
<button className="text-sm text-red-600 hover:text-red-700 font-medium">
  Delete
</button>

{/* Icon button */}
<button className="inline-flex text-gray-400 hover:text-gray-600">
  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    {/* Icon */}
  </svg>
</button>
```

### Form Elements
Standardized form styling:

```javascript
{/* Input field */}
<input 
  className={`input-field ${
    error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
  }`}
/>

{/* Textarea */}
<textarea 
  className={`input-field resize-none h-32 ${
    error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
  }`}
/>

{/* Label */}
<label className="block text-sm font-medium text-gray-700">
  Field Label
</label>

{/* Help text */}
<p className="mt-1 text-sm text-gray-500">
  Helper text goes here
</p>

{/* Error message */}
<p className="mt-1 text-sm text-red-600">
  Error message
</p>
```

## Interactive Elements

### Tab Navigation
Implement accessible tab interfaces:

```javascript
<div className="flex border-b border-gray-200 mb-4">
  {tabs.map(tab => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ${
        activeTab === tab.id
          ? 'border-primary-500 text-primary-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {tab.label}
    </button>
  ))}
</div>
```

### Dropdown Menus
Consistent dropdown styling:

```javascript
<select className="input-field">
  <option value="">Select an option</option>
  {options.map(option => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ))}
</select>
```

### Toggle Switches
Implement toggle interfaces:

```javascript
<button
  onClick={() => setIsExpanded(!isExpanded)}
  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
>
  {isExpanded ? 'Collapse' : 'Expand'}
</button>
```

## Feedback and Status

### Loading States
Provide clear loading feedback:

```javascript
{/* Inline loading */}
{isLoading ? (
  <LoadingSpinner size="sm" color="white" text="Processing..." inline />
) : (
  'Submit'
)}

{/* Full component loading */}
{isLoading ? (
  <div className="flex items-center justify-center py-12">
    <LoadingSpinner size="lg" text="Loading data..." />
  </div>
) : (
  <DataComponent data={data} />
)}

{/* Progress bar */}
<ProgressBar
  progress={progressValue}
  status={progressStatus}
  color="primary"
/>
```

### Success States
Show success feedback:

```javascript
<div className="bg-green-50 border border-green-200 rounded-lg p-3">
  <div className="flex items-center space-x-2">
    <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <span className="text-sm font-medium text-green-800">
      All requirements met! Ready to run your test.
    </span>
  </div>
</div>
```

### Error States
Display errors with helpful context:

```javascript
<div className="bg-red-50 border border-red-200 rounded-lg p-4">
  <div className="flex">
    <div className="flex-shrink-0">
      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    </div>
    <div className="ml-3 flex-1">
      <p className="text-sm text-red-800">{error}</p>
    </div>
    <div className="ml-3 flex-shrink-0">
      <button
        onClick={() => setError(null)}
        className="inline-flex text-red-400 hover:text-red-600"
      >
        <span className="sr-only">Dismiss</span>
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  </div>
</div>
```

### Warning States
Show warnings with guidance:

```javascript
<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
  <div className="flex">
    <div className="flex-shrink-0">
      <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    </div>
    <div className="ml-3 flex-1">
      <h3 className="text-sm font-medium text-yellow-800">
        Please complete the following to run your test:
      </h3>
      <div className="mt-2 text-sm text-yellow-700">
        {/* Warning details */}
      </div>
    </div>
  </div>
</div>
```

## Animation and Transitions

### Page Transitions
Use consistent animation classes:

```javascript
<div className="animate-fade-in">
  {/* Content that fades in */}
</div>

<div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
  {/* Content that slides up with delay */}
</div>
```

### Hover Effects
Apply subtle hover transitions:

```javascript
<button className="transition-colors duration-200 hover:bg-gray-100">
  Hover me
</button>

<div className="transform transition-all duration-300 hover:shadow-md">
  Card with hover effect
</div>
```

### State Transitions
Smooth state changes:

```javascript
<div 
  className={`transition-all duration-200 ${
    isExpanded ? 'h-64' : 'h-32'
  }`}
>
  Expandable content
</div>
```

## Accessibility Patterns

### Focus Management
Ensure proper focus indicators:

```javascript
<button className="focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
  Accessible button
</button>

<input className="focus:border-primary-500 focus:ring-primary-500" />
```

### Screen Reader Support
Provide screen reader context:

```javascript
<button aria-expanded={isExpanded} aria-controls="collapsible-content">
  {isExpanded ? 'Collapse' : 'Expand'}
</button>

<div id="collapsible-content" className={isExpanded ? 'block' : 'hidden'}>
  Collapsible content
</div>

<span className="sr-only">Screen reader only text</span>
```

### Semantic HTML
Use appropriate HTML elements:

```javascript
<main role="main">
  <section aria-labelledby="section-heading">
    <h2 id="section-heading">Section Title</h2>
    {/* Section content */}
  </section>
</main>

<nav aria-label="Main navigation">
  <ul role="list">
    <li><a href="#section1">Section 1</a></li>
    <li><a href="#section2">Section 2</a></li>
  </ul>
</nav>
```

## Help and Guidance

### Tooltip Pattern
Implement consistent help tooltips:

```javascript
<div className="flex items-center space-x-2">
  <label>Field Label</label>
  <HelpTooltip
    content="Helpful explanation of what this field does and how to use it effectively."
    position="right"
  />
</div>
```

### Inline Help
Provide contextual guidance:

```javascript
<div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
  <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center space-x-1">
    <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <span>Helpful Tip</span>
  </h4>
  <p className="text-xs text-blue-700">
    Detailed guidance about how to use this feature effectively.
  </p>
</div>
```

### Progress Indicators
Show user progress through multi-step processes:

```javascript
<div className="flex items-center justify-between">
  <div className="flex items-center space-x-2">
    <span className="text-sm font-medium text-blue-800">
      Progress: {completedFields} of {totalFields} requirements completed
    </span>
  </div>
  <div className="flex space-x-1">
    {fields.map((field, index) => (
      <div
        key={index}
        className={`w-2 h-2 rounded-full ${
          field.valid ? 'bg-green-400' : 'bg-gray-300'
        }`}
        title={field.valid ? 'Complete' : 'Incomplete'}
      />
    ))}
  </div>
</div>
```

## Mobile Optimization

### Touch Targets
Ensure adequate touch target sizes:

```javascript
{/* Minimum 44px touch targets */}
<button className="min-h-[44px] px-4 py-2 touch-manipulation">
  Mobile-friendly button
</button>
```

### Mobile Navigation
Implement mobile-friendly navigation:

```javascript
<div className="flex flex-wrap sm:flex-nowrap">
  <button className="flex-1 sm:flex-none px-4 py-2 text-sm sm:text-base">
    Tab 1
  </button>
  <button className="flex-1 sm:flex-none px-4 py-2 text-sm sm:text-base">
    Tab 2
  </button>
</div>
```

### Responsive Text
Scale text appropriately:

```javascript
<h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">
  Responsive Heading
</h1>

<p className="text-sm sm:text-base">
  Responsive body text
</p>
```

## Performance Considerations

### Image Optimization
Optimize images for different screen sizes:

```javascript
<img 
  src="/image-mobile.jpg"
  srcSet="/image-mobile.jpg 480w, /image-tablet.jpg 768w, /image-desktop.jpg 1200w"
  sizes="(max-width: 480px) 100vw, (max-width: 768px) 50vw, 33vw"
  alt="Descriptive alt text"
  loading="lazy"
/>
```

### CSS Optimization
Use efficient CSS patterns:

```javascript
{/* Prefer utility classes over custom CSS */}
<div className="flex items-center justify-between p-4 bg-white rounded-lg shadow-sm">
  {/* Content */}
</div>

{/* Use CSS custom properties for dynamic values */}
<div 
  style={{ 
    '--progress': `${percentage}%`,
    width: 'var(--progress)'
  }}
  className="bg-primary-500 h-2 rounded transition-all duration-300"
/>
```