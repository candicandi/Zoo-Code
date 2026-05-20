import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import {
	type ProviderSettings,
	type OrganizationAllowList,
	type RouterModels,
	zooGatewayDefaultModelId,
} from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"

import { ModelPicker } from "../ModelPicker"

type ZooGatewayProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	routerModels?: RouterModels
	organizationAllowList: OrganizationAllowList
	modelValidationError?: string
	simplifySettings?: boolean
}

export const ZooGateway = ({
	apiConfiguration,
	setApiConfigurationField,
	routerModels,
	organizationAllowList,
	modelValidationError,
	simplifySettings,
}: ZooGatewayProps) => {
	const { t } = useAppTranslation()

	return (
		<>
			{/* Zoo Gateway auth is managed exclusively through the "Sign in with Zoo Code"
			    OAuth flow — the token is set automatically and must not be editable by users.
			    Showing the field as read-only lets users confirm they are signed in. */}
			<VSCodeTextField
				value={apiConfiguration?.zooSessionToken ? "••••••••••••••••" : ""}
				type="text"
				readOnly
				placeholder={t("settings:placeholders.sessionToken")}
				className="w-full">
				<label className="block font-medium mb-1">Zoo Session Token</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{apiConfiguration?.zooSessionToken
					? "Signed in via Zoo Code"
					: "Sign in via the Zoo Code button to authenticate"}
			</div>
			<ModelPicker
				apiConfiguration={apiConfiguration}
				setApiConfigurationField={setApiConfigurationField}
				defaultModelId={zooGatewayDefaultModelId}
				models={routerModels?.["zoo-gateway"] ?? {}}
				modelIdKey="zooGatewayModelId"
				serviceName="Zoo Gateway"
				serviceUrl="https://www.zoocode.dev/dashboard"
				organizationAllowList={organizationAllowList}
				errorMessage={modelValidationError}
				simplifySettings={simplifySettings}
			/>
		</>
	)
}
