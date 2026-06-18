import { ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";

/**
 * Bedrock model discovery and management
 */
export class ModelManager {
  constructor(clientManager) {
    this.clientManager = clientManager;
  }

  /**
   * Get available foundation models from AWS Bedrock
   */
  async listFoundationModels() {
    if (!this.clientManager.isReady()) {
      const initResult = await this.clientManager.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    try {
      // Get text models
      const textCommand = new ListFoundationModelsCommand({
        byOutputModality: 'TEXT',
        byInferenceType: 'ON_DEMAND'
      });

      const textResponse = await this.clientManager.managementClient.send(textCommand);
      const textModels = textResponse.modelSummaries || [];

      // Get image models
      const imageCommand = new ListFoundationModelsCommand({
        byOutputModality: 'IMAGE',
        byInferenceType: 'ON_DEMAND'
      });

      let imageModels = [];
      try {
        const imageResponse = await this.clientManager.managementClient.send(imageCommand);
        imageModels = imageResponse.modelSummaries || [];
      } catch (error) {
        // Image models might not be available in all regions, continue without them
        console.warn('Image models not available:', error.message);
      }

      // Combine all models
      const allModels = [...textModels, ...imageModels];

      const models = allModels.map(model => ({
        id: model.modelId,
        name: this.getModelDisplayName(model.modelId),
        provider: model.providerName,
        inputModalities: model.inputModalities,
        outputModalities: model.outputModalities,
        responseStreamingSupported: model.responseStreamingSupported,
        supportsImageGeneration: this.isImageGenerationModel(model.modelId)
      }));

      return models.sort((a, b) => {
        if (a.provider !== b.provider) {
          return a.provider.localeCompare(b.provider);
        }
        return a.name.localeCompare(b.name);
      });

    } catch (error) {
      throw new Error(`Failed to list foundation models: ${error.message}`);
    }
  }

  /**
   * Check if a model supports image generation
   */
  isImageGenerationModel(modelId) {
    const imageModels = [
      'amazon.nova-canvas-v1:0',
      'stability.stable-diffusion-xl-v1',
      'stability.sd3-large-v1:0'
    ];
    return imageModels.includes(modelId);
  }

  /**
   * Get user-friendly model display names
   */
  getModelDisplayName(modelId) {
    const modelNames = {
      // Text generation models
      'amazon.nova-pro-v1:0': 'Amazon Nova Pro',
      'amazon.nova-lite-v1:0': 'Amazon Nova Lite',
      'amazon.nova-micro-v1:0': 'Amazon Nova Micro',
      'anthropic.claude-3-5-sonnet-20241022-v2:0': 'Claude 3.5 Sonnet (v2)',
      'anthropic.claude-3-5-haiku-20241022-v1:0': 'Claude 3.5 Haiku',
      'anthropic.claude-3-opus-20240229-v1:0': 'Claude 3 Opus',
      'anthropic.claude-3-sonnet-20240229-v1:0': 'Claude 3 Sonnet',
      'anthropic.claude-3-haiku-20240307-v1:0': 'Claude 3 Haiku',
      'meta.llama3-2-90b-instruct-v1:0': 'Llama 3.2 90B Instruct',
      'meta.llama3-2-11b-instruct-v1:0': 'Llama 3.2 11B Instruct',
      'meta.llama3-2-3b-instruct-v1:0': 'Llama 3.2 3B Instruct',
      'meta.llama3-2-1b-instruct-v1:0': 'Llama 3.2 1B Instruct',
      'meta.llama3-1-70b-instruct-v1:0': 'Llama 3.1 70B Instruct',
      'meta.llama3-1-8b-instruct-v1:0': 'Llama 3.1 8B Instruct',
      'mistral.mistral-large-2407-v1:0': 'Mistral Large 2',
      'mistral.mistral-small-2402-v1:0': 'Mistral Small',
      'cohere.command-r-plus-v1:0': 'Command R+',
      'cohere.command-r-v1:0': 'Command R',

      // Image generation models
      'amazon.nova-canvas-v1:0': 'Amazon Nova Canvas',
      'stability.stable-diffusion-xl-v1': 'Stability AI SDXL 1.0',
      'stability.sd3-large-v1:0': 'Stable Diffusion 3 Large'
    };

    return modelNames[modelId] || modelId;
  }
}
