import os
from google import genai


def complete(prompt: str) -> str:
    if not os.environ.get("GEMINI_API_KEY"):
        raise EnvironmentError("GEMINI_API_KEY is not set")

    client = genai.Client()
    interaction = client.interactions.create(
        model="gemini-2.5-flash",
        prompt=prompt,
    )
    return interaction.output_text
