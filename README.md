# Promptatron 3000

A comprehensive React-based test harness for experimenting with AWS Bedrock foundation models. Build enterprise-grade AI agents with advanced testing, tool integration, determinism evaluation, and comprehensive analysis capabilities.

## 🚀 Key Features

### Core Testing & Analysis
- **Model Selection**: Choose from all available AWS Bedrock foundation models (Claude, Nova, Llama, etc.)
- **Dual Prompt System**: Separate system and user prompts for better AI control
- **Dataset Management**: Load and test with datasets organized by use case with automatic discovery
- **Real-time Streaming**: Stream responses with live progress indicators and performance metrics
- **Results Analysis**: View formatted responses with metadata, token usage, and performance metrics
- **Test History**: Complete audit trail with search, filtering, and comparison capabilities
- **Side-by-Side Comparison**: Compare results from different model configurations

### Advanced AI Capabilities
- **Tool Integration**: AI models can use tools (e.g., freeze accounts in fraud detection scenarios)
- **Tool Usage Visualization**: Real-time display of tool calls and results during streaming
- **Determinism Evaluation**: Run multiple tests to measure response consistency and reliability
- **Performance Monitoring**: Track streaming performance, token rates, and latency metrics
- **Grading System**: Automated evaluation of AI responses with customizable criteria

### User Experience
- **Professional UI**: Modern, responsive design with nature-inspired green theme
- **Form State Persistence**: Automatically saves and restores your work across sessions
- **Keyboard Shortcuts**: Efficient navigation and testing workflows
- **Error Handling**: Comprehensive error handling with retry mechanisms and graceful degradation
- **Browser Compatibility**: Works across modern browsers with compatibility checks
- **Debug Tools**: Built-in debugging capabilities for development and troubleshooting

## Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with appropriate credentials
- Access to AWS Bedrock foundation models

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser** to `http://localhost:3000`

## 📁 Project Structure

```
promptatron-3000/
├── src/
│   ├── components/          # React UI components
│   │   ├── ModelSelector.jsx       # AWS Bedrock model selection
│   │   ├── DatasetSelector.jsx     # Dataset selection with tool integration
│   │   ├── PromptEditor.jsx        # Dual prompt system (system + user)
│   │   ├── TestResults.jsx         # Results display with tool usage
│   │   ├── History.jsx             # Test history with search/filter
│   │   ├── Comparison.jsx          # Side-by-side result comparison
│   │   ├── ToolUsageDisplay.jsx    # Real-time tool usage visualization
│   │   ├── StreamingPerformanceMonitor.jsx  # Performance metrics
│   │   ├── LoadingSpinner.jsx      # Loading states
│   │   ├── ProgressBar.jsx         # Progress indicators
│   │   └── RobotGraphic/           # Animated robot mascot
│   ├── services/            # Business logic & API services
│   │   ├── bedrockService.js       # AWS Bedrock integration
│   │   ├── toolConfigService.js    # Tool configuration management
│   │   ├── datasetToolIntegrationService.js  # Dataset-tool integration
│   │   ├── determinismService.js   # Determinism evaluation
│   │   ├── graderService.js        # Response grading system
│   │   └── determinismStorageService.js  # Determinism data storage
│   ├── hooks/               # Custom React hooks
│   │   └── useHistory.js           # Test history management
│   ├── utils/               # Utility functions & helpers
│   │   ├── formValidation.js       # Form validation logic
│   │   ├── errorHandling.js        # Error handling utilities
│   │   ├── toolErrorHandling.js    # Tool-specific error handling
│   │   └── formStateStorage.js     # Form state persistence
│   ├── App.jsx             # Main application component
│   ├── main.jsx            # React entry point
│   └── index.css           # Global styles & Tailwind
├── public/                     # Static assets
├── src/
│   ├── scenarios/          # Consolidated scenario files with datasets organized by use case
│   │   ├── manifest.json           # Global scenario registry
│   │   ├── fraud-detection/        # Example scenario
│   │   │   ├── scenario.json       # Scenario configuration
│   │   │   ├── datasets/           # Dataset files
│   │   │   │   ├── international.csv
│   │   │   │   ├── mixed.csv
│   │   │   │   ├── retail-transactions.csv
│   │   │   │   └── retail.csv
│   │   │   └── tools/              # Tool handlers
│   │   │       ├── flagTransaction.js
│   │   │       ├── freezeAccount.js
│   │   │       ├── generateReport.js
│   │   │       ├── handlerUtils.js
│   │   │       └── noActionRequired.js
│   │   └── shipping-logistics/     # Another scenario
│   │       ├── scenario.json
│   │       ├── seed-data.json
│   │       └── tools/
│   │           ├── carrierStatus.js
│   │           ├── customerTier.js
│   │           └── [other-tools].js
├── .kiro/                  # Kiro IDE configuration
│   ├── steering/           # AI assistant guidance
│   └── specs/              # Feature specifications
└── [config files]         # Build & tool configuration
```

