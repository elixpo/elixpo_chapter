"""Registry system for AI adapters with discovery and lazy loading."""

import importlib
import importlib.util
import logging
from typing import Any, Type

from .ai_adapter import AIAdapter


logger = logging.getLogger(__name__)


class AdapterNotFoundError(Exception):
    """Raised when a requested adapter is not found in the registry."""
    pass


class AdapterRegistry:
    """
    Registry for AI adapters with discovery and instantiation.
    
    This registry allows:
    - Registration of custom adapters
    - Lazy loading of built-in adapters
    - Discovery of available adapters
    - Instantiation of adapters by name
    
    Example:
        >>> # Register a custom adapter
        >>> AdapterRegistry.register("my_adapter", MyCustomAdapter)
        >>> 
        >>> # Get an adapter instance
        >>> adapter = AdapterRegistry.get("openai", {"api_key": "sk-..."})
        >>> 
        >>> # List available adapters
        >>> adapters = AdapterRegistry.list()
        >>> print(adapters)
        ['openai', 'anthropic', 'ollama', 'huggingface', 'my_adapter']
    """
    
    # Storage for registered custom adapters
    _adapters: dict[str, Type[AIAdapter]] = {}
    
    # Built-in adapters with lazy loading
    # Maps adapter name to (module_path, class_name)
    _builtin_adapters: dict[str, tuple[str, str]] = {
        "openai": ("adapters.openai", "OpenAIAdapter"),
        "anthropic": ("adapters.anthropic", "AnthropicAdapter"),
        "ollama": ("adapters.ollama", "OllamaAdapter"),
        "huggingface": ("adapters.huggingface", "HuggingFaceAdapter"),
    }
    
    # Cache for loaded built-in adapters
    _loaded_builtins: dict[str, Type[AIAdapter]] = {}
    
    @classmethod
    def register(cls, name: str, adapter_class: Type[AIAdapter]) -> None:
        """
        Register a custom adapter.
        
        Args:
            name: Unique name for the adapter
            adapter_class: Class that implements AIAdapter interface
            
        Raises:
            TypeError: If adapter_class doesn't inherit from AIAdapter
            ValueError: If name conflicts with a built-in adapter
            
        Example:
            >>> class MyAdapter(AIAdapter):
            ...     async def summarize_conversation(self, messages):
            ...         return "Summary"
            ...     # ... implement other methods
            >>> 
            >>> AdapterRegistry.register("my_adapter", MyAdapter)
        """
        # Validate that the class implements AIAdapter
        if not issubclass(adapter_class, AIAdapter):
            raise TypeError(
                f"Adapter class must inherit from AIAdapter, got {adapter_class}"
            )
        
        # Warn if overriding a built-in adapter
        if name in cls._builtin_adapters:
            logger.warning(
                f"Registering custom adapter '{name}' will override built-in adapter"
            )
        
        cls._adapters[name] = adapter_class
        logger.info(f"Registered custom adapter: {name}")
    
    @classmethod
    def get(cls, name: str, config: dict[str, Any] | None = None) -> AIAdapter:
        """
        Get an adapter instance by name.
        
        This method will:
        1. Check for custom registered adapters first
        2. Fall back to built-in adapters with lazy loading
        3. Instantiate the adapter with provided configuration
        
        Args:
            name: Name of the adapter to retrieve
            config: Configuration dictionary to pass to adapter constructor
            
        Returns:
            Instantiated adapter instance
            
        Raises:
            AdapterNotFoundError: If adapter name is not found
            Exception: If adapter instantiation fails
            
        Example:
            >>> adapter = AdapterRegistry.get("openai", {
            ...     "api_key": "sk-...",
            ...     "model": "gpt-4o-mini"
            ... })
        """
        config = config or {}
        
        # Check custom adapters first
        if name in cls._adapters:
            try:
                adapter_class = cls._adapters[name]
                return adapter_class(**config)
            except Exception as e:
                logger.error(f"Failed to instantiate custom adapter '{name}': {e}")
                raise
        
        # Check built-in adapters
        if name in cls._builtin_adapters:
            # Check if already loaded
            if name not in cls._loaded_builtins:
                # Lazy load the adapter
                try:
                    module_path, class_name = cls._builtin_adapters[name]
                    module = importlib.import_module(module_path)
                    adapter_class = getattr(module, class_name)
                    cls._loaded_builtins[name] = adapter_class
                    logger.debug(f"Lazy loaded built-in adapter: {name}")
                except ImportError as e:
                    logger.error(
                        f"Failed to import built-in adapter '{name}': {e}. "
                        f"The adapter module may not be implemented yet."
                    )
                    raise AdapterNotFoundError(
                        f"Built-in adapter '{name}' is not available. "
                        f"It may not be implemented yet or dependencies may be missing."
                    ) from e
                except AttributeError as e:
                    logger.error(
                        f"Failed to load adapter class from module '{name}': {e}"
                    )
                    raise AdapterNotFoundError(
                        f"Adapter class not found in module for '{name}'"
                    ) from e
            
            # Instantiate the adapter
            try:
                adapter_class = cls._loaded_builtins[name]
                return adapter_class(**config)
            except Exception as e:
                logger.error(f"Failed to instantiate built-in adapter '{name}': {e}")
                raise
        
        # Adapter not found
        available = cls.list()
        raise AdapterNotFoundError(
            f"Adapter '{name}' not found. Available adapters: {', '.join(available)}"
        )
    
    @classmethod
    def list(cls) -> list[str]:
        """
        List all available adapter names.
        
        Returns:
            List of adapter names (built-in + custom)
            
        Example:
            >>> adapters = AdapterRegistry.list()
            >>> print(adapters)
            ['openai', 'anthropic', 'ollama', 'huggingface', 'my_custom']
        """
        # Combine built-in and custom adapters
        builtin_names = list(cls._builtin_adapters.keys())
        custom_names = list(cls._adapters.keys())
        
        # Remove duplicates (custom overrides built-in)
        all_adapters = list(dict.fromkeys(builtin_names + custom_names))
        
        return sorted(all_adapters)
    
    @classmethod
    def describe(cls, name: str) -> dict[str, Any]:
        """
        Get metadata and capabilities for an adapter.
        
        Args:
            name: Name of the adapter to describe
            
        Returns:
            Dictionary with adapter information:
            - name: Adapter name
            - type: "builtin" or "custom"
            - loaded: Whether the adapter is currently loaded
            - available: Whether the adapter can be instantiated
            - description: Brief description (if available)
            
        Raises:
            AdapterNotFoundError: If adapter name is not found
            
        Example:
            >>> info = AdapterRegistry.describe("openai")
            >>> print(info)
            {
                'name': 'openai',
                'type': 'builtin',
                'loaded': False,
                'available': True,
                'description': 'OpenAI API adapter for GPT models'
            }
        """
        if name not in cls._builtin_adapters and name not in cls._adapters:
            available = cls.list()
            raise AdapterNotFoundError(
                f"Adapter '{name}' not found. Available adapters: {', '.join(available)}"
            )
        
        # Determine adapter type
        is_custom = name in cls._adapters
        adapter_type = "custom" if is_custom else "builtin"
        
        # Check if loaded
        is_loaded = is_custom or name in cls._loaded_builtins
        
        # Check if available (can be instantiated)
        is_available = True
        if not is_custom and name not in cls._loaded_builtins:
            # Try to check if module exists without loading it
            try:
                module_path, _ = cls._builtin_adapters[name]
                importlib.util.find_spec(module_path)
            except (ImportError, ModuleNotFoundError):
                is_available = False
        
        # Get description if available
        description = None
        if is_loaded:
            try:
                adapter_class = (
                    cls._adapters[name] if is_custom else cls._loaded_builtins[name]
                )
                description = adapter_class.__doc__
                if description:
                    # Get first line of docstring
                    description = description.strip().split("\n")[0]
            except Exception:
                pass
        
        return {
            "name": name,
            "type": adapter_type,
            "loaded": is_loaded,
            "available": is_available,
            "description": description,
        }
    
    @classmethod
    def clear_custom(cls) -> None:
        """
        Clear all custom registered adapters.
        
        This is useful for testing or resetting the registry state.
        Built-in adapters are not affected.
        """
        cls._adapters.clear()
        logger.info("Cleared all custom adapters from registry")
    
    @classmethod
    def unload_builtin(cls, name: str) -> None:
        """
        Unload a built-in adapter from cache.
        
        This forces the adapter to be re-imported on next use.
        Useful for development and testing.
        
        Args:
            name: Name of the built-in adapter to unload
        """
        if name in cls._loaded_builtins:
            del cls._loaded_builtins[name]
            logger.debug(f"Unloaded built-in adapter: {name}")
