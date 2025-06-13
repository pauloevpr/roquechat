import { createEffect, createMemo, onCleanup, onMount, ParentProps } from "solid-js"
import { Hooks, IdbRecord, SyncResponse, UnsyncedRecord, WireStoreConfig, WireStoreContext, WireStoreContextValue, WireStoreDefinition } from "./types"
import { Idb, useIdb } from "./idb"

export function WireStoreService<Definition extends WireStoreDefinition, Extention>(
	props: ParentProps<{
		namespace: string,
		config: WireStoreConfig<Definition, Extention>,
		recordTypes: (keyof Definition)[],
		periodic?: true | number,
		hooks?: Hooks[]
	}>
) {
	let options = createMemo(() => props.config.options || defaultOptions)
	let cursorKey = `wire-store:${props.config.name}:${props.namespace}:sync-cursor`
	let context = createMemo(() => {
		let name = `wire-store:${props.config.name}:${props.namespace}`
		let sync: any = triggerSync
		sync.cursor = () => {
			return localStorage.getItem(cursorKey);
		}
		let context: WireStoreContextValue = {
			idb: useIdb(name, props.recordTypes, props.hooks),
			sync
		}
		return context
	})
	let syncing = false
	let unsubscribe: Function | undefined = undefined
	let periodicSyncInterval: any

	createEffect((prev?: Idb) => {
		if (prev) {
			prev?.internal.close()
		}
		let idb = context().idb
		unsubscribe?.()
		unsubscribe = idb.internal.listenToUnsyncedChanges(() => {
			triggerSync()
		})
		startPeriodicSync()
		return idb
	})

	function startPeriodicSync() {
		clearInterval(periodicSyncInterval)
		if (props.periodic === undefined || props.periodic === null) return
		if (props.periodic === true) {
			periodicSyncInterval = setInterval(triggerSync, 60000)
		} else if (
			typeof props.periodic === "number" &&
			!isNaN(props.periodic) &&
			props.periodic > 0
		) {
			periodicSyncInterval = setInterval(triggerSync, props.periodic)
		} else {
			console.warn(`unable to start periodic syncing: invalid interval: ${props.periodic}`)
			return
		}
	}

	onMount(() => {
		if (options().syncOnStartup) {
			triggerSync()
		}
	})

	onCleanup(() => {
		context().idb.internal.close()
		unsubscribe?.()
		clearInterval(periodicSyncInterval)
	})

	async function triggerSync(fromResponse?: SyncResponse) {
		if (fromResponse) {
			try {
				await commitSyncResult(fromResponse)
				return
			} catch (e) {
				console.error(`SolidWire: error committing sync result for store ${props.config.name} in namespace ${props.namespace}`, e)
			}
		}

		if (syncing) return

		syncing = true
		let idb = context().idb.internal
		let namespace = props.namespace

		try {
			let unsynced = (await idb.getUnsynced()).map(item => {
				let record: UnsyncedRecord<Definition> = {
					id: item.id,
					type: item.type,
					state: item.deleted === true ? "deleted" : "updated",
					data: { ...item.data }
				}
				return record
			})

			let syncCursor = localStorage.getItem(cursorKey) || undefined
			let result = await props.config.sync(
				{ records: unsynced, namespace, syncCursor }
			)

			await commitSyncResult(result)

		} catch (e) {
			console.error(`SolidWire: error syncing store ${props.config.name} in namespace ${props.namespace}`, e)
		} finally {
			syncing = false
		}
	}

	async function commitSyncResult(result: SyncResponse) {
		let idb = context().idb.internal
		let { records, syncCursor: updatedSyncCursor } = result
		let updated = records
			.filter(record => record.state === "updated")
			.map<IdbRecord>(record => ({
				id: record.id,
				type: record.type,
				data: record.data,
			}))
		await idb.put(...updated)

		let deleted = records.filter(record => record.state === "deleted").map(record => record.id)
		await idb.purge(deleted)

		if (updatedSyncCursor !== undefined && updatedSyncCursor !== null) {
			localStorage.setItem(cursorKey, updatedSyncCursor)
		} else {
			localStorage.removeItem(cursorKey)
		}

	}

	return (
		<WireStoreContext.Provider value={context()} >
			{props.children}
		</WireStoreContext.Provider>
	)
}


const defaultOptions = {
	syncOnStartup: true,
}