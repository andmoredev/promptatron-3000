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

Ensure your AWS credentials are configured with access to Bedrock:

```bash
aws configure
# or use AWS CLI profiles, environment variables, or IAM roles
```

Required permissions:
- `bedrock:ListFoundationModels`
- `bedrock:InvokeModel`

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