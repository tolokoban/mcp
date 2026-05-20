import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { execSync } from "node:child_process"
import { readFileSync, mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync, statSync } from "node:fs"
import { resolve, dirname } from "node:path"

function getProjectRoot(inputRoot?: string): string | null {
    const root = inputRoot || process.argv[2] || process.env.PROJECT_ROOT
    if (!root || !existsSync(root) || !statSync(root).isDirectory()) return null
    return resolve(root)
}

function git(cmd: string, cwd: string): string {
    return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim()
}

function getMainBranch(cwd: string): string {
    try {
        git("rev-parse --verify remotes/origin/main", cwd)
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
    "tolokoban_code_review",
    {
        description: [
            "Use this tool for the current project when the user asks for a \"tolokoban code review\" or \"tlk code review\".",
            "Gather changed files between the current branch and main/master, then prepare context for a code review"
        ].join(" "),
        inputSchema: {
            projectRoot: z.string().describe("Absolute path to the project root folder"),
        },
    },
    async ({ projectRoot }) => {
        const PROJECT_ROOT = getProjectRoot(projectRoot)
        const CODE_REVIEW_DIR = PROJECT_ROOT ? resolve(PROJECT_ROOT, ".code-review") : ""
        if (!PROJECT_ROOT) {
            return {
                content: [{
                    type: "text" as const,
                    text: `ERROR: projectRoot points to a non-existent directory: "${projectRoot}".
Please provide a valid absolute path to the project root folder.`,
                }],
            }
        }

        const main = getMainBranch(PROJECT_ROOT)

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
        const filesRaw = git(`diff --name-only ${main}...HEAD`, PROJECT_ROOT)
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
                const content = git(`show ${main}:${file}`, PROJECT_ROOT)
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
                        "The list of files with changes is in `.code-review/files.txt`.",
                        "",
                        "Now, perform a code review by comparing `.code-review/current/` with `.code-review/main/`.",
                        "They both contain the files listed in `.code-review/files.txt`.",
                        "Do NOT use any shell command. Only rely on the content of `.code-review/`, and if you need more context, look into the files in the current project.",
                        "",
                        "For each changed file, review:",
                        "- Potential bugs or logic errors",
                        "- Security concerns",
                        "- Performance issues",
                        "- Code style and readability",
                        "- Possible improvements",
                        "",
                        "For every issue reported, please provide the path of the file (relative to the workspace root folder), and the line number.",
                        "This _path of the file_ should be written as a link to the actual file (relative to file `PR.md`).",
                        "",
                        "Then create `.code-review/PR.md` with:",
                        "- A summary of what changed between `main` and `current`",
                        "- Grouped by feature/area",
                        "- Be concise but informative",
                        "",
                        "Finally, ask the IDE to show file `PR.md`."
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
