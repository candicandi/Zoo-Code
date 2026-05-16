import React from "react"
import { act, fireEvent } from "@testing-library/react"
import { render, screen } from "@/utils/test-utils"

import { TranslationProvider } from "@/i18n/__mocks__/TranslationContext"
import { EXTERNAL_LINKS } from "@/constants/externalLinks"
import { vscode } from "@/utils/vscode"

import { About } from "../About"

vi.mock("@/utils/vscode", () => ({
	vscode: { postMessage: vi.fn() },
}))

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeButton: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button onClick={onClick} {...props}>
			{children}
		</button>
	),
	VSCodeCheckbox: ({ children, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
		<label>
			<input type="checkbox" {...props} />
			{children}
		</label>
	),
	VSCodeLink: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}))

vi.mock("@/i18n/TranslationContext", () => {
	const actual = vi.importActual("@/i18n/TranslationContext")
	return {
		...actual,
		useAppTranslation: () => ({
			t: (key: string) => key,
		}),
	}
})

vi.mock("@roo/package", () => ({
	Package: {
		version: "1.0.0",
		sha: "abc12345",
	},
}))

describe("About", () => {
	const defaultProps = {
		telemetrySetting: "enabled" as const,
		setTelemetrySetting: vi.fn(),
	}

	const renderAbout = () =>
		render(
			<TranslationProvider>
				<About {...defaultProps} />
			</TranslationProvider>,
		)

	const dispatchImportProgress = async (rooHistoryImportProgress: {
		status: "starting" | "copying" | "finished" | "failed"
		copiedFileCount: number
		totalFileCount: number
		importedTaskCount: number
		totalTaskCount: number
	}) => {
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "rooHistoryImportProgress",
						rooHistoryImportProgress,
					},
				}),
			)
		})
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders the About section header", () => {
		renderAbout()
		expect(screen.getByText("settings:sections.about")).toBeInTheDocument()
	})

	it("displays version information", () => {
		renderAbout()
		expect(screen.getByText(/Version: 1\.0\.0/)).toBeInTheDocument()
	})

	it("renders the bug report section with label and link text", () => {
		renderAbout()
		expect(screen.getByText("settings:about.bugReport.label")).toBeInTheDocument()
		expect(screen.getByRole("link", { name: "settings:about.bugReport.link" })).toHaveAttribute(
			"href",
			EXTERNAL_LINKS.BUG_REPORT,
		)
	})

	it("renders the feature request section with label and link text", () => {
		renderAbout()
		expect(screen.getByText("settings:about.featureRequest.label")).toBeInTheDocument()
		expect(screen.getByRole("link", { name: "settings:about.featureRequest.link" })).toHaveAttribute(
			"href",
			EXTERNAL_LINKS.FEATURE_REQUEST,
		)
	})

	it("renders the security issue section with label and link text", () => {
		renderAbout()
		expect(screen.getByText("settings:about.securityIssue.label")).toBeInTheDocument()
		expect(screen.getByRole("link", { name: "settings:about.securityIssue.link" })).toHaveAttribute(
			"href",
			EXTERNAL_LINKS.SECURITY_POLICY,
		)
	})

	it("renders export, import, and reset buttons", () => {
		renderAbout()
		expect(screen.getByText("settings:footer.settings.export")).toBeInTheDocument()
		expect(screen.getByText("settings:footer.settings.import")).toBeInTheDocument()
		expect(screen.getByText("settings:footer.settings.reset")).toBeInTheDocument()
	})

	it('posts the Roo history import message when clicking "Import history from Roo Code"', () => {
		renderAbout()

		fireEvent.click(screen.getByRole("button", { name: "Import history from Roo Code" }))

		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "importRooHistory" })
	})

	it("shows Roo history import progress while the import is running", async () => {
		renderAbout()

		fireEvent.click(screen.getByRole("button", { name: "Import history from Roo Code" }))

		expect(screen.getByRole("button", { name: "Importing from Roo Code..." })).toBeDisabled()

		await dispatchImportProgress({
			status: "copying",
			copiedFileCount: 2,
			totalFileCount: 8,
			importedTaskCount: 1,
			totalTaskCount: 3,
		})

		expect(screen.getByText("Importing history")).toBeInTheDocument()
		expect(screen.getByText("25%")).toBeInTheDocument()
		expect(screen.getByText("2 of 8 files copied")).toBeInTheDocument()
		expect(screen.getByText("Imported 1 of 3 task histories.")).toBeInTheDocument()
	})

	it("keeps a failed Roo history state visible and re-enables retry after failure", async () => {
		renderAbout()

		fireEvent.click(screen.getByRole("button", { name: "Import history from Roo Code" }))

		await dispatchImportProgress({
			status: "failed",
			copiedFileCount: 1,
			totalFileCount: 4,
			importedTaskCount: 0,
			totalTaskCount: 2,
		})

		expect(screen.getByText("Import failed")).toBeInTheDocument()
		expect(screen.getByText("25%")).toBeInTheDocument()
		expect(screen.getByText("1 of 4 files copied before the import stopped.")).toBeInTheDocument()
		expect(screen.getByText("Start a new import attempt to try again.")).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Import history from Roo Code" })).toBeEnabled()
	})

	it("keeps a completed Roo history progress summary after the import finishes", async () => {
		renderAbout()

		await dispatchImportProgress({
			status: "finished",
			copiedFileCount: 4,
			totalFileCount: 4,
			importedTaskCount: 1,
			totalTaskCount: 1,
		})

		expect(screen.getByText("Import complete")).toBeInTheDocument()
		expect(screen.getByText("100%")).toBeInTheDocument()
		expect(screen.getByText("4 of 4 files copied")).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Import history from Roo Code" })).toBeEnabled()
	})

	it("clears stale failure UI when a new import starts and only shows the latest success state", async () => {
		renderAbout()

		fireEvent.click(screen.getByRole("button", { name: "Import history from Roo Code" }))

		await dispatchImportProgress({
			status: "failed",
			copiedFileCount: 1,
			totalFileCount: 4,
			importedTaskCount: 0,
			totalTaskCount: 2,
		})

		expect(screen.getByText("Import failed")).toBeInTheDocument()
		expect(screen.getByText("Start a new import attempt to try again.")).toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "Import history from Roo Code" }))

		expect(screen.getByRole("button", { name: "Importing from Roo Code..." })).toBeDisabled()
		expect(screen.getByText("Importing history")).toBeInTheDocument()
		expect(screen.queryByText("Import failed")).not.toBeInTheDocument()
		expect(screen.queryByText("Start a new import attempt to try again.")).not.toBeInTheDocument()

		await dispatchImportProgress({
			status: "finished",
			copiedFileCount: 3,
			totalFileCount: 3,
			importedTaskCount: 2,
			totalTaskCount: 2,
		})

		expect(screen.getByText("Import complete")).toBeInTheDocument()
		expect(screen.getByText("100%")).toBeInTheDocument()
		expect(screen.getByText("3 of 3 files copied")).toBeInTheDocument()
		expect(screen.getByText("Imported 2 of 2 task histories.")).toBeInTheDocument()
		expect(screen.queryByText("Import failed")).not.toBeInTheDocument()
		expect(screen.queryByText("Start a new import attempt to try again.")).not.toBeInTheDocument()
	})
})
