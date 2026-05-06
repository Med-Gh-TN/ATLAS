"""
src/services/fusion/query_normalizer.py
════════════════════════════════════════════════════════════════════════════════
Query Normalization & Heuristics
════════════════════════════════════════════════════════════════════════════════
Single Responsibility: Synchronous string operations, LaTeX expansion, and 
regex-based routing heuristics. Compiled at module load to ensure O(1) runtime.
"""

import re

# ──────────────────────────────────────────────────────────────────────────────
# MATH / LATEX QUERY NORMALISATION
# ──────────────────────────────────────────────────────────────────────────────

_LATEX_SUBS: list[tuple[str, str]] = [
    # Display delimiters
    (r"\$\$([^$]+)\$\$",                  r" \1 "),
    (r"\$([^$]+)\$",                      r" \1 "),
    # Fractions
    (r"\\frac\{([^}]+)\}\{([^}]+)\}",     r"\1 over \2"),
    # Integrals
    (r"\\int_\{([^}]+)\}\^\{([^}]+)\}",  r"integral from \1 to \2 of"),
    (r"\\int",                            r"integral"),
    # Sums / products
    (r"\\sum_\{([^}]+)\}\^\{([^}]+)\}",  r"sum from \1 to \2 of"),
    (r"\\sum",                            r"summation"),
    (r"\\prod",                           r"product"),
    # Calculus
    (r"\\partial",                        r"partial derivative"),
    (r"\\nabla",                          r"gradient nabla"),
    (r"\\infty",                          r"infinity"),
    (r"\\sqrt\{([^}]+)\}",                r"square root of \1"),
    (r"\\lim_\{([^}]+)\}",               r"limit as \1"),
    # Greek letters
    (r"\\alpha",   "alpha"),   (r"\\beta",  "beta"),
    (r"\\gamma",   "gamma"),   (r"\\delta", "delta"),
    (r"\\epsilon", "epsilon"), (r"\\theta", "theta"),
    (r"\\lambda",  "lambda"),  (r"\\mu",    "mu"),
    (r"\\sigma",   "sigma"),   (r"\\pi",    "pi"),
    (r"\\omega",   "omega"),   (r"\\rho",   "rho"),
    (r"\\phi",     "phi"),     (r"\\psi",   "psi"),
    (r"\\xi",      "xi"),      (r"\\eta",   "eta"),
    # Operators
    (r"\\times",   "times"),
    (r"\\cdot",    "dot product"),
    (r"\\leq",     "less than or equal to"),
    (r"\\geq",     "greater than or equal to"),
    (r"\\neq",     "not equal to"),
    (r"\\approx",  "approximately equal to"),
    (r"\\equiv",   "equivalent to"),
    # Sets / Logic
    (r"\\in",      "element of"),
    (r"\\subset",  "subset of"),
    (r"\\cup",     "union"),
    (r"\\cap",     "intersection"),
    (r"\\forall",  "for all"),
    (r"\\exists",  "there exists"),
    (r"\\rightarrow",     "implies"),
    (r"\\Rightarrow",     "implies"),
    (r"\\leftrightarrow", "if and only if"),
    # Number sets
    (r"\\mathbb\{R\}",   "real numbers"),
    (r"\\mathbb\{N\}",   "natural numbers"),
    (r"\\mathbb\{Z\}",   "integers"),
    (r"\\mathbb\{C\}",   "complex numbers"),
    # Clean-up
    (r"\\[a-zA-Z]+",     ""),   # strip remaining LaTeX commands
    (r"\{|\}",           " "),  # remove braces
    (r"\s{2,}",          " "),  # collapse whitespace
]

_LATEX_RE: list[tuple[re.Pattern, str]] = [
    (re.compile(pat), repl) for pat, repl in _LATEX_SUBS
]

_HAS_LATEX = re.compile(r"\\[a-zA-Z]+|\$\$?")


def normalize_math_query(query: str) -> str:
    """
    Expand LaTeX in a query string to natural language.
    Returns: original + " " + normalised_form (if different).
    Pure text queries pass through unchanged.
    """
    if not _HAS_LATEX.search(query):
        return query

    norm = query
    for pattern, repl in _LATEX_RE:
        norm = pattern.sub(repl, norm)
    norm = norm.strip()

    if norm and norm != query:
        # Append normalised form so both LaTeX tokens AND NL tokens are
        # available for ColBERT to match against stored chunks.
        return f"{query} {norm}"
    return query


# ──────────────────────────────────────────────────────────────────────────────
# VLM SHORT-CIRCUIT — Visual Query Heuristic
# ──────────────────────────────────────────────────────────────────────────────

_VISUAL_QUERY_RE = re.compile(
    r"\b("
    r"diagram|chart|figure|image|graph|plot|visual|screenshot|"
    r"illustration|drawing|picture|photo|photograph|depicted|"
    r"displayed|shown in|based on the|what does the .{0,30} show|"
    r"according to the .{0,20} (figure|chart|diagram|image|graph)|"
    r"as (shown|depicted|illustrated|displayed) in|"
    r"refer(ring)? to (figure|chart|diagram|image|graph|table)"
    r")\b",
    re.IGNORECASE,
)


def needs_visual_context(query: str) -> bool:
    """
    Detect if the user is explicitly referring to a visual element,
    triggering the Image retrieval bypass.
    """
    return bool(_VISUAL_QUERY_RE.search(query))