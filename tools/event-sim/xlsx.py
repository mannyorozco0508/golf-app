import zipfile, re, json, sys
def load(path):
    z = zipfile.ZipFile(path)
    wb = z.read('xl/workbook.xml').decode()
    names = re.findall(r'<sheet [^>]*name="([^"]+)"', wb)
    ss = z.read('xl/sharedStrings.xml').decode() if 'xl/sharedStrings.xml' in z.namelist() else ''
    strs = [re.sub(r'<[^>]+>', '', m) for m in re.findall(r'<si>(.*?)</si>', ss, re.S)]
    out = {}
    for i, n in enumerate(names, 1):
        x = z.read(f'xl/worksheets/sheet{i}.xml').decode()
        rows = []
        for r in re.findall(r'<row [^>]*>(.*?)</row>', x, re.S):
            cells = {}
            for ref, attrs, v in re.findall(r'<c r="([A-Z]+)\d+"([^>]*)>(?:<f>.*?</f>)?(?:<v>(.*?)</v>)?', r, re.S):
                if 't="s"' in attrs and v: v = strs[int(v)]
                cells[ref] = v.replace('&quot;', '"').replace('&amp;', '&').replace('&apos;', "'") if v else ''
            rows.append(cells)
        out[n] = rows
    return out
if __name__ == '__main__':
    print(json.dumps(load(sys.argv[1])))
