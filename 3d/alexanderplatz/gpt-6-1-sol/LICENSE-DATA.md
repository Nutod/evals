# Geographic data attribution

`src/world/map-data.json` is derived from OpenStreetMap data.

Map data © OpenStreetMap contributors.

This geographic database is made available under the Open Database License 1.0. You may copy, distribute, transmit and adapt the data under the terms of that license. This notice applies to the geographic database, not automatically to application code.

- Copyright and attribution: https://www.openstreetmap.org/copyright
- ODbL 1.0: https://opendatacommons.org/licenses/odbl/1-0/
- Full license text: https://opendatacommons.org/licenses/odbl/1-0/index.html
- Source extract: https://www.openstreetmap.org/api/0.6/map?bbox=13.402,52.518,13.420,52.5255
- Conversion script: `scripts/import-osm.py`

The extract was converted to local metre coordinates, filtered by feature type and stripped of unrelated tags. Height estimates were derived from building floor counts where no height was provided. Named landmark footprints were removed where replaced with independent procedural geometry. This transformed database is distributed in full with the source.
