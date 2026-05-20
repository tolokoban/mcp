# A bunch of MCP servers for my daily use

* [code-review](code-review/README.md)
* [release-notes](release-notes/README.md)

For Amazon Q, you can create this file: `~/.aws/amazonq/mcp.json`

```json
{
  "mcpServers": {
    "tolokoban-code-review": {
      "command": "npx",
      "args": ["tsx", "/home/tolokoban/Code/github/AI/mcp/code-review/src/index.ts"]
    },
    "tolokoban-release-notes": {
      "command": "npx",
      "args": ["tsx", "/home/tolokoban/Code/github/AI/mcp/release-notes/src/index.ts"]
    }
  }
}
```

Make sure to replace `/home/tolokoban/Code/github/AI/mcp` with the path where you cloned this repo.
