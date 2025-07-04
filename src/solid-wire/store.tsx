import { isServer } from "solid-js/web"
import { ExtendableWireStore, Hooks, WireStore, WireStoreConfig, WireStoreContext, WireStoreDefinition, WireStoreProvider } from "./types"
import { ParentProps, useContext } from "solid-js"
import { WireStoreService } from "./service"


export function createWireStore<Definition extends WireStoreDefinition, Extension>(
  config: WireStoreConfig<Definition, Extension>
): {
  use(): ExtendableWireStore<Definition, Extension>,
  types: () => (keyof Definition)[]
  Provider: WireStoreProvider
} {

  let recordTypes = Object.keys(config.definition)

  if (isServer) {
    return { types: () => recordTypes } as any
  }

  let Provider: WireStoreProvider = (props: ParentProps<{
    namespace?: string,
    periodic?: true | number,
    hooks?: Hooks[]
  }>) => {
    return (
      <WireStoreService<Definition, Extension>
        namespace={props.namespace || ""}
        config={config}
        recordTypes={recordTypes}
        periodic={props.periodic}
        hooks={props.hooks}
      >
        {props.children}
      </WireStoreService>
    )
  }

  function use() {
    let context = useContext(WireStoreContext)
    if (!context) throw Error("WireStoreContext not registered")
    let api = {} as any
    for (let type of recordTypes) {
      api[type] = context.idb.public(type)
    }
    if (config.extend) {
      (api as WireStore<Definition>).utils = {
        useCache: () => {
          context!.idb.internal.enableCache()
          return context!.idb.internal.cache
        },
        createReactiveApi: <T extends Function>(
          trackingTypes: (keyof Definition & string)[],
          fn: T
        ): T => {
          let proxy = new Proxy(fn, {
            apply(target, thisArg, args) {
              for (let type of trackingTypes) {
                context!.idb.internal.tracker[type][0]()
              }
              return Reflect.apply(target, thisArg, args);
            },
          })
          return proxy as T
        },
        deleteDatabase: context.idb.internal.deleteDatabase
      }
      let extensions: any = config.extend(api)
      api = {}
      for (let type of recordTypes) {
        api[type] = context.idb.public(type)
        if (type in extensions) {
          Object.assign(api[type], extensions[type])
        }
      }
      let otherKeys = Object.keys(extensions).filter(key => !recordTypes.includes(key))
      for (let key of otherKeys) {
        api[key] = extensions[key]
      }
    }
    let store = api as ExtendableWireStore<Definition, Extension>
    store.sync = context.sync
    return store
  }

  return { Provider, use, types: () => recordTypes }
}

export function localOnly() {
  return (): any => {
    return { records: [] }
  }
}
