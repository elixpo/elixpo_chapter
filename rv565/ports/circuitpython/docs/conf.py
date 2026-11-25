# SPDX-FileCopyrightText: 2026 Ayushman Bhattacharya
# SPDX-License-Identifier: MIT
"""Sphinx configuration (same shape as Adafruit's cookiecutter libraries)."""

import os
import sys

sys.path.insert(0, os.path.abspath(".."))

extensions = ["sphinx.ext.autodoc", "sphinx.ext.intersphinx", "sphinx.ext.napoleon"]
autodoc_mock_imports = ["displayio", "bitmaptools"]
autodoc_preserve_defaults = True
intersphinx_mapping = {
    "python": ("https://docs.python.org/3", None),
    "CircuitPython": ("https://docs.circuitpython.org/en/latest/", None),
}

source_suffix = ".rst"
master_doc = "index"
project = "circuitpython-rv565"
copyright = "2026 Ayushman Bhattacharya"  # pylint: disable=redefined-builtin
author = "Ayushman Bhattacharya"
version = release = "3.0.0"
exclude_patterns = ["_build"]
html_theme = "alabaster"
