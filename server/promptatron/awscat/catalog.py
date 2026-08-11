"""Bedrock model catalog with caching."""

import logging
import time
from typing import Any

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# TTL in seconds for cached model lists
CACHE_TTL_SECONDS = 600


class ModelCatalog:
    """Catalog of Bedrock models with in-memory caching."""

    def __init__(self) -> None:
        """Initialize the catalog with an empty cache."""
        self._cache: dict[str, tuple[list[dict[str, Any]], float]] = {}

    def list_models(self, region: str) -> list[dict[str, Any]]:
        """List invocable Bedrock models for the given region.

        Args:
            region: AWS region (e.g., "us-east-1")

        Returns:
            List of model dicts with keys: model_id, name, provider,
            supports_streaming, kind

        Raises:
            ClientError: If the Bedrock API call fails
        """
        # Check cache
        if region in self._cache:
            cached_models, cached_time = self._cache[region]
            if time.time() - cached_time < CACHE_TTL_SECONDS:
                logger.debug(f"Returning cached models for region {region}")
                return cached_models

        # Fetch fresh data
        client = boto3.client("bedrock", region_name=region)
        models = self._fetch_models(client)

        # Cache the result
        self._cache[region] = (models, time.time())

        return models

    def _fetch_models(self, client: Any) -> list[dict[str, Any]]:
        """Fetch and combine foundation models and inference profiles.

        Args:
            client: Bedrock client instance

        Returns:
            Combined list of models and profiles
        """
        foundation_models = self._list_foundation_models(client)
        inference_profiles = self._list_inference_profiles(client)

        # Merge: foundation models first, then profiles
        return foundation_models + inference_profiles

    def _list_foundation_models(self, client: Any) -> list[dict[str, Any]]:
        """List foundation models available for on-demand inference.

        Filters for models supporting ON_DEMAND inference and TEXT output.

        Args:
            client: Bedrock client instance

        Returns:
            List of foundation model dicts
        """
        models = []
        try:
            response = client.list_foundation_models()
        except ClientError as e:
            logger.error(f"Failed to list foundation models: {e}")
            raise

        for model in response.get("modelSummaries", []):
            # Filter: must support ON_DEMAND inference
            inference_types = model.get("inferenceTypesSupported", [])
            if "ON_DEMAND" not in inference_types:
                continue

            # Filter: must have TEXT in output modalities
            output_modalities = model.get("outputModalities", [])
            if "TEXT" not in output_modalities:
                continue

            models.append(
                {
                    "model_id": model["modelId"],
                    "name": model["modelName"],
                    "provider": model["providerName"],
                    "supports_streaming": model.get("responseStreamingSupported", True),
                    "kind": "foundation-model",
                }
            )

        logger.info(f"Listed {len(models)} foundation models")
        return models

    def _list_inference_profiles(self, client: Any) -> list[dict[str, Any]]:
        """List inference profiles.

        Args:
            client: Bedrock client instance

        Returns:
            List of inference profile dicts
        """
        profiles = []
        paginator = client.get_paginator("list_inference_profiles")

        try:
            for page in paginator.paginate():
                for profile in page.get("inferenceProfileSummaries", []):
                    profiles.append(
                        {
                            "model_id": profile["inferenceProfileId"],
                            "name": profile["inferenceProfileName"],
                            "provider": self._extract_provider_from_arn(profile),
                            "supports_streaming": True,
                            "kind": "inference-profile",
                        }
                    )
        except ClientError as e:
            logger.error(f"Failed to list inference profiles: {e}")
            raise

        logger.info(f"Listed {len(profiles)} inference profiles")
        return profiles

    def _extract_provider_from_arn(self, profile: dict[str, Any]) -> str:
        """Extract provider name from inference profile data.

        Args:
            profile: Inference profile dict

        Returns:
            Provider name or empty string if not found
        """
        # Try to extract from model ARN if available
        if "models" in profile and profile["models"]:
            model_arn = profile["models"][0].get("modelArn", "")
            # ARN format: arn:aws:bedrock:region::foundation-model/provider-model-name
            if ":foundation-model/" in model_arn:
                return model_arn.split("/")[-1].split("-")[0].capitalize()
        return ""
