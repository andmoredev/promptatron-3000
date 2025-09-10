# AWS Integration Guidelines

This document outlines patterns and best practices for AWS service integration in the Bedrock LLM Analyzer project.

## AWS SDK Configuration

### Client Initialization
Use AWS SDK v3 with proper client configuration:

```javascript
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime"
import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock"

const clientConfig = {
  region: region,
  ...(import.meta.env.VITE_AWS_ACCESS_KEY_ID && {
    credentials: {
      accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
      secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
      ...(import.meta.env.VITE_AWS_SESSION_TOKEN && {
        sessionToken: import.meta.env.VITE_AWS_SESSION_TOKEN
      })
    }
  })
}

this.runtimeClient = new BedrockRuntimeClient(clientConfig)
this.managementClient = new BedrockClient(clientConfig)
```

### Service Class Pattern
Implement AWS services as singleton classes:

```javascript
export class BedrockService {
  constructor() {
    this.runtimeClient = null
    this.managementClient = null
    this.isInitialized = false
    this.credentialsValid = false
  }

  async initialize() {
    // Initialization logic
  }

  isReady() {
    return this.isInitialized && this.credentialsValid
  }
}

export const bedrockService = new BedrockService()
```

## Credential Management

### Environment Variables
Use `VITE_` prefix for client-side environment variables:

```bash
# .env.local
VITE_AWS_ACCESS_KEY_ID=your_access_key
VITE_AWS_SECRET_ACCESS_KEY=your_secret_key
VITE_AWS_SESSION_TOKEN=your_session_token  # Optional for temporary credentials
VITE_AWS_REGION=us-east-1
```

### Credential Detection
Implement credential source detection:

```javascript
detectCredentialSources() {
  const sources = []

  if (import.meta.env.VITE_AWS_ACCESS_KEY_ID) {
    sources.push({
      type: 'vite-env',
      description: 'Vite environment variables (VITE_AWS_*)',
      hasSessionToken: !!import.meta.env.VITE_AWS_SESSION_TOKEN,
      region: import.meta.env.VITE_AWS_REGION,
      source: '.env.local or build environment'
    })
  }

  return sources
}
```

### Credential Validation
Test credentials with a simple API call:

```javascript
async validateCredentials() {
  try {
    const command = new ListFoundationModelsCommand({
      byOutputModality: 'TEXT'
    })
    await this.managementClient.send(command)
    this.credentialsValid = true
    return true
  } catch (error) {
    this.credentialsValid = false
    throw error
  }
}
```

## Bedrock Integration Patterns

### Model Discovery
List available foundation models with proper filtering:

```javascript
async listFoundationModels() {
  const command = new ListFoundationModelsCommand({
    byOutputModality: 'TEXT',
    byInferenceType: 'ON_DEMAND'
  })

  const response = await this.managementClient.send(command)

  return response.modelSummaries?.map(model => ({
    id: model.modelId,
    name: this.getModelDisplayName(model.modelId),
    provider: model.providerName,
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    responseStreamingSupported: model.responseStreamingSupported
  })) || []
}
```

### Model Invocation
Use the Converse API for consistent model interactions:

```javascript
async invokeModel(modelId, systemPrompt, userPrompt, content = '') {
  const fullUserPrompt = content ? `${userPrompt}\n\nData to analyze:\n${content}` : userPrompt

  const messages = [
    {
      role: 'user',
      content: [{ text: fullUserPrompt }]
    }
  ]

  const converseParams = {
    modelId: modelId,
    messages: messages,
    inferenceConfig: {
      maxTokens: 4000,
      temperature: 0.7
    }
  }

  if (systemPrompt?.trim()) {
    converseParams.system = [{ text: systemPrompt }]
  }

  const command = new ConverseCommand(converseParams)
  const response = await this.runtimeClient.send(command)

  return this.parseConverseResponse(response)
}
```

### Response Parsing
Standardize response parsing:

```javascript
parseConverseResponse(response) {
  const text = response.output?.message?.content?.[0]?.text || 'No response generated'

  const usage = response.usage ? {
    input_tokens: response.usage.inputTokens,
    output_tokens: response.usage.outputTokens,
    total_tokens: response.usage.totalTokens
  } : null

  return { text, usage }
}
```

## Error Handling

### AWS-Specific Error Messages
Provide user-friendly error messages for common AWS errors:

```javascript
getCredentialErrorMessage(error) {
  const errorCode = error.name || error.code
  const errorMessage = error.message || ''

  if (errorCode === 'CredentialsProviderError' || errorMessage.includes('credentials')) {
    return 'AWS credentials not found. Please run your local-setup.sh script or create a .env.local file with VITE_AWS_* variables.'
  }

  if (errorCode === 'UnauthorizedOperation' || errorCode === 'AccessDenied') {
    return 'Access denied. Please ensure your AWS credentials have permission to access Amazon Bedrock.'
  }

  if (errorCode === 'ValidationException' && errorMessage.includes('region')) {
    return 'Invalid AWS region. Please ensure Bedrock is available in your configured region.'
  }

  return `AWS Bedrock initialization failed: ${errorMessage}`
}
```

### Retry Logic
Implement retry with exponential backoff:

