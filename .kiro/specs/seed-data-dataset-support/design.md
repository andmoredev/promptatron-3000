# Design Document

## Overview

This design extends the existing dataset selection system to support seed data-based datasets alongside the current file-based datasets. The shipping-logistics dataset type will serve as the first implementation of this pattern, featuring automatic seed data loading, reset capability, and dataset-specific system prompts.

## Architecture

### Dataset Type Detection

The system will detect dataset typon manifest configuration:

```javascript
// Seed data dataset (new pattern)
{
  "files": [],
  "seedData": {
    "dataFile": "seed-data.json",
    "allowReset": true
  },
  "systemPrompts": [...]
}

// File-based dataset (existing pattern)
{
  "files": ["file1.csv", "file2.json"],
  "toolConfiguration": {...}
}
```

### Component Architecture

```
DatasetSelector
├── Dataset Type Selection (unchanged)
├── Dataset Content Loading (enhanced)
│   ├── File Selection Mode (existing)
│   └── Seed Data Mode (new)
│       ├── Auto-load seed data
│       └── Reset Data button
└── Tool Configuration Display (unchanged)

PromptEditor
├── System Prompt Templates (enhanced)
│   ├── Hardcoded templates (existing)
│   └── Dataset-specific templates (new)
└── User Prompt Templates (unchanged)
```

## Components and Interfaces

### DatasetSelector Component Enhancements

#### New State Variables
```javascript
const [seedDataMode, setSeedDataMode] = useState(false)
const [isResettingData, setIsResettingData] = useState(false)
const [datasetManifest, setDatasetManifest] = useState(null)
```

#### Enhanced Dataset Loading Logic
```javascript
const handleTypeChange = async (type) => {
  // Load manifest to determine dataset mode
  const manifest = await datasetToolIntegrationService.loadDatasetManifest(type)
  setDatasetManifest(manifest)

  // Determine if this is a seed data dataset
  const isSeedDataset = manifest.seedData && manifest.seedData.dataFile
  setSeedDataMode(isSeedDataset)

  if (isSeedDataset) {
    await loadSeedData(type, manifest)
  } else {
    await loadFileBasedDataset(type, manifest)
  }
}
```

#### Seed Data Loading
```javascript
const loadSeedData = async (type, manifest) => {
  try {
    setIsLoadingOptions(true)

    // Initialize the tool service to load seed data
    const toolService = getToolServiceForDatasetType(type)
    if (toolService && typeof toolService.initialize === 'function') {
      await toolService.initialize()
    }

    // Load the seed data file for display
    const seedDataResponse = await fetch(`/datasets/${type}/${manifest.seedData.dataFile}`)
    const seedData = await seedDataResponse.json()

    onDatasetSelect({
      type: type,
      option: manifest.seedData.dataFile,
      content: JSON.stringify(seedData, null, 2)
    })

  } catch (error) {
    setError(`Failed to load seed data: ${error.message}`)
  } finally {
    setIsLoadingOptions(false)
  }
}
```

#### Reset Data Functionality
```javascript
const handleResetData = async () => {
  try {
    setIsResettingData(true)

    const toolService = getToolServiceForDatasetType(selectedDataset.type)
    if (toolService && typeof toolService.resetDemoData === 'function') {
      await toolService.resetDemoData()
    }

    // Reload the seed data for display
    await loadSeedData(selectedDataset.type, datasetManifest)

    // Show success feedback
    setSuccessMessage('Data reset successfully')
    setTimeout(() => setSuccessMessage(null), 3000)

  } catch (error) {
    setError(`Failed to reset data: ${error.message}`)
  } finally {
    setIsResettingData(false)
  }
}
```

### PromptEditor Component Enhancements

#### Dataset-Specific System Prompts Integration
```javascript
const [datasetSystemPrompts, setDatasetSystemPrompts] = useState([])

// Enhanced system prompt templates combining hardcoded and dataset-specific
const allSystemPromptTemplates = useMemo(() => {
  return [
    ...systemPromptTemplates, // Existing hardcoded templates
    ...datasetSystemPrompts   // Dataset-specific templates
  ]
}, [datasetSystemPrompts])

// Load dataset-specific prompts when dataset changes
useEffect(() => {
  if (selectedDataset?.type) {
    loadDatasetSystemPrompts(selectedDataset.type)
  } else {
    setDatasetSystemPrompts([])
  }
}, [selectedDataset?.type])
```

#### System Prompt Loading Logic
```javascript
const loadDatasetSystemPrompts = async (datasetType) => {
  try {
    const manifest = await datasetToolIntegrationService.loadDatasetManifest(datasetType)

    if (manifest.systemPrompts && Array.isArray(manifest.systemPrompts)) {
      const processedPrompts = manifest.systemPrompts.map(prompt => ({
        name: prompt.name,
        template: prompt.prompt.replace(/\\n/g, '\n'), // Convert escaped newlines
        source: 'dataset',
        datasetType: datasetType
      }))

      setDatasetSystemPrompts(processedPrompts)
    } else {
      setDatasetSystemPrompts([])
    }
  } catch (error) {
    console.error(`Failed to load system prompts for ${datasetType}:`, error)
    setDatasetSystemPrompts([])
  }
}
```

