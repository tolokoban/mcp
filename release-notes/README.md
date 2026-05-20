# Release Notes MCP Server

## Description

An MCP (Model Context Protocol) server that automates release notes generation for projects using git history.

When invoked, it:

1. Reads the current version from `package.json` (and checks consistency across `lib/package.json` and `doc/package.json`, if they exist).
2. Finds the commit where the version was last bumped.
3. Collects the git log and changed files since that commit.
4. Stores previous and current versions of each changed file in a `.release-notes/` folder.
5. Returns instructions for the AI agent to draft a release notes section in `README.md`.

The server exposes:

- A tool: `generate_release_notes`
- A prompt: `release-notes`

## Installation

First, install dependencies and ensure the server can run:

```bash
cd mcp/release-notes
npm install
```

### VS Code

Add the following to your `.vscode/mcp.json` (create it if it doesn't exist):

```json
{
  "servers": {
    "release-notes": {
      "command": "npx",
      "args": ["tsx", "<ROOT_OF_MCP_SERVER>/mcp/release-notes/src/index.ts"],
      "env": {
        "PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

### Claude Desktop

Add the following to your `claude_desktop_config.json` (located at `~/.config/claude/claude_desktop_config.json` on Linux or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "release-notes": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp/release-notes/src/index.ts"],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

Replace `/absolute/path/to/...` with the actual paths on your system.

## Environment Variables

| Variable       | Description                          | Default         |
|----------------|--------------------------------------|-----------------|
| `PROJECT_ROOT` | Absolute path to the project root    | `process.cwd()` |