## 📊 Dataset & Tool Integration

Datasets are organized in the `src/scenarios/` directory by use case, with integrated tool configurations that enable AI models to take actions during analysis. This consolidated structure provides better organization and build system integration.

### Directory Structure
```
src/scenarios/
├── manifest.json           # Global scenario registry
├── [scenario-name]/        # Scenario folder (e.g., "fraud-detection")
│   ├── scenario.json       # Scenario configuration & tool settings
│   ├── datasets/           # Dataset files directory
│   │   ├── dataset1.csv    # Dataset files (CSV/JSON format)
│   │   ├── dataset2.csv
│   │   └── dataset3.csv
│   └── tools/              # Tool handler files
│       ├── tool1.js        # JavaScript tool handlers
│       ├── tool2.js
│       └── utils.js
└── [another-scenario]/
    ├── scenario.json
    ├── datasets/
    │   ├── option1.csv
    │   └── option2.csv
    └── tools/
        └── handlers.js
```

For detailed information about the scenario structure, see [SCENARIO_STRUCTURE.md](SCENARIO_STRUCTURE.md).

### Tool Integration

The application supports AI models using tools during analysis. For example, in fraud detection scenarios, models can:
- Freeze suspicious accounts
- Flag transactions for review
- Generate investigation reports

#### Tool Configuration Example
```json
{
  "toolConfiguration": {
    "enabled": true,
    "datasetType": "fraud-detection",
    "tools": [
      {
        "toolSpec": {
          "name": "freeze_account",
          "description": "Put a freeze on a specific account and mark why it was frozen",
          "inputSchema": {
            "json": {
              "type": "object",
              "properties": {
                "account_id": {
                  "type": "string",
                  "description": "The account ID to freeze"
                },
                "transaction_ids": {
                  "type": "array",
                  "items": { "type": "string" },
                  "description": "Array of transaction IDs that led to this decision"
                },
                "reason": {
                  "type": "string",
                  "description": "Detailed reason for freezing the account"
                }
              },
              "required": ["account_id", "transaction_ids", "reason"]
            }
          }
        }
      }
    ]
  }
}

```

### Adding Your Own Scenarios

1. **Create a scenario folder** in `src/scenarios/`:
   ```bash
   mkdir src/scenarios/my-scenario
   mkdir src/scenarios/my-scenario/datasets
   mkdir src/scenarios/my-scenario/tools
   ```

2. **Add dataset files**:
   ```bash
   # Example: Customer support tickets
   cp my-tickets.csv src/scenarios/my-scenario/datasets/tickets-2024.csv
   ```

