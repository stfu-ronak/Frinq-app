"""Faithful, AI-free export of a single user's quiz responses.

Renders the EXACT questionnaire wording and the EXACT answer the user gave —
nothing summarised, nothing interpreted. Every multi-part question is expanded
into its own row: the 4 opinions, the 3 opinion "why"s, the 4 sliders, and the
10 rapid-fire items each appear separately, with their real prompts.

Pure-stdlib for `build_rows` (works on the 3.9 offline venv AND 3.12 prod);
`to_xlsx` needs openpyxl (in requirements). No DB, no network, no Claude.

The instrument spec below mirrors `.do/frinq-questions 1.json` verbatim and is
embedded (not read from disk) so the export is deploy-safe.
"""
from __future__ import annotations

import io
import re
from typing import Any, List, Optional, Tuple

Row = Tuple[str, str]  # (question, answer)

VOICE = "[voice response]"
EMPTY = "—"

# value → exact option label, for the single-pick questions stored as short keys
_LABELS = {
    "trip": {
        "upset": "genuinely upset", "annoyed": "annoyed",
        "relieved": "secretly relieved", "backup": "had a backup",
    },
    "travel_style": {
        "research": "research beforehand",
        "on-the-spot": "figure things out on the spot",
        "follow": "follow whoever planned it", "random": "explore randomly",
    },
    "connection_mode": {
        "activity": "we're doing an activity together",
        "deep-talk": "we're talking deeply", "laughter": "we're laughing a lot",
        "exploring": "we're exploring something new",
        "group-vibe": "we're part of the same group vibe",
    },
    "would_rather": {
        "build": "build something together",
        "explore": "explore something new together",
        "talk": "talk for hours, no agenda", "compete": "compete or play together",
        "vibe": "just sit and exist together",
    },
    "meeting_style": {
        "one-on-one": "talking one-on-one", "small": "small group conversations",
        "large": "being around larger groups", "depends": "depends on the vibe",
    },
}

# opinions: (storage key prompt) → the two exact statements
_OPINIONS = [
    ("on ai taking over:", "it will replace everything we know.", "humans can't truly be replaced."),
    ("when it comes to truth:", "hard truth, always. no sugarcoating.", "empathy matters more than brutal honesty."),
    ("you respect people who:", "have a five year plan and stick to it.", "live fully in the moment."),
    ("on how people show up:", "word is bond.", "action > words."),
]
_OPINION_WHY = [
    "what makes you think so?  (why — your AI take)",
    "any reason why?  (why — on truth)",
    "care to share why?  (why — people you respect)",
    "why's that?  (why — on how people show up)",
]
_SLIDERS = [
    ("you trust more", "what you can see", "what you sense"),
    ("you decide things more with", "your heart", "your head"),
    ("you grow more from", "going deeper", "going wider"),
    ("if you had to pick, you'd rather be", "kind", "honest"),
]
_RAPID = [
    ("confront immediately", "take time to process"),
    ("deep 2 am talks", "random bakchodi"),
    ("home early", "home late"),
    ("mountain person", "beach person"),
    ("i make the plans", "i join the plans"),
    ("need regular catch-ups", "pick up where we left off"),
    ("new cultures", "deeper into my own"),
    ("hiking with strangers", "poker with strangers"),
    ("i'm always the host", "i'm never the host"),
    ("call everyday", "call once a week"),
]


def _multi(v: Any) -> List[str]:
    """Exact picks of a multi-select, robust to list-or-comma-joined storage."""
    if not v:
        return []
    items = v if isinstance(v, list) else [v]
    out: List[str] = []
    for it in items:
        for part in re.split(r",\s*", str(it)):
            part = part.strip()
            if part and part != VOICE:
                out.append(part)
    return out


def _multi_str(v: Any) -> str:
    picks = _multi(v)
    return "\n".join("• " + p for p in picks) if picks else EMPTY


def _text(v: Any) -> str:
    if v is None:
        return EMPTY
    s = str(v).strip()
    if not s:
        return EMPTY
    if s == VOICE:
        return "🎤 voice answer (not transcribed)"
    return s


def _paired_pick(stored: Any, a: str, b: str) -> str:
    """Which exact statement the user chose from an A/B pair (by membership)."""
    picks = {str(x).strip().lower() for x in (stored or [])}
    if a.lower() in picks:
        return a
    if b.lower() in picks:
        return b
    return EMPTY


