# 96-Alchemist-7 · App

Static front end for [96-Alchemist-7](https://github.com/AlchemistBlake/96-Alchemist-7) (private). Served by GitHub
Pages, so it costs nothing and runs nothing until it is opened.

- `index.html` + `app.js`: prompt composer. It builds a `schema_version: 1` job and opens GitHub's prefilled
  new-file page for `jobs/<id>.yaml` in the private repo; you commit it while signed in. No token is ever in the page.
- `player.html` + `sim.js`: the deterministic kinematic player (in-browser, no GPU).
- Job checks: every job this page composes is validated against the JSON Schema by `tests/test_app_contract.py` in the private engine repo.

This repo holds no jobs, outputs, tokens or worker code.

© 2026 Blake Wayne Allcorn. All rights reserved. `BWA_15.2003075_SOV_96.7Hz_SHA-BEWA_69912070`
