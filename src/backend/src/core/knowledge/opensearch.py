"""
OpenSearch integration module for vector storage and similarity search operations.
Provides high-performance vector operations for RAG processing with advanced security,
monitoring, and performance optimizations.
Version: 1.0.0
"""

from typing import Dict, List, Optional, Any
import numpy as np
from dataclasses import dataclass, field
from opensearchpy import OpenSearch, helpers, RequestsHttpConnection  # ^2.0.0
from pydantic import BaseModel, Field  # ^2.0.0
from tenacity import retry, stop_after_attempt, wait_exponential  # ^8.2.0

from ...utils.logging import StructuredLogger
from ...utils.metrics import MetricsCollector

# Global constants for configuration and optimization
MAX_RETRIES = 3
BATCH_SIZE = 100
DEFAULT_INDEX_NAME = 'knowledge-vectors'
DEFAULT_DIMENSION = 1536
CONNECTION_TIMEOUT = 30
MAX_CONNECTIONS = 100
RETRY_INTERVAL = 1

@dataclass
class OpenSearchConfig:
    """Configuration settings for OpenSearch connection with security and performance options."""
    
    hosts: List[str] = field(default_factory=lambda: ['localhost'])
    port: int = 9200
    username: Optional[str] = None
    password: Optional[str] = None
    use_ssl: bool = True
    ssl_config: Dict[str, Any] = field(default_factory=lambda: {
        'verify_certs': True,
        'ca_certs': None,
        'client_cert': None,
        'client_key': None
    })
    connection_settings: Dict[str, Any] = field(default_factory=lambda: {
        'timeout': CONNECTION_TIMEOUT,
        'max_retries': MAX_RETRIES,
        'retry_on_timeout': True,
        'maxsize': MAX_CONNECTIONS
    })
    performance_settings: Dict[str, Any] = field(default_factory=lambda: {
        'refresh_interval': '30s',
        'number_of_shards': 5,
        'number_of_replicas': 1
    })