3. **Create scenario.json** for the scenario:
   ```json
   {
     "id": "customer-support",
     "name": "Customer Support Analysis",
     "description": "Customer support ticket analysis datasets",
     "datasets": [
       {
         "id": "tickets-2024",
         "name": "2024 Support Tickets",
         "description": "Customer support tickets from 2024",
         "file": "datasets/tickets-2024.csv"
       }
     ],
     "tools": [
       {
         "name": "escalateTicket",
         "description": "Escalate a support ticket to management",
         "handler": "tools/ticketTools.escalateTicket",
         "inputSchema": {
           "type": "object",
           "properties": {
             "ticket_id": { "type": "string" },
             "priority": { "type": "string", "enum": ["high", "urgent", "critical"] },
             "reason": { "type": "string" }
           },
           "required": ["ticket_id", "priority", "reason"]
         }
       }
     ],
     "systemPrompts": [
       "You are a customer support analyst..."
     ],
     "userPrompts": [
       "Analyze the following support tickets..."
     ],
     "configuration": {
       "toolsEnabled": true,
       "streamingEnabled": true
     }
   }
   ```

4. **Create tool handlers**:
   ```javascript
   // src/scenarios/customer-support/tools/ticketTools.js
   export const escalateTicket = async (params) => {
     const { ticket_id, priority, reason } = params;
     return {
       success: true,
       message: `Ticket ${ticket_id} escalated with ${priority} priority: ${reason}`,
       data: { ticket_id, priority, reason, escalated_at: new Date().toISOString() }
     };
   };
   ```

5. **Update global manifest** (`src/scenarios/manifest.json`):
   ```json
   {
     "version": "1.0.0",
     "scenarios": [
       {
         "id": "fraud-detection",
         "folder": "fraud-detection",
         "configFile": "scenario.json",
         "enabled": true
       },
       {
         "id": "customer-support",
         "folder": "customer-support",
         "configFile": "scenario.json",
         "enabled": true
       }
     ]
   }
   ```

For detailed instructions, see [SCENARIO_STRUCTURE.md](SCENARIO_STRUCTURE.md).

### Supported File Formats
- **CSV**: Comma-separated values (recommended)
- **JSON**: Structured data (for complex datasets)

### Best Practices
- Keep individual files under 10MB for optimal browser performance
- Use descriptive folder and file names
- Include column headers in CSV files
- Test with small datasets first before adding large ones

## 🎯 Usage Guide

### Basic Workflow

1. **Select a Model**: Choose from available AWS Bedrock foundation models
2. **Choose a Dataset**: Select a use case and specific dataset (tool integration shown automatically)
3. **Configure Prompts**: Create system and user prompts using the dual prompt editor
4. **Configure Options**: Enable/disable streaming, determinism evaluation
5. **Run Test**: Execute the test and view real-time results
6. **Analyze Results**: Review responses, tool usage, and performance metrics
7. **Compare & Iterate**: Use history and comparison features to refine your approach

### Interface Overview

#### Main Testing Interface
- **Model Selector**: Dropdown with all available Bedrock models and status indicators
- **Dataset Selector**: Two-level selection with tool configuration display
- **Dual Prompt Editor**: Separate system and user prompt fields with validation
- **Advanced Options**: Streaming mode, determinism evaluation toggles
- **Test Button**: Executes test with real-time progress indicators
- **Results Panel**: Formatted responses with tool usage visualization

#### Streaming Mode
- **Real-time Response**: Watch AI responses generate token by token
- **Performance Metrics**: Live tracking of tokens/second, latency, and progress
- **Tool Usage Display**: Real-time visualization of tool calls and results
- **Progress Indicators**: Visual feedback for long-running operations

#### Tool Integration
- **Tool Configuration Status**: Shows available tools for each dataset type
- **Tool Usage Visualization**: Real-time display of tool calls during streaming
- **Tool Results**: Formatted display of tool inputs, outputs, and status
- **Error Handling**: Graceful handling of tool failures with fallback options

#### Determinism Evaluation
- **Multiple Test Runs**: Automatically run the same prompt multiple times
- **Consistency Analysis**: Measure response variation and reliability
- **Statistical Metrics**: Calculate consistency scores and variation patterns
- **Comparison Views**: Side-by-side analysis of determinism results

#### History & Analysis
- **Comprehensive History**: All tests with metadata, tool usage, and performance data
- **Advanced Search**: Filter by model, dataset, prompts, tool usage, or date ranges
- **Comparison Tools**: Select multiple tests for detailed side-by-side analysis
- **Export Capabilities**: Save results and comparisons for external analysis

