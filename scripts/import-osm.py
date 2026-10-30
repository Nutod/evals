"""Bake an OSM XML extract into local, metre-based scene data.

Usage: python3 scripts/import-osm.py path/to/extract.osm
Map data © OpenStreetMap contributors, ODbL 1.0.
"""
import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ORIGIN = (52.5219, 13.4132)
root = ET.parse(sys.argv[1]).getroot()
nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.findall('node')}
ways = {w.get('id'): w for w in root.findall('way')}


def tags(element):
    return {t.get('k'): t.get('v') for t in element.findall('tag')}


def points(way):
    result = []
    for nd in way.findall('nd'):
        if nd.get('ref') not in nodes:
            continue
        lat, lon = nodes[nd.get('ref')]
        point = [round((lon - ORIGIN[1]) * 111319.49079327358 * math.cos(math.radians(ORIGIN[0])), 2),
                 round((ORIGIN[0] - lat) * 111319.49079327358, 2)]
        if not result or point != result[-1]:
            result.append(point)
    return result


def number(value, default):
    try:
        return float(value.replace(' m', '').split(';')[0])
    except (ValueError, AttributeError):
        return default


data = {'buildings': [], 'roads': [], 'green': [], 'plazas': [], 'trees': [], 'rail': []}
excluded = ['Park Inn', 'Bahnhof Alexanderplatz', 'Berliner Fernsehturm', 'Urania-Weltzeituhr', 'St. Marienkirche', 'Rotes Rathaus']
member_ids = set()
for relation in root.findall('relation'):
    t = tags(relation)
    if 'building' not in t:
        continue
    for member in relation.findall('member'):
        if member.get('type') == 'way' and member.get('role') == 'outer':
            member_ids.add(member.get('ref'))
            if member.get('ref') in ways and not any(n in t.get('name', '') for n in excluded):
                wt = ways[member.get('ref')]
                if len(points(wt)) > 3:
                    data['buildings'].append({'id': int(wt.get('id')), 'name': t.get('name', ''), 'kind': t['building'], 'height': number(t.get('height'), number(t.get('building:levels'), 5) * 3.3), 'points': points(wt)})

for wid, way in ways.items():
    t = tags(way)
    p = points(way)
    if len(p) < 2:
        continue
    if 'building' in t and wid not in member_ids and len(p) > 3:
        if any(n in t.get('name', '') for n in excluded):
            continue
        if t['building'] in ['roof', 'viaduct', 'train_station', 'bridge']:
            continue
        if any(abs(v[0]) > 1000 or abs(v[1]) > 850 for v in p):
            continue
        h = number(t.get('height'), number(t.get('building:levels'), 5) * 3.3)
        if h < 2:
            continue
        data['buildings'].append({'id': int(wid), 'name': t.get('name', ''), 'kind': t['building'], 'height': round(h, 1), 'points': p})
    elif t.get('highway') == 'pedestrian' and t.get('area') == 'yes' and len(p) > 3:
        data['plazas'].append(p)
    elif 'highway' in t and t.get('area') != 'yes' and t['highway'] not in ['steps', 'elevator', 'platform', 'corridor'] and t.get('level', '0') == '0' and t.get('tunnel') != 'yes':
        data['roads'].append({'kind': t['highway'], 'name': t.get('name', ''), 'width': number(t.get('width'), number(t.get('lanes'), 2) * 3.2), 'points': p})
    elif t.get('landuse') == 'grass' or t.get('leisure') in ['park', 'garden'] or t.get('natural') in ['grassland', 'scrub']:
        if p[0] == p[-1] and len(p) > 3:
            data['green'].append(p)
    elif t.get('railway') == 'rail' and t.get('tunnel') != 'yes':
        data['rail'].append(p)

for node in root.findall('node'):
    if tags(node).get('natural') == 'tree':
        lat, lon = nodes[node.get('id')]
        data['trees'].append([round((lon - ORIGIN[1]) * 111319.49079327358 * math.cos(math.radians(ORIGIN[0])), 2), round((ORIGIN[0] - lat) * 111319.49079327358, 2)])

out = Path(__file__).resolve().parents[1] / 'src/world/map-data.json'
out.write_text(json.dumps(data, separators=(',', ':')) + '\n')
print({key: len(value) for key, value in data.items()})
