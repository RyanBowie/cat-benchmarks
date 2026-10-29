# Cat Benchmarks

An informal, fun benchmark: the same one-shot prompt given to several AI models at their highest reasoning setting.

> Using no folder/local file context or previous session context Create a new realistic interactive 3d cat with three.js from scratch.

| Model | Tool | Score /10 (provisional) | AI credits |
|---|---|---|---|
| Claude Opus 5.5 | Microsoft Cowork | 5.6 | 2,314 |
| Claude Sonnet 5.5 | GitHub Copilot | 5.5 | 2,175 |
| GPT-6.1 Sol | GitHub Copilot | 5.0 | 179 |
| Grok 4.7 | GitHub Copilot | 2.5 | 848 |
| Gemini 4 Argon | GitHub Copilot | 2.2 | 252 |
| GPT-5.6 Sol | GitHub Copilot | 1.8 | 201 |

Scores are a weighted 0–10 average of seven criteria: anatomy 25%, fur 15%, animation 15%, interactivity 15%, face 10%, scene 10%, performance 10%. They are first-pass and editable in the `SCORES` table in `index.html`.

Each result lives in `cats/<model>/index.html`. The showcase is `index.html`, served with GitHub Pages.

Results are unedited model output (single files, or bundled builds of the model's project). Some load three.js from a CDN.
