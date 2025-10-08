# Implementation Plan

- [x] 1. Analyze and prepare consolidated structure





  - Compare duplicate tool handlers between `/public/scenarios/` and `/src/scenarios/` to identify the most recent versions
  - Create a mapping of files to be moved and files to be removed
  - Validate that all scenario configurations reference correct tool handlers and datasets
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 2. Create consolidated scenario directory structure





  - [x] 2.1 Move scenario configuration files from `/public/scenarios/` to `/src/scenarios/`


    - Copy `scenario.json` files to appropriate directories in `/src/scenarios/`
    - Update any internal file path references to use relative paths
    - _Requirements: 1.1, 2.1_

  - [x] 2.2 Migrate datasets to scenario-specific directories


    - Create `datasets/` directories within each scenario folder in `/src/scenarios/`
    - Move CSV and JSON dataset files to their respective scenario directories
    - Update scenario configurations to reference datasets with relative paths
    - _Requirements: 1.1, 2.2_

  - [x] 2.3 Consolidate tool handlers and remove duplicates


    - Keep tool handlers from `/src/scenarios/` (assumed to be newer versions)
    - Remove duplicate tool handlers from `/public/scenarios/`
    - Verify all tool handlers are properly referenced in scenario configurations
    - _Requirements: 1.2, 3.1_

  - [x] 2.4 Update manifest file for new structure


    - Move `manifest.json` from `/public/scenarios/` to `/src/scenarios/`
    - Update manifest entries to reflect new directory structure
    - Ensure all scenario references are accurate
    - _Requirements: 1.1, 2.1_

- [x] 3. Update service layer to use consolidated paths





  - [x] 3.1 Modify ScenarioService to load from `/src/scenarios/`


    - Replace HTTP fetch calls with direct imports for manifest and scenario files
    - Update scenario loading logic to use new file paths
    - Implement proper error handling for import failures
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Update tool handler loading mechanism


    - Modify tool execution service to load handlers from consolidated location
    - Update dynamic import paths to reference `/src/scenarios/`
    - Ensure tool handler resolution works with new structure
    - _Requirements: 2.2, 2.3_

  - [x] 3.3 Update dataset loading logic


    - Modify dataset loading to use relative paths within scenario directories
    - Update file resolution to work with new directory structure
    - Test dataset loading with various file types (CSV, JSON)
    - _Requirements: 2.3, 2.4_

- [ ] 4. Clean up old files and validate functionality





  - [x] 4.1 Remove old scenario files from `/public/scenarios/`


    - Delete scenario configuration files that have been moved
    - Remove duplicate tool handlers
    - Clean up old dataset files
    - Remove the old manifest file
    - _Requirements: 3.1, 3.2_

  - [x] 4.2 Validate consolidated structure works correctly


    - Test scenario loading with ScenarioService
    - Verify tool handler execution works with new paths
    - Confirm dataset loading functions properly
    - Test complete scenario workflow end-to-end
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 4.3 Update build configuration if needed
    - Ensure Vite includes scenario files in build output
    - Configure proper asset handling for datasets
    - Verify dynamic imports work correctly in production build
    - _Requirements: 4.1, 4.2_

- [-] 5. Update documentation and finalize structure



  - [-] 5.1 Document new scenario directory structure

    - Create clear documentation of where different file types belong
    - Document the process for adding new scenarios
    - Update any existing documentation that references old paths
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 5.2 Verify all references are updated





    - Search codebase for any remaining references to old paths
    - Update any hardcoded paths or configuration that might reference old structure
    - Ensure no broken links or missing file references remain
    - _Requirements: 2.1, 2.2, 3.3_