#### Grading System
- **Automated Evaluation**: Built-in grading of AI responses
- **Custom Criteria**: Configurable evaluation metrics
- **Scoring Visualization**: Clear display of grades and feedback
- **Historical Tracking**: Track performance improvements over time

### Keyboard Shortcuts

- **Ctrl/Cmd + Enter**: Run current test
- **Ctrl/Cmd + H**: Switch to History tab
- **Ctrl/Cmd + T**: Switch to Test tab
- **Ctrl/Cmd + C**: Switch to Comparison tab (when available)
- **Escape**: Clear current selection or close modals

### Advanced Features

#### Determinism Evaluation
Enable determinism evaluation to run multiple tests with identical prompts and measure response consistency:

1. Toggle "Determinism Evaluation" in advanced options
2. Configure number of test runs (default: 3)
3. Run test to execute multiple iterations automatically
4. Review consistency metrics and variation analysis
5. Use results to understand model reliability for your use case

#### Tool Integration Best Practices
1. **Review Tool Configuration**: Check the tool status indicator for each dataset
2. **Monitor Tool Usage**: Watch real-time tool calls during streaming
3. **Handle Tool Errors**: Review tool error messages and adjust prompts accordingly
4. **Validate Tool Results**: Verify that tool calls produce expected outcomes

#### Performance Optimization
1. **Use Streaming Mode**: Enable streaming for better user experience with long responses
2. **Monitor Performance**: Track tokens/second and latency metrics
3. **Optimize Prompts**: Use performance data to refine prompt efficiency
4. **Batch Testing**: Use determinism evaluation for comprehensive testing

### Tips for Effective Testing

1. **Dual Prompt Strategy**: Use system prompts to define AI behavior, user prompts for specific tasks
2. **Tool-Aware Prompting**: When tools are available, explicitly mention available actions in prompts
3. **Iterative Refinement**: Use history and comparison features to refine prompt effectiveness
4. **Performance Monitoring**: Track streaming performance to optimize for your use cases
5. **Determinism Testing**: Use determinism evaluation for critical applications requiring consistency
6. **Error Analysis**: Review tool usage and error patterns to improve reliability

## 🛠️ Development

### Available Scripts

- **Development server**: `npm run dev` (starts on port 3000, auto-opens browser)
- **Local AWS setup + dev**: `npm run dev:local` (runs setup script then starts dev server)
- **Build for production**: `npm run build`
- **Preview production build**: `npm run preview`
- **AWS credential setup**: `npm run setup-local` (extracts SSO credentials)

### Development Features

#### Hot Reloading
- **Component Updates**: Instant updates for React components
- **Tool Configuration**: Hot reload of tool configurations in development
- **Dataset Changes**: Automatic detection of new datasets and manifests
- **Style Updates**: Live CSS updates with Tailwind

#### Debug Tools
In development mode, the following debug tools are available in the browser console:

```javascript
// Debug tool configuration for a dataset type
window.debugToolConfig('fraud-detection')

// Manually reload tool configuration
window.reloadToolConfig('fraud-detection')

// Check service status
window.bedrockService?.getStatus()
```

#### Development Environment Variables
```bash
# .env.local (created by local-setup.sh)
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=your_key
VITE_AWS_SECRET_ACCESS_KEY=your_secret
VITE_AWS_SESSION_TOKEN=your_token

# Optional development flags
VITE_USE_MOCK_SERVICES=false
VITE_DEBUG_MODE=true
```

## AWS Configuration

### Quick Setup (Recommended)

**Using the local-setup.sh script (Best for SSO users):**
```bash
# Run the setup script to configure SSO credentials
./local-setup.sh

# Then start the development server
npm run dev

# Or do both in one command
npm run dev:local
```

