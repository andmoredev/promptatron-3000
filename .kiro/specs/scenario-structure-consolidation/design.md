# Design Document

## Overview

This design consolidates the fragmented scenario structure by moving all scenario-related files to a single location within the `/src` directory, following established project patterns. The consolidation will eliminate duplicate files, update service references, and create a clear, maintainable structure for scenario management.

## Architecture

### Current State Analysis

**Problems Identified:**
- Scenario configurations in `/public/scenarios/` but tool handlers moved to `/src/scenarios/`
- Duplicate tool handlers in both locations
- ScenarioService looking for files in `/public/scenarios/` via HTTP fetch
- Inconsistent file organization and discovery patterns
- Orphaned files and unclear maintenance responsibilities

**File Distribution:**
- `/public/scenarios/`: Configuration files, datasets, some tool handlers, manifest
- `/src/scenarios/`: Some tool handlers (newer versions)
- Services expect files in `/public/scenarios/` via HTTP requests

### Target Architecture

**Consolidated Structure:**
```
src/
├── scenarios/
│   ├── manifest.json                    # Scenario registry
│   ├── fraud-detection/
│   │   ├── scenario.json               # Configuration
│   │   ├── datasets/                   # Data files
│   │   │   ├── retail-transactions.csv
│   │   │   ├── international.csv
│   │   │   └── ...
│   │   └── tools/                      # Tool handlers
│   │       ├── freezeAccount.js
│   │       ├── flagTransaction.js
│   │       └── ...
│   ├── shipping-logistics/
│   │   ├── scenario.json
│   │   ├── seed-data.json
│   │   └── tools/
│   │       ├── carrierStatus.js
│   │       ├── holdForPickup.js
│   │       └── ...
│   └── [other-scenarios]/
```

**Design Principles:**
1. **Single Source of Truth**: All scenario files in one location
2. **Consistent with Project Structure**: Follows `/src` organization pattern
3. **Service Integration**: Update services to use consolidated paths
4. **Build System Compatibility**: Ensure Vite can serve scenario files
5. **Clear Separation**: Configuration, data, and code clearly organized

## Components and Interfaces

### File Organization

**Scenario Directory Structure:**
- `scenario.json`: Main configuration file
- `datasets/`: Data files (CSV, JSON) for the scenario
- `tools/`: JavaScript tool handler files
- `seed-data.json`: Optional seed data for tools
- `README.md`: Optional documentation

**Manifest File:**
- Central registry of all available scenarios
- Metadata for discovery and loading
- Version information and dependencies

### Service Layer Updates

**ScenarioService Changes:**
```javascript
// Current: HTTP fetch from /public/scenarios/
const response = await fetch('/scenarios/manifest.json')

// New: Import from consolidated location
import manifestData from '../scenarios/manifest.json'
import { loadScenarioConfig } from '../scenarios/loader.js'
```

**Tool Loading Updates:**
```javascript
// Current: Dynamic HTTP loading
const response = await fetch(`/scenarios/${scenarioPath}/tools/${toolFile}`)

// New: Dynamic import from src
const toolModule = await import(`../scenarios/${scenarioId}/tools/${toolName}.js`)
```

### Build System Integration

**Vite Configuration:**
- Ensure scenario files are included in build
- Configure proper asset handling for datasets
- Set up dynamic import support for tool handlers

**Asset Handling:**
- JSON files: Direct import support
- CSV files: Treated as static assets
- JS files: Standard module loading

## Data Models

### Scenario Configuration Schema

```javascript
{
  "id": "scenario-id",
  "name": "Display Name",
  "description": "Scenario description",
  "datasets": [
    {
      "id": "dataset-id",
      "name": "Dataset Name",
      "description": "Dataset description",
      "file": "datasets/filename.csv"  // Relative to scenario directory
    }
  ],
  "tools": [
    {
      "name": "toolName",
      "description": "Tool description",
      "handler": "tools/toolFile.handlerFunction",  // Relative path
      "inputSchema": { /* JSON Schema */ }
    }
  ],
  "systemPrompts": [ /* ... */ ],
  "userPrompts": [ /* ... */ ],
  "configuration": { /* ... */ }
}
```

