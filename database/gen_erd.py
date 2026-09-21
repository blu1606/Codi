"""Generate ERD.drawio straight from database/schema.sql, so the diagram can never
drift from the DDL. One tab per subject area plus an overview."""
import html
import io
import re
from collections import defaultdict

SQL = r"database/schema.sql"
OUT = r"database/ERD.drawio"

AREAS = [
    ("2. Identity and Access", "#dae8fc", "#6c8ebf",
     ["roles", "users", "user_roles", "session", "account", "verification"]),
    ("3. Course and Content", "#d5e8d4", "#82b366",
     ["courses", "chapters", "lessons", "lesson_materials",
      "course_publication_requests"]),
    ("4. Course Knowledge Map", "#ffe6cc", "#d79b00",
     ["skills", "skill_prerequisites", "lesson_skills"]),
    ("5. Assessment", "#e1d5e7", "#9673a6",
     ["assessments", "quiz_questions", "quiz_options"]),
    ("6. Enrollment and Submissions", "#fff2cc", "#d6b656",
     ["enrollments", "lesson_progress", "assessment_submissions",
      "assessment_answers"]),
    ("7. Personalized Learning Path", "#f8cecc", "#b85450",
     ["personalized_learning_paths", "path_items", "enrollment_skill_mastery"]),
    ("8. Commerce", "#d0cee2", "#56517e",
     ["vouchers", "orders", "order_items", "payments"]),
    ("9. Interaction and AI", "#b0e3e6", "#0e8088",
     ["course_discussions", "course_reviews", "ai_interaction_logs"]),
]

ROW_H, HEAD_H, COL_W = 24, 30, 290

S_ENTITY = ("swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize={h};"
            "horizontalStack=0;resizeParent=1;resizeParentMax=0;html=1;marginBottom=0;"
            "fillColor={fill};strokeColor={stroke};fontSize=13;collapsible=0;")
S_ROW = ("text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;"
         "spacingLeft=6;spacingRight=6;overflow=hidden;points=[[0,0.5],[1,0.5]];"
         "portConstraint=eastwest;rotatable=0;whiteSpace=wrap;html=1;fontSize=11;")
S_ROW_PK = S_ROW + "fontStyle=1;"
S_FK = ("edgeStyle=entityRelationEdgeStyle;rounded=0;html=1;exitX=1;exitY=0.5;"
        "entryX=0;entryY=0.5;endArrow=ERone;startArrow=ERmany;endFill=0;startFill=0;")
S_TITLE = "text;html=1;align=left;verticalAlign=middle;fontStyle=1;fontSize=17;"
S_NOTE = ("shape=note;whiteSpace=wrap;html=1;size=16;fontSize=11;align=left;"
          "spacingLeft=6;verticalAlign=top;")

TYPE_RE = re.compile(
    r"^\s*(\w+)\s+((?:BIGINT|INT|SMALLINT|BOOLEAN|DECIMAL\([\d,]+\)|VARCHAR\(\d+\)|TEXT"
    r"|TIMESTAMPTZ\(\d\)|DATE))(?=\s|,|$)(.*)$", re.I)


def parse():
    sql = io.open(SQL, encoding="utf-8").read()
    clean = re.sub(r"/\*.*?\*/", "", sql, flags=re.S)
    clean = re.sub(r"--[^\n]*", "", clean)

    tables, fks = {}, []
    for m in re.finditer(r"CREATE TABLE (\w+)\s*\((.*?)\n\);", clean, re.S):
        name, body = m.group(1), m.group(2)
        cols = []
        for line in body.split("\n"):
            if "CONSTRAINT" in line or "PRIMARY KEY (" in line:
                continue
            tm = TYPE_RE.match(line)
            if tm:
                cols.append([tm.group(1), tm.group(2), "PK" if "PRIMARY KEY" in tm.group(3) else ""])
        # composite primary keys declared on their own line
        pk = re.search(r"\n\s*PRIMARY KEY \(([^)]*)\)", body)
        if pk:
            for c in [x.strip() for x in pk.group(1).split(",")]:
                for col in cols:
                    if col[0] == c:
                        col[2] = "PK"
        tables[name] = cols
        for f in re.finditer(r"FOREIGN KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)", body):
            fks.append((name, f.group(1), f.group(2)))
            for col in cols:
                if col[0] == f.group(1) and col[2] != "PK":
                    col[2] = "FK"
                elif col[0] == f.group(1):
                    col[2] = "PK,FK"
    return tables, fks


