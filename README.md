# Bedrock LLM Analyzer

A React-based test harness for experimenting with AWS Bedrock foundation models. Test different models with various prompts and datasets, compare results, and maintain a complete history of experiments.

## Features

- **Model Selection**: Choose from available AWS Bedrock foundation models
- **Dataset Management**: Load and test with different datasets organized by use case
- **Prompt Engineering**: Create and test custom prompts with template support
- **Results Analysis**: View formatted responses with metadata and performance metrics
- **Test History**: Track all experiments with search and filtering capabilities
- **Responsive Design**: Modern, professional UI built with Tailwind CSS

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

Datasets are organized in the `datasets/` directory by use case:

```
datasets/
├── [use-case-name]/        # Use case folder (e.g., "enterprise-fraud")
│   ├── dataset1.json       # Dataset files
│   ├── dataset2.csv
│   └── dataset3.json
└── [another-use-case]/
    ├── option1.json
    └── option2.json
```

## Development

- **Development server**: `npm run dev`
- **Build for production**: `npm run build`
- **Preview production build**: `npm run preview`

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