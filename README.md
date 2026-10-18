# Harbor Trajectory Viewer

Browse, audit and annotate [Harbor](https://harborframework.com) tasks and
[ATIF](https://docs.harborframework.com/agents/atif) agent trajectories, locally.

![trajectory page](docs/trajectory.jpg)

## Run

```bash
npm install
npm run ingest                       # normalises examples/demo-pack into data/
npm run dev                          # http://localhost:5173
```

To use your own data: `node scripts/ingest.mjs <dir>`, where `<dir>` is either a pack
(`tasks/<task>/jobs/<job>/`) or a Harbor jobs directory (`jobs/<job>/<trial>/`, add `--tasks <dir>`).
The *Upload zip* button does the same for a zip, inside the browser.
`npm run share` opens a public URL through a Cloudflare tunnel.

## What is in it

**Data** — task cards, import issues (missing or unparsable trajectories, missing rewards, agent metadata
conflicts, exceptions), reward spread per task, how each task is graded, roll-up by data source.

**Trajectories** — task definition with the container file system as the agent saw it; a chat-style replay of
each run with a file tree that follows the current step, a file pane with content and diffs, a phase timeline,
subagent trajectories, and the raw `result.json` / trajectory metadata; side-by-side comparison of two runs
with their first divergence point; artifact preview (images, video, audio, PDF, xlsx, docx).

**Annotation** — per run: verdict, verifier audit, failure localisation (first error / point of no return /
first visible symptom), reward gaming, verification quality, loops, side effects, configurable axes, notes.
Per step: a numeric stepwise reward, a flag, a note. Per pair: preference and decisive divergence step.
Queue with filters, statistics, JSONL export. Labels are stored per dataset in `annotations/` (or in the
browser for uploaded zips); the axes are configurable in the same file.

The normaliser (`src/lib/normalize.js`) reads ATIF 1.0–1.8 including multimodal parts and subagent
trajectories, Harbor `result.json`, `ctrf.json` test results and Dockerfiles. Step kinds, file writes,
repeated actions and actions worth a second look (test or verifier edits, git history reads, skipped tests,
public network access) are heuristics derived from tool calls and shell commands, and are labelled as such.

Interface in Chinese and English. Data is never translated.

## Limitations

- The file tree is reconstructed from the Dockerfile and the agent's own writes. Content produced by shell
  commands is not known, and the pane says so when it shows a stale version.
- Annotations are written by the dev server to a local file. There is no multi-user store.
- Zips are parsed on the main thread, and long trajectories are rendered in full. Packs with thousands of
  runs are paginated, but a single run of several thousand steps will be slow.

## Acknowledgements

[ATIF-trajectory-viewer](https://github.com/Slimshilin/ATIF-trajectory-viewer) and the
[Harbor job viewer](https://docs.harborframework.com/results/view-job-results).

MIT License.
