"""Setup configuration for memory system."""

from setuptools import setup, find_packages
from pathlib import Path

# Read the contents of README file
this_directory = Path(__file__).parent
long_description = (this_directory / "README.md").read_text(encoding="utf-8")

setup(
    name="memory-arc",
    version="0.1.0",
    author="Itachi-1824",
    author_email="",
    description="Intelligent Memory Management for AI Applications - A flexible, production-ready conversational memory engine",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/Itachi-1824/Memory-Arc",
    packages=find_packages(exclude=["tests", "tests.*", "examples", "examples.*"]),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
        "License :: OSI Approved :: Apache Software License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.8",
    install_requires=[
        "qdrant-client>=1.7.0",
        "sentence-transformers>=2.2.0",  # Includes all-MiniLM-L6-v2 by default
        "pyyaml>=6.0.0",
        "python-dotenv>=1.0.0",
    ],
    extras_require={
        "ai": [
            "openai>=1.0.0",
            "anthropic>=0.18.0",
            "ollama>=0.1.0",
            "huggingface-hub>=0.20.0",
        ],
        "heuristics": [
            "keybert>=0.8.0",
            "spacy>=3.7.0",
        ],
        "enhanced": [
            # Enhanced embedding models (installed on-demand)
            # These are downloaded automatically by sentence-transformers when used
            # No additional packages needed - just model downloads
        ],
        "dev": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.21.0",
            "pytest-cov>=4.1.0",
            "pytest-mock>=3.12.0",
            "black>=23.0.0",
            "flake8>=6.1.0",
            "mypy>=1.7.0",
            "isort>=5.12.0",
        ],
        "all": [
            "openai>=1.0.0",
            "anthropic>=0.18.0",
            "ollama>=0.1.0",
            "huggingface-hub>=0.20.0",
            "keybert>=0.8.0",
            "spacy>=3.7.0",
        ],
    },
    keywords="ai memory conversational llm chatbot assistant vector-database memory-management context-aware",
    project_urls={
        "Bug Reports": "https://github.com/Itachi-1824/Memory-Arc/issues",
        "Source": "https://github.com/Itachi-1824/Memory-Arc",
        "Documentation": "https://github.com/Itachi-1824/Memory-Arc#readme",
        "Discussions": "https://github.com/Itachi-1824/Memory-Arc/discussions",
    },
)
