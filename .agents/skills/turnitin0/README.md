# turnitin0_skill

Codex / Claude Code / Cursor plugin for [Turnitin0](https://www.turnitin0.com): Turnitin AI detection, similarity checking, and [AI text humanization](https://www.turnitin0.com).

With this skill you can get [Turnitin AI detection](https://www.turnitin0.com) and similarity reports before submitting — usually within 10 minutes — and humanize text to reduce AI detection scores.

Turnitin0 is **not** affiliated with Turnitin, LLC.

## Typical usage (natural language)

After the skill is installed, ask your agent in plain language. Examples:

**Turnitin check (file)**

- Check this paper with Turnitin0: `/absolute/path/to/essay.docx`
- Run a Turnitin similarity and AI detection report on `./draft.pdf`

**Turnitin check (text)**

- Turnitin-check the following essay text:  
  `...paste your text...`

**Humanize (file)**

- Humanize this document with Turnitin0: `/absolute/path/to/essay.docx`
- Reduce the AI score on `./chapter2.txt` using the Turnitin0 humanizer

**Humanize (text)**

- Humanize this passage with Turnitin0:  
  `...paste your text...`

The agent should use `/turnitin0` (login → upload → pay if needed → task → download). Reports and humanized files land under the skill’s `downloads/` folder.

Requires **Python 3.10+** (stdlib only) on the machine where scripts run.

## Install (recommended — all agents)

One command installs this skill for nearly all coding agents (Codex, Claude Code, Cursor, and others supported by the [skills CLI](https://github.com/vercel-labs/skills)):

```bash
npx skills add pengchenghaoche51/turnitin0_skill
```

Use this first. Only if that command fails or your agent is not covered, use the agent-specific fallbacks below.

Optional variants:

```bash
# List skills in the repo without installing
npx skills add pengchenghaoche51/turnitin0_skill --list

# Non-interactive / install for all detected agents
npx skills add pengchenghaoche51/turnitin0_skill --all -y
```

## Install fallbacks (per agent)

### Cursor

Add this GitHub repo as a Cursor plugin / from Cursor Directory. Cursor loads `skills/turnitin0` automatically.

### Codex (preferred — entry A)

```bash
# From Codex skill-installer (not this repo):
# ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py
python scripts/install-skill-from-github.py \
  --repo pengchenghaoche51/turnitin0_skill \
  --path skills/turnitin0
```

### Codex (whole repo — entry B)

```bash
python scripts/install-skill-from-github.py \
  --repo pengchenghaoche51/turnitin0_skill \
  --path . \
  --name turnitin0
```

### Claude Code

```bash
git clone https://github.com/pengchenghaoche51/turnitin0_skill.git
cp -r turnitin0_skill/skills/turnitin0 ~/.claude/skills/turnitin0
```

## Dual entry

| Entry | Path | Best for |
|-------|------|----------|
| **A** | [`skills/turnitin0/`](./skills/turnitin0/) | Cursor plugin; Codex/Claude preferred |
| **B** | Repository root ([`SKILL.md`](./SKILL.md)) | Codex `skill-installer` with repo root / `--path .` |

Both support the same commands (`python scripts/login.py`, …). Canonical code, `config.json`, and `downloads/` live under **entry A**. Root `scripts/` forward to A.

## Layout

```text
.cursor-plugin/plugin.json
.plugin/plugin.json
SKILL.md                 # entry B
scripts/                 # forwards → skills/turnitin0/scripts
skills/turnitin0/        # entry A (canonical)
  SKILL.md
  scripts/
  config.example.json
  downloads/
```

## Quick start (scripts)

```bash
# from skills/turnitin0 or from repo root
python scripts/login.py
python scripts/turnitin_check.py --file "/path/to/paper.docx"
python scripts/humanize.py --text "Your essay..."
```

Reports land in `skills/turnitin0/downloads/`.

## Auth & payment

- Login: `/skill_login?r=<code>` → Google → JWT in `skills/turnitin0/config.json` (never committed).
- Pay: `/skill_pay?c=<pay_code>` → PayPal. JWT is **never** placed in the URL.

## License

MIT — see [LICENSE](./LICENSE).
