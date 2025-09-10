# Bedrock LLM Analyzer

A React-based test harness for experimenting with AWS Bedrock foundation models. Test different models with various prompts and datasets, compare results, and maintain a complete history of experiments.

## Features

- **Model Selection**: Choose from available AWS Bedrock foundation models
- **Dataset Management**: Load and test with different datasets organized by use case
- **Prompt Engineering**: Create and test custom prompts with template support
- **Results Analysis**: View formatted responses with metadata and performance metrics
- **Test History**: Track all experiments with search and filtering capabilities
- **Side-by-Side Comparison**: Compare results from different tests
- **Responsive Design**: Modern, professional UI built with Tailwind CSS
- **Error Handling**: Comprehensive error handling with retry mechanisms
- **Browser Compatibility**: Works across modern browsers with compatibility checks

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

## Project Structure

```
bedrock-llm-analyzer/
├── src/
│   ├── components/          # React components
│   │   ├── ModelSelector.jsx
│   │   ├── DatasetSelector.jsx
│   │   ├── PromptEditor.jsx
│   │   ├── TestResults.jsx
│   │   └── History.jsx
│   ├── App.jsx             # Main application component
│   ├── main.jsx            # React entry point
│   └── index.css           # Tailwind CSS styles
├── datasets/               # Dataset files organized by use case
│   └── enterprise-fraud/
│       ├── international.csv
│       ├── mixed.csv
│       └── retail.csv
└── public/                 # Static assets
```

## Dataset Structure

Datasets are organized in the `public/datasets/` directory by use case. The application automatically discovers dataset types and options from this folder structure.

### Directory Structure
```
public/datasets/
├── manifest.json           # Optional: Global dataset metadata
├── [use-case-name]/        # Use case folder (e.g., "enterprise-fraud")
│   ├── manifest.json       # Optional: Use case metadata
│   ├── dataset1.csv        # Dataset files (CSV format)
│   ├── dataset2.csv
│   └── dataset3.csv
└── [another-use-case]/
    ├── option1.csv
    └── option2.csv
```

### Adding Your Own Datasets

1. **Create a use case folder** in `public/datasets/`:
   ```bash
   mkdir public/datasets/my-use-case
   ```

2. **Add CSV files** with your data:
   ```bash
   # Example: Customer support tickets
   mkdir public/datasets/customer-support
   # Add your CSV files
   cp my-tickets.csv public/datasets/customer-support/
   ```

3. **CSV Format Requirements**:
   - First row should contain column headers
   - Data should be properly escaped for CSV format
   - UTF-8 encoding recommended
   - File size should be reasonable for browser processing

4. **Optional: Add metadata** with a `manifest.json` file:
   ```json
   {
     "name": "Customer Support Analysis",
     "description": "Customer support ticket analysis datasets",
     "version": "1.0",
     "datasets": {
       "tickets-2024.csv": {
         "name": "2024 Support Tickets",
         "description": "Customer support tickets from 2024",
         "rows": 1500,
         "columns": ["ticket_id", "category", "description", "priority"]
       }
     }
   }
   ```

### Supported File Formats
- **CSV**: Comma-separated values (recommended)
- **JSON**: Structured data (for complex datasets)

### Best Practices
- Keep individual files under 10MB for optimal browser performance
- Use descriptive folder and file names
- Include column headers in CSV files
- Test with small datasets first before adding large ones

## Usage Guide

### Basic Workflow

1. **Select a Model**: Choose from available AWS Bedrock foundation models
2. **Choose a Dataset**: Select a use case and specific dataset
3. **Write a Prompt**: Create your prompt in the editor
4. **Run Test**: Execute the test and view results
5. **Review History**: Access previous tests and compare results

### Interface Overview

#### Main Testing Interface
- **Model Selector**: Dropdown with available Bedrock models
- **Dataset Selector**: Two-level selection (use case → specific dataset)
- **Prompt Editor**: Multi-line text editor with validation
- **Test Button**: Executes the test with current configuration
- **Results Panel**: Displays formatted LLM responses