class Tab:
    def __init__(self, name):
        self.name, self.cells, self.n = name, [], 0

    def _id(self, p):
        self.n += 1
        return "%s%d" % (p, self.n)

    def raw(self, xml):
        self.cells.append(xml)

    def box(self, value, x, y, w, h, style, pre="n", parent="1"):
        i = self._id(pre)
        # labels are rendered as HTML, so a newline only shows up as <br>
        value = value.replace("\n", "<br>")
        self.raw('<mxCell id="%s" value="%s" style="%s" vertex="1" parent="%s">'
                 '<mxGeometry x="%s" y="%s" width="%s" height="%s" as="geometry"/></mxCell>'
                 % (i, html.escape(value), style, parent, x, y, w, h))
        return i

    def entity(self, name, cols, x, y, fill, stroke):
        h = HEAD_H + ROW_H * len(cols)
        eid = self.box(name, x, y, COL_W, h,
                       S_ENTITY.format(h=HEAD_H, fill=fill, stroke=stroke), "e")
        for k, (cname, ctype, flag) in enumerate(cols):
            label = ("%-4s %s : %s" % (flag, cname, ctype)) if flag else \
                    ("     %s : %s" % (cname, ctype))
            self.box(label, 0, HEAD_H + k * ROW_H, COL_W, ROW_H,
                     S_ROW_PK if flag else S_ROW, "r", eid)
        return eid, h

    def edge(self, src, tgt, label=""):
        i = self._id("f")
        self.raw('<mxCell id="%s" value="%s" style="%s" edge="1" parent="1" '
                 'source="%s" target="%s"><mxGeometry relative="1" as="geometry"/>'
                 '</mxCell>' % (i, html.escape(label), S_FK, src, tgt))

    def xml(self, did):
        return ('  <diagram name="%s" id="%s">\n'
                '    <mxGraphModel dx="1600" dy="1000" grid="1" gridSize="10" guides="1" '
                'tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" '
                'pageWidth="1169" pageHeight="827" math="0" shadow="0">\n      <root>\n'
                '        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n'
                '        %s\n      </root>\n    </mxGraphModel>\n  </diagram>'
                % (html.escape(self.name), did, "\n        ".join(self.cells)))


tables, fks = parse()
area_of = {t: a[0] for a in AREAS for t in a[3]}
missing = set(tables) - set(area_of)
assert not missing, "tables not assigned to an area: %s" % missing

tabs = []

# ---------------------------------------------------------------- overview
t = Tab("1. Module Map")
t.box("Codi - Database Schema v6  (28 tables)", 40, 20, 900, 30, S_TITLE)
pos, group_id, x, y = {}, {}, 40, 80
for title, fill, stroke, names in AREAS:
    gh = 40 + 30 * len(names) + 10
    gid = t.box(title, x, y, 260, gh,
                "swimlane;html=1;startSize=30;fillColor=%s;strokeColor=%s;fontStyle=1;"
                "fontSize=12;collapsible=0;" % (fill, stroke), "g")
    group_id[title] = gid
    for k, nm in enumerate(names):
        pos[nm] = t.box(nm, 15, 38 + 30 * k, 230, 24,
                        "rounded=0;html=1;fillColor=#ffffff;strokeColor=%s;fontSize=11;"
                        % stroke, "b", gid)
    x += 300
    if x > 1250:
        x, y = 40, y + 340
# Table-level edges here would be 40 crossing lines. Aggregate them into one
# edge per pair of areas, labelled with how many foreign keys it stands for.
pair_count = defaultdict(int)
for child, col, parent in fks:
    a, b = area_of[child], area_of[parent]
    if a != b:
        pair_count[(a, b)] += 1
for (a, b), cnt in sorted(pair_count.items()):
    t.raw('<mxCell id="%s" value="%d FK" style="%s" edge="1" parent="1" '
          'source="%s" target="%s"><mxGeometry relative="1" as="geometry"/></mxCell>'
          % (t._id("ae"), cnt,
             "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;"
             "strokeColor=#888888;fontSize=10;fontColor=#666666;jumpStyle=arc;",
             group_id[a], group_id[b]))
