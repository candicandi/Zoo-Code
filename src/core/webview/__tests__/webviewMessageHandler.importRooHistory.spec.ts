import { beforeEach, describe, expect, it, vi } from "vitest"

import { webviewMessageHandler } from "../webviewMessageHandler"
import type { ClineProvider } from "../ClineProvider"

vi.mock("vscode", () => ({
	window: {
		showErrorMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
	},
	workspace: {
		workspaceFolders: undefined,
		getConfiguration: vi.fn(() => ({
			get: vi.fn(),
			update: vi.fn(),
		})),
	},
	env: {
		clipboard: { writeText: vi.fn() },
		openExternal: vi.fn(),
	},
	commands: {
		executeCommand: vi.fn(),
	},
	Uri: {
		parse: vi.fn((s: string) => ({ toString: () => s })),
		file: vi.fn((p: string) => ({ fsPath: p })),
	},
	ConfigurationTarget: {
		Global: 1,
		Workspace: 2,
		WorkspaceFolder: 3,
	},
}))

const importRooTaskHistoryMock = vi.fn()
vi.mock("../../task-persistence/importRooTaskHistory", () => ({
	importRooTaskHistory: (...args: any[]) => importRooTaskHistoryMock(...args),
}))

import * as vscode from "vscode"

describe("webviewMessageHandler - importRooHistory", () => {
	let mockProvider: ClineProvider & {
		contextProxy: any
		taskHistoryStore: {
			invalidateAll: ReturnType<typeof vi.fn>
			reconcile: ReturnType<typeof vi.fn>
			flushIndex: ReturnType<typeof vi.fn>
		}
		postStateToWebview: ReturnType<typeof vi.fn>
	}

	beforeEach(() => {
		vi.clearAllMocks()

		mockProvider = {
			contextProxy: {
				getValue: vi.fn(),
				setValue: vi.fn(),
				globalStorageUri: { fsPath: "/mock/storage" },
			},
			taskHistoryStore: {
				invalidateAll: vi.fn(),
				reconcile: vi.fn().mockResolvedValue(undefined),
				flushIndex: vi.fn().mockResolvedValue(undefined),
			},
			postStateToWebview: vi.fn().mockResolvedValue(undefined),
		} as any
	})

	it("refreshes task history and shows a success message after importing Roo history", async () => {
		importRooTaskHistoryMock.mockResolvedValue({
			rooExtensionDomain: "RooVeterinaryInc.roo-cline",
			zooExtensionDomain: "ZooCodeOrganization.zoo-code",
			rooStorageRoots: ["/mock/roo-storage"],
			zooStorageRoot: "/mock/storage",
			importedTaskCount: 2,
			importedFileCount: 4,
		})

		await webviewMessageHandler(mockProvider as any, { type: "importRooHistory" } as any)

		expect(importRooTaskHistoryMock).toHaveBeenCalledWith("/mock/storage")
		expect(mockProvider.taskHistoryStore.invalidateAll).toHaveBeenCalledTimes(1)
		expect(mockProvider.taskHistoryStore.reconcile).toHaveBeenCalledTimes(1)
		expect(mockProvider.taskHistoryStore.flushIndex).toHaveBeenCalledTimes(1)
		expect(mockProvider.postStateToWebview).toHaveBeenCalledTimes(1)
		expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
			"Imported 2 Roo Code task histories into Zoo Code.",
		)
		expect(vscode.window.showWarningMessage).not.toHaveBeenCalled()
	})

	it("shows a warning without refreshing task history when no Roo history is available", async () => {
		importRooTaskHistoryMock.mockResolvedValue({
			rooExtensionDomain: "RooVeterinaryInc.roo-cline",
			zooExtensionDomain: "ZooCodeOrganization.zoo-code",
			rooStorageRoots: ["/mock/roo-storage"],
			zooStorageRoot: "/mock/storage",
			importedTaskCount: 0,
			importedFileCount: 0,
		})

		await webviewMessageHandler(mockProvider as any, { type: "importRooHistory" } as any)

		expect(importRooTaskHistoryMock).toHaveBeenCalledWith("/mock/storage")
		expect(mockProvider.taskHistoryStore.invalidateAll).not.toHaveBeenCalled()
		expect(mockProvider.taskHistoryStore.reconcile).not.toHaveBeenCalled()
		expect(mockProvider.taskHistoryStore.flushIndex).not.toHaveBeenCalled()
		expect(mockProvider.postStateToWebview).not.toHaveBeenCalled()
		expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
			"No Roo Code task history was found to import from RooVeterinaryInc.roo-cline.",
		)
		expect(vscode.window.showInformationMessage).not.toHaveBeenCalled()
	})
})
