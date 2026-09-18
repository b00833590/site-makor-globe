# Merges multiple .pptx files into one .pptx (one slide-deck containing every
# input deck's slides, in order). Free, no external service, no quota — see
# the CREDITS_EXCEEDED incident that grounded the earlier CloudConvert-based
# PPTX->PDF path this feature replaced.
#
# --- Why this is raw OOXML package splicing, not python-pptx shape-copying ---
# The first version of this function used python-pptx to clone each slide's
# SHAPES one by one onto a blank layout in a shared base presentation. That
# broke on real files: PowerPoint reported "needs repair", and after repair
# several slides came back blank. Root cause, confirmed by inspecting an
# actual broken output file byte-for-byte: a shape like a native PowerPoint
# chart carries an r:id attribute (e.g. <c:chart r:id="rId3">) pointing at a
# relationship declared in ITS OWN source slide's .rels file. A raw XML
# clone of that shape copies the r:id reference but not the relationship
# declaration, nor the chart part itself, nor its embedded Excel workbook —
# the copy ends up with a dangling reference PowerPoint can't resolve. This
# generalizes to any shape carrying an external relationship (charts,
# SmartArt, OLE objects, hyperlinks) — patching each shape type
# individually is whack-a-mole, not a fix.
#
# Instead, each source file's slide(s) are imported COMPLETE with their own
# native layout, slide master, theme, images, charts and embedded objects —
# the exact same self-contained subtree PowerPoint itself already considers
# valid, since it's exactly what the source file already was. Every part
# from a given source is copied byte-for-byte and given a unique filename
# prefix (so files from different sources never collide), and each part's
# own relationship ids are left completely untouched — only the FILENAME
# each relationship's Target points at is updated to match the new prefixed
# name. Nothing internal to a slide/layout/master/chart's XML content ever
# needs rewriting, which is what makes this reliable: the only new
# structure built from scratch is the top-level ppt/presentation.xml (the
# combined slide list) and its relationships and [Content_Types].xml.
#
# Known, unavoidable OOXML constraint (not a bug): a single .pptx has
# exactly ONE slide size for the whole file. If source decks were authored
# at different sizes, the merged file uses the first (base) deck's size,
# and slides from a differently-sized source may appear scaled to fit.
#
# This is the project's first Python serverless function (everything else
# on Vercel here is either the static index.html or a small Node function)
# — Vercel's Python runtime auto-detects any api/*.py file, no extra config
# beyond api/requirements.txt for the lxml/python-pptx dependencies.

import io
import json
import re
import zipfile
from http.server import BaseHTTPRequestHandler
from lxml import etree

RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'
PML_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'
REL_TYPE_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
MAX_TOTAL_BYTES = 80 * 1024 * 1024  # well under Vercel's 100MB request body limit

SKIP_EXACT = {'[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels'}


# ---------------------------------------------------------------------------
# Splice merge
# ---------------------------------------------------------------------------

def _rename_filename(path, prefix):
    if '/' in path:
        dirpart, filename = path.rsplit('/', 1)
        return f'{dirpart}/{prefix}{filename}'
    return f'{prefix}{path}'


