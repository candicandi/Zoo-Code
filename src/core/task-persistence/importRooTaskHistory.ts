import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"

import { Package } from "../../shared/package"
import { getStorageBasePath } from "../../utils/storage"

const ROO_EXTENSION_DOMAIN = "RooVeterinaryInc.roo-cline"
const ROO_STORAGE_DIRECTORY = ROO_EXTENSION_DOMAIN.toLowerCase()
const ROO_CONFIGURATION_SECTION = "roo-cline"

export interface RooHistoryImportPaths {
	rooExtensionDomain: string
	zooExtensionDomain: string
	rooStorageRoots: string[]
	zooStorageRoot: string
}

export interface RooHistoryImportResult extends RooHistoryImportPaths {
	importedTaskCount: number
	importedFileCount: number
}

const toComparablePath = (candidatePath: string) => {
	const resolvedPath = path.resolve(candidatePath)
	return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath
}

const dedupePaths = (paths: string[]) => {
	const seen = new Set<string>()
	return paths.filter((candidatePath) => {
		const comparablePath = toComparablePath(candidatePath)
		if (seen.has(comparablePath)) {
			return false
		}
		seen.add(comparablePath)
		return true
	})
}

const getConfiguredCustomStoragePath = (configurationSection: string) => {
	try {
		const configuredPath = vscode.workspace
			.getConfiguration(configurationSection)
			.get<string>("customStoragePath", "")
			.trim()
		return configuredPath || undefined
	} catch {
		return undefined
	}
}

const countFiles = async (directoryPath: string): Promise<number> => {
	const entries = await fs.readdir(directoryPath, { withFileTypes: true })
	let fileCount = 0

	for (const entry of entries) {
		const entryPath = path.join(directoryPath, entry.name)
		if (entry.isDirectory()) {
			fileCount += await countFiles(entryPath)
		} else if (entry.isFile()) {
			fileCount += 1
		}
	}

	return fileCount
}

export const resolveRooHistoryImportPaths = async (globalStoragePath: string): Promise<RooHistoryImportPaths> => {
	const zooExtensionDomain = `${Package.publisher}.${Package.name}`
	const zooStorageRoot = await getStorageBasePath(globalStoragePath)
	const rooDefaultStorageRoot = path.join(path.dirname(globalStoragePath), ROO_STORAGE_DIRECTORY)
	const rooCustomStorageRoot = getConfiguredCustomStoragePath(ROO_CONFIGURATION_SECTION)

	return {
		rooExtensionDomain: ROO_EXTENSION_DOMAIN,
		zooExtensionDomain,
		rooStorageRoots: dedupePaths([rooDefaultStorageRoot, ...(rooCustomStorageRoot ? [rooCustomStorageRoot] : [])]),
		zooStorageRoot,
	}
}

export const importRooTaskHistory = async (globalStoragePath: string): Promise<RooHistoryImportResult> => {
	const paths = await resolveRooHistoryImportPaths(globalStoragePath)
	const destinationComparablePath = toComparablePath(paths.zooStorageRoot)
	const sourceRoots = paths.rooStorageRoots.filter(
		(sourceRoot) => toComparablePath(sourceRoot) !== destinationComparablePath,
	)
	const destinationTasksRoot = path.join(paths.zooStorageRoot, "tasks")
	const importedTaskIds = new Set<string>()
	let importedFileCount = 0

	await fs.mkdir(destinationTasksRoot, { recursive: true })

	for (const sourceRoot of sourceRoots) {
		const sourceTasksRoot = path.join(sourceRoot, "tasks")
		let entries: fs.Dirent[]

		try {
			entries = await fs.readdir(sourceTasksRoot, { withFileTypes: true })
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException
			if (nodeError.code === "ENOENT") {
				continue
			}
			throw error
		}

		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name.startsWith("_")) {
				continue
			}

			const sourceTaskDirectory = path.join(sourceTasksRoot, entry.name)
			const destinationTaskDirectory = path.join(destinationTasksRoot, entry.name)

			importedTaskIds.add(entry.name)
			importedFileCount += await countFiles(sourceTaskDirectory)

			await fs.cp(sourceTaskDirectory, destinationTaskDirectory, {
				recursive: true,
				force: true,
			})
		}
	}

	return {
		...paths,
		rooStorageRoots: sourceRoots,
		importedTaskCount: importedTaskIds.size,
		importedFileCount,
	}
}
