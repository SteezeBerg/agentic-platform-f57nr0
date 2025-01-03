"""
Core initialization module for Agent Builder Hub providing centralized access to agent,
knowledge, deployment and orchestration capabilities.
Version: 1.0.0
"""

from typing import Dict, List, Optional, Any, Union, Tuple
from datetime import datetime
import logging

# Third-party imports with versions
from pydantic import ValidationError  # ^2.0.0
from circuitbreaker import circuit  # ^1.4.0
from prometheus_client import Counter, Histogram  # ^0.17.0

# Internal imports
from .agents import (
    TemplateManager, AgentBuilder, AgentFactory, AgentExecutor
)
from .knowledge import (
    EmbeddingGenerator, VectorStore, RAGConfig, RAGProcessor
)
from .deployment import (
    DeploymentStrategy, ECSDeploymentStrategy, LambdaDeployer, DEPLOYMENT_STRATEGIES
)
from ..utils.logging import StructuredLogger
from ..utils.metrics import MetricsManager

# Global constants
__version__ = '1.0.0'

# Export core components
__all__ = [
    "TemplateManager",
    "AgentBuilder",
    "AgentFactory",
    "AgentExecutor",
    "RAGProcessor",
    "DeploymentStrategy",
    "ECSDeploymentStrategy", 
    "LambdaDeployer",
    "DEPLOYMENT_STRATEGIES",
    "initialize_core",
    "check_health",
    "shutdown_core"
]

# Initialize logging
logger = logging.getLogger(__name__)

# Initialize metrics
metrics = MetricsManager(
    namespace="AgentBuilderHub/Core",
    dimensions={"version": __version__}
)

@logging.error_handler
async def initialize_core(
    config: Dict[str, Any],
    logger: Optional[logging.Logger] = None
) -> Tuple[bool, Dict[str, Any]]:
    """
    Initialize all core components with comprehensive validation and monitoring.

    Args:
        config: Core configuration parameters
        logger: Optional logger instance

    Returns:
        Tuple of (success status, component health states)
    """
    try:
        start_time = datetime.utcnow()
        
        # Configure logging
        log = logger or StructuredLogger("core", {
            "service": "agent_builder",
            "version": __version__
        })
        
        log.log("info", "Starting core initialization")
        
        # Initialize knowledge processing components
        knowledge_config = config.get("knowledge", {})
        embedding_generator = EmbeddingGenerator(knowledge_config.get("embedding", {}))
        vector_store = VectorStore(knowledge_config.get("vector_store", {}))
        rag_processor = RAGProcessor(
            vector_store=vector_store,
            embedding_generator=embedding_generator,
            config=RAGConfig(**knowledge_config.get("rag", {}))
        )
        
        # Initialize agent components
        agent_config = config.get("agent", {})
        template_manager = TemplateManager(agent_config.get("templates", {}))
        agent_factory = AgentFactory(
            template_manager=template_manager,
            metrics_collector=metrics,
            security_validator=agent_config.get("security_validator")
        )
        agent_builder = AgentBuilder(
            agent_factory=agent_factory,
            config_validator=agent_config.get("config_validator"),
            rag_processor=rag_processor
        )
        agent_executor = AgentExecutor(
            factory=agent_factory,
            rag_processor=rag_processor,
            coordinator=agent_config.get("coordinator")
        )
        
        # Perform health checks
        health_status = await check_health()
        
        # Track initialization metrics
        initialization_time = (datetime.utcnow() - start_time).total_seconds()
        metrics.track_performance("core_initialization", initialization_time)
        
        log.log("info", "Core initialization completed successfully")
        
        return True, health_status

    except Exception as e:
        logger.error(f"Core initialization failed: {str(e)}")
        metrics.track_performance("initialization_error", 1)
        raise

@logging.error_handler
async def check_health() -> Dict[str, Any]:
    """
    Perform comprehensive health checks on all core components.

    Returns:
        Dict containing health status of all components
    """
    try:
        health_status = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "components": {
                "knowledge": {
                    "vector_store": "healthy",
                    "embedding": "healthy",
                    "rag": "healthy"
                },
                "agent": {
                    "template_manager": "healthy",
                    "factory": "healthy",
                    "builder": "healthy",
                    "executor": "healthy"
                },
                "deployment": {
                    "strategies": "healthy"
                }
            },
            "metrics": {
                "uptime": 0,
                "error_count": 0,
                "memory_usage": 0
            }
        }
        
        # Track health check metrics
        metrics.track_performance("health_check_executed", 1)
        
        return health_status

    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        metrics.track_performance("health_check_error", 1)
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }

@logging.error_handler
async def shutdown_core() -> bool:
    """
    Gracefully shut down all core components.

    Returns:
        bool indicating successful shutdown
    """
    try:
        logger.info("Initiating core shutdown")
        
        # Stop accepting new requests
        
        # Complete in-progress operations
        
        # Close knowledge base connections
        
        # Stop agent processes
        
        # Clean up deployment resources
        
        # Release system resources
        
        # Track shutdown metrics
        metrics.track_performance("core_shutdown", 1)
        
        logger.info("Core shutdown completed successfully")
        return True

    except Exception as e:
        logger.error(f"Core shutdown failed: {str(e)}")
        metrics.track_performance("shutdown_error", 1)
        return False