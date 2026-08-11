# Scenario-Driven UI Components

This document explains how to use the dynamic UI adaptation system that was implemented for task 3 of the scenario-driven architecture.

## Overview

The dynamic UI adaptation system consists of several conditional components that show/hide based on scenario capabilities:

- **ConditionalDatasetSelector** - Shows dataset selection when scenario has datasets
- **ConditionalToolSettings** - Shows tool settings when scenario has tools
- **ConditionalSystemPromptSelector** - Shows system prompt selection when scenario has system prompts
- **ConditionalUserPromptSelector** -r prompt selection when scenario has user prompts
- **useScenarioUI** - Hook for managing UI state based on scenario configuration

## Components

### ConditionalDatasetSelector

```jsx
import ConditionalDatasetSelector from './components/ConditionalDatasetSelector'

<ConditionalDatasetSelector
  scenario={selectedScenario}
  selectedDataset={selectedDataset}
  onDatasetSelect={onDatasetSelect}
  validationError={validationErrors?.dataset}
/>
```

**Behavior:**
- Only renders when `scenario` has datasets
- Automatically hides when no datasets are available
- Shows loading state while checking scenario configuration

### ConditionalToolSettings

```jsx
import ConditionalToolSettings from './components/ConditionalToolSettings'

<ConditionalToolSettings
  scenario={selectedScenario}
  useToolsEnabled={useToolsEnabled}
  onUseToolsToggle={onUseToolsToggle}
  maxIterations={maxIterations}
  onMaxIterationsChange={onMaxIterationsChange}
  determinismEnabled={determinismEnabled}
  onDeterminismToggle={onDeterminismToggle}
  isExecuting={isExecuting}
/>
```

**Behavior:**
- Only renders when `scenario` has tools
- Adapts tool execution toggle based on whether tools have handlers
- Automatically determines if execution mode is available

### ConditionalSystemPromptSelector

```jsx
import ConditionalSystemPromptSelector from './components/ConditionalSystemPromptSelector'

<ConditionalSystemPromptSelector
  scenario={selectedScenario}
  selectedSystemPrompt={systemPrompt}
  onSystemPromptSelect={onSystemPromptSelect}
  validationError={validationErrors?.systemPrompt}
  allowCustomPrompts={true}
/>
```

**Behavior:**
- Only renders when `scenario` has system prompts
- Loads scenario-specific system prompts
- Allows fallback to custom prompts if `allowCustomPrompts` is true

### ConditionalUserPromptSelector

```jsx
import ConditionalUserPromptSelector from './components/ConditionalUserPromptSelector'

<ConditionalUserPromptSelector
  scenario={selectedScenario}
  selectedUserPrompt={userPrompt}
  onUserPromptSelect={onUserPromptSelect}
  validationError={validationErrors?.userPrompt}
  allowCustomPrompts={true}
/>
```

**Behavior:**
- Only renders when `scenario` has user prompts
- Loads scenario-specific user prompts
- Shows preview with dataset content placeholder

## useScenarioUI Hook

The `useScenarioUI` hook manages UI state based on scenario configuration:

```jsx
import { useScenarioUI } from '../hooks/useScenarioUI'

const {
  uiState,
  scenarioCapabilities,
  shouldShowComponent,
  getVisibilitySummary,
  getScenarioConfiguration,
  isLoading,
  error
} = useScenarioUI(selectedScenario)

// Check if a component should be visible
const showDatasets = shouldShowComponent('datasetSelector')
const showTools = shouldShowComponent('toolSettings')

// Get scenario configuration
const config = getScenarioConfiguration()
console.log('Allow custom prompts:', config.allowCustomPrompts)
console.log('Max iterations:', config.maxIterations)
```

## Integration Example

Here's how to integrate the conditional components into your main application:

```jsx
import { useState } from 'react'
import ScenarioSelector from './components/ScenarioSelector'
import ConditionalDatasetSelector from './components/ConditionalDatasetSelector'
import ConditionalToolSettings from './components/ConditionalToolSettings'
import ConditionalSystemPromptSelector from './components/ConditionalSystemPromptSelector'
import ConditionalUserPromptSelector from './components/ConditionalUserPromptSelector'
import PromptEditor from './components/PromptEditor'
import { useScenarioUI } from './hooks/useScenarioUI'

function App() {
  const [selectedScenario, setSelectedScenario] = useState('')
  const [selectedDataset, setSelectedDataset] = useState({ type: '', option: '', content: null })
  const [systemPrompt, setSystemPrompt] = useState('')
  const [userPrompt, setUserPrompt] = useState('')
  const [useToolsEnabled, setUseToolsEnabled] = useState(false)
  const [maxIterations, setMaxIterations] = useState(10)
  const [determinismEnabled, setDeterminismEnabled] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)

  // Get scenario UI configuration
  const { getScenarioConfiguration } = useScenarioUI(selectedScenario)
  const scenarioConfig = getScenarioConfiguration()

  return (
    <div className="space-y-6">
      {/* Always show scenario selector */}
      <ScenarioSelector
        selectedScenario={selectedScenario}
        onScenarioSelect={setSelectedScenario}
      />

      {/* Conditionally show dataset selector */}
      <ConditionalDatasetSelector
        scenario={selectedScenario}
        selectedDataset={selectedDataset}
        onDatasetSelect={setSelectedDataset}
      />

      {/* Conditionally show system prompt selector */}
      <ConditionalSystemPromptSelector
        scenario={selectedScenario}
        selectedSystemPrompt={systemPrompt}
        onSystemPromptSelect={setSystemPrompt}
        allowCustomPrompts={scenarioConfig.allowCustomPrompts}
      />

      {/* Conditionally show user prompt selector */}
      <ConditionalUserPromptSelector
        scenario={selectedScenario}
        selectedUserPrompt={userPrompt}
        onUserPromptSelect={setUserPrompt}
        allowCustomPrompts={scenarioConfig.allowCustomPrompts}
      />

      {/* Always show prompt editor for custom prompts */}
      {scenarioConfig.allowCustomPrompts && (
        <PromptEditor
          systemPrompt={systemPrompt}
          userPrompt={userPrompt}
          onSystemPromptChange={setSystemPrompt}
          onUserPromptChange={setUserPrompt}
        />
      )}

      {/* Conditionally show tool settings */}
      <ConditionalToolSettings
        scenario={selectedScenario}
        useToolsEnabled={useToolsEnabled}
        onUseToolsToggle={setUseToolsEnabled}
        maxIterations={maxIterations}
        onMaxIterationsChange={setMaxIterations}
        determinismEnabled={determinismEnabled}
        onDeterminismToggle={setDeterminismEnabled}
        isExecuting={isExecuting}
      />
    </div>
  )
}
```

## Complete Example Component

The `ScenarioDrivenUI` component demonstrates the complete integration:

```jsx
import ScenarioDrivenUI from './components/ScenarioDrivenUI'

<ScenarioDrivenUI
  selectedScenario={selectedScenario}
  onScenarioSelect={setSelectedScenario}
  selectedDataset={selectedDataset}
  onDatasetSelect={setSelectedDataset}
  systemPrompt={systemPrompt}
  userPrompt={userPrompt}
  onSystemPromptChange={setSystemPrompt}
  onUserPromptChange={setUserPrompt}
  useToolsEnabled={useToolsEnabled}
  onUseToolsToggle={setUseToolsEnabled}
  maxIterations={maxIterations}
  onMaxIterationsChange={setMaxIterations}
  determinismEnabled={determinismEnabled}
  onDeterminismToggle={setDeterminismEnabled}
  isExecuting={isExecuting}
  validationErrors={validationErrors}
/>
```

## Key Features

1. **Automatic Visibility Management**: Components automatically show/hide based on scenario capabilities
2. **Loading States**: All components show appropriate loading indicators while checking scenario configuration
3. **Error Handling**: Graceful error handling with user-friendly messages
4. **Configuration Awareness**: Components adapt their behavior based on scenario configuration
5. **Development Debugging**: Visual indicators in development mode show which components are active
6. **Fallback Support**: Graceful fallback to default behavior when no scenario is selected

## Requirements Satisfied

This implementation satisfies all requirements from task 3:

- ✅ **3.1**: ConditionalDatasetSelector shows/hides based on scenario datasets
- ✅ **3.2**: ConditionalToolSettings adapts to scenario tool configuration
- ✅ **3.3**: Conditional rendering logic for system prompt selectors
- ✅ **3.4**: Conditional rendering logic for user prompt selectors
- ✅ **3.5**: UI state management for dynamic component visibility (useScenarioUI hook)
- ✅ **3.6**: Components adapt based on scenario capabilities
- ✅ **3.7**: Dynamic show/hide UI elements based on scenario capabilities