def build_rows(answers: Optional[dict]) -> List[Row]:
    """The faithful transcript: ordered (question, answer) rows, sub-questions
    expanded, exact wording. No interpretation."""
    a = answers or {}
    rows: List[Row] = []

    def single(key: str, q: str) -> None:
        v = a.get(key)
        label = _LABELS.get(key, {}).get(str(v).strip().lower(), v) if v else None
        rows.append((q, str(label) if label not in (None, "") else EMPTY))

    # identity
    rows.append(("what should we call you?", _text(a.get("name"))))
    rows.append(("when were you born?", _text(a.get("dob"))))
    rows.append(("where do you live?", _text(a.get("city"))))

    # section 1 — who you are
    single("social_type", "what is your social type?")
    single("saturday", "my ideal saturday looks like")
    rows.append(("what's your scene?", _multi_str(a.get("scene") or a.get("substance_scene"))))
    rows.append(("any weird hobbies you're proud of?", _multi_str(a.get("hobbies"))))
    rows.append(("pick your interests", _multi_str(a.get("interests"))))

    # section 2 — what would you do
    single("connection", "what makes a random stranger interesting to you?")
    single("trip", "a weekend trip you waited all week for got cancelled last minute. what's your first reaction?")
    single("travel_style", "when you go somewhere new, you usually...")
    single("connection_mode", "you're most likely to connect with someone when...")
    rows.append(("which of these would you most likely say yes to?", _multi_str(a.get("event_yes"))))
    rows.append(("which sounds like your nightmare?", _multi_str(a.get("event_no"))))
    single("would_rather", "with someone you click with, what would you rather do?")
    single("meeting_style", "when meeting new people, what feels most natural?")
    rows.append(("how do you show up for people you care about?", _multi_str(a.get("show_up"))))
    rows.append(("in a new friend, what are your instant turn-offs?", _multi_str(a.get("red_flags"))))
    rows.append(("what kind of people are you looking for?", _multi_str(a.get("looking_for"))))
    rows.append(("think of a time you made a friend unexpectedly. how did it happen?", _text(a.get("story"))))

    # section 3 — opinions
    stored_op = a.get("opinions") or []
    for prompt, opt_a, opt_b in _OPINIONS:
        rows.append((prompt, _paired_pick(stored_op, opt_a, opt_b)))
    why = a.get("opinions_why") or []
    if isinstance(why, str):
        # Historical submissions (pre opinions-why-inline) stored one shared
        # string instead of one answer per pair — don't index into its chars.
        why = [why]
    for i, q in enumerate(_OPINION_WHY):
        rows.append((q, _text(why[i]) if i < len(why) else EMPTY))

    # section 3 — sliders (0..100)
    prefs = a.get("preferences") or []
    for i, (prompt, left, right) in enumerate(_SLIDERS):
        if i < len(prefs) and isinstance(prefs[i], (int, float)):
            rows.append((f"{prompt}  ({left} ← → {right})", f"{int(prefs[i])} / 100"))
        else:
            rows.append((f"{prompt}  ({left} ← → {right})", EMPTY))

    # section 3 — rapid fire
    stored_rapid = a.get("rapid") or []
    for opt_a, opt_b in _RAPID:
        rows.append((f"{opt_a}  ↔  {opt_b}", _paired_pick(stored_rapid, opt_a, opt_b)))

    return rows


def to_csv(answers: Optional[dict]) -> str:
    import csv
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Question", "Answer"])
    for q, ans in build_rows(answers):
        w.writerow([q, ans])
    return buf.getvalue()


def to_xlsx(answers: Optional[dict], *, title: str = "Responses") -> bytes:
    """Single-user faithful transcript as a styled .xlsx (bytes)."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    wb = Workbook()
    ws = wb.active
    ws.title = "responses"
    head_f = Font(bold=True, color="FFFFFF", size=12)
    head_fill = PatternFill("solid", fgColor="4F46E5")
    qfill = PatternFill("solid", fgColor="F1F5F9")
    qfont = Font(bold=True, size=11)
    wrap = Alignment(wrap_text=True, vertical="top")
    thin = Side(style="thin", color="D0D7E2")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    for c, t in enumerate(["Question", title], 1):
        cell = ws.cell(1, c, t)
        cell.font, cell.fill, cell.alignment, cell.border = head_f, head_fill, wrap, border
    for r, (q, ans) in enumerate(build_rows(answers), 2):
        qc = ws.cell(r, 1, q)
        qc.font, qc.fill, qc.alignment, qc.border = qfont, qfill, wrap, border
        ac = ws.cell(r, 2, ans)
        ac.alignment, ac.border = wrap, border
    ws.column_dimensions["A"].width = 52
    ws.column_dimensions["B"].width = 60
    ws.freeze_panes = "A2"

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
