import importlib
import sys
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def clear_module_cache():
    """Re-import main between tests so rate-limit and cache state resets."""
    mods = [k for k in sys.modules if k.startswith("main")]
    for m in mods:
        del sys.modules[m]
    yield


@pytest.fixture()
def client():
    import main
    return TestClient(main.app)
