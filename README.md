# Random Walks: Report and Interactive Demo

This folder contains the LaTeX report, the Python figure-generation script, and a GitHub Pages-ready interactive supplement.

Live demo: https://kaigeliang.github.io/random-walks-ai-report/

![Random Walks infographic poster](docs/assets/random-walks-infographic.png)

Main files:

- `conference_101719.tex`: report source
- `conference_101719.pdf`: compiled report
- `generate_randomwalk_figures.py`: reproducible Python figures
- `docs/index.html`: interactive web animation demo
- `docs/assets/random-walks-infographic.png`: one-page infographic poster

Local preview:

```bash
python3 generate_randomwalk_figures.py
python3 -m http.server 8000
```

Then open `http://localhost:8000/docs/`.

For GitHub Pages, push this folder as a repository and set **Settings > Pages** to serve from the `docs/` folder.
