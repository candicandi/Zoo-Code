import type { MockedFunction } from "vitest"

import { regexSearchFiles } from "../../../services/ripgrep"
import { getWorkspaceReadablePath, isPathOutsideWorkspace, resolvePathInWorkspace } from "../../../utils/pathUtils"
import type { ToolUse } from "../../../shared/tools"
import { searchFilesTool } from "../SearchFilesTool"

vi.mock("../../../services/ripgrep", () => ({
	regexSearchFiles: vi.fn(),
}))

vi.mock("../../../utils/pathUtils", async () => {
	const actual = await vi.importActual<typeof import("../../../utils/pathUtils")>("../../../utils/pathUtils")
	return {
		...actual,
		resolvePathInWorkspace: vi.fn(),
		getWorkspaceReadablePath: vi.fn(),
		isPathOutsideWorkspace: vi.fn(),
	}
})

describe("searchFilesTool", () => {
	const cwd = "/workspace/primary"
	const relPath = "secondary/src"
	const absolutePath = "/workspace/secondary/src"

	const mockedRegexSearchFiles = regexSearchFiles as MockedFunction<typeof regexSearchFiles>
	const mockedResolvePathInWorkspace = resolvePathInWorkspace as MockedFunction<typeof resolvePathInWorkspace>
	const mockedGetWorkspaceReadablePath = getWorkspaceReadablePath as MockedFunction<typeof getWorkspaceReadablePath>
	const mockedIsPathOutsideWorkspace = isPathOutsideWorkspace as MockedFunction<typeof isPathOutsideWorkspace>

	let task: any
	let askApproval: ReturnType<typeof vi.fn>
	let pushToolResult: ReturnType<typeof vi.fn>
	let handleError: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.clearAllMocks()

		mockedResolvePathInWorkspace.mockResolvedValue(absolutePath)
		mockedGetWorkspaceReadablePath.mockReturnValue("secondary/src")
		mockedIsPathOutsideWorkspace.mockReturnValue(false)
		mockedRegexSearchFiles.mockResolvedValue("match results")

		task = {
			cwd,
			consecutiveMistakeCount: 0,
			didToolFailInCurrentTurn: false,
			recordToolError: vi.fn(),
			rooIgnoreController: {},
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing param"),
			ask: vi.fn().mockResolvedValue(undefined),
		}

		askApproval = vi.fn().mockResolvedValue(true)
		pushToolResult = vi.fn()
		handleError = vi.fn()
	})

	it("searches from the resolved workspace path and surfaces the workspace-readable path", async () => {
		await searchFilesTool.execute({ path: relPath, regex: "TODO", file_pattern: "*.ts" }, task, {
			askApproval,
			pushToolResult,
			handleError,
		})

		expect(mockedResolvePathInWorkspace).toHaveBeenCalledWith(cwd, relPath)
		expect(mockedRegexSearchFiles).toHaveBeenCalledWith(cwd, absolutePath, "TODO", "*.ts", task.rooIgnoreController)
		expect(askApproval).toHaveBeenCalledWith("tool", expect.stringContaining('"path":"secondary/src"'))
		expect(pushToolResult).toHaveBeenCalledWith("match results")
	})

	it("uses the resolved workspace path in partial payloads", async () => {
		const block: ToolUse<"search_files"> = {
			type: "tool_use",
			name: "search_files",
			params: { path: relPath, regex: "TODO", file_pattern: "*.ts" },
			partial: true,
		}

		await searchFilesTool.handlePartial(task, block)

		expect(task.ask).toHaveBeenCalledWith("tool", expect.stringContaining('"path":"secondary/src"'), true)
		expect(task.ask).toHaveBeenCalledWith("tool", expect.stringContaining('"tool":"searchFiles"'), true)
	})
})