**Manual Setup:**
```bash
# Create .env.local file with your credentials
echo "VITE_AWS_REGION=us-east-1" > .env.local
echo "VITE_AWS_ACCESS_KEY_ID=your_key" >> .env.local
echo "VITE_AWS_SECRET_ACCESS_KEY=your_secret" >> .env.local
echo "VITE_AWS_SESSION_TOKEN=your_token" >> .env.local  # if using temporary credentials
```

### How it Works

1. **local-setup.sh** extracts credentials from your AWS SSO session
2. Sets both terminal environment variables (`AWS_*`) and creates `.env.local` with Vite variables (`VITE_AWS_*`)
3. The React app reads the `VITE_AWS_*` variables from `.env.local` to authenticate with Bedrock
4. Credentials are temporary and will expire with your SSO session

**Note**: After running `./local-setup.sh`, you should see a `.env.local` file created in your project root with your credentials.

### Required AWS Permissions

Your AWS credentials need:
- `bedrock:ListFoundationModels`
- `bedrock:InvokeModel`

### AWS Troubleshooting

**Check if credentials are loaded:**
```bash
# After running local-setup.sh, verify the .env.local file exists
ls -la .env.local

# Check the contents (be careful - contains sensitive data)
head .env.local

# Test AWS connectivity
aws bedrock list-foundation-models --region us-east-1
```

**Common AWS issues:**
- **No .env.local file**: Make sure `./local-setup.sh` runs without errors
- **Access denied**: Ensure your AWS account has Bedrock enabled and proper permissions
- **Region issues**: Bedrock is available in limited regions (us-east-1, us-west-2, etc.)
- **Credentials expired**: Re-run `./local-setup.sh` to refresh SSO credentials
- **Model access**: Some models require explicit access requests in AWS console

**Tool Configuration Issues:**
```bash
# Check tool configuration status in browser console
window.debugToolConfig('fraud-detection')

# Manually reload tool configuration
window.reloadToolConfig('fraud-detection')

# Verify scenario structure
cat src/scenarios/fraud-detection/scenario.json
```

## 🔧 Troubleshooting

### Application Issues

**Application Won't Start:**
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version (requires 18+)
node --version