def _load_source(name, stream, prefix):
    """Reads one source .pptx and returns every part it needs (renamed with
    `prefix` so it can never collide with another source's parts), plus the
    ordered lists (slides, masters, notes masters) resolved from THIS
    source's own presentation.xml — used later to splice the combined
    presentation.xml in merge_pptx_files."""
    zf = zipfile.ZipFile(stream)
    names = set(zf.namelist())
    if 'ppt/presentation.xml' not in names or 'ppt/_rels/presentation.xml.rels' not in names:
        raise ValueError('structure .pptx invalide (presentation.xml manquant)')

    pres_xml = etree.fromstring(zf.read('ppt/presentation.xml'))
    pres_rels_xml = etree.fromstring(zf.read('ppt/_rels/presentation.xml.rels'))
    rel_target_by_id = {
        el.get('Id'): el.get('Target')
        for el in pres_rels_xml.findall(f'{{{RELS_NS}}}Relationship')
    }

    def resolve_and_rename(rid):
        target = rel_target_by_id[rid]
        p = target if target.startswith('ppt/') else f'ppt/{target}'
        return _rename_filename(p, prefix)

    def collect_ordered(list_tag):
        lst = pres_xml.find(f'{{{PML_NS}}}{list_tag}')
        out = []
        if lst is None:
            return out
        for child in lst:
            rid = child.get(f'{{{REL_TYPE_NS}}}id')
            if rid is not None:
                out.append(resolve_and_rename(rid))
        return out

    slide_paths = collect_ordered('sldIdLst')
    master_paths = collect_ordered('sldMasterIdLst')
    notes_master_paths = collect_ordered('notesMasterIdLst')

    pres_theme_path = pres_props_path = view_props_path = table_styles_path = None
    for el in pres_rels_xml.findall(f'{{{RELS_NS}}}Relationship'):
        t = el.get('Type', '')
        if t.endswith('/theme'):
            pres_theme_path = resolve_and_rename(el.get('Id'))
        elif t.endswith('/presProps'):
            pres_props_path = resolve_and_rename(el.get('Id'))
        elif t.endswith('/viewProps'):
            view_props_path = resolve_and_rename(el.get('Id'))
        elif t.endswith('/tableStyles'):
            table_styles_path = resolve_and_rename(el.get('Id'))

    if not slide_paths:
        raise ValueError('aucune slide trouvée dans ce fichier')

    parts = {}
    for n in names:
        if n in SKIP_EXACT or n.startswith('docProps/'):
            continue
        if n.endswith('.rels'):
            dirpart, filename = n.rsplit('/', 1)
            base_name = filename[:-len('.rels')]
            new_name = f'{dirpart}/{prefix}{base_name}.rels'
            xml = etree.fromstring(zf.read(n))
            for rel in xml.findall(f'{{{RELS_NS}}}Relationship'):
                if rel.get('TargetMode') == 'External':
                    continue  # hyperlink to a real URL etc. — never rename
                rel.set('Target', _rename_filename(rel.get('Target'), prefix))
            parts[new_name] = etree.tostring(xml, xml_declaration=True, encoding='UTF-8', standalone=True)
        else:
            parts[_rename_filename(n, prefix)] = zf.read(n)

    ct_xml = etree.fromstring(zf.read('[Content_Types].xml'))
    defaults, overrides = {}, {}
    for el in ct_xml:
        tag = etree.QName(el).localname
        if tag == 'Default':
            defaults[el.get('Extension')] = el.get('ContentType')
        elif tag == 'Override':
            pn = el.get('PartName')
            rel_pn = pn[1:] if pn.startswith('/') else pn
            if rel_pn in SKIP_EXACT or rel_pn.startswith('docProps/'):
                continue
            overrides['/' + _rename_filename(rel_pn, prefix)] = el.get('ContentType')

    return {
        'name': name, 'parts': parts, 'defaults': defaults, 'overrides': overrides,
        'slide_paths': slide_paths, 'master_paths': master_paths, 'notes_master_paths': notes_master_paths,
        'pres_theme_path': pres_theme_path, 'pres_props_path': pres_props_path,
        'view_props_path': view_props_path, 'table_styles_path': table_styles_path,
        '_pres_xml_raw': pres_xml,
    }


def _root_rels_xml():
    root = etree.Element(f'{{{RELS_NS}}}Relationships', nsmap={None: RELS_NS})
    etree.SubElement(root, f'{{{RELS_NS}}}Relationship', Id='rId1',
                      Type=f'{REL_TYPE_NS}/officeDocument', Target='ppt/presentation.xml')
    return etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)


