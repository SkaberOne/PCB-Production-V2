import re, csv, xml.etree.ElementTree as ET
from collections import defaultdict, OrderedDict

BRD = "/root/.claude/uploads/f54ae049-b5a6-5ea3-aee2-44d5da6c6ab1/070846d8-KT240576C__OTR_board_Bicolor.brd"
SCH = "/root/.claude/uploads/f54ae049-b5a6-5ea3-aee2-44d5da6c6ab1/9431a15a-KT240576C__OTR_board_Bicolor.sch"

def parse_rot(rot):
    rot = rot or "R0"
    side = "bottom" if "M" in rot else "top"
    m = re.search(r"(\d+)", rot)
    ang = int(m.group(1)) if m else 0
    return side, ang

# --- BRD : éléments placés (BOM + centroïde) ---
brd = ET.parse(BRD).getroot()
elements = []
for el in brd.iter("element"):
    side, ang = parse_rot(el.get("rot"))
    elements.append({
        "ref": el.get("name"),
        "value": (el.get("value") or "").strip(),
        "package": el.get("package") or "",
        "x": float(el.get("x")), "y": float(el.get("y")),
        "rot": ang, "side": side,
    })

# --- SCH : MPN par référence (attributs fabricant) ---
sch = ET.parse(SCH).getroot()
mpn = {}
# parts + leurs attributs (dans les instances/technologies)
for part in sch.iter("part"):
    name = part.get("name")
    for attr in part.iter("attribute"):
        if attr.get("name") == "MANUFACTURER_PART_NUMBER" and attr.get("value"):
            mpn[name] = attr.get("value")
# fallback : attributs au niveau instances
for inst in sch.iter("instance"):
    name = inst.get("part")
    for attr in inst.iter("attribute"):
        if attr.get("name") == "MANUFACTURER_PART_NUMBER" and attr.get("value"):
            mpn.setdefault(name, attr.get("value"))
for e in elements:
    e["mpn"] = mpn.get(e["ref"], "")

# --- Tri naturel des refs ---
def natkey(r):
    m = re.match(r"([A-Za-z]+)(\d+)", r or "")
    return (m.group(1), int(m.group(2))) if m else (r, 0)
elements.sort(key=lambda e: natkey(e["ref"]))

# --- BOM groupée par valeur+empreinte ---
groups = OrderedDict()
for e in elements:
    key = (e["value"], e["package"])
    groups.setdefault(key, []).append(e["ref"])

with_value = [e for e in elements if e["value"]]
no_value = [e for e in elements if not e["value"]]

# --- Sorties ---
with open("/tmp/OTR_placement.csv","w",newline="") as f:
    w = csv.writer(f); w.writerow(["ref","value","package","side","x","y","rot","mpn"])
    for e in elements:
        w.writerow([e["ref"],e["value"],e["package"],e["side"],e["x"],e["y"],e["rot"],e["mpn"]])

lines = []
lines.append(f"# BOM extraite — OTR Board Bicolor (KT240576C)\n")
lines.append(f"Source : fichiers Eagle 9.6.2 (.brd + .sch), parsés directement.\n")
lines.append(f"- **Composants placés (total)** : {len(elements)}")
lines.append(f"- Avec valeur : {len(with_value)} · sans valeur (trous/fiduciaux/logos ?) : {len(no_value)}")
top = sum(1 for e in elements if e['side']=='top'); bot = sum(1 for e in elements if e['side']=='bottom')
lines.append(f"- Face **top** : {top} · face **bottom** : {bot}")
lines.append(f"- Références (lignes) BOM distinctes (valeur+empreinte) : {len(groups)}\n")

lines.append("## BOM groupée (valeur × empreinte)\n")
lines.append("| Qté | Valeur | Empreinte | MPN | Références |")
lines.append("|---:|---|---|---|---|")
def gkey(item):
    (val,pkg),refs = item
    return (val=="" , val, pkg)
for (val,pkg),refs in sorted(groups.items(), key=gkey):
    refs_sorted = sorted(refs, key=natkey)
    m = ""
    for r in refs_sorted:
        if mpn.get(r): m = mpn[r]; break
    lines.append(f"| {len(refs)} | {val or '—'} | {pkg} | {m} | {', '.join(refs_sorted)} |")

if no_value:
    lines.append("\n## Éléments sans valeur (à exclure de la BOM ?)\n")
    lines.append(", ".join(sorted([e['ref'] for e in no_value], key=natkey)))

open("/tmp/OTR_BOM_extraite.md","w").write("\n".join(lines))
print("\n".join(lines[:6]))
print("... (fichier complet écrit)")
print("\nGROUPES:", len(groups), "| total:", len(elements), "| top:", top, "bottom:", bot, "| sans valeur:", len(no_value))
print("MPN trouvés:", len(mpn), "->", mpn)