# Try different port if 3000 is occupied
npm run dev -- --port 3001
```

**Tool Configuration Problems:**
- Check browser console for tool loading errors
- Verify manifest.json files are valid JSON
- Use debug tools: `window.debugToolConfig('dataset-type')`
- Ensure tool configurations follow the correct schema

**Streaming Issues:**
- Check network connectivity to AWS Bedrock
- Verify streaming is enabled in advanced options
- Monitor browser console for WebSocket or streaming errors
- Try disabling streaming mode if issues persist

**Performance Issues:**
- Large datasets may cause browser slowdown
- Enable streaming mode for better responsiveness
- Monitor performance metrics in the streaming display
- Consider splitting large datasets into smaller files
- Clear browser cache and localStorage if needed

### Dataset & Tool Issues

**Dataset Loading Problems:**
- Ensure datasets are in `src/scenarios/` directory structure
- Check CSV/JSON file format and UTF-8 encoding
- Verify scenario.json files exist and are valid
- Check browser console for specific error messages
- Ensure all file paths in scenario.json are relative and correct

**Tool Integration Issues:**
- Verify tool configuration in dataset manifest
- Check tool schema validation in browser console
- Use `window.reloadToolConfig('dataset-type')` to force reload
- Review tool error messages in the results display
- Ensure tool definitions follow AWS Bedrock tool schema

### Data Persistence Issues

**Form State Not Saving:**
- Check browser localStorage permissions
- Clear localStorage if corrupted: `localStorage.clear()`
- Verify form state persistence in browser dev tools
- Check for JavaScript errors preventing saves

**History Not Loading:**
- Check browser IndexedDB permissions and storage
- Clear browser data if history is corrupted
- Verify history service initialization in console
- Check for quota exceeded errors in browser storage

## ❓ FAQ

### General Usage

**Q: Which AWS regions support Bedrock?**
A: Bedrock is available in us-east-1, us-west-2, eu-west-1, ap-southeast-2, and other select regions. Check the AWS Bedrock documentation for the latest list.

**Q: How do I add new models?**
A: The application automatically discovers available models from your AWS account. No manual configuration needed. Some models may require access requests in the AWS console.

**Q: Is my data sent anywhere besides AWS Bedrock?**
A: No, all data processing happens locally in your browser. Only prompt/dataset combinations are sent to AWS Bedrock for inference. Tool configurations and test history are stored locally.

**Q: Can I export my test history?**
A: Test history is stored locally in your browser's IndexedDB. You can access it through the History tab and manually copy results. Future versions may include export functionality.

### Tool Integration

**Q: How do I enable tools for my datasets?**
A: Add a `toolConfiguration` section to your dataset's manifest.json file with `"enabled": true` and define your tools following the AWS Bedrock tool schema.

**Q: What types of tools are supported?**
A: Any tool that follows the AWS Bedrock tool specification. Examples include account management, data analysis, report generation, and external API calls.

**Q: Can I see what tools the AI is using?**
A: Yes! Enable streaming mode to see real-time tool usage, or check the tool usage section in the results display after completion.

**Q: What happens if a tool fails?**
A: The application handles tool failures gracefully, showing error messages and allowing the AI to continue with available information.

### Advanced Features

**Q: What is determinism evaluation?**
A: It runs the same prompt multiple times to measure response consistency. This helps evaluate model reliability for production use cases.

**Q: How does streaming mode work?**
A: Streaming mode shows AI responses as they're generated token by token, with real-time performance metrics and tool usage visualization.

**Q: Can I use this with different AWS profiles?**
A: Yes, the local-setup.sh script respects your AWS CLI profile configuration. Use `aws configure set profile your-profile` before running the setup.

**Q: What file formats are supported for datasets?**
A: CSV and JSON formats are supported. CSV is recommended for tabular data, JSON for structured or nested data.

### Technical Details

**Q: How is form state preserved?**
A: The application automatically saves your model selection, prompts, and settings to browser localStorage and restores them when you return.

**Q: Can I run this in production?**
A: Yes, but ensure proper AWS IAM permissions, consider using AWS Cognito for authentication, and review the security implications of client-side AWS credentials.

**Q: How do I contribute or report issues?**
A: This is a development tool. Check the project repository for contribution guidelines and issue reporting procedures.

## 🏗️ Technology Stack

### Core Technologies
- **React 19**: Latest React with concurrent rendering and modern features
- **Vite**: Fast build tool with HMR and optimized development experience
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **AWS SDK v3**: Modern JavaScript SDK for Bedrock integration

### Key Dependencies
- **AWS Bedrock Runtime**: Model invocation and streaming capabilities
- **AWS Bedrock Management**: Model discovery and configuration
- **React Markdown**: Formatted response rendering with syntax highlighting
- **IndexedDB**: Local storage for test history and persistence

### Architecture Patterns
- **Service Layer**: Singleton services for AWS, tool configuration, and data management
- **Custom Hooks**: Reusable state logic for history, forms, and data fetching
- **Component Composition**: Modular, reusable UI components with clear responsibilities
- **Error Boundaries**: Graceful error handling and recovery mechanisms

### Development Tools
- **Hot Module Replacement**: Instant updates during development
- **Tool Configuration Hot Reload**: Dynamic tool configuration updates
- **Debug Console Tools**: Built-in debugging capabilities
- **Performance Monitoring**: Real-time metrics and performance tracking

### Browser Compatibility
- **Modern Browsers**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **ES2020+ Features**: Modern JavaScript with proper polyfills
- **WebSocket Support**: Required for streaming functionality
- **IndexedDB Support**: Required for local data persistence

## 🚀 Getting Started

Ready to build enterprise-grade AI agents? Follow the Quick Start guide above and explore the comprehensive feature set. The application includes built-in help, debug tools, and comprehensive error handling to guide you through advanced AI testing and tool integration scenarios.

For questions, issues, or contributions, check the project documentation and development guidelines.
