import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { execSync } from "node:child_process"
import { readFileSync, mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync, statSync } from "node:fs"
import { resolve, dirname } from "node:path"

function getProjectRoot(): string | null {
    const root = process.env.PROJECT_ROOT
    if (!root || !existsSync(root) || !statSync(root).isDirectory()) return null
    return resolve(root)
}

const PROJECT_ROOT = getProjectRoot()
const CODE_REVIEW_DIR = PROJECT_ROOT ? resolve(PROJECT_ROOT, ".code-review") : ""

function git(cmd: string): string {
    return execSync(`git ${cmd}`, {
        cwd: PROJECT_ROOT!,
        encoding: "utf-8",
    }).trim()
}

function getMainBranch(): string {
    try {
        git("rev-parse --verify remotes/origin/main")
        return "remotes/origin/main"
    } catch {
        return "remotes/origin/master"
    }
}

const server = new McpServer({
    name: "tolokoban-code-review",
    version: "1.0.0",
})

server.registerTool(
    "prepare_code_review",
    {
        description:
            "Gather changed files between the current branch and main/master, then prepare context for a code review",
    },
    async () => {
        if (!PROJECT_ROOT) {
            return {
                content: [{
                    type: "text" as const,
                    text: [
                        "ERROR: PROJECT_ROOT environment variable is not set or points to a non-existent directory.",
                        "Please set it to the root folder of your project and restart the server.",
                        "",
                        "If you are using VSCode, you can set it in the `.vscode/mcp.json` file:",
                        "",
                        "```json",
                        "{",
                        "  \"servers\": {",
                        "    \"code-review\": {",
                        "      \"command\": \"npx\",",
                        "      \"args\": [\"tsx\", \"<ROOT_OF_MCP_SERVER>/mcp/code-review/src/index.ts\"],",
                        "      \"env\": {",
                        "        \"PROJECT_ROOT\": \"${workspaceFolder}\"",
                        "      }",
                        "    }",
                        "  }",
                        "}",
                        "```",
                    ].join("\n")
                }],
            }
        }

        const main = getMainBranch()

        // Clean/create .code-review directory
        if (existsSync(CODE_REVIEW_DIR)) {
            rmSync(CODE_REVIEW_DIR, { recursive: true })
        }
        mkdirSync(resolve(CODE_REVIEW_DIR, "current"), { recursive: true })
        mkdirSync(resolve(CODE_REVIEW_DIR, "main"), { recursive: true })

        // Ensure .code-review is in .gitignore
        const gitignorePath = resolve(PROJECT_ROOT, ".gitignore")
        if (existsSync(gitignorePath)) {
            const content = readFileSync(gitignorePath, "utf-8")
            if (!content.split("\n").some(line => line.trim() === ".code-review")) {
                writeFileSync(gitignorePath, content.trimEnd() + "\n.code-review\n", "utf-8")
            }
        } else {
            writeFileSync(gitignorePath, ".code-review\n", "utf-8")
        }

        // Get changed files
        const filesRaw = git(`diff --name-only ${main}...HEAD`)
        const files = filesRaw.split("\n").filter(Boolean)
        writeFileSync(resolve(CODE_REVIEW_DIR, "files.txt"), filesRaw, "utf-8")

        // Copy current and main versions of each file
        for (const file of files) {
            // Current version from workspace
            const currPath = resolve(CODE_REVIEW_DIR, "current", file)
            mkdirSync(dirname(currPath), { recursive: true })
            const srcPath = resolve(PROJECT_ROOT, file)
            if (existsSync(srcPath)) {
                copyFileSync(srcPath, currPath)
            }

            // Main version from git
            const mainPath = resolve(CODE_REVIEW_DIR, "main", file)
            mkdirSync(dirname(mainPath), { recursive: true })
            try {
                const content = git(`show ${main}:${file}`)
                writeFileSync(mainPath, content, "utf-8")
            } catch {
                // File didn't exist in main
            }
        }

        return {
            content: [
                {
                    type: "text" as const,
                    text: [
                        `Changed files: ${files.length}`,
                        "",
                        "All data has been collected in `.code-review/`.",
                        "",
                        "Now, perform a code review by comparing `.code-review/current/` with `.code-review/main/`.",
                        "Do NOT use any shell command. Only rely on the content of `.code-review/`, and if you need more context, look into the files in the current project.",
                        "",
                        "For each changed file, review:",
                        "- Potential bugs or logic errors",
                        "- Security concerns",
                        "- Performance issues",
                        "- Code style and readability",
                        "- Possible improvements",
                        "",
                        "Then create `.code-review/PR.md` with:",
                        "- A summary of what changed between `main` and `current`",
                        "- Grouped by feature/area",
                        "- Be concise but informative",
                    ].join("\n"),
                },
            ],
        }
    },
)

server.prompt(
    "code-review",
    "Perform a code review of the current branch compared to main/master",
    () => ({
        messages: [
            {
                role: "user" as const,
                content: {
                    type: "text" as const,
                    text: "Please call the prepare_code_review tool to gather context and perform a code review of the current branch.",
                },
            },
        ],
    })
)

const transport = new StdioServerTransport()
await server.connect(transport)
