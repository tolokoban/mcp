# Code Review MCP Server

An MCP server that prepares a code review of the current branch compared to `main` (or `master`).

## What it does

1. Determines the main branch (`remotes/origin/main`, falling back to `remotes/origin/master`)
2. Creates a `.code-review/` folder in the project root (cleaned if it already exists)
3. Ensures `.code-review` is listed in `.gitignore`
4. Writes `files.txt` with the list of files changed since `main`
5. Copies current versions of changed files into `.code-review/current/`
6. Extracts the `main` versions of those files into `.code-review/main/`
7. Instructs the agent to review the differences and produce a `PR.md` summary

## Server info

- **Name:** `tolokoban-code-review`
- **Tool:** `prepare_code_review`
- **Prompt:** `/code-review`

## Installation

The server requires the `PROJECT_ROOT` environment variable to point to the root of the project being reviewed.

### VSCode

In `.vscode/mcp.json`:

```json
{
  "servers": {
    "code-review": {
      "command": "npx",
      "args": ["tsx", "<PATH_TO>/mcp/code-review/src/index.ts"],
      "env": {
        "PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

### Claude Desktop

In `~/.config/claude/claude_desktop_config.json` (Linux) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "code-review": {
      "command": "npx",
      "args": ["tsx", "<PATH_TO>/mcp/code-review/src/index.ts"],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

### Amazon Q Developer

In `.amazonq/mcp.json` at the workspace root:

```json
{
  "mcpServers": {
    "code-review": {
      "command": "npx",
      "args": ["tsx", "<PATH_TO>/mcp/code-review/src/index.ts"],
      "env": {
        "PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

Replace `<PATH_TO>` with the absolute path to the folder containing this repository.