### Manifest Schema

```javascript
{
  "version": "1.0.0",
  "scenarios": [
    {
      "id": "scenario-id",
      "folder": "scenario-folder",
      "configFile": "scenario.json",
      "enabled": true
    }
  ],
  "metadata": {
    "manifestVersion": "1.0.0",
    "lastUpdated": "ISO-8601-timestamp",
    "totalScenarios": 0
  }
}
```

### Tool Handler Interface

```javascript
// Standard tool handler export
export const handlerFunction = async (params) => {
  // Tool implementation
  return {
    success: true,
    data: result,
    message: "Operation completed"
  }
}

// Multiple handlers per file
export const handler1 = async (params) => { /* ... */ }
export const handler2 = async (params) => { /* ... */ }
```

## Error Handling

### Migration Error Recovery

**File Conflict Resolution:**
- Compare duplicate files and keep the most recent version
- Log conflicts for manual review
- Provide rollback mechanism if issues occur

**Service Adaptation:**
- Graceful fallback if old paths are referenced
- Clear error messages for missing files
- Validation of new file structure

**Build Integration:**
- Ensure all scenario files are properly included
- Validate tool handler imports work correctly
- Test dataset loading from new locations

### Runtime Error Handling

**Scenario Loading:**
- Validate scenario configuration on load
- Handle missing tool handlers gracefully
- Provide clear error messages for configuration issues

**Tool Execution:**
- Maintain existing tool error handling patterns
- Ensure tool imports work with new paths
- Handle dynamic import failures

## Implementation Phases

### Phase 1: Structure Preparation
1. Create consolidated directory structure in `/src/scenarios/`
2. Update manifest format for new structure
3. Prepare service interfaces for new paths

### Phase 2: File Migration
1. Copy scenario configurations to new locations
2. Migrate datasets to scenario-specific directories
3. Consolidate tool handlers (keep most recent versions)
4. Update internal file references

### Phase 3: Service Updates
1. Update ScenarioService to use new paths
2. Modify tool loading mechanisms
3. Update dataset loading logic
4. Test service functionality

### Phase 4: Cleanup and Validation
1. Remove old files from `/public/scenarios/`
2. Validate all functionality works
3. Update any remaining references
4. Document new structure

## Migration Strategy

### File Consolidation Process

**Tool Handler Deduplication:**
1. Compare files in both locations
2. Use file modification dates and content analysis
3. Keep the version from `/src/scenarios/` (assumed newer)
4. Log any significant differences for review

**Dataset Organization:**
1. Move datasets to scenario-specific directories
2. Update scenario configurations with new paths
3. Ensure relative path references work correctly

**Configuration Updates:**
1. Update tool handler paths to use relative references
2. Modify dataset file paths to be relative to scenario
3. Ensure all internal references are consistent

### Service Migration

**ScenarioService Updates:**
```javascript
// Replace HTTP-based loading with direct imports
async loadScenarios() {
  // Import manifest directly
  const manifest = await import('../scenarios/manifest.json')

  // Load scenario configurations
  for (const scenario of manifest.scenarios) {
    const config = await import(`../scenarios/${scenario.folder}/scenario.json`)
    // Process scenario...
  }
}
```

**Tool Loading Updates:**
```javascript
// Update tool handler loading
async loadToolHandler(scenarioId, toolName, handlerName) {
  const toolModule = await import(`../scenarios/${scenarioId}/tools/${toolName}.js`)
  return toolModule[handlerName]
}
```

### Build System Updates

**Vite Configuration:**
- Ensure JSON files can be imported
- Configure asset handling for CSV files
- Set up proper module resolution for dynamic imports

**Asset Pipeline:**
- Include scenario files in build output
- Ensure datasets are accessible as static assets
- Maintain tool handler module loading capability