def merge_pptx_files(named_streams):
    """named_streams: list of (name, file-like) pairs, each a .pptx.
    Returns (merged_bytes, skipped) — skipped is [{name, reason}] for any
    source that couldn't be read as a valid .pptx at all. A source that
    opens fine is never partially dropped: every one of its slides (with
    their own layout/master/theme/images/charts/embeddings) is included."""
    if not named_streams:
        raise ValueError('no files to merge')

    skipped, loaded = [], []
    for i, (name, stream) in enumerate(named_streams):
        try:
            loaded.append(_load_source(name, stream, f's{i}_'))
        except Exception as e:
            skipped.append({'name': name, 'reason': str(e) or 'fichier illisible'})

    if not loaded:
        raise ValueError('aucun fichier lisible comme base de la fusion')

    all_parts, all_defaults, all_overrides = {}, {}, {}
    for src in loaded:
        all_parts.update(src['parts'])
        all_defaults.update(src['defaults'])
        all_overrides.update(src['overrides'])

    rels_entries = []
    next_rid = [1]

    def add_rel(rel_type, target):
        rid = f'rId{next_rid[0]}'
        next_rid[0] += 1
        rels_entries.append((rid, rel_type, target))
        return rid

    base = loaded[0]

    master_rids = [add_rel(f'{REL_TYPE_NS}/slideMaster', mp[len('ppt/'):]) for src in loaded for mp in src['master_paths']]
    slide_rids = [add_rel(f'{REL_TYPE_NS}/slide', sp[len('ppt/'):]) for src in loaded for sp in src['slide_paths']]

    # notesMasterIdLst may hold AT MOST ONE entry per the OOXML schema
    # (CT_NotesMasterIdList: notesMasterId has maxOccurs="1") — unlike
    # sldMasterIdLst, which is genuinely unbounded. Listing one per source
    # (every source's own default notes master) is exactly what made
    # PowerPoint flag the file as needing repair even after the dangling
    # chart reference was fixed. Each source's own notesSlide part still
    # correctly points at ITS OWN (renamed, still-present) notes master via
    # its own .rels file regardless of what's listed here — only the
    # presentation-level DEFAULT reference is capped at one, taken from the
    # base file. Every notes master's actual XML part is still imported
    # (nothing is deleted), it just isn't all re-declared at this level.
    notes_master_rids = []
    if base['notes_master_paths']:
        notes_master_rids.append(add_rel(f'{REL_TYPE_NS}/notesMaster', base['notes_master_paths'][0][len('ppt/'):]))

    # Presentation-level singleton parts (view state / table style presets /
    # the presentation's own default theme relationship): taken from the
    # base file only — app-level editing defaults, not slide content, so
    # there's nothing meaningful to merge across sources.
    if base['pres_props_path']:
        add_rel(f'{REL_TYPE_NS}/presProps', base['pres_props_path'][len('ppt/'):])
    if base['view_props_path']:
        add_rel(f'{REL_TYPE_NS}/viewProps', base['view_props_path'][len('ppt/'):])
    if base['table_styles_path']:
        add_rel(f'{REL_TYPE_NS}/tableStyles', base['table_styles_path'][len('ppt/'):])
    if base['pres_theme_path']:
        add_rel(f'{REL_TYPE_NS}/theme', base['pres_theme_path'][len('ppt/'):])

    rels_root = etree.Element(f'{{{RELS_NS}}}Relationships', nsmap={None: RELS_NS})
    for rid, rtype, target in rels_entries:
        etree.SubElement(rels_root, f'{{{RELS_NS}}}Relationship', Id=rid, Type=rtype, Target=target)
    pres_rels_bytes = etree.tostring(rels_root, xml_declaration=True, encoding='UTF-8', standalone=True)

    p_ns, r_ns = PML_NS, REL_TYPE_NS
    nsmap = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main', 'r': r_ns, 'p': p_ns}
    pres = etree.Element(f'{{{p_ns}}}presentation', nsmap=nsmap)

    sld_master_id_lst = etree.SubElement(pres, f'{{{p_ns}}}sldMasterIdLst')
    for i, rid in enumerate(master_rids):
        etree.SubElement(sld_master_id_lst, f'{{{p_ns}}}sldMasterId', {f'{{{r_ns}}}id': rid}, id=str(2147483648 + i))

    if notes_master_rids:
        notes_master_id_lst = etree.SubElement(pres, f'{{{p_ns}}}notesMasterIdLst')
        for rid in notes_master_rids:
            etree.SubElement(notes_master_id_lst, f'{{{p_ns}}}notesMasterId', {f'{{{r_ns}}}id': rid})

    sld_id_lst = etree.SubElement(pres, f'{{{p_ns}}}sldIdLst')
    for i, rid in enumerate(slide_rids):
        etree.SubElement(sld_id_lst, f'{{{p_ns}}}sldId', {f'{{{r_ns}}}id': rid}, id=str(256 + i))

    base_pres_xml = base['_pres_xml_raw']
    for tag in ('sldSz', 'notesSz'):
        el = base_pres_xml.find(f'{{{p_ns}}}{tag}')
        if el is not None:
            pres.append(el)

    pres_xml_bytes = etree.tostring(pres, xml_declaration=True, encoding='UTF-8', standalone=True)

    ct_root = etree.Element(f'{{{CT_NS}}}Types', nsmap={None: CT_NS})
    for ext, content_type in all_defaults.items():
        etree.SubElement(ct_root, f'{{{CT_NS}}}Default', Extension=ext, ContentType=content_type)
    etree.SubElement(ct_root, f'{{{CT_NS}}}Override', PartName='/ppt/presentation.xml',
                      ContentType='application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml')
    for pn, content_type in all_overrides.items():
        etree.SubElement(ct_root, f'{{{CT_NS}}}Override', PartName=pn, ContentType=content_type)
    ct_bytes = etree.tostring(ct_root, xml_declaration=True, encoding='UTF-8', standalone=True)

    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', ct_bytes)
        zf.writestr('_rels/.rels', _root_rels_xml())
        zf.writestr('ppt/presentation.xml', pres_xml_bytes)
        zf.writestr('ppt/_rels/presentation.xml.rels', pres_rels_bytes)
        for path, data in all_parts.items():
            zf.writestr(path, data)

    return out.getvalue(), skipped


