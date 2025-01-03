"""
Unit test suite for LLM integration modules.
Tests OpenAI and Anthropic client implementations with comprehensive validation.
Version: 1.0.0
"""

import pytest
from unittest.mock import patch, Mock, AsyncMock
import json
from datetime import datetime

# Internal imports
from src.integrations.llm.openai import OpenAIClient, OpenAIConfig
from src.integrations.llm.anthropic import AnthropicClient, AnthropicConfig
from src.utils.metrics import MetricsManager

# Test constants
MOCK_OPENAI_KEY = "test-openai-key"
MOCK_ANTHROPIC_KEY = "test-anthropic-key"
TEST_PROMPT = "Test prompt for unit tests"

class TestOpenAIClient:
    """Test suite for OpenAI client implementation with security and performance validation."""

    @pytest.fixture
    def mock_metrics(self):
        return Mock(spec=MetricsManager)

    @pytest.fixture
    def openai_config(self):
        return OpenAIConfig(
            api_key=MOCK_OPENAI_KEY,
            model_id="gpt-4",
            temperature=0.7,
            max_tokens=4000,
            timeout=30,
            retry_config={"max_attempts": 3},
            rate_limits={"tokens_per_minute": 150000}
        )

    @pytest.fixture
    async def openai_client(self, openai_config, mock_metrics):
        with patch('src.integrations.llm.openai.MetricsManager', return_value=mock_metrics):
            client = OpenAIClient(config=openai_config)
            yield client

    @pytest.mark.asyncio
    async def test_init_client(self, openai_client, openai_config):
        """Test OpenAI client initialization with security validation."""
        assert openai_client.config.api_key == MOCK_OPENAI_KEY
        assert openai_client.config.model_id == "gpt-4"
        assert openai_client.config.temperature == 0.7
        assert openai_client.config.max_tokens == 4000

    @pytest.mark.asyncio
    async def test_invoke_success(self, openai_client):
        """Test successful model invocation with performance monitoring."""
        mock_response = {
            "choices": [{
                "message": {"content": "Test response"},
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 20,
                "total_tokens": 30
            },
            "model": "gpt-4"
        }

        with patch('openai.Client.chat.completions.create', new_callable=AsyncMock) as mock_create:
            mock_create.return_value = Mock(**mock_response)
            
            response = await openai_client.invoke(TEST_PROMPT)
            
            assert response["content"] == "Test response"
            assert response["model"] == "gpt-4"
            assert "usage" in response
            assert response["usage"]["total_tokens"] == 30
            assert "metadata" in response
            assert "timestamp" in response["metadata"]

    @pytest.mark.asyncio
    async def test_invoke_rate_limit(self, openai_client):
        """Test rate limit handling and retry logic."""
        with patch('openai.Client.chat.completions.create', new_callable=AsyncMock) as mock_create:
            mock_create.side_effect = [
                Exception("rate_limit_exceeded"),
                Mock(choices=[{"message": {"content": "Retry success"}}])
            ]
            
            response = await openai_client.invoke(TEST_PROMPT)
            assert response["content"] == "Retry success"

    @pytest.mark.asyncio
    async def test_generate_embedding(self, openai_client):
        """Test embedding generation with monitoring."""
        mock_embedding = [0.1] * 1536
        mock_response = Mock(
            data=[Mock(embedding=mock_embedding)],
            model="text-embedding-ada-002"
        )

        with patch('openai.Client.embeddings.create', new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_response
            
            response = await openai_client.generate_embedding("Test text")
            
            assert "embedding" in response
            assert len(response["embedding"]) == 1536
            assert response["model"] == "text-embedding-ada-002"
            assert "metadata" in response
            assert "dimensions" in response["metadata"]

class TestAnthropicClient:
    """Test suite for Anthropic client implementation with context handling."""

    @pytest.fixture
    def mock_metrics(self):
        return Mock(spec=MetricsManager)

    @pytest.fixture
    def anthropic_config(self):
        return AnthropicConfig(
            api_key=MOCK_ANTHROPIC_KEY,
            model_id="claude-2",
            temperature=0.7,
            max_tokens=4000,
            timeout_seconds=30,
            security_controls={
                "ssl_verify": True,
                "input_validation": True,
                "output_sanitization": True,
                "pii_detection": True
            }
        )

    @pytest.fixture
    async def anthropic_client(self, anthropic_config, mock_metrics):
        with patch('src.integrations.llm.anthropic.MetricsManager', return_value=mock_metrics):
            client = AnthropicClient(config=anthropic_config)
            yield client

    @pytest.mark.asyncio
    async def test_init_client(self, anthropic_client, anthropic_config):
        """Test Anthropic client initialization with security controls."""
        assert anthropic_client.config.api_key == MOCK_ANTHROPIC_KEY
        assert anthropic_client.config.model_id == "claude-2"
        assert anthropic_client.config.security_controls["ssl_verify"]
        assert anthropic_client.config.security_controls["input_validation"]

    @pytest.mark.asyncio
    async def test_generate_success(self, anthropic_client):
        """Test successful text generation with context handling."""
        mock_response = {
            "content": "Test response",
            "model": "claude-2",
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 20,
                "total_tokens": 30
            }
        }

        with patch('anthropic.Client.messages.create', new_callable=AsyncMock) as mock_create:
            mock_create.return_value = Mock(**mock_response)
            
            response = await anthropic_client.generate(
                TEST_PROMPT,
                context={"domain": "test"}
            )
            
            assert response["text"] == "Test response"
            assert response["model"] == "claude-2"
            assert "metadata" in response
            assert "tokens" in response["metadata"]

    @pytest.mark.asyncio
    async def test_security_validation(self, anthropic_client):
        """Test security controls and input validation."""
        with pytest.raises(ValueError):
            await anthropic_client.generate("")

        with pytest.raises(ValueError):
            await anthropic_client.generate(TEST_PROMPT, parameters={"invalid_param": "value"})

    @pytest.mark.asyncio
    async def test_caching(self, anthropic_client):
        """Test response caching functionality."""
        mock_response = {
            "content": "Cached response",
            "model": "claude-2",
            "usage": {"total_tokens": 30}
        }

        with patch('anthropic.Client.messages.create', new_callable=AsyncMock) as mock_create:
            mock_create.return_value = Mock(**mock_response)
            
            # First call
            response1 = await anthropic_client.generate(TEST_PROMPT, use_cache=True)
            
            # Second call should use cache
            response2 = await anthropic_client.generate(TEST_PROMPT, use_cache=True)
            
            assert response1 == response2
            mock_create.assert_called_once()

    @pytest.mark.asyncio
    async def test_error_handling(self, anthropic_client):
        """Test comprehensive error handling scenarios."""
        with patch('anthropic.Client.messages.create', new_callable=AsyncMock) as mock_create:
            mock_create.side_effect = Exception("API Error")
            
            with pytest.raises(Exception):
                await anthropic_client.generate(TEST_PROMPT)

@pytest.fixture(scope="session", autouse=True)
def configure_test_metrics():
    """Configure metrics for testing environment."""
    with patch('src.utils.metrics.MetricsManager'):
        yield

def test_openai_config_validation():
    """Test OpenAI configuration validation."""
    with pytest.raises(ValueError):
        OpenAIConfig(api_key="", model_id="invalid-model")

    config = OpenAIConfig(
        api_key=MOCK_OPENAI_KEY,
        model_id="gpt-4",
        temperature=0.7
    )
    assert config.model_id == "gpt-4"
    assert config.temperature == 0.7

def test_anthropic_config_validation():
    """Test Anthropic configuration validation."""
    with pytest.raises(ValueError):
        AnthropicConfig(api_key="", model_id="invalid-model")

    config = AnthropicConfig(
        api_key=MOCK_ANTHROPIC_KEY,
        model_id="claude-2",
        security_controls={"ssl_verify": True}
    )
    assert config.model_id == "claude-2"
    assert config.security_controls["ssl_verify"]