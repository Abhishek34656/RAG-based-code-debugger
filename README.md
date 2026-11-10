# RAG-Based Code Debugger

A web app that finds and fixes bugs in your code using retrieval-augmented generation. Paste code in one of 8 languages, and the app retrieves relevant debugging rules from a curated knowledge base, sends them to Llama 3.3 70B on Groq, and streams back a bug analysis, corrected code, and a complexity breakdown.

## Why this exists

Language models often suggest fixes without any way to verify them. This project grounds each fix in a knowledge base of 89 debugging rules, so every bug the model reports points to a named rule you can check.

## Features

- **Rule-grounded debugging.** Each response cites the retrieved rules it used.
- **8 languages.** Python, C++, JavaScript, Java, C, TypeScript, Go, and Rust.
- **Structured output.** Every answer has four sections: Bug Analysis, Fixed Code, Complexity Analysis (time and space), and Explanation of Fixes.
- **Live streaming.** Responses appear token by token over server-sent events (SSE).
- **Comparison Mode.** Submit two solutions to the same problem. The app rates every line from 1 to 10 for complexity, shows both as side-by-side heatmaps (green for low, red for high), names the more efficient solution, and explains why.

## How it works

1. You select a language and paste code.
2. `rag_engine.py` scores every rule in `knowledge_base.txt` by keyword overlap with your code.
3. If the language has its own section, 6 of the 10 retrieved rules come from that section and the other 4 come from all remaining sections. This keeps language-specific pitfalls in every prompt.
4. The rules and your code are combined into a prompt and sent to `llama-3.3-70b-versatile` through the Groq API.
5. The response streams to the browser and is rendered as markdown.

In Comparison Mode, one non-streaming call returns the per-line ratings and the winner as JSON. A second streaming call then writes the full comparative analysis.

## Tech stack

| Layer | Tools |
| --- | --- |
| Backend | Python, Flask |
| LLM | Llama 3.3 70B Versatile via the Groq API |
| Retrieval | Keyword-overlap scoring over a plain-text knowledge base |
| Frontend | HTML, CSS, vanilla JavaScript |
| Transport | Server-sent events (SSE) |

## Project structure

```
rag-code-debugger/
├── app.py                # Flask app, /debug endpoint, SSE streaming
├── rag_engine.py         # Rule parsing, retrieval, prompt building
├── gemini_client.py      # Groq API client (legacy filename)
├── knowledge_base.txt    # 89 debugging rules grouped by language
├── requirements.txt
├── .env.example
└── static/
    ├── index.html
    ├── script.js
    └── style.css
```

## Getting started

**Requirements:** Python 3.10 or newer and a free Groq API key from https://console.groq.com.

```bash
# 1. Clone the repository
git clone https://github.com/Abhishek34656/RAG-based-code-debugger.git
cd RAG-based-code-debugger/rag-code-debugger

# 2. (Optional) create a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Add your API key
cp .env.example .env
# open .env and set GROQ_API_KEY=your_key_here

# 5. Run the app
python app.py
```

Open http://localhost:5000 in your browser. Press `Ctrl+Enter` in the editor to run the debugger.

Never commit your `.env` file. It is already listed in `.gitignore`.

## API

### `POST /debug`

**Single mode**

```json
{
  "mode": "single",
  "language": "Python",
  "code": "def add(a, b):\n    return a - b"
}
```

The response is a stream of SSE events:

| Event payload | Meaning |
| --- | --- |
| `{"rules_used": 10}` | Number of rules retrieved for this request |
| `{"chunk": "..."}` | A piece of the markdown answer |
| `{"done": true}` | The stream finished |
| `{"error": "..."}` | Something failed |

**Comparison mode**

```json
{
  "mode": "comparison",
  "code_a": "...",
  "language_a": "Python",
  "code_b": "...",
  "language_b": "Python"
}
```

The stream sends `heatmap_a` and `heatmap_b` (one rating per line), then `winner`, `justification`, and `comparison_summary`, followed by `chunk` events with the full analysis.

## Extending the knowledge base

Open `knowledge_base.txt`. Section headers start with `#`, and each rule is one line starting with `RULE:`.

```
# Python Debugging Rules
RULE: Mutable default arguments are shared across calls. Use None and create the object inside the function.
```

To support a new language, add a section and map its name to the section header in `LANGUAGE_SECTION_MAP` inside `rag_engine.py`. Then add the language to the dropdowns in `static/index.html`.

## Known limitations

- Retrieval uses keyword overlap, so a rule that uses different words than your code can score low even when it applies.
- The knowledge base is hand-written and covers common pitfalls, not every error.
- Comparison Mode requires the model to return valid JSON with one rating per line. Very long snippets can fail this check.
- The Flask server runs in debug mode. Use a production server such as Gunicorn before deploying.

## Roadmap

- Replace keyword scoring with embeddings and a vector store.
- Grow the knowledge base using real error messages and fixes.
- Add automated tests for the retrieval step.
- Support uploading a whole file or repository.

## Authors

- Abhishek
- Kapil Verma

## License

Add a license of your choice here, for example MIT.
