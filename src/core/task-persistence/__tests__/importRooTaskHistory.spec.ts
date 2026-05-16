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

	const mockStorageConfiguration = ({
		roo = "",
		zoo = "",
		throwOnRoo = false,
	}: {
		roo?: string
		zoo?: string
		throwOnRoo?: boolean
	} = {}) => {
		const getConfigurationMock = vi.mocked(vscode.workspace.getConfiguration)

		getConfigurationMock.mockImplementation((section?: string) => {
			const resolvedSection = section ?? ""
			return {
				get: vi.fn().mockImplementation(() => {
					if (resolvedSection === "roo-cline" && throwOnRoo) {
						throw new Error("roo config unavailable")
					}

					if (resolvedSection === "roo-cline") {
						return roo
					}

					if (resolvedSection === "zoo-code") {
						return zoo
					}

					return ""
				}),
			} as any
		})
	}

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

		mockStorageConfiguration({
			roo: rooCustomStoragePath,
			zoo: zooCustomStoragePath,
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

	it("falls back to the default Roo storage root when reading Roo custom storage fails", async () => {
		const zooGlobalStoragePath = path.join(tempRoot, "globalStorage", "zoocodeorganization.zoo-code")

		mockStorageConfiguration({ throwOnRoo: true })

		const result = await resolveRooHistoryImportPaths(zooGlobalStoragePath)

		expect(result.rooStorageRoots).toEqual([path.join(tempRoot, "globalStorage", "rooveterinaryinc.roo-cline")])
		expect(result.zooStorageRoot).toBe(zooGlobalStoragePath)
	})

	it("dedupes Roo storage roots when the custom path matches the default Roo storage root", async () => {
		const zooGlobalStoragePath = path.join(tempRoot, "globalStorage", "zoocodeorganization.zoo-code")
		const rooDefaultStorageRoot = path.join(tempRoot, "globalStorage", "rooveterinaryinc.roo-cline")

		mockStorageConfiguration({ roo: rooDefaultStorageRoot })

		const result = await resolveRooHistoryImportPaths(zooGlobalStoragePath)

		expect(result.rooStorageRoots).toEqual([rooDefaultStorageRoot])
	})

	it("copies Roo task directories into the active Zoo storage root", async () => {
		const zooGlobalStoragePath = path.join(tempRoot, "globalStorage", "zoocodeorganization.zoo-code")
		const rooDefaultStorageRoot = path.join(tempRoot, "globalStorage", "rooveterinaryinc.roo-cline")
		const rooCustomStorageRoot = path.join(tempRoot, "roo-custom")
		const zooCustomStorageRoot = path.join(tempRoot, "zoo-custom")

		mockStorageConfiguration({
			roo: rooCustomStorageRoot,
			zoo: zooCustomStorageRoot,
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

	it("skips Roo roots that resolve to the Zoo storage root and ignores hidden task entries", async () => {
		const zooGlobalStoragePath = path.join(tempRoot, "globalStorage", "zoocodeorganization.zoo-code")
		const rooDefaultStorageRoot = path.join(tempRoot, "globalStorage", "rooveterinaryinc.roo-cline")
		const zooCustomStorageRoot = path.join(tempRoot, "shared-storage")

		mockStorageConfiguration({
			roo: zooCustomStorageRoot,
			zoo: zooCustomStorageRoot,
		})

		await fs.mkdir(path.join(rooDefaultStorageRoot, "tasks", "task-visible", "nested"), { recursive: true })
		await fs.mkdir(path.join(rooDefaultStorageRoot, "tasks", ".task-hidden"), { recursive: true })
		await fs.mkdir(path.join(rooDefaultStorageRoot, "tasks", "_task-hidden"), { recursive: true })
		await fs.writeFile(path.join(rooDefaultStorageRoot, "tasks", "task-visible", "history_item.json"), "visible")
		await fs.writeFile(
			path.join(rooDefaultStorageRoot, "tasks", "task-visible", "nested", "ui_messages.json"),
			"nested",
		)
		await fs.writeFile(path.join(rooDefaultStorageRoot, "tasks", "loose.json"), "loose")
		await fs.writeFile(path.join(rooDefaultStorageRoot, "tasks", ".task-hidden", "history_item.json"), "hidden")
		await fs.writeFile(path.join(rooDefaultStorageRoot, "tasks", "_task-hidden", "history_item.json"), "hidden")

		const result = await importRooTaskHistory(zooGlobalStoragePath)

		expect(result.rooStorageRoots).toEqual([rooDefaultStorageRoot])
		expect(result.importedTaskCount).toBe(1)
		expect(result.importedFileCount).toBe(2)
		expect(
			await fs.readFile(
				path.join(zooCustomStorageRoot, "tasks", "task-visible", "nested", "ui_messages.json"),
				"utf8",
			),
		).toBe("nested")
		await expect(fs.access(path.join(zooCustomStorageRoot, "tasks", ".task-hidden"))).rejects.toMatchObject({
			code: "ENOENT",
		})
		await expect(fs.access(path.join(zooCustomStorageRoot, "tasks", "_task-hidden"))).rejects.toMatchObject({
			code: "ENOENT",
		})
	})

	it("ignores missing Roo task roots while still importing from available roots", async () => {
		const zooGlobalStoragePath = path.join(tempRoot, "globalStorage", "zoocodeorganization.zoo-code")
		const rooDefaultStorageRoot = path.join(tempRoot, "globalStorage", "rooveterinaryinc.roo-cline")
		const rooMissingCustomStorageRoot = path.join(tempRoot, "roo-missing")

		mockStorageConfiguration({ roo: rooMissingCustomStorageRoot })

		await fs.mkdir(path.join(rooDefaultStorageRoot, "tasks", "task-default"), { recursive: true })
		await fs.writeFile(path.join(rooDefaultStorageRoot, "tasks", "task-default", "history_item.json"), "default")

		const result = await importRooTaskHistory(zooGlobalStoragePath)

		expect(result.rooStorageRoots).toEqual([rooDefaultStorageRoot, rooMissingCustomStorageRoot])
		expect(result.importedTaskCount).toBe(1)
		expect(result.importedFileCount).toBe(1)
		expect(
			await fs.readFile(path.join(zooGlobalStoragePath, "tasks", "task-default", "history_item.json"), "utf8"),
		).toBe("default")
	})

	it("rethrows unexpected task-root errors while importing Roo history", async () => {
		const zooGlobalStoragePath = path.join(tempRoot, "globalStorage", "zoocodeorganization.zoo-code")
		const rooDefaultStorageRoot = path.join(tempRoot, "globalStorage", "rooveterinaryinc.roo-cline")

		mockStorageConfiguration()

		await fs.mkdir(rooDefaultStorageRoot, { recursive: true })
		await fs.writeFile(path.join(rooDefaultStorageRoot, "tasks"), "not a directory")

		await expect(importRooTaskHistory(zooGlobalStoragePath)).rejects.toMatchObject({
			code: "ENOTDIR",
		})
	})
})
