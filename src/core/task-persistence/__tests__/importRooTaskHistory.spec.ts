import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"

import { importRooTaskHistory, resolveRooHistoryImportPaths } from "../importRooTaskHistory"

vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(),
	},
}))

describe("importRooTaskHistory", () => {
	let tempRoot: string

	beforeEach(async () => {
		tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "roo-history-import-"))
		vi.clearAllMocks()
	})

	afterEach(async () => {
		await fs.rm(tempRoot, { recursive: true, force: true })
	})

	it("resolves Roo and Zoo storage roots from extension domains and configured custom paths", async () => {
		const zooGlobalStoragePath = path.join(tempRoot, "globalStorage", "zoocodeorganization.zoo-code")
		const rooCustomStoragePath = path.join(tempRoot, "roo-custom")
		const zooCustomStoragePath = path.join(tempRoot, "zoo-custom")
		const getConfigurationMock = vi.mocked(vscode.workspace.getConfiguration)

		getConfigurationMock.mockImplementation((section?: string) => {
			const resolvedSection = section ?? ""
			return {
				get: vi
					.fn()
					.mockReturnValue(
						resolvedSection === "roo-cline"
							? rooCustomStoragePath
							: resolvedSection === "zoo-code"
								? zooCustomStoragePath
								: "",
					),
			} as any
		})

		const result = await resolveRooHistoryImportPaths(zooGlobalStoragePath)

		expect(result.rooExtensionDomain).toBe("RooVeterinaryInc.roo-cline")
		expect(result.zooExtensionDomain).toBe("ZooCodeOrganization.zoo-code")
		expect(result.rooStorageRoots).toEqual([
			path.join(tempRoot, "globalStorage", "rooveterinaryinc.roo-cline"),
			rooCustomStoragePath,
		])
		expect(result.zooStorageRoot).toBe(zooCustomStoragePath)
	})

	it("copies Roo task directories into the active Zoo storage root", async () => {
		const zooGlobalStoragePath = path.join(tempRoot, "globalStorage", "zoocodeorganization.zoo-code")
		const rooDefaultStorageRoot = path.join(tempRoot, "globalStorage", "rooveterinaryinc.roo-cline")
		const rooCustomStorageRoot = path.join(tempRoot, "roo-custom")
		const zooCustomStorageRoot = path.join(tempRoot, "zoo-custom")
		const getConfigurationMock = vi.mocked(vscode.workspace.getConfiguration)

		getConfigurationMock.mockImplementation((section?: string) => {
			const resolvedSection = section ?? ""
			return {
				get: vi
					.fn()
					.mockReturnValue(
						resolvedSection === "roo-cline"
							? rooCustomStorageRoot
							: resolvedSection === "zoo-code"
								? zooCustomStorageRoot
								: "",
					),
			} as any
		})

		await fs.mkdir(path.join(rooDefaultStorageRoot, "tasks", "task-default"), { recursive: true })
		await fs.writeFile(
			path.join(rooDefaultStorageRoot, "tasks", "task-default", "history_item.json"),
			JSON.stringify({ id: "task-default" }),
		)
		await fs.writeFile(path.join(rooDefaultStorageRoot, "tasks", "task-default", "ui_messages.json"), "default")
		await fs.writeFile(path.join(rooDefaultStorageRoot, "tasks", "_index.json"), "{}")

		await fs.mkdir(path.join(rooCustomStorageRoot, "tasks", "task-custom"), { recursive: true })
		await fs.writeFile(
			path.join(rooCustomStorageRoot, "tasks", "task-custom", "history_item.json"),
			JSON.stringify({ id: "task-custom" }),
		)
		await fs.writeFile(
			path.join(rooCustomStorageRoot, "tasks", "task-custom", "api_conversation_history.json"),
			"custom",
		)

		const result = await importRooTaskHistory(zooGlobalStoragePath)

		expect(result.importedTaskCount).toBe(2)
		expect(result.importedFileCount).toBe(4)
		expect(
			await fs.readFile(path.join(zooCustomStorageRoot, "tasks", "task-default", "ui_messages.json"), "utf8"),
		).toBe("default")
		expect(
			await fs.readFile(
				path.join(zooCustomStorageRoot, "tasks", "task-custom", "api_conversation_history.json"),
				"utf8",
			),
		).toBe("custom")
		await expect(fs.access(path.join(zooCustomStorageRoot, "tasks", "_index.json"))).rejects.toMatchObject({
			code: "ENOENT",
		})
	})
})
