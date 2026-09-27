from typing import Literal

Provider = Literal["gemini", "groq", "openrouter"]


def get_completion(prompt: str, provider: Provider = "gemini") -> str:
    """Route a prompt to the requested LLM provider and return the text response."""
    if provider == "gemini":
        from .gemini import complete
    elif provider == "groq":
        from .groq import complete
    elif provider == "openrouter":
        from .openrouter import complete
    else:
        raise ValueError(f"Unknown provider: {provider!r}")

    return complete(prompt)