```javascript
async retryWithBackoff(operation, options = {}) {
  const { maxRetries = 3, baseDelay = 1000, onRetry } = options
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (attempt === maxRetries) throw error
      
      const delay = baseDelay * Math.pow(2, attempt - 1)
      onRetry?.(error, attempt, delay)
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}
```

## Model Management

### Model Display Names
Provide user-friendly model names:

```javascript
getModelDisplayName(modelId) {
  const modelNames = {
    'amazon.nova-pro-v1:0': 'Amazon Nova Pro',
    'amazon.nova-lite-v1:0': 'Amazon Nova Lite',
    'anthropic.claude-3-5-sonnet-20241022-v2:0': 'Claude 3.5 Sonnet (v2)',
    'anthropic.claude-3-5-haiku-20241022-v1:0': 'Claude 3.5 Haiku',
    'meta.llama3-2-90b-instruct-v1:0': 'Llama 3.2 90B Instruct'
    // Add more mappings as needed
  }

  return modelNames[modelId] || modelId
}
```

### Model Sorting
Sort models for better user experience:

```javascript
models.sort((a, b) => {
  if (a.provider !== b.provider) {
    return a.provider.localeCompare(b.provider)
  }
  return a.name.localeCompare(b.name)
})
```

## Security Best Practices

### Environment Variable Security
- Never commit `.env.local` files to version control
- Use `VITE_` prefix only for non-sensitive configuration
- Rotate credentials regularly
- Use temporary credentials when possible

### Client-Side Considerations
- Understand that client-side credentials are visible to users
- Consider using Cognito Identity Pool for production applications
- Implement proper CORS configuration
- Use HTTPS in production

## Development Setup

### Local Development Script
Provide setup scripts for credential management:

```bash
#!/bin/bash
# local-setup.sh

echo "Setting up AWS credentials for local development..."

# Check if AWS CLI is configured
if aws sts get-caller-identity &> /dev/null; then
    echo "AWS CLI is configured. Extracting credentials..."
    
    # Extract credentials from AWS CLI
    AWS_ACCESS_KEY_ID=$(aws configure get aws_access_key_id)
    AWS_SECRET_ACCESS_KEY=$(aws configure get aws_secret_access_key)
    AWS_SESSION_TOKEN=$(aws configure get aws_session_token)
    AWS_REGION=$(aws configure get region)
    
    # Create .env.local file
    cat > .env.local << EOF
VITE_AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
VITE_AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
VITE_AWS_SESSION_TOKEN=$AWS_SESSION_TOKEN
VITE_AWS_REGION=${AWS_REGION:-us-east-1}
EOF
    
    echo "Credentials saved to .env.local"
else
    echo "AWS CLI not configured. Please run 'aws configure' first."
    exit 1
fi
```

## Testing AWS Integration

### Mock Services for Testing
Create mock implementations for testing:

```javascript
export class MockBedrockService {
  constructor() {
    this.isInitialized = true
    this.credentialsValid = true
  }

  async initialize() {
    return { success: true, message: 'Mock service initialized' }
  }

  async listFoundationModels() {
    return [
      { id: 'mock-model-1', name: 'Mock Model 1', provider: 'Mock' }
    ]
  }

  async invokeModel(modelId, systemPrompt, userPrompt, content) {
    return {
      text: `Mock response for ${modelId}`,
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }
    }
  }

  isReady() {
    return true
  }
}
```

### Environment Detection
Switch between real and mock services based on environment:

```javascript
const isDevelopment = import.meta.env.DEV
const useMockServices = import.meta.env.VITE_USE_MOCK_SERVICES === 'true'

export const bedrockService = (isDevelopment && useMockServices) 
  ? new MockBedrockService() 
  : new BedrockService()
```

## Performance Optimization

### Client Reuse
Reuse AWS SDK clients instead of creating new ones:

```javascript
// Good - reuse clients
if (!this.runtimeClient) {
  this.runtimeClient = new BedrockRuntimeClient(config)
}

// Avoid - creating new clients for each request
const client = new BedrockRuntimeClient(config)
```

### Request Optimization
Optimize API requests:

```javascript
// Cache model list to avoid repeated API calls
let cachedModels = null
let cacheExpiry = null

async listFoundationModels() {
  const now = Date.now()
  
  if (cachedModels && cacheExpiry && now < cacheExpiry) {
    return cachedModels
  }
  
  const models = await this.fetchModelsFromAPI()
  
  cachedModels = models
  cacheExpiry = now + (5 * 60 * 1000) // 5 minutes
  
  return models
}
```

## Monitoring and Logging

### Service Status Tracking
Track service initialization and health:

```javascript
getStatus() {
  return {
    initialized: this.isInitialized,
    credentialsValid: this.credentialsValid,
    ready: this.isReady(),
    lastError: this.lastError,
    lastSuccessfulCall: this.lastSuccessfulCall
  }
}
```

### Request Logging
Log important service interactions:

```javascript
async invokeModel(modelId, systemPrompt, userPrompt, content) {
  console.log('Invoking model:', {
    modelId,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
    hasContent: !!content
  })

  try {
    const result = await this.performInvocation(...)
    console.log('Model invocation successful:', {
      modelId,
      responseLength: result.text.length,
      usage: result.usage
    })
    return result
  } catch (error) {
    console.error('Model invocation failed:', {
      modelId,
      error: error.message
    })
    throw error
  }
}
```