### Service Layer Integration

#### Tool Service Detection
```javascript
const getToolServiceForDatasetType = (datasetType) => {
  const serviceMap = {
    'fraud-detection': fraudToolsService,
    'shipping-logistics': shippingToolsService
  }

  return serviceMap[datasetType] || null
}
```

#### Enhanced Dataset Tool Integration Service
```javascript
// Add method to DatasetToolIntegrationService
async loadDatasetManifest(datasetType) {
  // Existing implementation enhanced to handle seedData configuration
  const manifest = await this.fetchManifest(datasetType)

  // Process seed data configuration
  if (manifest.seedData) {
    manifest.seedDataConfig = {
      enabled: true,
      dataFile: manifest.seedData.dataFile,
      allowReset: manifest.seedData.allowReset || false
    }
  }

  // Process system prompts configuration
  if (manifest.systemPrompts) {
    manifest.systemPromptsConfig = {
      enabled: true,
      prompts: manifest.systemPrompts
    }
  }

  return manifest
}
```

## Data Models

### Enhanced Dataset Object
```javascript
{
  type: string,           // Dataset type (e.g., 'shipping-logistics')
  option: string,         // File name or seed data file name
  content: string,        // JSON string content for display
  mode: 'file' | 'seed', // Dataset mode
  manifest: object        // Full manifest data
}
```

### Dataset Manifest Schema Extensions
```javascript
{
  "name": string,
  "description": string,
  "files": string[],                    // Existing - empty for seed data datasets
  "toolConfiguration": object,          // Existing
  "seedData": {                         // New
    "dataFile": string,
    "allowReset": boolean
  },
  "systemPrompts": [                    // New
    {
      "id": string,
      "name": string,
      "prompt": string
    }
  ]
}
```

### System Prompt Template Object
```javascript
{
  name: string,           // Display name
  template: string,       // Prompt content with newlines processed
  source: 'hardcoded' | 'dataset', // Source type
  datasetType?: string    // Dataset type if source is 'dataset'
}
```

## Error Handling

### Seed Data Loading Errors
- **Service Initialization Failure**: Display error with retry option
- **Seed Data File Missing**: Clear error message with fallback to empty dataset
- **Tool Service Not Found**: Graceful degradation with warning message

### Reset Operation Errors
- **Reset Method Not Available**: Display appropriate error message
- **Reset Operation Failure**: Show error with retry option, maintain current state
- **Network Errors**: Handle with retry mechanism and user feedback

### System Prompt Loading Errors
- **Manifest Loading Failure**: Fall back to hardcoded prompts only
- **Invalid Prompt Format**: Skip invalid prompts, log warnings
- **Newline Processing Errors**: Use original prompt text as fallback

## Testing Strategy

### Unit Tests
- Dataset type detection logic
- Seed data loading and reset functionality
- System prompt processing and newline conversion
- Error handling for various failure scenarios

### Integration Tests
- End-to-end dataset selection flow for seed data datasets
- Tool service integration and initialization
- System prompt loading and template selection
- Reset functionality with actual tool services

### Manual Testing Scenarios
1. **Seed Data Dataset Selection**
   - Select shipping-logistics dataset type
   - Verify automatic seed data loading
   - Confirm tool configuration display

2. **Data Reset Functionality**
   - Perform model test with shipping-logistics dataset
   - Click reset data button
   - Verify data returns to original state

3. **System Prompt Integration**
   - Select shipping-logistics dataset
   - Verify "Triage Agent" prompt appears in system prompt selector
   - Confirm newlines are properly formatted
   - Test prompt selection and application

4. **Mixed Dataset Type Handling**
   - Switch between file-based (fraud-detection) and seed data (shipping-logistics) datasets
   - Verify UI adapts appropriately
   - Confirm system prompts update correctly

5. **Error Scenarios**
   - Test with missing seed data files
   - Test reset functionality when tool service is unavailable
   - Test system prompt loading with malformed manifest

## Implementation Notes

### Backward Compatibility
- All existing file-based datasets continue to work unchanged
- No breaking changes to existing APIs or component interfaces
- Graceful fallback when new features are not available

### Performance Considerations
- Seed data loading is performed once per dataset selection
- System prompts are cached per dataset type
- Reset operations are optimized to only clear necessary data

### User Experience
- Loading states provide clear feedback during operations
- Error messages are actionable and user-friendly
- Success feedback confirms operations completed successfully
- UI adapts seamlessly between dataset modes