t.raw('<mxCell id="ov-note" value="%s" style="%s" vertex="1" parent="1">'
      '<mxGeometry x="40" y="740" width="880" height="86" as="geometry"/></mxCell>'
      % (html.escape(
          "Only cross-area foreign keys are drawn here. Each area tab shows that "
          "area's tables in full, with every column and every relationship.\n\n"
          "This file is generated from database/schema-v6.sql - edit the SQL, then "
          "regenerate, so the two can never disagree."), S_NOTE))
tabs.append(t)

# ---------------------------------------------------------------- area tabs
for title, fill, stroke, names in AREAS:
    t = Tab(title)
    t.box("Codi - " + title, 40, 10, 900, 30, S_TITLE)
    ids, x, y, row_max = {}, 40, 60, 0
    for nm in names:
        eid, h = t.entity(nm, tables[nm], x, y, fill, stroke)
        ids[nm] = eid
        row_max = max(row_max, h)
        x += COL_W + 130
        if x > 1250:
            x, y, row_max = 40, y + row_max + 80, 0
    external = {}
    for child, col, parent in fks:
        if child in ids and parent in ids:
            t.edge(ids[child], ids[parent], col)
        elif child in ids and parent not in external:
            external[parent] = None
    # stub boxes for tables this area points at but does not own
    if external:
        ex_y = y + row_max + 70
        t.box("referenced from other areas", 40, ex_y - 30, 400, 24,
              "text;html=1;align=left;fontStyle=2;fontSize=11;")
        ex_x = 40
        for parent in sorted(external):
            external[parent] = t.box(
                parent + "  (" + area_of[parent].split(". ")[1] + ")",
                ex_x, ex_y, 260, 30,
                "rounded=1;html=1;dashed=1;fillColor=none;fontSize=11;fontStyle=2;")
            ex_x += 290
            if ex_x > 1250:
                ex_x, ex_y = 40, ex_y + 60
        for child, col, parent in fks:
            if child in ids and parent in external:
                t.edge(ids[child], external[parent], col)
    tabs.append(t)

# ------------------------------------------------------------- conceptual tab
# Hand laid out, not generated: this level is about the domain story, so the
# boxes are concepts rather than tables. The table names in each box tie it
# back to the DDL.
C_BOX = ("rounded=1;whiteSpace=wrap;html=1;fontSize=12;fontStyle=1;arcSize=12;"
         "verticalAlign=middle;fillColor={f};strokeColor={s};")
C_AI = ("rounded=1;whiteSpace=wrap;html=1;fontSize=12;fontStyle=1;arcSize=12;"
        "fillColor=#b0e3e6;strokeColor=#0e8088;dashed=1;dashPattern=8 4;strokeWidth=2;")
C_EDGE = ("edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;"
          "fontSize=10;fontColor=#555555;strokeColor=#666666;jumpStyle=arc;"
          "labelBackgroundColor=#ffffff;")
C_AI_EDGE = ("edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;"
             "fontSize=10;fontColor=#0e8088;strokeColor=#0e8088;dashed=1;strokeWidth=2;"
             "jumpStyle=arc;labelBackgroundColor=#ffffff;")

GREEN, ORANGE, PURPLE = ("#d5e8d4", "#82b366"), ("#ffe6cc", "#d79b00"), ("#d0cee2", "#56517e")
YELLOW, RED, BLUE = ("#fff2cc", "#d6b656"), ("#f8cecc", "#b85450"), ("#dae8fc", "#6c8ebf")

# label, tables, x, y, colour
CONCEPTS = [
    ("Lecturer", "users, user_roles", 40, 90, BLUE),
    ("Course", "courses", 280, 90, GREEN),
    ("Chapter", "chapters", 520, 90, GREEN),
    ("Lesson", "lessons", 760, 90, GREEN),
    ("Lesson Material\nvideo / PDF / text", "lesson_materials", 1000, 90, GREEN),
    ("Course Knowledge Map\nconcepts + prerequisites",
     "skills, skill_prerequisites, lesson_skills", 280, 250, ORANGE),
    ("Learner", "users, user_roles", 40, 430, BLUE),
    ("Order and Payment", "orders, order_items, payments, vouchers", 280, 430, PURPLE),
    ("Enrollment\n+ learning goal", "enrollments", 520, 430, YELLOW),
    ("Diagnostic Assessment\nentry test", "assessments, quiz_questions", 760, 430, YELLOW),
    ("Skill Mastery\nBKT posterior per concept", "enrollment_skill_mastery",
     1000, 430, RED),
    ("Personalized Learning Path\nordered lessons + reason",
     "personalized_learning_paths, path_items", 1000, 600, RED),
    ("Study Lesson\n+ progress", "lesson_progress", 760, 600, YELLOW),
    ("Submission\nquiz auto / assignment graded",
     "assessment_submissions, assessment_answers", 520, 600, YELLOW),
    ("Discussion and Review", "course_discussions, course_reviews", 40, 600, PURPLE),
]

