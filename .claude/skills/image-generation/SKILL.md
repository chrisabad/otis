---
name: image-generation
description: Generate images using Gemini Flash. Use when a user asks to create, draw, or generate an image.
tags: [image, generate, draw, gemini]
version: 1.0.0
audience: shared
---
# Image Generation Skill

## When to Use
- User asks to create, draw, make, or generate an image.
- User needs an asset, graphic, or visual output.
- Another agent needs to generate an image for a task.

## Tool
```bash
python3 tools/gemini-image.py "<prompt>" [output_path] [model]
```

- **Input:** 
  - `<prompt>`: A detailed description of the image to generate. Include style, subject, lighting, and composition details.
  - `[output_path]`: (Optional) The absolute path where the image should be saved. If omitted, it saves to a generated filename in the workspace root.
  - `[model]`: (Optional) The model to use. Defaults to `gemini-2.5-flash-image`. Alternatives: `imagen-4.0-generate-001`, `gemini-3-pro-image-preview`.
- **Output:** JSON containing the text response, the path to the saved image (`image`), and the model used.

Resolve `tools/` relative to the workspace: `/home/hermes/.hermes/workspace/tools/gemini-image.py`

## Dependencies
- `google-genai` (Python package)
- `GEMINI_API_KEY` (in `.env`)

## Workflow
1. Extract the image requirements (subject, style, aspect ratio, etc.) from the user's request.
2. If the request is vague, expand it into a detailed prompt suitable for an image model (e.g., specifying lighting, medium, camera angle, and mood).
3. Run the `gemini-image.py` script with the constructed prompt.
4. Read the JSON output to get the `image` path.
5. If you are delivering the image to Chris via Slack, use the `MEDIA:<filepath>` syntax in your reply (e.g., `MEDIA:./generated_12345678.png`). Or use the `file-delivery` skill.

## Notes
- The default model is `gemini-2.5-flash-image`.
- The tool requires `GEMINI_API_KEY` to be set in the workspace `.env` file.
- The output is written to disk. Make sure to provide the path or deliver the file appropriately so the user can see it.