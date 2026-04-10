import os
from typing import NamedTuple

KNOWLEDGE_BASE_PATH = os.path.join(os.path.dirname(__file__), "knowledge_base.txt")

# How many rules to return in total
TOP_N = 10
# For language-specific sections: guarantee this many slots from the matching section
PRIORITY_SLOTS = 6

# Maps normalised language name -> knowledge base section label
LANGUAGE_SECTION_MAP = {
    "c++":        "C++ Common Pitfalls",
    "cpp":        "C++ Common Pitfalls",
    "python":     "Python Debugging Rules",
    "javascript": "JavaScript Common Pitfalls",
    "js":         "JavaScript Common Pitfalls",
    "java":       "Java Common Pitfalls",
    "c":          "C Common Pitfalls",
    "typescript": "TypeScript Common Pitfalls",
    "ts":         "TypeScript Common Pitfalls",
    "go":         "Go Common Pitfalls",
    "rust":       "Rust Common Pitfalls",
}


class Rule(NamedTuple):
    text:    str   # full "RULE: ..." line
    section: str   # section header it belongs to


def load_rules() -> list[Rule]:
    """
    Parse knowledge_base.txt into Rule objects, tracking which section
    each rule belongs to based on '# Section Name' headers.
    """
    rules: list[Rule] = []
    current_section = "General"

    with open(KNOWLEDGE_BASE_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("#"):
                current_section = line.lstrip("#").strip()
            elif line.startswith("RULE:"):
                rules.append(Rule(text=line, section=current_section))

    return rules


def _score(rule: Rule, query: str) -> int:
    """Keyword overlap score between a rule and the query string."""
    words = [w.strip(".,();:`'\"") for w in rule.text.lower().split() if len(w) > 4]
    return sum(1 for w in words if w in query)


def retrieve_relevant_rules(code: str, language: str) -> list[Rule]:
    """
    Return the top TOP_N most relevant rules for the given code and language.

    If the language has a dedicated section in the knowledge base, the first
    PRIORITY_SLOTS slots are filled exclusively from that section (by score),
    ensuring language-specific pitfalls always dominate the context window.
    The remaining slots are filled from all other sections by score.
    """
    query = f"{language.lower()} {code.lower()}"
    all_rules = load_rules()

    lang_key = language.strip().lower()
    priority_section = LANGUAGE_SECTION_MAP.get(lang_key)

    if priority_section:
        lang_rules  = [r for r in all_rules if r.section == priority_section]
        other_rules = [r for r in all_rules if r.section != priority_section]

        top_lang  = sorted(lang_rules,  key=lambda r: _score(r, query), reverse=True)
        top_other = sorted(other_rules, key=lambda r: _score(r, query), reverse=True)

        selected = top_lang[:PRIORITY_SLOTS] + top_other[:TOP_N - PRIORITY_SLOTS]
    else:
        # Unknown language — just rank everything by keyword score
        selected = sorted(all_rules, key=lambda r: _score(r, query), reverse=True)[:TOP_N]

    return selected


def build_prompt(code: str, language: str, rules: list[Rule]) -> str:
    rules_block = "\n".join(f"- [{r.section}] {r.text[len('RULE: '):]}" for r in rules)
    lang_lower  = language.lower()
    return f"""## Retrieved Debugging Rules
The following rules were retrieved from the knowledge base. Reference them by name when identifying bugs:
{rules_block}

## Submitted Code ({language})
```{lang_lower}
{code}
```

## Instructions
Analyze the code above using the retrieved rules. Your response MUST include all four sections:
1. **Bug Analysis** — list every bug and cite the relevant rule.
2. **Fixed Code** — the complete corrected {language} program.
3. **Complexity Analysis** — Time and Space Big-O for the FIXED code with justification. This section is mandatory.
4. **Explanation of Fixes** — one concise bullet per fix.
"""
