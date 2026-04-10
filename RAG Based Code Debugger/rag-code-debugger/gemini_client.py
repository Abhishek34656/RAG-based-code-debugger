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


# ── Comparison Mode ────────────────────────────────────────────

_COMPARISON_SYSTEM_INSTRUCTION = """
You are comparing two code solutions for the same problem as a world-class DSA expert.

Your responsibilities:
1. Analyze the time AND space complexity of BOTH Code A and Code B using Big-O notation.
2. Identify which code is more optimized and explain precisely why (e.g., data structure choice, algorithm design, loop elimination).
3. Assign each line of BOTH snippets a complexity hotspot rating from 1 to 10:
   - 1: blank lines, comments, closing braces, simple assignments
   - 3-4: simple conditionals, single function calls
   - 6-7: loops, list comprehensions, sorting calls
   - 8-9: nested loops, recursive calls, repeated lookups in O(n) structures
   - 10: deeply nested loops/recursion, O(n^k) or worse operations

You MUST respond with ONLY a valid JSON object — no prose, no markdown, no explanation outside the JSON.
The JSON must have exactly this structure:
{
  "hotspots_A": [{"line_number": 1, "code": "...", "rating": 1}],
  "hotspots_B": [{"line_number": 1, "code": "...", "rating": 1}],
  "winner": "A" or "B",
  "justification": "one concise sentence stating which is more efficient and the primary reason",
  "comparison_summary": "a specific explanation of the key optimization difference, e.g. 'Code B uses a HashMap to reduce the O(n^2) nested loop in Code A to O(n)'"
}

Rules:
- hotspots_A must contain exactly one entry per line of Code A (preserving blank lines).
- hotspots_B must contain exactly one entry per line of Code B (preserving blank lines).
- winner must be exactly the string "A" or "B", nothing else.
- Do NOT include any text before or after the JSON object.
""".strip()

_COMPARISON_ANALYSIS_SYSTEM_INSTRUCTION = """
You are a world-class DSA expert writing a detailed comparative analysis of two code solutions.
You have already determined the winner and the key optimization difference.
Now write a thorough markdown analysis covering:

## Complexity Comparison
- Time complexity of Code A with justification
- Time complexity of Code B with justification
- Space complexity of Code A with justification
- Space complexity of Code B with justification

## Optimization Analysis
- What specific algorithmic or data structure choice makes the winner more efficient
- Trade-offs: are there scenarios where the losing solution might be preferable (e.g., memory constraints, simplicity)

## Verdict
- Clear statement of the winner and a summary of why

Use clean markdown. Be precise and educational.
""".strip()


def analyze_comparison(
    code_a: str, code_b: str,
    language_a: str, language_b: str,
) -> dict:
    """
    Non-streaming Groq call for Comparison Mode.
    Returns {hotspots_A, hotspots_B, winner, justification, comparison_summary}.
    Raises on API error, JSON parse failure, missing keys, or line count mismatch.
    """
    import json

    len_a = len(code_a.splitlines())
    len_b = len(code_b.splitlines())

    user_prompt = (
        f"Code A ({language_a}) — {len_a} lines:\n```\n{code_a}\n```\n\n"
        f"Code B ({language_b}) — {len_b} lines:\n```\n{code_b}\n```\n\n"
        f"hotspots_A must have exactly {len_a} entries. "
        f"hotspots_B must have exactly {len_b} entries."
    )

    response = _client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _COMPARISON_SYSTEM_INSTRUCTION},
            {"role": "user",   "content": user_prompt},
        ],
    )

    raw = response.choices[0].message.content.strip()
    # Strip accidental markdown fences if the model wraps the JSON
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    result = json.loads(raw)

    required_keys = {"hotspots_A", "hotspots_B", "winner", "justification", "comparison_summary"}
    missing = required_keys - result.keys()
    if missing:
        raise ValueError(f"Comparison response missing keys: {missing}")

    if result["winner"] not in ("A", "B"):
        raise ValueError(f"Invalid winner value: {result['winner']!r}")

    if len(result["hotspots_A"]) != len_a:
        raise ValueError(
            f"hotspots_A length {len(result['hotspots_A'])} != code_a line count {len_a}"
        )
    if len(result["hotspots_B"]) != len_b:
        raise ValueError(
            f"hotspots_B length {len(result['hotspots_B'])} != code_b line count {len_b}"
        )

    return result


def stream_comparison_analysis(
    code_a: str, code_b: str,
    language_a: str, language_b: str,
    winner: str, justification: str, comparison_summary: str,
):
    """
    Streaming Groq call that yields comparative analysis text chunks.
    Uses the winner/justification/summary already determined by analyze_comparison.
    """
    user_prompt = (
        f"Code A ({language_a}):\n```\n{code_a}\n```\n\n"
        f"Code B ({language_b}):\n```\n{code_b}\n```\n\n"
        f"Winner: Code {winner}\n"
        f"Key difference: {comparison_summary}\n"
        f"Justification: {justification}\n\n"
        "Write the full comparative analysis now."
    )

    stream = _client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _COMPARISON_ANALYSIS_SYSTEM_INSTRUCTION},
            {"role": "user",   "content": user_prompt},
        ],
        stream=True,
    )
    for chunk in stream:
        text = chunk.choices[0].delta.content
        if text:
            yield text