class OpenSearchManager:
    """Enhanced manager for OpenSearch operations with advanced vector capabilities."""

    def __init__(self, config: OpenSearchConfig):
        """Initialize OpenSearch manager with enhanced configuration."""
        self._config = config
        self._logger = StructuredLogger("OpenSearchManager", {
            'service': 'knowledge_base',
            'component': 'vector_store'
        })
        self._metrics = MetricsCollector()
        
        # Initialize OpenSearch client with connection pooling
        self._client = OpenSearch(
            hosts=config.hosts,
            port=config.port,
            http_auth=(config.username, config.password) if config.username else None,
            use_ssl=config.use_ssl,
            verify_certs=config.ssl_config['verify_certs'],
            ca_certs=config.ssl_config['ca_certs'],
            client_cert=config.ssl_config['client_cert'],
            client_key=config.ssl_config['client_key'],
            connection_class=RequestsHttpConnection,
            timeout=config.connection_settings['timeout'],
            max_retries=config.connection_settings['max_retries'],
            retry_on_timeout=config.connection_settings['retry_on_timeout'],
            maxsize=config.connection_settings['maxsize']
        )

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_INTERVAL)
    )
    @MetricsCollector.record_latency
    def create_index(
        self,
        index_name: str = DEFAULT_INDEX_NAME,
        dimension: int = DEFAULT_DIMENSION,
        settings: Optional[Dict] = None,
        mappings: Optional[Dict] = None
    ) -> Dict:
        """Create or update an index with optimized vector search settings."""
        try:
            # Default optimized settings for vector search
            default_settings = {
                'index': {
                    'refresh_interval': self._config.performance_settings['refresh_interval'],
                    'number_of_shards': self._config.performance_settings['number_of_shards'],
                    'number_of_replicas': self._config.performance_settings['number_of_replicas']
                },
                'knn': True,
                'knn.algo_param.ef_search': 512
            }

            # Default mappings for vector fields
            default_mappings = {
                'properties': {
                    'vector': {
                        'type': 'knn_vector',
                        'dimension': dimension,
                        'method': {
                            'name': 'hnsw',
                            'space_type': 'cosine',
                            'engine': 'nmslib',
                            'parameters': {
                                'ef_construction': 512,
                                'm': 16
                            }
                        }
                    },
                    'content': {'type': 'text'},
                    'metadata': {'type': 'object'}
                }
            }

            # Merge with provided settings and mappings
            final_settings = {**default_settings, **(settings or {})}
            final_mappings = {**default_mappings, **(mappings or {})}

            # Create index with optimized configuration
            response = self._client.indices.create(
                index=index_name,
                body={
                    'settings': final_settings,
                    'mappings': final_mappings
                }
            )

            self._logger.log('info', f'Created index {index_name} successfully')
            return response

        except Exception as e:
            self._logger.log('error', f'Error creating index {index_name}: {str(e)}')
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_INTERVAL)
    )
    @MetricsCollector.record_latency
    def bulk_index(
        self,
        index_name: str,
        documents: List[Dict[str, Any]]
    ) -> Dict:
        """Optimized bulk indexing for vector data with batching."""
        try:
            actions = []
            for doc in documents:
                # Validate document structure
                if 'vector' not in doc or 'content' not in doc:
                    raise ValueError('Documents must contain vector and content fields')

                action = {
                    '_index': index_name,
                    '_source': {
                        'vector': doc['vector'],
                        'content': doc['content'],
                        'metadata': doc.get('metadata', {})
                    }
                }
                actions.append(action)

            # Process in optimized batches
            success_count = 0
            error_count = 0
            responses = []

            for i in range(0, len(actions), BATCH_SIZE):
                batch = actions[i:i + BATCH_SIZE]
                response = helpers.bulk(
                    self._client,
                    batch,
                    chunk_size=BATCH_SIZE,
                    request_timeout=self._config.connection_settings['timeout']
                )
                success_count += response[0]
                error_count += len(response[1])
                responses.append(response)

            result = {
                'total_documents': len(documents),
                'successful': success_count,
                'failed': error_count,
                'responses': responses
            }

            self._logger.log('info', f'Bulk indexed {success_count} documents successfully')
            return result

        except Exception as e:
            self._logger.log('error', f'Error in bulk indexing: {str(e)}')
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_INTERVAL)
    )
    @MetricsCollector.record_latency
    def search(
        self,
        index_name: str,
        query_vector: np.ndarray,
        k: int = 10,
        filter: Optional[Dict] = None,
        search_options: Optional[Dict] = None
    ) -> List[Dict]:
        """Enhanced k-NN vector similarity search with filtering."""
        try:
            # Validate query vector
            if not isinstance(query_vector, np.ndarray):
                raise ValueError('Query vector must be a numpy array')

            # Prepare search query with k-NN
            query = {
                'size': k,
                'query': {
                    'knn': {
                        'vector': {
                            'vector': query_vector.tolist(),
                            'k': k
                        }
                    }
                }
            }

            # Apply additional filters if provided
            if filter:
                query['query'] = {
                    'bool': {
                        'must': [query['query']],
                        'filter': filter
                    }
                }

            # Add search options if provided
            if search_options:
                query.update(search_options)

            # Execute search with timeout and connection settings
            response = self._client.search(
                index=index_name,
                body=query,
                request_timeout=self._config.connection_settings['timeout']
            )

            # Process and format results
            results = []
            for hit in response['hits']['hits']:
                result = {
                    'content': hit['_source']['content'],
                    'score': hit['_score'],
                    'metadata': hit['_source'].get('metadata', {}),
                    'vector': np.array(hit['_source']['vector'])
                }
                results.append(result)

            self._logger.log('info', f'Successfully executed vector search with k={k}')
            return results

        except Exception as e:
            self._logger.log('error', f'Error in vector search: {str(e)}')
            raise