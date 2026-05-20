import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { execSync } from "node:child_process"
import { readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync, statSync } from "node:fs"
import { resolve, dirname } from "node:path"

function getProjectRoot(inputRoot?: string): string | null {
    const root = inputRoot || process.argv[2] || process.env.PROJECT_ROOT
    if (!root || !existsSync(root) || !statSync(root).isDirectory()) return null
    return resolve(root)
}

function getGitIgnoredDirs(cwd: string): Set<string> {
    try {
        const output = execSync("git ls-files --others --ignored --exclude-standard --directory", {
            cwd,
            encoding: "utf-8",
        }).trim()
        return new Set(output.split("\n").filter(Boolean).map(d => d.replace(/\/$/, "")))
    } catch {
        return new Set()
    }
}

function findVersionFiles(cwd: string): string[] {
    const ignored = getGitIgnoredDirs(cwd)
    const files = ["package.json"]
    for (const entry of readdirSync(cwd)) {
        if (ignored.has(entry)) continue
        const dir = resolve(cwd, entry)
        if (statSync(dir).isDirectory()) {
            const pkg = resolve(dir, "package.json")
            if (existsSync(pkg)) files.push(`${entry}/package.json`)
        }
    }
    return files
}

function git(cmd: string, cwd: string): string {
    return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim()
}

function readVersion(relativePath: string, cwd: string): { path: string; version: string } {
    const path = resolve(cwd, relativePath)
    const pkg = JSON.parse(readFileSync(path, "utf-8"))
    return { path: relativePath, version: pkg.version ?? "unknown" }
}

const server = new McpServer({
    name: "tolokoban-release-notes",
    version: "1.0.0",
})

server.registerTool(
    "tolokoban_release_notes",
    {
        description: [
            "Use this tool for the current project when the user asks for a \"tolokoban release notes\" or \"tlk release notes\".",
            "Gather git history and project context to draft a release note entry for the current project."
        ].join(" "),
        inputSchema: {
            projectRoot: z.string().describe("Absolute path to the project root folder"),
        },
    },
    async ({ projectRoot }) => {
        const PROJECT_ROOT = getProjectRoot(projectRoot)
        const RELEASE_NOTES_DIR = PROJECT_ROOT ? resolve(PROJECT_ROOT, ".release-notes") : ""
        if (!PROJECT_ROOT) {
            return {
                content: [{
                    type: "text" as const,
                    text: `ERROR: projectRoot points to a non-existent directory: ${projectRoot}.
Please provide a valid absolute path to the project root folder.`,
                }],
            }
        }
        const messages: string[] = ["Checking current version"]

        // 1. Check version consistency
        const versions = findVersionFiles(PROJECT_ROOT).map(f => readVersion(f, PROJECT_ROOT))
        const rootVersion = versions[0].version
        const allMatch = versions.every((v) => v.version === rootVersion)

        if (!allMatch) {
            const details = versions.map((v) => `  - ${v.path}: ${v.version}`).join("\n")
            return {
                content: [
                    {
                        type: "text" as const,
                        text: [
                            "ERROR: Version mismatch detected:",
                            details,
                            "",
                            `Would you like to apply the version from package.json (${rootVersion}) to the other package files?`,
                        ].join("\n"),
                    },
                ],
            }
        }

        messages.push(`Version: ${rootVersion}`)

        // 2. Find PREV_COMMIT
        const prevCommit = git(
            `rev-parse $(git log --format="%H" -S "${rootVersion}" -- package.json | tail -1)~1`,
            PROJECT_ROOT
        )
        messages.push(`Previous commit: ${prevCommit}`)

        // 3. Create .release-notes directory structure
        if (existsSync(RELEASE_NOTES_DIR)) {
            rmSync(RELEASE_NOTES_DIR, { recursive: true })
        }
        mkdirSync(resolve(RELEASE_NOTES_DIR, "current"), { recursive: true })
        mkdirSync(resolve(RELEASE_NOTES_DIR, "previous"), { recursive: true })

        // Ensure .release-notes is in .gitignore
        const gitignorePath = resolve(PROJECT_ROOT, ".gitignore")
        if (existsSync(gitignorePath)) {
            const content = readFileSync(gitignorePath, "utf-8")
            if (!content.split("\n").some(line => line.trim() === ".release-notes")) {
                writeFileSync(gitignorePath, content.trimEnd() + "\n.release-notes\n", "utf-8")
            }
        } else {
            writeFileSync(gitignorePath, ".release-notes\n", "utf-8")
        }

        // 4. Get commit log and store in log.txt
        const log = git(`log ${prevCommit}..HEAD --format="%s"`, PROJECT_ROOT)
        writeFileSync(resolve(RELEASE_NOTES_DIR, "log.txt"), log, "utf-8")

        // 5. Get changed files list
        const filesRaw = git(`diff --name-only ${prevCommit} HEAD`, PROJECT_ROOT)
        const files = filesRaw.split("\n").filter(Boolean)
        writeFileSync(resolve(RELEASE_NOTES_DIR, "files.txt"), filesRaw, "utf-8")

        // 6. For each file, store previous and current versions
        for (const file of files) {
            // Previous version from PREV_COMMIT
            const prevPath = resolve(RELEASE_NOTES_DIR, "previous", file)
            mkdirSync(dirname(prevPath), { recursive: true })
            try {
                const content = git(`show ${prevCommit}:${file}`, PROJECT_ROOT)
                writeFileSync(prevPath, content, "utf-8")
            } catch {
                // File didn't exist in previous commit
            }

            // Current version from workspace
            const currPath = resolve(RELEASE_NOTES_DIR, "current", file)
            mkdirSync(dirname(currPath), { recursive: true })
            const srcPath = resolve(PROJECT_ROOT, file)
            if (existsSync(srcPath)) {
                copyFileSync(srcPath, currPath)
            }
        }

        messages.push(`Changed files: ${files.length}`)

        // 7. Ask agent to write release notes
        return {
            content: [
                {
                    type: "text" as const,
                    text: [
                        ...messages,
                        "",
                        "All data has been collected in `.release-notes/`.",
                        "",
                        "Now, add a release notes section for version `" + rootVersion + "` in `README.md`.",
                        "To do this, do NOT use any shell command.",
                        "Only rely on the content of `.release-notes/` (log.txt, files.txt, previous/, current/) and the current version.",
                        "Match the existing style in README.md under '## Release notes'.",
                        "Use `### v" + rootVersion + "` as the version header.",
                        "Use bold (**text**) for key feature/area names.",
                        "Group related changes together.",
                        "Be concise but informative.",
                        "Only report changes that have occurred under `lib/` folder.",
                    ].join("\n"),
                },
            ],
        }
    },
)

server.prompt(
    "release-notes",
    "Generate release notes for the current version of the current project",
    () => ({
        messages: [
            {
                role: "user" as const,
                content: {
                    type: "text" as const,
                    text: "Please call the generate_release_notes tool to gather context and draft release notes for the current version.",
                },
            },
        ],
    })
)

const transport = new StdioServerTransport()
await server.connect(transport)
