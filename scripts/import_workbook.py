"""Extract the supplied Listing canvas without modifying the workbook."""
import json
import sys
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/import_workbook.py /path/to/Knowledge Base Listing.xlsx')
SOURCE = Path(sys.argv[1]).expanduser().resolve()
TARGET = ROOT / 'assets' / 'workbook'
TARGET.mkdir(parents=True, exist_ok=True)
ocr_file = ROOT / 'scripts' / 'workbook-ocr.json'
ocr = {page['file']: page['lines'] for page in json.loads(ocr_file.read_text())} if ocr_file.exists() else {}
sheet = openpyxl.load_workbook(SOURCE, data_only=True).active
cells = []
for row in sheet:
    for cell in row:
        if cell.value is None and not cell.hyperlink:
            continue
        cells.append({
            'id': f'{sheet.title}!{cell.coordinate}',
            'cell': cell.coordinate,
            'text': str(cell.value or '').strip(),
            'link': cell.hyperlink.target if cell.hyperlink else None,
        })
images = []
for index, image in enumerate(sheet._images, 1):
    name = f'image-{index:02}.png'
    (TARGET / name).write_bytes(image._data())
    anchor = image.anchor._from
    cell = f'{openpyxl.utils.get_column_letter(anchor.col + 1)}{anchor.row + 1}'
    images.append({'id': f'{sheet.title}!image-{index:02}', 'anchor': cell, 'path': f'/assets/workbook/{name}', 'ocr': ocr.get(name, []), 'verifiedText': False})
(ROOT / 'workbook-sources.json').write_text(json.dumps({'workbook': SOURCE.name, 'sheet': sheet.title, 'cells': cells, 'images': images}, ensure_ascii=False, indent=2) + '\n')
print(f'Extracted {len(cells)} cells and {len(images)} images')
