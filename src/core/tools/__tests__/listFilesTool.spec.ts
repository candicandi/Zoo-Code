import type { MockedFunction } from "vitest"

import { listFiles } from "../../../services/glob/list-files"
import { getWorkspaceReadablePath, isPathOutsideWorkspace, resolvePathInWorkspace } from "../../../utils/pathUtils"
import type { ToolUse } from "../../../shared/tools"
import { listFilesTool } from "../ListFilesTool"

vi.mock("../../../services/glob/list-files", () => ({
	listFiles: vi.fn(),
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

vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		formatFilesList: vi.fn(),
	},
}))

describe("listFilesTool", () => {
	const cwd = "/workspace/primary"
	const relPath = "secondary/src"
	const absolutePath = "/workspace/secondary/src"

	const mockedListFiles = listFiles as MockedFunction<typeof listFiles>
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
		mockedListFiles.mockResolvedValue([["a.ts", "b.ts"], false])

		task = {
			cwd,
			consecutiveMistakeCount: 0,
			didToolFailInCurrentTurn: false,
			recordToolError: vi.fn(),
			rooIgnoreController: {},
			rooProtectedController: {},
			providerRef: {
				deref: vi.fn().mockReturnValue({
					getState: vi.fn().mockResolvedValue({ showRooIgnoredFiles: true }),
				}),
			},
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing path"),
			ask: vi.fn().mockResolvedValue(undefined),
		}

		askApproval = vi.fn().mockResolvedValue(true)
		pushToolResult = vi.fn()
		handleError = vi.fn()
	})

	it("lists files from the resolved workspace path and surfaces the workspace-readable path", async () => {
		const { formatResponse } = await import("../../prompts/responses")
		vi.mocked(formatResponse.formatFilesList).mockReturnValue("formatted file list")

		await listFilesTool.execute({ path: relPath, recursive: true }, task, {
			askApproval,
			pushToolResult,
			handleError,
		})

		expect(mockedResolvePathInWorkspace).toHaveBeenCalledWith(cwd, relPath)
		expect(mockedListFiles).toHaveBeenCalledWith(absolutePath, true, 200)
		expect(formatResponse.formatFilesList).toHaveBeenCalledWith(
			absolutePath,
			["a.ts", "b.ts"],
			false,
			task.rooIgnoreController,
			true,
			task.rooProtectedController,
		)
		expect(askApproval).toHaveBeenCalledWith("tool", expect.stringContaining('"path":"secondary/src"'))
		expect(pushToolResult).toHaveBeenCalledWith("formatted file list")
	})

	it("uses the resolved workspace path in partial payloads", async () => {
		const block: ToolUse<"list_files"> = {
			type: "tool_use",
			name: "list_files",
			params: { path: relPath, recursive: "true" },
			partial: true,
		}

		await listFilesTool.handlePartial(task, block)

		expect(task.ask).toHaveBeenCalledWith("tool", expect.stringContaining('"path":"secondary/src"'), true)
		expect(task.ask).toHaveBeenCalledWith("tool", expect.stringContaining('"tool":"listFilesRecursive"'), true)
	})
})