# from, to, label, is_ai
CONCEPT_EDGES = [
    ("Lecturer", "Course", "authors", False),
    ("Course", "Chapter", "contains", False),
    ("Chapter", "Lesson", "contains", False),
    ("Lesson", "Lesson Material", "holds", False),
    ("Course", "Course Knowledge Map", "AI extracts", True),
    ("Learner", "Order and Payment", "buys", False),
    ("Order and Payment", "Enrollment", "grants access", False),
    ("Enrollment", "Diagnostic Assessment", "takes", False),
    ("Diagnostic Assessment", "Skill Mastery", "seeds BKT", False),
    ("Skill Mastery", "Personalized Learning Path", "AI ranks lessons", True),
    ("Personalized Learning Path", "Study Lesson", "next lesson", False),
    ("Study Lesson", "Submission", "submits", False),
    ("Submission", "Skill Mastery", "BKT update", False),
    ("Course Knowledge Map", "Personalized Learning Path", "prerequisite order", True),
    ("Learner", "Discussion and Review", "asks / rates", False),
]

t = Tab("0. Conceptual")
t.box("Codi - Conceptual Data Model", 40, 20, 900, 30, S_TITLE)
node = {}
for label, tbls, x, y, (fill, stroke) in CONCEPTS:
    # the first line of the label is the key the edge list refers to
    node[label.split("\n")[0]] = t.box(
        label, x, y, 180, 70, C_BOX.format(f=fill, s=stroke), "c")
    t.box(tbls, x, y + 72, 180, 30,
          "text;html=1;align=center;fontSize=9;fontColor=#777777;", "cl")

ai = t.box("AI Service\nLLM provider", 1290, 300, 180, 70, C_AI, "ai")
DETOUR = {("Submission", "Skill Mastery"):
          "exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;"}
for src, dst, lbl, is_ai in CONCEPT_EDGES:
    style = (C_AI_EDGE if is_ai else C_EDGE) + DETOUR.get((src, dst), "")
    t.raw('<mxCell id="%s" value="%s" style="%s" edge="1" parent="1" source="%s" '
          'target="%s"><mxGeometry relative="1" as="geometry"/></mxCell>'
          % (t._id("ce"), html.escape(lbl), style, node[src], node[dst]))
for target in ("Course Knowledge Map", "Personalized Learning Path"):
    t.raw('<mxCell id="%s" value="" style="%s" edge="1" parent="1" source="%s" '
          'target="%s"><mxGeometry relative="1" as="geometry"/></mxCell>'
          % (t._id("ce"), C_AI_EDGE, ai, node[target]))

t.raw('<mxCell id="c-note" value="%s" style="%s" vertex="1" parent="1">'
      '<mxGeometry x="1290" y="430" width="300" height="250" as="geometry"/></mxCell>'
      % (html.escape(
          "Teal dashed = where the AI does the work.\n\n"
          "1. It reads the authored lessons and derives the concepts plus the "
          "prerequisite order between them.\n\n"
          "2. It ranks the remaining lessons against the learner's mastery and "
          "goal, and writes the reason for that order.\n\n"
          "Not the AI: prerequisite order is a hard constraint it cannot break, "
          "and mastery is computed by Bayesian Knowledge Tracing so the result "
          "stays reproducible.\n\n"
          "The cycle Mastery -> Path -> Study -> Submission -> Mastery is the "
          "adaptive loop. The grey text under each box names the tables."), S_NOTE))
tabs.insert(0, t)

out = ('<mxfile host="Electron">\n'
       + "\n".join(tb.xml("erd-%d" % k) for k, tb in enumerate(tabs))
       + "\n</mxfile>\n")
io.open(OUT, "w", encoding="utf-8").write(out)
print("tables: %d | foreign keys: %d | tabs: %d" % (len(tables), len(fks), len(tabs)))
for tb in tabs:
    print("  ", tb.name)