#### History Tab
- **Test History**: Chronological list of all tests
- **Search & Filter**: Find specific tests by model, dataset, or content
- **Rerun Tests**: Load previous configurations and run again
- **Compare Results**: Select multiple tests for side-by-side comparison

#### Comparison View
- **Side-by-Side Display**: Compare responses from different tests
- **Highlight Differences**: Visual indicators for response variations
- **Export Options**: Save comparison results

### Keyboard Shortcuts

- **Ctrl/Cmd + Enter**: Run current test
- **Ctrl/Cmd + H**: Switch to History tab
- **Ctrl/Cmd + T**: Switch to Test tab
- **Ctrl/Cmd + C**: Switch to Comparison tab (when available)
- **Escape**: Clear current selection or close modals

### Tips for Effective Testing

1. **Start Simple**: Begin with basic prompts before adding complexity
2. **Use Consistent Datasets**: Test multiple models with the same data for fair comparison
3. **Document Your Prompts**: Use descriptive prompts that explain the task clearly
4. **Compare Results**: Use the comparison feature to analyze model differences
5. **Save Configurations**: Use history to track successful prompt patterns

## Development

- **Development server**: `npm run dev`
- **Build for production**: `npm run build`
- **Preview production build**: `npm run preview`
- **Run tests**: `npm test` (when tests are added)
- **Lint code**: `npm run lint` (when linting is configured)

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

### Troubleshooting

**Check if credentials are loaded:**
```bash
# After running local-setup.sh, verify the .env.local file exists
ls -la .env.local

# Check the contents (be careful - contains sensitive data)
head .env.local
```

**Common issues:**
- **No .env.local file**: Make sure `./local-setup.sh` runs without errors
- **Access denied**: Ensure your AWS account has Bedrock enabled and proper permissions
- **Region issues**: Bedrock is available in limited regions (us-east-1, us-west-2, etc.)
- **Credentials expired**: Re-run `./local-setup.sh` to refresh SSO credentials

## Troubleshooting

### Application Won't Start
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version (requires 18+)
node --version
```

### AWS Connection Issues
```bash
# Verify AWS CLI is configured
aws sts get-caller-identity

# Check Bedrock access
aws bedrock list-foundation-models --region us-east-1

# Refresh SSO credentials
aws sso login
./local-setup.sh
```

### Dataset Loading Problems
- Ensure datasets are in `public/datasets/` directory
- Check CSV file format and encoding (UTF-8 recommended)
- Verify file permissions allow reading
- Check browser console for specific error messages

### Performance Issues
- Large datasets may cause browser slowdown
- Consider splitting large CSV files into smaller chunks
- Clear browser cache if experiencing loading issues
- Use browser developer tools to monitor memory usage

## FAQ

**Q: Which AWS regions support Bedrock?**
A: Bedrock is available in us-east-1, us-west-2, eu-west-1, and other select regions. Check the AWS documentation for the latest list.

**Q: Can I use this with AWS profiles?**
A: Yes, the local-setup.sh script respects your AWS CLI profile configuration.

**Q: How do I add new models?**
A: The application automatically discovers available models from your AWS account. No manual configuration needed.

**Q: Is my data sent anywhere besides AWS Bedrock?**
A: No, all data processing happens locally in your browser and only prompt/dataset combinations are sent to AWS Bedrock for inference.

**Q: Can I export my test history?**
A: Test history is stored locally in your browser. You can access it through the History tab and manually copy results as needed.

**Q: What file formats are supported for datasets?**
A: Currently CSV and JSON formats are supported. CSV is recommended for tabular data.

## Technology Stack

- **React 19**: Latest React with modern features
- **Vite**: Fast build tool and development server
- **Tailwind CSS**: Utility-first CSS framework
- **AWS SDK for JavaScript v3**: AWS Bedrock integration

## Current Status

This is the initial project setup with core components and UI structure. The following features are implemented:

✅ React 19 project structure  
✅ Tailwind CSS integration  
✅ Core component architecture  
✅ Responsive UI layout  
✅ State management for test harness  

**Next steps**: AWS Bedrock integration, dataset loading, and file persistence will be implemented in subsequent tasks.