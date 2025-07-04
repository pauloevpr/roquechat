
import { createContext, ParentProps, JSX, Accessor } from "solid-js";
import { Idb } from "./idb";

// TODO: extract into a proper library

export type IdbRecord = {
	id: string
	type: string
	deleted?: boolean
	unsynced?: "true"
	data: any
}

export type UnsyncedRecordState = "updated" | "deleted"
export const UnsyncedRecordStates = ["updated", "deleted"]

export type UnsyncedRecord<Definition extends Record<string, any>> = {
	id: string
	state: UnsyncedRecordState
	type: keyof Definition
	data: any
}

export type SyncedRecord = {
	id: string
	state: "updated" | "deleted"
	type: string
	data: any
}

export const WireStoreContext = createContext<WireStoreContextValue>()

export type WireStoreContextValue = {
	idb: Idb
	sync: {
		(fromResponse?: SyncResponse): Promise<void>
		cursor(): string | undefined
	}
}

export type WireStoreDefinition = Record<string, any>

export type WireStoreAPI<Definition extends WireStoreDefinition, Type extends keyof Definition> = {
	set(id: string, data: Definition[Type]): Promise<void>
	delete(...ids: string[]): Promise<void>
	get(id: string): Promise<Definition[Type] | undefined>
	all(): Promise<Definition[Type][]>
}

export type SyncResponse = { records: SyncedRecord[], syncCursor?: string }

export type WireStoreConfig<Definition extends WireStoreDefinition, Extension> = {
	name: string,
	definition: Definition,
	extend?: (store: WireStore<Definition>) => Extension
	sync: (request: { records: UnsyncedRecord<Definition>[], namespace: string, syncCursor?: string }) => Promise<SyncResponse>,
}

export type WireStore<Definition extends WireStoreDefinition> = {
	[Type in keyof Definition & string]: WireStoreAPI<Definition, Type>
} & {
	utils: {
		useCache: () => WireStoreCache<WireStoreDefinition>,
		createReactiveApi: <T extends Function>(
			trackingTypes: (keyof Definition & string)[],
			fn: T
		) => T,
		deleteDatabase: () => Promise<void>
	}
}

export type WireStoreCache<Definition extends WireStoreDefinition> = {
	[Type in keyof Definition & string]: Accessor<Array<Definition[Type]>>
}

type Override<A, B> = Omit<A, keyof B> & B;

export type ExtendableWireStore<Definition extends WireStoreDefinition, Extension> = {
	[Type in keyof Definition & string]: Extension extends WireStoreDefinition ? Override<WireStoreAPI<Definition, Type>, Extension[Type]> : WireStoreAPI<Definition, Type>
} & Extension & Pick<WireStoreContextValue, "sync">

export type WireStoreProvider = (props: ParentProps<{
	namespace?: string,
	periodic?: true | number,
	hooks?: Hooks[]
}>) => JSX.Element

export type Hooks = {
	beforeSave?: (type: string, data: any) => Promise<void>
	beforeRead?: (type: string, data: any) => Promise<void>
}

