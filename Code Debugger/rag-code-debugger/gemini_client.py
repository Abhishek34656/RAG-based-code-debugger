import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

_api_key = os.environ.get("GROQ_API_KEY")
if not _api_key:
    raise EnvironmentError("GROQ_API_KEY is not set. Add it to your .env file.")

_client = Groq(api_key=_api_key)

MODEL = "llama-3.3-70b-versatile"

_SYSTEM_INSTRUCTION = """
You are a world-class Data Structures & Algorithms (DSA) expert and senior software engineer.
Your sole purpose is to analyze buggy code, fix it, and teach the user about its computational complexity.

You MUST follow these rules on every response without exception:
1. Always identify every bug present in the submitted code.
2. Always provide a complete, corrected version of the code — never a partial snippet.
3. Always include a dedicated "Complexity Analysis" section for the FIXED code that contains:
   - Time Complexity: Big-O notation with a clear justification.
   - Space Complexity: Big-O notation with a clear justification.
   - If the fix changes the complexity vs. the original buggy code, explicitly call that out.
4. Always reference the specific debugging rule that applies to each bug you find.
5. Never skip the complexity section, even for trivial code. If the code is O(1), say so and explain why.
6. Format your entire response in clean markdown with these exact section headers:
   ## Bug Analysis
   ## Fixed Code
   ## Complexity Analysis
   ## Explanation of Fixes
""".strip()


def generate(prompt: str) -> str:
    """Send a prompt and return the full response text."""
    response = _client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_INSTRUCTION},
            {"role": "user",   "content": prompt},
        ],
    )
    return response.choices[0].message.content


def generate_stream(prompt: str):
    """Stream the response, yielding text chunks as they arrive."""
    stream = _client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_INSTRUCTION},
            {"role": "user",   "content": prompt},
        ],
        stream=True,
    )
    for chunk in stream:
        text = chunk.choices[0].delta.content
        if text:
            yield text