# ---------------------------------------------------------------------------
# Post-generation integrity check (PHASE 6 of the request: never silently
# serve an incomplete/corrupt file). Catches exactly the class of bug that
# caused the original report — a relationship id used in a part's XML that
# isn't declared in that part's own .rels, or a .rels Target that points at
# a part that doesn't actually exist in the package.
# ---------------------------------------------------------------------------

def _resolve_relative(base_dir, relative_target):
    parts = base_dir.split('/') if base_dir else []
    for seg in relative_target.split('/'):
        if seg == '..':
            if parts:
                parts.pop()
        elif seg != '.':
            parts.append(seg)
    return '/'.join(parts)


def validate_pptx(data_bytes):
    problems = []
    try:
        zf = zipfile.ZipFile(io.BytesIO(data_bytes))
    except Exception as e:
        return False, [f'not a valid zip: {e}']

    names = set(zf.namelist())
    if '[Content_Types].xml' not in names or 'ppt/presentation.xml' not in names:
        return False, ['missing required package parts']

    for n in names:
        if n.endswith('.xml') or n.endswith('.rels'):
            try:
                etree.fromstring(zf.read(n))
            except Exception as e:
                problems.append(f'{n}: malformed XML ({e})')

    for n in sorted(names):
        if not n.endswith('.xml') or '_rels/' in n:
            continue
        dirpart, filename = (n.rsplit('/', 1) if '/' in n else ('', n))
        rels_path = f'{dirpart}/_rels/{filename}.rels' if dirpart else f'_rels/{filename}.rels'
        try:
            content = zf.read(n).decode('utf-8', errors='replace')
        except Exception:
            continue
        used_ids = set(re.findall(r'r:(?:id|embed|link|cs|dm|lo|qs)="(rId\d+)"', content))
        if rels_path in names:
            try:
                rels_xml = etree.fromstring(zf.read(rels_path))
            except Exception:
                continue
            declared = {rel.get('Id'): rel for rel in rels_xml.findall(f'{{{RELS_NS}}}Relationship')}
            for rid in used_ids - set(declared.keys()):
                problems.append(f'{n}: dangling relationship {rid}')
            for rid, rel in declared.items():
                if rel.get('TargetMode') == 'External':
                    continue
                resolved = _resolve_relative(dirpart, rel.get('Target'))
                if resolved not in names:
                    problems.append(f'{rels_path}: {rid} target does not exist ({resolved})')
        elif used_ids:
            problems.append(f'{n}: references {sorted(used_ids)} but has no .rels file')

    # Schema cardinality: the OOXML schema caps notesMasterIdLst and
    # handoutMasterIdLst at ONE child each (unlike sldMasterIdLst, which is
    # genuinely unbounded) — this is exactly the class of bug that made
    # PowerPoint demand a repair even after every dangling reference above
    # was already fixed: every source file's own default notes master was
    # being listed at the presentation level, one per source.
    try:
        pres_xml = etree.fromstring(zf.read('ppt/presentation.xml'))
        for tag in ('notesMasterIdLst', 'handoutMasterIdLst'):
            lst = pres_xml.find(f'{{{PML_NS}}}{tag}')
            if lst is not None and len(lst) > 1:
                problems.append(f'ppt/presentation.xml: <p:{tag}> has {len(lst)} entries, the schema allows at most 1')
    except Exception as e:
        problems.append(f'ppt/presentation.xml: could not check schema cardinality ({e})')

    return (len(problems) == 0), problems


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length <= 0 or content_length > MAX_TOTAL_BYTES:
            self._send_text(400, 'Requête invalide ou trop volumineuse.')
            return

        raw = self.rfile.read(content_length)
        # Wire format (see buildMergeUploadBody() client-side): 4-byte
        # big-endian manifest length, the JSON manifest ([{name, length}, ...]),
        # then every file's raw bytes concatenated in that order. Sent as raw
        # binary rather than base64-in-JSON specifically because base64's ~33%
        # overhead was what pushed a real week's worth of One-Pagers over
        # Vercel's request-body limit even though the actual file bytes fit.
        try:
            if len(raw) < 4:
                raise ValueError('payload trop court')
            manifest_len = int.from_bytes(raw[0:4], 'big')
            manifest = json.loads(raw[4:4 + manifest_len])
            if not isinstance(manifest, list) or len(manifest) == 0:
                raise ValueError('manifeste vide')
        except Exception:
            self._send_text(400, 'Requête invalide (manifeste illisible).')
            return

        # Isolated per-file: one corrupt/undecodable file must not block the
        # others. Skipped files are reported back via a header the client
        # folds into the "not everything merged" report it already shows.
        named_streams = []
        skipped = []  # {name, reason}
        offset = 4 + manifest_len
        for entry in manifest:
            name = entry.get('name', 'fichier.pptx') if isinstance(entry, dict) else 'fichier.pptx'
            length = entry.get('length', 0) if isinstance(entry, dict) else 0
            try:
                if not isinstance(length, int) or length < 0 or offset + length > len(raw):
                    raise ValueError('fichier tronqué')
                named_streams.append((name, io.BytesIO(raw[offset:offset + length])))
            except Exception as e:
                skipped.append({'name': name, 'reason': str(e) or 'fichier illisible'})
            offset += length if isinstance(length, int) and length > 0 else 0

        if not named_streams:
            self._send_text(422, 'Aucun des fichiers PPTX fournis n\'a pu être lu.')
            return

        try:
            merged_bytes, merge_skipped = merge_pptx_files(named_streams)
            skipped.extend(merge_skipped)
        except Exception as e:
            print('PPTX merge failed', repr(e))
            self._send_text(502, f'La fusion des PPTX a échoué : {e}')
            return

        # Never silently serve a broken file — verify the actual bytes we're
        # about to send are structurally sound before sending them. This is
        # the exact check that would have caught the original bug before it
        # ever reached a downloaded file.
        ok, problems = validate_pptx(merged_bytes)
        if not ok:
            print('PPTX post-generation validation failed', problems)
            self._send_text(502, 'La fusion a produit un fichier PPTX invalide — aucun fichier n\'a été renvoyé. Réessaie ou contacte le support avec les fichiers concernés.')
            return

        expected_included = len(manifest) - len(skipped)
        self.send_response(200)
        self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
        self.send_header('X-Included-Count', str(expected_included))
        if skipped:
            self.send_header('X-Skipped-Files', json.dumps(skipped))
        self.send_header('Content-Length', str(len(merged_bytes)))
        self.end_headers()
        self.wfile.write(merged_bytes)

    def _send_text(self, status, message):
        body = message.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
