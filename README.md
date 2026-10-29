# Cat Benchmarks

An informal, fun benchmark: the same one-shot prompt given to several AI models at their highest reasoning setting.

> Using no folder/local file context or previous session context Create a new realistic interactive 3d cat with three.js from scratch.

| Model | Tool | AI credits |
|---|---|---|
| Claude Opus 5.5 | Microsoft Cowork | 2,314 |
| Claude Sonnet 5.5 | GitHub Copilot | 2,175 |
| Grok 4.7 | GitHub Copilot | 848 |
| Gemini 4 Argon | GitHub Copilot | 252 |
| GPT-5.6 Sol | GitHub Copilot | 201 |
| GPT-6.1 Sol | GitHub Copilot | 179 |
| MAI-Code-2-Flash | GitHub Copilot | Unknown |

Each result lives in `cats/<model>/index.html`. The showcase is `index.html`, served with GitHub Pages.

Results are unedited model output (single files, or bundled builds of the model's project). Some load three.js from a CDN.
